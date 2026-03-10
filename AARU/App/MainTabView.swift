import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            WorldScreen()
                .tabItem {
                    Label("World", systemImage: "globe")
                }

            ConvosScreen()
                .tabItem {
                    Label("Convos", systemImage: "bubble.left.and.bubble.right")
                }

            MeScreen()
                .tabItem {
                    Label("Me", systemImage: "person.crop.circle")
                }
        }
    }
}
