import Foundation
import OSLog

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

enum SoulConverseMode: String {
    case opening
    case reply
}

final class BackendClient {
    private let logger = Logger(subsystem: "com.trythumos.app", category: "backend")
    private(set) var configuration: BackendConfiguration
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

    func updateConfiguration(_ configuration: BackendConfiguration) {
        self.configuration = configuration
    }

    func bootstrapSoul(deviceID: String) async throws -> SoulBootstrapResponse {
        guard endpoint(named: "bootstrap-soul") != nil else {
            return SoulBootstrapResponse(
                userId: UUID(),
                token: nil,
                visibleSoulFile: nil,
                hasMessages: false
            )
        }
        return try await post(
            "bootstrap-soul",
            body: ["device_id": deviceID],
            retryOnServerError: true
        )
    }

    func getSoulFile() async throws -> SoulFileResponse {
        guard endpoint(named: "get-soul-file") != nil else {
            return SoulFileResponse(
                visibleSoulFile: .empty,
                version: 0,
                lastUpdated: nil,
                synthesisPending: false
            )
        }
        return try await post(
            "get-soul-file",
            body: EmptyBody(),
            retryOnServerError: true
        )
    }

    func syncMessages() async throws -> SyncMessagesResponse {
        guard endpoint(named: "sync-messages") != nil else {
            return SyncMessagesResponse(messages: [])
        }
        return try await post(
            "sync-messages",
            body: EmptyBody(),
            retryOnServerError: true
        )
    }

    func soulConverseStream(
        mode: SoulConverseMode,
        message: String? = nil,
        onToken: @escaping (String) -> Void,
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
        // Opus can take a while to produce the first streamed token.
        request.timeoutInterval = 300
        let body = SoulConverseRequest(mode: mode.rawValue, message: message)
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let sessionToken {
            request.setValue(sessionToken, forHTTPHeaderField: "x-thumos-session")
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
            } else if let errorEvent = try? decoder.decode(SSEErrorEvent.self, from: jsonData),
                      errorEvent.message != nil {
                onError(errorEvent.message!)
            }
        }
    }

    func checkVersion() async throws -> VersionCheckResponse {
        guard endpoint(named: "version") != nil else {
            return VersionCheckResponse(status: "ok", minVersion: "0.0.0", message: nil)
        }
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        return try await post(
            "version",
            body: ["build_version": appVersion]
        )
    }

    func deleteAccount() async throws -> DeleteAccountResponse {
        guard endpoint(named: "delete-account") != nil else {
            return DeleteAccountResponse(deleted: true)
        }
        return try await post(
            "delete-account",
            body: EmptyBody()
        )
    }

    #if DEBUG
    func getDebugInfo() async throws -> DebugInfoResponse {
        return try await post(
            "get-debug-info",
            body: EmptyBody(),
            includeDebugToken: true
        )
    }
    #endif

    private func endpoint(named function: String) -> URL? {
        configuration.functionBaseURL?.appendingPathComponent(function)
    }

    private func post<ResponseType: Decodable, Body: Encodable>(
        _ name: String,
        body: Body,
        retryOnServerError: Bool = false,
        includeDebugToken: Bool = false
    ) async throws -> ResponseType {
        guard let url = endpoint(named: name) else {
            throw BackendError.missingBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let sessionToken {
            request.setValue(sessionToken, forHTTPHeaderField: "x-thumos-session")
        }
        if includeDebugToken, let debugApiToken = configuration.debugApiToken, !debugApiToken.isEmpty {
            request.setValue(debugApiToken, forHTTPHeaderField: "x-thumos-debug-token")
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

private struct SoulConverseRequest: Encodable {
    let mode: String
    let message: String?
}

// MARK: - SSE Event Types

private struct SSETokenEvent: Decodable {
    let text: String?
}

private struct SSEErrorEvent: Decodable {
    let type: String?
    let message: String?
}
