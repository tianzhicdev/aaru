import SwiftUI

struct SoulmateMatchesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showEditProfile = false

    var body: some View {
        NavigationStack {
            Group {
                if model.visibleSoulFile.completeness < 0.7 {
                    lockedView
                } else if model.soulmateProfile == nil {
                    SoulmateProfileSetupView()
                } else {
                    matchesListView
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Thumos")
                        .font(Theme.sans(14, weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .textCase(.uppercase)
                        .tracking(2)
                }
            }
            .background(Theme.backgroundGradient)
        }
    }

    private var lockedView: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundStyle(Theme.textSecondary)

            Text("Keep Reflecting to Unlock")
                .font(Theme.serif(24, weight: .medium))
                .foregroundStyle(Theme.textPrimary)

            Text("Keep having conversations to unlock this.")
                .font(Theme.sans(15, weight: .light))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            ProgressView(value: model.visibleSoulFile.completeness, total: 0.7)
                .tint(Theme.accentBright)
                .padding(.horizontal, 48)

            Spacer()
        }
    }

    private var matchesListView: some View {
        Group {
            if model.soulmateMatches.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "heart.circle")
                        .font(.system(size: 48))
                        .foregroundStyle(Theme.textSecondary)
                    Text("Looking for your soulmate")
                        .font(Theme.serif(24, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(model.soulmateMatches) { match in
                    matchRow(match)
                        .listRowBackground(Theme.surface)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .navigationDestination(for: SoulmateMatch.self) { match in
                    MatchChatView(match: match)
                        .environmentObject(model)
                }
                .sheet(item: $model.selectedMatchForReasoning) { match in
                    MatchReasoningSheet(match: match)
                }
            }
        }
        .task {
            await model.loadSoulmateMatches()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showEditProfile = true
                } label: {
                    Image(systemName: "pencil.circle")
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .sheet(isPresented: $showEditProfile) {
            NavigationStack {
                SoulmateProfileSetupView()
                    .environmentObject(model)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Cancel") {
                                showEditProfile = false
                            }
                        }
                    }
            }
        }
    }

    private func matchRow(_ match: SoulmateMatch) -> some View {
        NavigationLink(value: match) {
            HStack(spacing: 12) {
                Text(match.displayName)
                    .font(Theme.serif(17, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)

                Spacer()

                Button {
                    model.selectedMatchForReasoning = match
                } label: {
                    Image(systemName: "sparkles")
                        .font(.system(size: 18))
                        .foregroundStyle(Theme.accent)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 4)
        }
    }
}
