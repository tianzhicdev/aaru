import SwiftUI

struct SoulMirrorTabView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedTab = 0

    private let accentGold = Color(red: 0.83, green: 0.69, blue: 0.30)

    var body: some View {
        TabView(selection: $selectedTab) {
            SoulConversationScreen()
                .tabItem {
                    Image(systemName: "bubble.left.fill")
                    Text("Conversation")
                }
                .tag(0)

            SoulFileScreen()
                .tabItem {
                    Image(systemName: "person.crop.circle")
                    Text("Soul File")
                }
                .tag(1)
        }
        .tint(accentGold)
        .onChange(of: model.soulFileJustUpdated) {
            if model.soulFileJustUpdated {
                // Brief flash on soul file tab when it updates during conversation
                model.soulFileJustUpdated = false
            }
        }
    }
}
