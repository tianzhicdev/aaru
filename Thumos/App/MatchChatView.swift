import SwiftUI

struct MatchChatView: View {
    let match: SoulmateMatch
    @EnvironmentObject private var model: AppModel
    @State private var messages: [MatchMessage] = []
    @State private var inputText = ""
    @State private var isSending = false
    @FocusState private var isInputFocused: Bool
    private let pollInterval: TimeInterval = 5

    var body: some View {
        VStack(spacing: 0) {
            messageList
            inputBar
        }
        .background(Color.black)
        .navigationTitle(match.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadMessages()
            await pollForMessages()
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(messages) { message in
                        messageBubble(message)
                            .id(message.id)
                    }
                }
                .padding()
            }
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last {
                    withAnimation {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private func messageBubble(_ message: MatchMessage) -> some View {
        let isOwn = message.senderId != match.matchedUserId

        return HStack {
            if isOwn { Spacer(minLength: 60) }

            Text(message.content)
                .font(.body)
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    isOwn
                        ? Theme.accent.opacity(0.2)
                        : Theme.surface
                )
                .cornerRadius(16)

            if !isOwn { Spacer(minLength: 60) }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .focused($isInputFocused)
                .lineLimit(1...4)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Theme.surface)
                .cornerRadius(20)

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(
                        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending
                            ? Theme.textSecondary
                            : Theme.accent
                    )
            }
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.black)
    }

    private func loadMessages() async {
        do {
            let response = try await model.backend.getMatchMessages(
                otherUserId: match.matchedUserId
            )
            messages = response.messages
        } catch {
            // Silently fail — will retry on poll
        }
    }

    private func pollForMessages() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(pollInterval))
            guard !Task.isCancelled else { return }

            let afterId = messages.last?.id
            do {
                let response = try await model.backend.getMatchMessages(
                    otherUserId: match.matchedUserId,
                    afterId: afterId
                )
                if !response.messages.isEmpty {
                    messages.append(contentsOf: response.messages)
                }
            } catch {
                // Silently fail — will retry next poll
            }
        }
    }

    private func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        inputText = ""

        do {
            let response = try await model.backend.sendMatchMessage(
                receiverId: match.matchedUserId,
                content: text
            )
            messages.append(response.message)
        } catch {
            // Put the text back if send failed
            inputText = text
        }

        isSending = false
    }
}
