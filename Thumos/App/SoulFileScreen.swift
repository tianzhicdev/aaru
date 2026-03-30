import SwiftUI

struct SoulFileScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var showPrivacy = false

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            ScrollView {
                soulFileFrame
                    .padding(.horizontal, 24)
                    .padding(.top, 40)
                    .padding(.bottom, 40)
            }
        }
        .sheet(isPresented: $showPrivacy) {
            privacySheet
        }
    }

    private var soulFileFrame: some View {
        VStack(spacing: 28) {
            titleSection

            if model.isSoulFileUpdating {
                loadingNotice
            }

            portraitSection
            compassSection
            soulSections
            crystallizedMomentsSection
            openThreadsSection
        }
        .padding(.horizontal, 20)
        .padding(.top, 36)
        .padding(.bottom, 24)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Theme.divider, lineWidth: 0.5)
        )
        .overlay(alignment: .top) {
            borderLock
                .padding(.horizontal, 28)
                .offset(y: -1)
        }
    }

    // MARK: - Border Lock

    private var borderLock: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 0.5)

            Button { showPrivacy = true } label: {
                Image(systemName: "lock.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.backgroundGradient)
            }
            .buttonStyle(.plain)

            Rectangle()
                .fill(Theme.divider)
                .frame(height: 0.5)
        }
    }

    // MARK: - Title

    private var titleSection: some View {
        VStack(spacing: 8) {
            Text("Soul File")
                .font(Theme.sans(12, weight: .medium))
                .foregroundStyle(Theme.accent)
                .textCase(.uppercase)
                .tracking(1.8)

            Text("A living portrait that deepens as you talk.")
                .font(Theme.sans(14, weight: .light))
                .foregroundStyle(Theme.textTertiary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Loading Notice

    private var loadingNotice: some View {
        VStack(spacing: 10) {
            ProgressView()
                .scaleEffect(0.75)
                .tint(Theme.accentBright)

            Text("Your soul file is updating.")
                .font(Theme.sans(15, weight: .medium))
                .foregroundStyle(Theme.textPrimary)

            Text("This can take a few minutes after a deeper conversation.")
                .font(Theme.sans(14, weight: .light))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - Privacy Sheet

    private var privacySheet: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer().frame(height: 32)

                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 40, weight: .thin))
                    .foregroundStyle(Theme.accent)

                Text("Private & Secure")
                    .font(Theme.serif(24, weight: .light))
                    .foregroundStyle(Theme.textPrimary)

                Text("Only you can see your soul file. Nothing here is shared with anyone else, and you can delete everything anytime from Settings.")
                    .font(Theme.sans(15, weight: .light))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 32)

                Spacer()

                Button { showPrivacy = false } label: {
                    Text("Got It")
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
        .presentationDetents([.medium])
        .preferredColorScheme(.dark)
    }

    // MARK: - Portrait

    private var portraitSection: some View {
        Group {
            if let portrait = model.visibleSoulFile.portrait, !portrait.isEmpty {
                Text(portrait)
                    .font(Theme.serif(28, weight: .light))
                    .foregroundStyle(Theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(6)
            } else {
                VStack(spacing: 12) {
                    Text("Your soul file will take shape as we talk")
                        .font(Theme.serif(24, weight: .light))
                        .foregroundStyle(Theme.textSecondary)
                    Text("Each conversation reveals a little more")
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.textTertiary)
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Soul Compass

    private var compassSection: some View {
        Group {
            if let scores = model.visibleSoulFile.compassScores,
               scores.values.contains(where: { $0 != nil }) {
                SoulCompassView(scores: scores)
            }
        }
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
                VStack(spacing: 0) {
                    ForEach(Array(soulSectionItems.enumerated()), id: \.offset) { index, item in
                        if index > 0 {
                            Divider()
                                .frame(height: 0.5)
                                .overlay(Theme.divider)
                                .padding(.vertical, 12)
                        }
                        soulSectionView(title: item.title, content: item.content)
                    }
                }
            }
        }
    }

    private func soulSectionView(title: String, content: String) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .font(Theme.sans(12, weight: .medium))
                .foregroundStyle(Theme.accent)
                .textCase(.uppercase)
                .tracking(1.5)

            Text(content)
                .font(Theme.serif(18))
                .foregroundStyle(Theme.textSecondary)
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
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.visibleSoulFile.crystallizedMoments.enumerated()), id: \.offset) { _, moment in
                        VStack(spacing: 6) {
                            Text("\"\(moment.quote)\"")
                                .font(Theme.serifItalic(17))
                                .foregroundStyle(Theme.textSecondary)
                                .multilineTextAlignment(.center)

                            if !moment.reflection.isEmpty {
                                Text(moment.reflection)
                                    .font(Theme.serif(15))
                                    .foregroundStyle(Theme.textTertiary)
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
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.visibleSoulFile.openThreads.enumerated()), id: \.offset) { _, thread in
                        Text(thread)
                            .font(Theme.serif(17, weight: .light))
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 16)
                    }
                }
            }
        }
    }
}
