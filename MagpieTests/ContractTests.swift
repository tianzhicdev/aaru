import XCTest
@testable import Magpie

final class ContractTests: XCTestCase {

    // MARK: - Fixture Loading

    private func loadFixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: type(of: self))
        let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "contracts")
        XCTAssertNotNil(url, "Missing fixture: contracts/\(name).json — ensure contracts/ is in test resources")
        return try Data(contentsOf: url!)
    }

    // MARK: - bootstrap-soul

    func testBootstrapSoulContract() throws {
        let data = try loadFixture("bootstrap-soul.response")
        let response = try JSONDecoder().decode(SoulBootstrapResponse.self, from: data)
        XCTAssertNotNil(response.userId)
        XCTAssertNotNil(response.token)
        XCTAssertNotNil(response.visibleSoulFile)
        XCTAssertTrue(response.hasMessages)
    }

    func testBootstrapSoulVisibleSoulFile() throws {
        let data = try loadFixture("bootstrap-soul.response")
        let response = try JSONDecoder().decode(SoulBootstrapResponse.self, from: data)
        let sf = response.visibleSoulFile!

        // Sections present and non-empty (new romance-pivot keys)
        XCTAssertFalse(sf.sections.howYouLightUp.isEmpty)
        XCTAssertFalse(sf.sections.howYouShowUp.isEmpty)
        XCTAssertFalse(sf.sections.howYouLove.isEmpty)
        XCTAssertFalse(sf.sections.howYouWeatherStorms.isEmpty)
        XCTAssertFalse(sf.sections.whatYoureLookingFor.isEmpty)
        XCTAssertFalse(sf.sections.yourGrowingEdges.isEmpty)
        XCTAssertFalse(sf.sections.yourWarmth.isEmpty)

        // Psychometrics
        XCTAssertGreaterThan(sf.crystallizedMoments.count, 0)
        XCTAssertGreaterThan(sf.openThreads.count, 0)
        XCTAssertNotNil(sf.compassScores)
        XCTAssertNotNil(sf.personalitySpectrum)
        XCTAssertNotNil(sf.personalitySpectrum?.openness)
        XCTAssertNotNil(sf.topValues)
        XCTAssertGreaterThan(sf.topValues?.count ?? 0, 0)
        XCTAssertNotNil(sf.relationalStyle)
        XCTAssertGreaterThanOrEqual(sf.completeness, 0)
        XCTAssertLessThanOrEqual(sf.completeness, 1)
    }

    // MARK: - get-soul-file

    func testGetSoulFileContract() throws {
        let data = try loadFixture("get-soul-file.response")
        let response = try JSONDecoder().decode(SoulFileResponse.self, from: data)
        XCTAssertGreaterThan(response.version, 0)
        XCTAssertNotNil(response.lastUpdated)
        XCTAssertFalse(response.synthesisPending)
        XCTAssertFalse(response.visibleSoulFile.sections.howYouLightUp.isEmpty)
        XCTAssertGreaterThanOrEqual(response.visibleSoulFile.completeness, 0)

        // domain_coverage: all 7 romance domains, valid depth values
        XCTAssertEqual(response.domainCoverage.count, 7)
        let validDepths: Set<String> = ["untouched", "mentioned", "explored", "deep"]
        let expectedDomains: Set<String> = [
            "daily_rhythm", "play_and_joy", "values_and_worldview", "love_language",
            "conflict_and_repair", "vulnerability_and_trust", "partnership_vision"
        ]
        XCTAssertEqual(Set(response.domainCoverage.map(\.domain)), expectedDomains)
        for entry in response.domainCoverage {
            XCTAssertTrue(validDepths.contains(entry.depth), "Unknown depth: \(entry.depth)")
        }
    }

    // MARK: - sync-messages

    func testSyncMessagesContract() throws {
        let data = try loadFixture("sync-messages.response")
        let response = try JSONDecoder().decode(SyncMessagesResponse.self, from: data)
        XCTAssertEqual(response.messages.count, 2)

        let user = response.messages[0]
        XCTAssertEqual(user.role, "user")
        XCTAssertFalse(user.id.isEmpty)
        XCTAssertFalse(user.content.isEmpty)
        XCTAssertFalse(user.createdAt.isEmpty)

        let assistant = response.messages[1]
        XCTAssertEqual(assistant.role, "assistant")
    }

    // MARK: - version

    func testVersionOkContract() throws {
        let data = try loadFixture("version-ok.response")
        let response = try JSONDecoder().decode(VersionCheckResponse.self, from: data)
        XCTAssertEqual(response.status, "ok")
        XCTAssertEqual(response.minVersion, "0.1.0")
        XCTAssertNil(response.message)
    }

    func testVersionUnsupportedContract() throws {
        let data = try loadFixture("version-unsupported.response")
        let response = try JSONDecoder().decode(VersionCheckResponse.self, from: data)
        XCTAssertEqual(response.status, "unsupported")
        XCTAssertEqual(response.minVersion, "0.1.0")
        XCTAssertNotNil(response.message)
    }

    // MARK: - delete-account

    func testDeleteAccountContract() throws {
        let data = try loadFixture("delete-account.response")
        let response = try JSONDecoder().decode(DeleteAccountResponse.self, from: data)
        XCTAssertTrue(response.deleted)
    }

    // MARK: - Defensive decoding (missing/extra keys)

    func testVisibleSoulFileDecodesWithMissingKeys() throws {
        let minimal = """
        {"version": 1, "lastUpdated": "2026-01-01"}
        """.data(using: .utf8)!
        let sf = try JSONDecoder().decode(VisibleSoulFile.self, from: minimal)
        XCTAssertEqual(sf.version, 1)
        XCTAssertEqual(sf.sections.howYouLightUp, "")
        XCTAssertEqual(sf.crystallizedMoments.count, 0)
        XCTAssertEqual(sf.openThreads.count, 0)
        XCTAssertEqual(sf.completeness, 0)
    }

    func testVersionCheckDecodesWithMissingKeys() throws {
        let minimal = "{}".data(using: .utf8)!
        let response = try JSONDecoder().decode(VersionCheckResponse.self, from: minimal)
        XCTAssertEqual(response.status, "ok")
        XCTAssertEqual(response.minVersion, "0.0.0")
    }

    func testSoulFileResponseDecodesWithMissingKeys() throws {
        let minimal = "{}".data(using: .utf8)!
        let response = try JSONDecoder().decode(SoulFileResponse.self, from: minimal)
        XCTAssertEqual(response.version, 0)
        XCTAssertFalse(response.synthesisPending)
        XCTAssertTrue(response.visibleSoulFile.isEmpty)
        XCTAssertEqual(response.domainCoverage.count, 0)
    }
}
