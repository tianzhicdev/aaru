import Foundation

#if DEBUG
enum BackendEnvironmentKind: String, CaseIterable, Identifiable {
    case local
    case dev
    case prod
    case custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .local:
            return "Local"
        case .dev:
            return "Dev"
        case .prod:
            return "Prod"
        case .custom:
            return "Custom"
        }
    }
}
#else
enum BackendEnvironmentKind: String {
    case prod
}
#endif

struct BackendConfiguration: Equatable {
    let environment: BackendEnvironmentKind
    let functionBaseURL: URL?
    let storageNamespace: String
    let debugApiToken: String?
    let customBaseURLString: String?

    init(
        environment: BackendEnvironmentKind = .prod,
        functionBaseURL: URL?,
        storageNamespace: String = "backend.test",
        debugApiToken: String? = nil,
        customBaseURLString: String? = nil
    ) {
        self.environment = environment
        self.functionBaseURL = functionBaseURL
        self.storageNamespace = storageNamespace
        self.debugApiToken = debugApiToken
        self.customBaseURLString = customBaseURLString
    }

    var baseURLString: String {
        functionBaseURL?.absoluteString ?? ""
    }

    static var `default`: BackendConfiguration {
        #if DEBUG
        BackendSettingsStore.load()
        #else
        BackendConfiguration(
            environment: .prod,
            functionBaseURL: URL(string: "https://api.trymagpie.xyz/"),
            storageNamespace: "backend.prod",
            debugApiToken: nil,
            customBaseURLString: nil
        )
        #endif
    }
}

#if DEBUG
enum BackendSettingsStore {
    private static let environmentKey = "debug_backend_environment"
    private static let customBaseURLKey = "debug_backend_custom_base_url"
    private static let debugApiTokenKey = "debug_backend_api_token"

    private static let localBaseURL = "http://127.0.0.1:8787/"
    private static let devBaseURL = "https://thumos-api-dev.tianzhic-dev.workers.dev/"
    private static let prodBaseURL = "https://api.trymagpie.xyz/"

    static func load() -> BackendConfiguration {
        let defaults = UserDefaults.standard
        let environment = BackendEnvironmentKind(
            rawValue: defaults.string(forKey: environmentKey) ?? ""
        ) ?? .dev
        let customBaseURLString = defaults.string(forKey: customBaseURLKey)
        let debugApiToken = defaults.string(forKey: debugApiTokenKey)
        return makeConfiguration(
            environment: environment,
            customBaseURLString: customBaseURLString,
            debugApiToken: debugApiToken
        )
    }

    static func save(
        environment: BackendEnvironmentKind,
        customBaseURLString: String?,
        debugApiToken: String?
    ) -> BackendConfiguration {
        let defaults = UserDefaults.standard
        defaults.set(environment.rawValue, forKey: environmentKey)

        let normalizedCustomURL = normalizedCustomBaseURL(from: customBaseURLString)
        if let normalizedCustomURL {
            defaults.set(normalizedCustomURL, forKey: customBaseURLKey)
        } else {
            defaults.removeObject(forKey: customBaseURLKey)
        }

        let trimmedDebugToken = trimmed(debugApiToken)
        if let trimmedDebugToken {
            defaults.set(trimmedDebugToken, forKey: debugApiTokenKey)
        } else {
            defaults.removeObject(forKey: debugApiTokenKey)
        }

        return makeConfiguration(
            environment: environment,
            customBaseURLString: normalizedCustomURL,
            debugApiToken: trimmedDebugToken
        )
    }

    static func makeConfiguration(
        environment: BackendEnvironmentKind,
        customBaseURLString: String?,
        debugApiToken: String?
    ) -> BackendConfiguration {
        let resolvedBaseURLString: String?
        switch environment {
        case .local:
            resolvedBaseURLString = localBaseURL
        case .dev:
            resolvedBaseURLString = devBaseURL
        case .prod:
            resolvedBaseURLString = prodBaseURL
        case .custom:
            resolvedBaseURLString = normalizedCustomBaseURL(from: customBaseURLString)
        }

        let resolvedURL = resolvedBaseURLString.flatMap(URL.init(string:))
        return BackendConfiguration(
            environment: environment,
            functionBaseURL: resolvedURL,
            storageNamespace: storageNamespace(
                for: environment,
                baseURLString: resolvedBaseURLString
            ),
            debugApiToken: trimmed(debugApiToken),
            customBaseURLString: normalizedCustomBaseURL(from: customBaseURLString)
        )
    }

    private static func normalizedCustomBaseURL(from value: String?) -> String? {
        guard let trimmedValue = trimmed(value) else { return nil }
        return trimmedValue.hasSuffix("/") ? trimmedValue : trimmedValue + "/"
    }

    private static func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue.isEmpty ? nil : trimmedValue
    }

    private static func storageNamespace(
        for environment: BackendEnvironmentKind,
        baseURLString: String?
    ) -> String {
        switch environment {
        case .local:
            return "backend.local"
        case .dev:
            return "backend.dev"
        case .prod:
            return "backend.prod"
        case .custom:
            return "backend.custom.\(sanitize(baseURLString ?? "unknown"))"
        }
    }

    private static func sanitize(_ value: String) -> String {
        let lowercased = value.lowercased()
        let scalars = lowercased.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) {
                return Character(scalar)
            }
            return "_"
        }
        let collapsed = String(scalars)
            .replacingOccurrences(of: "__+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return collapsed.isEmpty ? "custom" : collapsed
    }
}
#endif
