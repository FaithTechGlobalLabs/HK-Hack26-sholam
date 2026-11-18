import XCTest
import UIKit

/// Every launch uses `--ui-testing`, which (DEBUG builds only) points the
/// app at `https://ui-tests.invalid`, disables auth, deck refresh and billing,
/// and replaces chat transport with the scripted `UITestChatAPI`:
///
/// - `--ui-chat-fixture=verified|unverified|hold|error` picks a script;
///   without it the app answers with a no-network refusal.
/// - `--ui-reset-storage` clears only the ui-tests.invalid app cache first.
///
/// No test sends anything to a real server, model, auth or billing service.
@MainActor
final class ShalomUITests: XCTestCase {
    // Synthetic fixture text, mirrored from App/Chat/UITestChatAPI.swift.
    // Verse text is BSB from the repository's own test fixtures.
    private enum Fixture {
        static let answerMarker = "Synthetic UI test answer"
        static let exodus36 = "Then He said, “I am the God of your father, the God of Abraham, the God of Isaac, and the God of Jacob.” At this, Moses hid his face, for he was afraid to look at God."
        static let exodus37 = "The LORD said, “I have indeed seen the affliction of My people in Egypt. I have heard them crying out because of their oppressors, and I am aware of their sufferings."
        static let holdPartial = "Synthetic hold fixture: this partial answer stays open until Stop is pressed."
        static let errorMarker = "Synthetic UI test error"
        static let refusalMarker = "UI test mode has no chat transport"
    }

    private let timeout: TimeInterval = 10
    private var orientationRestoreRegistered = false
    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    // MARK: - Launch and orientation

    private func launch(fixture: String? = nil, resetStorage: Bool = true, accessibilitySize: Bool = false,
                        cardID: String? = nil, consentGranted: Bool = true) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        var arguments = ["--ui-testing"]
        if resetStorage { arguments.append("--ui-reset-storage") }
        if let fixture { arguments.append("--ui-chat-fixture=\(fixture)") }
        if let cardID { arguments.append("--ui-card=\(cardID)") }
        if consentGranted { arguments.append("--ui-ai-consent-allowed") }
        if accessibilitySize {
            arguments += ["-UIPreferredContentSizeCategoryName", UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue]
        }
        app.launchArguments = arguments
        // iPad runs the suite in landscape (persistent sidebar); iPhone in
        // portrait (leading drawer behind sidebar-toggle, no tab bar).
        XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
        if !orientationRestoreRegistered {
            orientationRestoreRegistered = true
            addTeardownBlock { @MainActor () async -> Void in
                XCUIDevice.shared.orientation = .portrait
            }
        }
        app.launch()
        return app
    }

    // MARK: - Navigation (ChatGPT-style shell: no tab bar)

    // Frozen accessibility identifiers of the navigation shell.
    private enum Nav {
        static let toggle = "sidebar-toggle"
        static let close = "sidebar-close"
        static let newChat = "new-chat"   // top bar; the optional sidebar copy is sidebar-new-chat
        static let account = "account-button"
        static func destination(_ name: String) -> String { "nav-\(name)" }
    }

    private func navItem(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons[Nav.destination(name)].firstMatch
    }

    /// Tap `nav-<destination>` if it is already on screen (iPad sidebar);
    /// otherwise open the drawer with `sidebar-toggle` first. On phone the
    /// drawer must be closed afterwards (automatically or via `sidebar-close`).
    private func navigate(_ destination: String, in app: XCUIApplication) {
        let item = navItem(destination, in: app)
        if !(item.waitForExistence(timeout: 2) && item.isHittable) {
            openSidebar(in: app)
        }
        XCTAssertTrue(waitFor(item, "exists == true AND isHittable == true"),
                      "No \(Nav.destination(destination)) destination")
        item.tap()
        if !isPad { ensureDrawerClosed(after: item, in: app) }
    }

    /// Phone: open the leading drawer. iPad: the sidebar should already be
    /// visible; if the split view collapsed it, use the app toggle or the
    /// system sidebar button.
    private func openSidebar(in app: XCUIApplication) {
        let toggle = app.buttons[Nav.toggle].firstMatch
        if toggle.waitForExistence(timeout: isPad ? 2 : timeout), toggle.isHittable {
            toggle.tap()
            return
        }
        XCTAssertTrue(isPad, "Phone shell has no \(Nav.toggle) button")
        for name in ["ToggleSidebar", "Show Sidebar"] {
            let system = app.buttons[name].firstMatch
            if system.exists && system.isHittable { system.tap(); return }
        }
    }

    /// Choosing a destination should close the drawer; fall back to
    /// `sidebar-close`, then require that the drawer is gone.
    private func ensureDrawerClosed(after item: XCUIElement, in app: XCUIApplication) {
        let closedFormat = "exists == false OR isHittable == false"
        if waitFor(item, closedFormat) { return }
        let close = app.buttons[Nav.close].firstMatch
        if close.exists && close.isHittable { close.tap() }
        XCTAssertTrue(waitFor(item, closedFormat), "Drawer stayed open after choosing a destination")
    }

    // MARK: - Chat helpers

    private func showSources(in app: XCUIApplication) {
        let sources = app.buttons["answer-sources"].firstMatch
        XCTAssertTrue(sources.waitForExistence(timeout: timeout), "Sources action missing")
        if !String(describing: sources.value ?? "").contains("shown") { sources.tap() }
    }

    private func send(_ question: String, in app: XCUIApplication, captureComposer: Bool = false,
                      expectingConsent: Bool = false) {
        let composer = app.descendants(matching: .any)["chat-composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: timeout), "Composer missing")
        composer.tap()
        composer.typeText(question)
        let sendButton = app.buttons["chat-send"]
        XCTAssertTrue(waitFor(sendButton, "exists == true AND isEnabled == true"), "Send never enabled")
        if captureComposer {
            proof("accessibility-composer", in: app)
            XCTAssertGreaterThanOrEqual(composer.frame.height, 44, "Composer was vertically compressed")
            if app.keyboards.firstMatch.exists {
                XCTAssertLessThanOrEqual(sendButton.frame.maxY, app.keyboards.firstMatch.frame.minY + 1,
                                         "Keyboard covers Send")
            }
        }
        sendButton.tap()
        if expectingConsent {
            XCTAssertTrue(app.descendants(matching: .any)["ai-consent"].firstMatch.waitForExistence(timeout: timeout))
            return
        }
        let submitted = waitFor(composer, "value != %@", question)
        if !submitted {
            proof("after-send-failure", in: app)
            let tree = XCTAttachment(string: app.debugDescription)
            tree.name = "send-failure-tree"
            tree.lifetime = .keepAlways
            add(tree)
        }
        XCTAssertTrue(submitted, "Question was not submitted; send=\(sendButton.frame); composer=\(composer.frame); keyboard=\(app.keyboards.count); app=\(app.frame)")
    }

    private func text(containing fragment: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", fragment)).firstMatch
    }

    private func userBubbles(_ question: String, in app: XCUIApplication) -> XCUIElementQuery {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "You: \(question)"))
    }

    /// Waits for the turn to settle: Stop gone and Send back.
    private func waitForTurnToEnd(in app: XCUIApplication) {
        XCTAssertTrue(waitFor(app.buttons["chat-stop"], "exists == false"), "Still streaming")
        XCTAssertTrue(app.buttons["chat-send"].waitForExistence(timeout: timeout), "Send not restored")
    }

    @discardableResult
    private func waitFor(_ element: XCUIElement, _ format: String, _ arguments: Any...) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: format, argumentArray: arguments), object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    /// Lets time pass with no condition, to prove nothing else happens.
    private func settle(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settle")], timeout: seconds)
    }

    private func proof(_ name: String, in app: XCUIApplication) {
        XCTAssertEqual(app.state, .runningForeground)
        // App-frame captures can crop the display after an iPad rotation.
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "\(isPad ? "ipad" : "iphone")-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // MARK: - Shell

    func testNativeNavigationAndComposer() throws {
        let app = launch()
        XCTAssertTrue(app.descendants(matching: .any)["chat-composer"].firstMatch.waitForExistence(timeout: timeout))
        if isPad {
            XCTAssertTrue(waitFor(navItem("Chat", in: app), "exists == true AND isHittable == true"),
                          "iPad sidebar is not persistently visible")
        } else {
            let toggle = app.buttons[Nav.toggle].firstMatch
            XCTAssertTrue(toggle.waitForExistence(timeout: timeout), "Phone shell has no sidebar toggle")
            XCTAssertTrue(toggle.isHittable)
            for label in ["Who is Jesus?", "Talking donkey?", "Why suffering?", "Having doubts?"] {
                XCTAssertTrue(app.buttons[label].isHittable, "Compact prompt is unreachable: \(label)")
            }
        }
        XCTAssertFalse(app.tabBars.firstMatch.exists, "Shell still shows a tab bar")
        XCTAssertTrue(waitFor(app.buttons[Nav.newChat].firstMatch, "exists == true AND isHittable == true"),
                      "Top bar has no reachable new-chat button")
        XCTAssertFalse(app.buttons["chat-send"].isEnabled)
        proof("home", in: app)
        if !isPad {
            openSidebar(in: app)
            XCTAssertTrue(waitFor(navItem("Chat", in: app), "exists == true AND isHittable == true"))
            proof("sidebar", in: app)
            app.buttons[Nav.close].tap()
        }
        if !isPad { openSidebar(in: app) }
        XCTAssertFalse(navItem("Chats", in: app).exists, "Redundant All chats destination remains")
        XCTAssertTrue(app.staticTexts["Your conversations appear here."].waitForExistence(timeout: timeout))
        XCTAssertTrue(app.textFields["sidebar-search"].exists, "Sidebar history search is missing")
        XCTAssertTrue(app.staticTexts["Guest chat history is saved here."].exists)
        navigate("Chat", in: app)
        XCTAssertTrue(app.descendants(matching: .any)["chat-composer"].firstMatch.waitForExistence(timeout: timeout))
    }

    func testAccessibilitySidebarKeepsNavigationUsable() throws {
        let app = launch(accessibilitySize: true)
        if !isPad { openSidebar(in: app) }
        let identifiers = ["sidebar-new-chat", "nav-Chat", "nav-Flashcards"]
        var previousBottom: CGFloat?
        for identifier in identifiers {
            let row = app.buttons[identifier].firstMatch
            XCTAssertTrue(waitFor(row, "exists == true AND isHittable == true"), "Unreachable sidebar row: \(identifier)")
            XCTAssertGreaterThanOrEqual(row.frame.height, 44)
            if let previousBottom {
                XCTAssertGreaterThanOrEqual(row.frame.minY + 1, previousBottom, "Sidebar rows overlap")
            }
            previousBottom = row.frame.maxY
        }
        let sidebar = app.scrollViews["sidebar-content"]
        XCTAssertTrue(sidebar.exists)
        proof("accessibility-sidebar", in: app)
        app.buttons["sidebar-new-chat"].tap()
        if !isPad { ensureDrawerClosed(after: app.buttons["sidebar-new-chat"], in: app) }
        XCTAssertTrue(app.descendants(matching: .any)["chat-composer"].firstMatch.waitForExistence(timeout: timeout))
        if !isPad { openSidebar(in: app) }
        let account = app.buttons[Nav.account].firstMatch
        for _ in 0..<4 {
            if account.exists && sidebar.frame.contains(account.frame) { break }
            sidebar.swipeUp()
        }
        XCTAssertTrue(account.isHittable, "Account is unreachable at large text sizes")
        XCTAssertTrue(sidebar.frame.contains(account.frame), "Account is outside the visible sidebar")
        proof("accessibility-sidebar-account", in: app)
        account.tap()
        let freeAccess = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "Free access")).firstMatch
        XCTAssertTrue(freeAccess.waitForExistence(timeout: timeout), "Account did not open")
    }

    func testSuggestionStartsOneTurn() throws {
        let app = launch(fixture: "verified")
        let suggestion = app.buttons["Who is Jesus?"]
        XCTAssertTrue(suggestion.waitForExistence(timeout: timeout))
        suggestion.tap()
        XCTAssertTrue(userBubbles("Who is Jesus?", in: app).firstMatch.waitForExistence(timeout: timeout))
        XCTAssertTrue(text(containing: Fixture.answerMarker, in: app).waitForExistence(timeout: timeout))
        waitForTurnToEnd(in: app)
        XCTAssertEqual(userBubbles("Who is Jesus?", in: app).count, 1)
    }

    func testIPadShowsNativeSidebar() throws {
        guard isPad else { throw XCTSkip("iPad layout test") }
        let app = launch()
        let chat = navItem("Chat", in: app)
        if !chat.waitForExistence(timeout: timeout) || !chat.isHittable {
            // Native display mode collapsed the column: bring it back once.
            openSidebar(in: app)
        }
        XCTAssertFalse(navItem("Chats", in: app).exists)
        for destination in ["Chat", "Flashcards"] {
            XCTAssertTrue(waitFor(navItem(destination, in: app), "exists == true AND isHittable == true"),
                          "Sidebar is missing \(Nav.destination(destination))")
        }
        XCTAssertTrue(app.buttons[Nav.account].firstMatch.exists, "Sidebar has no account-button")
        XCTAssertTrue(waitFor(app.buttons[Nav.newChat].firstMatch, "exists == true AND isHittable == true"),
                      "Top bar has no reachable new-chat button")
        XCTAssertFalse(app.tabBars.firstMatch.exists, "iPad shell still shows a tab bar")
    }

    func testIPadModeLabelsHaveRoomAndFitToolbar() throws {
        guard isPad else { throw XCTSkip("iPad mode-switch geometry test") }
        let app = launch()
        let font = UIFont.systemFont(ofSize: UIFont.preferredFont(forTextStyle: .subheadline).pointSize,
                                     weight: .semibold)
        var contentInsets: [CGFloat] = []
        for title in ["Chat", "Flashcards"] {
            let button = app.buttons["mode-\(title)"]
            XCTAssertTrue(waitFor(button, "exists == true AND isHittable == true"))
            let textWidth = (title as NSString).size(withAttributes: [.font: font]).width
            let combinedInset = button.frame.width - textWidth
            contentInsets.append(combinedInset)
            XCTAssertEqual(combinedInset, 32, accuracy: 3, "Cramped label: \(title)")
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
            let toolbar = app.navigationBars.containing(.button, identifier: "mode-\(title)").firstMatch
            XCTAssertTrue(toolbar.exists, "Mode control has no detail toolbar")
            XCTAssertTrue(toolbar.frame.contains(button.frame), "Mode control exceeds the toolbar")
        }
        XCTAssertEqual(contentInsets[0], contentInsets[1], accuracy: 3)
        app.buttons["mode-Flashcards"].tap()
        XCTAssertTrue(app.buttons["card-face-reveal"].waitForExistence(timeout: timeout))
        XCTAssertTrue(app.buttons["mode-Flashcards"].isSelected)
        proof("mode-spacing-flashcards", in: app)
        app.buttons["mode-Chat"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["chat-composer"].firstMatch.waitForExistence(timeout: timeout))
    }

    func testAccountHasNoPurchaseUI() throws {
        let app = launch()
        let account = app.buttons[Nav.account].firstMatch
        // Account lives in the sidebar/drawer, not the top bar.
        if !(account.waitForExistence(timeout: 2) && account.isHittable) {
            openSidebar(in: app)
        }
        XCTAssertTrue(waitFor(account, "exists == true AND isHittable == true"), "No account-button")
        account.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let accountForm = app.descendants(matching: .any)["account-form"].firstMatch
        XCTAssertTrue(accountForm.waitForExistence(timeout: timeout), "Account row center did not present settings")
        let freeAccess = accountForm.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "Free access")).firstMatch
        XCTAssertTrue(freeAccess.waitForExistence(timeout: timeout), "Account does not say Free access")
        for purchase in ["Upgrade", "Subscribe", "Restore purchases"] {
            XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", purchase))
                .firstMatch.exists, "Account shows purchase UI: \(purchase)")
        }
    }

    // MARK: - Privacy controls

    private func reach(_ button: XCUIElement, in app: XCUIApplication,
                       containerID: String? = nil, upwards: Bool = true) {
        let container = containerID.map { app.descendants(matching: .any)[$0].firstMatch } ?? app
        for _ in 0..<18 {
            if button.exists && button.isHittable
                && (button.elementType == .staticText || container.frame.contains(button.frame)) { return }
            if upwards { container.swipeUp() } else { container.swipeDown() }
        }
    }

    func testConsentDeclineKeepsTheDraftAndAllowsOfflinePrivacyReading() throws {
        let app = launch(fixture: "verified", consentGranted: false)
        let question = "UI fixture: consent question"
        send(question, in: app, expectingConsent: true)
        XCTAssertFalse(userBubbles(question, in: app).firstMatch.exists)
        let privacy = app.buttons["ai-consent-privacy"]
        reach(privacy, in: app)
        privacy.tap()
        XCTAssertTrue(app.staticTexts["privacy-policy-missing"].waitForExistence(timeout: timeout))
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.exists)
        back.tap()
        let decline = app.buttons["ai-consent-not-now"]
        reach(decline, in: app)
        decline.tap()
        XCTAssertTrue(app.descendants(matching: .any)["chat-composer"].firstMatch.waitForExistence(timeout: timeout))
        XCTAssertEqual(app.descendants(matching: .any)["chat-composer"].firstMatch.value as? String, question)
        XCTAssertFalse(userBubbles(question, in: app).firstMatch.exists)
        navigate("Flashcards", in: app)
        XCTAssertTrue(app.buttons["card-face-reveal"].waitForExistence(timeout: timeout))
    }

    func testAccessibilityConsentActionsRemainReachable() throws {
        let app = launch(fixture: "verified", accessibilitySize: true, consentGranted: false)
        let question = "UI fixture: large privacy consent"
        send(question, in: app, expectingConsent: true)
        let allow = app.buttons["ai-consent-allow"]
        let decline = app.buttons["ai-consent-not-now"]
        reach(allow, in: app)
        XCTAssertTrue(allow.isHittable)
        XCTAssertGreaterThanOrEqual(allow.frame.height, 44)
        reach(decline, in: app)
        XCTAssertTrue(decline.isHittable)
        proof("large-ai-consent-actions", in: app)
        decline.tap()
        XCTAssertFalse(userBubbles(question, in: app).firstMatch.exists)
    }

    func testConsentGrantNeedsASecondSendAndCanBeRevoked() throws {
        let app = launch(fixture: "verified", consentGranted: false)
        let question = "UI fixture: explicit consent"
        send(question, in: app, expectingConsent: true)
        proof("ai-sharing-consent-disclosure", in: app)
        let allow = app.buttons["ai-consent-allow"]
        reach(allow, in: app)
        proof("ai-sharing-consent", in: app)
        allow.tap()
        XCTAssertTrue(app.buttons["chat-send"].waitForExistence(timeout: timeout))
        XCTAssertFalse(userBubbles(question, in: app).firstMatch.exists)
        app.buttons["chat-send"].tap()
        waitForTurnToEnd(in: app)
        XCTAssertTrue(text(containing: Fixture.answerMarker, in: app).exists)
        if !isPad { openSidebar(in: app) }
        app.buttons[Nav.account].firstMatch.tap()
        let revoke = app.buttons["account-ai-revoke"]
        reach(revoke, in: app, containerID: "account-form")
        revoke.tap()
        app.buttons["Turn Off"].firstMatch.tap()
        XCTAssertTrue(waitFor(app.descendants(matching: .any)["account-ai-state"].firstMatch,
                              "label CONTAINS 'Not allowed' OR value CONTAINS 'Not allowed'"))
        proof("ai-sharing-revoked", in: app)
    }

    func testLocalHistoryDeletionIsConfirmedAndSurvivesRelaunch() throws {
        var app = launch(fixture: "verified")
        let question = "UI fixture: delete my local chat"
        send(question, in: app)
        waitForTurnToEnd(in: app)
        if !isPad { openSidebar(in: app) }
        app.buttons[Nav.account].firstMatch.tap()
        let delete = app.buttons["account-delete-local-chats"]
        reach(delete, in: app, containerID: "account-form")
        delete.tap()
        app.buttons.matching(NSPredicate(format: "label == 'Delete local chats' AND identifier != 'account-delete-local-chats'")).firstMatch.tap()
        let notice = app.descendants(matching: .any)["account-local-history-notice"].firstMatch
        XCTAssertTrue(notice.waitForExistence(timeout: timeout))
        reach(notice, in: app, containerID: "account-form")
        proof("local-chats-deleted", in: app)
        app.terminate()
        app = launch(fixture: "verified", resetStorage: false)
        if !isPad { openSidebar(in: app) }
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", question)).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Your conversations appear here."].exists)
    }

    func testReportExcludesTheAnswerUntilExplicitlyIncluded() throws {
        let app = launch(fixture: "verified")
        send("UI fixture: report answer", in: app)
        waitForTurnToEnd(in: app)
        let report = app.buttons["answer-report"].firstMatch
        XCTAssertTrue(report.waitForExistence(timeout: timeout))
        if !report.isHittable { app.scrollViews["chat-conversation"].swipeUp() }
        report.tap()
        XCTAssertTrue(app.descendants(matching: .any)["report-support-missing"].firstMatch.waitForExistence(timeout: timeout))
        let reason = app.descendants(matching: .any)["report-reason"].firstMatch
        reason.tap()
        app.buttons["Bible reference or quote problem"].firstMatch.tap()
        let toggle = app.switches["report-include-answer"]
        XCTAssertTrue(toggle.exists)
        XCTAssertEqual(toggle.value as? String, "0")
        let preview = app.staticTexts["report-preview"]
        proof("report-before-preview-scroll", in: app)
        reach(preview, in: app, containerID: "report-form")
        XCTAssertTrue(preview.waitForExistence(timeout: timeout))
        XCTAssertFalse(preview.label.contains(Fixture.answerMarker))
        reach(toggle, in: app, containerID: "report-form", upwards: false)
        XCTAssertTrue(toggle.isHittable)
        let nativeSwitch = app.descendants(matching: .any)["report-form"].firstMatch.switches
            .matching(NSPredicate(format: "identifier == ''")).firstMatch
        XCTAssertTrue(nativeSwitch.exists, "Native answer-sharing switch missing")
        nativeSwitch.tap()
        XCTAssertTrue(waitFor(toggle, "value == '1'"))
        reach(preview, in: app, containerID: "report-form")
        proof("report-answer-explicitly-included", in: app)
        XCTAssertTrue(waitFor(preview, "label CONTAINS %@", Fixture.answerMarker))
        reach(toggle, in: app, containerID: "report-form", upwards: false)
        nativeSwitch.tap()
        XCTAssertTrue(waitFor(toggle, "value == '0'"))
        reach(preview, in: app, containerID: "report-form")
        XCTAssertTrue(waitFor(preview, "NOT (label CONTAINS %@)", Fixture.answerMarker))
        reach(app.buttons["report-copy"], in: app, containerID: "report-form")
        proof("report-draft-answer-excluded", in: app)
        app.buttons["report-share"].tap()
        settle(2)
        proof("report-system-share-chooser", in: app)
        let shareTree = XCTAttachment(string: app.debugDescription)
        shareTree.name = "report-system-share-tree"
        shareTree.lifetime = .keepAlways
        add(shareTree)
    }

    // MARK: - Chat fixtures

    func testWithoutFixtureChatRefusesWithoutNetwork() throws {
        let app = launch()
        send("UI fixture: no transport question", in: app)
        XCTAssertTrue(text(containing: Fixture.refusalMarker, in: app).waitForExistence(timeout: timeout))
        waitForTurnToEnd(in: app)
    }

    func testVerifiedAnswerOpensFullBSBRange() throws {
        let app = launch(fixture: "verified")
        send("UI fixture: verified question", in: app)
        XCTAssertTrue(text(containing: Fixture.answerMarker, in: app).waitForExistence(timeout: timeout))
        waitForTurnToEnd(in: app)
        XCTAssertFalse(app.buttons["verse-reference-EXO.3.6"].exists, "Sources were not collapsed by default")
        proof("verified-answer-fixture", in: app)
        showSources(in: app)

        let range = app.buttons["verse-reference-EXO.3.6"]
        XCTAssertTrue(range.waitForExistence(timeout: timeout), "Range reference never appeared")
        XCTAssertTrue(waitFor(range, "label CONTAINS 'looked up before answering'"),
                      "Range was not verified by the final check: \(range.label)")
        XCTAssertTrue(waitFor(app.buttons["verse-reference-JHN.14.27"],
                              "label CONTAINS 'looked up before answering'"))
        waitForTurnToEnd(in: app)
        XCTAssertTrue(text(containing: Fixture.answerMarker, in: app).exists)
        proof("sources", in: app)

        range.tap()
        let first = app.staticTexts["verse-text-EXO.3.6"]
        let second = app.staticTexts["verse-text-EXO.3.7"]
        XCTAssertTrue(first.waitForExistence(timeout: timeout), "Passage sheet did not open")
        XCTAssertTrue(second.waitForExistence(timeout: timeout), "Range stopped after its first verse")
        XCTAssertEqual(first.label, Fixture.exodus36)
        XCTAssertEqual(second.label, Fixture.exodus37)
        XCTAssertFalse(app.staticTexts["verse-text-EXO.3.8"].exists, "Sheet showed an unfetched verse")
        XCTAssertTrue(app.staticTexts["Looked up before answering"].exists)
        proof("passage-sheet", in: app)

        let done = app.buttons["passage-sheet-done"]
        XCTAssertTrue(done.waitForExistence(timeout: timeout))
        done.tap()
        XCTAssertTrue(waitFor(first, "exists == false"), "Passage sheet did not close")
    }

    func testUnverifiedReferenceShowsNotChecked() throws {
        let app = launch(fixture: "unverified")
        send("UI fixture: unverified question", in: app)
        waitForTurnToEnd(in: app)
        showSources(in: app)

        let unchecked = app.buttons["verse-reference-PSA.23.1"]
        XCTAssertTrue(unchecked.waitForExistence(timeout: timeout))
        XCTAssertTrue(waitFor(unchecked, "label CONTAINS 'not checked'"),
                      "Unfetched cite was not marked: \(unchecked.label)")
        XCTAssertTrue(waitFor(app.buttons["verse-reference-JHN.11.35"],
                              "label CONTAINS 'looked up before answering'"))
        waitForTurnToEnd(in: app)

        unchecked.tap()
        XCTAssertTrue(app.descendants(matching: .any)["passage-not-checked"].firstMatch
            .waitForExistence(timeout: timeout), "Detail did not say Not checked")
        XCTAssertTrue(app.staticTexts["Not checked"].firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Looked up before answering"].exists)
        app.buttons["passage-sheet-done"].tap()
    }

    func testStopKeepsPartialAnswerAndRestoresSend() throws {
        let app = launch(fixture: "hold")
        send("UI fixture: hold question", in: app)

        let partial = text(containing: Fixture.holdPartial, in: app)
        XCTAssertTrue(partial.waitForExistence(timeout: timeout), "Partial answer never streamed")
        let stop = app.buttons["chat-stop"]
        XCTAssertTrue(stop.waitForExistence(timeout: timeout))
        // The fixture holds the stream open: nothing ends it but Stop.
        settle(1.5)
        XCTAssertTrue(stop.exists, "Hold fixture ended on its own")
        stop.tap()

        waitForTurnToEnd(in: app)
        XCTAssertTrue(partial.exists, "Stop discarded the partial answer")
        let status = app.staticTexts["answer-delivery-status"]
        XCTAssertTrue(status.waitForExistence(timeout: timeout))
        XCTAssertEqual(status.label, "Stopped")
        proof("stopped-answer", in: app)

        // Send works again once there is a draft.
        let composer = app.descendants(matching: .any)["chat-composer"].firstMatch
        composer.tap()
        composer.typeText("Next")
        XCTAssertTrue(waitFor(app.buttons["chat-send"], "isEnabled == true"))
    }

    func testErrorAppearsOnceWithoutResend() throws {
        let app = launch(fixture: "error")
        let question = "UI fixture: error question"
        send(question, in: app)

        let error = text(containing: Fixture.errorMarker, in: app)
        XCTAssertTrue(error.waitForExistence(timeout: timeout), "Error never appeared")
        waitForTurnToEnd(in: app)
        settle(2)
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", Fixture.errorMarker)).count,
                       1, "Error shown more than once")
        XCTAssertEqual(userBubbles(question, in: app).count, 1, "Question was resent")
        XCTAssertFalse(app.buttons["chat-stop"].exists)
    }

    func testSavedGuestHistoryReopens() throws {
        let question = "UI fixture: saved history question"
        var app = launch(fixture: "verified")
        send(question, in: app)
        waitForTurnToEnd(in: app)
        showSources(in: app)
        XCTAssertTrue(waitFor(app.buttons["verse-reference-EXO.3.6"], "label CONTAINS 'looked up before answering'"))
        waitForTurnToEnd(in: app)

        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", question)).firstMatch
        if !isPad { openSidebar(in: app) }
        XCTAssertTrue(row.waitForExistence(timeout: timeout), "Saved chat not listed in sidebar")
        let savedID = row.identifier
        XCTAssertTrue(savedID.hasPrefix("sidebar-chat-"))

        // Relaunch WITHOUT reset: the guest copy must come back from disk.
        app.terminate()
        app = launch(fixture: "verified", resetStorage: false)
        if !isPad { openSidebar(in: app) }
        let search = app.textFields["sidebar-search"]
        XCTAssertTrue(search.waitForExistence(timeout: timeout))
        search.tap()
        search.typeText("saved history\n")
        let savedRow = app.buttons[savedID]
        proof("saved-history-search", in: app)
        let searchTree = XCTAttachment(string: app.debugDescription)
        searchTree.name = "saved-history-search-tree"
        searchTree.lifetime = .keepAlways
        add(searchTree)
        let found = waitFor(savedRow, "exists == true AND isHittable == true")
        if !found {
            let finalTree = XCTAttachment(string: app.debugDescription)
            finalTree.name = "saved-history-final-tree"
            finalTree.lifetime = .keepAlways
            add(finalTree)
        }
        XCTAssertTrue(found, "Saved chat search id=\(savedID): row exists=\(savedRow.exists), search=\(String(describing: search.value))")
        savedRow.tap()

        XCTAssertTrue(userBubbles(question, in: app).firstMatch.waitForExistence(timeout: timeout),
                      "Reopened chat lost the question")
        XCTAssertTrue(text(containing: Fixture.answerMarker, in: app).waitForExistence(timeout: timeout),
                      "Reopened chat lost the answer")
        showSources(in: app)
        XCTAssertTrue(app.buttons["verse-reference-EXO.3.6"].exists)
    }

    func testLegacyPlainReferencesStayUnchecked() throws {
        let app = launch(fixture: "legacy")
        send("UI fixture: legacy references", in: app)
        waitForTurnToEnd(in: app)
        XCTAssertFalse(app.buttons["verse-reference-EXO.3.6"].exists)
        showSources(in: app)
        let source = app.buttons["verse-reference-EXO.3.6"]
        XCTAssertTrue(waitFor(source, "label CONTAINS 'plain-text reference, not checked'"))
        XCTAssertTrue(waitFor(app.buttons["verse-reference-PSA.23.1"], "label CONTAINS 'not checked'"))
        proof("legacy-sources", in: app)
        source.tap()
        XCTAssertTrue(app.descendants(matching: .any)["passage-not-checked"].firstMatch.waitForExistence(timeout: timeout))
        XCTAssertFalse(app.staticTexts["Looked up before answering"].exists)
        XCTAssertFalse(app.staticTexts["verse-text-EXO.3.6"].exists)
        proof("legacy-not-checked", in: app)
        app.buttons["passage-sheet-done"].tap()
    }

    func testOrderedListsKeepNumbersAndSourcesStayCollapsed() throws {
        let app = launch(fixture: "formatted")
        send("UI fixture: formatting", in: app)
        waitForTurnToEnd(in: app)
        let third = app.descendants(matching: .any)["markdown-ordered-item-3"].firstMatch
        let fourth = app.descendants(matching: .any)["markdown-ordered-item-4"].firstMatch
        XCTAssertTrue(third.waitForExistence(timeout: timeout))
        XCTAssertTrue(fourth.exists)
        XCTAssertTrue(third.label.contains("First numbered step"))
        XCTAssertTrue(fourth.label.contains("Second numbered step"))
        XCTAssertTrue(app.buttons["answer-copy"].firstMatch.exists)
        XCTAssertTrue(app.buttons["answer-sources"].firstMatch.exists)
        XCTAssertFalse(app.buttons["verse-reference-EXO.3.6"].exists)
        proof("formatted-answer", in: app)
    }

    func testAccessibilityTextKeepsAnswerActionsUsable() throws {
        let app = launch(fixture: "verified", accessibilitySize: true)
        send("UI fixture: large text", in: app, captureComposer: true)
        waitForTurnToEnd(in: app)
        let sources = app.buttons["answer-sources"].firstMatch
        proof("accessibility-before-sources", in: app)
        let scroll = app.scrollViews["chat-conversation"].firstMatch
        XCTAssertTrue(waitFor(sources, "exists == true AND isHittable == true"),
                      "Sources unavailable; frame=\(sources.exists ? String(describing: sources.frame) : "missing"); keyboard=\(app.keyboards.count); scroll=\(String(describing: scroll.value)); app=\(app.frame)")
        XCTAssertTrue(app.buttons["answer-copy"].firstMatch.exists)
        proof("accessibility-answer", in: app)
        showSources(in: app)
        let reference = app.buttons["verse-reference-EXO.3.6"]
        let conversation = app.scrollViews["chat-conversation"].firstMatch
        for _ in 0..<3 {
            if reference.isHittable { break }
            conversation.swipeUp()
        }
        XCTAssertTrue(waitFor(reference, "exists == true AND isHittable == true"))
        reference.tap()
        XCTAssertTrue(app.buttons["passage-sheet-done"].waitForExistence(timeout: timeout))
        XCTAssertTrue(app.staticTexts["verse-text-EXO.3.6"].exists)
        proof("accessibility-passage", in: app)
        app.buttons["passage-sheet-done"].tap()
    }

    func testStreamingPreservesBrowsingAndResumesAtBottom() throws {
        let app = launch(fixture: "scrolling")
        send("UI fixture: scrolling", in: app)
        let stop = app.buttons["chat-stop"]
        XCTAssertTrue(stop.waitForExistence(timeout: timeout))
        let conversation = app.scrollViews["chat-conversation"].firstMatch
        XCTAssertTrue(conversation.waitForExistence(timeout: timeout))
        settle(1)
        conversation.swipeDown()
        let latest = app.buttons["chat-latest"]
        XCTAssertTrue(latest.waitForExistence(timeout: timeout), "Browsing did not release auto-follow")
        settle(1)
        XCTAssertTrue(latest.exists, "Incoming text overrode the reading position")
        proof("stream-browsing", in: app)
        for _ in 0..<4 {
            if !latest.exists { break }
            conversation.swipeUp()
        }
        XCTAssertTrue(waitFor(latest, "exists == false"), "Returning to the bottom did not resume following: \(String(describing: conversation.value))")
        settle(1)
        XCTAssertFalse(latest.exists, "Following stopped again on the next streamed chunk")
        proof("stream-following", in: app)
        stop.tap()
        waitForTurnToEnd(in: app)
    }

    // MARK: - Flashcards

    func testLongDiscoverAnswerHasHonestOverflowCue() throws {
        checkLongAnswer(accessibilitySize: false)
    }

    func testAccessibilityCardKeepsAllContentAndActionsReachable() throws {
        checkLongAnswer(accessibilitySize: true)
    }

    private func activeCardScroll(in app: XCUIApplication) -> XCUIElement {
        app.scrollViews.matching(identifier: "card-reading-scroll").allElementsBoundByIndex.first {
            app.frame.contains($0.frame) && $0.isHittable
        } ?? app.scrollViews["card-reading-scroll"].firstMatch
    }

    private func checkLongAnswer(accessibilitySize: Bool) {
        let app = launch(accessibilitySize: accessibilitySize,
                         cardID: "faithmap-what-happened-when-a-man-fell-asleep-during-pauls-very-long")
        navigate("Flashcards", in: app)
        let reveal = app.buttons["card-face-reveal"]
        XCTAssertTrue(reveal.waitForExistence(timeout: timeout))
        for _ in 0..<8 {
            if reveal.isHittable { break }
            activeCardScroll(in: app).swipeUp()
        }
        XCTAssertTrue(reveal.isHittable)
        proof(accessibilitySize ? "large-card-front" : "long-card-front", in: app)
        reveal.tap()
        let cue = app.descendants(matching: .any)["card-more-below"].firstMatch
        let inspected = activeCardScroll(in: app)
        proof(accessibilitySize ? "large-answer-before-check" : "long-answer-before-check", in: app)
        XCTAssertTrue(cue.waitForExistence(timeout: timeout), "Long answer has no overflow cue: \(String(describing: inspected.value))")
        proof(accessibilitySize ? "large-answer-more" : "long-answer-more", in: app)
        let reading = activeCardScroll(in: app)
        for _ in 0..<32 {
            if String(describing: reading.value).contains("more below false") { break }
            reading.swipeUp()
        }
        proof(accessibilitySize ? "large-answer-at-end-check" : "long-answer-at-end-check", in: app)
        XCTAssertTrue(waitFor(reading, "value CONTAINS 'more below false'"),
                      "Overflow state remains at the end: \(String(describing: reading.value))")
        XCTAssertTrue(app.buttons["card-face-next"].isHittable, "Next is unreachable after reading")
        XCTAssertTrue(app.buttons["card-face-ask"].isHittable, "Ask is unreachable after reading")
        proof(accessibilitySize ? "large-answer-end" : "long-answer-end", in: app)
    }

    func testDeckHasExplicitRevealAndNextActions() throws {
        let app = launch()
        navigate("Flashcards", in: app)
        XCTAssertFalse(app.buttons["Refresh cards"].exists, "Permanent refresh toolbar control remains")
        XCTAssertTrue(app.descendants(matching: .any)["deck-saved-status"].firstMatch.waitForExistence(timeout: timeout))
        XCTAssertFalse(app.buttons["deck-retry"].exists, "Saved cards alone are not a refresh failure")
        let position = app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH 'Card ' AND label CONTAINS ' of '"
        )).firstMatch
        XCTAssertTrue(position.waitForExistence(timeout: timeout))
        let before = position.label

        let reveal = app.buttons["card-face-reveal"]
        XCTAssertTrue(reveal.waitForExistence(timeout: timeout))
        XCTAssertTrue(waitFor(reveal, "isHittable == true"))
        proof("flashcard-front", in: app)
        reveal.tap()

        // The card's own Next action, not the carousel's arrow of the same name.
        let next = app.buttons["card-face-next"]
        XCTAssertTrue(next.waitForExistence(timeout: timeout))
        XCTAssertTrue(waitFor(next, "isHittable == true"))
        // Ask Shalom is present but never tapped here.
        XCTAssertTrue(app.buttons["card-face-ask"].exists)
        proof("flashcard-answer", in: app)
        next.tap()

        XCTAssertTrue(waitFor(app.buttons["card-face-reveal"], "exists == true AND isHittable == true"),
                      "Next card did not show a fresh front")
        XCTAssertTrue(waitFor(position, "label != %@", before),
                      "Deck did not advance from \(before)")
    }
}
