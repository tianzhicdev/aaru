import SwiftUI

private enum ConversationTab: String, CaseIterable {
    case ka = "Ka"
    case ba = "Ba"
}

struct ConversationDetailScreen: View {
    @EnvironmentObject private var model: AppModel
    let conversation: ConversationPreview
    @State private var selectedTab: ConversationTab = .ka
    @State private var kaDraft = ""
    @State private var baDraft = ""

    var body: some View {
        VStack(spacing: 0) {
            if let detail = model.selectedConversation, detail.id == conversation.id {
                header(detail: detail)

                Picker("Thread", selection: $selectedTab) {
                    ForEach(ConversationTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                switch selectedTab {
                case .ka:
                    kaTab(detail: detail)
                case .ba:
                    baTab(detail: detail)
                }
            } else {
                ProgressView()
                    .task { await model.loadConversation(conversation.id) }
            }
        }
        .navigationTitle(conversation.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadConversation(conversation.id) }
    }

    // MARK: - Header

    private func header(detail: ConversationDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(detail.theirImpressionScore)% their impression of you")
                    .font(.headline.bold())
                Text(detail.phase.capitalized)
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.15), in: Capsule())
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
            if let memory = detail.memorySummary, !memory.isEmpty {
                Text("Your Ka remembers: \(memory)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let memory = detail.theirMemorySummary, !memory.isEmpty {
                Text("Their Ka remembers: \(memory)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let factors = detail.impressionFactors {
                factorGrid(title: "Your impression factors", factors: factors)
            }
            if let factors = detail.theirImpressionFactors {
                factorGrid(title: "Their impression factors", factors: factors)
            }
            UnlockProgressBar(score: detail.theirImpressionScore, isUnlocked: detail.baUnlocked)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
    }

    private func factorGrid(title: String, factors: ImpressionFactors) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text("Responsiveness \(factors.responsiveness) • Values \(factors.valuesAlignment) • Quality \(factors.conversationQuality) • Overlap \(factors.interestOverlap) • Novelty \(factors.novelty)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Ka Tab

    private func kaTab(detail: ConversationDetail) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(detail.messages) { message in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(message.type == "ka_generated" ? "Ka" : "You") \(message.senderName)")
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

            VStack(spacing: 12) {
                Button("Refresh Thread") {
                    Task { await model.loadConversation(conversation.id) }
                }
                .buttonStyle(.bordered)

                HStack {
                    TextField("Join the thread as your Ba...", text: $kaDraft)
                        .textFieldStyle(.roundedBorder)
                    Button("Send") {
                        Task {
                            await model.sendHumanMessage(kaDraft, conversationID: conversation.id)
                            kaDraft = ""
                        }
                    }
                    .disabled(detail.status != "active")
                }
            }
            .padding(16)
        }
    }

    // MARK: - Ba Tab

    private func baTab(detail: ConversationDetail) -> some View {
        VStack(spacing: 0) {
            if detail.baUnlocked {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        if detail.baMessages.isEmpty {
                            Text("No Ba messages yet. Start a real conversation.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.top, 20)
                        }
                        ForEach(detail.baMessages) { message in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Ba \(message.senderName)")
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

                HStack {
                    TextField("Message the real person...", text: $baDraft)
                        .textFieldStyle(.roundedBorder)
                    Button("Send") {
                        Task {
                            await model.sendBaMessage(baDraft, conversationID: conversation.id)
                            baDraft = ""
                        }
                    }
                    .disabled(baDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(16)
            } else {
                Spacer()
                VStack(spacing: 16) {
                    Image(systemName: "lock.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("Ba is still locked")
                        .font(.headline)
                    Text("Keep conversing through your Ka. When the other person's impression of you reaches the threshold, their Ba will open to you.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    UnlockProgressBar(score: detail.theirImpressionScore, isUnlocked: false)
                        .padding(.horizontal, 40)
                }
                .padding(32)
                Spacer()
            }
        }
    }
}
