#if DEBUG
import SwiftUI

struct DebugView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var deviceIDInput = ""
    @State private var selectedEnvironment = BackendEnvironmentKind.dev
    @State private var selectedModelProfileID = "value_default"
    @State private var customBaseURLInput = ""
    @State private var debugTokenInput = ""
    @State private var backendStatusMessage: String?

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Divider().frame(height: 0.5).overlay(Theme.divider)

                ScrollView {
                    VStack(spacing: 24) {
                        backendSection
                        identitySection
                        if let errorText = model.debugError {
                            errorSection(errorText)
                        }
                        rawJsonSection("Steering Preview", key: "steering_preview")
                        rawJsonSection("Reflection Note", key: "reflection_note")
                        rawJsonSection("Visible Soul File", key: "visible_soul_file")
                        impersonateSection
                        rawJsonSection("Hidden Soul File", key: "hidden_soul_file")
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            syncBackendFormFromModel()
            if canFetchDebugInfo {
                await model.fetchDebugInfo()
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            Text("Debug")
                .font(Theme.sans(14, weight: .medium))
                .foregroundStyle(Theme.accent)
                .textCase(.uppercase)
                .tracking(2)
            Spacer()
            if model.isLoadingDebugInfo {
                ProgressView().scaleEffect(0.7).tint(Theme.accentBright)
            } else {
                Button {
                    Task {
                        if canFetchDebugInfo {
                            await model.fetchDebugInfo()
                        }
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
        .padding(.horizontal, 20)
        .frame(height: 52)
    }

    // MARK: - Backend

    private var canFetchDebugInfo: Bool {
        !debugTokenInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var availableModelProfiles: [DebugModelProfileOption] {
        let options = model.debugInfo?.availableModelProfiles ?? []
        if !options.isEmpty {
            return options
        }
        return [
            DebugModelProfileOption(id: "value_default", label: "Kimi K2 Thinking"),
            DebugModelProfileOption(id: "value_cjk", label: "DeepSeek V3.2 (CJK)"),
            DebugModelProfileOption(id: "frontier", label: "Anthropic frontier stack")
        ]
    }

    private var backendSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Backend")

            Picker("Endpoint", selection: $selectedEnvironment) {
                ForEach(BackendEnvironmentKind.allCases) { environment in
                    Text(environment.title).tag(environment)
                }
            }
            .pickerStyle(.menu)
            .tint(Theme.textPrimary)

            if selectedEnvironment == .custom {
                TextField("Custom base URL", text: $customBaseURLInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.textPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            SecureField("Debug token", text: $debugTokenInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(Theme.sans(13))
                .foregroundStyle(Theme.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            debugRow("Current URL", model.backendConfiguration.baseURLString.isEmpty ? "—" : model.backendConfiguration.baseURLString)
            debugRow("Namespace", model.backendConfiguration.storageNamespace)
            debugRow("Model Profile", model.debugInfo?.modelProfileId ?? selectedModelProfileID)

            if let backendStatusMessage {
                Text(backendStatusMessage)
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.textTertiary)
            }

            Button {
                Task {
                    if selectedEnvironment == .custom,
                       customBaseURLInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        backendStatusMessage = "Enter a custom base URL first."
                        return
                    }

                    backendStatusMessage = "Applying backend..."
                    await model.updateDebugBackend(
                        environment: selectedEnvironment,
                        customBaseURLString: customBaseURLInput,
                        debugApiToken: debugTokenInput
                    )
                    syncBackendFormFromModel()
                    if selectedEnvironment == .custom, model.backendConfiguration.functionBaseURL == nil {
                        backendStatusMessage = "Custom base URL is invalid."
                        return
                    }
                    backendStatusMessage = "Using \(model.backendConfiguration.baseURLString)"
                    if canFetchDebugInfo {
                        await model.fetchDebugInfo()
                    }
                }
            } label: {
                Text("Apply Backend")
                    .font(Theme.sans(13, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Theme.accentBright)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            Picker("Model Profile", selection: $selectedModelProfileID) {
                ForEach(availableModelProfiles) { option in
                    Text(option.label).tag(option.id)
                }
            }
            .pickerStyle(.menu)
            .tint(Theme.textPrimary)

            Button {
                Task {
                    backendStatusMessage = "Updating model profile..."
                    await model.updateDebugModelProfile(selectedModelProfileID)
                    selectedModelProfileID = model.debugInfo?.modelProfileId ?? selectedModelProfileID
                    backendStatusMessage = "Using model profile \(selectedModelProfileID)"
                }
            } label: {
                Text("Apply Model Profile")
                    .font(Theme.sans(13, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Theme.accentBright)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Identity

    private var identitySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Identity")
            debugRow("Environment", model.backendConfiguration.environment.rawValue)
            debugRow("User ID", model.debugInfo?.userId ?? "—")
            debugRow("Device ID", model.debugInfo?.deviceId ?? model.deviceID)
            debugRow("Session Token", model.backend.sessionToken != nil ? "active" : "none")
        }
    }

    // MARK: - Error

    private func errorSection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Error")
            Text(text)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Theme.errorText)
                .textSelection(.enabled)
        }
    }

    // MARK: - Raw JSON Section

    private func rawJsonSection(_ title: String, key: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title)
            if let json = model.debugRawSections[key] {
                Text(json)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.textSecondary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("—")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }

    // MARK: - Impersonate

    private var impersonateSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Impersonate Device")
            HStack(spacing: 8) {
                TextField("Device ID to impersonate", text: $deviceIDInput)
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.textPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Button {
                    Task { await model.impersonateDevice(deviceIDInput) }
                } label: {
                    Text("Go")
                        .font(Theme.sans(13, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Theme.accentBright)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            if model.debugDeviceIDOverride != nil {
                Button {
                    deviceIDInput = ""
                    Task { await model.impersonateDevice("") }
                } label: {
                    Text("Reset to real device")
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.errorText)
                }
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(Theme.sans(12, weight: .medium))
            .foregroundStyle(Theme.accent)
            .textCase(.uppercase)
            .tracking(1.5)
    }

    private func debugRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(Theme.sans(12))
                .foregroundStyle(Theme.textTertiary)
                .frame(width: 100, alignment: .leading)
            Text(value)
                .font(Theme.sans(12))
                .foregroundStyle(Theme.textSecondary)
                .textSelection(.enabled)
            Spacer()
        }
    }

    private func syncBackendFormFromModel() {
        selectedEnvironment = model.backendConfiguration.environment
        customBaseURLInput = model.backendConfiguration.customBaseURLString ?? ""
        debugTokenInput = model.backendConfiguration.debugApiToken ?? ""
        selectedModelProfileID = model.debugInfo?.modelProfileId ?? selectedModelProfileID
    }
}
#endif
