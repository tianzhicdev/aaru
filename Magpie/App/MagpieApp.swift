import SwiftUI
import UIKit

class AppDelegate: NSObject, UIApplicationDelegate {
    var notificationManager: NotificationManager?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            notificationManager?.didReceiveDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            notificationManager?.didFailToRegisterForRemoteNotifications(error)
        }
    }
}

@main
struct MagpieApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model: AppModel
    @StateObject private var notificationManager = NotificationManager()
    @StateObject private var themeManager = ThemeManager.shared

    init() {
        let isRunningTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        _model = StateObject(wrappedValue: AppModel(autoBootstrap: !isRunningTests))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(notificationManager)
                .environmentObject(themeManager)
                .environment(\.theme, themeManager.current)
                .preferredColorScheme(themeManager.current.isDark ? .dark : .light)
                .id(themeManager.current.id)
                .onAppear {
                    model.notificationManager = notificationManager
                    appDelegate.notificationManager = notificationManager
                }
        }
    }
}
