import ShalomCore
import SwiftUI

/// Account sheet: free access, the signed-in profile, or the honest guest
/// state with the native sign-in configuration gate. Constructing or showing
/// it sends no email and changes nothing; it only reads `/api/account` when a
/// native session already exists. No upgrade or restore UI while billing is off.
struct AccountScreen: View {
    let auth: AuthStore
    let api: ShalomAPIClient

    @Environment(\.dismiss) private var dismiss
    @State private var nameDraft = ""
    @State private var isEditingName = false
    @State private var editingUserID: String?
    @State private var confirmSignOut = false

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
            Text("App sign-in will be turned on once it has been set up and tested. Chat and flashcards are free without an account; cross-device history will need sign-in.")
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
