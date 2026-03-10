import SwiftUI

struct AvatarEditorView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AvatarPreview(avatar: model.avatar)
                .frame(maxWidth: .infinity)

            Text("For now, the Ka body is generated randomly. Tap again until it feels close enough.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button("Randomize Avatar") {
                model.randomizeAvatar()
            }
            .buttonStyle(.borderedProminent)
        }
        .onAppear {
            if model.avatar == .default {
                model.randomizeAvatar()
            }
        }
    }
}

private struct AvatarPreview: View {
    let avatar: AvatarConfig

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: avatar.auraColor).opacity(0.18))
                .frame(width: 200, height: 200)

            spriteImage
                .frame(width: 192, height: 192)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    @ViewBuilder
    private var spriteImage: some View {
        if let sheet = SpriteSheetHelper.walkSheet(for: avatar.spriteId),
           let frame = SpriteSheetHelper.frame(from: sheet, direction: .south, frameIndex: 0) {
            Image(uiImage: frame)
                .resizable()
                .interpolation(.none)
        } else {
            Circle()
                .fill(Color(hex: avatar.auraColor).opacity(0.5))
                .overlay {
                    Text(avatar.spriteId.prefix(2).uppercased())
                        .font(.title.bold())
                        .foregroundStyle(.white)
                }
        }
    }
}

private extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xff, int >> 8 & 0xff, int & 0xff)
        default:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xff, int & 0xff)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
