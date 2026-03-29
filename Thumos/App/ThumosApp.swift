import SwiftUI

@main
struct ThumosApp: App {
    @StateObject private var model: AppModel
    @StateObject private var notificationManager = NotificationManager()

    init() {
        let isRunningTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        _model = StateObject(wrappedValue: AppModel(autoBootstrap: !isRunningTests))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(notificationManager)
                .onAppear {
                    model.notificationManager = notificationManager
                }
        }
    }
}
