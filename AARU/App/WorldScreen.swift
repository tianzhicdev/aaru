import SpriteKit
import SwiftUI

struct WorldScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var scene = WorldScene(size: CGSize(width: 1000, height: 1400))

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
                Text("👥 \(model.worldCount)/100")
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
        }
        .padding(20)
        .task {
            scene.scaleMode = .aspectFill
            await model.refreshWorld()
            scene.updateAgents(model.worldAgents, events: model.worldMovementEvents)
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(1200))
                await model.refreshWorld()
            }
        }
        .onChange(of: model.worldAgents) { _, agents in
            scene.updateAgents(agents, events: model.worldMovementEvents)
        }
        .onChange(of: model.worldMovementEvents) { _, events in
            scene.updateAgents(model.worldAgents, events: events)
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

final class WorldScene: SKScene {
    private let worldSize = CGSize(width: 1000, height: 1400)
    private let mapNode = SKNode()
    private var agentNodes: [UUID: AgentVisualNode] = [:]
    private let conversationLayer = SKNode()
    private let cameraNode = SKCameraNode()
    private let columns = 10
    private let rows = 14

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
            cameraNode.setScale(1.75)
        }
    }

    func updateAgents(_ agents: [WorldAgent], events: [WorldMovementEvent]) {
        if mapNode.parent == nil {
            addChild(mapNode)
            buildBackdrop()
        }
        if cameraNode.parent == nil {
            addChild(cameraNode)
            camera = cameraNode
            cameraNode.setScale(1.75)
        }

        let movementByUserID = Dictionary(uniqueKeysWithValues: events.map { ($0.userID, $0) })

        let visible = Set(agents.map(\.id))
        for id in agentNodes.keys where !visible.contains(id) {
            agentNodes[id]?.removeFromParent()
            agentNodes.removeValue(forKey: id)
        }

        for agent in agents {
            let node = agentNodes[agent.id] ?? makeAgentNode(id: agent.id)
            let position = CGPoint(x: agent.x * worldSize.width, y: agent.y * worldSize.height)
            if let event = movementByUserID[agent.id] {
                let fromPosition = CGPoint(
                    x: (CGFloat(event.fromCellX) + 0.5) / CGFloat(columns) * worldSize.width,
                    y: (CGFloat(event.fromCellY) + 0.5) / CGFloat(rows) * worldSize.height
                )
                if node.position == .zero {
                    node.position = fromPosition
                }
                node.removeAllActions()
                node.run(SKAction.move(to: position, duration: 0.85))
            } else {
                node.run(SKAction.move(to: position, duration: 0.25))
            }
            node.configure(with: agent)

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
        recenterCamera(on: agents.first(where: \.isSelf))
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

    private func recenterCamera(on agent: WorldAgent?) {
        guard let agent else { return }
        let target = CGPoint(x: agent.x * worldSize.width, y: agent.y * worldSize.height)
        cameraNode.removeAllActions()
        cameraNode.run(SKAction.move(to: target, duration: 0.18))
    }
}

final class AgentVisualNode: SKNode {
    private let aura = SKShapeNode(circleOfRadius: 20)
    private var body = SKShapeNode(rectOf: CGSize(width: 22, height: 28), cornerRadius: 8)
    private let head = SKShapeNode(circleOfRadius: 11)
    private var hair = SKShapeNode(rectOf: CGSize(width: 24, height: 10), cornerRadius: 4)
    private let accessory = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let nameLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")

    override init() {
        super.init()

        aura.lineWidth = 3
        aura.fillColor = .clear

        body.strokeColor = .clear
        body.position = CGPoint(x: 0, y: -6)

        head.strokeColor = .clear
        head.position = CGPoint(x: 0, y: 14)

        hair.strokeColor = .clear
        hair.position = CGPoint(x: 0, y: 21)

        let leftEye = SKShapeNode(circleOfRadius: 1.4)
        leftEye.fillColor = .black
        leftEye.strokeColor = .clear
        leftEye.position = CGPoint(x: -4, y: 14)

        let rightEye = SKShapeNode(circleOfRadius: 1.4)
        rightEye.fillColor = .black
        rightEye.strokeColor = .clear
        rightEye.position = CGPoint(x: 4, y: 14)

        accessory.fontSize = 10
        accessory.position = CGPoint(x: 13, y: 12)
        nameLabel.fontSize = 10
        nameLabel.fontColor = UIColor(red: 0.18, green: 0.20, blue: 0.18, alpha: 0.9)
        nameLabel.position = CGPoint(x: 0, y: -30)
        nameLabel.verticalAlignmentMode = .center

        addChild(aura)
        addChild(body)
        addChild(head)
        addChild(hair)
        addChild(leftEye)
        addChild(rightEye)
        addChild(accessory)
        addChild(nameLabel)
    }

    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with agent: WorldAgent) {
        body.removeFromParent()
        hair.removeFromParent()
        body = bodyNode(for: agent.avatar.bodyShape)
        hair = hairNode(for: agent.avatar.hairStyle)
        addChild(body)
        addChild(hair)

        aura.strokeColor = agent.isSelf
            ? UIColor(red: 0.83, green: 0.69, blue: 0.30, alpha: 0.95)
            : UIColor(hex: agent.avatar.auraColor).withAlphaComponent(0.60)
        aura.fillColor = agent.state == "chatting"
            ? UIColor(hex: agent.avatar.auraColor).withAlphaComponent(0.12)
            : .clear
        head.fillColor = UIColor(token: agent.avatar.skinTone)
        body.fillColor = UIColor(token: agent.avatar.outfitTop)
        hair.fillColor = UIColor(token: agent.avatar.hairColor)
        accessory.fontColor = .white
        accessory.text = agent.avatar.accessory.map { String($0.prefix(1)).uppercased() } ?? ""
        nameLabel.text = agent.displayName
        zPosition = agent.isSelf ? 4 : 2
    }

    private func bodyNode(for bodyShape: String) -> SKShapeNode {
        let size: CGSize
        switch bodyShape {
        case "athletic":
            size = CGSize(width: 26, height: 30)
        case "soft":
            size = CGSize(width: 28, height: 29)
        default:
            size = CGSize(width: 22, height: 28)
        }
        let node = SKShapeNode(rectOf: size, cornerRadius: 8)
        node.strokeColor = .clear
        node.position = CGPoint(x: 0, y: -6)
        return node
    }

    private func hairNode(for hairStyle: String) -> SKShapeNode {
        let node: SKShapeNode
        switch hairStyle {
        case "buzz":
            node = SKShapeNode(rectOf: CGSize(width: 18, height: 6), cornerRadius: 3)
            node.position = CGPoint(x: 0, y: 22)
        case "braid":
            node = SKShapeNode(rectOf: CGSize(width: 16, height: 14), cornerRadius: 5)
            node.position = CGPoint(x: 0, y: 20)
        case "curl":
            node = SKShapeNode(circleOfRadius: 9)
            node.position = CGPoint(x: 0, y: 21)
        default:
            node = SKShapeNode(rectOf: CGSize(width: 24, height: 10), cornerRadius: 4)
            node.position = CGPoint(x: 0, y: 21)
        }
        node.strokeColor = .clear
        return node
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

    convenience init(token: String) {
        switch token {
        case "linen": self.init(red: 0.90, green: 0.87, blue: 0.77, alpha: 1)
        case "indigo": self.init(red: 0.20, green: 0.24, blue: 0.45, alpha: 1)
        case "ochre": self.init(red: 0.78, green: 0.58, blue: 0.24, alpha: 1)
        case "sage": self.init(red: 0.48, green: 0.61, blue: 0.49, alpha: 1)
        case "sand": self.init(red: 0.79, green: 0.70, blue: 0.52, alpha: 1)
        case "night": self.init(red: 0.13, green: 0.17, blue: 0.28, alpha: 1)
        case "stone": self.init(red: 0.63, green: 0.63, blue: 0.60, alpha: 1)
        case "terracotta": self.init(red: 0.68, green: 0.38, blue: 0.28, alpha: 1)
        case "amber": self.init(red: 0.79, green: 0.62, blue: 0.42, alpha: 1)
        case "olive": self.init(red: 0.66, green: 0.55, blue: 0.38, alpha: 1)
        case "ebony": self.init(red: 0.34, green: 0.24, blue: 0.18, alpha: 1)
        case "rose": self.init(red: 0.90, green: 0.74, blue: 0.70, alpha: 1)
        case "brown": self.init(red: 0.32, green: 0.22, blue: 0.14, alpha: 1)
        case "copper": self.init(red: 0.67, green: 0.37, blue: 0.21, alpha: 1)
        case "silver": self.init(red: 0.77, green: 0.78, blue: 0.82, alpha: 1)
        default: self.init(white: 0.15, alpha: 1)
        }
    }
}
