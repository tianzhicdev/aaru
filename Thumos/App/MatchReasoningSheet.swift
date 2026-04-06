import SwiftUI

struct MatchReasoningSheet: View {
    let match: SoulmateMatch
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(match.displayName)
                        .font(Theme.serif(24, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)

                    if let reasoning = match.reasoning, !reasoning.isEmpty {
                        Text("How you connect")
                            .font(Theme.sans(12, weight: .medium))
                            .foregroundStyle(Theme.textSecondary)
                            .textCase(.uppercase)
                            .tracking(1)

                        Text(reasoning)
                            .font(Theme.sans(15))
                            .foregroundStyle(Theme.textPrimary)
                            .lineSpacing(4)
                    } else {
                        Text("We're still getting to know you both.")
                            .font(Theme.sans(15))
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
            }
            .background(Theme.backgroundGradient)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.accent)
                }
            }
        }
    }
}
