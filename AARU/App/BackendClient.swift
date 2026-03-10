import Foundation
import OSLog

struct BackendConfiguration {
    var functionBaseURL: URL? = nil
    var supabaseURL: URL? = nil
    var supabaseAnonKey: String? = nil

    static let `default` = BackendConfiguration(
        functionBaseURL: URL(string: "https://uuggqsywcpqmbqzwxdga.supabase.co/functions/v1/"),
        supabaseURL: URL(string: "https://uuggqsywcpqmbqzwxdga.supabase.co"),
        supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk3NjIsImV4cCI6MjA4ODY2NTc2Mn0.zRFOTxQiwF7NJXhKTsnU0G1Zv9E8l_zByb8EZ04OWJ0"
    )
}

enum BackendError: Error, LocalizedError {
    case missingBaseURL
    case invalidResponse(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .missingBaseURL:
            return "Backend base URL is not configured."
        case let .invalidResponse(statusCode, message):
            return message.isEmpty
                ? "The backend failed with status \(statusCode)."
                : "The backend failed with status \(statusCode): \(message)"
        }
    }
}

final class BackendClient {
    private let logger = Logger(subsystem: "com.tianzhichen.aaru", category: "backend")
    private let configuration: BackendConfiguration
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    var sessionToken: String?

    init(
        configuration: BackendConfiguration = .default,
        session: URLSession = .shared
    ) {
        self.configuration = configuration
        self.session = session
        decoder.dateDecodingStrategy = .iso8601
    }

    func bootstrap(deviceID: String) async throws -> BootstrapPayload {
        guard endpoint(named: "bootstrap-user") != nil else {
            return BootstrapPayload(
                userID: UUID(),
                deviceID: deviceID,
                displayName: "Soul \(deviceID.suffix(4))",
                instanceID: UUID(),
                soulProfile: nil,
                avatar: .default,
                conversations: [],
                world: WorldSnapshot(count: 0, movementEvents: [], agents: []),
                session: DeviceSession(token: "local-dev-token", expiresAt: .distantFuture)
            )
        }
        let response: BootstrapPayload = try await post(
            "bootstrap-user",
            body: ["device_id": deviceID],
            retryOnServerError: true
        )
        return response
    }

    func generateSoulProfile(rawInput: String) async throws -> SoulProfile {
        guard endpoint(named: "generate-soul-profile") != nil else {
            return SoulProfile(
                personality: "Warm, curious, and open to meaningful conversation.",
                interests: ["cinema", "travel", "art"],
                values: ["honesty", "growth", "kindness"],
                avoidTopics: ["cruelty", "bad-faith arguments"],
                rawInput: rawInput,
                guessedFields: ["personality", "interests", "values"]
            )
        }

        return try await post("generate-soul-profile", body: ["raw_input": rawInput])
    }

    func saveSoulProfile(deviceID: String, profile: SoulProfile) async throws {
        guard endpoint(named: "save-soul-profile") != nil else { return }
        let _: SaveSoulProfileResponse = try await post(
            "save-soul-profile",
            body: SaveSoulProfileRequest(deviceID: deviceID, profile: profile),
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func saveAvatar(deviceID: String, avatar: AvatarConfig) async throws {
        guard endpoint(named: "save-avatar") != nil else { return }
        let _: SaveAvatarResponse = try await post(
            "save-avatar",
            body: SaveAvatarRequest(deviceID: deviceID, avatar: avatar),
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func syncWorld(deviceID: String) async throws -> WorldSnapshot {
        guard endpoint(named: "sync-world") != nil else {
            return WorldSnapshot(count: 0, movementEvents: [], agents: [])
        }
        return try await post(
            "sync-world",
            body: ["device_id": deviceID],
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func listConversations(deviceID: String) async throws -> [ConversationPreviewPayload] {
        guard endpoint(named: "list-conversations") != nil else {
            return []
        }
        return try await post(
            "list-conversations",
            body: ["device_id": deviceID],
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func getConversation(deviceID: String, conversationID: UUID) async throws -> ConversationDetail {
        guard endpoint(named: "get-conversation") != nil else {
            return ConversationDetail(
                id: conversationID,
                title: "Local Soul",
                impressionScore: 0,
                impressionSummary: "",
                theirImpressionScore: 0,
                theirImpressionSummary: "",
                status: "active",
                baUnlocked: false,
                otherSoul: nil,
                messages: [],
                baConversationID: nil,
                baMessages: []
            )
        }
        let payload: ConversationDetailPayload = try await post(
            "get-conversation",
            body: [
                "device_id": deviceID,
                "conversation_id": conversationID.uuidString
            ],
            requiresAuth: true,
            retryOnServerError: true
        )
        return payload.asConversationDetail()
    }

    func transcribeAudio(audioData: Data) async throws -> String {
        guard endpoint(named: "transcribe-audio") != nil else {
            return "(transcription unavailable offline)"
        }
        let response: TranscribeAudioResponse = try await post(
            "transcribe-audio",
            body: TranscribeAudioRequest(
                audioBase64: audioData.base64EncodedString(),
                mimeType: "audio/m4a"
            )
        )
        return response.transcript
    }

    func sendBaMessage(deviceID: String, conversationID: UUID, content: String) async throws -> ConversationDetail {
        guard endpoint(named: "send-ba-message") != nil else {
            return ConversationDetail(
                id: conversationID,
                title: "Local Soul",
                impressionScore: 0,
                impressionSummary: "",
                theirImpressionScore: 0,
                theirImpressionSummary: "",
                status: "active",
                baUnlocked: true,
                otherSoul: nil,
                messages: [],
                baConversationID: nil,
                baMessages: [BaMessage(id: UUID(), senderName: "You", content: content)]
            )
        }
        let payload: ConversationDetailPayload = try await post(
            "send-ba-message",
            body: [
                "device_id": deviceID,
                "conversation_id": conversationID.uuidString,
                "content": content
            ],
            requiresAuth: true
        )
        return payload.asConversationDetail()
    }

    func sendHumanMessage(deviceID: String, conversationID: UUID, content: String) async throws -> ConversationDetail {
        guard endpoint(named: "send-human-message") != nil else {
            return ConversationDetail(
                id: conversationID,
                title: "Local Soul",
                impressionScore: 0,
                impressionSummary: "",
                theirImpressionScore: 0,
                theirImpressionSummary: "",
                status: "active",
                baUnlocked: false,
                otherSoul: nil,
                messages: [
                    ChatMessage(id: UUID(), senderName: "You", type: "human_typed", content: content)
                ],
                baConversationID: nil,
                baMessages: []
            )
        }
        let payload: ConversationDetailPayload = try await post(
            "send-human-message",
            body: [
                "device_id": deviceID,
                "conversation_id": conversationID.uuidString,
                "content": content
            ],
            requiresAuth: true
        )
        return payload.asConversationDetail()
    }

    private func endpoint(named function: String) -> URL? {
        configuration.functionBaseURL?.appendingPathComponent(function)
    }

    private func post<ResponseType: Decodable, Body: Encodable>(
        _ name: String,
        body: Body,
        requiresAuth: Bool = false,
        retryOnServerError: Bool = false
    ) async throws -> ResponseType {
        guard let url = endpoint(named: name) else {
            throw BackendError.missingBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let anonKey = configuration.supabaseAnonKey {
            request.setValue(anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        }
        if requiresAuth, let sessionToken {
            request.setValue(sessionToken, forHTTPHeaderField: "x-aaru-session")
        }

        let (data, response) = try await session.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
        if retryOnServerError, (500...599).contains(statusCode) {
            logger.error("Retrying \(name, privacy: .public) after server error \(statusCode)")
            try? await Task.sleep(for: .milliseconds(350))
            let (retryData, retryResponse) = try await session.data(for: request)
            let retryStatusCode = (retryResponse as? HTTPURLResponse)?.statusCode ?? -1
            guard retryStatusCode == 200 else {
                let message = String(data: retryData, encoding: .utf8) ?? ""
                logger.error("Request \(name, privacy: .public) failed after retry with status \(retryStatusCode): \(message, privacy: .public)")
                throw BackendError.invalidResponse(statusCode: retryStatusCode, message: message)
            }
            logger.info("Request \(name, privacy: .public) succeeded after retry")
            return try decoder.decode(ResponseType.self, from: retryData)
        }
        guard statusCode == 200 else {
            let message = String(data: data, encoding: .utf8) ?? ""
            logger.error("Request \(name, privacy: .public) failed with status \(statusCode): \(message, privacy: .public)")
            throw BackendError.invalidResponse(statusCode: statusCode, message: message)
        }

        logger.debug("Request \(name, privacy: .public) succeeded")
        return try decoder.decode(ResponseType.self, from: data)
    }
}

private struct SaveSoulProfileRequest: Encodable {
    let deviceID: String
    let profile: SoulProfile

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case profile
    }
}

private struct SaveAvatarRequest: Encodable {
    let deviceID: String
    let avatar: AvatarConfig

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case avatar
    }
}

private struct SaveSoulProfileResponse: Decodable {
    let userID: UUID
    let soulProfile: SoulProfile

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case soulProfile = "soul_profile"
    }
}

extension BackendClient {
    var realtimeURL: URL? { configuration.supabaseURL }
    var realtimeAnonKey: String? { configuration.supabaseAnonKey }
}

private struct SaveAvatarResponse: Decodable {
    let userID: UUID
    let avatar: AvatarConfig

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case avatar
    }
}

private struct ConversationDetailPayload: Decodable {
    let id: UUID
    let title: String
    let impressionScore: Int
    let impressionSummary: String
    let theirImpressionScore: Int
    let theirImpressionSummary: String
    let status: String
    let baUnlocked: Bool
    let otherSoul: SoulProfile?
    let messages: [ConversationMessagePayload]
    let baConversationID: UUID?
    let baMessages: [BaMessagePayload]?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case impressionScore = "impression_score"
        case impressionSummary = "impression_summary"
        case theirImpressionScore = "their_impression_score"
        case theirImpressionSummary = "their_impression_summary"
        case status
        case baUnlocked = "ba_unlocked"
        case otherSoul = "other_soul"
        case messages
        case baConversationID = "ba_conversation_id"
        case baMessages = "ba_messages"
    }

    func asConversationDetail() -> ConversationDetail {
        ConversationDetail(
            id: id,
            title: title,
            impressionScore: impressionScore,
            impressionSummary: impressionSummary,
            theirImpressionScore: theirImpressionScore,
            theirImpressionSummary: theirImpressionSummary,
            status: status,
            baUnlocked: baUnlocked,
            otherSoul: otherSoul,
            messages: messages.map {
                ChatMessage(
                    id: $0.id,
                    senderName: $0.senderName,
                    type: $0.type,
                    content: $0.content
                )
            },
            baConversationID: baConversationID,
            baMessages: (baMessages ?? []).map {
                BaMessage(
                    id: $0.id,
                    senderName: $0.senderName,
                    content: $0.content
                )
            }
        )
    }
}

private struct BaMessagePayload: Decodable {
    let id: UUID
    let senderName: String
    let content: String

    enum CodingKeys: String, CodingKey {
        case id
        case senderName = "sender_name"
        case content
    }
}

private struct ConversationMessagePayload: Decodable {
    let id: UUID
    let senderName: String
    let type: String
    let content: String

    enum CodingKeys: String, CodingKey {
        case id
        case senderName = "sender_name"
        case type
        case content
    }
}

private struct TranscribeAudioRequest: Encodable {
    let audioBase64: String
    let mimeType: String

    enum CodingKeys: String, CodingKey {
        case audioBase64 = "audio_base64"
        case mimeType = "mime_type"
    }
}

private struct TranscribeAudioResponse: Decodable {
    let transcript: String
}
