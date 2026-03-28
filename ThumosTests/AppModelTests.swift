import XCTest
@testable import Thumos

@MainActor
final class AppModelTests: XCTestCase {
    func testVisibleSoulFileDefaultsToEmpty() {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )

        XCTAssertEqual(model.visibleSoulFile, .empty)
        XCTAssertTrue(model.visibleSoulFile.isEmpty)
        XCTAssertNil(model.visibleSoulFile.portrait)
    }

    func testBootstrapSetsUserID() async {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )

        await model.bootstrap()

        XCTAssertNotNil(model.userID)
    }

    func testSendSoulMessageIgnoresEmptyText() async {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )

        await model.sendSoulMessage("   ")

        XCTAssertTrue(model.soulMessages.isEmpty)
    }
}
