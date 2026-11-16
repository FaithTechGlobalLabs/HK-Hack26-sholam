import ShalomCore
import SwiftUI

/// The same navigation model as the website: New chat, Flashcards, recent
/// conversations and the account at the bottom. On iPhone this is a drawer;
/// on iPad it is the persistent sidebar. All controls are real, not chrome.
struct SidebarView: View {
    @Bindable var application: ApplicationModel
    var isPersistent = false
    var onClose: () -> Void = {}
    @State private var query = ""
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var filteredChats: [ChatSummary] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return q.isEmpty ? application.history : application.history.filter {
            $0.title.localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                BrandLogo(markSize: 24)
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .colorMultiply(ShalomTheme.skyInk)
                Spacer()
                if !isPersistent {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .medium))
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close sidebar")
                    .accessibilityIdentifier("sidebar-close")
                }
            }
            .padding(.horizontal, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(spacing: 2) {
                        Button {
                            application.chat.newChat()
                            choose(.chat)
                        } label: { row("New chat", symbol: "square.and.pencil") }
                        .accessibilityIdentifier("sidebar-new-chat")
                        destination(.chat, label: "Chat", symbol: "bubble.left.and.bubble.right")
                        destination(.flashcards, label: "Flashcards", symbol: "square.stack")
                        destination(.chats, label: "All chats", symbol: "clock")
                    }
                    .padding(.horizontal, 8)

                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 18))
                            .foregroundStyle(ShalomTheme.mutedInk)
                        TextField(dynamicTypeSize.isAccessibilitySize ? "Search" : "Search chats", text: $query)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityLabel("Search chats")
                            .accessibilityIdentifier("sidebar-search")
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .frame(minHeight: 44)
                    .background(.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 12)

                    LazyVStack(alignment: .leading, spacing: 2) {
                        Text("Chats").font(.caption.weight(.medium))
                            .foregroundStyle(ShalomTheme.mutedInk)
                            .padding(.horizontal, 12).padding(.bottom, 4)
                        if filteredChats.isEmpty {
                            Text(query.isEmpty ? "Your conversations appear here." : "No matching chat titles.")
                                .font(.footnote).foregroundStyle(ShalomTheme.mutedInk)
                                .padding(.horizontal, 12).padding(.vertical, 8)
                        } else {
                            ForEach(filteredChats) { chat in
                                Button {
                                    onClose()
                                    Task { await application.openChat(id: chat.id) }
                                } label: {
                                    Text(chat.title)
                                        .font(.subheadline)
                                        .lineLimit(2).multilineTextAlignment(.leading)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                        .padding(.horizontal, 12)
                                }
                                .accessibilityIdentifier("sidebar-chat-\(chat.id)")
                            }
                        }
                        if let note = application.historyNotice {
                            Text(note).font(.caption).foregroundStyle(ShalomTheme.mutedInk)
                                .padding(12)
                        }
                    }
                    .padding(.horizontal, 8)
                    if dynamicTypeSize.isAccessibilitySize {
                        accountButton.padding(.top, 12).padding(.bottom, 8)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .accessibilityIdentifier("sidebar-content")

            if !dynamicTypeSize.isAccessibilitySize { accountButton }
        }
        .padding(.top, 8).padding(.bottom, 12)
        .foregroundStyle(ShalomTheme.ink)
        .tint(ShalomTheme.skyInk)
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
            Rectangle().fill(.regularMaterial)
                .overlay(Color.white.opacity(0.34))
                .ignoresSafeArea()
        }
        .task { await application.refreshHistory() }
    }

    private var accountButton: some View {
        Button {
            onClose()
            application.accountPresented = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle").font(.system(size: 24))
                VStack(alignment: .leading, spacing: 3) {
                    Text(application.auth.account?.label ?? "Your account")
                        .font(.subheadline.weight(.medium)).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Free access").font(.caption).foregroundStyle(ShalomTheme.mutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "ellipsis").font(.system(size: 14))
            }
            .frame(minHeight: 52).padding(.horizontal, 16)
        }
        .accessibilityLabel("Account")
        .accessibilityIdentifier("account-button")
    }

    private func destination(_ section: ApplicationModel.Section, label: String, symbol: String) -> some View {
        Button { choose(section) } label: { row(label, symbol: symbol) }
            .background(application.section == section ? ShalomTheme.skyInk.opacity(0.09) : .clear,
                        in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("nav-\(section.title)")
    }

    private func row(_ title: String, symbol: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 20))
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(title)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 8 : 0)
        .contentShape(Rectangle())
    }

    private func choose(_ section: ApplicationModel.Section) {
        application.section = section
        onClose()
    }
}
