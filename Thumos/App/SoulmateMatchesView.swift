import SwiftUI

struct SoulmateMatchesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showEditProfile = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                Group {
                    if !model.matchingUnlocked {
                        lockedView
                    } else if model.soulmateProfile == nil {
                        SoulmateProfileSetupView()
                    } else {
                        matchesListContent
                    }
                }
                .task { await model.refreshSoulFile() }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: SoulmateMatch.self) { match in
                MatchChatView(match: match)
                    .environmentObject(model)
            }
        }
    }

    // MARK: - Header (inbox-style)

    private var inboxHeader: some View {
        VStack(spacing: 12) {
            HStack {
                ZStack {
                    Circle().fill(Theme.primarySoft).frame(width: 36, height: 36)
                    Image(systemName: "person.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.primaryDeep)
                }

                Spacer()

                HStack(spacing: 6) {
                    Image(systemName: "moon.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.butter)
                    Text("thumos")
                        .font(Theme.wordmark(26))
                        .foregroundStyle(Theme.primaryDeep)
                        .kerning(-0.3)
                }

                Spacer()

                Button { showEditProfile = true } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.primaryDeep)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Theme.primarySoft))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Connect")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(Theme.textPrimary)
                        .kerning(-0.8)
                    Spacer()
                }
                HStack {
                    Text(headerSubtitle)
                        .font(.system(size: 14).italic())
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private var headerSubtitle: String {
        let count = model.soulmateMatches.count
        if count == 0 { return "still listening for your match" }
        return "\(count) souls are waiting to meet you"
    }

    private var searchPill: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(Theme.textSecondary)
            Text("Search matches")
                .font(.system(size: 15))
                .foregroundStyle(Theme.textSecondary)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.primarySoft.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Locked

    private var lockedView: some View {
        SoulCoverageConstellation(domainCoverage: model.domainCoverage)
    }

    // MARK: - Matches list

    private var matchesListContent: some View {
        VStack(spacing: 0) {
            inboxHeader
            searchPill

            if model.soulmateMatches.isEmpty {
                emptyState
            } else {
                matchesScroll
            }
        }
        .task { await model.loadSoulmateMatches() }
        .sheet(isPresented: $showEditProfile) {
            NavigationStack {
                SoulmateProfileSetupView()
                    .environmentObject(model)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Cancel") { showEditProfile = false }
                                .foregroundStyle(Theme.primaryDeep)
                        }
                    }
            }
        }
        .sheet(item: $model.selectedMatchForReasoning) { match in
            MatchReasoningSheet(match: match)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            ZStack {
                Circle().fill(Theme.butterSoft).frame(width: 80, height: 80)
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Theme.butter)
            }
            Text("Looking for your soulmate")
                .font(Theme.wordmark(24))
                .foregroundStyle(Theme.primaryDeep)
            Text("Sit tight — we're listening for someone who fits.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var matchesScroll: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(model.soulmateMatches) { match in
                    matchRow(match)
                    if match.id != model.soulmateMatches.last?.id {
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(height: 0.5)
                            .padding(.leading, 86)
                    }
                }
            }
            .padding(.bottom, 20)
        }
    }

    private func matchRow(_ match: SoulmateMatch) -> some View {
        NavigationLink(value: match) {
            HStack(spacing: 14) {
                AvatarView(
                    seed: match.matchedUserId,
                    initial: String(match.displayName.prefix(1)).uppercased(),
                    size: 52,
                    showStatus: false,
                    isOnline: false,
                    ring: false,
                    photoRequest: photoRequest(for: match, idx: 0)
                )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(match.displayName)
                            .font(.system(size: 16.5, weight: .semibold))
                            .foregroundStyle(Theme.textPrimary)
                            .kerning(-0.2)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text(rowTime(match))
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(Theme.primaryDeep)
                    }
                    HStack {
                        Text(rowPreview(match))
                            .font(.system(size: 14.5))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Button {
                            model.selectedMatchForReasoning = match
                        } label: {
                            Image(systemName: "sparkles")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.primary)
                                .frame(width: 24, height: 24)
                                .background(Circle().fill(Theme.primarySoft))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func rowPreview(_ match: SoulmateMatch) -> String {
        if let reasoning = match.reasoning, !reasoning.isEmpty {
            return reasoning
        }
        return "Tap to start a conversation"
    }

    private func rowTime(_ match: SoulmateMatch) -> String {
        guard let date = ChatDateFormat.parse(match.matchedAt) else { return "" }
        return ChatDateFormat.dayLabel(date)
    }

    private func photoRequest(for match: SoulmateMatch, idx: Int) -> URLRequest? {
        guard match.photoCount > idx else { return nil }
        let etag = match.photoEtags.indices.contains(idx) ? match.photoEtags[idx] : nil
        return model.backend.soulmatePhotoRequest(
            userId: match.matchedUserId,
            idx: idx,
            etag: etag
        )
    }
}
