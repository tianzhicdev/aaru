import SwiftUI
import Combine

// MARK: - ThemeTokens

/// All visual tokens for a single theme. New themes are added by creating a
/// new `ThemeTokens` instance in the `Presets` extension below.
struct ThemeTokens: Equatable, Identifiable {
    let id: String
    let displayName: String
    let isDark: Bool

    // Surfaces
    let bg: Color
    let bgTint: Color
    let bgDeep: Color
    let surface: Color
    let card: Color
    let backgroundGradient: LinearGradient

    // Brand
    let primary: Color
    let primaryDeep: Color
    let primarySoft: Color
    let primaryBubble: Color
    let accent: Color
    let accentBright: Color

    // Text
    let textPrimary: Color
    let textSecondary: Color
    let textTertiary: Color

    // Bubbles
    let userBubble: Color
    let assistantBubble: Color
    let userBubbleText: Color
    let assistantBubbleText: Color

    // Lines + mascot palette
    let divider: Color
    let butter: Color
    let butterSoft: Color
    let coral: Color
    let onlineDot: Color
    let danger: Color
    let dangerSoft: Color

    // Errors
    let errorBg: Color
    let errorText: Color

    // Bubble shadow tints
    let bubbleShadowSent: Color
    let bubbleShadowReceived: Color

    static func == (lhs: ThemeTokens, rhs: ThemeTokens) -> Bool { lhs.id == rhs.id }
}

// MARK: - Color hex helper

private extension Color {
    static func hex(_ value: UInt32, _ alpha: Double = 1.0) -> Color {
        Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Presets

extension ThemeTokens {
    static let pillowySage = ThemeTokens(
        id: "pillowy-sage",
        displayName: "Pillowy Sage",
        isDark: false,
        bg: .hex(0xFAFBF7),
        bgTint: .hex(0xF1F6EC),
        bgDeep: .hex(0xE8F0E2),
        surface: .white,
        card: .white,
        backgroundGradient: LinearGradient(
            colors: [.hex(0xFAFBF7), .hex(0xF1F6EC)],
            startPoint: .top,
            endPoint: .bottom
        ),
        primary: .hex(0x5C8C6E),
        primaryDeep: .hex(0x3F6B4B),
        primarySoft: .hex(0xD8E8D0),
        primaryBubble: .hex(0x86B898),
        accent: .hex(0x5C8C6E),
        accentBright: .hex(0x3F6B4B),
        textPrimary: .hex(0x1F2A20),
        textSecondary: .hex(0x6B7A6E),
        textTertiary: .hex(0x9AA89E),
        userBubble: .hex(0x5C8C6E),
        assistantBubble: .white,
        userBubbleText: .white,
        assistantBubbleText: .hex(0x1F2A20),
        divider: .hex(0x3F6B4B, 0.10),
        butter: .hex(0xF5D88A),
        butterSoft: .hex(0xFFF4C4),
        coral: .hex(0xE89B8A),
        onlineDot: .hex(0x7BC47F),
        danger: .hex(0xC76B5C),
        dangerSoft: .hex(0xFBE6E1),
        errorBg: .hex(0xFBE6E1),
        errorText: .hex(0xC76B5C),
        bubbleShadowSent: .hex(0x5C8C6E, 0.20),
        bubbleShadowReceived: .hex(0x1F2A20, 0.06)
    )

    static let crispMint = ThemeTokens(
        id: "crisp-mint",
        displayName: "Crisp Mint",
        isDark: false,
        bg: .white,
        bgTint: .hex(0xF0FAF4),
        bgDeep: .hex(0xE0F2E5),
        surface: .hex(0xF7FBF8),
        card: .hex(0xF7FBF8),
        backgroundGradient: LinearGradient(
            colors: [.white, .hex(0xF0FAF4)],
            startPoint: .top,
            endPoint: .bottom
        ),
        primary: .hex(0x10B981),
        primaryDeep: .hex(0x047857),
        primarySoft: .hex(0xD1FAE5),
        primaryBubble: .hex(0x10B981),
        accent: .hex(0x10B981),
        accentBright: .hex(0x047857),
        textPrimary: .hex(0x0F1F17),
        textSecondary: .hex(0x6B7A6E),
        textTertiary: .hex(0x9AA89E),
        userBubble: .hex(0x10B981),
        assistantBubble: .hex(0xF7FBF8),
        userBubbleText: .white,
        assistantBubbleText: .hex(0x0F1F17),
        divider: .hex(0x10B981, 0.12),
        butter: .hex(0xFCD34D),
        butterSoft: .hex(0xFEF3C7),
        coral: .hex(0xF87171),
        onlineDot: .hex(0x10B981),
        danger: .hex(0xDC2626),
        dangerSoft: .hex(0xFECACA),
        errorBg: .hex(0xFECACA),
        errorText: .hex(0xDC2626),
        bubbleShadowSent: .hex(0x10B981, 0.20),
        bubbleShadowReceived: .hex(0x0F1F17, 0.06)
    )

    static let dreamyCloud = ThemeTokens(
        id: "dreamy-cloud",
        displayName: "Dreamy Cloud",
        isDark: false,
        bg: .hex(0xF8FBF6),
        bgTint: .hex(0xEFF5EB),
        bgDeep: .hex(0xE2EBDC),
        surface: .white,
        card: .white,
        backgroundGradient: LinearGradient(
            colors: [.hex(0xF8FBF6), .hex(0xEFF5EB)],
            startPoint: .top,
            endPoint: .bottom
        ),
        primary: .hex(0x7BA577),
        primaryDeep: .hex(0x4A6B3F),
        primarySoft: .hex(0xDCE8D4),
        primaryBubble: .hex(0x9EC192),
        accent: .hex(0x7BA577),
        accentBright: .hex(0x4A6B3F),
        textPrimary: .hex(0x2D3825),
        textSecondary: .hex(0x6E7B68),
        textTertiary: .hex(0xA0AB99),
        userBubble: .hex(0x7BA577),
        assistantBubble: .white,
        userBubbleText: .white,
        assistantBubbleText: .hex(0x2D3825),
        divider: .hex(0x4A6B3F, 0.10),
        butter: .hex(0xF0CB78),
        butterSoft: .hex(0xFBEDC1),
        coral: .hex(0xE89B8A),
        onlineDot: .hex(0x7BC47F),
        danger: .hex(0xC76B5C),
        dangerSoft: .hex(0xFBE6E1),
        errorBg: .hex(0xFBE6E1),
        errorText: .hex(0xC76B5C),
        bubbleShadowSent: .hex(0x7BA577, 0.20),
        bubbleShadowReceived: .hex(0x2D3825, 0.06)
    )

    /// The original dark/gold theme. Preserved verbatim so we can switch back.
    static let darkGold: ThemeTokens = {
        let cream = Color(red: 1.0, green: 0.973, blue: 0.902)
        let gold = Color(red: 0.831, green: 0.690, blue: 0.302)
        return ThemeTokens(
            id: "dark-gold",
            displayName: "Dark Gold",
            isDark: true,
            bg: Color(red: 0.039, green: 0.031, blue: 0.024),
            bgTint: Color(red: 0.071, green: 0.063, blue: 0.039),
            bgDeep: Color(red: 0.039, green: 0.031, blue: 0.024),
            surface: cream.opacity(0.06),
            card: cream.opacity(0.06),
            backgroundGradient: LinearGradient(
                colors: [
                    Color(red: 0.039, green: 0.031, blue: 0.024),
                    Color(red: 0.071, green: 0.063, blue: 0.039),
                    Color(red: 0.039, green: 0.031, blue: 0.024),
                ],
                startPoint: .top,
                endPoint: .bottom
            ),
            primary: gold,
            primaryDeep: gold,
            primarySoft: gold.opacity(0.20),
            primaryBubble: gold.opacity(0.40),
            accent: gold.opacity(0.55),
            accentBright: gold.opacity(0.70),
            textPrimary: cream.opacity(0.85),
            textSecondary: cream.opacity(0.50),
            textTertiary: cream.opacity(0.25),
            userBubble: gold.opacity(0.25),
            assistantBubble: cream.opacity(0.06),
            userBubbleText: cream.opacity(0.85),
            assistantBubbleText: cream.opacity(0.85),
            divider: gold.opacity(0.20),
            butter: .hex(0xF5D88A),
            butterSoft: .hex(0xFFF4C4),
            coral: .hex(0xE89B8A),
            onlineDot: .hex(0x7BC47F),
            danger: Color(red: 1.0, green: 0.549, blue: 0.471),
            dangerSoft: Color(red: 0.706, green: 0.235, blue: 0.157).opacity(0.15),
            errorBg: Color(red: 0.706, green: 0.235, blue: 0.157).opacity(0.15),
            errorText: Color(red: 1.0, green: 0.549, blue: 0.471).opacity(0.85),
            bubbleShadowSent: .clear,
            bubbleShadowReceived: .clear
        )
    }()

    static let allPresets: [ThemeTokens] = [.pillowySage, .crispMint, .dreamyCloud, .darkGold]

    static func preset(id: String) -> ThemeTokens? {
        allPresets.first(where: { $0.id == id })
    }
}

// MARK: - ThemeManager

/// Singleton that owns the active theme. Inject via `.environmentObject` at the
/// app root so that views observing it re-render when the theme changes. Also
/// surfaced through the static `Theme.xxx` accessors for legacy call sites.
final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @Published var current: ThemeTokens {
        didSet { UserDefaults.standard.set(current.id, forKey: Self.storageKey) }
    }

    private static let storageKey = "thumos.activeTheme"

    init() {
        let savedID = UserDefaults.standard.string(forKey: Self.storageKey)
        self.current = savedID.flatMap(ThemeTokens.preset(id:)) ?? .pillowySage
    }

    func setTheme(_ tokens: ThemeTokens) {
        guard tokens.id != current.id else { return }
        current = tokens
    }
}

// MARK: - SwiftUI environment key

private struct ThemeKey: EnvironmentKey {
    static let defaultValue: ThemeTokens = .pillowySage
}

extension EnvironmentValues {
    var theme: ThemeTokens {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - Static legacy API

/// Static façade over the active `ThemeManager.shared.current`. Existing call
/// sites continue to work; new code should prefer `@Environment(\.theme)` to
/// get reactive updates without relying on global state.
enum Theme {
    private static var t: ThemeTokens { ThemeManager.shared.current }

    // Surfaces
    static var backgroundGradient: LinearGradient { t.backgroundGradient }
    static var bg: Color { t.bg }
    static var bgTint: Color { t.bgTint }
    static var bgDeep: Color { t.bgDeep }
    static var surface: Color { t.surface }
    static var card: Color { t.card }

    // Text
    static var textPrimary: Color { t.textPrimary }
    static var textSecondary: Color { t.textSecondary }
    static var textTertiary: Color { t.textTertiary }

    // Brand
    static var primary: Color { t.primary }
    static var primaryDeep: Color { t.primaryDeep }
    static var primarySoft: Color { t.primarySoft }
    static var primaryBubble: Color { t.primaryBubble }
    static var goldBase: Color { t.primary }
    static var accent: Color { t.accent }
    static var accentBright: Color { t.accentBright }

    // Lines + bubbles
    static var divider: Color { t.divider }
    static var userBubble: Color { t.userBubble }
    static var assistantBubble: Color { t.assistantBubble }
    static var userBubbleText: Color { t.userBubbleText }
    static var assistantBubbleText: Color { t.assistantBubbleText }

    // Mascot palette
    static var butter: Color { t.butter }
    static var butterSoft: Color { t.butterSoft }
    static var coral: Color { t.coral }
    static var onlineDot: Color { t.onlineDot }
    static var danger: Color { t.danger }
    static var dangerSoft: Color { t.dangerSoft }

    // Errors
    static var errorBg: Color { t.errorBg }
    static var errorText: Color { t.errorText }

    // Bubble shadows
    static var bubbleShadowSent: Color { t.bubbleShadowSent }
    static var bubbleShadowReceived: Color { t.bubbleShadowReceived }

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

    /// Instrument Serif — used for the brand wordmark and the profile name.
    /// Italic by default since the wordmark is italic.
    static func wordmark(_ size: CGFloat, italic: Bool = true) -> Font {
        .custom(italic ? "InstrumentSerif-Italic" : "InstrumentSerif-Regular", size: size)
    }
}

// MARK: - Pillow bubble shape

/// Pillow-shaped chat bubble with one tight corner indicating the sender.
struct PillowBubbleShape: Shape {
    let mine: Bool
    var radius: CGFloat = 24
    var tightRadius: CGFloat = 8

    func path(in rect: CGRect) -> Path {
        let r = radius
        let tight = tightRadius
        var path = Path()
        if mine {
            // Tight bottom-right
            path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
            path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r),
                        radius: r, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - tight))
            path.addArc(center: CGPoint(x: rect.maxX - tight, y: rect.maxY - tight),
                        radius: tight, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
            path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
            path.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r),
                        radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
            path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r),
                        radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        } else {
            // Tight bottom-left
            path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
            path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r),
                        radius: r, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
            path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r),
                        radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
            path.addLine(to: CGPoint(x: rect.minX + tight, y: rect.maxY))
            path.addArc(center: CGPoint(x: rect.minX + tight, y: rect.maxY - tight),
                        radius: tight, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
            path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r),
                        radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        }
        path.closeSubpath()
        return path
    }
}
