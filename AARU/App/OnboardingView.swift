import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("AARU")
                        .font(.system(size: 42, weight: .black, design: .rounded))

                    switch model.stage {
                    case .onboarding(.soul):
                        soulStep
                    case .onboarding(.avatar):
                        avatarStep
                    case .world:
                        EmptyView()
                    }

                    if let errorMessage = model.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
                .padding(24)
            }
        }
    }

    private var soulStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Describe your soul in a few lines. The Ka will do the first wandering for you.")
                .font(.headline)
                .foregroundStyle(.secondary)

            TextEditor(text: $model.profileInput)
                .frame(minHeight: 220)
                .padding(12)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

            if let profile = model.soulProfile {
                SoulProfileCard(profile: profile)
            }

            HStack {
                Button("Generate Soul Profile") {
                    Task { await model.generateSoulProfile() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.profileInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isLoading)

                if model.soulProfile != nil {
                    Button("Save Profile") {
                        Task { await model.saveSoulProfile() }
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var avatarStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Shape the body your Ka wanders in.")
                .font(.headline)
                .foregroundStyle(.secondary)

            AvatarEditorView()

            Button("Enter Aaru") {
                Task { await model.saveAvatarAndEnterWorld() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isLoading)
        }
    }
}

private struct SoulProfileCard: View {
    let profile: SoulProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Soul Profile")
                .font(.title3.bold())
            Text(profile.personality)
            LabelValueRow(label: "Interests", value: profile.interests.joined(separator: ", "))
            LabelValueRow(label: "Values", value: profile.values.joined(separator: ", "))
            LabelValueRow(label: "Avoid", value: profile.avoidTopics.joined(separator: ", "))

            if !profile.guessedFields.isEmpty {
                Text("AI guessed: \(profile.guessedFields.joined(separator: ", "))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct LabelValueRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
        }
    }
}
