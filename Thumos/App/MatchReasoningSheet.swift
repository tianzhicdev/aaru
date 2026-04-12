import SwiftUI

struct MatchReasoningSheet: View {
    let match: SoulmateMatch
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            MatchVisualizationView(match: match)
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
