import Foundation
import ShalomCore
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// What a problem report is about. The order is the order shown in the picker.
enum SupportReportReason: String, CaseIterable, Identifiable, Sendable {
    case incorrectAnswer
    case citationProblem
    case harmfulContent
    case appProblem
    case privacyQuestion
    case other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .incorrectAnswer: "Answer is wrong or misleading"
        case .citationProblem: "Bible reference or quote problem"
        case .harmfulContent: "Harmful or offensive content"
        case .appProblem: "App isn't working"
        case .privacyQuestion: "Privacy or data question"
        case .other: "Something else"
        }
    }
}

/// The plain-text report a person can copy or share. Pure and deterministic:
/// no dates, no identifiers, no chat history, and the answer text only when
/// `includeAnswer` is on. Building it sends, uploads and stores nothing.
struct SupportReportDraft: Equatable, Sendable {
    static let maxNotesLength = 2_000
    static let maxAnswerLength = 8_000

    var reason: SupportReportReason
    var notes: String = ""
    var includeAnswer: Bool = false
    /// Candidate answer text. Ignored unless `includeAnswer` is true.
    var answerText: String?
    var appVersion: String
    var buildNumber: String
    var systemDescription: String

    var hasAnswer: Bool {
        !(answerText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var text: String {
        var lines = [
            "Shalom problem report",
            "Reason: \(reason.title)",
            "App: Shalom \(appVersion) (\(buildNumber))",
            "System: \(systemDescription)",
            "",
            "Notes:",
        ]
        let note = Self.clip(notes.trimmingCharacters(in: .whitespacesAndNewlines), to: Self.maxNotesLength)
        lines.append(note.isEmpty ? "(none)" : note)
        lines.append("")
        let answer = (answerText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if includeAnswer && !answer.isEmpty {
            lines.append("Answer text (included by the person reporting):")
            lines.append(Self.clip(answer, to: Self.maxAnswerLength))
            if answer.count > Self.maxAnswerLength {
                lines.append("[Answer shortened to its first \(Self.maxAnswerLength) characters]")
            }
        } else {
            lines.append("Answer text: not included")
        }
        lines.append("")
        lines.append("Shalom does not automatically add account or sign-in details, device identifiers, your question, or other chat messages. Check notes and any included answer for personal information before sharing.")
        return lines.joined(separator: "\n")
    }

    /// Cuts to at most `max` characters (grapheme clusters), so emoji and
    /// combined marks are never split.
    static func clip(_ value: String, to max: Int) -> String {
        guard max > 0 else { return "" }
        return value.count <= max ? value : String(value.prefix(max))
    }
}

/// A native report form. It prepares text only: there is no report endpoint,
/// so nothing is uploaded, mailed or stored. The person picks the recipient
/// in the system share sheet, or copies the text.
struct SupportReportSheet: View {
    let message: ChatMessage?
    let configuration: NativeConfiguration

    @Environment(\.dismiss) private var dismiss
    @State private var reason: SupportReportReason?
    @State private var notes = ""
    @State private var includeAnswer = false
    @State private var copied = false

    private var answerText: String? {
        guard let message, message.role == .assistant, message.delivery != .streaming else { return nil }
        let text = message.text.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : message.text
    }

    private func draft(for reason: SupportReportReason) -> SupportReportDraft {
        let info = Bundle.main
        return SupportReportDraft(
            reason: reason,
            notes: notes,
            includeAnswer: includeAnswer,
            answerText: answerText,
            appVersion: info.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            buildNumber: info.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            systemDescription: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion), \(UIDevice.current.model)"
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Reason", selection: $reason) {
                        Text("Choose a reason").tag(SupportReportReason?.none)
                        ForEach(SupportReportReason.allCases) { item in
                            Text(item.title).tag(Optional(item))
                        }
                    }
                    .pickerStyle(.navigationLink)
                    .accessibilityIdentifier("report-reason")
                } header: {
                    Text("What went wrong?")
                }

                Section {
                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(3...10)
                        .accessibilityIdentifier("report-notes")
                        .onChange(of: notes) { _, value in
                            if value.count > SupportReportDraft.maxNotesLength {
                                notes = SupportReportDraft.clip(value, to: SupportReportDraft.maxNotesLength)
                            }
                        }
                } header: {
                    Text("Details")
                } footer: {
                    Text("\(notes.count) of \(SupportReportDraft.maxNotesLength) characters. Please leave out names, contact details and other personal or sensitive information.")
                }

                if answerText != nil {
                    Section {
                        Toggle("Include the answer text", isOn: $includeAnswer)
                            .accessibilityIdentifier("report-include-answer")
                    } footer: {
                        Text("Off unless you turn it on. Only this answer's text is added (up to \(SupportReportDraft.maxAnswerLength) characters). The answer may repeat parts of your question or contain personal details; check the preview before sharing.")
                    }
                }

                if configuration.supportContactURL == nil {
                    Section {
                        Label("Support contact not configured", systemImage: "info.circle")
                            .accessibilityIdentifier("report-support-missing")
                        Text("You can save or share a draft yourself, but this app has no configured Shalom support destination. Nothing here submits a report to Shalom.")
                            .font(.subheadline)
                            .foregroundStyle(ShalomTheme.mutedInk)
                    }
                }

                Section {
                    if let reason {
                        Text(verbatim: draft(for: reason).text)
                            .font(.footnote)
                            .foregroundStyle(ShalomTheme.ink)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("report-preview")
                    } else {
                        Text("Choose a reason to see the exact report text.")
                            .font(.subheadline)
                            .foregroundStyle(ShalomTheme.mutedInk)
                    }
                } header: {
                    Text("Report preview")
                } footer: {
                    Text("This is the exact report text. Shalom does not upload it. Copy puts it on this device's clipboard for up to ten minutes; Share opens the system chooser.")
                }

                Section {
                    if let reason {
                        let text = draft(for: reason).text
                        ShareLink(item: text,
                                  subject: Text("Shalom problem report"),
                                  preview: SharePreview("Shalom problem report")) {
                            Label(configuration.supportContactURL == nil ? "Share or Save Elsewhere…" : "Share Report…", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("report-share")
                        Button {
                            UIPasteboard.general.setItems([[UTType.plainText.identifier: text]],
                                options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(600)])
                            copied = true
                        } label: {
                            Label(copied ? "Copied to Clipboard" : "Copy Report",
                                  systemImage: copied ? "checkmark" : "doc.on.doc")
                        }
                        .accessibilityIdentifier("report-copy")
                    } else {
                        Button {} label: {
                            Label("Share Report…", systemImage: "square.and.arrow.up")
                        }
                        .disabled(true)
                        .accessibilityIdentifier("report-share")
                        .accessibilityHint("Choose a reason first")
                    }
                } footer: {
                    Text("Sharing opens the system share sheet, where you choose the recipient. Preparing, copying or sharing a report does not mean Shalom has received it.")
                }

                if let url = configuration.supportContactURL {
                    Section {
                        Link(destination: url) {
                            Label(configuration.supportURL == nil ? "Email Shalom Support" : "Open Shalom Support",
                                  systemImage: configuration.supportURL == nil ? "envelope" : "questionmark.circle")
                        }
                        .accessibilityIdentifier("report-support-link")
                        if let email = configuration.supportEmail {
                            Text(email)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                                .accessibilityIdentifier("report-support-email")
                        }
                    } header: {
                        Text("Support")
                    } footer: {
                        Text(configuration.supportURL == nil
                             ? "The email link opens your mail app without adding report text. Review or paste the report yourself before sending. Nothing is sent automatically."
                             : "The support link opens Shalom's support page. Reports are not uploaded automatically.")
                    }
                }
            }
            .accessibilityIdentifier("report-form")
            .navigationTitle(message == nil ? "Help and Reports" : "Report a Problem")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .accessibilityIdentifier("report-close")
                }
            }
            .onChange(of: reason) { _, _ in copied = false }
            .onChange(of: notes) { _, _ in copied = false }
            .onChange(of: includeAnswer) { _, _ in copied = false }
        }
        .tint(ShalomTheme.accent)
        .preferredColorScheme(.light)
    }
}
