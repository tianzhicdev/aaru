import Foundation

// MARK: - Soul Mirror — Visible Soul File (V2)

struct CrystallizedMoment: Codable, Equatable {
    let quote: String
    let reflection: String
}

struct SpectrumEntry: Codable, Equatable {
    let position: Double
    let label: String
    let evidence: String
}

struct PersonalitySpectrum: Codable, Equatable {
    var openness: SpectrumEntry?
    var conscientiousness: SpectrumEntry?
    var extraversion: SpectrumEntry?
    var agreeableness: SpectrumEntry?
    var emotionalSensitivity: SpectrumEntry?

    enum CodingKeys: String, CodingKey {
        case openness
        case conscientiousness
        case extraversion
        case agreeableness
        case emotionalSensitivity
    }

    static let empty = PersonalitySpectrum(
        openness: nil,
        conscientiousness: nil,
        extraversion: nil,
        agreeableness: nil,
        emotionalSensitivity: nil
    )

    var hasAnyEntry: Bool {
        openness != nil || conscientiousness != nil || extraversion != nil
        || agreeableness != nil || emotionalSensitivity != nil
    }
}

struct TopValue: Codable, Equatable {
    let value: String
    let description: String
}

struct VisibleSoulFileSections: Codable, Equatable {
    var howYouMove: String
    var howYouThink: String
    var howYouConnect: String
    var whatYouCarry: String
    var whatLightsYouUp: String
    var yourTensions: String
    var yourVoice: String

    enum CodingKeys: String, CodingKey {
        case howYouMove = "howYouMove"
        case howYouThink = "howYouThink"
        case howYouConnect = "howYouConnect"
        case whatYouCarry = "whatYouCarry"
        case whatLightsYouUp = "whatLightsYouUp"
        case yourTensions = "yourTensions"
        case legacyYourContradictions = "yourContradictions"
        case yourVoice = "yourVoice"
    }

    static let empty = VisibleSoulFileSections(
        howYouMove: "", howYouThink: "", howYouConnect: "",
        whatYouCarry: "", whatLightsYouUp: "", yourTensions: "", yourVoice: ""
    )

    init(
        howYouMove: String,
        howYouThink: String,
        howYouConnect: String,
        whatYouCarry: String,
        whatLightsYouUp: String,
        yourTensions: String,
        yourVoice: String
    ) {
        self.howYouMove = howYouMove
        self.howYouThink = howYouThink
        self.howYouConnect = howYouConnect
        self.whatYouCarry = whatYouCarry
        self.whatLightsYouUp = whatLightsYouUp
        self.yourTensions = yourTensions
        self.yourVoice = yourVoice
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        howYouMove = try container.decodeIfPresent(String.self, forKey: .howYouMove) ?? ""
        howYouThink = try container.decodeIfPresent(String.self, forKey: .howYouThink) ?? ""
        howYouConnect = try container.decodeIfPresent(String.self, forKey: .howYouConnect) ?? ""
        whatYouCarry = try container.decodeIfPresent(String.self, forKey: .whatYouCarry) ?? ""
        whatLightsYouUp = try container.decodeIfPresent(String.self, forKey: .whatLightsYouUp) ?? ""
        yourTensions = try container.decodeIfPresent(String.self, forKey: .yourTensions)
            ?? container.decodeIfPresent(String.self, forKey: .legacyYourContradictions)
            ?? ""
        yourVoice = try container.decodeIfPresent(String.self, forKey: .yourVoice) ?? ""
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(howYouMove, forKey: .howYouMove)
        try container.encode(howYouThink, forKey: .howYouThink)
        try container.encode(howYouConnect, forKey: .howYouConnect)
        try container.encode(whatYouCarry, forKey: .whatYouCarry)
        try container.encode(whatLightsYouUp, forKey: .whatLightsYouUp)
        try container.encode(yourTensions, forKey: .yourTensions)
        try container.encode(yourVoice, forKey: .yourVoice)
    }
}

struct VisibleSoulFile: Codable, Equatable {
    var version: Int
    var lastUpdated: String
    var portrait: String?
    var sections: VisibleSoulFileSections
    var crystallizedMoments: [CrystallizedMoment]
    var openThreads: [String]
    var compassScores: [String: Double?]?
    var personalitySpectrum: PersonalitySpectrum?
    var topValues: [TopValue]?
    var relationalStyle: String?
    var completeness: Double

    enum CodingKeys: String, CodingKey {
        case version
        case lastUpdated
        case portrait
        case sections
        case crystallizedMoments
        case openThreads
        case compassScores
        case personalitySpectrum
        case topValues
        case relationalStyle
        case completeness
    }

    static let empty = VisibleSoulFile(
        version: 0,
        lastUpdated: "",
        portrait: nil,
        sections: .empty,
        crystallizedMoments: [],
        openThreads: [],
        compassScores: nil,
        personalitySpectrum: .empty,
        topValues: [],
        relationalStyle: nil,
        completeness: 0
    )

    init(
        version: Int,
        lastUpdated: String,
        portrait: String?,
        sections: VisibleSoulFileSections,
        crystallizedMoments: [CrystallizedMoment],
        openThreads: [String],
        compassScores: [String: Double?]?,
        personalitySpectrum: PersonalitySpectrum?,
        topValues: [TopValue]?,
        relationalStyle: String?,
        completeness: Double = 0
    ) {
        self.version = version
        self.lastUpdated = lastUpdated
        self.portrait = portrait
        self.sections = sections
        self.crystallizedMoments = crystallizedMoments
        self.openThreads = openThreads
        self.compassScores = compassScores
        self.personalitySpectrum = personalitySpectrum
        self.topValues = topValues
        self.relationalStyle = relationalStyle
        self.completeness = completeness
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 0
        lastUpdated = try container.decodeIfPresent(String.self, forKey: .lastUpdated) ?? ""
        portrait = try container.decodeIfPresent(String.self, forKey: .portrait)
        sections = try container.decodeIfPresent(VisibleSoulFileSections.self, forKey: .sections) ?? .empty
        crystallizedMoments = try container.decodeIfPresent([CrystallizedMoment].self, forKey: .crystallizedMoments) ?? []
        openThreads = try container.decodeIfPresent([String].self, forKey: .openThreads) ?? []
        compassScores = try container.decodeIfPresent([String: Double?].self, forKey: .compassScores)
        personalitySpectrum = try container.decodeIfPresent(PersonalitySpectrum.self, forKey: .personalitySpectrum)
        topValues = try container.decodeIfPresent([TopValue].self, forKey: .topValues)
        relationalStyle = try container.decodeIfPresent(String.self, forKey: .relationalStyle)
        completeness = try container.decodeIfPresent(Double.self, forKey: .completeness) ?? 0
    }

    var isEmpty: Bool {
        portrait == nil && crystallizedMoments.isEmpty &&
        sections.howYouMove.isEmpty && sections.howYouThink.isEmpty
        && !(personalitySpectrum?.hasAnyEntry ?? false)
        && (topValues?.isEmpty ?? true)
        && (relationalStyle?.isEmpty ?? true)
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

    init(id: String, role: String, content: String, createdAt: String) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? "assistant"
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }
}

struct SoulBootstrapResponse: Codable {
    let userId: UUID
    let token: String?
    let visibleSoulFile: VisibleSoulFile?
    let hasMessages: Bool
    let language: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case token
        case visibleSoulFile = "visible_soul_file"
        case hasMessages = "has_messages"
        case language
    }

    init(userId: UUID, token: String?, visibleSoulFile: VisibleSoulFile?, hasMessages: Bool, language: String? = nil) {
        self.userId = userId
        self.token = token
        self.visibleSoulFile = visibleSoulFile
        self.hasMessages = hasMessages
        self.language = language
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userId = try container.decode(UUID.self, forKey: .userId)
        token = try container.decodeIfPresent(String.self, forKey: .token)
        visibleSoulFile = try container.decodeIfPresent(VisibleSoulFile.self, forKey: .visibleSoulFile)
        hasMessages = try container.decodeIfPresent(Bool.self, forKey: .hasMessages) ?? false
        language = try container.decodeIfPresent(String.self, forKey: .language)
    }
}

struct UpdateLanguageResponse: Codable {
    let userId: String
    let language: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case language
    }
}

struct SyncMessagesResponse: Codable {
    let messages: [SoulMessagePayload]
}

struct SoulFileResponse: Codable {
    let visibleSoulFile: VisibleSoulFile
    let version: Int
    let lastUpdated: String?
    let synthesisPending: Bool

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case version
        case lastUpdated = "last_updated"
        case synthesisPending = "synthesis_pending"
    }

    init(visibleSoulFile: VisibleSoulFile, version: Int, lastUpdated: String?, synthesisPending: Bool) {
        self.visibleSoulFile = visibleSoulFile
        self.version = version
        self.lastUpdated = lastUpdated
        self.synthesisPending = synthesisPending
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        visibleSoulFile = try container.decodeIfPresent(VisibleSoulFile.self, forKey: .visibleSoulFile) ?? .empty
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 0
        lastUpdated = try container.decodeIfPresent(String.self, forKey: .lastUpdated)
        synthesisPending = try container.decodeIfPresent(Bool.self, forKey: .synthesisPending) ?? false
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

    init(status: String, minVersion: String, message: String?) {
        self.status = status
        self.minVersion = minVersion
        self.message = message
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "ok"
        minVersion = try container.decodeIfPresent(String.self, forKey: .minVersion) ?? "0.0.0"
        message = try container.decodeIfPresent(String.self, forKey: .message)
    }
}

// MARK: - Delete Account

struct DeleteAccountResponse: Codable {
    let deleted: Bool
}

// MARK: - Soulmate

struct SoulmateProfile: Codable, Equatable {
    let userId: String
    let displayName: String?
    let age: Int
    let gender: String
    let latitude: Double
    let longitude: Double
    let preferredAgeMin: Int
    let preferredAgeMax: Int
    let preferredGenders: [String]
    let active: Bool
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
        case age
        case gender
        case latitude
        case longitude
        case preferredAgeMin = "preferred_age_min"
        case preferredAgeMax = "preferred_age_max"
        case preferredGenders = "preferred_genders"
        case active
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct SoulmateProfileResponse: Codable {
    let soulmateProfile: SoulmateProfile?

    enum CodingKeys: String, CodingKey {
        case soulmateProfile = "soulmate_profile"
    }
}

struct SoulmateMatch: Codable, Identifiable, Equatable, Hashable {
    let matchId: String
    let matchedUserId: String
    let displayName: String
    let matchedAt: String
    let reasoning: String?

    var id: String { matchId }

    enum CodingKeys: String, CodingKey {
        case matchId = "match_id"
        case matchedUserId = "matched_user_id"
        case displayName = "display_name"
        case matchedAt = "matched_at"
        case reasoning
    }
}

struct MatchMessage: Codable, Identifiable, Equatable {
    let id: String
    let senderId: String
    let receiverId: String
    let content: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case senderId = "sender_id"
        case receiverId = "receiver_id"
        case content
        case createdAt = "created_at"
    }
}

struct MatchMessagesResponse: Codable {
    let messages: [MatchMessage]
}

struct MatchMessageResponse: Codable {
    let message: MatchMessage
}

struct SoulmateMatchesResponse: Codable {
    let matches: [SoulmateMatch]
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
    let domainCoverage: [DomainCoverageEntry]?
    let currentThreads: [String]
    let avoidPastObservations: [String]
    let avoidPastQuestions: [String]
    let steerToTopics: [String]
    let steeringPressure: String
    let steeringReasoning: String
    let summary: String?

    // Legacy fields preserved as optional so debug builds can still decode older backends.
    let factualAnchors: [String: String]?
    let tensions: [String]?
    let recurringThemes: [String]?
    let notableAbsences: [String]?
    let emotionalArc: String?

    enum CodingKeys: String, CodingKey {
        case updatedAt
        case domainCoverage
        case currentThreads
        case avoidPastObservations
        case avoidPastQuestions
        case steerToTopics
        case steeringPressure
        case steeringReasoning
        case summary
        case factualAnchors
        case tensions
        case recurringThemes
        case notableAbsences
        case emotionalArc
    }
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
    let honestInsights: [String]
}

struct SteeringPreview: Codable {
    let currentThreads: [String]
    let avoidPastObservations: [String]
    let avoidPastQuestions: [String]
    let steerToTopics: [String]
    let steeringPressure: String
    let steeringReasoning: String

    enum CodingKeys: String, CodingKey {
        case currentThreads = "current_threads"
        case avoidPastObservations = "avoid_past_observations"
        case avoidPastQuestions = "avoid_past_questions"
        case steerToTopics = "steer_to_topics"
        case steeringPressure = "steering_pressure"
        case steeringReasoning = "steering_reasoning"
    }
}

struct DebugModelProfileOption: Codable, Equatable, Identifiable {
    let id: String
    let label: String
}

struct SetModelProfileResponse: Codable {
    let userId: String
    let modelProfileId: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case modelProfileId = "model_profile_id"
    }
}

struct DebugInfoResponse: Codable {
    let userId: String
    let deviceId: String
    let modelProfileId: String
    let availableModelProfiles: [DebugModelProfileOption]?
    let hiddenSoulFile: HiddenSoulFile?
    let visibleSoulFile: VisibleSoulFile?
    let reflectionNote: ReflectionNote?
    let steeringPreview: SteeringPreview?
    let steeringSource: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case deviceId = "device_id"
        case modelProfileId = "model_profile_id"
        case availableModelProfiles = "available_model_profiles"
        case hiddenSoulFile = "hidden_soul_file"
        case visibleSoulFile = "visible_soul_file"
        case reflectionNote = "reflection_note"
        case steeringPreview = "steering_preview"
        case steeringSource = "steering_source"
    }
}
#endif
