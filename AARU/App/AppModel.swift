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
    @Published var agentDebugStats: [UUID: AgentDebugStat] = [:]
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
    private(set) var instanceID: UUID?
    private var worldRefreshTask: Task<Void, Never>?
    private var conversationRefreshTask: Task<Void, Never>?
    private var inboxRefreshTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var pushTokenObserver: NSObjectProtocol?
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
            instanceID = payload.instanceID
            displayName = payload.displayName
            soulProfile = payload.soulProfile
            avatar = payload.avatar
            worldMovementEvents = payload.world.movementEvents
            worldAgents = maskedWorldAgents(payload.world.agents)
            worldCount = payload.world.count
            worldConfig = payload.world.config
            rebuildDebugStats(from: worldAgents)
            conversations = payload.conversations.map(Self.preview(from:))
            stage = payload.soulProfile == nil ? .onboarding(.soul) : .world
            startRealtime()
            startHeartbeat()
            listenForPushToken()
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
            let generated = try await backend.generateSoulProfile(rawInput: profileInput)
            soulProfile = generated.soulProfile
            if displayName == "Wandering Soul" || displayName.hasPrefix("Soul ") || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                displayName = generated.displayName
            }
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
            let saved = try await backend.saveSoulProfile(
                deviceID: deviceID,
                profile: soulProfile,
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            displayName = saved.displayName
            self.soulProfile = saved.soulProfile
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

        applyAvatarToSelf(avatar)
        stage = .world
        isLoading = false
        logger.info("Entered world locally; syncing avatar and world state")

        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.backend.saveAvatar(deviceID: self.deviceID, avatar: self.avatar)
                await self.refreshWorld(includeInbox: false)
                do {
                    try await self.refreshInbox()
                } catch is CancellationError {
                    return
                } catch {
                    self.errorMessage = error.localizedDescription
                    self.logger.error("Inbox refresh after entering world failed: \(error.localizedDescription, privacy: .public)")
                }
                self.logger.info("Saved avatar and synced world after entering")
            } catch is CancellationError {
                return
            } catch {
                self.errorMessage = error.localizedDescription
                self.logger.error("Saving avatar failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func refreshWorld(includeInbox: Bool = true) async {
        guard case .world = stage else { return }

        do {
            let snapshot = try await backend.syncWorld(deviceID: deviceID)
            worldMovementEvents = snapshot.movementEvents
            worldAgents = maskedWorldAgents(snapshot.agents)
            worldCount = snapshot.count
            worldConfig = snapshot.config
            rebuildDebugStats(from: worldAgents)
            if !snapshot.movementEvents.isEmpty {
                for event in snapshot.movementEvents {
                    appendDebugEvent(movementText(for: event, agentID: event.userID))
                }
            }
            if includeInbox {
                try await refreshInbox()
            }

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
            let saved = try await backend.saveSoulProfile(deviceID: deviceID, profile: soulProfile)
            self.soulProfile = saved.soulProfile
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
                conversations[index].impressionFactors = updated.impressionFactors
                conversations[index].memorySummary = updated.memorySummary
                conversations[index].theirImpressionScore = updated.theirImpressionScore
                conversations[index].theirImpressionSummary = updated.theirImpressionSummary
                conversations[index].theirImpressionFactors = updated.theirImpressionFactors
                conversations[index].theirMemorySummary = updated.theirMemorySummary
                conversations[index].encounterCount = updated.encounterCount
                conversations[index].phase = updated.phase
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
            instanceID: instanceID,
            userID: userID,
            onRealtimeStatus: { [weak self] status in
                self?.appendDebugEvent(status)
                self?.logger.info("\(status, privacy: .public)")
            },
            onWorldTick: { [weak self] payload in
                self?.applyWorldTick(payload)
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

    private func applyWorldTick(_ payload: WorldBroadcastPayload) {
        guard case .world = stage else { return }

        let broadcastIDs = Set(payload.agents.map(\.userID))
        let localIDs = Set(worldAgents.map(\.id))
        let newIDs = broadcastIDs.subtracting(localIDs)
        if !newIDs.isEmpty {
            appendDebugEvent("World tick introduced \(newIDs.count) new agent(s); refreshing metadata")
            scheduleWorldRefresh()
            return
        }

        var agents = worldAgents.filter { broadcastIDs.contains($0.id) }
        var movementEvents: [WorldMovementEvent] = []

        for broadcastAgent in payload.agents {
            guard let index = agents.firstIndex(where: { $0.id == broadcastAgent.userID }) else {
                continue
            }

            let oldAgent = agents[index]
            var updatedAgent = oldAgent

            if let fromX = oldAgent.cellX,
               let fromY = oldAgent.cellY,
               let toX = broadcastAgent.cellX,
               let toY = broadcastAgent.cellY,
               fromX != toX || fromY != toY {
                movementEvents.append(
                    WorldMovementEvent(
                        userID: broadcastAgent.userID,
                        fromCellX: fromX,
                        fromCellY: fromY,
                        toCellX: toX,
                        toCellY: toY
                    )
                )
            }

            updatedAgent.x = broadcastAgent.x
            updatedAgent.y = broadcastAgent.y
            updatedAgent.targetX = broadcastAgent.targetX
            updatedAgent.targetY = broadcastAgent.targetY
            updatedAgent.cellX = broadcastAgent.cellX
            updatedAgent.cellY = broadcastAgent.cellY
            updatedAgent.path = broadcastAgent.path
            updatedAgent.moveSpeed = broadcastAgent.moveSpeed
            updatedAgent.state = broadcastAgent.state
            updatedAgent.behavior = broadcastAgent.behavior
            updatedAgent.behaviorTicksRemaining = nil
            updatedAgent.heading = broadcastAgent.heading
            updatedAgent.activeMessage = broadcastAgent.activeMessage
            updatedAgent.conversationID = broadcastAgent.conversationID
            agents[index] = updatedAgent
            updateDebugStat(for: updatedAgent, oldAgent: oldAgent, newAgent: broadcastAgent)

            let behaviorText = broadcastAgent.behavior ?? "-"
            appendDebugEvent("\(updatedAgent.displayName) state=\(broadcastAgent.state) behavior=\(behaviorText) cell=(\(broadcastAgent.cellX ?? -1),\(broadcastAgent.cellY ?? -1)) path=\(broadcastAgent.path.count)")
            logger.info("World tick for \(updatedAgent.displayName, privacy: .public) state=\(broadcastAgent.state, privacy: .public) behavior=\(behaviorText, privacy: .public) cell=(\(broadcastAgent.cellX ?? -1), privacy: .public),(\(broadcastAgent.cellY ?? -1), privacy: .public) path=\(broadcastAgent.path.count, privacy: .public)")
        }

        worldMovementEvents = movementEvents
        worldCount = agents.count
        worldAgents = maskedWorldAgents(agents)
        rebuildDebugStats(from: worldAgents)

        for event in movementEvents {
            appendDebugEvent(movementText(for: event, agentID: event.userID))
            logger.info("Movement event \(self.movementText(for: event, agentID: event.userID), privacy: .public)")
        }
    }

    // MARK: - Tap Control

    func tapCell(cellX: Int, cellY: Int) async {
        do {
            let response = try await backend.tapCell(
                deviceID: deviceID, cellX: cellX, cellY: cellY
            )
            appendDebugEvent("Tapped cell (\(cellX), \(cellY)) — path: \(response.path.count) cells")
        } catch {
            appendDebugEvent("Tap failed: \(error.localizedDescription)")
        }
    }

    func tapCharacter(targetUserId: UUID) async {
        do {
            let response = try await backend.tapCharacter(
                deviceID: deviceID, targetUserID: targetUserId
            )
            appendDebugEvent("Approaching \(targetUserId.uuidString.prefix(6)) — path: \(response.path.count) cells")
        } catch {
            appendDebugEvent("Approach failed: \(error.localizedDescription)")
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

    private func rebuildDebugStats(from agents: [WorldAgent]) {
        var stats: [UUID: AgentDebugStat] = [:]
        for agent in agents {
            let existing = agentDebugStats[agent.id]
            stats[agent.id] = AgentDebugStat(
                id: agent.id,
                displayName: agent.displayName,
                behavior: agent.behavior ?? agent.state,
                heading: agent.heading,
                pathLength: agent.path.count,
                replanCount: existing?.replanCount ?? 0,
                behaviorChangeCount: existing?.behaviorChangeCount ?? 0,
                lastCell: {
                    guard let x = agent.cellX, let y = agent.cellY else { return nil }
                    return CellCoord(x: x, y: y)
                }()
            )
        }
        agentDebugStats = stats
    }

    private func maskedWorldAgents(_ agents: [WorldAgent]) -> [WorldAgent] {
        let selfConversationID = agents.first(where: \.isSelf)?.conversationID
        return agents.map { agent in
            var maskedAgent = agent
            if let activeMessage = agent.activeMessage {
                maskedAgent.activeMessage = agent.conversationID == selfConversationID ? activeMessage : "..."
            } else {
                maskedAgent.activeMessage = nil
            }
            return maskedAgent
        }
    }

    private func updateDebugStat(for agent: WorldAgent, oldAgent: WorldAgent, newAgent: BroadcastAgent) {
        var stat = agentDebugStats[agent.id] ?? AgentDebugStat(
            id: agent.id,
            displayName: agent.displayName,
            behavior: agent.behavior ?? agent.state,
            heading: agent.heading,
            pathLength: agent.path.count,
            replanCount: 0,
            behaviorChangeCount: 0,
            lastCell: nil
        )

        let oldBehavior = oldAgent.behavior ?? oldAgent.state
        let newBehavior = newAgent.behavior ?? newAgent.state
        let behaviorChanged = oldBehavior != newBehavior
        let pathReplanned =
            !newAgent.path.isEmpty &&
            (
                oldAgent.path.isEmpty ||
                newAgent.path.count > oldAgent.path.count ||
                behaviorChanged
            )

        if behaviorChanged {
            stat.behaviorChangeCount += 1
            appendDebugEvent("\(agent.displayName) behavior \(oldBehavior) -> \(newBehavior)")
        }

        if pathReplanned {
            stat.replanCount += 1
            appendDebugEvent("\(agent.displayName) replanned path #\(stat.replanCount) (\(oldBehavior) -> \(newBehavior), len \(oldAgent.path.count) -> \(newAgent.path.count))")
        }

        stat.displayName = agent.displayName
        stat.behavior = newBehavior
        stat.heading = newAgent.heading
        stat.pathLength = newAgent.path.count
        if let x = newAgent.cellX, let y = newAgent.cellY {
            stat.lastCell = CellCoord(x: x, y: y)
        }
        agentDebugStats[agent.id] = stat
    }

    // ── Heartbeat ──────────────────────────────────────────────

    func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    try await self.backend.heartbeat(deviceID: self.deviceID)
                } catch is CancellationError {
                    return
                } catch {
                    self.logger.error("Heartbeat failed: \(error.localizedDescription, privacy: .public)")
                }
                try? await Task.sleep(for: .seconds(AARUConstants.heartbeatIntervalSeconds))
            }
        }
    }

    func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    private func listenForPushToken() {
        pushTokenObserver = NotificationCenter.default.addObserver(
            forName: .didReceiveAPNSToken,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self, let token = notification.object as? String else { return }
            Task {
                do {
                    try await self.backend.registerPushToken(deviceID: self.deviceID, token: token)
                    self.logger.info("Push token registered")
                } catch {
                    self.logger.error("Push token registration failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private static func preview(from payload: ConversationPreviewPayload) -> ConversationPreview {
        ConversationPreview(
            id: payload.id,
            title: payload.title,
            impressionScore: payload.impressionScore,
            impressionSummary: payload.impressionSummary,
            impressionFactors: payload.impressionFactors,
            memorySummary: payload.memorySummary,
            theirImpressionScore: payload.theirImpressionScore,
            theirImpressionSummary: payload.theirImpressionSummary,
            theirImpressionFactors: payload.theirImpressionFactors,
            theirMemorySummary: payload.theirMemorySummary,
            encounterCount: payload.encounterCount,
            phase: payload.phase,
            status: payload.status,
            baUnlocked: payload.baUnlocked,
            baConversationID: payload.baConversationID,
            baMessageCount: payload.baMessageCount ?? 0
        )
    }
}
