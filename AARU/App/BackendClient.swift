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

    init(
        configuration: BackendConfiguration = .default,
        session: URLSession = .shared
    ) {
        self.configuration = configuration
        self.session = session
        decoder.dateDecodingStrategy = .iso8601
    }

    func bootstrap(deviceID: String) async throws -> BootstrapPayload {
        let response: BootstrapPayload = try await post(
            "bootstrap-user",
            body: ["device_id": deviceID],
            retryOnServerError: true
        )
        return response
    }

    func generateSoulProfile(rawInput: String) async throws -> GeneratedSoulProfile {
        return try await post("generate-soul-profile", body: ["raw_input": rawInput])
    }

    func saveSoulProfile(deviceID: String, profile: SoulProfile, displayName: String? = nil) async throws -> SaveSoulProfileResponse {
        return try await post(
            "save-soul-profile",
            body: SaveSoulProfileRequest(deviceID: deviceID, profile: profile, displayName: displayName),
            retryOnServerError: true
        )
    }

    func saveAvatar(deviceID: String, avatar: AvatarConfig) async throws {
        let _: SaveAvatarResponse = try await post(
            "save-avatar",
            body: SaveAvatarRequest(deviceID: deviceID, avatar: avatar),
            retryOnServerError: true
        )
    }

    func syncWorld(deviceID: String) async throws -> WorldSnapshot {
        return try await post(
            "sync-world",
            body: ["device_id": deviceID],
            retryOnServerError: true
        )
    }

    func listConversations(deviceID: String) async throws -> [ConversationPreviewPayload] {
        return try await post(
            "list-conversations",
            body: ["device_id": deviceID],
            retryOnServerError: true
        )
    }

    func getConversation(deviceID: String, conversationID: UUID) async throws -> ConversationDetail {
        let payload: ConversationDetailPayload = try await post(
            "get-conversation",
            body: [
                "device_id": deviceID,
                "conversation_id": conversationID.uuidString
            ],
            retryOnServerError: true
        )
        return payload.asConversationDetail()
    }

    func transcribeAudio(audioData: Data) async throws -> String {
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
        let payload: ConversationDetailPayload = try await post(
            "send-ba-message",
            body: [
                "device_id": deviceID,
                "conversation_id": conversationID.uuidString,
                "content": content
            ]
        )
        return payload.asConversationDetail()
    }

    func tapCell(deviceID: String, cellX: Int, cellY: Int) async throws -> TapCellResponse {
        return try await post(
            "tap-cell",
            body: TapCellRequest(deviceID: deviceID, targetCellX: cellX, targetCellY: cellY)
        )
    }

    func tapCharacter(deviceID: String, targetUserID: UUID) async throws -> TapCharacterResponse {
        return try await post(
            "tap-character",
            body: [
                "device_id": deviceID,
                "target_user_id": targetUserID.uuidString
            ]
        )
    }

    func heartbeat(deviceID: String) async throws {
        let _: HeartbeatResponse = try await post(
            "heartbeat",
            body: ["device_id": deviceID]
        )
    }

    func registerPushToken(deviceID: String, token: String) async throws {
        let _: HeartbeatResponse = try await post(
            "register-push-token",
            body: [
                "device_id": deviceID,
                "device_token": token,
                "platform": "ios"
            ]
        )
    }

    func sendHumanMessage(deviceID: String, conversationID: UUID, content: String) async throws -> ConversationDetail {
        let payload: ConversationDetailPayload = try await post(
            "send-human-message",
            body: [
                "device_id": deviceID,
                "conversation_id": conversationID.uuidString,
                "content": content
            ]
        )
        return payload.asConversationDetail()
    }

    private func endpoint(named function: String) -> URL? {
        configuration.functionBaseURL?.appendingPathComponent(function)
    }

    private func post<ResponseType: Decodable, Body: Encodable>(
        _ name: String,
        body: Body,
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

private struct HeartbeatResponse: Decodable {
    let ok: Bool
}

private struct SaveSoulProfileRequest: Encodable {
    let deviceID: String
    let profile: SoulProfile
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case profile
        case displayName = "display_name"
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

struct SaveSoulProfileResponse: Decodable {
    let userID: UUID
    let displayName: String
    let soulProfile: SoulProfile

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case displayName = "display_name"
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
    let impressionFactors: ImpressionFactors?
    let memorySummary: String?
    let theirImpressionScore: Int
    let theirImpressionSummary: String
    let theirImpressionFactors: ImpressionFactors?
    let theirMemorySummary: String?
    let encounterCount: Int
    let phase: String
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
        case impressionFactors = "impression_factors"
        case memorySummary = "memory_summary"
        case theirImpressionScore = "their_impression_score"
        case theirImpressionSummary = "their_impression_summary"
        case theirImpressionFactors = "their_impression_factors"
        case theirMemorySummary = "their_memory_summary"
        case encounterCount = "encounter_count"
        case phase
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
            impressionFactors: impressionFactors,
            memorySummary: memorySummary,
            theirImpressionScore: theirImpressionScore,
            theirImpressionSummary: theirImpressionSummary,
            theirImpressionFactors: theirImpressionFactors,
            theirMemorySummary: theirMemorySummary,
            encounterCount: encounterCount,
            phase: phase,
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

private struct TapCellRequest: Encodable {
    let deviceID: String
    let targetCellX: Int
    let targetCellY: Int

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case targetCellX = "target_cell_x"
        case targetCellY = "target_cell_y"
    }
}

struct TapCellResponse: Decodable {
    let path: [CellCoord]
    let estimatedDurationMs: Int

    enum CodingKeys: String, CodingKey {
        case path
        case estimatedDurationMs = "estimated_duration_ms"
    }
}

struct TapCharacterResponse: Decodable {
    let path: [CellCoord]
    let estimatedDurationMs: Int

    enum CodingKeys: String, CodingKey {
        case path
        case estimatedDurationMs = "estimated_duration_ms"
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
