import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirmation = false

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                    Text("Settings")
                        .font(Theme.sans(14, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(2)
                    Spacer()
                    // Balance spacer
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.clear)
                }
                .padding(.horizontal, 20)
                .frame(height: 52)

                Divider()
                    .frame(height: 0.5)
                    .overlay(Theme.divider)

                ScrollView {
                    VStack(spacing: 0) {
                        settingsRow(icon: "lock.shield", title: "Privacy Policy") {
                            if let url = URL(string: "https://trythumos.com/privacy") {
                                UIApplication.shared.open(url)
                            }
                        }

                        Divider()
                            .frame(height: 0.5)
                            .overlay(Theme.divider)
                            .padding(.horizontal, 20)

                        settingsRow(icon: "questionmark.circle", title: "Support") {
                            if let url = URL(string: "https://trythumos.com/support") {
                                UIApplication.shared.open(url)
                            }
                        }

                        Divider()
                            .frame(height: 0.5)
                            .overlay(Theme.divider)
                            .padding(.horizontal, 20)

                        // Delete My Data
                        Button {
                            showDeleteConfirmation = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "trash")
                                    .font(.system(size: 16))
                                    .foregroundStyle(Theme.errorText)
                                    .frame(width: 24)
                                Text("Delete My Data")
                                    .font(Theme.sans(16))
                                    .foregroundStyle(Theme.errorText)
                                Spacer()
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 16)
                        }
                        .disabled(model.isDeletingAccount)

                        Spacer().frame(height: 40)

                        Text("Thumos v\(appVersion)")
                            .font(Theme.sans(12))
                            .foregroundStyle(Theme.textTertiary)
                    }
                    .padding(.top, 8)
                }
            }
        }
        .preferredColorScheme(.dark)
        .alert("Delete All Data?", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete Everything", role: .destructive) {
                Task {
                    await model.deleteAccount()
                    dismiss()
                }
            }
        } message: {
            Text("This will permanently delete your conversations, soul file, and all associated data. This cannot be undone.")
        }
    }

    private func settingsRow(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 24)
                Text(title)
                    .font(Theme.sans(16))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textTertiary)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
    }
}
