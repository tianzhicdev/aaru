import XCTest
@testable import AARU

@MainActor
final class AppModelTests: XCTestCase {
    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testOnboardingGenerationUsesBackendResponse() async {
        let model = AppModel(
            backend: makeClient(),
            deviceID: "test-device",
            autoBootstrap: false
        )
        model.profileInput = "I like cinema and distance running."
        MockURLProtocol.requestHandler = { request in
            let response = """
            {
              "personality":"Curious",
              "interests":["cinema"],
              "values":["honesty"],
              "avoid_topics":[],
              "raw_input":"I like cinema and distance running.",
              "guessed_fields":[]
            }
            """
            return (
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(response.utf8)
            )
        }

        await model.generateSoulProfile()

        XCTAssertNotNil(model.soulProfile)
        XCTAssertEqual(model.soulProfile?.rawInput, "I like cinema and distance running.")
    }

    func testSaveSoulProfileMovesToAvatarStep() async {
        let model = AppModel(
            backend: makeClient(),
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
        MockURLProtocol.requestHandler = { request in
            let response = """
            {
              "user_id":"11111111-1111-1111-1111-111111111111",
              "soul_profile":{
                "personality":"Curious",
                "interests":["film"],
                "values":["honesty"],
                "avoid_topics":[],
                "raw_input":"film",
                "guessed_fields":[]
              }
            }
            """
            return (
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(response.utf8)
            )
        }

        await model.saveSoulProfile()

        XCTAssertEqual(model.stage, .onboarding(.avatar))
    }

    func testUpdateAvatarMutatesSelection() {
        let model = AppModel(
            backend: makeClient(),
            deviceID: "test-device",
            autoBootstrap: false
        )

        model.updateAvatar(hairColor: "silver", accessory: "hat")

        XCTAssertEqual(model.avatar.hairColor, "silver")
        XCTAssertEqual(model.avatar.accessory, "hat")
    }

    func testSaveAvatarTransitionsIntoWorld() async {
        let model = AppModel(
            backend: makeClient(),
            deviceID: "test-device",
            autoBootstrap: false
        )
        model.stage = .onboarding(.avatar)
        MockURLProtocol.requestHandler = { request in
            let path = request.url!.lastPathComponent
            let response: String
            switch path {
            case "save-avatar":
                response = """
                {
                  "user_id":"11111111-1111-1111-1111-111111111111",
                  "avatar":{
                    "sprite_id":"m01_explorer",
                    "body_shape":"slender",
                    "skin_tone":"amber",
                    "hair_style":"wave",
                    "hair_color":"black",
                    "eyes":"focused",
                    "outfit_top":"linen",
                    "outfit_bottom":"sand",
                    "accessory":null,
                    "aura_color":"#d4af37"
                  }
                }
                """
            case "sync-world":
                response = """
                {
                  "count":1,
                  "config":{
                    "grid_columns":50,
                    "grid_rows":50,
                    "world_tick_ms":1000,
                    "move_animation_ms":900,
                    "bubble_reading_wps":4,
                    "conversation_speaking_wps":2.7,
                    "conversation_turn_gap_ms":300,
                    "min_bubble_display_ms":1500,
                    "min_reply_delay_ms":2000,
                    "camera_visible_columns":7,
                    "camera_visible_rows":9
                  },
                  "movement_events":[],
                  "agents":[]
                }
                """
            case "list-conversations":
                response = "[]"
            default:
                XCTFail("Unexpected path \\(path)")
                response = "{}"
            }
            return (
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(response.utf8)
            )
        }

        await model.saveAvatarAndEnterWorld()

        XCTAssertEqual(model.stage, .world)
    }

    private func makeClient() -> BackendClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let backendConfiguration = BackendConfiguration(
            functionBaseURL: URL(string: "https://example.com/functions/v1/"),
            supabaseURL: URL(string: "https://example.com"),
            supabaseAnonKey: "anon"
        )
        return BackendClient(configuration: backendConfiguration, session: session)
    }
}
