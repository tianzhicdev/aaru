import Foundation
import Security

enum SecureStore {
    private static func defaultsKey(service: String, account: String) -> String {
        "\(service).\(account)"
    }

    static func read(service: String, account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(value, forKey: defaultsKey(service: service, account: account))
            return value
        }
        return UserDefaults.standard.string(forKey: defaultsKey(service: service, account: account))
    }

    static func write(_ value: String, service: String, account: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data
        ]

        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess {
            SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            var create = query
            create[kSecValueData as String] = data
            create[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(create as CFDictionary, nil)
        }
        UserDefaults.standard.set(value, forKey: defaultsKey(service: service, account: account))
    }
}

enum DeviceIdentity {
    private static let service = "com.tianzhichen.aaru.device"
    private static let account = "primary"

    static func current() -> String {
        if let existing = SecureStore.read(service: service, account: account) {
            return existing
        }
        let created = UUID().uuidString.lowercased()
        SecureStore.write(created, service: service, account: account)
        return created
    }
}
