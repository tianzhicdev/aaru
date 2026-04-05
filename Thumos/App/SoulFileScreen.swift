import StoreKit
import SwiftUI

struct SoulFileScreen: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.requestReview) private var requestReview

    @State private var showPrivacy = false
    @State private var expandedSections: Set<String> = []
    @State private var reviewTimer: Timer?

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
        .onAppear {
            reviewTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { _ in
                Task { @MainActor in
                    guard model.visibleSoulFile.version >= 2,
                          !model.isSoulFileUpdating else { return }
                    requestReview()
                }
            }
        }
        .onDisappear {
            reviewTimer?.invalidate()
            reviewTimer = nil
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
            personalitySpectrumSection
            topValuesSection
            relationalStyleSection
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

    private var compassSection: some View {
        Group {
            if let scores = model.visibleSoulFile.compassScores,
               scores.values.contains(where: { $0 != nil }) {
                SoulCompassView(scores: scores)
            }
        }
    }

    private var personalitySpectrumSection: some View {
        Group {
            if let spectrum = model.visibleSoulFile.personalitySpectrum,
               spectrum.hasAnyEntry {
                PersonalitySpectrumView(spectrum: spectrum)
            }
        }
    }

    private var topValuesSection: some View {
        Group {
            if let values = model.visibleSoulFile.topValues,
               !values.isEmpty {
                TopValuesView(values: values)
            }
        }
    }

    private var relationalStyleSection: some View {
        Group {
            if let relationalStyle = model.visibleSoulFile.relationalStyle,
               !relationalStyle.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Relational Style")
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    Text(relationalStyle)
                        .font(Theme.serif(18))
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.leading)
                        .lineSpacing(4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var soulSectionItems: [(title: String, content: String)] {
        let sections = model.visibleSoulFile.sections
        return [
            ("How You Move", sections.howYouMove),
            ("How You Think", sections.howYouThink),
            ("How You Connect", sections.howYouConnect),
            ("What You Carry", sections.whatYouCarry),
            ("What Lights You Up", sections.whatLightsYouUp),
            ("Your Tensions", sections.yourTensions),
            ("Your Voice", sections.yourVoice)
        ].filter { !$0.content.isEmpty }
    }

    private var soulSections: some View {
        Group {
            if !soulSectionItems.isEmpty {
                VStack(spacing: 10) {
                    ForEach(soulSectionItems, id: \.title) { item in
                        DisclosureGroup(
                            isExpanded: binding(for: item.title),
                            content: {
                                Text(item.content)
                                    .font(Theme.serif(18))
                                    .foregroundStyle(Theme.textSecondary)
                                    .multilineTextAlignment(.leading)
                                    .lineSpacing(4)
                                    .padding(.top, 8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            },
                            label: {
                                Text(item.title)
                                    .font(Theme.sans(12, weight: .medium))
                                    .foregroundStyle(Theme.accent)
                                    .textCase(.uppercase)
                                    .tracking(1.5)
                            }
                        )
                        .tint(Theme.accentBright)
                        .padding(14)
                        .background(Theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
        }
    }

    private var crystallizedMomentsSection: some View {
        Group {
            if !model.visibleSoulFile.crystallizedMoments.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Crystallized Moments")
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(Array(model.visibleSoulFile.crystallizedMoments.enumerated()), id: \.offset) { _, moment in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("\"\(moment.quote)\"")
                                        .font(Theme.serifItalic(16))
                                        .foregroundStyle(Theme.textPrimary)
                                        .multilineTextAlignment(.leading)

                                    Text(moment.reflection)
                                        .font(Theme.serif(14))
                                        .foregroundStyle(Theme.textSecondary)
                                        .multilineTextAlignment(.leading)
                                        .lineSpacing(3)
                                }
                                .frame(width: 220, alignment: .leading)
                                .padding(16)
                                .background(Theme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .padding(.horizontal, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var openThreadsSection: some View {
        Group {
            if !model.visibleSoulFile.openThreads.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Open Threads")
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.visibleSoulFile.openThreads.enumerated()), id: \.offset) { _, thread in
                        Text(thread)
                            .font(Theme.serif(17, weight: .light))
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.leading)
                            .lineSpacing(3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func binding(for title: String) -> Binding<Bool> {
        Binding(
            get: { expandedSections.contains(title) },
            set: { isExpanded in
                if isExpanded {
                    expandedSections.insert(title)
                } else {
                    expandedSections.remove(title)
                }
            }
        )
    }
}
