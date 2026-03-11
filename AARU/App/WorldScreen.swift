import SpriteKit
import SwiftUI

struct WorldScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var scene = WorldScene(size: CGSize(width: 6_000, height: 6_000))

    private var liveThreadCount: Int {
        Set(model.worldAgents.compactMap(\.conversationID)).count
    }

    private var selfStatus: String {
        model.worldAgents.first(where: \.isSelf)?.state.capitalized ?? "Offline"
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Sunset Beach")
                    .font(.title2.bold())
                Spacer()
                Text("\u{1F465} \(model.worldCount)/100")
                    .font(.headline)
            }

            HStack(spacing: 10) {
                statusPill(label: "You", value: selfStatus, accent: model.worldAgents.first(where: \.isSelf)?.state == "chatting" ? .green : .secondary)
                statusPill(label: "Live Threads", value: "\(liveThreadCount)", accent: liveThreadCount > 0 ? .orange : .secondary)
                Spacer()
            }

            SpriteView(scene: scene)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    Text("Ka-only world view")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.thinMaterial, in: Capsule())
                        .padding(16)
                }
                .overlay(alignment: .topTrailing) {
                    if model.debugModeEnabled {
                        DebugOverlay(events: model.debugEvents)
                            .padding(16)
                    }
                }
        }
        .padding(20)
        .task {
            scene.scaleMode = .aspectFill
            scene.updateConfig(model.worldConfig)
            scene.syncAgents(model.worldAgents)
        }
        .onChange(of: model.worldAgents) { _, agents in
            scene.syncAgents(agents)
        }
        .onChange(of: model.worldConfig) { _, config in
            scene.updateConfig(config)
            scene.syncAgents(model.worldAgents)
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
    private let cellSize: CGFloat = 120
    private var worldSize = CGSize(width: 6_000, height: 6_000)
    private let mapNode = SKNode()
    private var agentNodes: [UUID: AgentVisualNode] = [:]
    private let conversationLayer = SKNode()
    private let cameraNode = SKCameraNode()
    private var columns = 50
    private var rows = 50
    private var lastUpdateTime: TimeInterval = 0

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.80, green: 0.91, blue: 0.89, alpha: 1)
        size = worldSize
        if mapNode.parent == nil {
            addChild(mapNode)
            buildBackdrop()
        }
        if cameraNode.parent == nil {
            addChild(cameraNode)
            camera = cameraNode
            applyCameraScale()
        }
    }

    func updateConfig(_ config: WorldConfig) {
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

    func syncAgents(_ agents: [WorldAgent]) {
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

        for agent in agents {
            let node = agentNodes[agent.id] ?? makeAgentNode(id: agent.id)
            node.configure(with: agent)

            // Build the full path: current cell position → remaining path waypoints
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
                speed: agent.moveSpeed > 0 ? CGFloat(agent.moveSpeed) * cellSize : 0,
                isMoving: agent.state == "wandering"
            )

            // Place new nodes at their starting position
            if node.position == .zero, let first = waypoints.first {
                node.position = first
            }

            if let message = agent.activeMessage {
                let bubble = bubbleNode(text: message)
                bubble.position = CGPoint(x: 0, y: 40)
                bubble.name = "bubble"
                node.childNode(withName: "bubble")?.removeFromParent()
                node.addChild(bubble)
            } else {
                node.childNode(withName: "bubble")?.removeFromParent()
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

        var selfPosition: CGPoint?
        for (_, node) in agentNodes {
            node.stepAlongPath(dt: dt)
            if node.isSelfAgent {
                selfPosition = node.position
            }
        }

        // Smooth camera follow
        if let target = selfPosition {
            let cameraSpeed: CGFloat = 4.0
            let dx = target.x - cameraNode.position.x
            let dy = target.y - cameraNode.position.y
            cameraNode.position.x += dx * min(CGFloat(dt) * cameraSpeed, 1.0)
            cameraNode.position.y += dy * min(CGFloat(dt) * cameraSpeed, 1.0)
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

    private func bubbleNode(text: String) -> SKNode {
        let container = SKNode()
        container.name = "bubble"

        let background = SKShapeNode(rectOf: CGSize(width: 148, height: 34), cornerRadius: 12)
        background.fillColor = .white
        background.strokeColor = UIColor(white: 0.85, alpha: 1)

        let label = SKLabelNode(text: String(text.prefix(24)))
        label.fontName = "AvenirNext-DemiBold"
        label.fontSize = 11
        label.fontColor = UIColor(red: 0.23, green: 0.25, blue: 0.22, alpha: 1)
        label.verticalAlignmentMode = .center

        container.addChild(background)
        container.addChild(label)
        return container
    }

    private func buildBackdrop() {
        mapNode.removeAllChildren()
        let sand = SKShapeNode(rectOf: CGSize(width: worldSize.width * 0.9, height: worldSize.height * 0.65), cornerRadius: 48)
        sand.fillColor = UIColor(red: 0.95, green: 0.84, blue: 0.63, alpha: 1)
        sand.strokeColor = .clear
        sand.position = CGPoint(x: worldSize.width * 0.5, y: worldSize.height * 0.55)

        let coffee = SKShapeNode(rectOf: CGSize(width: worldSize.width * 0.42, height: worldSize.height * 0.2), cornerRadius: 32)
        coffee.fillColor = UIColor(red: 0.56, green: 0.39, blue: 0.27, alpha: 1)
        coffee.strokeColor = .clear
        coffee.position = CGPoint(x: worldSize.width * 0.72, y: worldSize.height * 0.22)

        let water = SKShapeNode(rectOf: CGSize(width: worldSize.width, height: worldSize.height * 0.22))
        water.fillColor = UIColor(red: 0.39, green: 0.69, blue: 0.82, alpha: 1)
        water.strokeColor = .clear
        water.position = CGPoint(x: worldSize.width * 0.5, y: worldSize.height * 0.9)

        let grid = SKNode()
        let cellWidth = worldSize.width / CGFloat(columns)
        let cellHeight = worldSize.height / CGFloat(rows)
        for column in 0...columns {
            let path = CGMutablePath()
            let x = CGFloat(column) * cellWidth
            path.move(to: CGPoint(x: x, y: 0))
            path.addLine(to: CGPoint(x: x, y: worldSize.height))
            let line = SKShapeNode(path: path)
            line.strokeColor = UIColor.white.withAlphaComponent(0.12)
            line.lineWidth = 1
            grid.addChild(line)
        }
        for row in 0...rows {
            let path = CGMutablePath()
            let y = CGFloat(row) * cellHeight
            path.move(to: CGPoint(x: 0, y: y))
            path.addLine(to: CGPoint(x: worldSize.width, y: y))
            let line = SKShapeNode(path: path)
            line.strokeColor = UIColor.black.withAlphaComponent(0.07)
            line.lineWidth = 1
            grid.addChild(line)
        }

        mapNode.addChild(sand)
        mapNode.addChild(coffee)
        mapNode.addChild(water)
        mapNode.addChild(grid)
        mapNode.addChild(conversationLayer)
    }

    private func redrawConversationLinks(for agents: [WorldAgent]) {
        conversationLayer.removeAllChildren()
        let grouped = Dictionary(grouping: agents.compactMap { agent -> (UUID, WorldAgent)? in
            guard let conversationID = agent.conversationID, agent.state == "chatting" else {
                return nil
            }
            return (conversationID, agent)
        }, by: \.0)

        for (_, entries) in grouped {
            let participants = entries.map(\.1)
            guard participants.count == 2 else { continue }
            let a = CGPoint(x: participants[0].x * worldSize.width, y: participants[0].y * worldSize.height)
            let b = CGPoint(x: participants[1].x * worldSize.width, y: participants[1].y * worldSize.height)
            let path = CGMutablePath()
            path.move(to: a)
            path.addLine(to: b)

            let line = SKShapeNode(path: path)
            line.strokeColor = UIColor(red: 0.89, green: 0.43, blue: 0.23, alpha: 0.9)
            line.lineWidth = 3
            line.glowWidth = 1.5
            line.zPosition = 1
            conversationLayer.addChild(line)
        }
    }

    private func applyCameraScale() {
        let horizontalScale = (CGFloat(worldConfig.cameraVisibleColumns) * cellSize) / max(size.width, 1)
        let verticalScale = (CGFloat(worldConfig.cameraVisibleRows) * cellSize) / max(size.height, 1)
        cameraNode.setScale(max(horizontalScale, verticalScale))
    }
}

// MARK: - AgentVisualNode with path interpolation

final class AgentVisualNode: SKNode {
    private let aura = SKShapeNode(circleOfRadius: 24)
    private let sprite = SKSpriteNode()
    private let nameLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private var currentSpriteId: String?
    private var walkTextureCache: [SpriteSheetHelper.Direction: [SKTexture]] = [:]
    private let walkActionKey = "walk"
    private static let spriteScale: CGFloat = 0.7

    // Path interpolation state
    private var waypoints: [CGPoint] = []
    private var waypointIndex = 0
    private var moveSpeed: CGFloat = 0  // points per second
    private var isMoving = false
    private var currentDirection: SpriteSheetHelper.Direction = .south
    var isSelfAgent = false

    override init() {
        super.init()

        aura.lineWidth = 3
        aura.fillColor = .clear
        aura.position = .zero

        sprite.setScale(Self.spriteScale)
        sprite.position = CGPoint(x: 0, y: 2)

        nameLabel.fontSize = 10
        nameLabel.fontColor = UIColor(red: 0.18, green: 0.20, blue: 0.18, alpha: 0.9)
        nameLabel.position = CGPoint(x: 0, y: -30)
        nameLabel.verticalAlignmentMode = .center

        addChild(aura)
        addChild(sprite)
        addChild(nameLabel)
    }

    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with agent: WorldAgent) {
        let spriteId = agent.avatar.spriteId

        if spriteId != currentSpriteId {
            currentSpriteId = spriteId
            walkTextureCache.removeAll()
            for dir in [SpriteSheetHelper.Direction.north, .west, .south, .east] {
                walkTextureCache[dir] = SpriteSheetHelper.walkTextures(for: spriteId, direction: dir)
            }
            if let tex = walkTextureCache[.south]?.first {
                sprite.texture = tex
                sprite.texture?.filteringMode = .nearest
                sprite.size = tex.size()
            }
        }

        aura.strokeColor = agent.isSelf
            ? UIColor(red: 0.83, green: 0.69, blue: 0.30, alpha: 0.95)
            : UIColor(hex: agent.avatar.auraColor).withAlphaComponent(0.60)
        aura.fillColor = agent.state == "chatting"
            ? UIColor(hex: agent.avatar.auraColor).withAlphaComponent(0.12)
            : .clear

        nameLabel.text = agent.displayName
        zPosition = agent.isSelf ? 4 : 2
        isSelfAgent = agent.isSelf
    }

    /// Update the path this agent should walk along.
    func setPath(waypoints: [CGPoint], speed: CGFloat, isMoving: Bool) {
        self.moveSpeed = speed
        self.isMoving = isMoving

        if !isMoving || waypoints.isEmpty {
            self.waypoints = []
            self.waypointIndex = 0
            stopWalkAnimation()
            return
        }

        // If we already have waypoints and the new path starts near where we're heading,
        // just update the remaining path without resetting progress
        if !self.waypoints.isEmpty, waypointIndex < self.waypoints.count {
            self.waypoints = waypoints
            self.waypointIndex = 0
        } else {
            self.waypoints = waypoints
            self.waypointIndex = 0
        }
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

        // Update walk direction and animation
        let newDirection = directionFor(dx: dx, dy: dy)
        if newDirection != currentDirection || sprite.action(forKey: walkActionKey) == nil {
            currentDirection = newDirection
            startWalkAnimation(direction: newDirection)
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

    private func directionFor(dx: CGFloat, dy: CGFloat) -> SpriteSheetHelper.Direction {
        if abs(dx) > abs(dy) {
            return dx > 0 ? .east : .west
        } else {
            return dy > 0 ? .north : .south
        }
    }

    private func startWalkAnimation(direction: SpriteSheetHelper.Direction) {
        guard let textures = walkTextureCache[direction], !textures.isEmpty else { return }
        sprite.removeAction(forKey: walkActionKey)
        let timePerFrame = 0.15 // consistent walk animation speed
        let animate = SKAction.animate(with: textures, timePerFrame: timePerFrame)
        sprite.run(SKAction.repeatForever(animate), withKey: walkActionKey)
    }

    private func stopWalkAnimation() {
        sprite.removeAction(forKey: walkActionKey)
        if let tex = walkTextureCache[.south]?.first {
            sprite.texture = tex
        }
    }
}

private struct DebugOverlay: View {
    let events: [DebugEvent]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Debug")
                .font(.caption.bold())
                .foregroundStyle(.white.opacity(0.95))

            ForEach(events.prefix(8)) { event in
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.timestamp.formatted(date: .omitted, time: .standard))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.7))
                    Text(event.message)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.95))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: 240, alignment: .leading)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        }
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
