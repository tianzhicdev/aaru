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

    enum CodingKeys: String, CodingKey {
        case version
        case lastUpdated
        case portrait
        case sections
        case crystallizedMoments
        case openThreads
    }

    static let empty = VisibleSoulFile(
        version: 0,
        lastUpdated: "",
        portrait: nil,
        sections: .empty,
        crystallizedMoments: [],
        openThreads: []
    )

    var isEmpty: Bool {
        portrait == nil && crystallizedMoments.isEmpty &&
        sections.howYouMove.isEmpty && sections.howYouThink.isEmpty
    }
}

// MARK: - Soul Session

struct SoulSessionInfo: Codable, Equatable {
    let id: UUID
    let sessionNumber: Int
    let exchangeCount: Int
    let status: String

    enum CodingKeys: String, CodingKey {
        case id
        case sessionNumber = "session_number"
        case exchangeCount = "exchange_count"
        case status
    }
}

struct SoulMessagePayload: Codable, Equatable {
    let role: String
    let content: String
}

struct SoulBootstrapResponse: Codable {
    let userId: UUID
    let token: String?
    let visibleSoulFile: VisibleSoulFile?
    let activeSession: SoulSessionInfo?
    let messages: [SoulMessagePayload]?
    let canStartSession: Bool
    let cooldownRemainingMs: Int
    let nextSessionNumber: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case token
        case visibleSoulFile = "visible_soul_file"
        case activeSession = "active_session"
        case messages
        case canStartSession = "can_start_session"
        case cooldownRemainingMs = "cooldown_remaining_ms"
        case nextSessionNumber = "next_session_number"
    }
}

struct SoulFileResponse: Codable {
    let visibleSoulFile: VisibleSoulFile
    let version: Int
    let lastUpdated: String?

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case version
        case lastUpdated = "last_updated"
    }
}

struct EndSoulSessionResponse: Codable {
    let visibleSoulFile: VisibleSoulFile
    let sessionCompleted: Bool
    let synthesisSucceeded: Bool

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case sessionCompleted = "session_completed"
        case synthesisSucceeded = "synthesis_succeeded"
    }
}

struct SynthesizeSoulFileResponse: Codable {
    let visibleSoulFile: VisibleSoulFile
    let synthesisSucceeded: Bool

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case synthesisSucceeded = "synthesis_succeeded"
    }
}

struct SoulMessage: Identifiable, Equatable {
    let id: UUID
    let role: String  // "user", "assistant", "system"
    let content: String
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

struct DebugSessionInfo: Codable {
    let id: String
    let sessionNumber: Int
    let status: String
    let exchangeCount: Int
    let startedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case sessionNumber = "session_number"
        case status
        case exchangeCount = "exchange_count"
        case startedAt = "started_at"
    }
}

struct DebugInfoResponse: Codable {
    let userId: String
    let deviceId: String
    let hiddenSoulFile: HiddenSoulFile?
    let visibleSoulFile: VisibleSoulFile?
    let activeSession: DebugSessionInfo?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case deviceId = "device_id"
        case hiddenSoulFile = "hidden_soul_file"
        case visibleSoulFile = "visible_soul_file"
        case activeSession = "active_session"
    }
}
#endif

