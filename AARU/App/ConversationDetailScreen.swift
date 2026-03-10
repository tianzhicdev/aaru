import SwiftUI

struct ConversationDetailScreen: View {
    @EnvironmentObject private var model: AppModel
    let conversation: ConversationPreview
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 16) {
            if let detail = model.selectedConversation, detail.id == conversation.id {
                header(detail: detail)

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(detail.messages) { message in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(message.type == "ka_generated" ? "🤖" : "👤") \(message.senderName)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(message.content)
                                    .padding(12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                composer
            } else {
                ProgressView()
                    .task { await model.loadConversation(conversation.id) }
            }
        }
        .navigationTitle(conversation.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadConversation(conversation.id) }
    }

    private func header(detail: ConversationDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(detail.theirImpressionScore)% their impression of you")
                    .font(.headline.bold())
                Text(detail.status == "active" ? "Live Ka thread" : "Ended Ka thread")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        detail.status == "active" ? Color.green.opacity(0.18) : Color.secondary.opacity(0.14),
                        in: Capsule()
                    )
            }
            Text(detail.theirImpressionSummary)
                .font(.subheadline)
            Text("Your impression: \(detail.impressionScore)%")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(detail.impressionSummary)
                .font(.footnote)
            Text(detail.baUnlocked ? "Their Ba is open to you" : "Their Ba is still closed")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(detail.baUnlocked ? .green : .secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
    }

    private var composer: some View {
        VStack(spacing: 12) {
            Button("Refresh Thread") {
                Task { await model.loadConversation(conversation.id) }
            }
            .buttonStyle(.bordered)

            HStack {
                TextField("Join the thread as your Ba...", text: $draft)
                    .textFieldStyle(.roundedBorder)
                Button("Send") {
                    Task {
                        await model.sendHumanMessage(draft, conversationID: conversation.id)
                        draft = ""
                    }
                }
                .disabled(model.selectedConversation?.status != "active")
            }
        }
        .padding(16)
    }
}
