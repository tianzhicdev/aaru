import SwiftUI

struct MatchChatView: View {
    let match: SoulmateMatch
    @EnvironmentObject private var model: AppModel
    @State private var messages: [MatchMessage] = []
    @State private var inputText = ""
    @State private var isSending = false
    @State private var shouldAutoScroll = true
    @State private var unreadCount = 0
    @State private var scrollToBottomTrigger = 0
    @FocusState private var isInputFocused: Bool
    private let pollInterval: TimeInterval = 5

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                messageList
                inputBar
            }
        }
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
                LazyVStack(spacing: 20) {
                    ForEach(messages) { message in
                        messageBubble(message)
                            .id(message.id)
                    }

                    // Bottom anchor — visibility drives shouldAutoScroll
                    Color.clear.frame(height: 1).id("bottom")
                        .onAppear {
                            shouldAutoScroll = true
                            unreadCount = 0
                        }
                        .onDisappear {
                            shouldAutoScroll = false
                        }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onTapGesture {
                isInputFocused = false
            }
            .onChange(of: messages.count) { _, _ in
                if shouldAutoScroll {
                    withAnimation {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                } else if let last = messages.last, last.senderId == match.matchedUserId {
                    unreadCount += 1
                }
            }
            .onChange(of: isInputFocused) {
                if isInputFocused && shouldAutoScroll {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        withAnimation {
                            proxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                }
            }
            .onChange(of: scrollToBottomTrigger) {
                withAnimation {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !shouldAutoScroll {
                    scrollToBottomFAB
                        .padding(.trailing, 16)
                        .padding(.bottom, 8)
                        .transition(.scale.combined(with: .opacity))
                }
            }
        }
    }

    private var scrollToBottomFAB: some View {
        Button {
            unreadCount = 0
            scrollToBottomTrigger += 1
        } label: {
            ZStack(alignment: .topTrailing) {
                Circle()
                    .fill(Theme.surface)
                    .overlay(Circle().stroke(Theme.divider, lineWidth: 1))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: "chevron.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.textSecondary)
                    )

                if unreadCount > 0 {
                    Text("\(unreadCount)")
                        .font(Theme.sans(11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.accentBright)
                        .clipShape(Capsule())
                        .offset(x: 6, y: -6)
                }
            }
        }
    }

    private func messageBubble(_ message: MatchMessage) -> some View {
        let isOwn = message.senderId != match.matchedUserId

        return HStack {
            if isOwn { Spacer(minLength: 60) }

            Text(message.content)
                .font(Theme.serif(19))
                .foregroundStyle(isOwn ? .white : Theme.textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    isOwn
                        ? AnyShapeStyle(Theme.userBubble)
                        : AnyShapeStyle(Theme.assistantBubble)
                )
                .clipShape(RoundedRectangle(cornerRadius: 16))

            if !isOwn { Spacer(minLength: 60) }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .font(Theme.serif(18))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1...4)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .focused($isInputFocused)

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(
                        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending
                            ? Theme.accent
                            : Theme.accentBright
                    )
            }
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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
        let poller = MessagePoller(interval: pollInterval, maxSilentPolls: 60, maxDuration: 300)
        await poller.poll { [self] in
            let afterId = messages.last?.id
            let response = try await model.backend.getMatchMessages(
                otherUserId: match.matchedUserId,
                afterId: afterId
            )
            if response.messages.isEmpty { return false }
            messages.append(contentsOf: response.messages)
            return true
        }
    }

    private func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        inputText = ""
        scrollToBottomTrigger += 1

        // Optimistic insert
        let optimisticId = "local-\(UUID().uuidString)"
        let optimistic = MatchMessage(
            id: optimisticId,
            senderId: model.userID?.uuidString.lowercased() ?? "",
            receiverId: match.matchedUserId,
            content: text,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        messages.append(optimistic)

        do {
            let response = try await model.backend.sendMatchMessage(
                receiverId: match.matchedUserId,
                content: text
            )
            // Replace optimistic message with server-confirmed one
            if let idx = messages.firstIndex(where: { $0.id == optimisticId }) {
                messages[idx] = response.message
            }
        } catch {
            // Remove optimistic message and restore input
            messages.removeAll { $0.id == optimisticId }
            inputText = text
        }

        isSending = false
    }
}
