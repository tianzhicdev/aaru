import XCTest
@testable import AARU

final class BackendClientTests: XCTestCase {
    func testBootstrapFallbackReturnsOnboardingPayload() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let payload = try await client.bootstrap(deviceID: "test-device")

        XCTAssertEqual(payload.deviceID, "test-device")
        XCTAssertNil(payload.soulProfile)
        XCTAssertEqual(payload.conversations.count, 0)
    }
}
