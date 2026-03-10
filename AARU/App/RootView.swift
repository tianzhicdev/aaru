import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            switch model.stage {
            case .onboarding:
                OnboardingView()
            case .world:
                MainTabView()
            }
        }
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.96, green: 0.78, blue: 0.56),
                    Color(red: 0.86, green: 0.91, blue: 0.84)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
    }
}
