import XCTest
@testable import Thumos

final class BackendClientTests: XCTestCase {
    func testBootstrapSoulFallbackReturnsEmptyState() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let response = try await client.bootstrapSoul(deviceID: "test-device")

        XCTAssertNil(response.visibleSoulFile)
        XCTAssertEqual(response.hasMessages, false)
    }

    func testGetSoulFileFallbackReturnsEmpty() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let response = try await client.getSoulFile()

        XCTAssertEqual(response.visibleSoulFile, .empty)
        XCTAssertEqual(response.version, 0)
    }

    func testSyncMessagesFallbackReturnsEmptyList() async throws {
        let client = BackendClient(configuration: BackendConfiguration(functionBaseURL: nil))

        let response = try await client.syncMessages()

        XCTAssertEqual(response.messages, [])
    }
}
