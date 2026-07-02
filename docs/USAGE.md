# MockCoach — Usage Guide

How to use MockCoach day to day. To build and launch it first, see
[RUNBOOK.md](RUNBOOK.md); for how it works internally, see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. What it is

MockCoach is a menu-bar app that helps you practice coding-interview problems.
You point it at a problem on your screen; it reads the text, structures it, and
gives you **staged** help — clarifying questions, hints, a plan, edge cases, and
(only if you unlock it) a full solution — in a floating panel you can park on a
second display or a Sidecar iPad.

Two rules to keep in mind:

- **Help first, answer later.** You climb a ladder; the full solution is locked
  until you choose to see it.
- **Nothing is auto-typed into your editor.** You copy what you want, when you
  want.

---

## 2. First launch

MockCoach is a **menu-bar agent** — no Dock icon, no main window. After it
launches, look for the 🧠 brain icon in the menu bar.

On first use you'll be guided to grant **Screen Recording** (needed to capture
the problem). Open **Settings → Permissions** to grant it, then quit and relaunch
if macOS asks you to. The default build needs *only* Screen Recording — the
global hotkey uses a Carbon shortcut that doesn't require Input Monitoring.

---

## 3. The core loop

1. **Press ⌥⌘C** (Option-Command-C) anywhere. This is the global "capture
   current problem" hotkey. (You can also click the menu-bar icon → **Capture
   Problem**.)
2. **Drag a box** over the problem text. Release to capture; press **Esc** to
   cancel.
3. MockCoach captures that region, runs on-device OCR, and parses the text. The
   **helper panel** opens showing the parsed prompt on the left.
4. **Pick a mode** on the right (start with **Clarify** or **Hint**). The coach
   generates staged guidance.
5. Copy any snippet you want with its **Copy** button.

To re-capture the same area later, use **Reuse Region** (menu bar or the panel
toolbar) — no need to drag again.

---

## 4. The modes (the ladder)

The right pane is a ladder. Climb it as far as you need:

| Mode | What you get | Emits code? |
|---|---|---|
| **Clarify** | Restated task, assumptions, clarifying questions to ask | No |
| **Hint** | The single next nudge (≤ 3 bullets) | No |
| **Plan** | Approach, data structures, step-by-step plan, pseudocode | Pseudocode only |
| **Edge Cases** | Edge cases / bug risks + target time & space complexity | No |
| **Draft** | A full reference solution + short explanation (🔒 locked) | Yes |
| **Compare** | An alternative approach and its tradeoffs | No |

**Unlocking Draft.** Draft is locked by design — solving it yourself is the
point. When you're ready, open the **Draft** tab and click **Unlock draft
solution**. It stays unlocked for that session.

Each mode's output is generated on demand and cached on the session, so
switching back to a mode you've already run is instant.

---

## 5. Fixing bad OCR

Screenshots of small or low-contrast code sometimes OCR imperfectly. Two tools:

- **Re-run OCR** — runs recognition again on the same capture (e.g. after you
  changed nothing but want a fresh pass).
- **Correct…** — in the left pane, click **Correct…**, edit the extracted text
  by hand, and press **Done**. MockCoach re-parses your corrected text.

If a capture comes back empty, the status bar suggests enlarging the prompt on
screen (zoom the browser/editor) and recapturing. You can also merge context by
capturing again — each capture starts a fresh session.

---

## 6. Settings

Open **Settings** from the menu-bar popover (or ⌘,). Three tabs:

### Model

- **Coach provider**
  - **Offline (stub)** — deterministic, no key, no network. Great for trying the
    whole flow or demoing. This is the default.
  - **Claude API** — real model-backed coaching.
- **Model** (API only) — pick a preset or type any model ID:
  - **Opus 4.8** — most capable.
  - **Sonnet 5** — balanced, cheaper.
  - **Haiku 4.5** — fastest & cheapest; ideal for testing.
  - **Custom…** — any model ID in the text field.
  MockCoach automatically enables adaptive thinking and the effort setting only
  for models that support them, so switching models never causes request errors.
- **API key** (API only) — your Anthropic key. *(Stored in `UserDefaults` in
  this scaffold — move to Keychain before distributing.)*

### Permissions

Status badges and one-click **Request** / **Open Settings** buttons for Screen
Recording, Input Monitoring, and (if ever needed) Accessibility. Shows the
current hotkey (⌥⌘C).

### Display

- **Keep panel always on top** — the helper floats above other windows.
- **Compact mode** — tighter layout for a small Sidecar window.
- **Large text** — bumps the panel's type size for tablet viewing.

---

## 7. The floating panel

The panel is a **separate, non-activating window**: bringing it forward does not
steal focus from your editor. Its toolbar mirrors the key actions — **Capture**,
**Reuse Region**, **Re-run OCR**, the **pin** (always-on-top) toggle, and the
**compact** toggle.

### Using it on Sidecar / a second display

1. Enable **Sidecar** (or plug in a second display).
2. Open the panel (menu bar → **Open Helper Panel**).
3. Drag the panel onto the iPad/second display.
4. Turn on **pin** (always on top) and, on a small iPad, **Compact** +
   **Large text**.

Now the problem and your coding stay on the Mac while hints live on the tablet.

---

## 8. Session history

Every capture becomes a saved session (parsed prompt, OCR text, responses,
image). The menu-bar popover lists your **recent** captures — click one to load
it back into the panel. Sessions persist across launches
(`~/Library/Application Support/MockCoach/`).

---

## 9. Offline vs. API mode at a glance

| | Offline (stub) | Claude API |
|---|---|---|
| Needs a key | No | Yes |
| Network | No | Yes |
| Guidance quality | Canned/heuristic | Real, model-backed |
| Good for | Trying the flow, demos, tests | Actual practice |
| Cost | Free | Per-token (Haiku cheapest) |

Start offline to verify capture/OCR/parse works, then switch to the Claude API
(Haiku first if you're just checking wiring) for real coaching.
