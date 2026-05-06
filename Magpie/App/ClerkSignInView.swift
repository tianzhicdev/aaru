import SwiftUI

struct ClerkSignInView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = "apptest@trymagpie.xyz"
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                VStack(spacing: 24) {
                    Spacer()

                    Image("MagpieLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 64, height: 64)

                    Text("Demo Sign In")
                        .font(Theme.wordmark(28))
                        .foregroundStyle(Theme.primaryDeep)

                    VStack(spacing: 14) {
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .padding(14)
                            .background(Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .padding(14)
                            .background(Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.horizontal, 32)

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.errorText)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }

                    Button {
                        Task { await signIn() }
                    } label: {
                        Group {
                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Sign In")
                                    .font(.system(size: 16, weight: .semibold))
                            }
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                    }
                    .disabled(isLoading || email.isEmpty || password.isEmpty)
                    .padding(.horizontal, 40)

                    Spacer()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.primaryDeep)
                }
            }
        }
    }

    private func signIn() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await model.authenticateWithDemo(email: email, password: password)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
