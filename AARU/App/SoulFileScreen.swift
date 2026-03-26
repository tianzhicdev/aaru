import SwiftUI

struct SoulFileScreen: View {
    @EnvironmentObject private var model: AppModel

    private let accentGold = Color(red: 0.83, green: 0.69, blue: 0.30)
    private let textPrimary = Color(red: 0.10, green: 0.10, blue: 0.10)
    private let surfaceBg = Color(red: 0.98, green: 0.98, blue: 0.98)

    var body: some View {
        ZStack {
            surfaceBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    headerSection
                    essenceSection
                    tensionsSection
                    comesAliveSection
                    yourWordsSection
                    evolutionSection
                    sessionButton
                }
                .padding(.horizontal, 24)
                .padding(.top, 60)
                .padding(.bottom, 40)
            }
        }
        .fullScreenCover(isPresented: $model.showSoulConversation) {
            SoulConversationScreen()
                .environmentObject(model)
        }
        .sheet(isPresented: $model.showSessionComplete) {
            if let result = model.soulSessionResult {
                SessionCompleteScreen(result: result)
                    .environmentObject(model)
            }
        }
        .task {
            await model.bootstrapSoul()
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 4) {
            Text("Soul Mirror")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(accentGold)
                .textCase(.uppercase)
                .tracking(2)

            if model.soulFile.sessionCount > 0 {
                Text("Session \(model.soulFile.sessionCount)")
                    .font(.system(size: 12))
                    .foregroundStyle(textPrimary.opacity(0.4))
            }
        }
    }

    // MARK: - Essence

    private var essenceSection: some View {
        Group {
            if let essence = model.soulFile.essence, !essence.isEmpty {
                Text(essence)
                    .font(.system(size: 24, weight: .light))
                    .foregroundStyle(textPrimary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(6)
            } else {
                VStack(spacing: 12) {
                    Text("Your soul file is empty")
                        .font(.system(size: 20, weight: .light))
                        .foregroundStyle(textPrimary.opacity(0.6))
                    Text("Begin a session to discover who you are")
                        .font(.system(size: 14))
                        .foregroundStyle(textPrimary.opacity(0.4))
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Tensions

    private var tensionsSection: some View {
        Group {
            if !model.soulFile.tensions.isEmpty {
                VStack(spacing: 16) {
                    Text("Tensions")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.soulFile.tensions.enumerated()), id: \.offset) { _, tension in
                        HStack {
                            Text(tension.left)
                                .font(.system(size: 15))
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Text("—")
                                .foregroundStyle(textPrimary.opacity(0.3))
                            Spacer()
                            Text(tension.right)
                                .font(.system(size: 15))
                                .foregroundStyle(textPrimary)
                        }
                        .padding(.horizontal, 8)
                    }
                }
            }
        }
    }

    // MARK: - Comes Alive

    private var comesAliveSection: some View {
        Group {
            if let comesAlive = model.soulFile.comesAlive, !comesAlive.isEmpty {
                VStack(spacing: 8) {
                    Text("What Makes You Come Alive")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    Text(comesAlive)
                        .font(.system(size: 15))
                        .foregroundStyle(textPrimary.opacity(0.8))
                        .multilineTextAlignment(.center)
                }
            }
        }
    }

    // MARK: - Your Words

    private var yourWordsSection: some View {
        Group {
            if !model.soulFile.yourWords.isEmpty {
                VStack(spacing: 12) {
                    Text("Your Words")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.soulFile.yourWords.enumerated()), id: \.offset) { _, quote in
                        Text("\"\(quote)\"")
                            .font(.system(size: 14, weight: .light).italic())
                            .foregroundStyle(textPrimary.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    // MARK: - Evolution

    private var evolutionSection: some View {
        Group {
            if !model.soulFile.evolution.isEmpty {
                VStack(spacing: 12) {
                    Text("Evolution")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(accentGold)
                        .textCase(.uppercase)
                        .tracking(1.5)

                    ForEach(Array(model.soulFile.evolution.enumerated()), id: \.offset) { _, entry in
                        VStack(spacing: 4) {
                            Text("Session \(entry.session)")
                                .font(.system(size: 11))
                                .foregroundStyle(textPrimary.opacity(0.4))
                            Text(entry.insight)
                                .font(.system(size: 14))
                                .foregroundStyle(textPrimary.opacity(0.7))
                                .multilineTextAlignment(.center)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Session Button

    private var sessionButton: some View {
        VStack(spacing: 8) {
            if model.activeSoulSession != nil {
                Button {
                    model.startSoulSession()
                } label: {
                    Text("Continue Session")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(accentGold)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else if model.canStartSoulSession {
                Button {
                    model.startSoulSession()
                } label: {
                    Text("Begin Session")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(accentGold)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else if model.cooldownRemainingMs > 0 {
                let hours = model.cooldownRemainingMs / 3_600_000
                let minutes = (model.cooldownRemainingMs % 3_600_000) / 60_000
                Text("Next session in \(hours)h \(minutes)m")
                    .font(.system(size: 14))
                    .foregroundStyle(textPrimary.opacity(0.4))
            }
        }
        .padding(.top, 16)
    }
}
