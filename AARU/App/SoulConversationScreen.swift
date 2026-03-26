import SwiftUI

struct SoulConversationScreen: View {
    @EnvironmentObject private var model: AppModel
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    private let accentGold = Color(red: 0.83, green: 0.69, blue: 0.30)
    private let textPrimary = Color(red: 0.10, green: 0.10, blue: 0.10)
    private let surfaceBg = Color(red: 0.98, green: 0.98, blue: 0.98)

    var body: some View {
        ZStack {
            surfaceBg.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                messageList
                inputBar
            }
        }
        .sheet(isPresented: $model.showSessionComplete) {
            if let result = model.soulSessionResult {
                SessionCompleteScreen(result: result)
                    .environmentObject(model)
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                model.endSoulConversation()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(textPrimary.opacity(0.5))
                    .frame(width: 44, height: 44)
            }

            Spacer()

            Text("Soul Mirror")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(accentGold)
                .textCase(.uppercase)
                .tracking(2)

            Spacer()

            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 8)
        .background(surfaceBg)
    }

    // MARK: - Messages

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 20) {
                    ForEach(model.soulMessages) { message in
                        messageBubble(message)
                            .id(message.id)
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

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(textPrimary.opacity(0.3))
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))

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
