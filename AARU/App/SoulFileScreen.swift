import SwiftUI

struct SoulFileScreen: View {
    @EnvironmentObject private var model: AppModel

    private let accentGold = Color(red: 0.83, green: 0.69, blue: 0.30)
    private let textPrimary = Color(red: 0.10, green: 0.10, blue: 0.10)
    private let surfaceBg = Color(red: 0.98, green: 0.98, blue: 0.98)

    private static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private var formattedLastUpdated: String? {
        let raw = model.visibleSoulFile.lastUpdated
        guard !raw.isEmpty else { return nil }
        guard let date = Self.iso8601.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    var body: some View {
        ZStack {
            surfaceBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    headerSection
                    portraitSection
                    soulSections
                    crystallizedMomentsSection
                    openThreadsSection
                }
                .padding(.horizontal, 24)
                .padding(.top, 40)
                .padding(.bottom, 40)
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 4) {
            Text("Soul Mirror")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(accentGold)
                .textCase(.uppercase)
                .tracking(2)

            if model.visibleSoulFile.version > 0 {
                Text("v\(model.visibleSoulFile.version)")
                    .font(.system(size: 12))
                    .foregroundStyle(textPrimary.opacity(0.4))
            }

            if model.isSoulFileUpdating {
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(accentGold)
                    Text("Updating...")
                        .font(.system(size: 11))
                        .foregroundStyle(textPrimary.opacity(0.4))
                }
            } else if let lastUpdated = formattedLastUpdated {
                Text("Updated \(lastUpdated)")
                    .font(.system(size: 11))
                    .foregroundStyle(textPrimary.opacity(0.3))
            }
        }
    }

    // MARK: - Portrait

    private var portraitSection: some View {
        Group {
            if let portrait = model.visibleSoulFile.portrait, !portrait.isEmpty {
                Text(portrait)
                    .font(.system(size: 24, weight: .light))
                    .foregroundStyle(textPrimary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(6)
            } else {
                VStack(spacing: 12) {
                    Text("Your soul file will take shape as we talk")
                        .font(.system(size: 20, weight: .light))
                        .foregroundStyle(textPrimary.opacity(0.6))
                    Text("Each conversation reveals a little more")
                        .font(.system(size: 14))
                        .foregroundStyle(textPrimary.opacity(0.4))
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - 7 Soul Sections

    private var soulSectionItems: [(title: String, content: String)] {
        let s = model.visibleSoulFile.sections
        return [
            ("How You Move", s.howYouMove),
            ("How You Think", s.howYouThink),
            ("How You Connect", s.howYouConnect),
            ("What You Carry", s.whatYouCarry),
            ("What Lights You Up", s.whatLightsYouUp),
            ("Your Contradictions", s.yourContradictions),
            ("Your Voice", s.yourVoice),
        ].filter { !$0.content.isEmpty }
    }

    private var soulSections: some View {
        Group {
            if !soulSectionItems.isEmpty {
                VStack(spacing: 24) {
                    ForEach(Array(soulSectionItems.enumerated()), id: \.offset) { _, item in
                        soulSectionView(title: item.title, content: item.content)
                    }
                }
            }
        }
    }

    private func soulSectionView(title: String, content: String) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(accentGold)
                .textCase(.uppercase)
                .tracking(1.5)

            Text(content)
                .font(.system(size: 15))
                .foregroundStyle(textPrimary.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
        }
    }

    // MARK: - Crystallized Moments

    private var crystallizedMomentsSection: some View {
        Group {
            if !model.visibleSoulFile.crystallizedMoments.isEmpty {
                VStack(spacing: 16) {
                    Text("Crystallized Moments")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.visibleSoulFile.crystallizedMoments.enumerated()), id: \.offset) { _, moment in
                        VStack(spacing: 6) {
                            Text("\"\(moment.quote)\"")
                                .font(.system(size: 14, weight: .light).italic())
                                .foregroundStyle(textPrimary.opacity(0.7))
                                .multilineTextAlignment(.center)

                            if !moment.reflection.isEmpty {
                                Text(moment.reflection)
                                    .font(.system(size: 12))
                                    .foregroundStyle(textPrimary.opacity(0.5))
                                    .multilineTextAlignment(.center)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    // MARK: - Open Threads

    private var openThreadsSection: some View {
        Group {
            if !model.visibleSoulFile.openThreads.isEmpty {
                VStack(spacing: 12) {
                    Text("Open Threads")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.visibleSoulFile.openThreads.enumerated()), id: \.offset) { _, thread in
                        Text(thread)
                            .font(.system(size: 14, weight: .light))
                            .foregroundStyle(textPrimary.opacity(0.6))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 16)
                    }
                }
            }
        }
    }
}
