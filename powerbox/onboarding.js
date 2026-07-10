document.addEventListener('DOMContentLoaded', () => {
    // ── Mode detection ───────────────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason') || 'install';
    document.body.className = `mode-${reason}`;

    // ── Version badge ────────────────────────────────────────────────────────
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;

    const versionBadge = document.getElementById('ob-version');
    if (versionBadge) versionBadge.textContent = `v${version}`;

    const versionInline = document.getElementById('ob-version-inline');
    if (versionInline) versionInline.textContent = `v${version}`;

    // ── Open Gemini button ───────────────────────────────────────────────────
    const openBtn = document.getElementById('ob-open-gemini');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://gemini.google.com/app' });
        });
    }

    // ── Analytics ────────────────────────────────────────────────────────────
    if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
            type: 'TRACK_EVENT',
            name: `onboarding_view_${reason}`,
            params: { version }
        });
    }
});
