import XCTest
@testable import AARU

final class BackendClientTests: XCTestCase {
    func testBootstrapFallbackReturnsPayload() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let payload = try await client.bootstrap(deviceID: "test-device")

        XCTAssertEqual(payload.deviceID, "test-device")
        XCTAssertEqual(payload.session.token, "local-dev-token")
    }

    func testBootstrapSoulFallbackReturnsEmptyState() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let response = try await client.bootstrapSoul(deviceID: "test-device")

        XCTAssertNil(response.soulFile)
        XCTAssertNil(response.visibleSoulFile)
        XCTAssertNil(response.activeSession)
        XCTAssertTrue(response.canStartSession)
        XCTAssertEqual(response.nextSessionNumber, 1)
    }

    func testGetSoulFileFallbackReturnsEmpty() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let response = try await client.getSoulFile()

        XCTAssertEqual(response.visibleSoulFile, .empty)
        XCTAssertEqual(response.soulFile, .empty)
        XCTAssertEqual(response.version, 0)
    }
}
