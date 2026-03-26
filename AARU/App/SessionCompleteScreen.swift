import SwiftUI

struct SessionCompleteScreen: View {
    @EnvironmentObject private var model: AppModel
    let result: SoulSessionResult

    private let accentGold = Color(red: 0.83, green: 0.69, blue: 0.30)
    private let textPrimary = Color(red: 0.10, green: 0.10, blue: 0.10)
    private let surfaceBg = Color(red: 0.98, green: 0.98, blue: 0.98)

    var body: some View {
        ZStack {
            surfaceBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    headerSection
                    insightsSection
                    updatedEssenceSection
                    returnButton
                }
                .padding(.horizontal, 24)
                .padding(.top, 48)
                .padding(.bottom, 40)
            }
        }
        .interactiveDismissDisabled()
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Text("Session \(result.sessionNumber)")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(accentGold)
                .textCase(.uppercase)
                .tracking(2)

            Text("Complete")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(textPrimary)
        }
    }

    // MARK: - Insights

    private var insightsSection: some View {
        VStack(spacing: 20) {
            ForEach(Array(result.insights.enumerated()), id: \.offset) { _, insight in
                VStack(spacing: 8) {
                    Text(insight.tag)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1)

                    Text(insight.text)
                        .font(.system(size: 15))
                        .foregroundStyle(textPrimary.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Updated Essence

    private var updatedEssenceSection: some View {
        Group {
            if let soulFile = result.soulFile, let essence = soulFile.essence, !essence.isEmpty {
                VStack(spacing: 12) {
                    Text("Your Essence")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    Text(essence)
                        .font(.system(size: 20, weight: .light))
                        .foregroundStyle(textPrimary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                }
                .padding(.vertical, 8)
            }
        }
    }

    // MARK: - Return

    private var returnButton: some View {
        Button {
            model.dismissSessionComplete()
        } label: {
            Text("Return to Soul File")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(accentGold)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.top, 16)
    }
}
