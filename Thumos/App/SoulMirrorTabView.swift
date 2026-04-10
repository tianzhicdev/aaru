import SwiftUI

struct SoulMirrorTabView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            SoulConversationScreen()
                .tabItem {
                    Image(systemName: "bubble.left.fill")
                    Text("Talk")
                }
                .tag(0)

            SoulFileScreen()
                .tabItem {
                    Image(systemName: "person.crop.circle")
                    Text("You")
                }
                .tag(1)

            SoulmateMatchesView()
                .tabItem {
                    Image(systemName: "heart.circle")
                    Text("Connect")
                }
                .tag(2)
        }
        .tint(Theme.accentBright)
        .preferredColorScheme(.dark)
        .onChange(of: selectedTab) { _, newTab in
            if newTab == 1 {
                Task { await model.requestSoulFileUpdateIfNeeded() }
            }
        }
    }
}
