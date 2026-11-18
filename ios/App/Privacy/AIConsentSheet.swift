import ShalomCore
import SwiftUI

/// Asked before the first chat question leaves the device. Two explicit
/// choices, nothing preselected. Allowing only records permission: the
/// caller dismisses and the question stays in the composer to be sent on
/// purpose. Everything sits in one Form so the whole text and both actions
/// scroll into reach at the largest text sizes.
struct AIConsentSheet: View {
    let consent: AIConsentStore
    let configuration: NativeConfiguration
    let onAllow: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Chat answers are written by an AI model run by outside companies. To answer, your question has to leave this device.")
                        .font(.body)
                }

                Section {
                    point("Your question, plus a limited part of this chat's recent history (at most \(HistoryPolicy.maxTurns) earlier messages, shortened).",
                          symbol: "text.bubble")
                    point("It goes to Shalom's server, then to OpenRouter, then to the AI model provider OpenRouter selects.",
                          symbol: "arrow.triangle.branch")
                } header: {
                    Text("What is sent")
                }

                Section {
                    point("OpenRouter and the AI provider may keep or use what they receive under their own policies. Shalom cannot promise it is not stored or used for training.",
                          symbol: "exclamationmark.shield")
                    point("Shalom's server and hosting may log request details such as time, IP address and errors. The service stores rate-limit counts using a keyed hash of a guest's IP address, not the raw address.",
                          symbol: "server.rack")
                    if configuration.canSignIn {
                        point("Signed-in chats are also saved to your account on Shalom's server.", symbol: "person.crop.circle")
                    }
                    point("Please leave out names, contact details, health and other personal or sensitive information.",
                          symbol: "hand.raised")
                } header: {
                    Text("What they may keep")
                }

                Section {
                    point("Reading a saved chat does not send it. If you send another question in it, its recent messages are sent with that question as described above.",
                          symbol: "iphone")
                    point("Flashcards and Bible passages work without agreeing.",
                          symbol: "rectangle.stack")
                    point("You can turn this off later in Account. That stops future questions; it cannot undo what was already shared.",
                          symbol: "switch.2")
                } header: {
                    Text("Your choice")
                }

                Section {
                    NavigationLink {
                        PrivacyInfoView(configuration: configuration)
                    } label: {
                        Label("Privacy Details", systemImage: "hand.raised.square")
                    }
                    .accessibilityIdentifier("ai-consent-privacy")
                }

                Section {
                    Button(action: onAllow) {
                        Text("Allow AI Answers")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: ShalomTheme.Size.minTarget)
                    }
                    .accessibilityIdentifier("ai-consent-allow")
                    .accessibilityHint("Allows sending questions you choose to send. Nothing is sent now.")

                    Button(action: onCancel) {
                        Text("Not Now")
                            .frame(maxWidth: .infinity, minHeight: ShalomTheme.Size.minTarget)
                    }
                    .accessibilityIdentifier("ai-consent-not-now")
                } footer: {
                    Text("Allowing does not send anything by itself. Your question stays in the message box until you send it.")
                }
            }
            .navigationTitle("Before You Ask")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("ai-consent")
        }
        .tint(ShalomTheme.accent)
        .preferredColorScheme(.light)
    }

    private func point(_ text: String, symbol: String) -> some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol).foregroundStyle(ShalomTheme.accent)
        }
        .font(.subheadline)
        .foregroundStyle(ShalomTheme.ink)
    }
}
