import SwiftUI

struct MatchChatView: View {
    let match: SoulmateMatch
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var messages: [MatchMessage] = []
    @State private var inputText = ""
    @State private var isSending = false
    @State private var shouldAutoScroll = true
    @State private var unreadCount = 0
    @State private var scrollToBottomTrigger = 0
    @State private var freshMessageIDs: Set<String> = []
    @FocusState private var isInputFocused: Bool
    private let pollInterval: TimeInterval = 5

    private var ownUserID: String {
        model.userID?.uuidString.lowercased() ?? ""
    }

    private var avatarInitial: String {
        String(match.displayName.prefix(1)).uppercased()
    }

    private var matchPhotoRequest: URLRequest? {
        guard match.photoCount > 0 else { return nil }
        let etag = match.photoEtags.first
        return model.backend.soulmatePhotoRequest(
            userId: match.matchedUserId,
            idx: 0,
            etag: etag
        )
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                ChatHeader(
                    title: match.displayName,
                    subtitle: matchedSubtitle,
                    avatarSeed: match.matchedUserId,
                    avatarInitial: avatarInitial,
                    avatarOnline: false,
                    avatarPhotoRequest: matchPhotoRequest,
                    onBack: { dismiss() }
                )

                messageList

                ChatComposer(
                    text: $inputText,
                    placeholder: "Message",
                    isSending: isSending,
                    isFocused: $isInputFocused,
                    onSend: { Task { await sendMessage() } }
                )
            }
        }
        .navigationBarHidden(true)
        .task {
            await loadMessages()
            await pollForMessages()
        }
    }

    private var matchedSubtitle: String {
        if let date = ChatDateFormat.parse(match.matchedAt) {
            return "Matched \(ChatDateFormat.dayLabel(date))"
        }
        return "Matched recently"
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(messageRows.enumerated()), id: \.offset) { index, row in
                        rowView(row, allRows: messageRows, index: index)
                            .id(rowID(row, index: index))
                    }

                    Color.clear.frame(height: 1).id("bottom")
                        .onAppear {
                            shouldAutoScroll = true
                            unreadCount = 0
                        }
                        .onDisappear { shouldAutoScroll = false }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onTapGesture { isInputFocused = false }
            .onChange(of: messages.count) { _, _ in
                if shouldAutoScroll {
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                } else if let last = messages.last, last.senderId == match.matchedUserId {
                    unreadCount += 1
                }
            }
            .onChange(of: isInputFocused) {
                if isInputFocused && shouldAutoScroll {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                    }
                }
            }
            .onChange(of: scrollToBottomTrigger) {
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
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
                    .fill(Theme.card)
                    .overlay(Circle().stroke(Theme.divider, lineWidth: 1))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: "chevron.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.textSecondary)
                    )
                    .shadow(color: Theme.bubbleShadowReceived, radius: 6, x: 0, y: 2)

                if unreadCount > 0 {
                    Text("\(unreadCount)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.primary)
                        .clipShape(Capsule())
                        .offset(x: 6, y: -6)
                }
            }
        }
    }

    // MARK: - Row model

    private enum ChatRow {
        case day(String)
        case message(MatchMessage)
    }

    private var messageRows: [ChatRow] {
        var out: [ChatRow] = []
        var lastDayLabel: String?
        for m in messages {
            if let date = ChatDateFormat.parse(m.createdAt) {
                let label = ChatDateFormat.dayLabel(date)
                if label != lastDayLabel {
                    out.append(.day(label))
                    lastDayLabel = label
                }
            }
            out.append(.message(m))
        }
        return out
    }

    private func rowID(_ row: ChatRow, index: Int) -> String {
        switch row {
        case .day(let label): return "day-\(label)-\(index)"
        case .message(let m): return m.id
        }
    }

    @ViewBuilder
    private func rowView(_ row: ChatRow, allRows: [ChatRow], index: Int) -> some View {
        switch row {
        case .day(let label):
            DaySeparator(label: label)
        case .message(let m):
            messageRow(m, allRows: allRows, index: index)
        }
    }

    private func messageRow(_ message: MatchMessage, allRows: [ChatRow], index: Int) -> some View {
        let mine = message.senderId != match.matchedUserId
        let stackTop = previousIsSameSender(allRows: allRows, index: index, sender: message.senderId)
        let stackBot = nextIsSameSender(allRows: allRows, index: index, sender: message.senderId)
        let timestampLine = !stackBot
            ? (ChatDateFormat.parse(message.createdAt).map { ChatDateFormat.time($0) } ?? "")
            : ""

        return HStack(alignment: .bottom, spacing: 8) {
            if !mine {
                if !stackBot {
                    AvatarView(
                        seed: match.matchedUserId,
                        initial: avatarInitial,
                        size: 28,
                        photoRequest: matchPhotoRequest
                    )
                } else {
                    Color.clear.frame(width: 28, height: 28)
                }
            }
            if mine { Spacer(minLength: 0) }
            VStack(alignment: mine ? .trailing : .leading, spacing: 2) {
                PillowChatBubble(
                    text: message.content,
                    mine: mine,
                    fresh: freshMessageIDs.contains(message.id)
                )
                .frame(maxWidth: 280, alignment: mine ? .trailing : .leading)

                if !timestampLine.isEmpty {
                    Text(mine ? "\(timestampLine) · Read" : timestampLine)
                        .font(.system(size: 10.5))
                        .foregroundStyle(Theme.textTertiary)
                        .padding(.horizontal, 4)
                }
            }
        }
        .padding(.top, stackTop ? 2 : 8)
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }

    private func previousIsSameSender(allRows: [ChatRow], index: Int, sender: String) -> Bool {
        guard index > 0 else { return false }
        if case .message(let prev) = allRows[index - 1] { return prev.senderId == sender }
        return false
    }

    private func nextIsSameSender(allRows: [ChatRow], index: Int, sender: String) -> Bool {
        guard index + 1 < allRows.count else { return false }
        if case .message(let next) = allRows[index + 1] { return next.senderId == sender }
        return false
    }

    // MARK: - Network

    private func loadMessages() async {
        do {
            let response = try await model.backend.getMatchMessages(otherUserId: match.matchedUserId)
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
            for m in response.messages where m.senderId == match.matchedUserId {
                freshMessageIDs.insert(m.id)
            }
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

        let optimisticId = "local-\(UUID().uuidString)"
        let optimistic = MatchMessage(
            id: optimisticId,
            senderId: ownUserID,
            receiverId: match.matchedUserId,
            content: text,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        freshMessageIDs.insert(optimisticId)
        messages.append(optimistic)

        do {
            let response = try await model.backend.sendMatchMessage(
                receiverId: match.matchedUserId,
                content: text
            )
            if let idx = messages.firstIndex(where: { $0.id == optimisticId }) {
                messages[idx] = response.message
                freshMessageIDs.remove(optimisticId)
                freshMessageIDs.insert(response.message.id)
            }
        } catch {
            messages.removeAll { $0.id == optimisticId }
            freshMessageIDs.remove(optimisticId)
            inputText = text
        }

        isSending = false
    }
}
