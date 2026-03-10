import Foundation
import OSLog

@MainActor
final class AppModel: ObservableObject {
    private let logger = Logger(subsystem: "com.tianzhichen.aaru", category: "app")
    @Published var stage: AppStage = .launching
    @Published var profileInput = ""
    @Published var soulProfile: SoulProfile?
    @Published var avatar: AvatarConfig = .default
    @Published var worldAgents: [WorldAgent] = []
    @Published var worldCount = 0
    @Published var worldConfig: WorldConfig = .default
    @Published var worldMovementEvents: [WorldMovementEvent] = []
    @Published var debugModeEnabled = UserDefaults.standard.bool(forKey: "aaru.debugModeEnabled")
    @Published var debugEvents: [DebugEvent] = []
    @Published var conversations: [ConversationPreview] = []
    @Published var selectedConversation: ConversationDetail?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var displayName = "Wandering Soul"
    @Published var audioRecorder = AudioRecorder()
    @Published var isTranscribing = false

    let backend: BackendClient
    let deviceID: String
    private(set) var userID: UUID?
    private var worldRefreshTask: Task<Void, Never>?
    private var conversationRefreshTask: Task<Void, Never>?
    private var inboxRefreshTask: Task<Void, Never>?
    private let realtime = RealtimeBridge()

    init(
        backend: BackendClient = BackendClient(),
        deviceID: String = DeviceIdentity.current(),
        autoBootstrap: Bool = true
    ) {
        self.backend = backend
        self.deviceID = deviceID

        if autoBootstrap {
            Task {
                await bootstrap()
            }
        }
    }

    func bootstrap() async {
        stage = .launching
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        logger.info("Bootstrapping device \(self.deviceID, privacy: .public)")

        do {
            let payload = try await backend.bootstrap(deviceID: deviceID)
            userID = payload.userID
            displayName = payload.displayName
            soulProfile = payload.soulProfile
            avatar = payload.avatar
            worldMovementEvents = payload.world.movementEvents
            worldAgents = payload.world.agents
            worldCount = payload.world.count
            worldConfig = payload.world.config
            conversations = payload.conversations.map(Self.preview(from:))
            stage = payload.soulProfile == nil ? .onboarding(.soul) : .world
            startRealtime()
            appendDebugEvent("Bootstrap loaded \(payload.world.count) agents on a \(payload.world.config.gridColumns)x\(payload.world.config.gridRows) world")
            logger.info("Bootstrap complete with \(self.worldCount) agents and \(self.conversations.count) conversations")
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Bootstrap failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func generateSoulProfile() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            soulProfile = try await backend.generateSoulProfile(rawInput: profileInput)
            logger.info("Generated soul profile")
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Soul profile generation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func saveSoulProfile() async {
        guard let soulProfile else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await backend.saveSoulProfile(deviceID: deviceID, profile: soulProfile)
            stage = .onboarding(.avatar)
            logger.info("Saved soul profile")
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Saving soul profile failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func saveAvatarAndEnterWorld() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await backend.saveAvatar(deviceID: deviceID, avatar: avatar)
            applyAvatarToSelf(avatar)
            stage = .world
            await refreshWorld()
            stage = .world
            logger.info("Saved avatar and entered world")
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Saving avatar failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func refreshWorld() async {
        guard case .world = stage else { return }

        do {
            let snapshot = try await backend.syncWorld(deviceID: deviceID)
            worldMovementEvents = snapshot.movementEvents
            worldAgents = snapshot.agents
            worldCount = snapshot.count
            worldConfig = snapshot.config
            if !snapshot.movementEvents.isEmpty {
                for event in snapshot.movementEvents {
                    appendDebugEvent(movementText(for: event, agentID: event.userID))
                }
            }
            try await refreshInbox()

            if let current = selectedConversation {
                selectedConversation = try await backend.getConversation(
                    deviceID: deviceID,
                    conversationID: current.id
                )
            }
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            logger.error("World refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func refreshInbox() async throws {
        let latestConversations = try await backend.listConversations(deviceID: deviceID)
        conversations = latestConversations.map(Self.preview(from:))
    }

    func loadConversation(_ conversationID: UUID) async {
        do {
            selectedConversation = try await backend.getConversation(
                deviceID: deviceID,
                conversationID: conversationID
            )
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Loading conversation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func sendBaMessage(_ text: String, conversationID: UUID) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            let updated = try await backend.sendBaMessage(
                deviceID: deviceID,
                conversationID: conversationID,
                content: trimmed
            )
            selectedConversation = updated
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Sending Ba message failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func transcribeRecording() async {
        guard let fileURL = audioRecorder.stopRecording() else { return }
        isTranscribing = true
        defer {
            isTranscribing = false
            audioRecorder.cleanup()
        }

        do {
            let audioData = try Data(contentsOf: fileURL)
            let transcript = try await backend.transcribeAudio(audioData: audioData)
            if !transcript.isEmpty {
                if !profileInput.isEmpty && !profileInput.hasSuffix(" ") && !profileInput.hasSuffix("\n") {
                    profileInput += " "
                }
                profileInput += transcript
            }
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Transcription failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func updateSoulProfile() async {
        guard let soulProfile else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await backend.saveSoulProfile(deviceID: deviceID, profile: soulProfile)
            logger.info("Updated soul profile")
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Updating soul profile failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func sendHumanMessage(_ text: String, conversationID: UUID) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            let updated = try await backend.sendHumanMessage(
                deviceID: deviceID,
                conversationID: conversationID,
                content: trimmed
            )
            selectedConversation = updated
            if let index = conversations.firstIndex(where: { $0.id == conversationID }) {
                conversations[index].impressionScore = updated.impressionScore
                conversations[index].impressionSummary = updated.impressionSummary
                conversations[index].theirImpressionScore = updated.theirImpressionScore
                conversations[index].theirImpressionSummary = updated.theirImpressionSummary
                conversations[index].baUnlocked = updated.baUnlocked
            }
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            logger.error("Sending message failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func updateAvatar(
        bodyShape: String? = nil,
        skinTone: String? = nil,
        hairStyle: String? = nil,
        hairColor: String? = nil,
        eyes: String? = nil,
        outfitTop: String? = nil,
        outfitBottom: String? = nil,
        accessory: String? = nil
    ) {
        if let bodyShape { avatar.bodyShape = bodyShape }
        if let skinTone { avatar.skinTone = skinTone }
        if let hairStyle { avatar.hairStyle = hairStyle }
        if let hairColor { avatar.hairColor = hairColor }
        if let eyes { avatar.eyes = eyes }
        if let outfitTop { avatar.outfitTop = outfitTop }
        if let outfitBottom { avatar.outfitBottom = outfitBottom }
        avatar.accessory = accessory
    }

    func randomizeAvatar() {
        let auraColors = ["#d4af37", "#4f8fba", "#d97b66", "#6fa87a", "#9f7aea"]

        avatar = AvatarConfig(
            spriteId: AvatarSprites.all.randomElement() ?? "m01_explorer",
            auraColor: auraColors.randomElement() ?? "#d4af37"
        )
    }

    func setDebugMode(_ enabled: Bool) {
        debugModeEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "aaru.debugModeEnabled")
    }

    func scheduleWorldRefresh() {
        worldRefreshTask?.cancel()
        worldRefreshTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            await refreshWorld()
        }
    }

    func scheduleInboxRefresh() {
        inboxRefreshTask?.cancel()
        inboxRefreshTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            do {
                try await refreshInbox()
            } catch is CancellationError {
                return
            } catch {
                self.errorMessage = error.localizedDescription
                self.logger.error("Inbox refresh failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func scheduleConversationRefresh(_ conversationID: UUID) {
        conversationRefreshTask?.cancel()
        conversationRefreshTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            await loadConversation(conversationID)
        }
    }

    func startRealtime() {
        realtime.start(
            supabaseURL: backend.realtimeURL,
            anonKey: backend.realtimeAnonKey,
            onRealtimeStatus: { [weak self] status in
                self?.appendDebugEvent(status)
                self?.logger.info("\(status, privacy: .public)")
            },
            onWorldInsert: { [weak self] in
                self?.appendDebugEvent("World row inserted")
                self?.scheduleWorldRefresh()
            },
            onWorldUpdate: { [weak self] oldRow, newRow in
                self?.applyWorldUpdate(oldRow: oldRow, newRow: newRow)
            },
            onWorldDelete: { [weak self] in
                self?.appendDebugEvent("World row deleted")
                self?.scheduleWorldRefresh()
            },
            onInboxChange: { [weak self] in
                self?.appendDebugEvent("Conversation metadata updated")
                self?.scheduleInboxRefresh()
            },
            onConversationChange: { [weak self] in
                guard let self, let conversationID = self.selectedConversation?.id else { return }
                self.appendDebugEvent("Conversation \(conversationID.uuidString.prefix(6)) updated")
                self.scheduleConversationRefresh(conversationID)
            }
        )
        appendDebugEvent("Realtime bridge started")
        logger.info("Realtime bridge started")
    }

    private func applyWorldUpdate(oldRow: RealtimeAgentPosition, newRow: RealtimeAgentPosition) {
        guard case .world = stage else { return }
        var agents = worldAgents
        guard let index = agents.firstIndex(where: { $0.id == newRow.userID }) else {
            appendDebugEvent("World update for unknown user \(newRow.userID.uuidString.prefix(6)); refreshing")
            scheduleWorldRefresh()
            return
        }

        let name = agents[index].displayName
        let movementEvent: WorldMovementEvent?
        if let fromX = oldRow.cellX, let fromY = oldRow.cellY, let toX = newRow.cellX, let toY = newRow.cellY,
           fromX != toX || fromY != toY {
            movementEvent = WorldMovementEvent(
                userID: newRow.userID,
                fromCellX: fromX,
                fromCellY: fromY,
                toCellX: toX,
                toCellY: toY
            )
        } else {
            movementEvent = nil
        }

        worldMovementEvents = movementEvent.map { [$0] } ?? []

        agents[index].x = newRow.x
        agents[index].y = newRow.y
        agents[index].targetX = newRow.targetX
        agents[index].targetY = newRow.targetY
        agents[index].cellX = newRow.cellX
        agents[index].cellY = newRow.cellY
        agents[index].state = newRow.state
        agents[index].activeMessage = newRow.activeMessage
        agents[index].conversationID = newRow.conversationID
        worldAgents = agents

        appendDebugEvent("\(name) update state=\(newRow.state) cell=(\(newRow.cellX ?? -1),\(newRow.cellY ?? -1))")
        logger.info("Realtime row for \(name, privacy: .public) state=\(newRow.state, privacy: .public) cell=(\(newRow.cellX ?? -1), privacy: .public),(\(newRow.cellY ?? -1), privacy: .public)")

        if let event = movementEvent {
            appendDebugEvent(movementText(for: event, agentID: newRow.userID))
            logger.info("Movement event \(self.movementText(for: event, agentID: newRow.userID), privacy: .public)")
        }
    }

    func appendDebugEvent(_ message: String) {
        let event = DebugEvent(timestamp: .now, message: message)
        debugEvents = Array(([event] + debugEvents).prefix(20))
    }

    private func movementText(for event: WorldMovementEvent, agentID: UUID) -> String {
        let name = worldAgents.first(where: { $0.id == agentID })?.displayName ?? agentID.uuidString.prefix(6).description
        return "\(name) moved (\(event.fromCellX),\(event.fromCellY)) -> (\(event.toCellX),\(event.toCellY))"
    }

    private func applyAvatarToSelf(_ avatar: AvatarConfig) {
        worldAgents = worldAgents.map { agent in
            guard agent.isSelf else { return agent }
            var updated = agent
            updated.avatar = avatar
            return updated
        }
    }

    private static func preview(from payload: ConversationPreviewPayload) -> ConversationPreview {
        ConversationPreview(
            id: payload.id,
            title: payload.title,
            impressionScore: payload.impressionScore,
            impressionSummary: payload.impressionSummary,
            theirImpressionScore: payload.theirImpressionScore,
            theirImpressionSummary: payload.theirImpressionSummary,
            status: payload.status,
            baUnlocked: payload.baUnlocked,
            baConversationID: payload.baConversationID,
            baMessageCount: payload.baMessageCount ?? 0
        )
    }
}
