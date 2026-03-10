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
                    case .launching:
                        EmptyView()
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
                .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color.black.opacity(0.08), lineWidth: 1)
                }

            HStack {
                Button {
                    if model.audioRecorder.isRecording {
                        Task { await model.transcribeRecording() }
                    } else {
                        model.audioRecorder.startRecording()
                    }
                } label: {
                    Image(systemName: model.audioRecorder.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                        .font(.title)
                        .foregroundStyle(model.audioRecorder.isRecording ? .red : .accentColor)
                }
                .disabled(model.isTranscribing)

                if model.isTranscribing {
                    ProgressView()
                        .padding(.leading, 4)
                    Text("Transcribing...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if model.audioRecorder.isRecording {
                    Text("Recording... tap to stop")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            if model.soulProfile != nil {
                EditableSoulProfileCard(profile: Binding(
                    get: { model.soulProfile! },
                    set: { model.soulProfile = $0 }
                ))
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
