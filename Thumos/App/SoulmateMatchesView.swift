import SwiftUI

struct SoulmateMatchesView: View {
    @EnvironmentObject private var model: AppModel

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
            .navigationTitle("Soulmate")
            .navigationBarTitleDisplayMode(.inline)
            .background(Color.black)
        }
    }

    private var lockedView: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundColor(Theme.textSecondary)

            Text("Keep Reflecting to Unlock")
                .font(Theme.serif(24, weight: .medium))
                .foregroundColor(Theme.textPrimary)

            Text("Your soul file is \(Int(model.visibleSoulFile.completeness * 100))% complete. Reach 70% to unlock soulmate matching.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
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
                        .foregroundColor(Theme.textSecondary)
                    Text("Searching for Your Soulmate...")
                        .font(Theme.serif(24, weight: .medium))
                        .foregroundColor(Theme.textPrimary)
                    Text("We check for compatible souls daily. You'll see matches here when we find them.")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    Spacer()
                }
            } else {
                List(model.soulmateMatches) { match in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(match.displayName)
                            .font(Theme.serif(17, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(2)
                        Text("Matched \(match.matchedAt.prefix(10))")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                    .listRowBackground(Theme.surface)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .task {
            await model.loadSoulmateMatches()
        }
    }
}
