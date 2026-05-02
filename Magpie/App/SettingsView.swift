import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var themeManager: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirmation = false
    @State private var showDebug = false

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    var body: some View {
        settingsContent
            .alert("Delete all data?", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete everything", role: .destructive) {
                    Task {
                        await model.deleteAccount()
                        dismiss()
                    }
                }
            } message: {
                Text("This will permanently delete your conversations, soul file, and all associated data. This cannot be undone.")
            }
            .modifier(DebugSheetModifier(showDebug: $showDebug, model: model))
    }

    private var settingsContent: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                ScrollView {
                    VStack(spacing: 22) {
                        privacyGroup
                        accountGroup

                        if DebugSheetModifier.isDebug {
                            debugGroup
                        }

                        Text("magpie · v\(appVersion)")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textTertiary)
                            .kerning(0.4)
                            .padding(.top, 12)
                            .padding(.bottom, 24)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                }
            }
        }
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Back")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundStyle(Theme.primaryDeep)
            }
            Spacer()
            Text("You")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            Spacer()
            Color.clear.frame(width: 50, height: 1)
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.divider).frame(height: 0.5)
        }
    }

    // MARK: - Groups

    private var privacyGroup: some View {
        settingsGroup("Privacy") {
            settingsRow(icon: "lock.shield", title: "Privacy Policy", trailing: .external) {
                if let url = URL(string: "https://trymagpie.xyz/privacy") {
                    UIApplication.shared.open(url)
                }
            }
            divider
            settingsRow(icon: "questionmark.circle", title: "Support", trailing: .external) {
                if let url = URL(string: "https://trymagpie.xyz/support") {
                    UIApplication.shared.open(url)
                }
            }
        }
    }

    private var accountGroup: some View {
        settingsGroup("Account") {
            settingsRow(
                icon: "trash",
                title: "Delete my data",
                tint: Theme.danger,
                background: Theme.dangerSoft
            ) {
                showDeleteConfirmation = true
            }
            .disabled(model.isDeletingAccount)
        }
    }

    private var debugGroup: some View {
        settingsGroup("Debug") {
            settingsRow(icon: "ant", title: "Debug menu", trailing: .chevron) {
                showDebug = true
            }
            divider
            // Theme picker mirrors DebugView's, but visible directly inside Settings
            // for quick switching during the redesign.
            VStack(spacing: 0) {
                ForEach(ThemeTokens.allPresets) { preset in
                    Button {
                        themeManager.setTheme(preset)
                    } label: {
                        HStack(spacing: 12) {
                            themeSwatch(preset)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(preset.displayName)
                                    .font(.system(size: 15.5, weight: .medium))
                                    .foregroundStyle(Theme.textPrimary)
                            }
                            Spacer()
                            if preset.id == themeManager.current.id {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Theme.primary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                    if preset.id != ThemeTokens.allPresets.last?.id {
                        divider
                    }
                }
            }
        }
    }

    private func themeSwatch(_ tokens: ThemeTokens) -> some View {
        HStack(spacing: 0) {
            tokens.bg
            tokens.primary
            tokens.primarySoft
            tokens.butter
        }
        .frame(width: 40, height: 24)
        .clipShape(RoundedRectangle(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Theme.divider, lineWidth: 0.5))
    }

    // MARK: - Group + row primitives

    @ViewBuilder
    private func settingsGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.primaryDeep)
                .textCase(.uppercase)
                .tracking(0.6)
                .padding(.leading, 4)

            VStack(spacing: 0) { content() }
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Theme.card)
                        .shadow(color: Theme.bubbleShadowReceived, radius: 12, x: 0, y: 4)
                )
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.divider).frame(height: 0.5).padding(.leading, 16)
    }

    private enum SettingsRowTrailing { case chevron, external, none }

    private func settingsRow(
        icon: String,
        title: String,
        tint: Color = Theme.primary,
        background: Color = Theme.primarySoft,
        trailing: SettingsRowTrailing = .chevron,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9).fill(background)
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(tint)
                }
                .frame(width: 30, height: 30)

                Text(title)
                    .font(.system(size: 15.5, weight: .medium))
                    .foregroundStyle(tint == Theme.danger ? Theme.danger : Theme.textPrimary)

                Spacer()

                switch trailing {
                case .chevron:
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.textTertiary)
                case .external:
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.textTertiary)
                case .none:
                    EmptyView()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Debug Sheet Modifier

#if DEBUG
struct DebugSheetModifier: ViewModifier {
    @Binding var showDebug: Bool
    let model: AppModel
    static let isDebug = true

    func body(content: Content) -> some View {
        content.sheet(isPresented: $showDebug) {
            DebugView()
                .environmentObject(model)
        }
    }
}
#else
struct DebugSheetModifier: ViewModifier {
    @Binding var showDebug: Bool
    let model: AppModel
    static let isDebug = false

    func body(content: Content) -> some View {
        content
    }
}
#endif
