import SwiftUI

struct AIConsentView: View {
    @EnvironmentObject private var model: AppModel
    @State private var hasAgreedToPrivacy = false
    @State private var showPrivacySheet = false

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 24) {
                        Spacer().frame(height: 48)

                        Text("Before We Begin")
                            .font(Theme.serif(28, weight: .light))
                            .foregroundStyle(Theme.textPrimary)

                        infoCard(
                            icon: "eye",
                            title: "A Mirror, Not a Manual",
                            body: "This is a space for honest self-reflection. There are no right answers, no diagnoses, no self-improvement plans. Just you, looking at yourself clearly."
                        )

                        infoCard(
                            icon: "bubble.left.and.bubble.right",
                            title: "Conversations with AI",
                            body: "You'll talk to an AI that listens, asks questions, and reflects back what it notices. Over time, it builds a living portrait of who you are — your soul file."
                        )

                        infoCard(
                            icon: "sparkles",
                            title: "It Gets Better Over Time",
                            body: "The more you share, the richer the picture becomes. Be relaxed. Be honest. Say whatever comes to mind. There's no wrong way to do this."
                        )

                        // Privacy consent checkbox
                        HStack(alignment: .top, spacing: 10) {
                            Button {
                                hasAgreedToPrivacy.toggle()
                            } label: {
                                Image(systemName: hasAgreedToPrivacy ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 20))
                                    .foregroundStyle(hasAgreedToPrivacy ? Theme.accentBright : Theme.textTertiary)
                            }
                            .padding(.top, 1)

                            HStack(spacing: 0) {
                                Text("I agree to the ")
                                    .font(Theme.sans(14, weight: .light))
                                    .foregroundStyle(Theme.textSecondary)

                                Button {
                                    showPrivacySheet = true
                                } label: {
                                    Text("Privacy Policy")
                                        .font(Theme.sans(14, weight: .medium))
                                        .foregroundStyle(Theme.accentBright)
                                        .underline()
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                        Spacer().frame(height: 16)
                    }
                    .padding(.horizontal, 24)
                }

                Button {
                    model.agreeToAIConsent()
                } label: {
                    Text("Continue")
                        .font(Theme.sans(17, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(hasAgreedToPrivacy ? Theme.accentBright : Theme.accentBright.opacity(0.3))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(!hasAgreedToPrivacy)
                .padding(.horizontal, 40)
                .padding(.bottom, 48)
                .padding(.top, 12)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showPrivacySheet) {
            PrivacyPolicySheet()
        }
    }

    private func infoCard(icon: String, title: String, body: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .thin))
                .foregroundStyle(Theme.accent)

            Text(title)
                .font(Theme.sans(15, weight: .medium))
                .foregroundStyle(Theme.textPrimary)

            Text(body)
                .font(Theme.sans(14, weight: .light))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct PrivacyPolicySheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Text("Privacy Policy")
                        .font(Theme.serif(24, weight: .light))
                        .foregroundStyle(Theme.textPrimary)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 16)

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        section(
                            title: "What We Collect",
                            body: "When you use Thumos, we collect the conversation messages you send and a device identifier to associate your data with your account."
                        )

                        section(
                            title: "How Your Data Is Used",
                            body: "Your conversation messages are sent to third-party AI service providers to generate responses and build your soul file — a living portrait of who you are based on your reflections."
                        )

                        section(
                            title: "Third-Party Services",
                            body: "We use third-party AI service providers to process your conversations. These providers are contractually prohibited from using your data to train AI models."
                        )

                        section(
                            title: "Data Security",
                            body: "Your data is encrypted in transit and at rest. Your soul file and conversations are only accessible to you."
                        )

                        section(
                            title: "Your Rights",
                            body: "You can delete all your data at any time from within the app. Deletion is permanent and immediate."
                        )

                        Button {
                            if let url = URL(string: "https://trythumos.com/privacy") {
                                UIApplication.shared.open(url)
                            }
                        } label: {
                            Text("Read Full Privacy Policy")
                                .font(Theme.sans(14, weight: .medium))
                                .foregroundStyle(Theme.accentBright)
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func section(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(Theme.sans(14, weight: .medium))
                .foregroundStyle(Theme.textPrimary)
            Text(body)
                .font(Theme.sans(13, weight: .light))
                .foregroundStyle(Theme.textSecondary)
                .lineSpacing(3)
        }
    }
}
