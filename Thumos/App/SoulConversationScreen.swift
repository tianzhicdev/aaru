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
                        DisplayMessage(id: "\(message.id)-\(i)", role: message.role, content: part, isError: false, sourceMessage: message)
                    }
            } else {
                return [DisplayMessage(id: message.id, role: message.role, content: message.content, isError: message.isError, sourceMessage: message)]
            }
        }
    }

    private var isWelcomeState: Bool {
        model.soulMessages.isEmpty && !model.isAwaitingResponse && !model.isLoading
    }

    var body: some View {
        ZStack {
            Theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                if model.isLoading && model.soulMessages.isEmpty {
                    loadingView
                } else if isWelcomeState {
                    welcomeView
                } else {
                    messageList
                    inputBar
                }
            }
        }
        .task {
            await model.pollSoulMessagesWhileVisible()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textSecondary)
            }
            .frame(width: 32)

            Spacer()

            Text("Thumos")
                .font(Theme.sans(14, weight: .medium))
                .foregroundStyle(Theme.accent)
                .textCase(.uppercase)
                .tracking(2)

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
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.textSecondary)
                }
                .frame(width: 32)
            } else {
                Color.clear.frame(width: 32, height: 1)
            }
        }
        .frame(height: 44)
        .padding(.horizontal, 8)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(model)
        }
    }

    // MARK: - Messages

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 20) {
                    ForEach(displayMessages) { item in
                        displayMessageBubble(item)
                            .id(item.id)
                    }

                    // Thinking indicator
                    if model.isAwaitingResponse {
                        thinkingIndicator
                            .id("thinking")
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
            .onChange(of: displayMessages.count) {
                if shouldAutoScroll {
                    withAnimation {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                } else if let last = displayMessages.last, last.role == "assistant" {
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

    // MARK: - Loading

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(Theme.accentBright)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Welcome

    private var welcomeView: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 24) {
                Text("Welcome")
                    .font(Theme.serif(38, weight: .light))
                    .foregroundStyle(Theme.textPrimary)

                Text("This is a space for honest reflection.\nThere are no right answers — only yours.")
                    .font(Theme.sans(17, weight: .light))
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
                Button {
                    Task { await model.bootstrap() }
                } label: {
                    Text("Try Again")
                        .font(Theme.sans(17, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.accentBright)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 48)
            } else {
                VStack(spacing: 20) {
                    languagePicker

                    Button {
                        Task { await model.beginSoulConversation() }
                    } label: {
                        Text("Begin")
                            .font(Theme.sans(17, weight: .medium))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Theme.accentBright)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .padding(.horizontal, 40)
                }
                .padding(.bottom, 48)
            }
        }
    }

    private var languagePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Self.supportedLanguages, id: \.code) { lang in
                    Button {
                        Task { await model.updateLanguage(lang.code) }
                    } label: {
                        Text(lang.label)
                            .font(Theme.sans(14, weight: model.language == lang.code ? .medium : .light))
                            .foregroundStyle(model.language == lang.code ? .white : Theme.textSecondary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(
                                model.language == lang.code
                                    ? AnyShapeStyle(Theme.accentBright)
                                    : AnyShapeStyle(Theme.surface)
                            )
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    @ViewBuilder
    private func displayMessageBubble(_ item: DisplayMessage) -> some View {
        if item.isError, let source = item.sourceMessage {
            errorBubble(source)
        } else {
            HStack {
                if item.role == "user" { Spacer(minLength: 60) }

                let bubble = Text(item.content)
                    .font(Theme.serif(19))
                    .foregroundStyle(item.role == "user" ? .white : Theme.textPrimary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        item.role == "user"
                            ? AnyShapeStyle(Theme.userBubble)
                            : AnyShapeStyle(Theme.assistantBubble)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                if item.role == "assistant", let source = item.sourceMessage {
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

                if item.role == "assistant" { Spacer(minLength: 60) }
            }
        }
    }

    private func messageBubble(_ message: SoulMessage) -> some View {
        HStack {
            if message.role == "user" { Spacer(minLength: 60) }

            messageBubbleContent(message)

            if message.role == "assistant" { Spacer(minLength: 60) }
        }
    }

    @ViewBuilder
    private func messageBubbleContent(_ message: SoulMessage) -> some View {
        let bubble = Text(message.content)
            .font(Theme.serif(19))
            .foregroundStyle(message.role == "user" ? .white : Theme.textPrimary)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                message.role == "user"
                    ? AnyShapeStyle(Theme.userBubble)
                    : AnyShapeStyle(Theme.assistantBubble)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))

        if message.role == "assistant" {
            bubble.contextMenu {
                Button {
                    reportMessage(message)
                } label: {
                    Label("Report", systemImage: "exclamationmark.bubble")
                }
            }
        } else {
            bubble
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
                    .foregroundStyle(Theme.accentBright)
            }
        }
        .padding(.horizontal, 40)
    }

    @State private var thinkingDotPhase = 0

    private var thinkingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Theme.textSecondary.opacity(thinkingDotPhase == i ? 1.0 : 0.4))
                        .frame(width: 6, height: 6)
                        .scaleEffect(thinkingDotPhase == i ? 1.3 : 1.0)
                        .animation(.easeInOut(duration: 0.3), value: thinkingDotPhase)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Theme.assistantBubble)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(400))
                    thinkingDotPhase = (thinkingDotPhase + 1) % 3
                }
            }

            Spacer(minLength: 60)
        }
    }

    // MARK: - Input

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Say something...", text: $inputText, axis: .vertical)
                .font(Theme.serif(18))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1...4)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .focused($isInputFocused)

            Button {
                let text = inputText
                inputText = ""
                scrollToBottomTrigger += 1
                Task {
                    await model.sendSoulMessage(text)
                }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(
                        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? Theme.accent
                            : Theme.accentBright
                    )
            }
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
