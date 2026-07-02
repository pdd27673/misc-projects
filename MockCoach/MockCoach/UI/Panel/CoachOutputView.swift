import SwiftUI
import AppKit

/// Right pane: mode ladder (tabs) + staged coach output. The UI never jumps to a
/// full answer — Draft is gated behind an explicit unlock.
struct CoachOutputView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            modeTabs
            Divider()
            ScrollView {
                content
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: Mode ladder

    private var modeTabs: some View {
        HStack(spacing: 6) {
            ForEach(CoachMode.allCases) { mode in
                Button {
                    Task { await app.request(mode: mode) }
                } label: {
                    Label(mode.title, systemImage: mode.systemImage)
                        .labelStyle(.titleAndIcon)
                        .font(.callout)
                }
                .buttonStyle(.bordered)
                .tint(app.selectedMode == mode ? .accentColor : .secondary)
                .disabled(mode.requiresUnlock && !app.draftUnlocked)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
    }

    // MARK: Content per mode

    @ViewBuilder private var content: some View {
        if let response = app.currentResponse {
            switch app.selectedMode {
            case .clarify: clarify(response)
            case .hint: hint(response)
            case .plan: plan(response)
            case .review: review(response)
            case .draft: draft(response)
            case .compare: compare(response)
            }
        } else if app.selectedMode == .draft && !app.draftUnlocked {
            lockedDraft
        } else {
            Text(app.isBusy ? "Working…" : "Select a mode to generate help.")
                .foregroundStyle(.secondary)
        }
    }

    private func clarify(_ r: CoachResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let s = r.restatement { block("Restatement", s) }
            bullets("Clarifying questions", r.clarifyingQuestions)
        }
    }

    private func hint(_ r: CoachResponse) -> some View {
        bullets("Next hint", r.hints)
    }

    private func plan(_ r: CoachResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            bullets("Plan", r.plan)
            if let code = r.pseudocode {
                codeBlock("Pseudocode", code)
            }
        }
    }

    private func review(_ r: CoachResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            bullets("Edge cases", r.edgeCases, copyable: true)
            if let c = r.complexity { block("Complexity", c) }
        }
    }

    private func draft(_ r: CoachResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let s = r.restatement { block("Summary", s) }
            if let c = r.complexity { block("Complexity", c) }
            if let code = r.draftSolution { codeBlock("Draft solution", code) }
        }
    }

    private func compare(_ r: CoachResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let c = r.comparison { block("Alternative & tradeoffs", c) }
            if let cx = r.complexity { block("Complexity", cx) }
        }
    }

    private var lockedDraft: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Draft is locked", systemImage: "lock")
                .font(.headline)
            Text("Solve it yourself first — that's the point of practice. Unlock a full reference solution only when you're ready.")
                .foregroundStyle(.secondary)
            Button("Unlock draft solution") { app.unlockDraft() }
                .buttonStyle(.borderedProminent)
        }
    }

    // MARK: Building blocks

    private func block(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption2).foregroundStyle(.secondary)
            Text(text).textSelection(.enabled)
        }
    }

    private func bullets(_ title: String, _ items: [String], copyable: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title.uppercased()).font(.caption2).foregroundStyle(.secondary)
                if copyable && !items.isEmpty {
                    Spacer()
                    CopyButton(text: items.map { "- \($0)" }.joined(separator: "\n"))
                }
            }
            if items.isEmpty {
                Text("—").foregroundStyle(.tertiary)
            } else {
                ForEach(items, id: \.self) { Text("• \($0)").textSelection(.enabled) }
            }
        }
    }

    private func codeBlock(_ title: String, _ code: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title.uppercased()).font(.caption2).foregroundStyle(.secondary)
                Spacer()
                CopyButton(text: code)
            }
            Text(code)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
        }
    }
}

/// Copies `text` to the pasteboard. Nothing is ever auto-inserted into the
/// coding editor — copy is deliberate and user-driven.
struct CopyButton: View {
    let text: String
    @State private var copied = false
    var body: some View {
        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            copied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { copied = false }
        } label: {
            Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                .font(.caption)
        }
        .buttonStyle(.borderless)
    }
}
