import SwiftUI

struct ConvosScreen: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            List(model.conversations) { conversation in
                NavigationLink {
                    ConversationDetailScreen(conversation: conversation)
                } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(conversation.title)
                                .font(.headline)
                            Text(conversation.status == "active" ? "Live" : "Ended")
                                .font(.caption.bold())
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    conversation.status == "active" ? Color.green.opacity(0.18) : Color.secondary.opacity(0.14),
                                    in: Capsule()
                                )
                            Spacer()
                            Text("\(conversation.theirImpressionScore)%")
                                .font(.subheadline.weight(.bold))
                        }
                        Text(conversation.theirImpressionSummary)
                            .font(.subheadline)
                        UnlockProgressBar(score: conversation.theirImpressionScore, isUnlocked: conversation.baUnlocked)
                    }
                    .padding(.vertical, 6)
                }
            }
            .navigationTitle("Conversations")
            .task {
                try? await model.refreshInbox()
            }
        }
    }
}
