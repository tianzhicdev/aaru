import SwiftUI

struct MeScreen: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Me")
                    .font(.largeTitle.bold())

                if model.soulProfile != nil {
                    EditableSoulProfileCard(profile: Binding(
                        get: { model.soulProfile! },
                        set: { model.soulProfile = $0 }
                    ))

                    Button("Save Soul Profile") {
                        Task { await model.updateSoulProfile() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isLoading)

                    AvatarEditorView()
                    Button("Save Avatar") {
                        Task { await model.saveAvatarAndEnterWorld() }
                    }
                    .buttonStyle(.bordered)

                    Toggle(isOn: Binding(
                        get: { model.debugModeEnabled },
                        set: { model.setDebugMode($0) }
                    )) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Debug Overlay")
                                .font(.headline)
                            Text("Show live server movement and conversation events on the world map.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(14)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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
