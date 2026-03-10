import SwiftUI

struct MeScreen: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Me")
                    .font(.largeTitle.bold())

                if let profile = model.soulProfile {
                    Text(profile.personality)
                        .font(.title3)
                    Text("Interests: \(profile.interests.joined(separator: ", "))")
                    Text("Values: \(profile.values.joined(separator: ", "))")
                    AvatarEditorView()
                    Button("Save Avatar") {
                        Task { await model.saveAvatarAndEnterWorld() }
                    }
                    .buttonStyle(.bordered)
                } else {
                    Text("Complete onboarding to define the Ka.")
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
    }
}
