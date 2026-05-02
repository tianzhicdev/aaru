import SwiftUI
import UIKit

// MARK: - Avatar

/// Circular avatar with an initial inside a deterministic warm pastel color.
/// Optionally shows an online dot (anchored bottom-trailing) and a soft outer ring.
/// When `photoRequest` is set, attempts to fetch and overlay a real photo.
struct AvatarView: View {
    let seed: String
    let initial: String
    var size: CGFloat = 44
    var showStatus: Bool = false
    var isOnline: Bool = false
    var ring: Bool = false
    var photoRequest: URLRequest? = nil

    private static let palette: [Color] = [
        Color(red: 0.659, green: 0.788, blue: 0.604),  // #A8C99A
        Color(red: 0.961, green: 0.761, blue: 0.420),  // #F5C26B
        Color(red: 1.000, green: 0.914, blue: 0.659),  // #FFE9A8
        Color(red: 0.910, green: 0.643, blue: 0.722),  // #E8A4B8
        Color(red: 0.702, green: 0.831, blue: 0.910),  // #B3D4E8
        Color(red: 0.788, green: 0.714, blue: 0.910),  // #C9B6E8
        Color(red: 0.659, green: 0.863, blue: 0.769),  // #A8DCC4
    ]

    private var backgroundColor: Color {
        let hash = seed.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return Self.palette[abs(hash) % Self.palette.count]
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                Circle().fill(backgroundColor)
                Text(initial)
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(Color(red: 0.227, green: 0.290, blue: 0.180))  // #3A4A2E

                if let photoRequest {
                    AuthedPhotoView(request: photoRequest)
                        .frame(width: size, height: size)
                        .clipShape(Circle())
                }
            }
            .frame(width: size, height: size)
            .overlay(
                ring
                    ? AnyView(
                        Circle()
                            .strokeBorder(Color.white, lineWidth: 3)
                            .padding(-3)
                            .background(
                                Circle().strokeBorder(Theme.primarySoft, lineWidth: 2).padding(-5)
                            )
                    )
                    : AnyView(EmptyView())
            )

            if showStatus && isOnline {
                Circle()
                    .fill(Theme.onlineDot)
                    .frame(width: size * 0.28, height: size * 0.28)
                    .overlay(Circle().strokeBorder(Theme.bg, lineWidth: 2.5))
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Authed photo loader

/// Fetches an image with a custom URLRequest (so we can attach the session
/// header) and caches it in memory. Falls back to nothing on failure — the
/// caller stacks this on top of a placeholder.
struct AuthedPhotoView: View {
    let request: URLRequest
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.clear
            }
        }
        .task(id: request.url?.absoluteString) {
            await load()
        }
    }

    private func load() async {
        guard let url = request.url else { return }
        if let cached = AuthedPhotoCache.shared.image(for: url) {
            self.image = cached
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 { return }
            guard let img = UIImage(data: data) else { return }
            AuthedPhotoCache.shared.store(img, for: url)
            self.image = img
        } catch {
            // Silent failure — placeholder stays visible underneath.
        }
    }
}

final class AuthedPhotoCache {
    static let shared = AuthedPhotoCache()
    private let cache = NSCache<NSURL, UIImage>()

    private init() {
        cache.countLimit = 64
    }

    func image(for url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func store(_ image: UIImage, for url: URL) {
        cache.setObject(image, forKey: url as NSURL)
    }
}

// MARK: - Day separator

struct DaySeparator: View {
    let label: String
    var body: some View {
        Text(label)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.textTertiary)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
            .padding(.bottom, 4)
    }
}

// MARK: - Chat header

/// Pillowy Sage chat header — back chevron, avatar, name, status, optional trailing.
struct ChatHeader<Trailing: View>: View {
    let title: String
    let subtitle: String
    let avatarSeed: String
    let avatarInitial: String
    var avatarOnline: Bool = false
    var avatarPhotoRequest: URLRequest? = nil
    let onBack: () -> Void
    let trailing: () -> Trailing

    init(
        title: String,
        subtitle: String,
        avatarSeed: String,
        avatarInitial: String,
        avatarOnline: Bool = false,
        avatarPhotoRequest: URLRequest? = nil,
        onBack: @escaping () -> Void,
        @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.avatarSeed = avatarSeed
        self.avatarInitial = avatarInitial
        self.avatarOnline = avatarOnline
        self.avatarPhotoRequest = avatarPhotoRequest
        self.onBack = onBack
        self.trailing = trailing
    }

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.primaryDeep)
                    .frame(width: 32, height: 32)
            }

            AvatarView(
                seed: avatarSeed,
                initial: avatarInitial,
                size: 36,
                showStatus: true,
                isOnline: avatarOnline,
                photoRequest: avatarPhotoRequest
            )

            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 15.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.primary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            Theme.bg.opacity(0.93)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Theme.divider).frame(height: 0.5)
                }
        )
    }
}

// MARK: - Pillow chat bubble

/// Pillow-shaped chat bubble with the handoff's pop-in animation when fresh.
struct PillowChatBubble: View {
    let text: String
    let mine: Bool
    var fresh: Bool = false
    @State private var appeared: Bool = false

    var body: some View {
        Text(text)
            .font(.system(size: 15.5))
            .foregroundStyle(mine ? Theme.userBubbleText : Theme.assistantBubbleText)
            .lineSpacing(3)
            .kerning(-0.2)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                PillowBubbleShape(mine: mine)
                    .fill(mine ? Theme.userBubble : Theme.assistantBubble)
                    .shadow(
                        color: mine ? Theme.bubbleShadowSent : Theme.bubbleShadowReceived,
                        radius: mine ? 6 : 12,
                        x: 0,
                        y: mine ? 2 : 4
                    )
            )
            .scaleEffect(fresh && !appeared ? 0.92 : 1.0)
            .opacity(fresh && !appeared ? 0 : 1)
            .offset(y: fresh && !appeared ? 8 : 0)
            .onAppear {
                guard fresh else { appeared = true; return }
                withAnimation(.spring(response: 0.32, dampingFraction: 0.6)) {
                    appeared = true
                }
            }
    }
}

// MARK: - Composer

/// Pillowy composer — leading "+" button, white pill input, primary send button.
struct ChatComposer: View {
    @Binding var text: String
    var placeholder: String = "Message"
    var isSending: Bool = false
    @FocusState.Binding var isFocused: Bool
    let onSend: () -> Void
    var onPlus: (() -> Void)? = nil

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Button {
                onPlus?()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.primaryDeep)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.primarySoft))
            }
            .disabled(onPlus == nil)
            .opacity(onPlus == nil ? 0.5 : 1)

            HStack(alignment: .bottom, spacing: 6) {
                TextField(placeholder, text: $text, axis: .vertical)
                    .font(.system(size: 15.5))
                    .foregroundStyle(Theme.textPrimary)
                    .kerning(-0.2)
                    .lineLimit(1...5)
                    .padding(.leading, 4)
                    .padding(.vertical, 8)
                    .focused($isFocused)

                Group {
                    if canSend {
                        Button(action: onSend) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(Theme.primary))
                                .shadow(color: Theme.bubbleShadowSent, radius: 4, x: 0, y: 2)
                        }
                    } else {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 18))
                            .foregroundStyle(Theme.textSecondary)
                            .frame(width: 30, height: 30)
                    }
                }
            }
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 22)
                    .fill(Theme.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 22)
                            .strokeBorder(Theme.divider, lineWidth: 0.5)
                    )
            )
            .frame(minHeight: 38)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(
            Theme.bg.opacity(0.94)
                .overlay(alignment: .top) {
                    Rectangle().fill(Theme.divider).frame(height: 0.5)
                }
        )
    }
}

// MARK: - Date helpers

enum ChatDateFormat {
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoNoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "h:mm a"
        return f
    }()

    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "EEEE"
        return f
    }()

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    static func parse(_ iso: String) -> Date? {
        isoFormatter.date(from: iso) ?? isoNoFractional.date(from: iso)
    }

    static func time(_ date: Date) -> String {
        timeFormatter.string(from: date)
    }

    static func dayLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        let now = Date()
        if let interval = cal.dateComponents([.day], from: date, to: now).day, interval < 7 {
            return weekdayFormatter.string(from: date)
        }
        return dateFormatter.string(from: date)
    }
}
