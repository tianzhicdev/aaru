import SwiftUI

struct AIConsentView: View {
    @EnvironmentObject private var model: AppModel

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

                        Text("Your data is encrypted and only visible to you. Delete anytime.")
                            .font(Theme.sans(13, weight: .light))
                            .foregroundStyle(Theme.textTertiary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                            .padding(.top, 4)

                        Button {
                            if let url = URL(string: "https://trythumos.com/privacy") {
                                UIApplication.shared.open(url)
                            }
                        } label: {
                            Text("Privacy Policy")
                                .font(Theme.sans(14, weight: .medium))
                                .foregroundStyle(Theme.accentBright)
                        }

                        Spacer().frame(height: 16)
                    }
                    .padding(.horizontal, 24)
                }

                Button {
                    model.agreeToAIConsent()
                } label: {
                    Text("I Agree")
                        .font(Theme.sans(17, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.accentBright)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 48)
                .padding(.top, 12)
            }
        }
        .preferredColorScheme(.dark)
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
