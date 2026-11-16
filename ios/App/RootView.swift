import SwiftUI

/// Chat-first shell: a leading drawer on iPhone and the website's persistent
/// sidebar on iPad. No bottom tab bar, welcome banner or model-picker prop.
struct RootView: View {
    @Bindable var application: ApplicationModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var sidebarPresented = false
    @State private var columns: NavigationSplitViewVisibility = .all

    private var isWide: Bool { horizontalSizeClass == .regular }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                ShalomTheme.skyTop.ignoresSafeArea()
                shell(width: geometry.size.width)
                    .accessibilityHidden(!application.accountScopeMatches)
                    .allowsHitTesting(application.accountScopeMatches)
                if !application.accountScopeMatches {
                    ShalomTheme.skyTop.ignoresSafeArea()
                        .overlay { ProgressView("Updating account…").tint(.white).foregroundStyle(.white) }
                }
                if scenePhase != .active {
                    ShalomTheme.skyTop.ignoresSafeArea()
                        .overlay { BrandLogo(markSize: 44) }
                        .accessibilityHidden(true)
                }
            }
        }
        .tint(ShalomTheme.skyInk)
        .sheet(isPresented: $application.accountPresented) {
            AccountScreen(auth: application.auth, api: application.api)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .onChange(of: application.auth.sessionRevision) { _, _ in
            Task { await application.sessionDidChange() }
        }
        .onChange(of: application.chat.completedTurnRevision) { _, _ in
            Task { await application.refreshHistory() }
        }
        .onChange(of: application.section) { _, section in
            application.cancelPendingHistoryOpen()
            if section != .chat { application.chat.stop() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { application.chat.stopForBackground() }
            if phase == .active { Task { await application.auth.resume() } }
        }
        .onChange(of: isWide) { _, wide in if wide { sidebarPresented = false } }
    }

    @ViewBuilder
    private func shell(width: CGFloat) -> some View {
        if isWide {
            NavigationSplitView(columnVisibility: $columns) {
                SidebarView(application: application, isPersistent: true)
                    .navigationSplitViewColumnWidth(
                        min: dynamicTypeSize.isAccessibilitySize ? 300 : 220,
                        ideal: dynamicTypeSize.isAccessibilitySize ? 340 : 260,
                        max: dynamicTypeSize.isAccessibilitySize ? 400 : 300
                    )
                    .toolbarBackground(.hidden, for: .navigationBar)
            } detail: {
                mainNavigation
            }
            .navigationSplitViewStyle(.balanced)
        } else {
            ZStack(alignment: .leading) {
                mainNavigation
                    .accessibilityHidden(sidebarPresented)
                    .allowsHitTesting(!sidebarPresented)
                if sidebarPresented {
                    Button(action: closeSidebar) { Color.black.opacity(0.25).ignoresSafeArea() }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Close sidebar")
                    SidebarView(application: application, onClose: closeSidebar)
                        .frame(width: dynamicTypeSize.isAccessibilitySize
                               ? min(360, width * 0.92) : min(320, width * 0.86))
                        .transition(reduceMotion ? .opacity : .move(edge: .leading))
                        .zIndex(2)
                }
            }
            .animation(reduceMotion ? .easeOut(duration: 0.1) : .easeOut(duration: 0.22), value: sidebarPresented)
        }
    }

    private var mainNavigation: some View {
        NavigationStack {
            screen(application.section)
                .background { SkyBackground().ignoresSafeArea() }
                .navigationTitle(application.section == .chat ? "Shalom" : application.section.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { header }
                .toolbarBackground(.hidden, for: .navigationBar)
                .toolbarColorScheme(.light, for: .navigationBar)
                .tint(ShalomTheme.skyInk)
        }
    }

    @ToolbarContentBuilder
    private var header: some ToolbarContent {
        if #available(iOS 26.0, *) {
            if !isWide {
                ToolbarItem(placement: .topBarLeading) { menuButton }
                    .sharedBackgroundVisibility(.hidden)
            }
            ToolbarItem(placement: .topBarTrailing) { newChatButton }
                .sharedBackgroundVisibility(.hidden)
        } else {
            if !isWide { ToolbarItem(placement: .topBarLeading) { menuButton } }
            ToolbarItem(placement: .topBarTrailing) { newChatButton }
        }
        ToolbarItem(placement: .principal) {
            if isWide {
                Picker("Mode", selection: modeSelection) {
                    Text("Chat").tag(ApplicationModel.Section.chat)
                    Text("Flashcards").tag(ApplicationModel.Section.flashcards)
                }
                .pickerStyle(.segmented).frame(maxWidth: 220)
                .accessibilityIdentifier("mode-switch")
            } else if application.section == .chat {
                Text("Shalom").font(.headline).foregroundStyle(ShalomTheme.ink)
            } else {
                Text(application.section.title).font(.headline).foregroundStyle(ShalomTheme.ink)
            }
        }
    }

    private var menuButton: some View {
        Button {
            withAnimation(reduceMotion ? .easeOut(duration: 0.1) : .easeOut(duration: 0.22)) {
                sidebarPresented.toggle()
            }
        } label: {
            Image(systemName: "line.3.horizontal").font(.title3)
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open sidebar")
        .accessibilityIdentifier("sidebar-toggle")
    }

    private var newChatButton: some View {
        Button {
            application.chat.newChat()
            application.section = .chat
            closeSidebar()
        } label: {
            Image(systemName: "square.and.pencil").font(.title3)
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New chat")
        .accessibilityIdentifier("new-chat")
    }

    private var modeSelection: Binding<ApplicationModel.Section> {
        Binding(
            get: { application.section == .flashcards ? .flashcards : .chat },
            set: { application.section = $0 }
        )
    }

    private func closeSidebar() {
        withAnimation(reduceMotion ? .easeOut(duration: 0.1) : .easeOut(duration: 0.22)) {
            sidebarPresented = false
        }
    }

    @ViewBuilder
    private func screen(_ section: ApplicationModel.Section) -> some View {
        switch section {
        case .chat:
            ChatScreen(model: application.chat, onCard: application.showCard)
        case .flashcards:
            VStack(spacing: 0) {
                if let notice = application.deckNotice {
                    Text(notice).font(.footnote).foregroundStyle(ShalomTheme.ink)
                        .padding(.horizontal, 20).padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                }
                FlashcardsScreen(
                    cards: application.cards,
                    isOffline: application.deckOffline,
                    focusedCardID: application.focusedCardID,
                    onAsk: application.askFromCard
                )
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await application.refreshDeck(force: true) }
                    } label: {
                        if application.deckRefreshing { ProgressView() }
                        else { Label("Refresh cards", systemImage: "arrow.clockwise") }
                    }
                    .disabled(application.deckRefreshing)
                }
            }
        case .chats:
            HistoryScreen(application: application)
        }
    }
}
