# Ask Gemini: Chrome Web Store (CWS) Release & Packaging Policy

This rule applies whenever preparing, building, packaging, or submitting a new release of **Ask Gemini (Quote Reply for Gemini)**.

## 🚫 Hard Gate: No Unverified Packaging
Never zip the extension or announce an update ready for Chrome Web Store submission without first executing and passing the complete automated test suite with a 100% pass rate.

---

## 📋 Mandatory Pre-Ship Verification Protocol

### Step 1: Unit & Local E2E Sanity Suite (Offline)
Run:
```powershell
npm test
```
*Must pass 100%:*
- **19/19 Unit Tests** (`tests/unit/`): Title parsing, timestamp formatting, fuzzy multi-token search, and Chrome storage synchronization.
- **10/10 Local E2E Tests** (`tests/e2e/local/`): 4-turn TOC sliding window, multi-quote stacking (1 -> 2 -> 3), smart paste threshold/modal/undo pill, quota limits dynamic colors, full bookmarks lifecycle (`Ctrl+Shift+B`), live popup toggles without reload, and onboarding tour.

### Step 2: Live Gemini Production E2E Suite (Online)
Run:
```powershell
npm run test:e2e:live
```
*Must pass all 7 live production tests on `gemini.google.com` (using `.test-user-data` persistent session):*
1. **Extension Injection & Quota Card**: Sidebar Bookmarks link and quota card refresh spinner.
2. **Multi-Quote Stacking**: Stacking 1 -> 2 -> 3 quotes, scroll-to-highlight, and context clearing.
3. **4-Turn Interactive Conversation & Dynamic TOC**: Live conversation turns, verifying side dashes appear and smooth scrolling works.
4. **Send & Enter Interception**: Prepending quoted markdown into live Quill editor and prompt submission.
5. **Smart Paste End-to-End**: 'Ask' confirmation modal, 'Auto' file conversion with inline "Paste as text" undo pill, and multi-file attachments with attached prompt text.
6. **Live Bookmarks Lifecycle**: Live response bookmarking, confirmation toast/banner, `Ctrl+Shift+B` overlay, search filtering, and Reader View.
7. **Live Popup Settings Enforcement**: Disabling features stops them on the live page without reload; re-enabling restores them immediately.

### Step 3: Version Alignment
Ensure the release version is synchronized across both configuration files:
- `manifest.json`: `"version": "X.Y.Z"`
- `package.json`: `"version": "X.Y.Z"`

### Step 4: Staging & Clean Build
Run:
```powershell
npm run build
```
Verify that `dist/` contains all 21 staged extension assets (`manifest.json`, background, content, icons, CSS, HTML, and feature scripts).

### Step 5: Packaging for CWS
Only after Steps 1–4 are 100% verified, create the release zip from the contents of the `dist/` folder:
- **Archive Naming Convention**: `ask-gemini-vX.Y.Z.zip`
- **Source**: Directly zip the contents of `dist/` (do **not** include root-level test files, git history, or node_modules).
