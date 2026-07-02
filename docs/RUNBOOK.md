# MockCoach — Build & Run Book

Everything needed to build, launch, and run MockCoach locally. For how to *use*
it once running, see [USAGE.md](USAGE.md); for the design, see
[ARCHITECTURE.md](ARCHITECTURE.md).

> ⚠️ **Not yet compiled.** This app was scaffolded on Linux and has **not been
> built or run**. It's buildable-quality Swift, but budget time for a few
> first-compile fixes (see [Troubleshooting](#8-troubleshooting)). You need a Mac
> with Xcode — none of this runs on Linux.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| macOS | **14.0+** (Sonoma) | ScreenCaptureKit `SCScreenshotManager` + SwiftData-era APIs |
| Xcode | **15.0+** | Includes the Swift 5.10 toolchain |
| XcodeGen | latest | Generates the `.xcodeproj` from `project.yml` |
| Anthropic API key | optional | Only for the Claude API provider; offline mode needs none |

Install XcodeGen (via Homebrew or Mint):

```sh
brew install xcodegen
# or: mint install yonaskolb/XcodeGen
```

Make sure the Xcode command-line tools are selected:

```sh
xcode-select -p           # should point at Xcode.app
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer   # if not
```

---

## 2. Get the code

```sh
git clone <your-fork-or-remote> misc-projects
cd misc-projects
git checkout macos-practice-coach
```

(The branch is self-contained — the app lives at the branch root, not in a
subfolder. Run everything below from there.)

---

## 3. Generate the Xcode project

The repo intentionally does **not** commit a `.xcodeproj` (a hand-written
`pbxproj` is noise in review). Generate it from the spec:

```sh
xcodegen generate      # reads project.yml → writes MockCoach.xcodeproj
```

You should see `MockCoach.xcodeproj` appear. It's git-ignored.

---

## 4. Signing

MockCoach uses `ENABLE_HARDENED_RUNTIME` and needs to be signed to run (TCC
permissions like Screen Recording are keyed to the app's identity).

**Easiest — let Xcode manage it:**

```sh
open MockCoach.xcodeproj
```

In Xcode: select the **MockCoach** target → **Signing & Capabilities** → check
**Automatically manage signing** → pick your **Team** (a free personal Apple ID
team works for local runs).

**Or set it in the spec** before generating — edit `project.yml`:

```yaml
settings:
  base:
    DEVELOPMENT_TEAM: "YOURTEAMID"   # from Xcode → Settings → Accounts
```

then re-run `xcodegen generate`.

> If you re-sign or change the bundle identifier, macOS treats it as a new app
> and you'll need to re-grant Screen Recording.

---

## 5. Build & run

**From Xcode:** press **⌘R** (Run). The app has no window on launch — look for
the 🧠 icon in the **menu bar** (it's an `LSUIElement` agent app).

**From the command line:**

```sh
xcodebuild -project MockCoach.xcodeproj -scheme MockCoach -configuration Debug build
# then launch the built .app:
open ~/Library/Developer/Xcode/DerivedData/MockCoach-*/Build/Products/Debug/MockCoach.app
```

---

## 6. First-run setup

1. **Grant Screen Recording.** Menu bar → **Settings → Permissions → Screen
   Recording → Request** (or **Open Settings** to do it in System Settings →
   Privacy & Security → Screen Recording). Toggle MockCoach on. macOS may ask
   you to **quit and reopen** the app for it to take effect — do so.
2. **Pick a provider** (Settings → Model):
   - Leave it on **Offline (stub)** for a no-key smoke test, **or**
   - Choose **Claude API**, pick a model, and paste your **API key**.
3. **Try the loop:** open a coding problem in your browser, press **⌥⌘C** (auto
   mode captures the browser window — no dragging), and watch the panel fill in.
   Click **Clarify** or **Hint**. (Prefer drag-select? Settings → Capture →
   Region.)

---

## 7. Smoke tests

### 7a. Offline (no key) — verifies capture → OCR → parse → render

1. Settings → Model → **Offline (stub)**.
2. Open a coding problem (e.g. a LeetCode page) in your **browser**.
3. Press **⌥⌘C** — auto mode captures the browser window (no drag). (Or set
   Settings → Capture → Region and drag over the prompt.)
4. Confirm the left pane shows a parsed **Problem / Examples / Constraints**.
5. Click **Clarify** and **Hint** — you'll get deterministic canned guidance.

If this works, capture, OCR, parsing, and the UI are all wired correctly.

### 7b. Claude API — cheapest first

1. Settings → Model → **Claude API**, model **Haiku 4.5** (cheapest — good for
   verifying the request works), paste your **API key**.
2. Capture a problem and click **Clarify**.
3. Confirm real model-backed text appears. If it does, escalate to **Sonnet 5**
   or **Opus 4.8** for quality.

> Haiku is intentionally sent a minimal request (no adaptive thinking, no effort)
> so it doesn't `400`. If Haiku works but Opus doesn't, the issue is the
> account/model access, not the request shaping.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **Hotkey ⌥⌘C does nothing** | Another app owns ⌥⌘C, or registration failed | Check Console for `RegisterEventHotKey` errors; try triggering via the menu bar → Capture; rebind in `HotkeyManager.register(keyCode:modifiers:)` |
| **Capture throws "Screen Recording permission required"** | TCC not granted, or granted to a *previous* signed build | Settings → Permissions → Screen Recording; if you re-signed, remove and re-add MockCoach in System Settings, then relaunch |
| **"No browser window found"** (auto mode) | No focused/qualifying browser window, or an unlisted browser | Focus a browser with the problem open; if you use an uncommon browser, add its bundle ID to `ScreenCaptureService.browserBundleIDs`; or switch to Settings → Capture → Region |
| **Captured region is offset / wrong area** (region mode) | Coordinate conversion (AppKit bottom-left vs. capture top-left), esp. multi-display | Known first-run fix. Reconcile the flip in `RegionSelector.globalTopLeftRect` and the `sourceRect` math in `ScreenCaptureService.capture`. **Auto browser-window mode avoids this** |
| **OCR includes tabs/sidebar junk** (auto mode) | Whole window is captured | Use the prompt's **Correct…** editor to trim, or switch to Region mode for a tight crop |
| **OCR returns nothing** | Text too small/low-contrast, or empty capture | Enlarge/zoom the page and recapture; use **Correct…** to type it in; the status bar hints at this |
| **API request 400s** | An unsupported field for that model | The provider gates `thinking`/`effort` by model; if you typed a *custom* ID, it defaults to the conservative shape. Verify the model ID string is exact |
| **API request 401** | Bad/empty API key | Re-paste the key in Settings → Model; ensure no stray whitespace |
| **API reply won't decode** | Model didn't emit schema-shaped JSON | Confirm `output_config.format` is accepted for your model; check the exact structured-outputs field names against current API docs |
| **Panel doesn't float above editor** | Always-on-top off | Settings → Display → "Keep panel always on top", or the pin toggle in the panel toolbar |
| **App has no Dock icon** | Working as intended | It's a menu-bar agent (`LSUIElement`); use the 🧠 menu-bar item |
| **First build fails to compile** | Native-only APIs, unverified source | Read the compiler error; the coordinate math and structured-outputs schema are the most likely spots |

---

## 9. Where your data lives (and how to reset)

| Data | Location |
|---|---|
| Capture images (PNG) | `~/Library/Application Support/MockCoach/Captures/` |
| Session index (JSON) | `~/Library/Application Support/MockCoach/sessions.json` |
| Preferences + API key | `UserDefaults`, domain `com.mockcoach.MockCoach` |

**Reset everything:**

```sh
# wipe captures + session history
rm -rf ~/Library/Application\ Support/MockCoach

# wipe preferences (provider, model, API key, toggles)
defaults delete com.mockcoach.MockCoach
```

To revoke capture access for a clean permissions test: System Settings → Privacy
& Security → Screen Recording → remove MockCoach.

---

## 10. Known unverified items

Because this hasn't been compiled, treat these as "expect to touch first":

- **Capture coordinates** — the region→`sourceRect` conversion across displays.
- **Structured-outputs field shape** — the exact `output_config.format` payload
  the current API expects.
- **ScreenCaptureKit API signatures** — `SCShareableContent` /
  `SCScreenshotManager` call shapes on your SDK version.

Everything else (parser, OCR wiring, panel, persistence, model-agnostic request
shaping) is straightforward Swift with no unusual API surface.
