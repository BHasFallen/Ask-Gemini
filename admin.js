/**
 * Ask Gemini — Mobile-First Admin Control Panel Controller
 * Handles real-time Remote Config state management, live banner previewing,
 * user overrides CRUD, export/import, and 1-tap GitHub Gist API publishing.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── Owned State ─────────────────────────────────────────────────────────────
    let configState = {
        version: "1.0.0",
        last_updated: new Date().toISOString(),
        flags: {
            smart_paste_enabled: true,
            paste_analytics_enabled: true,
            quota_scraper_enabled: true,
            toc_enabled: true,
            rating_prompt_enabled: true,
            feature_banner_enabled: true
        },
        smart_paste: {
            trigger_threshold_chars: 20000,
            enabled_types: ["json", "csv", "html", "javascript", "python", "markdown", "plaintext"],
            log_pasted_text: false
        },
        quote_reply: {
            log_quoted_text: false
        },
        max_text_length: 0,
        rating: {
            initial_active_days: 3,
            initial_reply_count: 3,
            post_update_buffer: 5,
            cooldown_active_days: 7,
            cooldown_reply_count: 10,
            review_url: "https://chromewebstore.google.com/detail/jhkodgigeemnmdmdikdkpcbmgbbopgni/reviews",
            feedback_form_url: "https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform"
        },
        feature_banner: {
            active: true,
            id: "multi_quote_v1",
            title: "New: Quote multiple excerpts",
            description: "Highlight text, then keep highlighting more — look for the '+ Add Quote' button to build a multi-quote reply.",
            primary_text: "Try it",
            secondary_text: "Later",
            cta_action: "start_tour"
        },
        user_overrides: {}
    };

    // ── Tab Navigation ──────────────────────────────────────────────────────────
    const tabs = document.querySelectorAll('.nav-tab');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.getAttribute('data-target');
            const targetPane = document.getElementById(target);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // ── Read Inputs & Update State ──────────────────────────────────────────────
    function updateStateFromUI() {
        // Flags
        configState.flags.smart_paste_enabled = document.getElementById('flag-smart-paste').checked;
        configState.flags.paste_analytics_enabled = document.getElementById('flag-paste-analytics').checked;
        configState.flags.toc_enabled = document.getElementById('flag-toc').checked;
        configState.flags.quota_scraper_enabled = document.getElementById('flag-quota').checked;
        configState.flags.rating_prompt_enabled = document.getElementById('flag-rating').checked;
        configState.flags.feature_banner_enabled = document.getElementById('flag-banner').checked;

        // Smart Paste
        configState.smart_paste.trigger_threshold_chars = parseInt(document.getElementById('input-sp-threshold').value);
        
        const enabledTypes = [];
        document.querySelectorAll('.chip-checkbox input:checked').forEach(cb => {
            enabledTypes.push(cb.value);
        });
        configState.smart_paste.enabled_types = enabledTypes;
        configState.smart_paste.log_pasted_text = document.getElementById('log-pasted-text').checked;

        // Quote Reply & Telemetry
        configState.quote_reply.log_quoted_text = document.getElementById('log-quoted-text').checked;
        configState.max_text_length = parseInt(document.getElementById('input-max-text-len').value) || 0;

        // Feature Banner Buttons & Actions
        const showPrimaryEl = document.getElementById('banner-show-primary');
        const showSecondaryEl = document.getElementById('banner-show-secondary');

        const showPrimary = showPrimaryEl ? showPrimaryEl.checked : true;
        const primaryAction = document.getElementById('banner-primary-action').value;
        const primaryUrl = document.getElementById('banner-primary-url').value.trim();

        const showSecondary = showSecondaryEl ? showSecondaryEl.checked : true;
        const secondaryAction = document.getElementById('banner-secondary-action').value;
        const secondaryUrl = document.getElementById('banner-secondary-url').value.trim();

        // Toggle URL input visibility
        document.getElementById('group-primary-url').style.display = (showPrimary && primaryAction === 'open_url') ? 'block' : 'none';
        document.getElementById('group-secondary-url').style.display = (showSecondary && secondaryAction === 'open_url') ? 'block' : 'none';

        configState.feature_banner = {
            active: document.getElementById('banner-active').checked,
            id: document.getElementById('banner-id').value,
            title: document.getElementById('banner-title').value,
            description: document.getElementById('banner-desc').value,
            show_primary: showPrimary,
            primary_text: document.getElementById('banner-primary').value,
            primary_action: primaryAction,
            primary_url: primaryUrl,
            show_secondary: showSecondary,
            secondary_text: document.getElementById('banner-secondary').value,
            secondary_action: secondaryAction,
            secondary_url: secondaryUrl
        };

        // Rating
        configState.rating.initial_active_days = parseInt(document.getElementById('rating-days').value) || 3;
        configState.rating.initial_reply_count = parseInt(document.getElementById('rating-replies').value) || 3;
        configState.rating.cooldown_active_days = parseInt(document.getElementById('rating-cooldown-days').value) || 7;
        configState.rating.cooldown_reply_count = parseInt(document.getElementById('rating-cooldown-replies').value) || 10;
        configState.rating.review_url = document.getElementById('rating-review-url').value;
        configState.rating.feedback_form_url = document.getElementById('rating-feedback-url').value;

        configState.last_updated = new Date().toISOString();

        // Update JSON output & live banner preview
        renderJSONOutput();
        renderLiveBannerPreview();
    }

    // ── Live Banner Preview Sync ────────────────────────────────────────────────
    function renderLiveBannerPreview() {
        document.getElementById('prev-banner-title').textContent = configState.feature_banner.title || 'Feature Title';
        document.getElementById('prev-banner-desc').textContent = configState.feature_banner.description || 'Feature Description';
        
        const prevPrimaryBtn = document.getElementById('prev-banner-primary');
        const prevSecondaryBtn = document.getElementById('prev-banner-secondary');

        if (configState.feature_banner.show_primary) {
            prevPrimaryBtn.style.display = 'inline-block';
            let label = configState.feature_banner.primary_text || 'Try it';
            if (configState.feature_banner.primary_action === 'open_url') label += ' 🔗';
            prevPrimaryBtn.textContent = label;
        } else {
            prevPrimaryBtn.style.display = 'none';
        }

        if (configState.feature_banner.show_secondary) {
            prevSecondaryBtn.style.display = 'inline-block';
            let label = configState.feature_banner.secondary_text || 'Later';
            if (configState.feature_banner.secondary_action === 'open_url') label += ' 🔗';
            prevSecondaryBtn.textContent = label;
        } else {
            prevSecondaryBtn.style.display = 'none';
        }
    }

    // ── Render JSON Output ──────────────────────────────────────────────────────
    function renderJSONOutput() {
        const rawJsonEl = document.getElementById('raw-json-output');
        if (rawJsonEl) {
            rawJsonEl.value = JSON.stringify(configState, null, 2);
        }
    }

    // ── Attach Input Event Listeners for Realtime Sync ──────────────────────────
    const inputsToWatch = document.querySelectorAll('input, textarea, select');
    inputsToWatch.forEach(input => {
        input.addEventListener('input', updateStateFromUI);
        input.addEventListener('change', updateStateFromUI);
    });

    // Banner ID auto-generator
    document.getElementById('btn-gen-banner-id').addEventListener('click', () => {
        const newId = 'banner_' + Date.now().toString(36);
        document.getElementById('banner-id').value = newId;
        updateStateFromUI();
        showToast(`Generated new Feature ID: ${newId}`, "success");
    });

    // ── Per-User Overrides Visual Form Manager ──────────────────────────────────
    const btnSaveUserOverride = document.getElementById('btn-save-user-override');
    const userOverrideDeviceId = document.getElementById('override-device-id');
    const userFetchStatus = document.getElementById('override-fetch-status');
    const userOverridesList = document.getElementById('user-overrides-list');

    // Auto-fetch existing user settings baseline as user types ID
    userOverrideDeviceId.addEventListener('input', () => {
        const id = userOverrideDeviceId.value.trim();
        if (!id) {
            userFetchStatus.textContent = "Defaults pre-filled. Enter ID to edit custom settings.";
            resetUserOverrideVisualControls();
            return;
        }

        const existing = configState.user_overrides[id];
        if (existing) {
            userFetchStatus.textContent = `⚡ Found existing custom override for "${id}". Controls loaded below.`;
            loadUserOverrideIntoVisualControls(existing);
        } else {
            userFetchStatus.textContent = `✨ New User "${id}". Default global baseline pre-filled below.`;
            resetUserOverrideVisualControls();
        }
    });

    function resetUserOverrideVisualControls() {
        document.getElementById('user-sp-enabled').value = 'inherit';
        document.getElementById('user-sp-behavior').value = 'inherit';
        document.getElementById('user-log-pasted').value = 'inherit';
        document.getElementById('user-log-quoted').value = 'inherit';
        document.getElementById('user-mq-enabled').value = 'inherit';
        document.getElementById('user-mq-style').value = 'inherit';
        document.getElementById('user-toc-enabled').value = 'inherit';
        document.getElementById('user-quota-enabled').value = 'inherit';
        document.getElementById('user-analytics-enabled').value = 'inherit';
        document.getElementById('user-rating-enabled').value = 'inherit';
        document.getElementById('user-banner-enabled').value = 'inherit';
        document.getElementById('user-max-text-len').value = 'inherit';
    }

    function loadUserOverrideIntoVisualControls(overrideObj) {
        resetUserOverrideVisualControls();
        if (!overrideObj) return;

        if (overrideObj.flags) {
            if (overrideObj.flags.smart_paste_enabled !== undefined) document.getElementById('user-sp-enabled').value = String(overrideObj.flags.smart_paste_enabled);
            if (overrideObj.flags.toc_enabled !== undefined) document.getElementById('user-toc-enabled').value = String(overrideObj.flags.toc_enabled);
            if (overrideObj.flags.multi_quote_enabled !== undefined) document.getElementById('user-mq-enabled').value = String(overrideObj.flags.multi_quote_enabled);
            if (overrideObj.flags.quota_scraper_enabled !== undefined) document.getElementById('user-quota-enabled').value = String(overrideObj.flags.quota_scraper_enabled);
            if (overrideObj.flags.paste_analytics_enabled !== undefined) document.getElementById('user-analytics-enabled').value = String(overrideObj.flags.paste_analytics_enabled);
            if (overrideObj.flags.rating_prompt_enabled !== undefined) document.getElementById('user-rating-enabled').value = String(overrideObj.flags.rating_prompt_enabled);
            if (overrideObj.flags.feature_banner_enabled !== undefined) document.getElementById('user-banner-enabled').value = String(overrideObj.flags.feature_banner_enabled);
        }

        if (overrideObj.smart_paste) {
            if (overrideObj.smart_paste.behavior) document.getElementById('user-sp-behavior').value = overrideObj.smart_paste.behavior;
            if (overrideObj.smart_paste.log_pasted_text !== undefined) document.getElementById('user-log-pasted').value = String(overrideObj.smart_paste.log_pasted_text);
        }

        if (overrideObj.quote_reply) {
            if (overrideObj.quote_reply.log_quoted_text !== undefined) document.getElementById('user-log-quoted').value = String(overrideObj.quote_reply.log_quoted_text);
            if (overrideObj.quote_reply.style) document.getElementById('user-mq-style').value = overrideObj.quote_reply.style;
        }

        if (overrideObj.max_text_length !== undefined) {
            document.getElementById('user-max-text-len').value = String(overrideObj.max_text_length);
        }
    }

    btnSaveUserOverride.addEventListener('click', () => {
        const devId = userOverrideDeviceId.value.trim();
        if (!devId) {
            showToast("Please enter a Device ID or Email", "danger");
            return;
        }

        const spEnabledVal = document.getElementById('user-sp-enabled').value;
        const spBehaviorVal = document.getElementById('user-sp-behavior').value;
        const logPastedVal = document.getElementById('user-log-pasted').value;
        const logQuotedVal = document.getElementById('user-log-quoted').value;
        const mqEnabledVal = document.getElementById('user-mq-enabled').value;
        const mqStyleVal = document.getElementById('user-mq-style').value;
        const tocEnabledVal = document.getElementById('user-toc-enabled').value;
        const quotaEnabledVal = document.getElementById('user-quota-enabled').value;
        const analyticsEnabledVal = document.getElementById('user-analytics-enabled').value;
        const ratingEnabledVal = document.getElementById('user-rating-enabled').value;
        const bannerEnabledVal = document.getElementById('user-banner-enabled').value;
        const maxTextLenVal = document.getElementById('user-max-text-len').value;

        const overrideObj = {};

        // Build flags block
        if (spEnabledVal !== 'inherit' || tocEnabledVal !== 'inherit' || mqEnabledVal !== 'inherit' || quotaEnabledVal !== 'inherit' || analyticsEnabledVal !== 'inherit' || ratingEnabledVal !== 'inherit' || bannerEnabledVal !== 'inherit') {
            overrideObj.flags = {};
            if (spEnabledVal !== 'inherit') overrideObj.flags.smart_paste_enabled = (spEnabledVal === 'true');
            if (tocEnabledVal !== 'inherit') overrideObj.flags.toc_enabled = (tocEnabledVal === 'true');
            if (mqEnabledVal !== 'inherit') overrideObj.flags.multi_quote_enabled = (mqEnabledVal === 'true');
            if (quotaEnabledVal !== 'inherit') overrideObj.flags.quota_scraper_enabled = (quotaEnabledVal === 'true');
            if (analyticsEnabledVal !== 'inherit') overrideObj.flags.paste_analytics_enabled = (analyticsEnabledVal === 'true');
            if (ratingEnabledVal !== 'inherit') overrideObj.flags.rating_prompt_enabled = (ratingEnabledVal === 'true');
            if (bannerEnabledVal !== 'inherit') overrideObj.flags.feature_banner_enabled = (bannerEnabledVal === 'true');
        }

        // Build smart_paste block
        if (spBehaviorVal !== 'inherit' || logPastedVal !== 'inherit') {
            overrideObj.smart_paste = {};
            if (spBehaviorVal !== 'inherit') overrideObj.smart_paste.behavior = spBehaviorVal;
            if (logPastedVal !== 'inherit') overrideObj.smart_paste.log_pasted_text = (logPastedVal === 'true');
        }

        // Build quote_reply block
        if (logQuotedVal !== 'inherit' || mqStyleVal !== 'inherit') {
            overrideObj.quote_reply = {};
            if (logQuotedVal !== 'inherit') overrideObj.quote_reply.log_quoted_text = (logQuotedVal === 'true');
            if (mqStyleVal !== 'inherit') overrideObj.quote_reply.style = mqStyleVal;
        }

        // Build max_text_length
        if (maxTextLenVal !== 'inherit') {
            overrideObj.max_text_length = parseInt(maxTextLenVal);
        }

        configState.user_overrides[devId] = overrideObj;
        userOverrideDeviceId.value = '';
        userFetchStatus.textContent = "Defaults pre-filled. Enter ID to edit custom settings.";
        resetUserOverrideVisualControls();

        renderUserOverridesList();
        updateStateFromUI();
        showToast(`Saved visual override for ${devId}`, "success");
    });

    function renderUserOverridesList() {
        userOverridesList.innerHTML = '';
        const devIds = Object.keys(configState.user_overrides);

        if (devIds.length === 0) {
            userOverridesList.innerHTML = '<div class="empty-state">No per-user overrides configured yet.</div>';
            return;
        }

        devIds.forEach(id => {
            const override = configState.user_overrides[id] || {};
            const badgesHtml = generateUserBadgesHtml(override);

            const item = document.createElement('div');
            item.className = 'user-item';
            item.innerHTML = `
                <div class="user-item-content">
                    <span class="user-id-tag">${escapeHtml(id)}</span>
                    <div class="user-item-badges">${badgesHtml}</div>
                </div>
                <div class="user-actions">
                    <button type="button" class="btn-icon-del" title="Delete Override" data-id="${escapeHtml(id)}">&times;</button>
                </div>
            `;
            userOverridesList.appendChild(item);

            item.querySelector('.btn-icon-del').addEventListener('click', () => {
                delete configState.user_overrides[id];
                renderUserOverridesList();
                updateStateFromUI();
                showToast(`Removed override for ${id}`, "success");
            });
        });
    }

    function generateUserBadgesHtml(override) {
        const badges = [];
        if (override.flags) {
            if (override.flags.smart_paste_enabled !== undefined) badges.push(`<span class="badge-pill active">Smart Paste: ${override.flags.smart_paste_enabled ? 'ON' : 'OFF'}</span>`);
            if (override.flags.toc_enabled !== undefined) badges.push(`<span class="badge-pill active">TOC: ${override.flags.toc_enabled ? 'ON' : 'OFF'}</span>`);
            if (override.flags.multi_quote_enabled !== undefined) badges.push(`<span class="badge-pill active">Multi Quote: ${override.flags.multi_quote_enabled ? 'ON' : 'OFF'}</span>`);
            if (override.flags.quota_scraper_enabled !== undefined) badges.push(`<span class="badge-pill active">Quota View: ${override.flags.quota_scraper_enabled ? 'ON' : 'OFF'}</span>`);
            if (override.flags.paste_analytics_enabled !== undefined) badges.push(`<span class="badge-pill active">Analytics: ${override.flags.paste_analytics_enabled ? 'ON' : 'OFF'}</span>`);
            if (override.flags.rating_prompt_enabled !== undefined) badges.push(`<span class="badge-pill active">Rating: ${override.flags.rating_prompt_enabled ? 'ON' : 'OFF'}</span>`);
            if (override.flags.feature_banner_enabled !== undefined) badges.push(`<span class="badge-pill active">Banner: ${override.flags.feature_banner_enabled ? 'ON' : 'OFF'}</span>`);
        }
        if (override.smart_paste) {
            if (override.smart_paste.behavior) badges.push(`<span class="badge-pill active">Behavior: ${override.smart_paste.behavior.toUpperCase()}</span>`);
            if (override.smart_paste.log_pasted_text !== undefined) badges.push(`<span class="badge-pill active">Log Pasted: ${override.smart_paste.log_pasted_text ? 'YES' : 'NO'}</span>`);
        }
        if (override.quote_reply) {
            if (override.quote_reply.log_quoted_text !== undefined) badges.push(`<span class="badge-pill active">Log Quoted: ${override.quote_reply.log_quoted_text ? 'YES' : 'NO'}</span>`);
            if (override.quote_reply.style) badges.push(`<span class="badge-pill active">MQ Style: ${override.quote_reply.style.toUpperCase()}</span>`);
        }
        if (override.max_text_length !== undefined) {
            badges.push(`<span class="badge-pill active">Max Log Len: ${override.max_text_length === 0 ? 'UNLIMITED (Chunking)' : override.max_text_length}</span>`);
        }

        if (badges.length === 0) return '<span class="badge-pill">Global Defaults</span>';
        return badges.join('');
    }

    // User Override Presets
    document.getElementById('preset-force-debug').addEventListener('click', () => {
        document.getElementById('user-log-pasted').value = 'true';
        document.getElementById('user-log-quoted').value = 'true';
        showToast("Loaded Preset: Force Debug Logging", "success");
    });

    document.getElementById('preset-block-user').addEventListener('click', () => {
        document.getElementById('user-sp-enabled').value = 'false';
        document.getElementById('user-sp-behavior').value = 'off';
        document.getElementById('user-toc-enabled').value = 'false';
        showToast("Loaded Preset: Lockdown User", "danger");
    });

    document.getElementById('preset-reset-user').addEventListener('click', () => {
        resetUserOverrideVisualControls();
        showToast("Reset controls to baseline defaults", "success");
    });

    // ── Emergency Master Lockdown Switch ────────────────────────────────────────
    document.getElementById('btn-emergency').addEventListener('click', () => {
        const isAlreadyOff = Object.values(configState.flags).every(v => v === false);
        const nextState = isAlreadyOff ? true : false;

        Object.keys(configState.flags).forEach(k => {
            configState.flags[k] = nextState;
        });

        // Sync switches
        document.getElementById('flag-smart-paste').checked = nextState;
        document.getElementById('flag-paste-analytics').checked = nextState;
        document.getElementById('flag-toc').checked = nextState;
        document.getElementById('flag-quota').checked = nextState;
        document.getElementById('flag-rating').checked = nextState;
        document.getElementById('flag-banner').checked = nextState;

        updateStateFromUI();

        if (nextState === false) {
            showToast("🚨 EMERGENCY LOCKDOWN ACTIVATED! All flags set to false.", "danger");
        } else {
            showToast("✅ Emergency lockdown cleared. Flags restored.", "success");
        }
    });

    // ── Local Storage Sync for Gist Credentials ─────────────────────────────────
    const gistTokenInput = document.getElementById('gist-token');
    const gistIdInput = document.getElementById('gist-id');

    gistTokenInput.value = localStorage.getItem('ag_gist_token') || '';
    gistIdInput.value = localStorage.getItem('ag_gist_id') || 'fcb206ffdca44bd3e5d2099de4c81636';

    gistTokenInput.addEventListener('change', () => {
        localStorage.setItem('ag_gist_token', gistTokenInput.value.trim());
    });
    gistIdInput.addEventListener('change', () => {
        localStorage.setItem('ag_gist_id', gistIdInput.value.trim());
    });

    // ── GitHub Gist 1-Tap Publish Live API Call ─────────────────────────────────
    async function publishToGist() {
        const token = localStorage.getItem('ag_gist_token') || gistTokenInput.value.trim();
        const gistId = localStorage.getItem('ag_gist_id') || gistIdInput.value.trim();

        if (!token || !gistId) {
            showToast("Enter GitHub PAT Token & Gist ID under Sync tab first", "danger");
            const syncTab = document.querySelector('[data-target="tab-publish"]');
            if (syncTab) syncTab.click();
            return;
        }

        // Auto-bump banner ID if it's still default or unmodified
        const currentBannerId = document.getElementById('banner-id').value.trim();
        if (!currentBannerId || currentBannerId === 'banner_v1' || currentBannerId === 'multi_quote_v1') {
            const freshId = 'banner_' + Date.now().toString(36);
            document.getElementById('banner-id').value = freshId;
        }

        updateStateFromUI();
        showToast("Publishing to GitHub Gist...", "success");

        try {
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        "remote_config.json": {
                            content: JSON.stringify(configState, null, 2)
                        }
                    }
                })
            });

            if (response.ok) {
                showToast("🚀 PUBLISHED LIVE! Config pushed to GitHub Gist.", "success");
            } else {
                const errData = await response.json();
                showToast(`GitHub API Error: ${errData.message || response.status}`, "danger");
            }
        } catch (err) {
            showToast(`Network Error: ${err.message}`, "danger");
        }
    }

    document.getElementById('btn-sync-gist').addEventListener('click', publishToGist);
    document.getElementById('btn-quick-publish').addEventListener('click', publishToGist);

    // ── Copy JSON & Export Preset ───────────────────────────────────────────────
    document.getElementById('btn-copy-json').addEventListener('click', () => {
        const rawJsonEl = document.getElementById('raw-json-output');
        navigator.clipboard.writeText(rawJsonEl.value).then(() => {
            showToast("Copied raw JSON to clipboard!", "success");
        });
    });

    document.getElementById('btn-export-preset').addEventListener('click', () => {
        updateStateFromUI();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(configState, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "ask_gemini_remote_config.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast("Exported remote_config.json file", "success");
    });

    // ── Toast Helper ─────────────────────────────────────────────────────────────
    function showToast(msg, type = "success") {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3500);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Initial render
    updateStateFromUI();
});
