import SwiftUI

struct ForceUpdateView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "arrow.up.circle")
                    .font(.system(size: 56, weight: .thin))
                    .foregroundStyle(Theme.accent)

                Text("Update Required")
                    .font(Theme.serif(32, weight: .light))
                    .foregroundStyle(Theme.textPrimary)

                Text(model.appUpdateMessage ?? "This version of Thumos is no longer supported. Please update to continue.")
                    .font(Theme.sans(16, weight: .light))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 32)

                Spacer()

                Button {
                    if let url = URL(string: "https://apps.apple.com/app/id6761285269") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("Update Now")
                        .font(Theme.sans(17, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.accentBright)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 48)
            }
        }
        .preferredColorScheme(.dark)
    }
}
