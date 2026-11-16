import ShalomCore
import SwiftUI

struct HistoryScreen: View {
    @Bindable var application: ApplicationModel
    @State private var query = ""

    private var shown: [ChatSummary] {
        let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? application.history : application.history.filter {
            $0.title.localizedCaseInsensitiveContains(value)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text(application.userIsSignedIn ? "Your conversations" : "On this device")
                    .font(.title2.weight(.semibold)).foregroundStyle(ShalomTheme.ink)
                if !application.userIsSignedIn {
                    Text("Guest conversations stay on this device. An account keeps chats across your devices when native sign-in is enabled.")
                        .font(.subheadline).foregroundStyle(ShalomTheme.ink)
                }
                if let notice = application.historyNotice {
                    Label(notice, systemImage: "wifi.slash")
                        .font(.subheadline).foregroundStyle(ShalomTheme.ink)
                }
                if application.userIsSignedIn && application.guestImportCount > 0 {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Keep \(application.guestImportCount) guest conversations in your account?")
                        Text("Their original device copies will not be deleted. Imported text keeps no verified citation status.")
                            .font(.footnote)
                        Button {
                            Task { await application.importGuestHistory() }
                        } label: {
                            if application.importBusy { ProgressView() }
                            else { Text("Keep conversations") }
                        }
                        .disabled(application.importBusy)
                        .frame(minHeight: 44)
                    }
                    .padding(16).foregroundStyle(ShalomTheme.ink)
                    .background(ChatSurface(cornerRadius: 20))
                }
                if let notice = application.importNotice {
                    Text(notice).font(.footnote).foregroundStyle(ShalomTheme.ink)
                }
                if shown.isEmpty && application.historyLoading {
                    ProgressView("Loading your chats…").tint(ShalomTheme.skyInk).foregroundStyle(ShalomTheme.ink)
                } else if shown.isEmpty {
                    ContentUnavailableView(
                        query.isEmpty ? "No conversations yet" : "No matching chats",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text(query.isEmpty ? "Start a conversation in Chat." : "Try another title.")
                    )
                    .foregroundStyle(ShalomTheme.ink)
                } else {
                    ForEach(shown) { item in
                        Button {
                            Task { await application.openChat(id: item.id) }
                        } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title).font(.body.weight(.medium)).multilineTextAlignment(.leading)
                                    Text("\(item.messageCount) messages").font(.caption)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption)
                            }
                            .frame(minHeight: 48).padding(16)
                        }
                        .buttonStyle(.plain).foregroundStyle(ShalomTheme.ink)
                        Divider().overlay(ShalomTheme.ink.opacity(0.08))
                    }
                }
            }
            .frame(maxWidth: 760).padding(20).frame(maxWidth: .infinity)
        }
        .navigationTitle("Chats")
        .searchable(text: $query, prompt: "Search chat titles")
        .refreshable { await application.refreshHistory() }
        .task { await application.refreshHistory() }
    }
}
