import SwiftUI

struct SoulConversationScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var inputText = ""
    @State private var showSettings = false
    @State private var shouldAutoScroll = true
    @State private var unreadCount = 0
    @State private var scrollToBottomTrigger = 0
    @FocusState private var isInputFocused: Bool

    private struct SupportedLanguage {
        let code: String
        let label: String
    }

    private static let supportedLanguages: [SupportedLanguage] = [
        SupportedLanguage(code: "en", label: "English"),
        SupportedLanguage(code: "zh-CN", label: "中文"),
        SupportedLanguage(code: "ja", label: "日本語"),
        SupportedLanguage(code: "fr", label: "Français"),
        SupportedLanguage(code: "es", label: "Español"),
        SupportedLanguage(code: "ko", label: "한국어"),
        SupportedLanguage(code: "pt-BR", label: "Português"),
        SupportedLanguage(code: "de", label: "Deutsch")
    ]

    private struct DisplayMessage: Identifiable {
        let id: String
        let role: String
        let content: String
        let isError: Bool
        let createdAt: String?
        let sourceMessage: SoulMessage?
    }

    private var displayMessages: [DisplayMessage] {
        model.soulMessages.flatMap { message in
            if message.role == "assistant" && !message.isError {
                return message.content
                    .components(separatedBy: "\n")
                    .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                    .enumerated()
                    .map { (i, part) in
                        DisplayMessage(
                            id: "\(message.id)-\(i)",
                            role: message.role,
                            content: part,
                            isError: false,
                            createdAt: message.createdAt,
                            sourceMessage: message
                        )
                    }
            } else {
                return [DisplayMessage(
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    isError: message.isError,
                    createdAt: message.createdAt,
                    sourceMessage: message
                )]
            }
        }
    }

    private var isWelcomeState: Bool {
        model.soulMessages.isEmpty && !model.isAwaitingResponse && !model.isLoading
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                if model.isLoading && model.soulMessages.isEmpty {
                    loadingView
                } else if isWelcomeState {
                    welcomeView
                } else {
                    messageList
                    ChatComposer(
                        text: $inputText,
                        placeholder: "Say something",
                        isSending: model.isAwaitingResponse,
                        isFocused: $isInputFocused,
                        onSend: sendInput
                    )
                }
            }
        }
        .task {
            await model.pollSoulMessagesWhileVisible()
        }
    }

    private func sendInput() {
        let text = inputText
        inputText = ""
        scrollToBottomTrigger += 1
        Task { await model.sendSoulMessage(text) }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(Theme.primaryDeep)
                    .frame(width: 36, height: 36)
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: "moon.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.butter)
                Text("thumos")
                    .font(Theme.wordmark(26))
                    .foregroundStyle(Theme.primaryDeep)
                    .kerning(-0.3)
            }

            Spacer()

            if !isWelcomeState {
                Menu {
                    ForEach(Self.supportedLanguages, id: \.code) { lang in
                        Button {
                            Task { await model.updateLanguage(lang.code) }
                        } label: {
                            HStack {
                                Text(lang.label)
                                if model.language == lang.code {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "globe")
                        .font(.system(size: 18))
                        .foregroundStyle(Theme.primaryDeep)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Theme.primarySoft))
                }
            } else {
                Color.clear.frame(width: 36, height: 36)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 4)
        .padding(.bottom, 8)
        .background(
            Theme.bg.opacity(0.93)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Theme.divider).frame(height: 0.5)
                }
        )
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(model)
        }
    }

    // MARK: - Messages

    private enum ChatRow {
        case day(String)
        case message(DisplayMessage)
    }

    private var rows: [ChatRow] {
        var out: [ChatRow] = []
        var lastDay: String?
        for m in displayMessages {
            if let createdAt = m.createdAt, let date = ChatDateFormat.parse(createdAt) {
                let label = ChatDateFormat.dayLabel(date)
                if label != lastDay {
                    out.append(.day(label))
                    lastDay = label
                }
            }
            out.append(.message(m))
        }
        return out
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                        rowView(row, index: index)
                            .id(rowID(row, index: index))
                    }

                    if model.isAwaitingResponse {
                        thinkingIndicator
                            .id("thinking")
                            .padding(.top, 8)
                    }

                    Color.clear.frame(height: 1).id("bottom")
                        .onAppear {
                            shouldAutoScroll = true
                            unreadCount = 0
                        }
                        .onDisappear { shouldAutoScroll = false }
                }
                .padding(.horizontal, 12)
                .padding(.top, 12)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onTapGesture { isInputFocused = false }
            .onChange(of: displayMessages.count) {
                if shouldAutoScroll {
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                } else if let last = displayMessages.last, last.role == "assistant" {
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

    private func rowID(_ row: ChatRow, index: Int) -> String {
        switch row {
        case .day(let label): return "day-\(label)-\(index)"
        case .message(let m): return m.id
        }
    }

    @ViewBuilder
    private func rowView(_ row: ChatRow, index: Int) -> some View {
        switch row {
        case .day(let label):
            DaySeparator(label: label)
        case .message(let item):
            messageRow(item, index: index)
        }
    }

    @ViewBuilder
    private func messageRow(_ item: DisplayMessage, index: Int) -> some View {
        if item.isError, let source = item.sourceMessage {
            errorBubble(source)
        } else {
            let mine = item.role == "user"
            let stackBot = nextRowIsSameRole(index: index, role: item.role)
            HStack(alignment: .bottom, spacing: 8) {
                if !mine {
                    if !stackBot {
                        thumosAvatar
                    } else {
                        Color.clear.frame(width: 28, height: 28)
                    }
                }
                if mine { Spacer(minLength: 0) }
                let bubble = PillowChatBubble(text: item.content, mine: mine)
                    .frame(maxWidth: 280, alignment: mine ? .trailing : .leading)

                if !mine, let source = item.sourceMessage {
                    bubble.contextMenu {
                        Button {
                            reportMessage(source)
                        } label: {
                            Label("Report", systemImage: "exclamationmark.bubble")
                        }
                    }
                } else {
                    bubble
                }
            }
            .padding(.top, previousRowIsSameRole(index: index, role: item.role) ? 2 : 8)
            .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
        }
    }

    private func previousRowIsSameRole(index: Int, role: String) -> Bool {
        guard index > 0 else { return false }
        if case .message(let m) = rows[index - 1] { return m.role == role }
        return false
    }

    private func nextRowIsSameRole(index: Int, role: String) -> Bool {
        guard index + 1 < rows.count else { return false }
        if case .message(let m) = rows[index + 1] { return m.role == role }
        return false
    }

    private var thumosAvatar: some View {
        Image("ThumosLogo")
            .resizable()
            .scaledToFill()
            .frame(width: 28, height: 28)
            .clipShape(Circle())
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

    // MARK: - Loading + welcome

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView().tint(Theme.accentBright)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var welcomeView: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 24) {
                Image("ThumosLogo")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 96, height: 96)
                    .clipShape(Circle())

                Text("Welcome")
                    .font(Theme.wordmark(40))
                    .foregroundStyle(Theme.primaryDeep)

                Text("This is a space for honest reflection.\nThere are no right answers — only yours.")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 32)

                if let error = model.errorMessage {
                    Text(error)
                        .font(Theme.sans(14))
                        .foregroundStyle(Theme.errorText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(Theme.errorBg)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal, 32)
                }
            }

            Spacer()

            if model.errorMessage != nil {
                primaryActionButton(title: "Try Again") {
                    Task { await model.bootstrap() }
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 48)
            } else {
                VStack(spacing: 20) {
                    languagePicker
                    primaryActionButton(title: "Begin") {
                        Task { await model.beginSoulConversation() }
                    }
                    .padding(.horizontal, 40)
                }
                .padding(.bottom, 48)
            }
        }
    }

    private func primaryActionButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Theme.primary)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: Theme.bubbleShadowSent, radius: 8, x: 0, y: 4)
        }
    }

    private var languagePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Self.supportedLanguages, id: \.code) { lang in
                    let active = model.language == lang.code
                    Button {
                        Task { await model.updateLanguage(lang.code) }
                    } label: {
                        Text(lang.label)
                            .font(.system(size: 13.5, weight: active ? .semibold : .regular))
                            .foregroundStyle(active ? .white : Theme.primaryDeep)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(active ? AnyShapeStyle(Theme.primary) : AnyShapeStyle(Theme.primarySoft))
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func reportMessage(_ message: SoulMessage) {
        let subject = "Report: Inappropriate AI Response"
        let body = "Message content:\n\n\(message.content)\n\n---\nPlease describe the issue:\n"
        let mailto = "mailto:support@trythumos.com?subject=\(subject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&body=\(body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        if let url = URL(string: mailto) {
            UIApplication.shared.open(url)
        }
    }

    private func errorBubble(_ message: SoulMessage) -> some View {
        VStack(spacing: 8) {
            Text(message.content)
                .font(Theme.sans(14))
                .foregroundStyle(Theme.errorText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Theme.errorBg)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                Task { await model.retrySoulMessage() }
            } label: {
                Text("Retry")
                    .font(Theme.sans(13, weight: .medium))
                    .foregroundStyle(Theme.primaryDeep)
            }
        }
        .padding(.horizontal, 40)
    }

    @State private var thinkingDotPhase = 0

    private var thinkingIndicator: some View {
        HStack(alignment: .bottom, spacing: 8) {
            thumosAvatar
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Theme.textTertiary)
                        .frame(width: 7, height: 7)
                        .scaleEffect(thinkingDotPhase == i ? 1.3 : 1.0)
                        .opacity(thinkingDotPhase == i ? 1.0 : 0.4)
                        .animation(.easeInOut(duration: 0.3), value: thinkingDotPhase)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                PillowBubbleShape(mine: false)
                    .fill(Theme.assistantBubble)
                    .shadow(color: Theme.bubbleShadowReceived, radius: 12, x: 0, y: 4)
            )
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(400))
                    thinkingDotPhase = (thinkingDotPhase + 1) % 3
                }
            }

            Spacer(minLength: 0)
        }
    }
}
