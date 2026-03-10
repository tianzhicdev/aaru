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
                .frame(width: 170, height: 170)
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(color(for: avatar.outfitTop))
                .frame(width: 90, height: 120)
                .offset(y: 18)
            Circle()
                .fill(color(for: avatar.skinTone))
                .frame(width: 82, height: 82)
                .offset(y: -20)
            Capsule()
                .fill(color(for: avatar.hairColor))
                .frame(width: 92, height: 32)
                .offset(y: -46)
            HStack(spacing: 16) {
                Circle().fill(.black).frame(width: 6, height: 6)
                Circle().fill(.black).frame(width: 6, height: 6)
            }
            .offset(y: -18)
            if let accessory = avatar.accessory {
                Text(accessory.prefix(1).uppercased())
                    .font(.headline.bold())
                    .padding(8)
                    .background(.thinMaterial, in: Circle())
                    .offset(x: 44, y: -22)
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func color(for key: String) -> Color {
        switch key {
        case "linen": return Color(red: 0.90, green: 0.87, blue: 0.77)
        case "indigo": return Color(red: 0.20, green: 0.24, blue: 0.45)
        case "ochre": return Color(red: 0.78, green: 0.58, blue: 0.24)
        case "sage": return Color(red: 0.48, green: 0.61, blue: 0.49)
        case "sand": return Color(red: 0.79, green: 0.70, blue: 0.52)
        case "night": return Color(red: 0.13, green: 0.17, blue: 0.28)
        case "stone": return Color(red: 0.63, green: 0.63, blue: 0.60)
        case "terracotta": return Color(red: 0.68, green: 0.38, blue: 0.28)
        case "amber": return Color(red: 0.79, green: 0.62, blue: 0.42)
        case "olive": return Color(red: 0.66, green: 0.55, blue: 0.38)
        case "ebony": return Color(red: 0.34, green: 0.24, blue: 0.18)
        case "rose": return Color(red: 0.90, green: 0.74, blue: 0.70)
        case "brown": return Color(red: 0.32, green: 0.22, blue: 0.14)
        case "copper": return Color(red: 0.67, green: 0.37, blue: 0.21)
        case "silver": return Color(red: 0.77, green: 0.78, blue: 0.82)
        default: return .black
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
