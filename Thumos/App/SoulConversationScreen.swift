import SwiftUI

struct SoulConversationScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var inputText = ""
    @State private var showSettings = false
    @FocusState private var isInputFocused: Bool

    private var isWelcomeState: Bool {
        model.soulMessages.isEmpty && !model.isSoulStreaming && !model.isLoading
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

            // Balance spacer
            Color.clear.frame(width: 32, height: 1)
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
                    ForEach(model.soulMessages) { message in
                        if message.isError {
                            errorBubble(message)
                                .id(message.id)
                        } else {
                            messageBubble(message)
                                .id(message.id)
                        }
                    }

                    // Streaming indicator
                    if model.isSoulStreaming && !model.soulStreamingText.isEmpty {
                        streamingBubble
                            .id("streaming")
                    } else if model.isSoulStreaming {
                        typingIndicator
                            .id("typing")
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
            }
            .onTapGesture {
                isInputFocused = false
            }
            .onChange(of: model.soulMessages.count) {
                withAnimation {
                    if let last = model.soulMessages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: model.soulStreamingText) {
                withAnimation {
                    proxy.scrollTo("streaming", anchor: .bottom)
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
                Button {
                    Task { await model.beginSoulSession() }
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
                .padding(.bottom, 48)
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

    private var streamingBubble: some View {
        HStack {
            Text(model.soulStreamingText)
                .font(Theme.serif(19))
                .foregroundStyle(Theme.textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Theme.assistantBubble)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer(minLength: 60)
        }
    }

    @State private var typingDotPhase = 0

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Theme.textSecondary.opacity(typingDotPhase == i ? 1.0 : 0.4))
                        .frame(width: 6, height: 6)
                        .scaleEffect(typingDotPhase == i ? 1.3 : 1.0)
                        .animation(.easeInOut(duration: 0.3), value: typingDotPhase)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Theme.assistantBubble)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(400))
                    typingDotPhase = (typingDotPhase + 1) % 3
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
                Task {
                    await model.sendSoulMessage(text)
                }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(
                        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSoulStreaming
                            ? Theme.accent
                            : Theme.accentBright
                    )
            }
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSoulStreaming)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
