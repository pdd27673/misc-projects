import SwiftUI

/// Left pane: the parsed prompt sections, with an escape hatch to hand-correct
/// the extracted text when OCR mangles something.
struct PromptPreviewView: View {
    @EnvironmentObject private var app: AppState
    @State private var editing = false
    @State private var draftText = ""

    private var prompt: ParsedPrompt { app.session.parsedPrompt }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                header

                if editing {
                    editor
                } else if prompt.isEmpty {
                    ContentUnavailablePlaceholder()
                } else {
                    sections
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var header: some View {
        HStack {
            Text(prompt.title ?? "Prompt")
                .font(.headline)
            Spacer()
            Button(editing ? "Done" : "Correct…") {
                if editing {
                    app.updateCorrectedText(draftText)
                } else {
                    draftText = app.session.ocrText
                }
                editing.toggle()
            }
            .font(.callout)
            .disabled(app.session.ocrText.isEmpty && !editing)
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Edit the extracted text, then press Done to re-parse.")
                .font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $draftText)
                .font(.system(.body, design: .monospaced))
                .frame(minHeight: 240)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
        }
    }

    @ViewBuilder private var sections: some View {
        if !prompt.statement.isEmpty {
            Section(title: "Problem") { Text(prompt.statement) }
        }
        ForEach(Array(prompt.examples.enumerated()), id: \.element.id) { index, ex in
            Section(title: "Example \(index + 1)") {
                VStack(alignment: .leading, spacing: 2) {
                    labeled("Input", ex.input)
                    labeled("Output", ex.output)
                    if let e = ex.explanation { labeled("Explanation", e) }
                }
            }
        }
        if !prompt.constraints.isEmpty {
            Section(title: "Constraints") {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(prompt.constraints, id: \.self) { Text("• \($0)") }
                }
            }
        }
        if let sig = prompt.functionSignature {
            Section(title: "Starter Signature") {
                Text(sig).font(.system(.body, design: .monospaced))
            }
        }
        if !prompt.complexityTargets.isEmpty {
            Section(title: "Complexity Targets") {
                Text(prompt.complexityTargets.joined(separator: ", "))
            }
        }
    }

    private func labeled(_ label: String, _ value: String) -> some View {
        (Text(label + ": ").bold() + Text(value))
            .font(.system(.body, design: .monospaced))
            .textSelection(.enabled)
    }
}

/// Small titled section wrapper.
private struct Section<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2).foregroundStyle(.secondary)
            content.textSelection(.enabled)
        }
    }
}

private struct ContentUnavailablePlaceholder: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "text.viewfinder").font(.largeTitle).foregroundStyle(.secondary)
            Text("No prompt captured yet.").foregroundStyle(.secondary)
            Text("Press ⌥⌘C, drag over the problem, and it'll appear here.")
                .font(.caption).foregroundStyle(.tertiary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 200)
    }
}
