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
    var personalitySpectrum: PersonalitySpectrum?
    var topValues: [TopValue]?
    var relationalStyle: String?

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
        relationalStyle: nil
    )

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
    let inferredBigFive: ReflectionInferredBigFive
    let attachmentSignals: [AttachmentSignal]
    let valueSignals: [ValueSignal]
    let moralFoundationSignals: [MoralFoundationSignal]
    let conflictStyle: String
    let meaningOrientation: String
}

struct ReflectionTraitEstimate: Codable {
    let score: Double
    let confidence: String
    let evidence: String
}

struct ReflectionInferredBigFive: Codable {
    let openness: ReflectionTraitEstimate?
    let conscientiousness: ReflectionTraitEstimate?
    let extraversion: ReflectionTraitEstimate?
    let agreeableness: ReflectionTraitEstimate?
    let neuroticism: ReflectionTraitEstimate?
}

struct AttachmentSignal: Codable {
    let dimension: String
    let signal: String
    let strength: String
}

struct ValueSignal: Codable {
    let value: String
    let evidence: String
    let direction: String
}

struct MoralFoundationSignal: Codable {
    let foundation: String
    let signal: String
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
    let bigFiveScores: HiddenBigFiveScores
    let schwartzProfile: [SchwartzValueProfileEntry]
    let attachmentScores: HiddenAttachmentScores
    let moralFoundations: HiddenMoralFoundations
    let meaningOrientation: String?
}

struct HiddenTraitScore: Codable {
    let score: Double
    let confidence: Double
    let evidence: String
}

struct HiddenBigFiveScores: Codable {
    let openness: HiddenTraitScore?
    let conscientiousness: HiddenTraitScore?
    let extraversion: HiddenTraitScore?
    let agreeableness: HiddenTraitScore?
    let neuroticism: HiddenTraitScore?
}

struct SchwartzValueProfileEntry: Codable {
    let value: String
    let priority: Int
    let evidence: String
}

struct HiddenAttachmentScores: Codable {
    let anxiety: Double?
    let avoidance: Double?
    let style: String?
    let evidence: String
}

struct HiddenMoralFoundations: Codable {
    let care: Double?
    let fairness: Double?
    let loyalty: Double?
    let authority: Double?
    let purity: Double?
}

struct SteeringPreview: Codable {
    let domainCoverage: [DomainCoverageEntry]
    let safeEntryPoints: [String]
    let unlockTopics: [String]
    let avoidEarly: [String]
    let currentlyLiveTopics: [String]
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
