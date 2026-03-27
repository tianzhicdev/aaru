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
    case authenticationFailed

    var errorDescription: String? {
        switch self {
        case .missingBaseURL:
            return "Backend base URL is not configured."
        case let .invalidResponse(statusCode, message):
            return message.isEmpty
                ? "The backend failed with status \(statusCode)."
                : "The backend failed with status \(statusCode): \(message)"
        case .authenticationFailed:
            return "Session expired. Reconnecting..."
        }
    }

    var isAuthFailure: Bool {
        switch self {
        case .authenticationFailed:
            return true
        case let .invalidResponse(statusCode, _):
            return statusCode == 401 || statusCode == 403
        default:
            return false
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

    // MARK: - Soul Mirror

    func bootstrapSoul(deviceID: String) async throws -> SoulBootstrapResponse {
        guard endpoint(named: "bootstrap-soul") != nil else {
            return SoulBootstrapResponse(
                userId: UUID(),
                token: nil,
                visibleSoulFile: nil,
                activeSession: nil,
                messages: nil,
                canStartSession: true,
                cooldownRemainingMs: 0,
                nextSessionNumber: 1
            )
        }
        return try await post(
            "bootstrap-soul",
            body: ["device_id": deviceID],
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func getSoulFile() async throws -> SoulFileResponse {
        guard endpoint(named: "get-soul-file") != nil else {
            return SoulFileResponse(
                visibleSoulFile: .empty,
                version: 0,
                lastUpdated: nil
            )
        }
        return try await post(
            "get-soul-file",
            body: EmptyBody(),
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func endSoulSession() async throws -> EndSoulSessionResponse {
        guard endpoint(named: "end-soul-session") != nil else {
            return EndSoulSessionResponse(
                visibleSoulFile: .empty,
                sessionCompleted: true,
                synthesisSucceeded: false
            )
        }
        return try await post(
            "end-soul-session",
            body: EmptyBody(),
            requiresAuth: true,
            retryOnServerError: true
        )
    }

    func soulConverseStream(
        message: String,
        sessionID: UUID? = nil,
        onToken: @escaping (String) -> Void,
        onVisibleSoulFileUpdated: @escaping (VisibleSoulFile) -> Void = { _ in },
        onError: @escaping (String) -> Void
    ) async throws {
        guard let url = endpoint(named: "soul-converse") else {
            let fallback = "I see you. What's something most people don't notice about you?"
            for char in fallback {
                onToken(String(char))
                try? await Task.sleep(for: .milliseconds(20))
            }
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        var body: [String: String] = ["message": message]
        if let sessionID {
            body["session_id"] = sessionID.uuidString
        }
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let anonKey = configuration.supabaseAnonKey {
            request.setValue(anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        }
        if let sessionToken {
            request.setValue(sessionToken, forHTTPHeaderField: "x-aaru-session")
        }

        let (bytes, response) = try await session.bytes(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1

        if statusCode == 401 || statusCode == 403 {
            logger.error("Auth failure in SSE stream: \(statusCode)")
            throw BackendError.authenticationFailed
        }

        guard statusCode == 200 else {
            throw BackendError.invalidResponse(statusCode: statusCode, message: "SSE stream failed")
        }

        for try await line in bytes.lines {
            if line.hasPrefix("event: ") {
                continue
            }
            guard line.hasPrefix("data: ") else { continue }
            let jsonString = String(line.dropFirst(6))
            guard let jsonData = jsonString.data(using: .utf8) else { continue }

            if let tokenEvent = try? decoder.decode(SSETokenEvent.self, from: jsonData),
               tokenEvent.text != nil {
                onToken(tokenEvent.text!)
            } else if let soulFileEvent = try? decoder.decode(SSESoulFileUpdatedEvent.self, from: jsonData) {
                if let visible = soulFileEvent.visibleSoulFile {
                    onVisibleSoulFileUpdated(visible)
                }
            } else if let errorEvent = try? decoder.decode(SSEErrorEvent.self, from: jsonData),
                      errorEvent.message != nil {
                onError(errorEvent.message!)
            }
        }
    }

    func synthesizeSoulFile() async throws -> SynthesizeSoulFileResponse {
        guard endpoint(named: "synthesize-soul-file") != nil else {
            return SynthesizeSoulFileResponse(
                visibleSoulFile: .empty,
                synthesisSucceeded: false
            )
        }
        return try await post(
            "synthesize-soul-file",
            body: EmptyBody(),
            requiresAuth: true,
            retryOnServerError: true
        )
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

private struct EmptyBody: Encodable {}

// MARK: - SSE Event Types

private struct SSETokenEvent: Decodable {
    let text: String?
}

private struct SSESoulFileUpdatedEvent: Decodable {
    let visibleSoulFile: VisibleSoulFile?
    let exchangeCount: Int?

    enum CodingKeys: String, CodingKey {
        case visibleSoulFile = "visible_soul_file"
        case exchangeCount = "exchange_count"
    }
}

private struct SSEErrorEvent: Decodable {
    let type: String?
    let message: String?
}
