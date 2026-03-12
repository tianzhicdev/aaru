import SpriteKit
import SwiftUI
import UIKit

struct WorldScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var scene = WorldScene(size: CGSize(width: 1_024, height: 1_024))

    private var liveThreadCount: Int {
        Set(model.worldAgents.compactMap(\.conversationID)).count
    }

    private var selfStatus: String {
        model.worldAgents.first(where: \.isSelf)?.state.capitalized ?? "Offline"
    }

    var body: some View {
        ZStack(alignment: .top) {
            SpriteView(scene: scene)
                .ignoresSafeArea()
                .overlay(alignment: .bottomTrailing) {
                    VStack(spacing: 0) {
                        Button { scene.zoomIn() } label: {
                            Image(systemName: "plus")
                                .font(.body.weight(.semibold))
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        Divider().frame(width: 44)
                        Button { scene.zoomOut() } label: {
                            Image(systemName: "minus")
                                .font(.body.weight(.semibold))
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                    }
                    .fixedSize()
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .padding(.trailing, 16)
                    .padding(.bottom, 100)
                }

            HStack {
                Text("Sunset Beach")
                    .font(.title3.bold())
                Spacer()
                Text("Pop \(model.worldCount)/100")
                    .font(.subheadline.bold())
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(alignment: .bottomLeading) {
                HStack(spacing: 10) {
                    statusPill(label: "Status", value: selfStatus, accent: model.worldAgents.first(where: \.isSelf)?.state == "chatting" ? .green : .secondary)
                    statusPill(label: "Threads", value: "\(liveThreadCount)", accent: liveThreadCount > 0 ? .orange : .secondary)
                }
                .padding(.top, 58)
                .padding(.leading, 4)
            }
            .padding(.top, 12)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .task {
            scene.scaleMode = .aspectFill
            scene.updateConfig(model.worldConfig)
            scene.syncAgents(model.worldAgents, debugMode: model.debugModeEnabled)
        }
        .onChange(of: model.worldAgents) { _, agents in
            scene.syncAgents(agents, debugMode: model.debugModeEnabled)
        }
        .onChange(of: model.worldConfig) { _, config in
            scene.updateConfig(config)
            scene.syncAgents(model.worldAgents, debugMode: model.debugModeEnabled)
        }
        .onChange(of: model.debugModeEnabled) { _, _ in
            scene.syncAgents(model.worldAgents, debugMode: model.debugModeEnabled)
        }
    }

    private func statusPill(label: String, value: String, accent: Color) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.bold())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(accent.opacity(0.14), in: Capsule())
    }
}

// MARK: - WorldScene

final class WorldScene: SKScene {
    private var worldConfig = WorldConfig.default
    private let cellSize: CGFloat = 16
    private var worldSize = CGSize(width: 1_024, height: 1_024)
    private let mapNode = SKNode()
    private let backdropLayer = SKNode()
    private var agentNodes: [UUID: AgentVisualNode] = [:]
    private var selfAgentNode: AgentVisualNode?
    private let conversationLayer = SKNode()
    private let cameraNode = SKCameraNode()
    private var columns = 64
    private var rows = 64
    private var lastUpdateTime: TimeInterval = 0
    private var zoomLevel: CGFloat = 1.0
    private let minZoom: CGFloat = 0.25
    private let maxZoom: CGFloat = 3.0
    private let zoomStep: CGFloat = 1.3

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.80, green: 0.91, blue: 0.89, alpha: 1)
        size = worldSize
        if mapNode.parent == nil {
            addChild(mapNode)
            buildBackdrop()
        }
        if cameraNode.parent == nil {
            cameraNode.position = CGPoint(x: worldSize.width * 0.5, y: worldSize.height * 0.5)
            addChild(cameraNode)
            camera = cameraNode
            applyCameraScale()
        }
    }

    func updateConfig(_ config: WorldConfig) {
        guard config != worldConfig else {
            applyCameraScale()
            return
        }
        worldConfig = config
        columns = config.gridColumns
        rows = config.gridRows
        worldSize = CGSize(width: CGFloat(columns) * cellSize, height: CGFloat(rows) * cellSize)
        size = worldSize
        mapNode.removeAllChildren()
        agentNodes.removeAll()
        buildBackdrop()
        applyCameraScale()
    }

    // MARK: - Sync agent data from model (called on realtime updates)

    func syncAgents(_ agents: [WorldAgent], debugMode: Bool = false) {
        if mapNode.parent == nil {
            addChild(mapNode)
            buildBackdrop()
        }
        if cameraNode.parent == nil {
            addChild(cameraNode)
            camera = cameraNode
            applyCameraScale()
        }

        let visible = Set(agents.map(\.id))
        for id in agentNodes.keys where !visible.contains(id) {
            agentNodes[id]?.removeFromParent()
            agentNodes.removeValue(forKey: id)
        }

        // Build a lookup for conversation partners (for face-each-other)
        var conversationPartnerPosition: [UUID: CGPoint] = [:]
        let chattingByConversation = Dictionary(grouping: agents.filter { $0.state == "chatting" && $0.conversationID != nil }, by: { $0.conversationID! })
        for (_, participants) in chattingByConversation where participants.count == 2 {
            let a = participants[0]
            let b = participants[1]
            let posA = cellToPoint(a.cellX ?? Int(a.x * Double(columns)), a.cellY ?? Int(a.y * Double(rows)))
            let posB = cellToPoint(b.cellX ?? Int(b.x * Double(columns)), b.cellY ?? Int(b.y * Double(rows)))
            conversationPartnerPosition[a.id] = posB
            conversationPartnerPosition[b.id] = posA
        }

        for agent in agents {
            let node = agentNodes[agent.id] ?? makeAgentNode(id: agent.id)
            node.configure(with: agent, debugMode: debugMode)
            let animationSeconds = max(Double(worldConfig.moveAnimationMs), 1) / 1_000.0
            let pointsPerSecond = cellSize / CGFloat(animationSeconds)

            // Build the full path: current cell position -> remaining path waypoints
            var waypoints: [CGPoint] = []

            // The agent's current server cell is where it should be heading first
            if let cx = agent.cellX, let cy = agent.cellY {
                waypoints.append(cellToPoint(cx, cy))
            }

            // Then append all future path waypoints
            for coord in agent.path {
                waypoints.append(cellToPoint(coord.x, coord.y))
            }

            node.setPath(
                waypoints: waypoints,
                speed: pointsPerSecond,
                isMoving: agent.state == "wandering" || agent.state == "approaching"
            )

            // Place new nodes at their starting position
            if node.position == .zero, let first = waypoints.first {
                node.position = first
            }

            // Face conversation partner when chatting
            if agent.state == "chatting", let partnerPos = conversationPartnerPosition[agent.id] {
                node.faceToward(partnerPos)
            }

            // Debug: show path preview for self agent
            if debugMode && agent.isSelf {
                node.updatePathPreview(waypoints: waypoints, currentPos: node.position == .zero ? (waypoints.first ?? .zero) : node.position)
            } else {
                node.updatePathPreview(waypoints: [], currentPos: .zero)
            }

            node.updateBubble(message: agent.activeMessage, currentTime: CACurrentMediaTime())

            // Track self-agent for camera constraint
            if agent.isSelf, selfAgentNode !== node {
                selfAgentNode = node
                cameraNode.constraints = [
                    SKConstraint.distance(SKRange(constantValue: 0), to: node)
                ]
            }
        }

        redrawConversationLinks(for: agents)
    }

    // MARK: - 60fps update loop

    override func update(_ currentTime: TimeInterval) {
        let dt: TimeInterval
        if lastUpdateTime == 0 {
            dt = 1.0 / 60.0
        } else {
            dt = min(currentTime - lastUpdateTime, 0.1) // cap at 100ms to avoid jumps
        }
        lastUpdateTime = currentTime

        for (_, node) in agentNodes {
            node.stepAlongPath(dt: dt)
            node.checkBubbleTTL(currentTime: currentTime)
        }
    }

    // MARK: - Helpers

    private func cellToPoint(_ cellX: Int, _ cellY: Int) -> CGPoint {
        CGPoint(
            x: (CGFloat(cellX) + 0.5) / CGFloat(columns) * worldSize.width,
            y: (CGFloat(cellY) + 0.5) / CGFloat(rows) * worldSize.height
        )
    }

    private func makeAgentNode(id: UUID) -> AgentVisualNode {
        let node = AgentVisualNode()
        node.position = .zero
        mapNode.addChild(node)
        agentNodes[id] = node
        return node
    }

    private func buildBackdrop() {
        mapNode.removeAllChildren()
        backdropLayer.removeAllChildren()
        mapNode.addChild(backdropLayer)

        let mapTexture = SKTexture(imageNamed: "sunset_beach_map")
        mapTexture.filteringMode = .nearest
        if mapTexture.size() != .zero {
            let bg = SKSpriteNode(texture: mapTexture)
            bg.size = worldSize
            bg.position = CGPoint(x: worldSize.width * 0.5, y: worldSize.height * 0.5)
            bg.zPosition = -10
            backdropLayer.addChild(bg)
        } else {
            let fallback = SKShapeNode(rectOf: worldSize)
            fallback.fillColor = UIColor(red: 0.91, green: 0.82, blue: 0.63, alpha: 1)
            fallback.strokeColor = .clear
            fallback.position = CGPoint(x: worldSize.width * 0.5, y: worldSize.height * 0.5)
            fallback.zPosition = -10
            backdropLayer.addChild(fallback)
        }

        mapNode.addChild(conversationLayer)
    }

    private func redrawConversationLinks(for agents: [WorldAgent]) {
        conversationLayer.removeAllChildren()
    }

    func zoomIn() {
        zoomLevel = min(zoomLevel * zoomStep, maxZoom)
        applyCameraScale()
    }

    func zoomOut() {
        zoomLevel = max(zoomLevel / zoomStep, minZoom)
        applyCameraScale()
    }

    private func applyCameraScale() {
        let horizontalScale = (CGFloat(worldConfig.cameraVisibleColumns) * cellSize) / max(size.width, 1)
        let verticalScale = (CGFloat(worldConfig.cameraVisibleRows) * cellSize) / max(size.height, 1)
        let baseScale = max(horizontalScale, verticalScale)
        cameraNode.setScale(baseScale / zoomLevel)
    }
}

// MARK: - AgentVisualNode with path interpolation

final class AgentVisualNode: SKNode {
    private let sprite = SKSpriteNode()
    private let fallbackHead = SKShapeNode(circleOfRadius: 7)
    private let fallbackBody = SKShapeNode(rectOf: CGSize(width: 10, height: 12), cornerRadius: 3)
    private let nameLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let debugLabel = SKLabelNode(fontNamed: "AvenirNext-Medium")
    private let headingArrow = SKShapeNode()
    private let pathPreview = SKNode()
    private var currentSpriteId: String?
    private var walkTextures: [SKTexture] = []
    private var idleTextures: [SKTexture] = []
    private let walkActionKey = "walk"
    private let idleActionKey = "idle"
    private var currentAnimState: AnimState = .none
    private enum AnimState { case none, walking, idling }

    // Path interpolation state
    private var waypoints: [CGPoint] = []
    private var waypointIndex = 0
    private var moveSpeed: CGFloat = 0  // points per second
    private var isMoving = false
    private var facingEast = true
    var isSelfAgent = false

    // Bubble TTL state
    private var bubbleMessage: String?
    private var bubbleSetTime: TimeInterval = 0
    private var bubbleTTL: TimeInterval = 0
    private static let bubbleWordsPerSecond: Double = 4.0
    private static let minBubbleDuration: TimeInterval = 1.5
    private static let maxBubbleStaleDuration: TimeInterval = 15.0

    override init() {
        super.init()

        sprite.anchorPoint = CGPoint(x: 0.5, y: 39.0 / 64.0)
        sprite.position = .zero

        fallbackHead.fillColor = UIColor(red: 0.93, green: 0.79, blue: 0.64, alpha: 1)
        fallbackHead.strokeColor = UIColor(white: 0.2, alpha: 0.15)
        fallbackHead.lineWidth = 1
        fallbackHead.position = CGPoint(x: 0, y: 5)

        fallbackBody.fillColor = UIColor(red: 0.34, green: 0.40, blue: 0.36, alpha: 1)
        fallbackBody.strokeColor = .clear
        fallbackBody.position = CGPoint(x: 0, y: -3)

        nameLabel.fontSize = 5
        nameLabel.fontColor = UIColor(red: 0.18, green: 0.20, blue: 0.18, alpha: 0.9)
        nameLabel.position = CGPoint(x: 0, y: -16)
        nameLabel.verticalAlignmentMode = .center

        debugLabel.fontSize = 3.5
        debugLabel.fontColor = UIColor(red: 0.4, green: 0.4, blue: 0.4, alpha: 0.8)
        debugLabel.position = CGPoint(x: 0, y: -20)
        debugLabel.verticalAlignmentMode = .center
        debugLabel.isHidden = true

        headingArrow.strokeColor = UIColor.systemRed.withAlphaComponent(0.8)
        headingArrow.lineWidth = 1.5
        headingArrow.isHidden = true
        headingArrow.zPosition = 10

        pathPreview.zPosition = 9
        pathPreview.isHidden = true

        addChild(fallbackBody)
        addChild(fallbackHead)
        addChild(sprite)
        addChild(nameLabel)
        addChild(debugLabel)
        addChild(headingArrow)
        addChild(pathPreview)
    }

    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with agent: WorldAgent, debugMode: Bool = false) {
        let spriteId = agent.avatar.spriteId

        if spriteId != currentSpriteId {
            currentSpriteId = spriteId
            walkTextures = SpriteSheetHelper.walkTextures(for: spriteId)
            idleTextures = SpriteSheetHelper.idleTextures(for: spriteId)
            currentAnimState = .none
            if let tex = idleTextures.first ?? walkTextures.first {
                sprite.texture = tex
                sprite.texture?.filteringMode = .nearest
                sprite.size = tex.size()
                sprite.isHidden = false
                fallbackHead.isHidden = true
                fallbackBody.isHidden = true
            } else {
                sprite.texture = nil
                sprite.isHidden = true
                fallbackHead.isHidden = false
                fallbackBody.isHidden = false
            }
        }

        nameLabel.isHidden = agent.isSelf
        if !agent.isSelf {
            nameLabel.text = agent.displayName
        }

        fallbackBody.fillColor = UIColor(hex: agent.avatar.auraColor).withAlphaComponent(0.85)

        // Debug overlay: behavior/heading/ticks for self, simple state for others
        if debugMode && agent.isSelf {
            let behaviorText = agent.behavior ?? "-"
            let headingText = agent.heading.map { "H\($0)" } ?? "H?"
            let ticksText = agent.behaviorTicksRemaining.map { "T\($0)" } ?? ""
            let pathLen = agent.path.count
            debugLabel.text = "\(behaviorText) \(headingText) \(ticksText) P\(pathLen)"
            debugLabel.isHidden = false
            // Draw heading arrow
            drawHeadingArrow(heading: agent.heading)
        } else if debugMode {
            let behaviorText = agent.behavior ?? "-"
            debugLabel.text = "\(agent.state)/\(behaviorText)"
            debugLabel.isHidden = false
            headingArrow.isHidden = true
            pathPreview.isHidden = true
        } else {
            debugLabel.isHidden = true
            headingArrow.isHidden = true
            pathPreview.isHidden = true
        }

        zPosition = agent.isSelf ? 4 : 2
        isSelfAgent = agent.isSelf
    }

    // Heading direction lookup: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
    private static let headingDX: [CGFloat] = [0, 1, 1, 1, 0, -1, -1, -1]
    // Note: SpriteKit Y is up, but our grid Y goes down. Arrow points in grid-space heading.
    private static let headingDY: [CGFloat] = [1, 1, 0, -1, -1, -1, 0, 1]

    private func drawHeadingArrow(heading: Int?) {
        guard let h = heading, h >= 0, h < 8 else {
            headingArrow.isHidden = true
            return
        }
        let length: CGFloat = 14
        let dx = Self.headingDX[h] * length
        let dy = Self.headingDY[h] * length
        let path = CGMutablePath()
        path.move(to: .zero)
        path.addLine(to: CGPoint(x: dx, y: dy))
        // Arrowhead
        let angle = atan2(dy, dx)
        let arrowLen: CGFloat = 4
        let arrowAngle: CGFloat = .pi / 6
        path.addLine(to: CGPoint(
            x: dx - arrowLen * cos(angle - arrowAngle),
            y: dy - arrowLen * sin(angle - arrowAngle)
        ))
        path.move(to: CGPoint(x: dx, y: dy))
        path.addLine(to: CGPoint(
            x: dx - arrowLen * cos(angle + arrowAngle),
            y: dy - arrowLen * sin(angle + arrowAngle)
        ))
        headingArrow.path = path
        headingArrow.isHidden = false
    }

    func updatePathPreview(waypoints: [CGPoint], currentPos: CGPoint) {
        pathPreview.removeAllChildren()
        guard !waypoints.isEmpty else {
            pathPreview.isHidden = true
            return
        }
        pathPreview.isHidden = false
        for (i, wp) in waypoints.enumerated() {
            let dot = SKShapeNode(circleOfRadius: 1.5)
            dot.fillColor = UIColor.systemBlue.withAlphaComponent(0.6)
            dot.strokeColor = .clear
            // Position relative to the agent node
            dot.position = CGPoint(x: wp.x - currentPos.x, y: wp.y - currentPos.y)
            dot.zPosition = 9
            pathPreview.addChild(dot)
            // Draw connecting line from previous point
            if i > 0 {
                let prev = waypoints[i - 1]
                let line = SKShapeNode()
                let linePath = CGMutablePath()
                linePath.move(to: CGPoint(x: prev.x - currentPos.x, y: prev.y - currentPos.y))
                linePath.addLine(to: CGPoint(x: wp.x - currentPos.x, y: wp.y - currentPos.y))
                line.path = linePath
                line.strokeColor = UIColor.systemBlue.withAlphaComponent(0.3)
                line.lineWidth = 0.8
                pathPreview.addChild(line)
            }
        }
    }

    /// Face toward a specific point (used for chatting agents to face each other).
    func faceToward(_ point: CGPoint) {
        let dx = point.x - position.x
        if abs(dx) > 0.1 {
            facingEast = dx > 0
            sprite.xScale = facingEast ? 1.0 : -1.0
        }
    }

    /// Update the path this agent should walk along.
    func setPath(waypoints: [CGPoint], speed: CGFloat, isMoving: Bool) {
        self.moveSpeed = speed
        self.isMoving = isMoving

        if !isMoving || waypoints.isEmpty {
            self.waypoints = []
            self.waypointIndex = 0
            if currentAnimState == .walking {
                stopWalkAnimation()
            } else if currentAnimState == .none {
                startIdleAnimation()
            }
            return
        }

        self.waypoints = waypoints
        self.waypointIndex = 0
    }

    /// Called every frame from WorldScene.update() — moves the node along its path.
    func stepAlongPath(dt: TimeInterval) {
        guard isMoving, !waypoints.isEmpty, waypointIndex < waypoints.count else {
            return
        }

        let target = waypoints[waypointIndex]
        let dx = target.x - position.x
        let dy = target.y - position.y
        let distance = sqrt(dx * dx + dy * dy)
        let step = moveSpeed * CGFloat(dt)

        // Update facing direction and animation
        updateFacing(dx: dx, dy: dy)
        if sprite.action(forKey: walkActionKey) == nil {
            startWalkAnimation()
        }

        if step >= distance {
            // Arrived at this waypoint
            position = target
            waypointIndex += 1

            if waypointIndex >= waypoints.count {
                // Path complete — stop
                stopWalkAnimation()
            }
        } else {
            // Move toward waypoint
            let ratio = step / distance
            position.x += dx * ratio
            position.y += dy * ratio
        }
    }

    private func updateFacing(dx: CGFloat, dy: CGFloat) {
        if abs(dx) > abs(dy) {
            facingEast = dx > 0
        }
        // When vertical movement dominates, keep last horizontal direction
        sprite.xScale = facingEast ? 1.0 : -1.0
    }

    private func startWalkAnimation() {
        guard !walkTextures.isEmpty else { return }
        guard currentAnimState != .walking else { return }
        sprite.removeAction(forKey: idleActionKey)
        sprite.removeAction(forKey: walkActionKey)
        let animate = SKAction.animate(with: walkTextures, timePerFrame: 0.15)
        sprite.run(SKAction.repeatForever(animate), withKey: walkActionKey)
        currentAnimState = .walking
    }

    private func stopWalkAnimation() {
        sprite.removeAction(forKey: walkActionKey)
        currentAnimState = .none
        startIdleAnimation()
    }

    private func startIdleAnimation() {
        guard !idleTextures.isEmpty else {
            if let tex = walkTextures.first { sprite.texture = tex }
            return
        }
        guard currentAnimState != .idling else { return }
        sprite.removeAction(forKey: walkActionKey)
        sprite.removeAction(forKey: idleActionKey)
        let animate = SKAction.animate(with: idleTextures, timePerFrame: 0.18)
        sprite.run(SKAction.repeatForever(animate), withKey: idleActionKey)
        currentAnimState = .idling
    }

    // MARK: - Bubble management

    func updateBubble(message: String?, currentTime: TimeInterval) {
        if let message = message {
            if message != bubbleMessage {
                // New message — set TTL based on word count
                bubbleMessage = message
                bubbleSetTime = currentTime
                let words = max(1, Double(message.split(separator: " ").count))
                bubbleTTL = max(Self.minBubbleDuration, words / Self.bubbleWordsPerSecond)

                childNode(withName: "bubble")?.removeFromParent()
                let bubble = makeBubbleNode(text: message)
                bubble.position = CGPoint(x: 0, y: 18)
                bubble.name = "bubble"
                addChild(bubble)
            }
        } else {
            clearBubble()
        }
    }

    /// Called from the scene's update loop to expire stale bubbles.
    func checkBubbleTTL(currentTime: TimeInterval) {
        guard bubbleMessage != nil else { return }
        let elapsed = currentTime - bubbleSetTime
        if elapsed > bubbleTTL || elapsed > Self.maxBubbleStaleDuration {
            clearBubble()
        }
    }

    private func clearBubble() {
        bubbleMessage = nil
        bubbleSetTime = 0
        bubbleTTL = 0
        childNode(withName: "bubble")?.removeFromParent()
    }

    private func makeBubbleNode(text: String) -> SKNode {
        let container = SKNode()
        container.name = "bubble"

        let isEllipsis = text == "..."
        let maxWidth: CGFloat = 60

        let label = SKLabelNode()
        label.fontName = "AvenirNext-DemiBold"
        label.fontSize = 4
        label.fontColor = UIColor(red: 0.23, green: 0.25, blue: 0.22, alpha: 1)
        label.verticalAlignmentMode = .center
        label.horizontalAlignmentMode = .center

        if isEllipsis {
            label.text = "..."
            label.numberOfLines = 1
            let bgWidth: CGFloat = 20
            let background = SKShapeNode(rectOf: CGSize(width: bgWidth, height: 12), cornerRadius: 4)
            background.fillColor = .white
            background.strokeColor = UIColor(white: 0.85, alpha: 1)
            container.addChild(background)
            container.addChild(label)
        } else {
            label.text = text
            label.numberOfLines = 0
            label.preferredMaxLayoutWidth = maxWidth
            let frame = label.calculateAccumulatedFrame()
            let padding: CGFloat = 6
            let bgWidth = min(maxWidth + padding, max(20, frame.width + padding))
            let bgHeight = max(12, frame.height + padding)
            let background = SKShapeNode(rectOf: CGSize(width: bgWidth, height: bgHeight), cornerRadius: 4)
            background.fillColor = .white
            background.strokeColor = UIColor(white: 0.85, alpha: 1)
            background.position = CGPoint(x: 0, y: frame.midY)
            label.position = CGPoint(x: 0, y: frame.midY)
            container.addChild(background)
            container.addChild(label)
        }

        return container
    }
}

private extension UIColor {
    convenience init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        self.init(
            red: CGFloat((int >> 16) & 0xff) / 255,
            green: CGFloat((int >> 8) & 0xff) / 255,
            blue: CGFloat(int & 0xff) / 255,
            alpha: 1
        )
    }
}
