import SwiftUI

/// Email -> code (or link) sign-in rows. Only shown by AccountScreen when the
/// build's sign-in mode is configured; with the shipped `.disabled` mode it is
/// never constructed. Typing does nothing until a button is pressed.
struct SignInFlowView: View {
    let auth: AuthStore

    @State private var email = ""
    @State private var code = ""
    @FocusState private var focused: Field?

    private enum Field { case email, code }

    var body: some View {
        switch auth.signInStep {
        case .email: emailStep
        case .code(let address): codeStep(address)
        case .linkSent(let address): linkStep(address)
        }
    }

    private var emailStep: some View {
        Section {
            TextField("Email address", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.send)
                .focused($focused, equals: .email)
                .onSubmit(send)
                .disabled(auth.isBusy)
            Button(action: send) {
                HStack {
                    Text(auth.usesEmailCodes ? "Email Me a Code" : "Email Me a Sign-In Link")
                    if auth.isBusy { Spacer(); ProgressView() }
                }
            }
            .disabled(auth.isBusy || email.trimmingCharacters(in: .whitespaces).isEmpty)
        } header: {
            Text("Sign in or create an account")
        } footer: {
            Text(auth.usesEmailCodes
                 ? "We'll email you a code. New here? The same code creates your account."
                 : "We'll email you a link. Open it on this device to sign in. New here? The same link creates your account.")
        }
    }

    private func codeStep(_ address: String) -> some View {
        Section {
            TextField("\(EmailPolicy.codeLength)-digit code", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .focused($focused, equals: .code)
                .onChange(of: code) { _, new in
                    let clean = EmailPolicy.normalizeCode(new)
                    if clean != new { code = clean }
                }
                .disabled(auth.isBusy)
                .accessibilityHint("Enter the code from the email we sent to \(address).")
            Button {
                Task { await auth.verifyCode(code) }
            } label: {
                HStack {
                    Text("Sign In")
                    if auth.isBusy { Spacer(); ProgressView() }
                }
            }
            .disabled(auth.isBusy || code.count != EmailPolicy.codeLength)
            resendButton(title: "Send a New Code")
            Button("Use a Different Email") { code = ""; auth.restartSignIn() }
                .disabled(auth.isBusy)
        } header: {
            Text("Check your email")
        } footer: {
            Text("We sent a code to \(address). Codes last an hour.")
        }
        .onAppear { focused = .code }
    }

    private func linkStep(_ address: String) -> some View {
        Section {
            Label("Open the link in the email on this device.", systemImage: "envelope.open")
            resendButton(title: "Send a New Link")
            Button("Use a Different Email") { auth.restartSignIn() }
                .disabled(auth.isBusy)
        } header: {
            Text("Check your email")
        } footer: {
            Text("We sent a sign-in link to \(address).")
        }
    }

    private func resendButton(title: String) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, Int((auth.resendAvailableAt ?? .distantPast)
                .timeIntervalSince(context.date).rounded(.up)))
            Button(remaining > 0 ? "\(title) in \(remaining)s" : title) {
                Task { await auth.resend() }
            }
            .disabled(remaining > 0 || auth.isBusy)
            .accessibilityLabel(remaining > 0 ? "\(title), available in \(remaining) seconds" : title)
        }
    }

    private func send() {
        guard !auth.isBusy else { return }
        Task { await auth.requestSignIn(email: email) }
    }
}
