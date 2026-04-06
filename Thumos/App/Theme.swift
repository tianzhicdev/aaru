import SwiftUI

enum Theme {

    // MARK: - Colors

    static let backgroundGradient = LinearGradient(
        colors: [
            Color(red: 0.039, green: 0.031, blue: 0.024),  // #0a0806
            Color(red: 0.071, green: 0.063, blue: 0.039),  // #12100a
            Color(red: 0.039, green: 0.031, blue: 0.024),  // #0a0806
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    static let surface = Color(red: 1.0, green: 0.973, blue: 0.902).opacity(0.06)
    static let textPrimary = Color(red: 1.0, green: 0.973, blue: 0.902).opacity(0.85)
    static let textSecondary = Color(red: 1.0, green: 0.973, blue: 0.902).opacity(0.50)
    static let textTertiary = Color(red: 1.0, green: 0.973, blue: 0.902).opacity(0.25)

    static let goldBase = Color(red: 0.831, green: 0.690, blue: 0.302)
    static let accent = goldBase.opacity(0.55)
    static let accentBright = goldBase.opacity(0.70)
    static let divider = goldBase.opacity(0.20)

    static let userBubble = goldBase.opacity(0.25)
    static let assistantBubble = Color(red: 1.0, green: 0.973, blue: 0.902).opacity(0.06)

    static let errorBg = Color(red: 0.706, green: 0.235, blue: 0.157).opacity(0.15)
    static let errorText = Color(red: 1.0, green: 0.549, blue: 0.471).opacity(0.85)

    // MARK: - Fonts

    static func serif(_ size: CGFloat, weight: Font.Weight = .light) -> Font {
        switch weight {
        case .medium:
            return .custom("CormorantGaramond-Medium", size: size)
        case .regular:
            return .custom("CormorantGaramond-Regular", size: size)
        default:
            return .custom("CormorantGaramond-Light", size: size)
        }
    }

    static func serifItalic(_ size: CGFloat) -> Font {
        .custom("CormorantGaramond-LightItalic", size: size)
    }

    static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        switch weight {
        case .medium:
            return .custom("SpaceGrotesk-Medium", size: size)
        case .light:
            return .custom("SpaceGrotesk-Light", size: size)
        default:
            return .custom("SpaceGrotesk-Regular", size: size)
        }
    }
}
