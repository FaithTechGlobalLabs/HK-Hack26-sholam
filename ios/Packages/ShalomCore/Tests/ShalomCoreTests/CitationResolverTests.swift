import Foundation
import XCTest
@testable import ShalomCore

final class CitationResolverTests: XCTestCase {
    private func checked(_ text: String, verses: [String: VerseRecord],
                         unverified: [String: CitationIssueReason] = [:]) -> ChatMessage {
        ChatMessage(id: "m", role: .assistant, text: text, verses: verses, unverified: unverified,
                    delivery: .complete, hasFinalCitationCheck: true)
    }

    // MARK: Extraction

    func testExtractsVerseLinksLikeTheWebRegex() {
        let text = "See [John 3:16](verse:JHN.3.16), [a [b](verse:1CO.13.4) and [bad](verse:JHN.3) "
            + "[x](verse:john.3.16) [](verse:JHN.3.16) [Jude 3](verse:JUD.1.3)"
        XCTAssertEqual(CitationResolver.citations(in: text), [
            InlineCitation(label: "John 3:16", verseID: "JHN.3.16"),
            InlineCitation(label: "a [b", verseID: "1CO.13.4"),
            InlineCitation(label: "Jude 3", verseID: "JUD.1.3"),
        ])
    }

    func testManyOpenBracketsStayLinear() {
        let text = String(repeating: "[", count: 50_000) + "[x](verse:JHN.3.16)"
        XCTAssertEqual(CitationResolver.citations(in: text).last?.verseID, "JHN.3.16")
        XCTAssertEqual(CitationResolver.citations(in: String(repeating: "[", count: 50_000)), [])
    }

    // MARK: Ranges

    func testLabelledRangeUsesOnlyFetchedVerses() {
        let fetched = Fixture.verses("JHN", 1, 1...3)
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JHN.1.1", label: "John 1:1–3", fetched: fetched)
            .map(\.id), ["JHN.1.1", "JHN.1.2", "JHN.1.3"])
        var gap = fetched; gap["JHN.1.2"] = nil
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JHN.1.1", label: "John 1:1–3", fetched: gap)
            .map(\.id), ["JHN.1.1"], "stops at the first verse that was not fetched")
    }

    func testWholeChapterStopsAtLastFetchedVerse() {
        let fetched = Fixture.verses("PSA", 23, 1...6)
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "PSA.23.1", label: "Psalm 23", fetched: fetched).count, 6)
    }

    func testCrossChapterRange() {
        var fetched = Fixture.verses("GEN", 1, 30...31)
        fetched.merge(Fixture.verses("GEN", 2, 1...3)) { a, _ in a }
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "GEN.1.31", label: "Genesis 1:31–2:2", fetched: fetched)
            .map(\.id), ["GEN.1.31", "GEN.2.1", "GEN.2.2"])
    }

    func testCapAtFortyVerses() {
        let fetched = Fixture.verses("PSA", 119, 1...176)
        let verses = CitationResolver.citedVerses(firstID: "PSA.119.1", label: "Psalm 119", fetched: fetched)
        XCTAssertEqual(verses.count, 40)
        XCTAssertEqual(verses.last?.id, "PSA.119.40")
        // A huge chapter range with little fetched is bounded too.
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "PSA.1.1", label: "Psalms 1–150",
                                                    fetched: Fixture.verses("PSA", 1, 1...2)).count, 2)
    }

    func testOneChapterBooks() {
        let jude = Fixture.verses("JUD", 1, 3...5)
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JUD.1.3", label: "Jude 3–5", fetched: jude)
            .map(\.id), ["JUD.1.3", "JUD.1.4", "JUD.1.5"])
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JUD.1.11", label: "Jude 11",
                                                    fetched: Fixture.verses("JUD", 1, 11...11)).map(\.id), ["JUD.1.11"])
        let philemon = Fixture.verses("PHM", 1, 8...10)
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "PHM.1.8", label: "Philemon 8–16", fetched: philemon)
            .map(\.id), ["PHM.1.8", "PHM.1.9", "PHM.1.10"])
    }

    func testUnreadableLabelFallsBackToTheLinkedVerse() {
        let fetched = Fixture.verses("JHN", 3, 16...17)
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JHN.3.16", label: "Juan 3:16-17", fetched: fetched)
            .map(\.id), ["JHN.3.16"])
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JHN.3.16", label: "**John 3:16**", fetched: fetched)
            .map(\.id), ["JHN.3.16"])
        // Label names a different passage: the linked verse is still included.
        XCTAssertEqual(CitationResolver.citedVerses(firstID: "JHN.3.16", label: "Romans 8:28", fetched: fetched)
            .map(\.id), ["JHN.3.16"])
    }

    // MARK: Passages and verification

    func testOnlyMessageEvidenceIsUsed() {
        let message = checked("[John 3:16](verse:JHN.3.16)", verses: [:])
        let passage = CitationResolver.passages(in: message)[0]
        XCTAssertEqual(passage.verses, [])
        XCTAssertEqual(passage.issue, .notFetched)
        XCTAssertFalse(passage.isVerified)
    }

    func testStreamingMessageIsNeverVerified() {
        let message = ChatMessage(id: "m", role: .assistant, text: "[John 3:16](verse:JHN.3.16)",
                                  verses: Fixture.verses("JHN", 3, 16...16), delivery: .streaming)
        let passage = CitationResolver.passage(firstID: "JHN.3.16", label: "John 3:16", message: message)
        XCTAssertNil(passage.issue)
        XCTAssertEqual(passage.verses.count, 1)
        XCTAssertFalse(passage.isVerified)
    }

    func testPassagesAreDistinctAndOrdered() {
        let message = checked("[Romans 8:28](verse:ROM.8.28) [John 3:16](verse:JHN.3.16) [again](verse:ROM.8.28)",
                              verses: Fixture.verses("JHN", 3, 16...16).merging(Fixture.verses("ROM", 8, 28...28)) { a, _ in a })
        XCTAssertEqual(CitationResolver.passages(in: message).map(\.id), ["ROM.8.28", "JHN.3.16"])
        XCTAssertTrue(CitationResolver.passages(in: message).allSatisfy(\.isVerified))
    }

    func testSavedChatFixtureEvidence() throws {
        let document = try JSONDecoder().decode(ChatDocumentResponse.self,
                                                from: Fixture.data("chat-document", "json"))
        XCTAssertEqual(document.messages.count, 4)
        let saved = document.messages[1]
        XCTAssertTrue(saved.hasFinalCitationCheck, "stored evidence with an unverified map counts as checked")
        XCTAssertTrue(CitationResolver.passages(in: saved)[0].isVerified)

        let imported = document.messages[3]
        XCTAssertFalse(imported.hasFinalCitationCheck, "text-only imports stay unchecked")
        let passage = CitationResolver.passages(in: imported)[0]
        XCTAssertFalse(passage.isVerified)
        XCTAssertEqual(passage.issue, .notFetched)
    }

    // MARK: Reference parsing and labels

    func testParseReferenceMatchesTheWebExamples() throws {
        XCTAssertEqual(try BibleReference.parseReference("John 3:16"), ["JHN.3.16"])
        XCTAssertEqual(try BibleReference.parseReference("Matthew 18:21–35"), ["MAT.18.21-MAT.18.35"])
        XCTAssertEqual(try BibleReference.parseReference("Genesis 1:1–2:3"), ["GEN.1.1-GEN.2.3"])
        XCTAssertEqual(try BibleReference.parseReference("Daniel 4"), ["DAN.4"])
        XCTAssertEqual(try BibleReference.parseReference("Hosea 1–3"), ["HOS.1-HOS.3"])
        XCTAssertEqual(try BibleReference.parseReference("Galatians 1:10, John 12:42–43; 1 Cor 13:4, 7"),
                       ["GAL.1.10", "JHN.12.42-JHN.12.43", "1CO.13.4", "1CO.13.7"])
        XCTAssertEqual(try BibleReference.parseReference("Jude 11"), ["JUD.1.11"])
        XCTAssertEqual(try BibleReference.parseReference("Jude 1"), ["JUD.1"])
        XCTAssertEqual(try BibleReference.parseReference("Philemon 8–16"), ["PHM.1.8-PHM.1.16"])
        XCTAssertEqual(try BibleReference.parseReference("II Kings 2:11"), ["2KI.2.11"])
        XCTAssertEqual(try BibleReference.parseReference("1cor 13:4."), ["1CO.13.4"])
        XCTAssertEqual(try BibleReference.parseReference("Song of Solomon 2:4"), ["SNG.2.4"])
        XCTAssertEqual(try BibleReference.parseReference("Ps. 23"), ["PSA.23"])
        XCTAssertThrowsError(try BibleReference.parseReference("Juan 3:16"))
        XCTAssertThrowsError(try BibleReference.parseReference("3:16"))
        XCTAssertThrowsError(try BibleReference.parseReference("John 3:16-15"))
        XCTAssertThrowsError(try BibleReference.parseReference("John 22"))
    }

    func testVerseIDsCheckTheCanon() {
        XCTAssertEqual(BibleReference.parseVerseID("1CO.13.4"), VerseID(book: "1CO", chapter: 13, verse: 4))
        XCTAssertNil(BibleReference.parseVerseID("JHN.22.1"))
        XCTAssertNil(BibleReference.parseVerseID("JHN.3.0"))
        XCTAssertNil(BibleReference.parseVerseID("XYZ.1.1"))
        XCTAssertNil(BibleReference.parseVerseID("JHN.3.1000"))
        XCTAssertEqual(BibleReference.verseLabel("JUD.1.3"), "Jude 1:3")
    }

    func testFormatterMatchesPassageLabel() {
        XCTAssertEqual(ReferenceFormatter.label(for: "JHN.3.16"), "John 3:16")
        XCTAssertEqual(ReferenceFormatter.label(for: "MAT.18.21-MAT.18.35"), "Matthew 18:21–35")
        XCTAssertEqual(ReferenceFormatter.label(for: "GEN.1.1-GEN.2.3"), "Genesis 1:1–2:3")
        XCTAssertEqual(ReferenceFormatter.label(for: "DAN.4"), "Daniel 4")
        XCTAssertEqual(ReferenceFormatter.label(for: "GEN.1-GEN.2"), "Genesis 1–2")
        XCTAssertEqual(ReferenceFormatter.label(for: "JUD.1.5-JUD.1.11"), "Jude 1:5–11")
        XCTAssertEqual(ReferenceFormatter.label(for: "not a ref"), "not a ref")
        XCTAssertEqual(ReferenceFormatter.label(for: "GEN.2.1-GEN.1.1"), "GEN.2.1-GEN.1.1")
        XCTAssertEqual(ReferenceFormatter.verseNumber("PSA.119.105"), "105")
    }

    // MARK: Status and errors

    func testErrorAlwaysWinsOverAFinalCheck() {
        // The memberwise init can still combine an error with the check flag.
        let message = ChatMessage(id: "m", role: .assistant, text: "[John 3:16](verse:JHN.3.16)",
                                  verses: Fixture.verses("JHN", 3, 16...16), error: "Connection lost",
                                  delivery: .complete, hasFinalCitationCheck: true)
        let passage = CitationResolver.passages(in: message)[0]
        XCTAssertFalse(passage.isVerified)
        XCTAssertEqual(passage.status, .unchecked)
        XCTAssertEqual(passage.verses.map(\.id), ["JHN.3.16"])
        XCTAssertEqual(passage.uncheckedExplanation, CitedPassage.errorExplanation)
    }

    func testSettledLinkWithoutACheckIsUnchecked() {
        for delivery in [MessageDelivery.stopped, .incomplete, .failed] {
            let message = ChatMessage(id: "m", role: .assistant, text: "[John 3:16](verse:JHN.3.16)",
                                      verses: Fixture.verses("JHN", 3, 16...16), delivery: delivery)
            let passage = CitationResolver.passages(in: message)[0]
            XCTAssertEqual(passage.status, .unchecked, "\(delivery)")
            XCTAssertFalse(passage.isVerified)
            XCTAssertEqual(passage.verses.count, 1)
            XCTAssertEqual(passage.uncheckedExplanation, CitedPassage.unfinishedExplanation)
        }
        // A stale check flag on a stopped answer does not count either.
        let stopped = ChatMessage(id: "m", role: .assistant, text: "[John 3:16](verse:JHN.3.16)",
                                  verses: Fixture.verses("JHN", 3, 16...16), delivery: .stopped,
                                  hasFinalCitationCheck: true)
        XCTAssertFalse(CitationResolver.passages(in: stopped)[0].isVerified)
        // Legacy complete answer with fetched text but no check.
        let legacy = ChatMessage(id: "m", role: .assistant, text: "[John 3:16](verse:JHN.3.16)",
                                 verses: Fixture.verses("JHN", 3, 16...16))
        XCTAssertEqual(CitationResolver.passages(in: legacy)[0].status, .unchecked)
        XCTAssertEqual(CitationResolver.passages(in: legacy)[0].uncheckedExplanation, CitedPassage.genericExplanation)
    }

    func testStreamingLinkIsPending() {
        let message = ChatMessage(id: "m", role: .assistant, text: "[John 3:16](verse:JHN.3.16) and",
                                  verses: Fixture.verses("JHN", 3, 16...16), delivery: .streaming)
        let passage = CitationResolver.sources(in: message)[0]
        XCTAssertEqual(passage.status, .pending)
        XCTAssertFalse(passage.isVerified)
        XCTAssertEqual(passage.uncheckedExplanation, CitedPassage.pendingExplanation)
    }

    func testLateQuoteMismatchWins() {
        let message = checked("[John 3:16](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...16),
                              unverified: ["JHN.3.16": .quoteMismatch])
        let passage = CitationResolver.sources(in: message)[0]
        XCTAssertEqual(passage.status, .issue(.quoteMismatch))
        XCTAssertEqual(passage.issue, .quoteMismatch)
        XCTAssertEqual(passage.verses, [])
        XCTAssertFalse(passage.isVerified)
        XCTAssertEqual(passage.uncheckedExplanation, CitationIssueReason.quoteMismatch.explanation)
    }

    func testVerifiedLinkStatus() {
        let passage = CitationResolver.sources(in: checked("[John 3:16](verse:JHN.3.16)",
                                                           verses: Fixture.verses("JHN", 3, 16...16)))[0]
        XCTAssertEqual(passage.status, .verified)
        XCTAssertTrue(passage.isVerified)
        XCTAssertEqual(passage.kind, .link)
        XCTAssertFalse(passage.quoteNotChecked)
        XCTAssertNil(passage.uncheckedExplanation)
    }

    // MARK: Range coverage

    func testPartlyFetchedRangeIsNotVerified() {
        let message = checked("[John 1:1–3](verse:JHN.1.1)", verses: Fixture.verses("JHN", 1, 1...1))
        let passage = CitationResolver.passages(in: message)[0]
        XCTAssertFalse(passage.isVerified, "only the first verse of an explicit range was fetched")
        XCTAssertEqual(passage.status, .unchecked)
        XCTAssertEqual(passage.verses.map(\.id), ["JHN.1.1"], "fetched text is still shown")
        XCTAssertEqual(passage.uncheckedExplanation, CitedPassage.partialExplanation)

        let full = checked("[John 1:1–3](verse:JHN.1.1)", verses: Fixture.verses("JHN", 1, 1...3))
        XCTAssertTrue(CitationResolver.passages(in: full)[0].isVerified)
        XCTAssertEqual(CitationResolver.passages(in: full)[0].verses.count, 3)

        var gap = Fixture.verses("JHN", 1, 1...3); gap["JHN.1.2"] = nil
        XCTAssertFalse(CitationResolver.passages(in: checked("[John 1:1–3](verse:JHN.1.1)", verses: gap))[0].isVerified)
    }

    func testCommaLabelNeedsEveryPart() {
        let text = "[Jonah 1:1–3, 17](verse:JON.1.1)"
        let partial = checked(text, verses: Fixture.verses("JON", 1, 1...3))
        XCTAssertFalse(CitationResolver.passages(in: partial)[0].isVerified)
        var all = Fixture.verses("JON", 1, 1...3)
        all.merge(Fixture.verses("JON", 1, 17...17)) { a, _ in a }
        let passage = CitationResolver.passages(in: checked(text, verses: all))[0]
        XCTAssertTrue(passage.isVerified)
        XCTAssertEqual(passage.verses.map(\.id), ["JON.1.1", "JON.1.2", "JON.1.3", "JON.1.17"])
    }

    func testUnsupportedCoverageIsConservative() {
        // Whole chapter: its length is unknown without a new lookup.
        let chapter = checked("[Psalm 23](verse:PSA.23.1)", verses: Fixture.verses("PSA", 23, 1...6))
        XCTAssertEqual(CitationResolver.passages(in: chapter)[0].status, .unchecked)
        XCTAssertEqual(CitationResolver.passages(in: chapter)[0].verses.count, 6)

        // Cross-chapter: the end of the first chapter is unknown.
        var cross = Fixture.verses("GEN", 1, 31...31)
        cross.merge(Fixture.verses("GEN", 2, 1...2)) { a, _ in a }
        let crossPassage = CitationResolver.passages(in: checked("[Genesis 1:31–2:2](verse:GEN.1.31)", verses: cross))[0]
        XCTAssertFalse(crossPassage.isVerified)
        XCTAssertEqual(crossPassage.verses.map(\.id), ["GEN.1.31", "GEN.2.1", "GEN.2.2"])

        // A label that names a different passage than the link.
        let elsewhere = checked("[Romans 8:28](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...16))
        XCTAssertFalse(CitationResolver.passages(in: elsewhere)[0].isVerified)
        XCTAssertEqual(CitationResolver.passages(in: elsewhere)[0].status, .unchecked)
        XCTAssertEqual(CitationResolver.passages(in: elsewhere)[0].verses.map(\.id), ["JHN.3.16"])
        let nextVerse = checked("[John 3:17](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...17))
        XCTAssertFalse(CitationResolver.passages(in: nextVerse)[0].isVerified, "same book, different verse")
        let rangeElsewhere = checked("[John 3:15–16](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 15...16))
        XCTAssertFalse(CitationResolver.passages(in: rangeElsewhere)[0].isVerified, "range starting before the link")

        // An unreadable label that still names a range.
        let foreign = checked("[Juan 3:16-17](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...17))
        XCTAssertFalse(CitationResolver.passages(in: foreign)[0].isVerified)

        // Over the 40-verse display cap.
        let long = checked("[Psalm 119:1–41](verse:PSA.119.1)", verses: Fixture.verses("PSA", 119, 1...41))
        XCTAssertFalse(CitationResolver.passages(in: long)[0].isVerified)
        let forty = checked("[Psalm 119:1–40](verse:PSA.119.1)", verses: Fixture.verses("PSA", 119, 1...40))
        XCTAssertTrue(CitationResolver.passages(in: forty)[0].isVerified)
    }

    func testFormattedAndCompactNumberedLabelsCannotVerifyAnotherBook() {
        for (label, target, chapter, verse) in [
            ("**First John** 3:16", "JHN.3.16", 3, 16),
            ("**First** John 3:16", "JHN.3.16", 3, 16),
            ("**I** John 3:16", "JHN.3.16", 3, 16),
            ("**IV** John 3:16", "JHN.3.16", 3, 16),
            ("ICor 13:4", "JHN.13.4", 13, 4),
            ("IIChronicles 3:16", "JHN.3.16", 3, 16),
            ("Eleventh John 3:16", "JHN.3.16", 3, 16),
        ] {
            let message = checked("[\(label)](verse:\(target))", verses: Fixture.verses("JHN", chapter, verse...verse))
            XCTAssertFalse(CitationResolver.passages(in: message)[0].isVerified, label)
        }
        for label in ["**First John** 3:16", "**First** John 3:16", "**I** John 3:16"] {
            let message = checked("[\(label)](verse:1JN.3.16)", verses: Fixture.verses("1JN", 3, 16...16))
            XCTAssertTrue(CitationResolver.passages(in: message)[0].isVerified, label)
        }
    }

    func testFreeFormSingleVerseLabelStandsForTheLink() {
        let bold = checked("[**John 3:16**](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...16))
        XCTAssertTrue(CitationResolver.passages(in: bold)[0].isVerified)
        let foreign = checked("[Juan 3:16](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...16))
        XCTAssertFalse(CitationResolver.passages(in: foreign)[0].isVerified, "reference numbers cannot establish an unknown book identity")
        let oneChapter = checked("[Jude 3](verse:JUD.1.3)", verses: Fixture.verses("JUD", 1, 3...3))
        XCTAssertTrue(CitationResolver.passages(in: oneChapter)[0].isVerified)
    }

    // MARK: Sources (links + plain mentions)

    func testMentionIsNeverVerifiedByFetchedTextAndAnEmptyCheck() throws {
        let message = checked("Paul writes in Romans 8:28 that all things work together.",
                              verses: Fixture.verses("ROM", 8, 28...28))
        XCTAssertTrue(message.unverified.isEmpty)
        let source = try XCTUnwrap(CitationResolver.sources(in: message).first)
        XCTAssertEqual(source.kind, .mention)
        XCTAssertEqual(source.status, .uncheckedFormat)
        XCTAssertFalse(source.isVerified)
        XCTAssertEqual(source.verses, [])
        XCTAssertNil(source.issue)
        XCTAssertEqual(source.id, "ROM.8.28")
        XCTAssertEqual(source.label, "Romans 8:28")
        XCTAssertEqual(source.uncheckedExplanation, CitedPassage.mentionExplanation)
        XCTAssertEqual(CitedPassage.mentionExplanation,
                       "This reference is written as plain text, not a checked link, so Shalom did not check it against the Bible text.")
        XCTAssertEqual(CitationResolver.passages(in: message), [], "passages(in:) stays links only")
    }

    func testMentionStatusUnderEveryDelivery() {
        let verses = Fixture.verses("ROM", 8, 28...28)
        let streaming = ChatMessage(id: "m", role: .assistant, text: "Romans 8:28 says", verses: verses,
                                    delivery: .streaming)
        XCTAssertEqual(CitationResolver.sources(in: streaming)[0].status, .pending)
        XCTAssertFalse(CitationResolver.sources(in: streaming)[0].isVerified)
        XCTAssertEqual(CitationResolver.sources(in: streaming)[0].uncheckedExplanation, CitedPassage.mentionExplanation)

        let errored = ChatMessage(id: "m", role: .assistant, text: "Romans 8:28 says", verses: verses,
                                  error: "Lost", delivery: .complete, hasFinalCitationCheck: true)
        XCTAssertEqual(CitationResolver.sources(in: errored)[0].status, .uncheckedFormat)

        let issue = checked("Romans 8:28 says", verses: verses, unverified: ["ROM.8.28": .quoteMismatch])
        XCTAssertEqual(CitationResolver.sources(in: issue)[0].status, .issue(.quoteMismatch), "a late issue wins")
        XCTAssertFalse(CitationResolver.sources(in: issue)[0].isVerified)
    }

    func testSourcesMergeInTextOrderAndLinksWin() {
        let text = "John 3:16 first, then [Romans 8:28](verse:ROM.8.28), Romans 8:28 again, "
            + "Jonah 1:1–3, 17 and [Rom 8:28](verse:ROM.8.28) and John 3:16."
        var verses = Fixture.verses("ROM", 8, 28...28)
        verses.merge(Fixture.verses("JHN", 3, 16...16)) { a, _ in a }
        let sources = CitationResolver.sources(in: checked(text, verses: verses))
        XCTAssertEqual(sources.map(\.id), ["JHN.3.16", "ROM.8.28", "JON.1.1"])
        XCTAssertEqual(sources.map(\.kind), [.mention, .link, .mention])
        XCTAssertEqual(sources[1].label, "Romans 8:28", "the first link's label")
        XCTAssertTrue(sources[1].isVerified)
        XCTAssertEqual(sources[2].label, "Jonah 1:1–3, 17", "comma continuation is kept")
        XCTAssertFalse(sources[0].isVerified, "the fetched verse does not promote a mention")
    }

    func testLinkBeatsAnEarlierMentionOfTheSameVerse() {
        let message = checked("Romans 8:28 (see [Rom 8:28](verse:ROM.8.28))", verses: Fixture.verses("ROM", 8, 28...28))
        let sources = CitationResolver.sources(in: message)
        XCTAssertEqual(sources.count, 1)
        XCTAssertEqual(sources[0].kind, .link)
        XCTAssertEqual(sources[0].label, "Rom 8:28")
        XCTAssertTrue(sources[0].isVerified)
    }

    func testFirstMentionWinsAmongMentions() {
        let sources = CitationResolver.sources(in: checked("Rom. 8:28 and later Romans 8:28", verses: [:]))
        XCTAssertEqual(sources.count, 1)
        XCTAssertEqual(sources[0].label, "Romans 8:28")
    }

    func testQuoteNotCheckedIsAnExactLabelMatch() {
        let text = "Paul writes in Rom. 8:28 that “all things work together for good.”"
        let warned = ChatMessage(id: "m", role: .assistant, text: text, quoteWarnings: ["Rom. 8:28"],
                                 delivery: .complete, hasFinalCitationCheck: true)
        let source = CitationResolver.sources(in: warned)[0]
        XCTAssertTrue(source.quoteNotChecked)
        XCTAssertEqual(source.uncheckedExplanation,
                       CitedPassage.mentionExplanation + " The quoted words were not checked either.")

        let other = ChatMessage(id: "m", role: .assistant, text: text, quoteWarnings: ["Romans 8:28"],
                                delivery: .complete, hasFinalCitationCheck: true)
        XCTAssertFalse(CitationResolver.sources(in: other)[0].quoteNotChecked)

        // The web labels the PLAIN_REF part, without comma continuations.
        let jonah = ChatMessage(id: "m", role: .assistant,
                                text: "In Jonah 1:1–3, 17, the LORD sends “a great fish to swallow Jonah”",
                                quoteWarnings: ["Jonah 1:1–3"], delivery: .complete, hasFinalCitationCheck: true)
        XCTAssertTrue(CitationResolver.sources(in: jonah)[0].quoteNotChecked)
    }

    func testMentionsInCodeAndLinksAreNotSources() {
        let text = "`Romans 8:28` and [see John 3:16](https://example.com) and ```\nGenesis 1:1\n```"
        XCTAssertEqual(CitationResolver.sources(in: checked(text, verses: [:])), [])
    }

    func testSourcesMatchPassagesForLinkOnlyFixtures() throws {
        let document = try JSONDecoder().decode(ChatDocumentResponse.self,
                                                from: Fixture.data("chat-document", "json"))
        for message in document.messages where message.role == .assistant {
            XCTAssertEqual(CitationResolver.sources(in: message), CitationResolver.passages(in: message))
        }
        XCTAssertEqual(CitationResolver.passages(in: document.messages[1]).map(\.id), ["JHN.3.16"])
        XCTAssertEqual(CitationResolver.passages(in: document.messages[3]).map(\.issue), [.notFetched])
    }

    // MARK: Code

    func testVerseLinksInsideCodeAreNotCitations() {
        let link = "[John 3:16](verse:JHN.3.16)"
        for text in ["```\n\(link)\n```", "~~~md\n\(link)\n~~~", "Intro\n```\n\(link)",
                     "`\(link)`", "``a \(link) ` b``", "[a `](verse:JHN.3.16)`",
                     "  ```\n  \(link)\n  ```"] {
            XCTAssertEqual(CitationResolver.citations(in: text), [], text)
            let message = checked(text, verses: Fixture.verses("JHN", 3, 16...16))
            XCTAssertEqual(CitationResolver.passages(in: message), [], text)
            XCTAssertEqual(CitationResolver.sources(in: message), [], text)
        }
        XCTAssertEqual(CitationResolver.citations(in: "`x` \(link) ```y```").map(\.verseID), ["JHN.3.16"])
        XCTAssertEqual(CitationResolver.citations(in: "[`John 3:16`](verse:JHN.3.16)").map(\.verseID), ["JHN.3.16"],
                       "code inside the label does not hide the link")
        let outside = checked("```\n\(link)\n```\n\nThen \(link).", verses: Fixture.verses("JHN", 3, 16...16))
        XCTAssertEqual(CitationResolver.sources(in: outside).map(\.id), ["JHN.3.16"])
        XCTAssertTrue(CitationResolver.sources(in: outside)[0].isVerified)
    }

    func testListItemFencesAndInlineClosersHideOnlyTheirCode() {
        let fetched = Fixture.verses("JHN", 3, 16...16)
        let cases: [(text: String, sources: [String])] = [
            ("1. ```\n   [John 3:16](verse:JHN.3.16)\n   ```\n\nThen Romans 8:28 applies.", ["ROM.8.28"]),
            ("- ```\n  [John 3:16](verse:JHN.3.16)\n  ```\n\nAlso Romans 8:28.", ["ROM.8.28"]),
            ("Example ```\n[John 3:16](verse:JHN.3.16)\n```", []),
            ("Example ```\n[John 3:16](verse:JHN.3.16)\n```\n\nThen Romans 8:28.", ["ROM.8.28"]),
            ("> ```\n> [John 3:16](verse:JHN.3.16)\n> ```\n\nRomans 8:28", ["ROM.8.28"]),
            // A top-level fence is not closed by a list-marked line inside it.
            ("```\n- ```\n[John 3:16](verse:JHN.3.16)\n```\nRomans 8:28", ["ROM.8.28"]),
        ]
        for (text, expected) in cases {
            XCTAssertEqual(CitationResolver.citations(in: text), [], text)
            let message = checked(text, verses: fetched)
            XCTAssertEqual(CitationResolver.passages(in: message), [], text)
            let sources = CitationResolver.sources(in: message)
            XCTAssertEqual(sources.map(\.id), expected, text)
            XCTAssertFalse(sources.contains(where: \.isVerified), text)
            XCTAssertTrue(sources.allSatisfy { $0.kind == .mention }, text)
        }
        // A link after a correctly closed list-item fence is still a checked citation.
        let after = checked("- ```\n  code\n  ```\n\nSee [John 3:16](verse:JHN.3.16).", verses: fetched)
        XCTAssertEqual(CitationResolver.sources(in: after).map(\.id), ["JHN.3.16"])
        XCTAssertTrue(CitationResolver.sources(in: after)[0].isVerified)
    }

    // MARK: Free-form labels

    func testFallbackLabelsCannotVerifyFromTheFirstVerseAlone() {
        let first = Fixture.verses("JHN", 3, 16...16)
        for label in ["**John 3:16-18**", "Juan 3:16-18", "Joh 3:16-18", "John 3:16ff", "John 3:16f.",
                      "John 3:16 and 18", "Jn 3:16–18 (NIV)"] {
            let message = checked("[\(label)](verse:JHN.3.16)", verses: first)
            let passage = CitationResolver.passages(in: message)[0]
            XCTAssertFalse(passage.isVerified, label)
            XCTAssertEqual(passage.status, .unchecked, label)
            XCTAssertEqual(passage.verses.map(\.id), ["JHN.3.16"], label)
        }
        // "ff" stays open-ended even when more was fetched.
        let more = checked("[John 3:16ff](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...21))
        XCTAssertFalse(CitationResolver.passages(in: more)[0].isVerified)
        // A recognised English range inside a free-form label verifies once fully fetched.
        let full = checked("[**John 3:16-18**](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...18))
        XCTAssertTrue(CitationResolver.passages(in: full)[0].isVerified)
        XCTAssertEqual(CitationResolver.passages(in: full)[0].verses.map(\.id), ["JHN.3.16", "JHN.3.17", "JHN.3.18"],
                       "the whole fetched range is shown")
        let tagged = checked("[John 3:16 (NIV)](verse:JHN.3.16)", verses: first)
        XCTAssertFalse(CitationResolver.passages(in: tagged)[0].isVerified, "an annotated reference must parse as a whole to be checked")
    }

    func testEnglishReferenceInAFreeFormLabelMustMatchTheTarget() {
        let fetched = Fixture.verses("JHN", 3, 16...17)
        for label in ["see Romans 8:28", "**John 3:17**", "as John 3:17 says", "John 3:16 and Romans 8:28",
                      "Romans 8:28 (cf. John 3:16)"] {
            let message = checked("[\(label)](verse:JHN.3.16)", verses: fetched)
            XCTAssertFalse(CitationResolver.passages(in: message)[0].isVerified, label)
        }
        let same = checked("[as John 3:16 says](verse:JHN.3.16)", verses: fetched)
        XCTAssertFalse(CitationResolver.passages(in: same)[0].isVerified, "a matching suffix does not prove the complete label")
    }

    func testNumberedMentionIdentityNeverUpgradesLegacySources() throws {
        let cases = [
            ("First John3:16", "1JN", 3, 16), ("I John 3:16", "1JN", 3, 16),
            ("Second John1:6", "2JN", 1, 6), ("II John 1:6", "2JN", 1, 6),
            ("Third John1:6", "3JN", 1, 6), ("III John 1:6", "3JN", 1, 6),
        ]
        for (label, code, chapter, verse) in cases {
            let id = "\(code).\(chapter).\(verse)"
            let fetched = Fixture.verses(code, chapter, verse...verse)
                .merging(Fixture.verses("JHN", chapter, verse...verse)) { a, _ in a }
            for finalCheck in [false, true] {
                let message = ChatMessage(id: "m", role: .assistant, text: label + ".", verses: fetched,
                                          quoteWarnings: [label], delivery: .complete,
                                          hasFinalCitationCheck: finalCheck)
                let sources = CitationResolver.sources(in: message)
                XCTAssertEqual(sources.count, 1, label)
                let source = try XCTUnwrap(sources.first, label)
                XCTAssertEqual(source.id, id, label)
                XCTAssertEqual(source.label, BibleReference.verseLabel(id), label)
                XCTAssertEqual(source.kind, .mention, label)
                XCTAssertEqual(source.status, .uncheckedFormat, label)
                XCTAssertFalse(source.isVerified, label)
                XCTAssertTrue(source.quoteNotChecked, label)
                XCTAssertEqual(source.verses, [], label)
                XCTAssertNil(source.issue, label)
                XCTAssertEqual(CitationResolver.passages(in: message), [], label)
            }
        }
    }

    func testNumberedLabelsCannotVerifyGospelTargets() throws {
        let cases = [
            ("1 John3:16", "1JN", 3, 16), ("First John3:16", "1JN", 3, 16), ("I John 3:16", "1JN", 3, 16),
            ("2 John1:6", "2JN", 1, 6), ("Second John1:6", "2JN", 1, 6), ("II John 1:6", "2JN", 1, 6),
            ("3 John1:6", "3JN", 1, 6), ("Third John1:6", "3JN", 1, 6), ("III John 1:6", "3JN", 1, 6),
        ]
        for (reference, code, chapter, verse) in cases {
            let target = "\(code).\(chapter).\(verse)"
            let gospel = "JHN.\(chapter).\(verse)"
            // Both books' synthetic verses are fetched: coverage still cannot
            // make an explicit numbered label agree with a Gospel target.
            let fetched = Fixture.verses(code, chapter, verse...verse)
                .merging(Fixture.verses("JHN", chapter, verse...verse)) { a, _ in a }
            for label in [reference, "**\(reference)**", "see \(reference)"] {
                let wrong = checked("[\(label)](verse:\(gospel))", verses: fetched)
                let wrongPassage = try XCTUnwrap(CitationResolver.passages(in: wrong).first)
                XCTAssertFalse(wrongPassage.isVerified, label)
                XCTAssertEqual(wrongPassage.status, .unchecked, label)

                let correct = checked("[\(label)](verse:\(target))", verses: fetched)
                let correctPassage = try XCTUnwrap(CitationResolver.passages(in: correct).first)
                XCTAssertEqual(correctPassage.isVerified, !label.hasPrefix("see "), label)
                XCTAssertEqual(correctPassage.verses.map(\.id), [target], label)
            }
        }
        // A correct numbered book is not interchangeable with another epistle either.
        let wrongEpistle = checked("[**Third John1:6**](verse:2JN.1.6)",
                                   verses: Fixture.verses("2JN", 1, 6...6)
                                    .merging(Fixture.verses("3JN", 1, 6...6)) { a, _ in a })
        XCTAssertFalse(CitationResolver.passages(in: wrongEpistle)[0].isVerified)
    }

    func testRejectedNumberedLabelsCannotBecomeOpaqueSingleVerseLabels() {
        for label in ["Second John3:16", "**Second John 3:16**", "see II John3:16",
                      "Third John3:16", "as III John 3:16 says", "First John 3:0", "I John3:0",
                      "4 John3:16", "IV John 3:16", "**Fourth John3:16**", "1st John 3:16",
                      "IIII John3:16", "FirstJohn3:16", "**IJohn3:16**", "IVJohn3:16",
                      "Second John3:16 and John 3:16"] {
            let message = checked("[\(label)](verse:JHN.3.16)", verses: Fixture.verses("JHN", 3, 16...16))
            let passage = CitationResolver.passages(in: message)[0]
            XCTAssertFalse(passage.isVerified, label)
            XCTAssertEqual(passage.status, .unchecked, label)
        }
    }

    func testNumberedMentionsAndGospelLinksRemainDistinctAndOrdered() {
        let text = "First John3:16; [John3:16](verse:JHN.3.16); I John3:16; II John1:6; "
            + "[Third John1:6](verse:3JN.1.6)"
        var fetched = Fixture.verses("JHN", 3, 16...16)
        for id in ["1JN.3.16", "2JN.1.6", "3JN.1.6"] { fetched[id] = Fixture.verse(id) }
        let sources = CitationResolver.sources(in: checked(text, verses: fetched))
        XCTAssertEqual(sources.map(\.id), ["1JN.3.16", "JHN.3.16", "2JN.1.6", "3JN.1.6"])
        XCTAssertEqual(sources.map(\.kind), [.mention, .link, .mention, .link])
        XCTAssertEqual(sources.map(\.status), [.uncheckedFormat, .verified, .uncheckedFormat, .verified])
    }

    func testNumberedRangeLabelsStillRequireCompleteFetchedCoverage() {
        let text = "[**First John3:16–18**](verse:1JN.3.16)"
        let partial = checked(text, verses: Fixture.verses("1JN", 3, 16...16))
        XCTAssertFalse(CitationResolver.passages(in: partial)[0].isVerified)
        let full = checked(text, verses: Fixture.verses("1JN", 3, 16...18))
        XCTAssertTrue(CitationResolver.passages(in: full)[0].isVerified)
        XCTAssertEqual(CitationResolver.passages(in: full)[0].verses.map(\.id),
                       ["1JN.3.16", "1JN.3.17", "1JN.3.18"])
    }

    // MARK: CitedPassage init

    func testLegacyInitStaysSourceCompatible() {
        let verified = CitedPassage(id: "JHN.3.16", label: "John 3:16", verses: [], issue: nil, isVerified: true)
        XCTAssertEqual(verified.status, .verified)
        XCTAssertEqual(verified.kind, .link)
        XCTAssertFalse(verified.quoteNotChecked)
        XCTAssertNil(verified.uncheckedExplanation)

        let issue = CitedPassage(id: "JHN.3.16", label: "John 3:16", verses: [], issue: .notFetched, isVerified: true)
        XCTAssertFalse(issue.isVerified, "an issue always wins")
        XCTAssertEqual(issue.status, .issue(.notFetched))
        XCTAssertEqual(issue.uncheckedExplanation, CitationIssueReason.notFetched.explanation)

        let mention = CitedPassage(id: "ROM.8.28", label: "Romans 8:28", verses: [], issue: nil, isVerified: true,
                                   kind: .mention)
        XCTAssertFalse(mention.isVerified, "a mention is never verified")
        XCTAssertEqual(mention.status, .uncheckedFormat)

        let plain = CitedPassage(id: "JHN.3.16", label: "John 3:16", verses: [], issue: nil, isVerified: false)
        XCTAssertEqual(plain.status, .unchecked)
        XCTAssertEqual(plain.uncheckedExplanation, CitedPassage.genericExplanation)
    }

    /// Every ref in the current card data, with labels computed from the
    /// web's `passageLabel` rules (generated from data/*.json).
    func testCurrentCardRefsFormatAndRoundTrip() throws {
        struct Row: Decodable { let ref: String; let label: String }
        let rows = try JSONDecoder().decode([Row].self, from: Fixture.data("card-ref-labels", "json"))
        XCTAssertGreaterThan(rows.count, 300)
        for row in rows {
            XCTAssertEqual(ReferenceFormatter.label(for: row.ref), row.label, row.ref)
            XCTAssertEqual(try BibleReference.parseReference(row.label), [row.ref], row.label)
        }
    }
}
