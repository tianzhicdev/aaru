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

// MARK: - Soul Mirror — Legacy Soul File (V1, kept for backward compat)

struct SoulFileTension: Codable, Equatable {
    let left: String
    let right: String

    enum CodingKeys: String, CodingKey {
        case left
        case right
    }
}

struct SoulFileEvolution: Codable, Equatable {
    let session: Int
    let insight: String
    let date: String

    enum CodingKeys: String, CodingKey {
        case session
        case insight
        case date
    }
}

struct LegacySoulFile: Codable, Equatable {
    var essence: String?
    var tensions: [SoulFileTension]
    var comesAlive: String?
    var runningFrom: String?
    var yourWords: [String]
    var evolution: [SoulFileEvolution]
    var sessionCount: Int

    enum CodingKeys: String, CodingKey {
        case essence
        case tensions
        case comesAlive = "comes_alive"
        case runningFrom = "running_from"
        case yourWords = "your_words"
        case evolution
        case sessionCount = "session_count"
    }

    static let empty = LegacySoulFile(
        essence: nil,
        tensions: [],
        comesAlive: nil,
        runningFrom: nil,
        yourWords: [],
        evolution: [],
        sessionCount: 0
    )
}

typealias SoulFile = LegacySoulFile

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

struct SoulMessagePayload: Codable {
    let role: String
    let content: String
}

struct SoulBootstrapResponse: Codable {
    let userId: UUID
    let token: String?
    let soulFile: LegacySoulFile?
    let visibleSoulFile: VisibleSoulFile?
    let activeSession: SoulSessionInfo?
    let messages: [SoulMessagePayload]?
    let canStartSession: Bool
    let cooldownRemainingMs: Int
    let nextSessionNumber: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case token
        case soulFile = "soul_file"
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
    let soulFile: LegacySoulFile
    let version: Int
    let lastUpdated: String?
    let sessionCount: Int
    let cooldownActive: Bool
    let cooldownRemainingMs: Int
    let nextAvailableAt: String?

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case soulFile = "soul_file"
        case version
        case lastUpdated = "last_updated"
        case sessionCount = "session_count"
        case cooldownActive = "cooldown_active"
        case cooldownRemainingMs = "cooldown_remaining_ms"
        case nextAvailableAt = "next_available_at"
    }
}

struct SoulMessage: Identifiable, Equatable {
    let id: UUID
    let role: String  // "user", "assistant", "system"
    let content: String
    var isError: Bool = false
}

struct BootstrapPayload: Codable {
    let userID: UUID
    let deviceID: String
    let session: DeviceSession

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case deviceID = "device_id"
        case session
    }
}

struct DeviceSession: Codable {
    let token: String
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case token
        case expiresAt = "expires_at"
    }
}
