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
    @Published var backendConfiguration: BackendConfiguration
    @Published var visibleSoulFile: VisibleSoulFile = .empty
    @Published var hasMessages = false
    @Published var soulMessages: [SoulMessage] = []
    @Published var soulStreamingText = ""
    @Published var isSoulStreaming = false
    @Published var isSoulFileUpdating = false
    @Published var isDeletingAccount = false
    @Published var language: String = "en"
    @Published var soulmateProfile: SoulmateProfile?
    @Published var soulmateMatches: [SoulmateMatch] = []
    @Published var selectedMatchForReasoning: SoulmateMatch?
    private var lastSoulFileSynthesisRequest: Date?
    private var isBootstrapping = false
    private let iso8601Formatter = ISO8601DateFormatter()
    private var hasCompletedFirstSession: Bool {
        UserDefaults.standard.bool(forKey: storageKey("has_completed_first_session"))
    }

    let backend: BackendClient
    private(set) var deviceID: String
    private(set) var userID: UUID?
    var notificationManager: NotificationManager?

    #if DEBUG
    @Published var debugInfo: DebugInfoResponse?
    @Published var debugRawSections: [String: String] = [:]
    @Published var debugError: String?
    @Published var isLoadingDebugInfo = false
    var debugDeviceIDOverride: String? {
        didSet {
            if let override = debugDeviceIDOverride, !override.isEmpty {
                deviceID = override
            } else {
                deviceID = DeviceIdentity.current(namespace: backendConfiguration.storageNamespace)
            }
        }
    }
    #endif

    init(
        backend: BackendClient = BackendClient(),
        deviceID: String? = nil,
        autoBootstrap: Bool = true
    ) {
        self.backend = backend
        self.backendConfiguration = backend.configuration
        self.deviceID = deviceID ?? DeviceIdentity.current(namespace: backend.configuration.storageNamespace)
        self.hasAgreedToAI = UserDefaults.standard.bool(forKey: "ai_consent_agreed")
        self.backend.sessionToken = SessionIdentity.current(namespace: backend.configuration.storageNamespace)

        if autoBootstrap && hasAgreedToAI {
            Task {
                await bootstrap()
            }
        }
    }

    private func storageKey(_ suffix: String) -> String {
        "\(backendConfiguration.storageNamespace).\(suffix)"
    }

    func bootstrap() async {
        guard !isBootstrapping else { return }
        isBootstrapping = true
        defer { isBootstrapping = false }

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
        DeviceIdentity.clear(namespace: backendConfiguration.storageNamespace)
        SessionIdentity.clear(namespace: backendConfiguration.storageNamespace)
        backend.sessionToken = nil

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "ai_consent_agreed")
        defaults.removeObject(forKey: storageKey("cached_visible_soul_file"))
        defaults.removeObject(forKey: storageKey("cached_soul_messages"))
        defaults.removeObject(forKey: storageKey("has_completed_first_session"))
        // Reset in-memory state
        hasAgreedToAI = false
        visibleSoulFile = .empty
        hasMessages = false
        soulMessages = []
        soulStreamingText = ""
        isSoulStreaming = false
        isSoulFileUpdating = false
        appUpdateRequired = false
        appUpdateMessage = nil
        userID = nil
        errorMessage = nil
        language = "en"
        soulmateProfile = nil
        soulmateMatches = []
        selectedMatchForReasoning = nil
    }

    // MARK: - Notifications

    /// Mark first session as completed (called when synthesis succeeds).
    func markFirstSessionCompleted() {
        if !hasCompletedFirstSession {
            UserDefaults.standard.set(true, forKey: storageKey("has_completed_first_session"))
        }
    }

    /// Request notification permission after first session, then schedule local notification.
    private func scheduleLocalNotificationIfEligible() async {
        guard hasCompletedFirstSession else { return }
        guard let nm = notificationManager else { return }

        if !nm.isPermissionGranted {
            let granted = await nm.requestPermission()
            guard granted else { return }
        }

        await nm.scheduleWeeklyNotification()
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
                SessionIdentity.save(token, namespace: backendConfiguration.storageNamespace)
            }
            visibleSoulFile = response.visibleSoulFile ?? .empty
            hasMessages = response.hasMessages
            if let lang = response.language {
                language = lang
            }
            cacheVisibleSoulFile(visibleSoulFile)
            await syncSoulMessages()
            await maybeRequestOpeningIfNeeded()

            logger.info("Soul bootstrap complete: hasMessages=\(self.hasMessages)")

            // Post-bootstrap: load soulmate profile if unlocked
            if visibleSoulFile.completeness >= 0.7 {
                Task { await loadSoulmateProfile() }
            }

            // Post-bootstrap: schedule local notification
            Task {
                await scheduleLocalNotificationIfEligible()
            }
        } catch {
            // Cached data already loaded above — keep it visible
            errorMessage = error.localizedDescription
            logger.error("Soul bootstrap failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Called when app returns to foreground — silently retries bootstrap if needed
    func handleForeground() {
        guard hasAgreedToAI, !appUpdateRequired else { return }
        Task { await bootstrap() }
    }

    func refreshSoulFile() async {
        do {
            let response = try await backend.getSoulFile()
            let file = response.visibleSoulFile
            if !file.isEmpty {
                visibleSoulFile = file
                cacheVisibleSoulFile(visibleSoulFile)
                markFirstSessionCompleted()
            }
            isSoulFileUpdating = response.synthesisPending
        } catch {
            logger.error("Soul file refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func requestSoulFileUpdateIfNeeded() async {
        // Throttle: don't re-request within 60 seconds
        if let last = lastSoulFileSynthesisRequest,
           Date().timeIntervalSince(last) < 60 { return }

        lastSoulFileSynthesisRequest = Date()
        await refreshSoulFile()
    }

    func beginSoulConversation() async {
        guard !isSoulStreaming else { return }
        logger.info("Beginning soul conversation")

        // Send a first message to get the AI's opening question
        isSoulStreaming = true
        soulStreamingText = ""

        do {
            try await performSoulConverse(mode: .opening)
            await syncSoulMessages()
        } catch let error as BackendError where error.isAuthFailure {
            await bootstrapSoul()
            do {
                try await performSoulConverse(mode: .opening)
                await syncSoulMessages()
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

        let userMessage = SoulMessage(
            id: "local-\(UUID().uuidString)",
            role: "user",
            content: trimmed,
            createdAt: iso8601Formatter.string(from: Date())
        )
        soulMessages.append(userMessage)
        cacheSoulMessages(soulMessages)
        isSoulStreaming = true
        soulStreamingText = ""

        do {
            try await performSoulConverse(message: trimmed, mode: .reply)
            await syncSoulMessages()
        } catch let error as BackendError where error.isAuthFailure {
            logger.info("Auth failure during soul converse, refreshing session and retrying")
            await bootstrapSoul()
            do {
                try await performSoulConverse(message: trimmed, mode: .reply)
                await syncSoulMessages()
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

    private func performSoulConverse(message: String? = nil, mode: SoulConverseMode) async throws {
        try await backend.soulConverseStream(
            mode: mode,
            message: message,
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
                id: "local-\(UUID().uuidString)",
                role: "assistant",
                content: soulStreamingText,
                createdAt: iso8601Formatter.string(from: Date())
            )
            soulMessages.append(assistantMessage)
            cacheSoulMessages(soulMessages)
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
        let errorMsg = SoulMessage(id: "error-\(UUID().uuidString)", role: "system", content: message, createdAt: nil, isError: true)
        soulMessages.append(errorMsg)
    }

    private func cacheVisibleSoulFile(_ file: VisibleSoulFile) {
        if let data = try? JSONEncoder().encode(file) {
            UserDefaults.standard.set(data, forKey: storageKey("cached_visible_soul_file"))
        }
    }

    private func loadCachedVisibleSoulFile() -> VisibleSoulFile? {
        guard let data = UserDefaults.standard.data(forKey: storageKey("cached_visible_soul_file")) else { return nil }
        return try? JSONDecoder().decode(VisibleSoulFile.self, from: data)
    }

    private func cacheSoulMessages(_ messages: [SoulMessage]) {
        let payloads = messages
            .filter { !$0.isError && ($0.role == "user" || $0.role == "assistant") }
            .map {
                SoulMessagePayload(
                    id: $0.id,
                    role: $0.role,
                    content: $0.content,
                    createdAt: $0.createdAt ?? iso8601Formatter.string(from: Date())
                )
        }
        if let data = try? JSONEncoder().encode(payloads) {
            UserDefaults.standard.set(data, forKey: storageKey("cached_soul_messages"))
        }
    }

    private func loadCachedSoulMessages() -> [SoulMessage]? {
        guard let data = UserDefaults.standard.data(forKey: storageKey("cached_soul_messages")) else { return nil }
        guard let payloads = try? JSONDecoder().decode([SoulMessagePayload].self, from: data) else { return nil }
        return payloads.map {
            SoulMessage(id: $0.id, role: $0.role, content: $0.content, createdAt: $0.createdAt)
        }
    }

    private func syncSoulMessages() async {
        do {
            let response = try await backend.syncMessages()
            soulMessages = response.messages.map {
                SoulMessage(id: $0.id, role: $0.role, content: $0.content, createdAt: $0.createdAt)
            }
            hasMessages = !soulMessages.isEmpty || !visibleSoulFile.isEmpty
            cacheSoulMessages(soulMessages)
        } catch {
            logger.error("Message sync failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func shouldAutoRequestOpening(now: Date = Date()) -> Bool {
        guard !isSoulStreaming else { return false }
        guard let lastMessage = soulMessages.last(where: { $0.role == "user" || $0.role == "assistant" }) else {
            return false
        }

        if lastMessage.role == "user" {
            return true
        }

        guard
            let createdAt = lastMessage.createdAt,
            let lastDate = iso8601Formatter.date(from: createdAt)
        else {
            return false
        }

        return now.timeIntervalSince(lastDate) >= 3600
    }

    private func maybeRequestOpeningIfNeeded() async {
        guard hasMessages else { return }
        guard shouldAutoRequestOpening() else { return }
        await beginSoulConversation()
    }

    // MARK: - Language

    func updateLanguage(_ newLanguage: String) async {
        let previousLanguage = language
        language = newLanguage
        do {
            _ = try await backend.updateLanguage(newLanguage)
            logger.info("Language updated to \(newLanguage, privacy: .public)")
        } catch {
            language = previousLanguage
            logger.error("Language update failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Soulmate

    func loadSoulmateProfile() async {
        do {
            let response = try await backend.getSoulmateProfile()
            soulmateProfile = response.soulmateProfile
        } catch {
            logger.error("Soulmate profile fetch failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func loadSoulmateMatches() async {
        do {
            let response = try await backend.getSoulmateMatches()
            soulmateMatches = response.matches
        } catch {
            logger.error("Soulmate matches fetch failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func resetLocalConversationState() {
        backend.sessionToken = SessionIdentity.current(namespace: backendConfiguration.storageNamespace)
        #if DEBUG
        deviceID = debugDeviceIDOverride ?? DeviceIdentity.current(namespace: backendConfiguration.storageNamespace)
        #else
        deviceID = DeviceIdentity.current(namespace: backendConfiguration.storageNamespace)
        #endif
        userID = nil
        visibleSoulFile = .empty
        hasMessages = false
        soulMessages = []
        soulStreamingText = ""
        isSoulStreaming = false
        isSoulFileUpdating = false
        lastSoulFileSynthesisRequest = nil
        errorMessage = nil
    }

    // MARK: - Debug

    #if DEBUG
    func fetchDebugInfo() async {
        isLoadingDebugInfo = true
        defer { isLoadingDebugInfo = false }

        do {
            let (statusCode, rawData) = try await backend.getDebugInfoRaw()

            if statusCode != 200 {
                let body = String(data: rawData, encoding: .utf8) ?? ""
                debugError = "HTTP \(statusCode): \(body)"
                debugInfo = nil
                debugRawSections = [:]
                return
            }

            debugError = nil

            // Try to parse the full response for structured UI (metadata)
            do {
                debugInfo = try JSONDecoder().decode(DebugInfoResponse.self, from: rawData)
            } catch {
                debugInfo = nil
                debugError = "Parse error: \(error.localizedDescription)"
            }

            // Extract raw JSON strings for each artifact section
            if let dict = try? JSONSerialization.jsonObject(with: rawData) as? [String: Any] {
                var sections: [String: String] = [:]
                for key in ["reflection_note", "visible_soul_file", "hidden_soul_file", "steering_preview"] {
                    if let value = dict[key], JSONSerialization.isValidJSONObject(value) {
                        if let sectionData = try? JSONSerialization.data(
                            withJSONObject: value,
                            options: [.prettyPrinted, .sortedKeys]
                        ) {
                            sections[key] = String(data: sectionData, encoding: .utf8)
                        }
                    } else if let value = dict[key], !(value is NSNull) {
                        sections[key] = "\(value)"
                    }
                }
                debugRawSections = sections
            } else {
                debugRawSections = [:]
            }
        } catch {
            debugError = error.localizedDescription
            debugInfo = nil
            debugRawSections = [:]
            logger.error("Debug info fetch failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func updateDebugBackend(
        environment: BackendEnvironmentKind,
        customBaseURLString: String?,
        debugApiToken: String?
    ) async {
        backendConfiguration = BackendSettingsStore.save(
            environment: environment,
            customBaseURLString: customBaseURLString,
            debugApiToken: debugApiToken
        )
        backend.updateConfiguration(backendConfiguration)
        debugDeviceIDOverride = nil
        debugInfo = nil
        resetLocalConversationState()

        guard hasAgreedToAI else { return }
        await bootstrap()
    }

    func updateDebugModelProfile(_ modelProfileID: String) async {
        do {
            let response = try await backend.setModelProfile(modelProfileID)
            logger.info("Updated debug model profile to \(response.modelProfileId, privacy: .public)")
            await fetchDebugInfo()
        } catch {
            logger.error("Model profile update failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func impersonateDevice(_ newDeviceID: String) async {
        debugDeviceIDOverride = newDeviceID.isEmpty ? nil : newDeviceID
        // Clear current state and re-bootstrap with new device ID
        debugInfo = nil
        backend.sessionToken = nil
        soulMessages = []
        visibleSoulFile = .empty
        hasMessages = false
        await bootstrap()
    }
    #endif
}
