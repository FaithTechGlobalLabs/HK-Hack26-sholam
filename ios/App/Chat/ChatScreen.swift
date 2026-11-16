import ShalomCore
import SwiftUI

/// The chat page, laid out like ChatGPT mobile: a quiet empty state, right
/// aligned user bubbles, unboxed answers and a pale pill composer. The root
/// view owns the top bar (logo, sidebar, new chat) and the sky behind it.
@MainActor
struct ChatScreen: View {
    @Bindable var model: ChatViewModel
    let onCard: (String) -> Void
    @FocusState private var composerFocused: Bool
    @State private var scrollState = ConversationScrollState()
    @State private var contentFrame = CGRect.null
    @State private var followTask: Task<Void, Never>?
    @State private var settleTask: Task<Void, Never>?
    @State private var scrollEpoch = 0
    @Namespace private var scrollSpace
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// Short visible labels; the full prompt is what gets sent.
    private let suggestions: [(label: String, compactLabel: String, prompt: String)] = [
        ("Who is Jesus?", "Who is Jesus?", "Who is Jesus?"),
        ("Did a donkey really talk?", "Talking donkey?", "Did a donkey really talk in the Bible?"),
        ("Why does God allow suffering?", "Why suffering?", "Why does God allow suffering?"),
        ("What if I have doubts?", "Having doubts?", "What if I have doubts about God?"),
    ]

    var body: some View {
        Group {
            if model.messages.isEmpty {
                emptyState
            } else {
                conversation
            }
        }
        .foregroundStyle(ShalomTheme.ink)
        .tint(ShalomTheme.accent)
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
    }

    // MARK: Conversation

    private var conversation: some View {
        GeometryReader { viewport in
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 28) {
                        ForEach(model.messages) { message in
                            if message.role == .user {
                                HStack {
                                    Spacer(minLength: 56)
                                    Text(message.text)
                                        .textSelection(.enabled)
                                        .padding(.horizontal, 16).padding(.vertical, 10)
                                        .background { ChatSurface(cornerRadius: 22) }
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityLabel("You: \(message.text)")
                            } else {
                                AnswerView(message: message, onCard: onCard)
                            }
                        }
                        if let error = model.errorMessage { errorLabel(error) }
                        Color.clear.frame(height: 1).id("conversation-end")
                    }
                    .frame(maxWidth: 760)
                    .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 8)
                    .frame(maxWidth: .infinity)
                    .background {
                        GeometryReader { geometry in
                            Color.clear.preference(
                                key: ConversationFrameKey.self,
                                value: geometry.frame(in: .named(scrollSpace))
                            )
                        }
                    }
                }
                .coordinateSpace(name: scrollSpace)
                .defaultScrollAnchor(.top)
                .scrollDismissesKeyboard(.interactively)
                .accessibilityIdentifier("chat-conversation")
                .accessibilityValue(scrollInspection)
                .simultaneousGesture(
                    DragGesture()
                        .onChanged { _ in
                            if !scrollState.isUserInteracting {
                                cancelScrollWork()
                                scrollState.beginUserInteraction()
                            }
                        }
                        .onEnded { _ in
                            scrollState.endUserInteraction()
                            scheduleFollow(proxy)
                        }
                )
                .overlay(alignment: .bottom) {
                    if !scrollState.isNearLatest && (!scrollState.isFollowing || !model.isStreaming) {
                        Button {
                            scrollState.followLatest()
                            scheduleFollow(proxy)
                        } label: {
                            Image(systemName: "arrow.down")
                                .font(.body.weight(.semibold))
                                .frame(width: 40, height: 40)
                                .background { ChatSurface(cornerRadius: 20) }
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Latest")
                        .accessibilityIdentifier("chat-latest")
                        .padding(.bottom, 4)
                    }
                }
                .onPreferenceChange(ConversationFrameKey.self) { frame in
                    contentFrame = frame
                    observeConversation(frame, viewport: viewport.size)
                    if model.isStreaming { scheduleFollow(proxy) }
                }
                .onChange(of: viewport.size) { _, size in
                    observeConversation(contentFrame, viewport: size)
                    scheduleFollow(proxy)
                }
                .onChange(of: model.messages.last?.text) { _, _ in scheduleFollow(proxy) }
                .onChange(of: model.isStreaming) { _, _ in scheduleFollow(proxy) }
                .onChange(of: scrollState.isFollowing) { _, following in
                    if following { scheduleFollow(proxy) }
                }
                .onChange(of: model.thread.id) { _, _ in
                    resetScroll(suppressOffsetChanges: true)
                    observeConversation(contentFrame, viewport: viewport.size)
                    scheduleFollow(proxy)
                }
                .onAppear {
                    observeConversation(contentFrame, viewport: viewport.size)
                    scheduleFollow(proxy)
                }
                .onDisappear { resetScroll() }
            }
        }
    }

    private var scrollInspection: String {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            let distance = Int((scrollState.metrics?.bottomDistance ?? 0).rounded())
            return "following=\(scrollState.isFollowing);dragging=\(scrollState.isUserInteracting);near=\(scrollState.isNearLatest);distance=\(distance)"
        }
        #endif
        return ""
    }

    private func observeConversation(_ frame: CGRect, viewport: CGSize) {
        guard !frame.isNull, !frame.isInfinite else { return }
        scrollState.observe(.init(
            top: Double(frame.minY), contentHeight: Double(frame.height),
            viewportHeight: Double(viewport.height)
        ))
    }

    private func scheduleFollow(_ proxy: ScrollViewProxy) {
        guard scrollState.isFollowing, !scrollState.isUserInteracting, followTask == nil else { return }
        let epoch = scrollEpoch
        followTask = Task { @MainActor in
            do { try await Task.sleep(for: .milliseconds(80)) }
            catch { return }
            guard !Task.isCancelled, epoch == scrollEpoch else { return }
            followTask = nil
            guard scrollState.needsScrollToLatest else { return }
            beginScrollSettling()
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { proxy.scrollTo("conversation-end", anchor: .bottom) }
        }
    }

    private func beginScrollSettling() {
        scrollState.beginProgrammaticScroll()
        settleTask?.cancel()
        let epoch = scrollEpoch
        settleTask = Task { @MainActor in
            do { try await Task.sleep(for: .milliseconds(150)) }
            catch { return }
            guard !Task.isCancelled, epoch == scrollEpoch else { return }
            scrollState.endProgrammaticScroll()
            settleTask = nil
        }
    }

    private func cancelScrollWork() {
        scrollEpoch += 1
        followTask?.cancel()
        followTask = nil
        settleTask?.cancel()
        settleTask = nil
        scrollState.endProgrammaticScroll()
    }

    private func resetScroll(suppressOffsetChanges: Bool = false) {
        cancelScrollWork()
        scrollState = ConversationScrollState()
        if suppressOffsetChanges { beginScrollSettling() }
    }

    private func send(_ question: String? = nil) {
        if let question { model.send(question) } else { model.send() }
        if model.isStreaming {
            composerFocused = false
            scrollState.followLatest()
        }
    }

    private func errorLabel(_ error: String) -> some View {
        Label(error, systemImage: "exclamationmark.circle")
            .font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.updatesFrequently)
    }

    // MARK: Empty state

    private var emptyState: some View {
        GeometryReader { viewport in
            ScrollView {
                VStack(spacing: 0) {
                    if !composerFocused {
                        Spacer(minLength: 24)
                        Text("What are you curious about?")
                            .font(.title2.weight(.semibold))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.horizontal, 24)
                        Spacer(minLength: 24)
                        VStack(alignment: .leading, spacing: 12) {
                            if let error = model.errorMessage { errorLabel(error) }
                            LazyVGrid(columns: suggestionColumns, spacing: 8) {
                                ForEach(suggestions, id: \.prompt) { suggestion in
                                    Button { send(suggestion.prompt) } label: {
                                        Text(horizontalSizeClass == .regular ? suggestion.label : suggestion.compactLabel)
                                            .font(.subheadline.weight(.medium))
                                            .multilineTextAlignment(.leading)
                                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                                            .padding(.horizontal, 14).padding(.vertical, 6)
                                            .background { ChatSurface(cornerRadius: 16) }
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityHint("Asks: \(suggestion.prompt)")
                                    .disabled(model.cooldownSeconds > 0)
                                    .opacity(model.cooldownSeconds > 0 ? 0.55 : 1)
                                }
                            }
                        }
                        .frame(maxWidth: 760)
                        .padding(.horizontal, 16).padding(.bottom, 8)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: viewport.size.height)
                .contentShape(Rectangle())
                .onTapGesture { composerFocused = false }
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var suggestionColumns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: count)
    }

    // MARK: Composer

    private var composer: some View {
        VStack(spacing: 6) {
            if model.isReadOnlyOffline {
                Label("Downloaded conversation. Start a new chat when connected.", systemImage: "wifi.slash")
                    .font(.footnote)
            }
            if model.cooldownSeconds > 0 {
                Text("You can try again in \(model.cooldownSeconds) seconds.")
                    .font(.footnote)
                    .accessibilityLabel("Free usage limit. Please wait before sending another question.")
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("", text: $model.draft,
                          prompt: Text("Ask anything").foregroundStyle(ShalomTheme.mutedInk),
                          axis: .vertical)
                    .lineLimit(1...(dynamicTypeSize.isAccessibilitySize ? 3 : 6))
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(ShalomTheme.ink)
                    .focused($composerFocused)
                    .accessibilityIdentifier("chat-composer")
                    .padding(.vertical, 12)
                    .padding(.leading, 6)
                    .disabled(model.isReadOnlyOffline)
                if model.isStreaming {
                    Button { model.stop() } label: {
                        Image(systemName: "stop.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(ShalomTheme.ink, in: Circle())
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Stop answering")
                    .accessibilityIdentifier("chat-stop")
                } else {
                    Button { send() } label: {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(model.canSend ? Color.white : ShalomTheme.mutedInk)
                            .frame(width: 34, height: 34)
                            .background(model.canSend ? ShalomTheme.accent : ShalomTheme.ink.opacity(0.1),
                                        in: Circle())
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Send question")
                    .accessibilityIdentifier("chat-send")
                    .keyboardShortcut(.return, modifiers: [.command])
                    .disabled(!model.canSend)
                }
            }
            .buttonStyle(.plain)
            .padding(.leading, 14).padding(.trailing, 4).padding(.vertical, 2)
            .background {
                ChatSurface(cornerRadius: 26, solid: true)
                    .shadow(color: ShalomTheme.ink.opacity(0.08), radius: 10, y: 2)
            }
            .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .onTapGesture { composerFocused = true }

            Text(dynamicTypeSize.isAccessibilitySize
                 ? "Shalom can make mistakes. Check sources."
                 : "Verse text is from the Berean Standard Bible. Shalom can make mistakes; check what matters.")
                .font(.caption2).multilineTextAlignment(.center)
                .padding(.horizontal, 12)
        }
        .foregroundStyle(ShalomTheme.ink)
        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 6)
        .frame(maxWidth: 784)
        .frame(maxWidth: .infinity)
        .background {
            // Fade the scrolling conversation out under the composer so the
            // disclaimer stays readable over the sky.
            LinearGradient(
                stops: [
                    .init(color: ShalomTheme.skyBottom.opacity(0), location: 0),
                    .init(color: ShalomTheme.skyBottom.opacity(0.92), location: 0.4),
                ],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea(edges: .bottom)
            .allowsHitTesting(false)
        }
    }
}

/// A pale translucent surface for bubbles, suggestions and the composer: the
/// light counterpart to `GlassBackground`, carrying dark ink over the sky.
struct ChatSurface: View {
    var cornerRadius: CGFloat = 20
    /// Near-opaque, for the composer that must stay readable over anything.
    var solid = false

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        shape
            .fill(Color.white.opacity(reduceTransparency || contrast == .increased ? 1 : (solid ? 0.94 : 0.72)))
            .overlay {
                shape.strokeBorder(ShalomTheme.ink.opacity(contrast == .increased ? 0.45 : 0.08), lineWidth: 1)
            }
    }
}
