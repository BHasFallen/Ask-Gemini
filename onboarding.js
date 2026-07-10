document.addEventListener('DOMContentLoaded', () => {

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
            name: 'onboarding_page_viewed',
            params: { version }
        });
    }

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    name: 'onboarding_open_gemini_clicked',
                    params: { version }
                });
            }
        });
    }
});
