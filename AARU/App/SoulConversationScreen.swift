import SwiftUI

struct SoulConversationScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    private let accentGold = Color(red: 0.83, green: 0.69, blue: 0.30)
    private let textPrimary = Color(red: 0.10, green: 0.10, blue: 0.10)
    private let surfaceBg = Color(red: 0.98, green: 0.98, blue: 0.98)
    private let errorBg = Color(red: 0.95, green: 0.87, blue: 0.85)
    private let errorText = Color(red: 0.60, green: 0.20, blue: 0.15)

    private var isWelcomeState: Bool {
        model.soulMessages.isEmpty && !model.isSoulStreaming && !model.isLoading
    }

    var body: some View {
        ZStack {
            surfaceBg.ignoresSafeArea()

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
            Spacer()

            Text("Soul Mirror")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(accentGold)
                .textCase(.uppercase)
                .tracking(2)

            Spacer()
        }
        .frame(height: 44)
        .padding(.horizontal, 8)
        .background(surfaceBg)
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
                .tint(accentGold)
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
                    .font(.system(size: 32, weight: .ultraLight))
                    .foregroundStyle(textPrimary)

                Text("This is a space for honest reflection.\nThere are no right answers — only yours.")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(textPrimary.opacity(0.5))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 32)

                if let error = model.errorMessage {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(errorText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(errorBg)
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
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(accentGold)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 48)
            } else {
                Button {
                    Task { await model.beginSoulSession() }
                } label: {
                    Text("Begin")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(accentGold)
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

            Text(message.content)
                .font(.system(size: 16))
                .foregroundStyle(message.role == "user" ? .white : textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    message.role == "user"
                        ? AnyShapeStyle(accentGold)
                        : AnyShapeStyle(Color.white)
                )
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(0.04), radius: 2, y: 1)

            if message.role == "assistant" { Spacer(minLength: 60) }
        }
    }

    private func errorBubble(_ message: SoulMessage) -> some View {
        VStack(spacing: 8) {
            Text(message.content)
                .font(.system(size: 14))
                .foregroundStyle(errorText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(errorBg)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                Task { await model.retrySoulMessage() }
            } label: {
                Text("Retry")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(accentGold)
            }
        }
        .padding(.horizontal, 40)
    }

    private var streamingBubble: some View {
        HStack {
            Text(model.soulStreamingText)
                .font(.system(size: 16))
                .foregroundStyle(textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(0.04), radius: 2, y: 1)

            Spacer(minLength: 60)
        }
    }

    @State private var typingDotPhase = 0

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(textPrimary.opacity(typingDotPhase == i ? 0.6 : 0.2))
                        .frame(width: 6, height: 6)
                        .scaleEffect(typingDotPhase == i ? 1.3 : 1.0)
                        .animation(.easeInOut(duration: 0.3), value: typingDotPhase)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.white)
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
                .font(.system(size: 16))
                .lineLimit(1...4)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.white)
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
                            ? accentGold.opacity(0.3)
                            : accentGold
                    )
            }
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSoulStreaming)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(surfaceBg)
    }
}
