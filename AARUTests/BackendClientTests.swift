import XCTest
@testable import AARU

final class BackendClientTests: XCTestCase {
    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testBootstrapReturnsServerPayload() async throws {
        let client = makeClient()
        MockURLProtocol.requestHandler = { request in
            let body = """
            {
              "user_id":"11111111-1111-1111-1111-111111111111",
              "device_id":"test-device",
              "display_name":"Soul vice",
              "instance_id":"22222222-2222-2222-2222-222222222222",
              "soul_profile":null,
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
              },
              "conversations":[],
              "world":{
                "count":0,
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
            }
            """
            return (
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(body.utf8)
            )
        }

        let payload = try await client.bootstrap(deviceID: "test-device")

        XCTAssertEqual(payload.deviceID, "test-device")
        XCTAssertNil(payload.soulProfile)
        XCTAssertEqual(payload.conversations.count, 0)
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
