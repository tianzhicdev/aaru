import SwiftUI
import UserNotifications

class AARUAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        NotificationCenter.default.post(name: .didReceiveAPNSToken, object: token)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Push registration failed — this is expected in simulator
    }
}

@main
struct AARUApp: App {
    @UIApplicationDelegateAdaptor(AARUAppDelegate.self) var appDelegate
    @StateObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let isRunningTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        _model = StateObject(wrappedValue: AppModel(autoBootstrap: !isRunningTests))
        SpriteSheetHelper.preload()

        // Request push notification authorization
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        model.startHeartbeat()
                    case .background, .inactive:
                        model.stopHeartbeat()
                    @unknown default:
                        break
                    }
                }
        }
    }
}
