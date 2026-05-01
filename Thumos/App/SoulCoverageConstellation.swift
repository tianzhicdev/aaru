import SwiftUI

private let domainLabels: [String: String] = [
    "daily_rhythm": "Daily Rhythm",
    "play_and_joy": "Play & Joy",
    "values_and_worldview": "Values & Worldview",
    "love_language": "How You Love",
    "conflict_and_repair": "Conflict & Repair",
    "vulnerability_and_trust": "Vulnerability & Trust",
    "partnership_vision": "Partnership Vision"
]

private let domainPositions: [String: UnitPoint] = [
    "daily_rhythm":            UnitPoint(x: 0.22, y: 0.16),
    "play_and_joy":            UnitPoint(x: 0.78, y: 0.20),
    "values_and_worldview":    UnitPoint(x: 0.50, y: 0.40),
    "love_language":           UnitPoint(x: 0.20, y: 0.55),
    "conflict_and_repair":     UnitPoint(x: 0.80, y: 0.58),
    "vulnerability_and_trust": UnitPoint(x: 0.34, y: 0.82),
    "partnership_vision":      UnitPoint(x: 0.72, y: 0.84)
]

private let depthOrder: [String: Int] = [
    "untouched": 0, "mentioned": 1, "explored": 2, "deep": 3
]

struct SoulCoverageConstellation: View {
    let domainCoverage: [DomainCoverageEntry]
    @State private var selectedEntry: DomainCoverageEntry?
    @State private var pulse = false

    private var depthByDomain: [String: String] {
        var result: [String: String] = [:]
        for d in AppModel.romanceDomains { result[d] = "untouched" }
        for entry in domainCoverage where AppModel.romanceDomains.contains(entry.domain) {
            result[entry.domain] = entry.depth
        }
        return result
    }

    private var sparkedCount: Int {
        depthByDomain.values.filter { $0 == "explored" || $0 == "deep" }.count
    }

    private var nextDomainHint: String? {
        let sorted = AppModel.romanceDomains.sorted {
            (depthOrder[depthByDomain[$0] ?? "untouched"] ?? 0)
                < (depthOrder[depthByDomain[$1] ?? "untouched"] ?? 0)
        }
        guard let dim = sorted.first,
              (depthOrder[depthByDomain[dim] ?? "untouched"] ?? 0) < 2 else {
            return nil
        }
        return domainLabels[dim]
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            constellation
            footer
        }
        .background(Theme.bg.ignoresSafeArea())
        .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { pulse.toggle() } }
        .sheet(item: $selectedEntry) { entry in
            DomainDetailSheet(entry: entry)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Connect")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Theme.textPrimary)
                .kerning(-0.8)
            Text("light up all 7 to begin matching")
                .font(.system(size: 14).italic())
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 12)
    }

    private var constellation: some View {
        GeometryReader { geo in
            ZStack {
                connectingLines(in: geo.size)

                ForEach(AppModel.romanceDomains, id: \.self) { domain in
                    let depth = depthByDomain[domain] ?? "untouched"
                    let pos = domainPositions[domain] ?? UnitPoint(x: 0.5, y: 0.5)
                    StarNode(label: domainLabels[domain] ?? domain, depth: depth, pulse: pulse)
                        .position(x: pos.x * geo.size.width, y: pos.y * geo.size.height)
                        .onTapGesture {
                            let evidence = domainCoverage.first { $0.domain == domain }?.evidence ?? ""
                            selectedEntry = DomainCoverageEntry(
                                domain: domainLabels[domain] ?? domain,
                                depth: depth,
                                evidence: evidence
                            )
                        }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 420)
        .padding(.horizontal, 16)
    }

    private func connectingLines(in size: CGSize) -> some View {
        let lit = AppModel.romanceDomains.filter {
            ["explored", "deep"].contains(depthByDomain[$0] ?? "untouched")
        }
        let points = lit.compactMap { domain -> CGPoint? in
            guard let p = domainPositions[domain] else { return nil }
            return CGPoint(x: p.x * size.width, y: p.y * size.height)
        }
        return Path { path in
            for i in 0..<points.count {
                for j in (i + 1)..<points.count {
                    path.move(to: points[i])
                    path.addLine(to: points[j])
                }
            }
        }
        .stroke(Theme.butter.opacity(0.18), lineWidth: 0.5)
    }

    private var footer: some View {
        VStack(spacing: 6) {
            Text("\(sparkedCount) of 7 sparked")
                .font(Theme.wordmark(22, italic: false))
                .foregroundStyle(Theme.primaryDeep)
            if let hint = nextDomainHint {
                Text("Tell me more about \(hint).")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
            } else {
                Text("Your constellation is complete ✨")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 28)
    }
}

private struct StarNode: View {
    let label: String
    let depth: String
    let pulse: Bool

    private var size: CGFloat {
        switch depth {
        case "deep": return 18
        case "explored": return 14
        case "mentioned": return 8
        default: return 4
        }
    }

    private var haloSize: CGFloat {
        switch depth {
        case "deep": return 56
        case "explored": return 38
        case "mentioned": return 18
        default: return 0
        }
    }

    private var bodyOpacity: Double {
        switch depth {
        case "deep": return 1.0
        case "explored": return 0.95
        case "mentioned": return 0.55
        default: return 0.30
        }
    }

    private var haloOpacity: Double {
        switch depth {
        case "deep": return pulse ? 0.45 : 0.30
        case "explored": return 0.28
        case "mentioned": return 0.16
        default: return 0
        }
    }

    private var labelOpacity: Double {
        switch depth {
        case "deep", "explored": return 0.95
        case "mentioned": return 0.60
        default: return 0.35
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                if haloSize > 0 {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Theme.butter.opacity(haloOpacity), Color.clear],
                                center: .center,
                                startRadius: 0,
                                endRadius: haloSize / 2
                            )
                        )
                        .frame(width: haloSize, height: haloSize)
                }
                Circle()
                    .fill(starFill)
                    .frame(width: size, height: size)
                    .opacity(bodyOpacity)
            }
            .frame(width: 60, height: 60)

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.textPrimary.opacity(labelOpacity))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(width: 92)
        }
        .contentShape(Rectangle())
    }

    private var starFill: Color {
        switch depth {
        case "deep", "explored": return Theme.butter
        default: return Theme.textSecondary
        }
    }
}

private struct DomainDetailSheet: View {
    let entry: DomainCoverageEntry
    @Environment(\.dismiss) private var dismiss

    private var depthLabel: String {
        switch entry.depth {
        case "deep": return "Deeply explored"
        case "explored": return "Explored"
        case "mentioned": return "Just mentioned"
        default: return "Not yet touched"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(entry.domain)
                    .font(Theme.wordmark(24))
                    .foregroundStyle(Theme.primaryDeep)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Theme.textSecondary)
                }
                .buttonStyle(.plain)
            }

            Text(depthLabel)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.primary)

            if !entry.evidence.isEmpty {
                Text(entry.evidence)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.textPrimary)
                    .lineSpacing(3)
            } else {
                Text("Bring this up in your next conversation to light it up.")
                    .font(.system(size: 14).italic())
                    .foregroundStyle(Theme.textSecondary)
            }

            Spacer()
        }
        .padding(24)
        .presentationDetents([.fraction(0.32)])
        .presentationDragIndicator(.visible)
    }
}

extension DomainCoverageEntry: Identifiable {
    public var id: String { domain }
}
