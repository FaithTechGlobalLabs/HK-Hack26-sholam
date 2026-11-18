import ShalomCore
import SwiftUI

/// Account sheet: free access, the signed-in profile, or the honest guest
/// state with the native sign-in configuration gate. Constructing or showing
/// it sends no email and changes nothing; it only reads `/api/account` when a
/// native session already exists. No upgrade or restore UI while billing is off.
struct AccountScreen: View {
    @Bindable var application: ApplicationModel

    private var auth: AuthStore { application.auth }
    private var api: ShalomAPIClient { application.api }

    @Environment(\.dismiss) private var dismiss
    @State private var nameDraft = ""
    @State private var isEditingName = false
    @State private var editingUserID: String?
    @State private var confirmSignOut = false
    @State private var confirmRevokeAI = false
    @State private var confirmDeleteLocal = false
    @State private var showingSupport = false

    /// Local guest chats exist only while nobody is signed in on this device.
    private var isGuest: Bool { auth.userID == nil && !application.userIsSignedIn }

    private var access: AccessPolicy { BillingEnvironment.accessPolicy(for: auth.configuration) }

    var body: some View {
        NavigationStack {
            Form {
                if access.isFreeMode { freeAccessSection }

                if auth.userID != nil {
                    signedInSections
                } else if auth.isRestoringSession {
                    Section {
                        Label("Restoring your sign-in…", systemImage: "arrow.clockwise")
                            .font(.subheadline)
                    } footer: {
                        Text("You're using Shalom as a guest until your sign-in is refreshed.")
                    }
                } else if auth.isSignInAvailable {
                    SignInFlowView(auth: auth)
                } else {
                    guestGateSection
                }

                if let notice = auth.notice { noticeSection(notice) }

                privacySection
                if isGuest {
                    localHistorySection
                } else if let notice = application.localHistoryNotice {
                    Section("On this device") {
                        Label(notice, systemImage: "info.circle")
                            .accessibilityIdentifier("account-local-history-notice")
                    }
                }
                helpSection
            }
            .accessibilityIdentifier("account-form")
            .sheet(isPresented: $showingSupport) {
                SupportReportSheet(message: nil, configuration: application.configuration)
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onChange(of: auth.sessionRevision) { _, _ in
                nameDraft = ""
                isEditingName = false
                editingUserID = nil
                confirmSignOut = false
            }
            .task(id: auth.sessionRevision) {
                guard auth.userID != nil else { return }
                await auth.refreshAccount(using: api)
            }
        }
        .tint(ShalomTheme.accent)
        .preferredColorScheme(.light)
    }

    // MARK: Sections

    private var freeAccessSection: some View {
        Section {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Free access").font(.headline)
                    Text("Every Shalom feature is free: chat, Bible passages and flashcards. There's nothing to buy.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "checkmark.seal")
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var guestGateSection: some View {
        Section {
            Label("You're using Shalom as a guest", systemImage: "person.crop.circle")
            Text("Sign-in is turned off in this version. Chat and flashcards are free without an account; conversations are saved on this device.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } header: {
            Text("Account")
        }
    }

    @ViewBuilder
    private var signedInSections: some View {
        Section {
            if let email = auth.account?.email {
                LabeledContent("Email", value: email)
            }
            if isEditingName && editingUserID == auth.userID {
                TextField("Your name", text: $nameDraft)
                    .textContentType(.name)
                    .submitLabel(.done)
                    .onSubmit(saveName)
                    .disabled(auth.isBusy)
                HStack {
                    Button("Cancel") { isEditingName = false }
                        .buttonStyle(.borderless)
                    Spacer()
                    Button("Save", action: saveName)
                        .buttonStyle(.borderless)
                        .disabled(auth.isBusy || DisplayNamePolicy.normalize(nameDraft) == nil)
                }
            } else {
                LabeledContent("Name", value: auth.account?.displayName ?? "Not set")
                if auth.canSaveProfile && auth.serverRecognizesSession == true {
                    Button(auth.account?.displayName == nil ? "Add Your Name" : "Change Name") {
                        nameDraft = auth.account?.displayName ?? ""
                        editingUserID = auth.userID
                        isEditingName = true
                    }
                }
            }
        } header: {
            Text("Signed in")
        } footer: {
            if auth.needsDisplayName && !isEditingName {
                Text("What should Shalom call you? Add a name of 1 to \(DisplayNamePolicy.maxLength) characters.")
            } else if isEditingName {
                Text("1 to \(DisplayNamePolicy.maxLength) characters.")
            }
        }

        if auth.serverRecognizesSession == false {
            // App sign-in needs a server version that accepts it. Whether the
            // connected server has it depends on its deployment, so this is a
            // recheckable state, not a permanent failure.
            Section {
                Label("The Shalom server you're connected to didn't recognize this app sign-in, so your saved name and chats aren't loaded here. It may be running a version without app sign-in yet. Chat and flashcards stay available.",
                      systemImage: "exclamationmark.triangle")
                    .font(.subheadline)
                Button("Check Again") {
                    Task { await auth.refreshAccount(using: api) }
                }
                .disabled(auth.isBusy)
            } header: {
                Text("Server sign-in")
            }
        }

        Section {
            Button("Sign Out on This Device", role: .destructive) { confirmSignOut = true }
                .disabled(auth.isBusy)
                .confirmationDialog("Sign out on this device?", isPresented: $confirmSignOut,
                                    titleVisibility: .visible) {
                    Button("Sign Out", role: .destructive) {
                        isEditingName = false
                        Task { await auth.signOut() }
                    }
                }
        }
    }

    private var privacySection: some View {
        Section {
            NavigationLink {
                PrivacyInfoView(configuration: application.configuration)
            } label: {
                Label("Privacy", systemImage: "hand.raised")
            }
            .accessibilityIdentifier("account-privacy")

            LabeledContent("AI answers",
                           value: application.consent.isAllowed ? "Allowed" : "Not allowed")
                .accessibilityIdentifier("account-ai-state")

            if application.consent.isAllowed {
                Button("Turn Off AI Sharing", role: .destructive) { confirmRevokeAI = true }
                    .accessibilityIdentifier("account-ai-revoke")
                    .confirmationDialog("Turn off AI sharing?", isPresented: $confirmRevokeAI,
                                        titleVisibility: .visible) {
                        Button("Turn Off", role: .destructive) { application.revokeAIConsent() }
                    } message: {
                        Text("Any answer in progress stops, and future questions won't be sent until you allow it again. This can't undo what was already shared with Shalom's server, OpenRouter or an AI provider.")
                    }
            }
        } header: {
            Text("Privacy")
        } footer: {
            Text(application.consent.isAllowed
                 ? "Questions you send go to Shalom's server, OpenRouter and an AI provider. Turning this off affects future questions only."
                 : "You'll be asked before any question is sent to an AI provider. Flashcards and Bible passages work without it.")
        }
    }

    private var localHistorySection: some View {
        Section {
            Button(role: .destructive) {
                confirmDeleteLocal = true
            } label: {
                HStack {
                    Text("Delete local chats")
                    if application.clearingLocalHistory {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(application.clearingLocalHistory)
            .accessibilityIdentifier("account-delete-local-chats")
            .confirmationDialog("Delete local chats?", isPresented: $confirmDeleteLocal,
                                titleVisibility: .visible) {
                Button("Delete local chats", role: .destructive) {
                    Task { await application.clearGuestHistory() }
                }
            } message: {
                Text("This removes the guest chats saved on this device and any unsent question in the message box. It can't remove copies already sent to Shalom's server, OpenRouter or an AI provider, and it doesn't change the public flashcard deck.")
            }

            if let notice = application.localHistoryNotice {
                Label(notice, systemImage: "info.circle")
                    .font(.subheadline)
                    .accessibilityIdentifier("account-local-history-notice")
            }
        } header: {
            Text("On this device")
        } footer: {
            Text("Guest history is saved on this device. Questions you send are shared as described in Privacy.")
        }
    }

    private var helpSection: some View {
        Section {
            Button {
                showingSupport = true
            } label: {
                Label("Get Help or Report a Problem", systemImage: "questionmark.circle")
            }
            .accessibilityIdentifier("account-support")
        } header: {
            Text("Help")
        }
    }

    private func noticeSection(_ notice: String) -> some View {
        Section {
            HStack(alignment: .top) {
                Label(notice, systemImage: "info.circle")
                    .font(.subheadline)
                Spacer()
                Button {
                    auth.notice = nil
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Dismiss message")
            }
        }
    }

    private func saveName() {
        guard let expected = editingUserID, expected == auth.userID else { return }
        let value = nameDraft
        Task {
            guard expected == auth.userID else { return }
            if await auth.saveDisplayName(value, using: api), expected == auth.userID { isEditingName = false }
        }
    }
}
