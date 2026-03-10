import Foundation
import OSLog

@MainActor
final class AppModel: ObservableObject {
    private let logger = Logger(subsystem: "com.tianzhichen.aaru", category: "app")
    @Published var stage: AppStage = .onboarding(.soul)
    @Published var profileInput = ""
    @Published var soulProfile: SoulProfile?
    @Published var avatar: AvatarConfig = .default
    @Published var worldAgents: [WorldAgent] = []
    @Published var worldCount = 0
    @Published var worldMovementEvents: [WorldMovementEvent] = []
    @Published var conversations: [ConversationPreview] = []
    @Published var selectedConversation: ConversationDetail?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var displayName = "Wandering Soul"

    let backend: BackendClient
    let deviceID: String
    private(set) var userID: UUID?
    private var worldRefreshTask: Task<Void, Never>?
    private var conversationRefreshTask: Task<Void, Never>?
    private let realtime = RealtimeBridge()

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
            displayName = payload.displayName
            soulProfile = payload.soulProfile
            avatar = payload.avatar
            worldAgents = payload.world.agents
            worldCount = payload.world.count
            worldMovementEvents = payload.world.movementEvents
            conversations = payload.conversations.map(Self.preview(from:))
            stage = payload.soulProfile == nil ? .onboarding(.soul) : .world
            startRealtime()
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
            stage = .world
            if backend.sessionToken == nil {
                await bootstrap()
            } else {
                await refreshWorld()
            }
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
            worldAgents = snapshot.agents
            worldCount = snapshot.count
            worldMovementEvents = snapshot.movementEvents
            let latestConversations = try await backend.listConversations(deviceID: deviceID)
            conversations = latestConversations.map(Self.preview(from:))

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

    func configurePersistedSession() {
        backend.sessionToken = SessionIdentity.current()
    }

    func scheduleWorldRefresh() {
        worldRefreshTask?.cancel()
        worldRefreshTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            await refreshWorld()
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
            onWorldInsert: { [weak self] in
                self?.scheduleWorldRefresh()
            },
            onWorldUpdate: { [weak self] oldRow, newRow in
                self?.applyWorldUpdate(oldRow: oldRow, newRow: newRow)
            },
            onWorldDelete: { [weak self] in
                self?.scheduleWorldRefresh()
            },
            onInboxChange: { [weak self] in
                self?.scheduleWorldRefresh()
            },
            onConversationChange: { [weak self] in
                guard let self, let conversationID = self.selectedConversation?.id else { return }
                self.scheduleConversationRefresh(conversationID)
            }
        )
        logger.info("Realtime bridge started")
    }

    private func applyWorldUpdate(oldRow: RealtimeAgentPosition, newRow: RealtimeAgentPosition) {
        guard case .world = stage else { return }
        var agents = worldAgents
        guard let index = agents.firstIndex(where: { $0.id == newRow.userID }) else {
            scheduleWorldRefresh()
            return
        }

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

        if let fromX = oldRow.cellX, let fromY = oldRow.cellY, let toX = newRow.cellX, let toY = newRow.cellY,
           fromX != toX || fromY != toY {
            worldMovementEvents = [
                WorldMovementEvent(
                    userID: newRow.userID,
                    fromCellX: fromX,
                    fromCellY: fromY,
                    toCellX: toX,
                    toCellY: toY
                )
            ]
        } else {
            worldMovementEvents = []
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
            baUnlocked: payload.baUnlocked
        )
    }
}
