document.addEventListener('DOMContentLoaded', () => {
    // ── Mode detection ───────────────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason') || 'install';
    document.body.className = `mode-${reason}`;

    // ── Version badge ────────────────────────────────────────────────────────
    let version = '2.5.0';
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
            const manifest = chrome.runtime.getManifest();
            if (manifest && manifest.version) {
                version = manifest.version;
            }
        }
    } catch (e) {
        console.warn('Could not read manifest version:', e);
    }

    const versionBadge = document.getElementById('ob-version');
    if (versionBadge) versionBadge.textContent = `v${version}`;

    const versionInline = document.getElementById('ob-version-inline');
    if (versionInline) versionInline.textContent = `v${version}`;

    const versionInstall = document.getElementById('ob-version-install');
    if (versionInstall) versionInstall.textContent = `v${version}`;

    // ── Open Gemini buttons ──────────────────────────────────────────────────
    const openBtns = document.querySelectorAll('#ob-open-gemini, .ob-btn-primary, .ob-install-cta');
    openBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                    chrome.tabs.create({ url: 'https://gemini.google.com/app' });
                } else {
                    window.open('https://gemini.google.com/app', '_blank');
                }
            } catch (err) {
                window.open('https://gemini.google.com/app', '_blank');
            }
        });
    });

    // ── Analytics ────────────────────────────────────────────────────────────
    if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
            type: 'TRACK_EVENT',
            name: `onboarding_view_${reason}`,
            params: { version }
        });
    }
});
