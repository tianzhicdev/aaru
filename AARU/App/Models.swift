import Foundation

struct SoulValues: Codable, Equatable {
    var selfTranscendence: Double
    var selfEnhancement: Double
    var opennessToChange: Double
    var conservation: Double
    var expressed: [String]

    enum CodingKeys: String, CodingKey {
        case selfTranscendence = "self_transcendence"
        case selfEnhancement = "self_enhancement"
        case opennessToChange = "openness_to_change"
        case conservation
        case expressed
    }
}

struct SoulNarrative: Codable, Equatable {
    var formativeStories: [String]
    var selfDefiningMemories: [String]
    var narrativeThemes: [String]

    enum CodingKeys: String, CodingKey {
        case formativeStories = "formative_stories"
        case selfDefiningMemories = "self_defining_memories"
        case narrativeThemes = "narrative_themes"
    }
}

struct SoulProfile: Codable, Equatable {
    var personality: String
    var interests: [String]
    var values: SoulValues
    var narrative: SoulNarrative
    var avoidTopics: [String]
    var rawInput: String
    var guessedFields: [String]

    enum CodingKeys: String, CodingKey {
        case personality
        case interests
        case values
        case narrative
        case avoidTopics = "avoid_topics"
        case rawInput = "raw_input"
        case guessedFields = "guessed_fields"
    }
}

struct AvatarConfig: Codable, Equatable {
    var spriteId: String
    var bodyShape: String
    var skinTone: String
    var hairStyle: String
    var hairColor: String
    var eyes: String
    var outfitTop: String
    var outfitBottom: String
    var accessory: String?
    var auraColor: String

    enum CodingKeys: String, CodingKey {
        case spriteId = "sprite_id"
        case bodyShape = "body_shape"
        case skinTone = "skin_tone"
        case hairStyle = "hair_style"
        case hairColor = "hair_color"
        case eyes
        case outfitTop = "outfit_top"
        case outfitBottom = "outfit_bottom"
        case accessory
        case auraColor = "aura_color"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        spriteId = (try? container.decode(String.self, forKey: .spriteId)) ?? AvatarSprites.all.randomElement()!
        bodyShape = try container.decode(String.self, forKey: .bodyShape)
        skinTone = try container.decode(String.self, forKey: .skinTone)
        hairStyle = try container.decode(String.self, forKey: .hairStyle)
        hairColor = try container.decode(String.self, forKey: .hairColor)
        eyes = try container.decode(String.self, forKey: .eyes)
        outfitTop = try container.decode(String.self, forKey: .outfitTop)
        outfitBottom = try container.decode(String.self, forKey: .outfitBottom)
        accessory = try container.decodeIfPresent(String.self, forKey: .accessory)
        auraColor = try container.decode(String.self, forKey: .auraColor)
    }

    init(
        spriteId: String = "human_shorthair_light_default",
        bodyShape: String = "slender",
        skinTone: String = "amber",
        hairStyle: String = "wave",
        hairColor: String = "black",
        eyes: String = "focused",
        outfitTop: String = "linen",
        outfitBottom: String = "sand",
        accessory: String? = nil,
        auraColor: String = "#d4af37"
    ) {
        self.spriteId = spriteId
        self.bodyShape = bodyShape
        self.skinTone = skinTone
        self.hairStyle = hairStyle
        self.hairColor = hairColor
        self.eyes = eyes
        self.outfitTop = outfitTop
        self.outfitBottom = outfitBottom
        self.accessory = accessory
        self.auraColor = auraColor
    }

    static let `default` = AvatarConfig(
        spriteId: "human_shorthair",
        bodyShape: "slender",
        skinTone: "amber",
        hairStyle: "wave",
        hairColor: "black",
        eyes: "focused",
        outfitTop: "linen",
        outfitBottom: "sand",
        accessory: nil,
        auraColor: "#d4af37"
    )
}

enum AvatarSprites {
    static let hairStyles = ["bowlhair", "curlyhair", "longhair", "mophair", "shorthair", "spikeyhair"]
    static let skinTones = ["light", "medium", "dark"]
    static let hairColors = ["default", "blonde", "ginger", "black", "white"]

    static let all: [String] = {
        var ids: [String] = []
        for hair in hairStyles {
            for skin in skinTones {
                for color in hairColors {
                    ids.append("human_\(hair)_\(skin)_\(color)")
                }
            }
        }
        ids.append(contentsOf: ["goblin", "skeleton"])
        return ids
    }()
}

struct CellCoord: Codable, Equatable {
    let x: Int
    let y: Int
}

struct WorldAgent: Codable, Equatable, Identifiable {
    let id: UUID
    var x: Double
    var y: Double
    var targetX: Double
    var targetY: Double
    var cellX: Int?
    var cellY: Int?
    var path: [CellCoord]
    var moveSpeed: Double
    var state: String
    var behavior: String?
    var behaviorTicksRemaining: Int?
    var heading: Int?
    var activeMessage: String?
    var conversationID: UUID?
    var displayName: String
    var avatar: AvatarConfig
    var isSelf: Bool

    enum CodingKeys: String, CodingKey {
        case id = "user_id"
        case x
        case y
        case targetX = "target_x"
        case targetY = "target_y"
        case cellX = "cell_x"
        case cellY = "cell_y"
        case path
        case moveSpeed = "move_speed"
        case state
        case behavior
        case behaviorTicksRemaining = "behavior_ticks_remaining"
        case heading
        case activeMessage = "active_message"
        case conversationID = "conversation_id"
        case displayName = "display_name"
        case avatar
        case isSelf = "is_self"
    }
}

struct WorldConfig: Codable, Equatable {
    let gridColumns: Int
    let gridRows: Int
    let worldTickMs: Int
    let moveAnimationMs: Int
    let bubbleReadingWPS: Double
    let conversationSpeakingWPS: Double
    let conversationTurnGapMs: Int
    let minBubbleDisplayMs: Int
    let minReplyDelayMs: Int
    let cameraVisibleColumns: Int
    let cameraVisibleRows: Int
    let agentMoveSpeed: Double

    enum CodingKeys: String, CodingKey {
        case gridColumns = "grid_columns"
        case gridRows = "grid_rows"
        case worldTickMs = "world_tick_ms"
        case moveAnimationMs = "move_animation_ms"
        case bubbleReadingWPS = "bubble_reading_wps"
        case conversationSpeakingWPS = "conversation_speaking_wps"
        case conversationTurnGapMs = "conversation_turn_gap_ms"
        case minBubbleDisplayMs = "min_bubble_display_ms"
        case minReplyDelayMs = "min_reply_delay_ms"
        case cameraVisibleColumns = "camera_visible_columns"
        case cameraVisibleRows = "camera_visible_rows"
        case agentMoveSpeed = "agent_move_speed"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        gridColumns = try container.decode(Int.self, forKey: .gridColumns)
        gridRows = try container.decode(Int.self, forKey: .gridRows)
        worldTickMs = try container.decode(Int.self, forKey: .worldTickMs)
        moveAnimationMs = try container.decode(Int.self, forKey: .moveAnimationMs)
        bubbleReadingWPS = try container.decode(Double.self, forKey: .bubbleReadingWPS)
        conversationSpeakingWPS = try container.decode(Double.self, forKey: .conversationSpeakingWPS)
        conversationTurnGapMs = try container.decode(Int.self, forKey: .conversationTurnGapMs)
        minBubbleDisplayMs = try container.decode(Int.self, forKey: .minBubbleDisplayMs)
        minReplyDelayMs = try container.decode(Int.self, forKey: .minReplyDelayMs)
        cameraVisibleColumns = try container.decode(Int.self, forKey: .cameraVisibleColumns)
        cameraVisibleRows = try container.decode(Int.self, forKey: .cameraVisibleRows)
        agentMoveSpeed = (try? container.decode(Double.self, forKey: .agentMoveSpeed)) ?? 1.8
    }

    init(gridColumns: Int, gridRows: Int, worldTickMs: Int, moveAnimationMs: Int,
         bubbleReadingWPS: Double, conversationSpeakingWPS: Double,
         conversationTurnGapMs: Int, minBubbleDisplayMs: Int, minReplyDelayMs: Int,
         cameraVisibleColumns: Int, cameraVisibleRows: Int, agentMoveSpeed: Double = 1.8) {
        self.gridColumns = gridColumns
        self.gridRows = gridRows
        self.worldTickMs = worldTickMs
        self.moveAnimationMs = moveAnimationMs
        self.bubbleReadingWPS = bubbleReadingWPS
        self.conversationSpeakingWPS = conversationSpeakingWPS
        self.conversationTurnGapMs = conversationTurnGapMs
        self.minBubbleDisplayMs = minBubbleDisplayMs
        self.minReplyDelayMs = minReplyDelayMs
        self.cameraVisibleColumns = cameraVisibleColumns
        self.cameraVisibleRows = cameraVisibleRows
        self.agentMoveSpeed = agentMoveSpeed
    }

    static let `default` = WorldConfig(
        gridColumns: 64,
        gridRows: 64,
        worldTickMs: 1_000,
        moveAnimationMs: 900,
        bubbleReadingWPS: 4,
        conversationSpeakingWPS: 2.7,
        conversationTurnGapMs: 300,
        minBubbleDisplayMs: 1_500,
        minReplyDelayMs: 2_000,
        cameraVisibleColumns: 7,
        cameraVisibleRows: 9,
        agentMoveSpeed: 1.8
    )
}

struct WorldMovementEvent: Codable, Equatable {
    let userID: UUID
    let fromCellX: Int
    let fromCellY: Int
    let toCellX: Int
    let toCellY: Int

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case fromCellX = "from_cell_x"
        case fromCellY = "from_cell_y"
        case toCellX = "to_cell_x"
        case toCellY = "to_cell_y"
    }
}

struct RealtimeAgentPosition: Decodable, Equatable {
    let userID: UUID
    let x: Double
    let y: Double
    let targetX: Double
    let targetY: Double
    let cellX: Int?
    let cellY: Int?
    let path: [CellCoord]
    let moveSpeed: Double
    let state: String
    let activeMessage: String?
    let conversationID: UUID?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case x
        case y
        case targetX = "target_x"
        case targetY = "target_y"
        case cellX = "cell_x"
        case cellY = "cell_y"
        case path
        case moveSpeed = "move_speed"
        case state
        case activeMessage = "active_message"
        case conversationID = "conversation_id"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userID = try container.decode(UUID.self, forKey: .userID)
        x = try container.decode(Double.self, forKey: .x)
        y = try container.decode(Double.self, forKey: .y)
        targetX = try container.decode(Double.self, forKey: .targetX)
        targetY = try container.decode(Double.self, forKey: .targetY)
        cellX = try container.decodeIfPresent(Int.self, forKey: .cellX)
        cellY = try container.decodeIfPresent(Int.self, forKey: .cellY)
        path = (try? container.decode([CellCoord].self, forKey: .path)) ?? []
        moveSpeed = (try? container.decode(Double.self, forKey: .moveSpeed)) ?? 1.8
        state = try container.decode(String.self, forKey: .state)
        activeMessage = try container.decodeIfPresent(String.self, forKey: .activeMessage)
        conversationID = try container.decodeIfPresent(UUID.self, forKey: .conversationID)
    }
}

enum AARUConstants {
    static let impressionUnlockThreshold = 72
}

struct BaMessage: Identifiable, Equatable {
    let id: UUID
    let senderName: String
    let content: String
}

struct ConversationPreview: Identifiable, Equatable {
    let id: UUID
    let title: String
    var impressionScore: Int
    var impressionSummary: String
    var theirImpressionScore: Int
    var theirImpressionSummary: String
    var status: String
    var baUnlocked: Bool
    var baConversationID: UUID?
    var baMessageCount: Int
}

struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let senderName: String
    let type: String
    let content: String
}

struct ConversationDetail: Equatable {
    let id: UUID
    let title: String
    let impressionScore: Int
    let impressionSummary: String
    let theirImpressionScore: Int
    let theirImpressionSummary: String
    let status: String
    let baUnlocked: Bool
    let otherSoul: SoulProfile?
    let messages: [ChatMessage]
    let baConversationID: UUID?
    let baMessages: [BaMessage]
}

struct BootstrapPayload: Codable, Equatable {
    let userID: UUID
    let deviceID: String
    let displayName: String
    let instanceID: UUID
    let soulProfile: SoulProfile?
    let avatar: AvatarConfig
    let conversations: [ConversationPreviewPayload]
    let world: WorldSnapshot

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case deviceID = "device_id"
        case displayName = "display_name"
        case instanceID = "instance_id"
        case soulProfile = "soul_profile"
        case avatar
        case conversations
        case world
    }
}

struct ConversationPreviewPayload: Codable, Equatable {
    let id: UUID
    let title: String
    let impressionScore: Int
    let impressionSummary: String
    let theirImpressionScore: Int
    let theirImpressionSummary: String
    let status: String
    let baUnlocked: Bool
    let baConversationID: UUID?
    let baMessageCount: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case impressionScore = "impression_score"
        case impressionSummary = "impression_summary"
        case theirImpressionScore = "their_impression_score"
        case theirImpressionSummary = "their_impression_summary"
        case status
        case baUnlocked = "ba_unlocked"
        case baConversationID = "ba_conversation_id"
        case baMessageCount = "ba_message_count"
    }
}

struct WorldSnapshot: Codable, Equatable {
    let count: Int
    let config: WorldConfig
    let movementEvents: [WorldMovementEvent]
    let agents: [WorldAgent]

    enum CodingKeys: String, CodingKey {
        case count
        case config
        case movementEvents = "movement_events"
        case agents
    }
}

struct DebugEvent: Identifiable, Equatable {
    let id = UUID()
    let timestamp: Date
    let message: String
}

enum OnboardingStep: Equatable {
    case soul
    case avatar
}

enum AppStage: Equatable {
    case launching
    case onboarding(OnboardingStep)
    case world
}
