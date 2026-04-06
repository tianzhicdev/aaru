import Foundation
import SwiftUI

struct SoulCompassView: View {
    let scores: [String: Double?]

    @State private var selectedAxis: String?

    private static let axes: [(key: String, label: String, detail: String)] = [
        ("openness", "Openness", "How willing you seem to explore complexity, novelty, and new frames of meaning."),
        ("vitality", "Vitality", "How much life-force, momentum, and felt aliveness comes through in your words."),
        ("warmth", "Warmth", "How much care, tenderness, and emotional generosity appears in the conversation."),
        ("connection", "Connection", "How strongly you orient toward belonging, intimacy, and relational investment."),
        ("resilience", "Resilience", "How much recovery, adaptability, and emotional sturdiness shows up under pressure."),
        ("purpose", "Purpose", "How clearly your words point toward meaning, direction, or an organizing why."),
        ("depth", "Depth", "How readily you move into nuance, reflection, paradox, and layered inner life."),
        ("autonomy", "Autonomy", "How strongly self-direction, agency, and independent choice appear in your story.")
    ]

    private let radius: CGFloat = 90
    private let axisCount = 8

    var body: some View {
        VStack(spacing: 16) {
            Text("Soul Compass")
                .font(Theme.sans(12, weight: .medium))
                .foregroundStyle(Theme.accent)
                .textCase(.uppercase)
                .tracking(1.5)

            ZStack {
                axisLines
                gridRings
                scorePolygon
                axisLabels
            }
            .frame(width: radius * 2 + 60, height: radius * 2 + 60)

            if let selectedAxis, let axis = axisMeta(for: selectedAxis) {
                detailCard(axis: axis)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: selectedAxis)
    }

    private var axisLines: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            for i in 0..<axisCount {
                let angle = angleFor(index: i)
                let end = pointAt(center: center, radius: radius, angle: angle)
                let hasScore = scoreValue(for: Self.axes[i].key) != nil
                var path = Path()
                path.move(to: center)
                path.addLine(to: end)
                context.stroke(
                    path,
                    with: .color(Theme.goldBase.opacity(0.15)),
                    style: StrokeStyle(
                        lineWidth: 0.5,
                        dash: hasScore ? [] : [4, 4]
                    )
                )
            }
        }
    }

    private var gridRings: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            for ring in [0.25, 0.5, 0.75, 1.0] {
                let ringRadius = radius * ring
                var path = Path()
                for i in 0..<axisCount {
                    let angle = angleFor(index: i)
                    let point = pointAt(center: center, radius: ringRadius, angle: angle)
                    if i == 0 {
                        path.move(to: point)
                    } else {
                        path.addLine(to: point)
                    }
                }
                path.closeSubpath()
                context.stroke(
                    path,
                    with: .color(Theme.goldBase.opacity(0.08)),
                    lineWidth: 0.5
                )
            }
        }
    }

    private var scorePolygon: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            var points: [CGPoint] = []
            for i in 0..<axisCount {
                if let value = scoreValue(for: Self.axes[i].key) {
                    let angle = angleFor(index: i)
                    let pointRadius = radius * CGFloat(value) / 100.0
                    points.append(pointAt(center: center, radius: pointRadius, angle: angle))
                }
            }
            guard points.count >= 3 else { return }

            var path = Path()
            path.move(to: points[0])
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
            path.closeSubpath()

            context.fill(
                path,
                with: .color(Theme.goldBase.opacity(0.15))
            )
            context.stroke(
                path,
                with: .color(Theme.goldBase.opacity(0.60)),
                lineWidth: 1.5
            )

            for point in points {
                let rect = CGRect(x: point.x - 2.5, y: point.y - 2.5, width: 5, height: 5)
                context.fill(
                    Path(ellipseIn: rect),
                    with: .color(Theme.goldBase.opacity(0.70))
                )
            }
        }
    }

    private var axisLabels: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ForEach(0..<axisCount, id: \.self) { index in
                let axis = Self.axes[index]
                let angle = angleFor(index: index)
                let labelRadius = radius + 22
                let point = pointAt(center: center, radius: labelRadius, angle: angle)
                let hasScore = scoreValue(for: axis.key) != nil

                Button {
                    withAnimation(.easeOut(duration: 0.2)) {
                        selectedAxis = selectedAxis == axis.key ? nil : axis.key
                    }
                } label: {
                    Text(axis.label)
                        .font(Theme.sans(9, weight: .light))
                        .foregroundStyle(labelColor(for: axis.key, hasScore: hasScore))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(selectedAxis == axis.key ? Theme.surface : .clear)
                        )
                }
                .buttonStyle(.plain)
                .position(point)
            }
        }
    }

    private func detailCard(axis: (key: String, label: String, detail: String)) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(axis.label)
                    .font(Theme.sans(12, weight: .medium))
                    .foregroundStyle(Theme.accent)
                    .textCase(.uppercase)
                    .tracking(1.3)

                Spacer()

                Text(scoreText(for: axis.key))
                    .font(Theme.sans(13, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
            }

            Text(axis.detail)
                .font(Theme.serif(16))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.leading)
                .lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func labelColor(for key: String, hasScore: Bool) -> Color {
        if selectedAxis == key {
            return Theme.accentBright
        }
        return hasScore ? Theme.textSecondary : Theme.textTertiary
    }

    private func scoreText(for key: String) -> String {
        if let score = scoreValue(for: key) {
            return "\(Int(score.rounded())) / 100"
        }
        return "Not enough signal yet"
    }

    private func axisMeta(for key: String) -> (key: String, label: String, detail: String)? {
        Self.axes.first(where: { $0.key == key })
    }

    private func angleFor(index: Int) -> Double {
        let step = (2 * .pi) / Double(axisCount)
        return step * Double(index) - .pi / 2
    }

    private func pointAt(center: CGPoint, radius: CGFloat, angle: Double) -> CGPoint {
        CGPoint(
            x: center.x + radius * CGFloat(Foundation.cos(angle)),
            y: center.y + radius * CGFloat(Foundation.sin(angle))
        )
    }

    private func scoreValue(for key: String) -> Double? {
        guard let wrapper = scores[key] else { return nil }
        return wrapper
    }
}
