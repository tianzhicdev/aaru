import Foundation
import OSLog

@MainActor
final class AppModel: ObservableObject {
    private let logger = Logger(subsystem: "com.tianzhichen.aaru", category: "app")
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Soul Mirror state
    @Published var visibleSoulFile: VisibleSoulFile = .empty
    @Published var legacySoulFile: LegacySoulFile = .empty
    @Published var canStartSoulSession = false
    @Published var nextSessionNumber = 1
    @Published var activeSoulSession: SoulSessionInfo?
    @Published var soulMessages: [SoulMessage] = []
    @Published var soulStreamingText = ""
    @Published var isSoulStreaming = false
    @Published var soulFileJustUpdated = false

    let backend: BackendClient
    let deviceID: String
    private(set) var userID: UUID?

    init(
        backend: BackendClient = BackendClient(),
        deviceID: String = DeviceIdentity.current(),
        autoBootstrap: Bool = true
    ) {
        self.backend = backend
        self.deviceID = deviceID
        self.backend.sessionToken = SessionIdentity.current()

        if autoBootstrap {
            Task {
                await bootstrap()
            }
        }
    }

    func bootstrap() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        logger.info("Bootstrapping device \(self.deviceID, privacy: .public)")

        do {
            let payload = try await backend.bootstrap(deviceID: deviceID)
            backend.sessionToken = payload.session.token
            SessionIdentity.save(payload.session.token)
            userID = payload.userID
            Task { await bootstrapSoul() }
            logger.info("Bootstrap complete")
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Bootstrap failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Soul Mirror

    // Backward compat: expose legacy soulFile for any remaining references
    var soulFile: LegacySoulFile {
        get { legacySoulFile }
        set { legacySoulFile = newValue }
    }

    func bootstrapSoul() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response = try await backend.bootstrapSoul(deviceID: deviceID)
            if let token = response.token {
                backend.sessionToken = token
                SessionIdentity.save(token)
            }
            legacySoulFile = response.soulFile ?? .empty
            visibleSoulFile = response.visibleSoulFile ?? .empty
            activeSoulSession = response.activeSession
            canStartSoulSession = response.canStartSession
            nextSessionNumber = response.nextSessionNumber

            if let payloads = response.messages, !payloads.isEmpty {
                soulMessages = payloads.map { msg in
                    SoulMessage(id: UUID(), role: msg.role, content: msg.content)
                }
            }

            cacheVisibleSoulFile(visibleSoulFile)

            logger.info("Soul bootstrap complete: session \(self.nextSessionNumber), canStart=\(self.canStartSoulSession)")
        } catch {
            if let cached = loadCachedVisibleSoulFile() {
                visibleSoulFile = cached
                logger.info("Loaded cached visible soul file")
            }
            errorMessage = error.localizedDescription
            logger.error("Soul bootstrap failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func refreshSoulFile() async {
        do {
            let response = try await backend.getSoulFile()
            visibleSoulFile = response.visibleSoulFile
            legacySoulFile = response.soulFile
            canStartSoulSession = true
            cacheVisibleSoulFile(visibleSoulFile)
        } catch {
            logger.error("Soul file refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func beginSoulSession() async {
        guard !isSoulStreaming else { return }
        logger.info("Beginning soul session")
        isSoulStreaming = true
        soulStreamingText = ""

        do {
            try await performSoulConverse(message: "[begin]")
        } catch let error as BackendError where error.isAuthFailure {
            await bootstrapSoul()
            do {
                try await performSoulConverse(message: "[begin]")
            } catch {
                appendErrorMessage(for: error)
            }
        } catch is URLError {
            appendErrorMessage(userFacing: "No internet connection. Check your network and try again.")
        } catch {
            appendErrorMessage(for: error)
        }

        isSoulStreaming = false
        soulStreamingText = ""
    }

    func sendSoulMessage(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSoulStreaming else { return }

        let userMessage = SoulMessage(id: UUID(), role: "user", content: trimmed)
        soulMessages.append(userMessage)
        isSoulStreaming = true
        soulStreamingText = ""

        do {
            try await performSoulConverse(message: trimmed)
        } catch let error as BackendError where error.isAuthFailure {
            logger.info("Auth failure during soul converse, refreshing session and retrying")
            await bootstrapSoul()
            do {
                try await performSoulConverse(message: trimmed)
            } catch {
                appendErrorMessage(for: error)
            }
        } catch is URLError {
            appendErrorMessage(userFacing: "No internet connection. Check your network and try again.")
        } catch is CancellationError {
            // Silently handle cancellation
        } catch {
            appendErrorMessage(for: error)
        }

        isSoulStreaming = false
        soulStreamingText = ""
    }

    func retrySoulMessage() async {
        guard let lastUserMessage = soulMessages.last(where: { $0.role == "user" }) else { return }
        while let last = soulMessages.last, last.isError || last.role == "system" {
            soulMessages.removeLast()
        }
        if soulMessages.last?.role == "user" {
            soulMessages.removeLast()
        }
        await sendSoulMessage(lastUserMessage.content)
    }

    private func performSoulConverse(message: String) async throws {
        try await backend.soulConverseStream(
            message: message,
            sessionID: activeSoulSession?.id,
            onToken: { [weak self] token in
                Task { @MainActor in
                    self?.soulStreamingText += token
                }
            },
            onVisibleSoulFileUpdated: { [weak self] updated in
                Task { @MainActor in
                    self?.visibleSoulFile = updated
                    self?.cacheVisibleSoulFile(updated)
                    self?.soulFileJustUpdated = true
                    self?.logger.info("Visible soul file updated during conversation")
                }
            },
            onLegacySoulFileUpdated: { [weak self] updated in
                Task { @MainActor in
                    self?.legacySoulFile = updated
                    self?.logger.info("Legacy soul file updated during conversation")
                }
            },
            onError: { [weak self] message in
                Task { @MainActor in
                    self?.logger.error("SSE error: \(message, privacy: .public)")
                }
            }
        )

        if !soulStreamingText.isEmpty {
            let assistantMessage = SoulMessage(
                id: UUID(),
                role: "assistant",
                content: soulStreamingText
            )
            soulMessages.append(assistantMessage)
        }
    }

    private func appendErrorMessage(for error: Error) {
        let message: String
        if let backendError = error as? BackendError {
            message = backendError.errorDescription ?? "Something went wrong. Try again."
        } else {
            message = "Something went wrong. Try again."
        }
        appendErrorMessage(userFacing: message)
    }

    private func appendErrorMessage(userFacing message: String) {
        let errorMsg = SoulMessage(id: UUID(), role: "system", content: message, isError: true)
        soulMessages.append(errorMsg)
    }

    private func cacheVisibleSoulFile(_ file: VisibleSoulFile) {
        if let data = try? JSONEncoder().encode(file) {
            UserDefaults.standard.set(data, forKey: "cached_visible_soul_file")
        }
    }

    private func loadCachedVisibleSoulFile() -> VisibleSoulFile? {
        guard let data = UserDefaults.standard.data(forKey: "cached_visible_soul_file") else { return nil }
        return try? JSONDecoder().decode(VisibleSoulFile.self, from: data)
    }
}
