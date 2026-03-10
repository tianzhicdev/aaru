import XCTest
@testable import AARU

@MainActor
final class AppModelTests: XCTestCase {
    func testOnboardingGenerationUsesFallbackWithoutBackendURL() async {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )
        model.profileInput = "I like cinema and distance running."

        await model.generateSoulProfile()

        XCTAssertNotNil(model.soulProfile)
        XCTAssertEqual(model.soulProfile?.rawInput, "I like cinema and distance running.")
    }

    func testSaveSoulProfileMovesToAvatarStep() async {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )
        model.soulProfile = SoulProfile(
            personality: "Curious",
            interests: ["film"],
            values: ["honesty"],
            avoidTopics: [],
            rawInput: "film",
            guessedFields: []
        )

        await model.saveSoulProfile()

        XCTAssertEqual(model.stage, .onboarding(.avatar))
    }

    func testUpdateAvatarMutatesSelection() {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )

        model.updateAvatar(hairColor: "silver", accessory: "hat")

        XCTAssertEqual(model.avatar.hairColor, "silver")
        XCTAssertEqual(model.avatar.accessory, "hat")
    }

    func testSaveAvatarTransitionsIntoWorld() async {
        let model = AppModel(
            backend: BackendClient(configuration: BackendConfiguration(functionBaseURL: nil)),
            deviceID: "test-device",
            autoBootstrap: false
        )
        model.stage = .onboarding(.avatar)

        await model.saveAvatarAndEnterWorld()

        XCTAssertEqual(model.stage, .world)
    }
}
