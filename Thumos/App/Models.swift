import Foundation

// MARK: - Soul Mirror — Visible Soul File (V2)

struct CrystallizedMoment: Codable, Equatable {
    let quote: String
    let reflection: String
}

struct VisibleSoulFileSections: Codable, Equatable {
    var howYouMove: String
    var howYouThink: String
    var howYouConnect: String
    var whatYouCarry: String
    var whatLightsYouUp: String
    var yourContradictions: String
    var yourVoice: String

    enum CodingKeys: String, CodingKey {
        case howYouMove = "howYouMove"
        case howYouThink = "howYouThink"
        case howYouConnect = "howYouConnect"
        case whatYouCarry = "whatYouCarry"
        case whatLightsYouUp = "whatLightsYouUp"
        case yourContradictions = "yourContradictions"
        case yourVoice = "yourVoice"
    }

    static let empty = VisibleSoulFileSections(
        howYouMove: "", howYouThink: "", howYouConnect: "",
        whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: ""
    )
}

struct VisibleSoulFile: Codable, Equatable {
    var version: Int
    var lastUpdated: String
    var portrait: String?
    var sections: VisibleSoulFileSections
    var crystallizedMoments: [CrystallizedMoment]
    var openThreads: [String]
    var compassScores: [String: Double?]?

    enum CodingKeys: String, CodingKey {
        case version
        case lastUpdated
        case portrait
        case sections
        case crystallizedMoments
        case openThreads
        case compassScores
    }

    static let empty = VisibleSoulFile(
        version: 0,
        lastUpdated: "",
        portrait: nil,
        sections: .empty,
        crystallizedMoments: [],
        openThreads: [],
        compassScores: nil
    )

    var isEmpty: Bool {
        portrait == nil && crystallizedMoments.isEmpty &&
        sections.howYouMove.isEmpty && sections.howYouThink.isEmpty
    }
}

// MARK: - Soul Messages

struct SoulMessagePayload: Codable, Equatable {
    let id: String
    let role: String
    let content: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case content
        case createdAt = "created_at"
    }
}

struct SoulBootstrapResponse: Codable {
    let userId: UUID
    let token: String?
    let visibleSoulFile: VisibleSoulFile?
    let hasMessages: Bool?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case token
        case visibleSoulFile = "visible_soul_file"
        case hasMessages = "has_messages"
    }
}

struct SyncMessagesResponse: Codable {
    let messages: [SoulMessagePayload]
}

struct SoulFileResponse: Codable {
    let visibleSoulFile: VisibleSoulFile
    let version: Int
    let lastUpdated: String?
    let synthesisPending: Bool?

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case version
        case lastUpdated = "last_updated"
        case synthesisPending = "synthesis_pending"
    }
}

struct SoulMessage: Identifiable, Equatable {
    let id: String
    let role: String  // "user", "assistant", "system"
    let content: String
    let createdAt: String?
    var isError: Bool = false
}

// MARK: - Version Check

struct VersionCheckResponse: Codable {
    let status: String  // "ok" or "unsupported"
    let minVersion: String
    let message: String?

    enum CodingKeys: String, CodingKey {
        case status
        case minVersion = "min_version"
        case message
    }
}

// MARK: - Delete Account

struct DeleteAccountResponse: Codable {
    let deleted: Bool
}

// MARK: - Debug (stripped from Release builds)

#if DEBUG
struct DomainCoverageEntry: Codable {
    let domain: String
    let depth: String
    let evidence: String
}

struct ReflectionNote: Codable {
    let updatedAt: String
    let factualAnchors: [String: String]
    let tensions: [String]
    let recurringThemes: [String]
    let notableAbsences: [String]
    let emotionalArc: String
    let domainCoverage: [DomainCoverageEntry]
    let recentAssistantQuestions: [String]
    let openLoops: [String]
}

struct CoreDriver: Codable {
    let driver: String
    let strength: Double
    let inferred: Bool
    let evidence: String
}

struct VoiceExample: Codable {
    let trigger: String
    let response: String
}

struct VoiceProfile: Codable {
    let register: String
    let density: String
    let humorStyle: String
    let conflictStyle: String
    let disclosureRate: String
    let signaturePatterns: [String]
    let voiceExamples: [VoiceExample]
}

struct DepthMap: Codable {
    let safeEntryPoints: [String]
    let unlockTopics: [String]
    let avoidEarly: [String]
    let currentlyLiveTopics: [String]
    let domainCoverage: [DomainCoverageEntry]
}

struct ExpertReflections: Codable {
    let psychologist: [String]
    let sociologist: [String]
    let linguist: [String]
    let narrativeAnalyst: [String]
}

struct HiddenSoulFile: Codable {
    let version: Int
    let lastUpdated: String
    let confidence: String
    let expertReflections: ExpertReflections
    let coreDrivers: [CoreDriver]
    let coreValues: [String]
    let voice: VoiceProfile
    let depthMap: DepthMap
    let analystNotes: [String]
}

struct SteeringPreview: Codable {
    let domainCoverage: [DomainCoverageEntry]
    let safeEntryPoints: [String]
    let unlockTopics: [String]
    let avoidEarly: [String]
    let currentlyLiveTopics: [String]
}

struct DebugInfoResponse: Codable {
    let userId: String
    let deviceId: String
    let hiddenSoulFile: HiddenSoulFile?
    let visibleSoulFile: VisibleSoulFile?
    let reflectionNote: ReflectionNote?
    let steeringPreview: SteeringPreview?
    let steeringSource: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case deviceId = "device_id"
        case hiddenSoulFile = "hidden_soul_file"
        case visibleSoulFile = "visible_soul_file"
        case reflectionNote = "reflection_note"
        case steeringPreview = "steering_preview"
        case steeringSource = "steering_source"
    }
}
#endif
