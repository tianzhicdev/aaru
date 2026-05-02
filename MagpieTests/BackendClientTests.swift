import XCTest
@testable import Magpie

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

    func testVisibleSoulFileDecodesDashboardV2Fields() throws {
        let json = """
        {
          "version": 2,
          "lastUpdated": "2026-03-30T00:00:00Z",
          "portrait": "You move through the world like someone protecting a quiet interior room.",
          "sections": {
            "howYouLightUp": "With care.",
            "howYouShowUp": "In patterns.",
            "howYouLove": "Slowly.",
            "howYouWeatherStorms": "Expectation.",
            "whatYoureLookingFor": "Creative flow.",
            "yourGrowingEdges": "You want closeness but brace against it.",
            "yourWarmth": "Measured."
          },
          "crystallizedMoments": [],
          "openThreads": [],
          "compassScores": { "openness": 72 },
          "personalitySpectrum": {
            "openness": { "position": 78, "label": "Curious beneath the guard.", "evidence": "Keeps reaching for bigger frames." }
          },
          "topValues": [
            { "value": "Self-Direction", "description": "You need room to choose your own way." }
          ],
          "relationalStyle": "You open through shared perspective first."
        }
        """

        let decoded = try JSONDecoder().decode(VisibleSoulFile.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.personalitySpectrum?.openness?.position, 78)
        XCTAssertEqual(decoded.topValues?.first?.value, "Self-Direction")
        XCTAssertEqual(decoded.relationalStyle, "You open through shared perspective first.")
    }

    func testVisibleSoulFileDecodesWhenDashboardV2FieldsAreAbsent() throws {
        let json = """
        {
          "version": 1,
          "lastUpdated": "2026-03-30T00:00:00Z",
          "portrait": null,
          "sections": {
            "howYouLightUp": "",
            "howYouShowUp": "",
            "howYouLove": "",
            "howYouWeatherStorms": "",
            "whatYoureLookingFor": "",
            "yourGrowingEdges": "",
            "yourWarmth": ""
          },
          "crystallizedMoments": [],
          "openThreads": [],
          "compassScores": {}
        }
        """

        let decoded = try JSONDecoder().decode(VisibleSoulFile.self, from: Data(json.utf8))
        XCTAssertNil(decoded.personalitySpectrum)
        XCTAssertNil(decoded.topValues)
        XCTAssertNil(decoded.relationalStyle)
    }
}
