import SwiftUI

/// Chat-first shell: a leading drawer on iPhone and the website's persistent
/// sidebar on iPad. No bottom tab bar, welcome banner or model-picker prop.
struct RootView: View {
    @Bindable var application: ApplicationModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
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
            AccountScreen(application: application)
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
            if phase == .active {
                Task {
                    await application.auth.resume()
                    if application.section == .flashcards { await application.refreshDeck() }
                }
            }
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
                if dynamicTypeSize.isAccessibilitySize {
                    modeMenu
                } else {
                    ViewThatFits(in: .horizontal) {
                        modeButtons
                        modeMenu
                    }
                }
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

    private var modeMenu: some View {
        Picker("Mode", selection: modeSelection) {
            Text("Chat").tag(ApplicationModel.Section.chat)
            Text("Flashcards").tag(ApplicationModel.Section.flashcards)
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier("mode-switch-menu")
    }

    private var modeButtons: some View {
        HStack(spacing: 0) {
            ForEach([ApplicationModel.Section.chat, .flashcards]) { section in
                let selected = application.section == section
                Button { application.section = section } label: {
                    Text(section.title)
                        .font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: true, vertical: true)
                        .padding(.horizontal, ShalomTheme.Spacing.m)
                        .padding(.vertical, ShalomTheme.Spacing.xs)
                        .frame(minHeight: ShalomTheme.Size.minTarget)
                }
                .buttonStyle(ModeButtonStyle(selected: selected))
                .accessibilityIdentifier("mode-\(section.title)")
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .fixedSize(horizontal: true, vertical: true)
        .padding(.horizontal, ShalomTheme.Spacing.xxs)
        .background {
            if reduceTransparency {
                Capsule().fill(ShalomTheme.factPaper)
            } else {
                Capsule().fill(.regularMaterial)
            }
        }
        .environment(\.colorScheme, .light)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Mode")
        .accessibilityIdentifier("mode-switch")
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
            ChatScreen(model: application.chat, configuration: application.configuration, onCard: application.showCard)
        case .flashcards:
            FlashcardsScreen(
                cards: application.cards,
                isOffline: application.deckOffline,
                focusedCardID: application.focusedCardID,
                isLoading: application.deckRefreshing,
                notice: application.deckNotice,
                onRetry: { Task { await application.refreshDeck(force: true) } },
                onAsk: application.askFromCard
            )
            .onAppear { Task { await application.refreshDeck() } }
        case .chats:
            HistoryScreen(application: application)
        }
    }
}

private struct ModeButtonStyle: ButtonStyle {
    let selected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(selected ? ShalomTheme.skyInk : ShalomTheme.ink)
            .background {
                Capsule().fill(selected
                    ? ShalomTheme.onSky.opacity(configuration.isPressed ? 0.75 : 1)
                    : ShalomTheme.ink.opacity(configuration.isPressed ? 0.1 : 0))
                    .padding(.vertical, ShalomTheme.Spacing.xxs)
            }
            .contentShape(Capsule())
            .hoverEffect(.highlight)
    }
}
