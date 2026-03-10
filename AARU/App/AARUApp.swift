import SwiftUI

@main
struct AARUApp: App {
    @StateObject private var model: AppModel

    init() {
        let isRunningTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        _model = StateObject(wrappedValue: AppModel(autoBootstrap: !isRunningTests))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
        }
    }
}
