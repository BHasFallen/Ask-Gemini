# Dev Session Notes — 2026-09-17
> **Session title:** Extension Codebase Review Request  
> **Branch/Version:** V1.1.0  
> **Duration:** ~3 hours

---

## Overview

This session covered the full implementation of a smart rating prompt system, a complete popup UI redesign, and several new feature controls — all without breaking any existing user data.

---

## Changes by File

### `rating-banner.js`
- **Feature banner colour** — changed from hardcoded yellow to brand-purple (`--ag-primary`) with CSS variable theming so it respects dark/light mode automatically.
- **Removed all inline styles** from the banner component; moved to class-based CSS.
- **Added `AG_DEBUG_RATING` event listener** bridge so the debug console commands work from the `top` frame context.

---

### `debug-bridge.js` *(new file)*
- Exposes `AskGemini.debugRating` helpers into the main page `MAIN` world via custom events.
- Registered in `manifest.json` as a `MAIN` world content script so it runs in the page context (not the isolated extension context), making it usable directly from the Chrome DevTools `top` console.

```js
// Usage from DevTools (top frame, on any Gemini tab):
AskGemini.debugRating.preview('context_reply');
AskGemini.debugRating.setState({ replyCount: 5, totalWords: 800 });
AskGemini.debugRating.reset();
```

---

### `background.js` — Rating Manager
- **Trigger threshold changed to 3 days** (was action-count only). The prompt now only fires after the user has been active across 3 or more distinct calendar days.
- **Replaced undo-count gate** with **smart paste success count** — the prompt requires a meaningful number of successful smart paste interactions before considering showing.
- **Cooldown** between prompt attempts remains 24 hours.
- **Max dismissals** remains 2 (permanently silenced after two dismissals).

**Rating trigger logic summary:**
```
Show rating prompt IF:
  activeDays >= 3
  smartPasteSuccessCount >= threshold
  No prompt shown in last 24 hrs
  Total prompts shown < 2
  User has not already given feedback
```

---

### `manifest.json`
- Registered `debug-bridge.js` as a content script with `"world": "MAIN"`.

---

### `styles.css`
- Updated `.ag-rating-banner` and related selectors to use CSS variables (`--ag-primary`, `--ag-primary-hover`) instead of hardcoded colours.
- Banner now correctly inverts in light mode via `@media (prefers-color-scheme: light)`.

---

### `popup.html` + `popup.js` — Complete Redesign

**Visual changes:**
- Full dark-mode design with solid colours (no gradients anywhere).
- All emojis replaced with inline SVG icons.
- Modern toggle switches and segmented control pills for settings.
- Phantom scrollbar fixed (`overflow-y: hidden`, `scrollbar-width: none`).
- "How to Use" guide moved into a collapsible accordion to reduce vertical clutter.
- Added a minimalist footer with Report Problem + Open Gemini links.

**Settings hierarchy restructured:**

```
[x] Quote Reply                       <- master toggle (quote_reply_enabled)
    [x] Multi Quote                   <- sub-row, collapses when QR off (multi_quote_enabled)
         Format: [Compact][Expanded]  <- sub-sub-row, collapses when MQ off
[x] Smart Paste         Auto | Ask | Off
[x] Table of Contents
[x] Quota Limits                      <- hidden entirely for free-plan users
```

**State persistence:**  
All settings use `chrome.storage.local` and survive extension updates. Keys:
- `quote_reply_enabled` (new)
- `multi_quote_enabled`
- `multi_quote_display`
- `smart_paste_behavior`
- `toc_enabled`
- `usage_limits_enabled`

---

### `quote-reply.js`
- Added `window.AskGemini.quoteReplyEnabled = true` global (overwritten by boot prefs).
- `handleSelection()` now returns early if `quoteReplyEnabled` is `false` — the floating button never appears when Quote Reply is turned off.

---

### `content.js`
- Added `quote_reply_enabled` to the boot storage read.
- Added `quote_reply_enabled` to the `chrome.storage.onChanged` listener — toggling it live immediately hides the float button and clears the context box/queue without requiring a page reload.

---

## New Storage Keys

| Key | Type | Default | Description |
|---|---|---|---|
| `quote_reply_enabled` | boolean | true | Master on/off for the floating quote button |
| `rating_state.activeDays` | number | 0 | Count of distinct calendar days with activity |
| `rating_state.smartPasteSuccessCount` | number | 0 | Successful smart paste interactions |

---

## Testing Commands

### Rating System — run from Background Service Worker console
```js
chrome.storage.local.set({
  rating_state: {
    activeDays: 3,
    activeDaySet: [],
    replyCount: 10,
    totalWords: 2000,
    smartPasteSuccessCount: 5,
    firstActiveDay: Date.now() - (3 * 86400000),
    promptCount: 0,
    dismissed: 0,
    feedbackGiven: false,
    lastPromptTimestamp: 0
  }
});
```

### Debug Rating — run from Gemini tab top frame
```js
AskGemini.debugRating.preview('context_reply');
AskGemini.debugRating.reset();
AskGemini.debugRating.setState({ activeDays: 3 });
```

### Plan Detection — run from Background Service Worker console
```js
// Simulate free user (hides Quota Limits option in popup)
chrome.storage.local.set({ quota_limits: { isProUser: false, userTier: 1 } });

// Restore pro user
chrome.storage.local.set({ quota_limits: { isProUser: true, userTier: 2 } });
```

NOTE: chrome.storage is only accessible from extension contexts (background service worker,
popup DevTools) — not from the regular page console.

---

## Data Safety

chrome.storage.local persists through extension updates. No user settings or stats are reset
on update. All new keys use safe defaults (the !== false pattern) so existing installs without
the key get the correct default behaviour.
