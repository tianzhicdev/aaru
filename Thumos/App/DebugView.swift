#if DEBUG
import SwiftUI

struct DebugView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var deviceIDInput = ""

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Divider().frame(height: 0.5).overlay(Theme.divider)

                ScrollView {
                    VStack(spacing: 24) {
                        identitySection
                        steeringSection
                        reflectionNoteSection
                        visibleSoulFileSection
                        impersonateSection
                        hiddenSoulFileSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            await model.fetchDebugInfo()
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
                    Task { await model.fetchDebugInfo() }
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

    // MARK: - Identity

    private var identitySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Identity")
            debugRow("User ID", model.debugInfo?.userId ?? "—")
            debugRow("Device ID", model.debugInfo?.deviceId ?? model.deviceID)
            debugRow("Session Token", model.backend.sessionToken != nil ? "active" : "none")
        }
    }

    // MARK: - Steering

    private var steeringSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Steering")
            debugRow("Source", model.debugInfo?.steeringSource ?? "none")

            if let steering = model.debugInfo?.steeringPreview {
                if !steering.currentlyLiveTopics.isEmpty {
                    debugSubheader("Currently Live")
                    ForEach(steering.currentlyLiveTopics, id: \.self) { bulletText($0) }
                }

                if !steering.safeEntryPoints.isEmpty {
                    debugSubheader("Safe Entry Points")
                    ForEach(steering.safeEntryPoints, id: \.self) { bulletText($0) }
                }

                if !steering.unlockTopics.isEmpty {
                    debugSubheader("Unlock Topics")
                    ForEach(steering.unlockTopics, id: \.self) { bulletText($0) }
                }

                if !steering.avoidEarly.isEmpty {
                    debugSubheader("Approach Carefully")
                    ForEach(steering.avoidEarly, id: \.self) { bulletText($0) }
                }

                if !steering.domainCoverage.isEmpty {
                    debugSubheader("Domain Coverage")
                    ForEach(Array(steering.domainCoverage.enumerated()), id: \.offset) { _, entry in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(entry.domain) — \(entry.depth)")
                                .font(Theme.sans(12, weight: .medium))
                                .foregroundStyle(Theme.textSecondary)
                            if !entry.evidence.isEmpty {
                                Text(entry.evidence)
                                    .font(Theme.sans(12))
                                    .foregroundStyle(Theme.textTertiary)
                            }
                        }
                        .padding(.leading, 8)
                    }
                }
            }
        }
    }

    // MARK: - Reflection Note

    private var reflectionNoteSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Reflection Note")

            if let note = model.debugInfo?.reflectionNote {
                debugRow("Updated", note.updatedAt)

                if !note.recurringThemes.isEmpty {
                    debugSubheader("Recurring Themes")
                    ForEach(note.recurringThemes, id: \.self) { bulletText($0) }
                }

                if !note.tensions.isEmpty {
                    debugSubheader("Tensions")
                    ForEach(note.tensions, id: \.self) { bulletText($0) }
                }

                if !note.notableAbsences.isEmpty {
                    debugSubheader("Notable Absences")
                    ForEach(note.notableAbsences, id: \.self) { bulletText($0) }
                }

                if !note.emotionalArc.isEmpty {
                    debugRow("Emotional Arc", note.emotionalArc)
                }

                if !note.factualAnchors.isEmpty {
                    debugSubheader("Factual Anchors")
                    ForEach(note.factualAnchors.keys.sorted(), id: \.self) { key in
                        if let value = note.factualAnchors[key] {
                            bulletText("\(key): \(value)")
                        }
                    }
                }
            } else {
                Text("No reflection note yet")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }

    // MARK: - Visible Soul File

    private var visibleSoulFileSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Visible Soul File")
            if let visible = model.debugInfo?.visibleSoulFile {
                debugRow("Version", "\(visible.version)")
                debugRow("Last Updated", visible.lastUpdated)
                debugRow("Portrait", visible.portrait ?? "—")
                debugRow("Open Threads", "\(visible.openThreads.count)")
                debugRow("Moments", "\(visible.crystallizedMoments.count)")
            } else {
                Text("No visible soul file yet")
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

    // MARK: - Hidden Soul File

    private var hiddenSoulFileSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Hidden Soul File")

            if let hidden = model.debugInfo?.hiddenSoulFile {
                debugRow("Version", "\(hidden.version)")
                debugRow("Confidence", hidden.confidence)
                debugRow("Last Updated", hidden.lastUpdated)

                if !hidden.coreValues.isEmpty {
                    debugSubheader("Core Values")
                    ForEach(hidden.coreValues, id: \.self) { value in
                        bulletText(value)
                    }
                }

                if !hidden.coreDrivers.isEmpty {
                    debugSubheader("Core Drivers")
                    ForEach(Array(hidden.coreDrivers.enumerated()), id: \.offset) { _, driver in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(driver.driver) — \(String(format: "%.0f%%", driver.strength * 100))")
                                .font(Theme.sans(13, weight: .medium))
                                .foregroundStyle(Theme.textSecondary)
                            Text(driver.evidence)
                                .font(Theme.sans(12))
                                .foregroundStyle(Theme.textTertiary)
                        }
                        .padding(.leading, 8)
                    }
                }

                expertSection("Psychologist", hidden.expertReflections.psychologist)
                expertSection("Sociologist", hidden.expertReflections.sociologist)
                expertSection("Linguist", hidden.expertReflections.linguist)
                expertSection("Narrative Analyst", hidden.expertReflections.narrativeAnalyst)

                if !hidden.analystNotes.isEmpty {
                    debugSubheader("Analyst Notes")
                    ForEach(hidden.analystNotes, id: \.self) { note in
                        bulletText(note)
                    }
                }

                voiceSection(hidden.voice)
                depthMapSection(hidden.depthMap)
            } else {
                Text("No hidden soul file yet")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.textTertiary)
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

    private func debugSubheader(_ title: String) -> some View {
        Text(title)
            .font(Theme.sans(11, weight: .medium))
            .foregroundStyle(Theme.accentBright)
            .padding(.top, 4)
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

    private func bulletText(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Text("•")
                .font(Theme.sans(12))
                .foregroundStyle(Theme.textTertiary)
            Text(text)
                .font(Theme.sans(12))
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(.leading, 8)
    }

    @ViewBuilder
    private func expertSection(_ title: String, _ reflections: [String]) -> some View {
        if !reflections.isEmpty {
            debugSubheader(title)
            ForEach(reflections, id: \.self) { reflection in
                bulletText(reflection)
            }
        }
    }

    @ViewBuilder
    private func voiceSection(_ voice: VoiceProfile) -> some View {
        debugSubheader("Voice Profile")
        debugRow("Register", voice.register)
        debugRow("Density", voice.density)
        if !voice.humorStyle.isEmpty { debugRow("Humor", voice.humorStyle) }
        if !voice.conflictStyle.isEmpty { debugRow("Conflict", voice.conflictStyle) }
        debugRow("Disclosure", voice.disclosureRate)
        if !voice.signaturePatterns.isEmpty {
            ForEach(voice.signaturePatterns, id: \.self) { pattern in
                bulletText(pattern)
            }
        }
    }

    @ViewBuilder
    private func depthMapSection(_ map: DepthMap) -> some View {
        debugSubheader("Depth Map")
        if !map.safeEntryPoints.isEmpty {
            Text("Safe Entry Points:").font(Theme.sans(11)).foregroundStyle(Theme.textTertiary).padding(.leading, 8)
            ForEach(map.safeEntryPoints, id: \.self) { bulletText($0) }
        }
        if !map.unlockTopics.isEmpty {
            Text("Unlock Topics:").font(Theme.sans(11)).foregroundStyle(Theme.textTertiary).padding(.leading, 8)
            ForEach(map.unlockTopics, id: \.self) { bulletText($0) }
        }
        if !map.avoidEarly.isEmpty {
            Text("Avoid Early:").font(Theme.sans(11)).foregroundStyle(Theme.textTertiary).padding(.leading, 8)
            ForEach(map.avoidEarly, id: \.self) { bulletText($0) }
        }
        if !map.currentlyLiveTopics.isEmpty {
            Text("Live Topics:").font(Theme.sans(11)).foregroundStyle(Theme.textTertiary).padding(.leading, 8)
            ForEach(map.currentlyLiveTopics, id: \.self) { bulletText($0) }
        }
    }
}
#endif
