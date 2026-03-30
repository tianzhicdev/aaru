import SwiftUI

struct PersonalitySpectrumView: View {
    let spectrum: PersonalitySpectrum

    @State private var selectedTrait: String?

    private static let traits: [(key: String, title: String, leftPole: String, rightPole: String)] = [
        ("openness", "Openness", "Consistency", "Curiosity"),
        ("conscientiousness", "Conscientiousness", "Spontaneity", "Structure"),
        ("extraversion", "Extraversion", "Solitude", "Engagement"),
        ("agreeableness", "Agreeableness", "Challenge", "Harmony"),
        ("emotionalSensitivity", "Emotional Sensitivity", "Calm", "Sensitive")
    ]

    var body: some View {
        let entries = availableEntries
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 18) {
                Text("Personality Spectrum")
                    .font(Theme.sans(12, weight: .medium))
                    .foregroundStyle(Theme.accent)
                    .textCase(.uppercase)
                    .tracking(1.5)

                ForEach(entries, id: \.key) { trait in
                    VStack(alignment: .leading, spacing: 10) {
                        Button {
                            withAnimation(.easeOut(duration: 0.2)) {
                                selectedTrait = selectedTrait == trait.key ? nil : trait.key
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(trait.leftPole)
                                        .font(Theme.sans(11, weight: .light))
                                        .foregroundStyle(Theme.textTertiary)

                                    Spacer()

                                    Text(trait.rightPole)
                                        .font(Theme.sans(11, weight: .light))
                                        .foregroundStyle(Theme.textTertiary)
                                }

                                GeometryReader { geometry in
                                    let clampedPosition = max(0, min(100, trait.entry.position))
                                    let dotOffset = geometry.size.width * CGFloat(clampedPosition / 100.0)

                                    ZStack(alignment: .leading) {
                                        Capsule()
                                            .fill(Theme.divider)
                                            .frame(height: 2)

                                        Circle()
                                            .fill(Theme.accentBright)
                                            .frame(width: selectedTrait == trait.key ? 10 : 8, height: selectedTrait == trait.key ? 10 : 8)
                                            .offset(x: max(0, min(geometry.size.width - 10, dotOffset - 5)))
                                            .shadow(color: Theme.accentBright.opacity(0.35), radius: selectedTrait == trait.key ? 8 : 0)
                                    }
                                }
                                .frame(height: 12)
                            }
                        }
                        .buttonStyle(.plain)

                        if selectedTrait == trait.key {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(trait.entry.label)
                                    .font(Theme.serif(17))
                                    .foregroundStyle(Theme.textPrimary)
                                    .multilineTextAlignment(.leading)

                                if !trait.entry.evidence.isEmpty {
                                    Text(trait.entry.evidence)
                                        .font(Theme.sans(12, weight: .light))
                                        .foregroundStyle(Theme.textSecondary)
                                        .multilineTextAlignment(.leading)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .transition(.move(edge: .top).combined(with: .opacity))
                        }
                    }
                }
            }
            .animation(.easeOut(duration: 0.2), value: selectedTrait)
        }
    }

    private var availableEntries: [(key: String, title: String, leftPole: String, rightPole: String, entry: SpectrumEntry)] {
        Self.traits.compactMap { trait in
            guard let entry = entry(for: trait.key) else { return nil }
            return (trait.key, trait.title, trait.leftPole, trait.rightPole, entry)
        }
    }

    private func entry(for key: String) -> SpectrumEntry? {
        switch key {
        case "openness":
            return spectrum.openness
        case "conscientiousness":
            return spectrum.conscientiousness
        case "extraversion":
            return spectrum.extraversion
        case "agreeableness":
            return spectrum.agreeableness
        case "emotionalSensitivity":
            return spectrum.emotionalSensitivity
        default:
            return nil
        }
    }
}
