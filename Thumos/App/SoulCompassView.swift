import SwiftUI
import Foundation

struct SoulCompassView: View {
    let scores: [String: Double?]

    // Ordered clockwise for visual balance
    private static let axes: [(key: String, label: String)] = [
        ("openness", "Openness"),
        ("vitality", "Vitality"),
        ("warmth", "Warmth"),
        ("connection", "Connection"),
        ("resilience", "Resilience"),
        ("purpose", "Purpose"),
        ("depth", "Depth"),
        ("autonomy", "Autonomy")
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
        }
    }

    // MARK: - Axis Lines

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
                    with: .color(Color(red: 0.831, green: 0.690, blue: 0.302).opacity(0.15)),
                    style: StrokeStyle(
                        lineWidth: 0.5,
                        dash: hasScore ? [] : [4, 4]
                    )
                )
            }
        }
    }

    // MARK: - Grid Rings

    private var gridRings: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            for ring in [0.25, 0.5, 0.75, 1.0] {
                let r = radius * ring
                var path = Path()
                for i in 0..<axisCount {
                    let angle = angleFor(index: i)
                    let pt = pointAt(center: center, radius: r, angle: angle)
                    if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
                }
                path.closeSubpath()
                context.stroke(
                    path,
                    with: .color(Color(red: 0.831, green: 0.690, blue: 0.302).opacity(0.08)),
                    lineWidth: 0.5
                )
            }
        }
    }

    // MARK: - Score Polygon

    private var scorePolygon: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            var points: [CGPoint] = []
            for i in 0..<axisCount {
                if let val = scoreValue(for: Self.axes[i].key) {
                    let angle = angleFor(index: i)
                    let r = radius * CGFloat(val) / 100.0
                    points.append(pointAt(center: center, radius: r, angle: angle))
                }
            }
            guard points.count >= 3 else { return }

            var path = Path()
            path.move(to: points[0])
            for pt in points.dropFirst() {
                path.addLine(to: pt)
            }
            path.closeSubpath()

            // Fill
            context.fill(
                path,
                with: .color(Color(red: 0.831, green: 0.690, blue: 0.302).opacity(0.15))
            )
            // Stroke
            context.stroke(
                path,
                with: .color(Color(red: 0.831, green: 0.690, blue: 0.302).opacity(0.60)),
                lineWidth: 1.5
            )

            // Score dots
            for pt in points {
                let dotRect = CGRect(x: pt.x - 2.5, y: pt.y - 2.5, width: 5, height: 5)
                context.fill(
                    Path(ellipseIn: dotRect),
                    with: .color(Color(red: 0.831, green: 0.690, blue: 0.302).opacity(0.70))
                )
            }
        }
    }

    // MARK: - Axis Labels

    private var axisLabels: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ForEach(0..<axisCount, id: \.self) { i in
                let angle = angleFor(index: i)
                let labelR = radius + 22
                let pt = pointAt(center: center, radius: labelR, angle: angle)
                let hasScore = scoreValue(for: Self.axes[i].key) != nil

                Text(Self.axes[i].label)
                    .font(Theme.sans(9, weight: .light))
                    .foregroundStyle(hasScore ? Theme.textSecondary : Theme.textTertiary)
                    .position(pt)
            }
        }
    }

    // MARK: - Geometry Helpers

    private func angleFor(index: Int) -> Double {
        let step = (2 * .pi) / Double(axisCount)
        return step * Double(index) - .pi / 2  // Start from top
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
