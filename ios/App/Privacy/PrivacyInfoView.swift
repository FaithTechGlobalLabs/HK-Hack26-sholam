import ShalomCore
import SwiftUI

/// Plain, offline privacy facts for this version of the app. It describes
/// what the code does; it is not a reviewed legal privacy policy. Pushed
/// inside an existing NavigationStack (Account, AI consent), so it has none
/// of its own. Outside links open only when tapped.
struct PrivacyInfoView: View {
    let configuration: NativeConfiguration

    @State private var showingSupport = false

    static let openRouterPrivacyURL = URL(string: "https://openrouter.ai/privacy")!
    static let openRouterLoggingURL = URL(string: "https://openrouter.ai/docs/guides/privacy/provider-logging")!

    private var serverName: String { configuration.apiBaseURL.host ?? configuration.apiBaseURL.absoluteString }

    var body: some View {
        Form {
            Section {
                Text("A plain summary of how this version of Shalom handles your data. It is not a reviewed legal privacy policy.")
                if let url = configuration.privacyPolicyURL {
                    Link(destination: url) {
                        Label("Shalom Privacy Policy", systemImage: "doc.text")
                    }
                    .accessibilityIdentifier("privacy-policy-link")
                } else {
                    Text(configuration.supportContactURL == nil
                         ? "A public privacy policy and contact address have not been set up for this version yet."
                         : "A public privacy policy has not been published for this version yet.")
                        .foregroundStyle(ShalomTheme.mutedInk)
                        .accessibilityIdentifier("privacy-policy-missing")
                }
            } header: {
                Text("About this page")
            }

            Section {
                fact("When you send a chat question, the app sends it to Shalom's server (\(serverName)) together with a limited, shortened part of the same chat's recent messages. Reading a saved chat without sending a new question does not upload it.",
                     symbol: "arrow.up.message")
                fact("The server passes that text to OpenRouter, which sends it to the AI model provider it selects to write the answer.",
                     symbol: "arrow.triangle.branch")
                fact("Flashcards and Bible passages need no AI permission. Loading the card deck is an ordinary request to Shalom's server.",
                     symbol: "rectangle.stack")
            } header: {
                Text("What leaves this device")
            }

            Section {
                fact("To limit how often the service can be used, the server counts requests per signed-in account or, for guests, per keyed hash of your IP address. This count does not keep the raw IP address.",
                     symbol: "gauge.with.dots.needle.33percent")
                fact("Shalom's server and its hosting may record standard request details such as time, IP address and errors.",
                     symbol: "server.rack")
                if configuration.canSignIn {
                    fact("If you sign in, your email address, display name and chats are stored with your account on Shalom's database. Account-data deletion and retention must be set up before native sign-in is released; this app does not offer account deletion yet.",
                         symbol: "person.crop.circle")
                } else {
                    fact("Sign-in is turned off in this version. The app does not create an account or ask for an email address. Anything you put in a question may still be sent as chat content.",
                         symbol: "person.crop.circle")
                }
                fact("This app contains no advertising or analytics SDKs.", symbol: "eye.slash")
            } header: {
                Text("Shalom's server")
            }

            Section {
                fact("OpenRouter and the AI provider may log, keep or use what they receive under their own policies. Shalom cannot promise that your words are not retained or used for training.",
                     symbol: "exclamationmark.shield")
                fact("Please leave out names, contact details, health and other personal or sensitive information.",
                     symbol: "hand.raised")
                Link(destination: Self.openRouterPrivacyURL) {
                    Label("OpenRouter Privacy Policy", systemImage: "arrow.up.right.square")
                }
                .accessibilityIdentifier("privacy-openrouter-policy")
                Link(destination: Self.openRouterLoggingURL) {
                    Label("OpenRouter: Logging and Provider Data Policies", systemImage: "arrow.up.right.square")
                }
                .accessibilityIdentifier("privacy-openrouter-logging")
            } header: {
                Text("AI providers")
            } footer: {
                Text("These links open OpenRouter's own pages in your browser.")
            }

            Section {
                fact("As a guest, your chat history is saved in this app on this device. Questions and recent messages you send still go to the services described above.",
                     symbol: "iphone")
                fact("Delete local chats in Account removes them from this device. It cannot remove copies already sent to Shalom's server, OpenRouter or an AI provider, and it does not change the public flashcard deck. Deleting the app also removes its local data.",
                     symbol: "trash")
            } header: {
                Text("On this device")
            }

            Section {
                fact("Answers are written by an AI model and can be wrong. Bible references marked as checked were looked up before answering; others were not checked. Even checked references do not guarantee the answer is correct.",
                     symbol: "book")
            } header: {
                Text("About answers")
            }

            Section {
                fact("You can turn off AI sharing in Account at any time. This stops future questions from being sent; it cannot undo what was already shared.",
                     symbol: "switch.2")
                if let url = configuration.supportContactURL {
                    Link(destination: url) {
                        Label(configuration.supportURL == nil ? "Email Shalom Support" : "Open Shalom Support",
                              systemImage: configuration.supportURL == nil ? "envelope" : "questionmark.circle")
                    }
                    .accessibilityIdentifier("privacy-support-contact")
                    if let email = configuration.supportEmail {
                        Text(email)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                }
                Button {
                    showingSupport = true
                } label: {
                    Label("Get Help or Report a Problem", systemImage: "questionmark.circle")
                }
                .accessibilityIdentifier("privacy-support")
            } header: {
                Text("Your choices and help")
            }
        }
        .navigationTitle("Privacy")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingSupport) {
            SupportReportSheet(message: nil, configuration: configuration)
        }
        .accessibilityIdentifier("privacy-info")
    }

    private func fact(_ text: String, symbol: String) -> some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol).foregroundStyle(ShalomTheme.accent)
        }
        .font(.subheadline)
        .foregroundStyle(ShalomTheme.ink)
    }
}
