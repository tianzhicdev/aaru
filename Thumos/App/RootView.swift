import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSplash = true

    var body: some View {
        ZStack {
            Group {
                if !model.hasAgreedToAI {
                    AIConsentView()
                } else if model.appUpdateRequired {
                    ForceUpdateView()
                } else {
                    SoulMirrorTabView()
                }
            }

            if showSplash {
                SplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .animation(.easeOut(duration: 0.5), value: showSplash)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                showSplash = false
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                model.handleForeground()
            }
        }
    }
}
