import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if !model.hasAgreedToAI {
                AIConsentView()
            } else if model.appUpdateRequired {
                ForceUpdateView()
            } else {
                SoulMirrorTabView()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                model.handleForeground()
            }
        }
    }
}
