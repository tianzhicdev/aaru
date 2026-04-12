import SwiftUI

// MARK: - Data Model

struct ConnectionZone {
    let theme: String
    let density: Float
}

struct MatchVisualizationData {
    let zones: [ConnectionZone]
    let highlightedPhrases: [String]

    static let mock = MatchVisualizationData(
        zones: [
            ConnectionZone(theme: "LOYALTY", density: 0.92),
            ConnectionZone(theme: "QUIET AMBITION", density: 0.55),
            ConnectionZone(theme: "VULNERABILITY", density: 0.30),
        ],
        highlightedPhrases: ["loyalty under pressure", "shared depth", "productive friction"]
    )
}

// MARK: - Connection Lines

private struct MatchConnectionLines: View {
    let zones: [ConnectionZone]
    private let gold = Color(red: 0.831, green: 0.690, blue: 0.302)
    private let lineSpacing: CGFloat = 4
    private let strokeWeight: CGFloat = 0.5

    var body: some View {
        Canvas { context, size in
            var yOffset: CGFloat = 0

            for zone in zones {
                let lineCount = lineCount(for: zone.density)
                let bandHeight = CGFloat(lineCount - 1) * lineSpacing
                let bandCenter = yOffset + bandHeight / 2 + 16

                // Measure label for gap
                let resolvedText = context.resolve(Text(zone.theme)
                    .font(Theme.sans(9, weight: .medium))
                    .foregroundColor(gold.opacity(0.6)))
                let textSize = resolvedText.measure(in: CGSize(width: size.width, height: 100))
                let gapPadding: CGFloat = 12
                let gapHalf = (textSize.width + gapPadding * 2) / 2
                let center = size.width / 2

                // Draw parallel lines
                let opacity = baseOpacity(for: zone.density)
                for i in 0..<lineCount {
                    let y = bandCenter - bandHeight / 2 + CGFloat(i) * lineSpacing
                    var left = Path()
                    left.move(to: CGPoint(x: 0, y: y))
                    left.addLine(to: CGPoint(x: center - gapHalf, y: y))

                    var right = Path()
                    right.move(to: CGPoint(x: center + gapHalf, y: y))
                    right.addLine(to: CGPoint(x: size.width, y: y))

                    context.stroke(left, with: .color(gold.opacity(opacity)),
                                   style: StrokeStyle(lineWidth: strokeWeight))
                    context.stroke(right, with: .color(gold.opacity(opacity)),
                                   style: StrokeStyle(lineWidth: strokeWeight))
                }

                // Label centered in gap
                context.draw(resolvedText, at: CGPoint(x: center, y: bandCenter), anchor: .center)

                yOffset = bandCenter + bandHeight / 2 + 24
            }

            // Background filler lines
            for i in 0..<3 {
                let y = yOffset + 16 + CGFloat(i) * 20
                guard y < size.height else { break }
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(gold.opacity(0.04)),
                               style: StrokeStyle(lineWidth: 0.3, dash: [4, 4]))
            }
        }
    }

    /// density > 0.7 → 5 lines, 0.4–0.7 → 3 lines, < 0.4 → 1 line
    private func lineCount(for density: Float) -> Int {
        if density > 0.7 { return 5 }
        if density >= 0.4 { return 3 }
        return 1
    }

    private func baseOpacity(for density: Float) -> Double {
        if density > 0.7 { return 0.28 }
        if density >= 0.4 { return 0.18 }
        return 0.10
    }
}

// MARK: - Main View

struct MatchVisualizationView: View {
    let match: SoulmateMatch
    var vizData: MatchVisualizationData = .mock

    private let gold = Color(red: 0.831, green: 0.690, blue: 0.302)
    private let noteColor = Color(red: 0.690, green: 0.678, blue: 0.643)

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // YOU / Name labels
                HStack {
                    Text("YOU")
                        .font(Theme.sans(10, weight: .medium))
                        .foregroundStyle(gold.opacity(0.4))
                        .tracking(1.4)
                    Spacer()
                    Text(match.displayName.uppercased())
                        .font(Theme.sans(10, weight: .medium))
                        .foregroundStyle(gold.opacity(0.4))
                        .tracking(1.4)
                }
                .padding(.horizontal, 28)
                .padding(.top, 40)
                .padding(.bottom, 12)

                // Connection lines
                MatchConnectionLines(zones: vizData.zones)
                    .frame(height: CGFloat(vizData.zones.count + 2) * 44)
                    .padding(.horizontal, 28)
                    .padding(.bottom, 32)

                // Reasoning text with highlights
                if let reasoning = match.reasoning, !reasoning.isEmpty {
                    buildHighlightedText(reasoning)
                        .lineSpacing(5)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 28)
                        .padding(.bottom, 28)
                }
            }
        }
        .background(Theme.backgroundGradient)
    }

    // MARK: - Highlighted Text

    private func buildHighlightedText(_ text: String) -> Text {
        var result = Text("")
        var remaining = text[text.startIndex...]

        while !remaining.isEmpty {
            var earliest: (range: Range<Substring.Index>, phrase: String)?
            for phrase in vizData.highlightedPhrases {
                if let range = remaining.range(of: phrase, options: .caseInsensitive) {
                    if earliest == nil || range.lowerBound < earliest!.range.lowerBound {
                        earliest = (range, phrase)
                    }
                }
            }

            if let match = earliest {
                let before = remaining[remaining.startIndex..<match.range.lowerBound]
                if !before.isEmpty {
                    result = result + Text(String(before))
                        .font(Theme.serifItalic(15))
                        .foregroundColor(noteColor)
                }
                result = result + Text(String(remaining[match.range]))
                    .font(Theme.serif(15, weight: .medium))
                    .foregroundColor(gold)
                remaining = remaining[match.range.upperBound...]
            } else {
                result = result + Text(String(remaining))
                    .font(Theme.serifItalic(15))
                    .foregroundColor(noteColor)
                break
            }
        }

        return result
    }
}
