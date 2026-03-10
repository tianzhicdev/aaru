import SwiftUI

struct UnlockProgressBar: View {
    let score: Int
    let isUnlocked: Bool

    private var progress: Double {
        min(1.0, Double(score) / Double(AARUConstants.impressionUnlockThreshold))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Ka")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Ba")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isUnlocked ? .green : .secondary)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.2))
                        .frame(height: 8)

                    Capsule()
                        .fill(isUnlocked ? Color.green : Color.orange)
                        .frame(width: max(4, geometry.size.width * progress), height: 8)
                }
            }
            .frame(height: 8)

            Text(isUnlocked ? "Ba unlocked" : "\(score)/\(AARUConstants.impressionUnlockThreshold)")
                .font(.caption2)
                .foregroundStyle(isUnlocked ? .green : .secondary)
        }
    }
}
