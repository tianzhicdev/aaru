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
