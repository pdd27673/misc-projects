# MockCoach — Architecture & How It Works

This document explains how MockCoach is designed: the data flow, the modules,
the concurrency model, and the extension points. For end-user instructions see
[USAGE.md](USAGE.md); to build and run it see [RUNBOOK.md](RUNBOOK.md).

---

## 1. Product philosophy (the constraints that shape the design)

Three product rules drive most design decisions:

1. **Help first, answer later.** The assistant is organized as a *mode ladder*
   (Clarify → Hint → Plan → Edge Cases → Compare), and the full **Draft**
   solution is gated behind an explicit unlock. The UI never jumps from OCR
   straight to an answer.
2. **Nothing is auto-inserted into your editor.** Every snippet is
   copy-on-demand (`CopyButton`). There is no editor automation, no keystroke
   injection — this keeps the tool honest for practice and avoids brittle
   integrations.
3. **The helper is a separate window, not an in-window overlay.** It's a
   non-activating floating `NSPanel` so it can be parked on a Sidecar iPad or a
   secondary display and never steals focus from the coding editor.

Everything below follows from these.

---

## 2. The pipeline (data flow)

```
                 ⌥⌘C (global hotkey)
                        │
                        ▼
            ┌───────────────────────┐
            │ HotkeyManager (Carbon)│
            └───────────┬───────────┘
                        │ onTrigger → Task
                        ▼
        ┌───────────────────────────────────┐
        │ AppState.runCaptureFlow()  (@Main) │  ← the coordinator
        └───────────────────────────────────┘
          │        │          │         │        │
          ▼        ▼          ▼         ▼        ▼
     Permissions  Region   Screen-    Vision   Prompt-
      (screen     Selector Capture-   OCR-     Parser
       recording) (drag)   Service    Service  (heuristics)
          │        │          │         │        │
          └────────┴────┬─────┴────┬────┴────────┘
                        ▼          ▼
                  CaptureFrame   OCRResult ──► ParsedPrompt
                        │
                        ▼
                 CoachSession ──► SessionStore (JSON + PNG on disk)
                        │
              user picks a mode
                        ▼
        ┌───────────────────────────────────┐
        │ AppState.request(mode:)            │
        └───────────────────────────────────┘
                        │
                        ▼
              CoachProvider.analyze()
             ┌───────────┴────────────┐
             ▼                        ▼
        MockProvider            APIProvider  ──► Claude Messages API
        (offline stub)          (structured outputs → CoachResponse)
                        │
                        ▼
              CoachResponse (per mode)
                        │
                        ▼
        PanelController → CoachPanel (two-pane SwiftUI)
```

The concrete first-milestone loop is: **press hotkey → select region → capture
→ OCR → show parsed prompt → click Clarify/Hint → panel on Sidecar.**

---

## 3. The coordinator: `AppState`

`AppState` (`App/AppState.swift`) is the heart of the app — a `@MainActor
ObservableObject` that owns every service and publishes the pipeline state the
UI observes.

- **Owns the services**: `ScreenCaptureService`, `VisionOCRService`,
  `PromptParser`, `RegionSelector`, `HotkeyManager`, `SessionStore`,
  `PanelController`.
- **Publishes state**: `session`, `ocrResult`, `selectedMode`, `isBusy`,
  `statusMessage`, `lastError`, `draftUnlocked`, `lastRegion`, plus persisted
  preferences (`providerKind`, `apiKey`, `modelName`, `alwaysOnTop`,
  `compactMode`, `largeText`).
- **Drives the pipeline**: `runCaptureFlow(reuseRegion:)`, `rerunOCR()`,
  `updateCorrectedText(_:)`, `request(mode:)`, `unlockDraft()`, `load(_:)`.

SwiftUI views (`MenuBarView`, `CoachPanel`, `SettingsView`) receive `AppState`
as an `@EnvironmentObject` and re-render off its `@Published` properties. There
is a single source of truth; views hold no pipeline state of their own.

Preferences persist by writing to `UserDefaults` in `didSet`. (The API key lives
in `UserDefaults` in this scaffold — a production build should move it to the
Keychain; see the note in `AppState.Keys`.)

---

## 4. Concurrency model

- **`AppState` is `@MainActor`.** All pipeline methods and published mutations
  run on the main actor, so the UI observes a consistent state without data
  races.
- **The pipeline is `async`/`await`.** `runCaptureFlow` awaits capture, OCR,
  and (per mode) the coach provider. Long work suspends rather than blocks.
- **Vision runs off-actor.** `VisionOCRService` performs the
  `VNRecognizeTextRequest` on a background `DispatchQueue` and bridges back
  through a `withCheckedThrowingContinuation`, so OCR never blocks the main
  actor.
- **The hotkey callback hops to main.** `HotkeyManager` installs a Carbon event
  handler; its C callback dispatches `onTrigger` onto the main queue, which
  launches a `Task { await runCaptureFlow(...) }`.
- **The region selector is `@MainActor`** (it drives AppKit windows) and returns
  its result via a continuation.

---

## 5. Modules

| Module | Type(s) | Responsibility |
|---|---|---|
| **App** | `MockCoachApp`, `AppDelegate`, `AppState` | Entry point (menu-bar agent), pipeline coordinator |
| **Capture** | `ScreenCaptureService`, `RegionSelector`, `CaptureFrame`, `CaptureError` | ScreenCaptureKit capture + drag-to-select overlay |
| **OCR** | `VisionOCRService`, `OCRLine`, `OCRResult` | Vision text recognition → ordered lines |
| **Parsing** | `PromptParser`, `ParsedPrompt`, `PromptExample` | Heuristic prompt structuring |
| **Coach** | `CoachProvider`, `APIProvider`, `MockProvider`, `CoachModelOption`, `CoachMode`, `CoachResponse`, `CoachPrompts` | Staged guidance engine (model-agnostic) |
| **UI** | `MenuBarView`, `CoachPanel`, `PromptPreviewView`, `CoachOutputView`, `FloatingPanel`/`PanelController`, `SettingsView` | Menu bar, floating panel, settings |
| **Persistence** | `SessionStore`, `CoachSession` | JSON session index + image files |
| **Support** | `Permissions`, `HotkeyManager` | TCC permission helpers, global hotkey |

### 5.1 Capture (`ScreenCaptureService`, `RegionSelector`)

`RegionSelector` presents a borderless, dim, full-screen overlay window; the
user drags a rectangle. It returns the selection in **global, top-left-origin**
screen coordinates.

`ScreenCaptureService` resolves the `SCDisplay`/`NSScreen` containing that
region, sets `SCStreamConfiguration.sourceRect` to the display-local rect at the
screen's backing scale, and captures a single frame via
`SCScreenshotManager.captureImage(...)`. The PNG is written to
`~/Library/Application Support/MockCoach/Captures/` and described by a
`CaptureFrame` (id, timestamp, image URL, display id, region).

> **Coordinate caveat.** AppKit uses a bottom-left origin; the capture
> convention here is top-left. The conversion is exact for the primary display
> (origin 0,0) but multi-display and mixed-origin layouts are the most likely
> place to need a fix on first run. See RUNBOOK → Troubleshooting.

### 5.2 OCR (`VisionOCRService`)

Runs `VNRecognizeTextRequest` with `recognitionLevel = .accurate` and
`usesLanguageCorrection = false` (so code identifiers aren't "autocorrected"
into English words). Observations are re-sorted top-to-bottom, then
left-to-right into natural reading order and returned as `OCRLine`s (text,
normalized bounding box, confidence). `OCRResult.averageConfidence` feeds the
"enlarge the text and recapture" fallback message.

### 5.3 Parsing (`PromptParser`)

A deliberately forgiving, **model-free** parser that runs *before* any model
call — this reduces token waste and gives the UI real sections to render:

- Detects headings: `Example`, `Constraints`, `Notes`/`Follow up`.
- Splits examples into input / output / explanation.
- Extracts a function/method signature and `O(...)` complexity targets.
- Normalizes common OCR artifacts (`0(n)` → `O(n)`, `1og` → `log`, smart quotes).
- Falls back to "everything is the statement" rather than dropping text.

Output is a `ParsedPrompt` (title, statement, examples, constraints, signature,
complexity targets, notes, raw text).

### 5.4 Coach engine (model-agnostic)

`CoachProvider` is a strategy protocol:

```swift
protocol CoachProvider {
    var displayName: String { get }
    func analyze(_ prompt: ParsedPrompt, mode: CoachMode, userCode: String?) async throws -> CoachResponse
}
```

Two implementations ship:

- **`MockProvider`** — deterministic, offline, no key. The default provider so
  the full capture→OCR→parse→render loop works out of the box.
- **`APIProvider`** — calls the Claude Messages API directly (Swift has no
  official Anthropic SDK) at `https://api.anthropic.com/v1/messages` with
  `x-api-key` / `anthropic-version: 2023-06-01`.

**Structured outputs.** `APIProvider` sends `output_config.format` with a JSON
schema mirroring `CoachResponse`, so the model's reply decodes straight into the
Swift type. It reads the first `text` block (skipping any thinking blocks) and
`JSONDecoder`s it.

**Model agnosticism.** `CoachModelOption` is a tiny capability registry:

```swift
struct CoachModelOption {
    let id: String                        // e.g. "claude-haiku-4-5"
    let displayName: String
    let supportsAdaptiveThinking: Bool    // thinking:{type:adaptive} — 4.6+/Sonnet 5
    let supportsEffort: Bool              // output_config.effort — not Haiku
}
```

`APIProvider` shapes its request from these flags — `thinking` and `effort` are
optional and omitted (via `encodeIfPresent`) when unsupported. That's what lets
the *same code path* run Opus, Sonnet, or Haiku: Haiku 4.5 would `400` if sent
either, so both are simply left off. Structured outputs applies to all presets.
An unknown/custom model ID resolves to a conservative option (both off), so
hand-typed models tend to work. Presets: **Opus 4.8**, **Sonnet 5**,
**Haiku 4.5**; any ID is accepted via the free-text field.

`CoachPrompts` holds the per-mode system prompt and the rendering of a
`ParsedPrompt` into the user turn. Prompting rules are enforced here (Clarify
never emits code; Hint ≤ 3 bullets; Plan allows pseudocode; Draft includes code;
etc.).

### 5.5 UI

- **`MenuBarView`** — the menu-bar popover: quick actions + recent-session
  history. The app is an **`LSUIElement` agent** (no Dock icon, no main window).
- **`PanelController` / `FloatingPanel`** — creates a non-activating
  `NSPanel` (`.nonactivatingPanel`, `.utilityWindow`, floating level) hosting
  the SwiftUI `CoachPanel` via `NSHostingView`. `orderFrontRegardless()` shows
  it without stealing key focus. Always-on-top and Sidecar placement are just
  window-level tweaks.
- **`CoachPanel`** — two panes in an `HSplitView`: `PromptPreviewView` (left,
  the parsed prompt + a "Correct…" editor) and `CoachOutputView` (right, the
  mode ladder + staged output with copy buttons and the Draft unlock).

### 5.6 Persistence (`SessionStore`)

A `@MainActor ObservableObject` that keeps `[CoachSession]` and writes it as
pretty-printed JSON to `~/Library/Application Support/MockCoach/sessions.json`.
Capture PNGs live beside it in `Captures/`, referenced by filename so the store
stays portable. (SwiftData or SQLite would also fit; JSON keeps v1
dependency-light and human-inspectable.)

### 5.7 Support (`Permissions`, `HotkeyManager`)

- **`Permissions`** — non-prompting checks and request calls for **Screen
  Recording** (`CGPreflight/RequestScreenCaptureAccess`), **Input Monitoring**
  (`IOHIDCheckAccess`), and **Accessibility** (`AXIsProcessTrusted`), plus
  `x-apple.systempreferences:` deep links.
- **`HotkeyManager`** — a global hotkey via the Carbon `RegisterEventHotKey`
  API. This path **does not require Input Monitoring** (unlike a CGEventTap
  listener) — a deliberate v1 simplification. Default binding: **⌥⌘C**.

---

## 6. Permission surfaces

| Permission | When it's needed | API used |
|---|---|---|
| **Screen Recording** | Always (capture) | `CGPreflightScreenCaptureAccess` |
| **Input Monitoring** | Only if you swap in a CGEventTap hotkey | `IOHIDCheckAccess` |
| **Accessibility** | Only if you later add window management | `AXIsProcessTrusted` |

The default build needs only **Screen Recording**.

---

## 7. Extension points

- **A new model backend** (local LLM, a different API) = a new `CoachProvider`.
  Nothing else changes.
- **A new mode** = a case in `CoachMode` + a branch in `CoachPrompts` and
  `CoachOutputView`.
- **Richer capture** (window capture, all-displays selection) lives entirely in
  `Capture/`.
- **Swap persistence** (SwiftData/SQLite) = reimplement `SessionStore`; the
  `CoachSession` model is already `Codable`.

---

## 8. Build status

This is a native macOS app (ScreenCaptureKit, Vision, Carbon) that **requires
Xcode on macOS**. It was scaffolded on Linux and has **not been compiled or
run**. Treat it as buildable-quality source, and expect to fix a few things on
first compile — the capture coordinate conversion and the exact
structured-outputs field shape are the most likely spots. See RUNBOOK →
Troubleshooting.
