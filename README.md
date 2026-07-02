# MockCoach

A **local macOS practice coach** for coding interviews. Press a hotkey, drag a
box around the problem on screen, and MockCoach captures it, runs on-device OCR,
parses the prompt into sections, and gives you *staged* help in a separate
floating panel you can park on a Sidecar iPad or a non-shared display.

Two rules define the product:

- **Help first, answer later.** The mode ladder goes Clarify → Hint → Plan →
  Edge Cases → Compare, and only reaches a full **Draft** solution when you
  explicitly unlock it.
- **Nothing is auto-inserted into your editor.** Every snippet is copy-on-demand.

> ⚠️ **Build status:** this is a native SwiftUI/macOS app that depends on
> ScreenCaptureKit, Vision, and Carbon. It **requires Xcode on macOS to build** —
> it was scaffolded on Linux and has **not been compiled or run**. Treat it as a
> complete, buildable-quality v1 source tree, not a shipped binary. Expect to
> fix a few things on first compile (coordinate conventions in capture, and the
> exact structured-outputs field shape are the most likely spots).

## Documentation

| Doc | For |
|---|---|
| **[docs/RUNBOOK.md](docs/RUNBOOK.md)** | Build, sign, launch, smoke-test, troubleshoot, reset — the local run book |
| **[docs/USAGE.md](docs/USAGE.md)** | How to use it: the capture loop, the modes, settings, Sidecar |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How it's designed: data flow, modules, concurrency, extension points |

**TL;DR to run it:** `brew install xcodegen` → `xcodegen generate` → open in
Xcode, set your signing Team, **⌘R** → grant Screen Recording → press **⌥⌘C**.
Full steps in the [runbook](docs/RUNBOOK.md).

## The loop

1. Press **⌥⌘C** (global hotkey).
2. **Auto mode (default):** the frontmost **browser window** is captured whole —
   no dragging. (Switch to region/drag or reuse-region in Settings → Capture.)
3. ScreenCaptureKit captures it → PNG in Application Support.
4. Vision OCR extracts text as ordered lines.
5. `PromptParser` splits it into title / problem / examples / constraints.
6. Pick a mode; the coach engine generates staged guidance in the panel.

## Modules

| Path | Responsibility |
|---|---|
| `App/` | App entry point + `AppState` pipeline coordinator |
| `Capture/` | ScreenCaptureKit capture + interactive region selector |
| `OCR/` | Vision `VNRecognizeTextRequest` wrapper + models |
| `Parsing/` | Heuristic prompt parser (headings, examples, OCR fixups) |
| `Coach/` | `CoachProvider` strategy: offline stub + Claude API provider |
| `UI/` | Menu-bar popover, floating panel (two-pane), settings |
| `Persistence/` | JSON-backed session store |
| `Support/` | Permissions helpers, Carbon global hotkey |

## Coach providers

`CoachProvider` is a strategy interface with two implementations:

- **Offline (stub)** — deterministic, no key, no network. Ships as the default
  so you can exercise the whole capture → OCR → parse → render loop immediately.
- **Claude API** — talks to the Messages API directly (Swift has no official
  Anthropic SDK) at `https://api.anthropic.com/v1/messages`, with structured
  outputs (`output_config.format`) so the reply decodes straight into
  `CoachResponse`. Set your key in **Settings → Model**.

### Model agnostic

The provider is model agnostic. **Settings → Model** offers presets — **Opus 4.8**
(most capable), **Sonnet 5** (balanced, cheaper), and **Haiku 4.5** (cheapest,
for testing) — plus a free-text field for any model ID.

Capabilities live with the model in `CoachModelOption`, and `APIProvider` shapes
the request from them: adaptive thinking and the `effort` parameter are sent
**only** to models that support them (both would `400` on Haiku 4.5), while
structured outputs is always on. An unknown/custom ID defaults to the
conservative shape (no thinking, no effort) so hand-typed models tend to work.
Swapping in a non-Claude backend is just another `CoachProvider` implementation.

## Building

The repo carries a [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec rather
than a committed `.xcodeproj` (a hand-written `pbxproj` is noise in review).

```sh
brew install xcodegen
xcodegen generate        # from the branch root; writes MockCoach.xcodeproj
open MockCoach.xcodeproj  # then Run (⌘R) in Xcode
```

Set your `DEVELOPMENT_TEAM` in `project.yml` (or via Xcode's Signing pane).
Deployment target is macOS 14.

## Permissions

On first run, MockCoach guides you through:

- **Screen Recording** — required for capture (ScreenCaptureKit).
- **Input Monitoring** — only if you swap the Carbon hotkey for a CGEventTap
  listener. The default Carbon hotkey does **not** need it.
- **Accessibility** — only if you later add advanced window management.

## Known cut lines (v1)

Deliberately out of scope: continuous live capture, audio transcription, a
browser extension, editor integration, auto-follow scrolling, and multi-problem
memory. The API key currently lives in `UserDefaults` — move it to the Keychain
before distribution.
