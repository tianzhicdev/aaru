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
                        .foregroundColor(Theme.textPrimary)

                    if let reasoning = match.reasoning, !reasoning.isEmpty {
                        Text("Why you matched")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                            .textCase(.uppercase)
                            .tracking(1)

                        Text(reasoning)
                            .font(.body)
                            .foregroundColor(Theme.textPrimary)
                            .lineSpacing(4)
                    } else {
                        Text("Match details are being prepared...")
                            .font(.body)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
                .padding()
            }
            .background(Color.black)
            .navigationTitle("Match Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(Theme.accent)
                }
            }
        }
    }
}
