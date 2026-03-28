import Foundation
import OSLog

@MainActor
final class AppModel: ObservableObject {
    private let logger = Logger(subsystem: "com.trythumos.app", category: "app")
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Version check
    @Published var appUpdateRequired = false
    @Published var appUpdateMessage: String?

    // AI consent
    @Published var hasAgreedToAI: Bool

    // Soul Mirror state
    @Published var visibleSoulFile: VisibleSoulFile = .empty
    @Published var canStartSoulSession = false
    @Published var nextSessionNumber = 1
    @Published var activeSoulSession: SoulSessionInfo?
    @Published var soulMessages: [SoulMessage] = []
    @Published var soulStreamingText = ""
    @Published var isSoulStreaming = false
    @Published var isSoulFileUpdating = false
    @Published var isDeletingAccount = false
    private var lastSoulFileSynthesisRequest: Date?

    let backend: BackendClient
    private(set) var deviceID: String
    private(set) var userID: UUID?

    #if DEBUG
    @Published var debugInfo: DebugInfoResponse?
    @Published var isLoadingDebugInfo = false
    var debugDeviceIDOverride: String? {
        didSet {
            if let override = debugDeviceIDOverride, !override.isEmpty {
                deviceID = override
            } else {
                deviceID = DeviceIdentity.current()
            }
        }
    }
    #endif

    init(
        backend: BackendClient = BackendClient(),
        deviceID: String = DeviceIdentity.current(),
        autoBootstrap: Bool = true
    ) {
        self.backend = backend
        self.deviceID = deviceID
        self.hasAgreedToAI = UserDefaults.standard.bool(forKey: "ai_consent_agreed")
        self.backend.sessionToken = SessionIdentity.current()

        if autoBootstrap && hasAgreedToAI {
            Task {
                await bootstrap()
            }
        }
    }

    func bootstrap() async {
        logger.info("Bootstrapping device \(self.deviceID, privacy: .public)")
        await checkVersion()
        guard !appUpdateRequired else { return }
        await bootstrapSoul()
    }

    // MARK: - Version Check

    func checkVersion() async {
        do {
            let response = try await backend.checkVersion()
            if response.status == "unsupported" {
                appUpdateRequired = true
                appUpdateMessage = response.message
            }
        } catch {
            // Version check failure should not block the app
            logger.error("Version check failed (non-blocking): \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - AI Consent

    func agreeToAIConsent() {
        hasAgreedToAI = true
        UserDefaults.standard.set(true, forKey: "ai_consent_agreed")
        Task {
            await bootstrap()
        }
    }

    // MARK: - Delete Account

    func deleteAccount() async {
        isDeletingAccount = true
        defer { isDeletingAccount = false }

        // Best-effort server deletion
        do {
            _ = try await backend.deleteAccount()
            logger.info("Account deleted on server")
        } catch {
            logger.error("Server delete failed (clearing local anyway): \(error.localizedDescription, privacy: .public)")
        }

        // Always clear local state
        DeviceIdentity.clear()
        SessionIdentity.clear()
        backend.sessionToken = nil

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "ai_consent_agreed")
        defaults.removeObject(forKey: "cached_visible_soul_file")
        defaults.removeObject(forKey: "cached_soul_messages")

        // Reset in-memory state
        hasAgreedToAI = false
        visibleSoulFile = .empty
        canStartSoulSession = false
        nextSessionNumber = 1
        activeSoulSession = nil
        soulMessages = []
        soulStreamingText = ""
        isSoulStreaming = false
        isSoulFileUpdating = false
        appUpdateRequired = false
        appUpdateMessage = nil
        userID = nil
        errorMessage = nil
    }

    // MARK: - Soul Mirror

    func bootstrapSoul() async {
        isLoading = true
        errorMessage = nil

        // Load cached data immediately so UI isn't blank during network call
        if soulMessages.isEmpty, let cachedMessages = loadCachedSoulMessages() {
            soulMessages = cachedMessages
            logger.info("Loaded \(cachedMessages.count) cached messages")
        }
        if visibleSoulFile.isEmpty, let cachedFile = loadCachedVisibleSoulFile() {
            visibleSoulFile = cachedFile
            logger.info("Loaded cached visible soul file")
        }

        defer { isLoading = false }

        do {
            let response = try await backend.bootstrapSoul(deviceID: deviceID)
            userID = response.userId
            if let token = response.token {
                backend.sessionToken = token
                SessionIdentity.save(token)
            }
            visibleSoulFile = response.visibleSoulFile ?? .empty
            activeSoulSession = response.activeSession
            canStartSoulSession = response.canStartSession
            nextSessionNumber = response.nextSessionNumber

            if let payloads = response.messages, !payloads.isEmpty {
                soulMessages = payloads.map { msg in
                    SoulMessage(id: UUID(), role: msg.role, content: msg.content)
                }
                cacheSoulMessages(soulMessages)
            }

            cacheVisibleSoulFile(visibleSoulFile)

            logger.info("Soul bootstrap complete: session \(self.nextSessionNumber), canStart=\(self.canStartSoulSession)")
        } catch {
            // Cached data already loaded above — keep it visible
            errorMessage = error.localizedDescription
            logger.error("Soul bootstrap failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Called when app returns to foreground — silently retries bootstrap if needed
    func handleForeground() {
        guard hasAgreedToAI, !appUpdateRequired else { return }

        // If there's an error from a previous bootstrap, retry silently
        if errorMessage != nil {
            Task { await bootstrap() }
            return
        }

        // If we have an active session but no messages loaded, re-bootstrap
        if soulMessages.isEmpty && !isLoading {
            Task { await bootstrap() }
        }
    }

    func refreshSoulFile() async {
        do {
            let response = try await backend.synthesizeSoulFile()
            if response.synthesisSucceeded {
                visibleSoulFile = response.visibleSoulFile
                cacheVisibleSoulFile(visibleSoulFile)
                logger.info("Soul file synthesis succeeded")
            } else {
                // Synthesis didn't succeed — fall back to fetching current file
                let fileResponse = try await backend.getSoulFile()
                visibleSoulFile = fileResponse.visibleSoulFile
                cacheVisibleSoulFile(visibleSoulFile)
            }
        } catch {
            logger.error("Soul file refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func requestSoulFileUpdateIfNeeded() async {
        // Don't re-request within 60 seconds
        if let last = lastSoulFileSynthesisRequest,
           Date().timeIntervalSince(last) < 60 { return }

        lastSoulFileSynthesisRequest = Date()
        isSoulFileUpdating = true
        await refreshSoulFile()
        isSoulFileUpdating = false
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

    private func cacheSoulMessages(_ messages: [SoulMessage]) {
        let payloads = messages.map { SoulMessagePayload(role: $0.role, content: $0.content) }
        if let data = try? JSONEncoder().encode(payloads) {
            UserDefaults.standard.set(data, forKey: "cached_soul_messages")
        }
    }

    private func loadCachedSoulMessages() -> [SoulMessage]? {
        guard let data = UserDefaults.standard.data(forKey: "cached_soul_messages") else { return nil }
        guard let payloads = try? JSONDecoder().decode([SoulMessagePayload].self, from: data) else { return nil }
        return payloads.map { SoulMessage(id: UUID(), role: $0.role, content: $0.content) }
    }

    // MARK: - Debug

    #if DEBUG
    func fetchDebugInfo() async {
        isLoadingDebugInfo = true
        defer { isLoadingDebugInfo = false }
        do {
            debugInfo = try await backend.getDebugInfo()
        } catch {
            logger.error("Debug info fetch failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func impersonateDevice(_ newDeviceID: String) async {
        debugDeviceIDOverride = newDeviceID.isEmpty ? nil : newDeviceID
        // Clear current state and re-bootstrap with new device ID
        backend.sessionToken = nil
        soulMessages = []
        visibleSoulFile = .empty
        activeSoulSession = nil
        debugInfo = nil
        await bootstrap()
    }
    #endif
}
