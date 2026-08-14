/**
 * Ask Gemini: Core Engine & Boot
 * Loads LAST after quote-reply.js, smart-paste.js, toc.js, rating-banner.js.
 * Defines constants, CSS, core helpers, quota display, event listeners, and boot sequence.
 */

window.AskGemini = window.AskGemini || {};

// ─── Constants ────────────────────────────────────────────────────────────────
const BTN_ID = "ask-gemini-float-btn";
const CHIP_ID = "ask-gemini-context-box";
window.AskGemini.BTN_ID = BTN_ID;
window.AskGemini.CHIP_ID = CHIP_ID;

// ─── Inject CSS ───────────────────────────────────────────────────────────────
(function() {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = "\n    :root, body {\n        --ag-primary: #3d5afe;\n        --ag-primary-hover: #4d6aff;\n        --ag-bg: #2d2e30;\n        --ag-bg-hover: #3a3b3d;\n        --ag-text: #ffffff;\n        --ag-text-dim: #9aa0a6;\n        --ag-border: rgba(255, 255, 255, 0.1);\n        --ag-bubble-bg: #37393b;\n        --ag-bubble-text: #ececec;\n        --ag-shadow: rgba(0, 0, 0, 0.4);\n    }\n    body.light-theme {\n        --ag-primary: #1a73e8;\n        --ag-primary-hover: #1557b0;\n        --ag-bg: #f8f9fa;\n        --ag-bg-hover: #f1f3f4;\n        --ag-text: #202124;\n        --ag-text-dim: #5f6368;\n        --ag-border: #dadce0;\n        --ag-bubble-bg: #f1f3f4;\n        --ag-bubble-text: #3c4043;\n        --ag-shadow: rgba(60, 64, 67, 0.1);\n    }\n    #ask-gemini-float-btn {\n        position: fixed; display: none; align-items: center; justify-content: center;\n        gap: 10px; padding: 8px 18px;\n        background: var(--ag-bg) !important;\n        border: 1px solid var(--ag-border) !important;\n        border-radius: 100px !important; color: var(--ag-text) !important;\n        font-size: 14px; font-weight: 600; cursor: pointer; z-index: 999999;\n        box-shadow: 0 4px 20px var(--ag-shadow) !important;\n        backdrop-filter: blur(10px);\n        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);\n        animation: ag-pop-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n    }\n    #ask-gemini-float-btn span { display: flex; align-items: center; gap: 8px; pointer-events: none; }\n    @keyframes ag-pop-in { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }\n    #ask-gemini-float-btn:hover { background: var(--ag-bg-hover) !important; border-color: var(--ag-primary) !important; transform: translateY(-2px); box-shadow: 0 6px 25px var(--ag-shadow) !important; }\n    #ask-gemini-float-btn svg { color: var(--ag-primary); width: 16px; height: 16px; }\n    #ask-gemini-context-box { background-color: var(--ag-bg) !important; border-bottom: 1px solid var(--ag-border) !important; border-radius: 28px 28px 0 0 !important; }\n    .ask-gemini-draft-content { color: var(--ag-text-dim) !important; }\n    .ask-gemini-message-bubble { background-color: var(--ag-bubble-bg) !important; color: var(--ag-bubble-text) !important; border-radius: 28px !important; }\n    .ask-gemini-reply-preview { color: var(--ag-text-dim) !important; }\n    .ask-gemini-reply-preview:hover { color: var(--ag-text) !important; }\n    .ag-rating-modal {\n        position: fixed; top: 76px; right: 24px; width: 280px;\n        background: rgba(45, 46, 48, 0.85) !important;\n        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);\n        border: 1px solid rgba(255, 255, 255, 0.08) !important;\n        border-radius: 20px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35) !important;\n        padding: 20px; z-index: 9999999; display: flex; flex-direction: column; gap: 12px;\n        animation: ag-slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1);\n    }\n    .ag-rating-stars-container { display: flex; justify-content: center; gap: 10px; margin: 4px 0 2px 0; }\n    .ag-star-btn { background: transparent !important; border: none !important; cursor: pointer; padding: 2px !important; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: flex; align-items: center; justify-content: center; }\n    .ag-star-btn:hover { transform: scale(1.2); }\n    .ag-star { width: 28px; height: 28px; color: var(--ag-text-dim); fill: none; transition: all 0.2s; }\n    .ag-star-btn.hovered .ag-star, .ag-star-btn.selected .ag-star { color: #ffb300 !important; fill: #ffb300 !important; }\n    .ag-rating-modal::before { content: ''; position: absolute; top: 0; left: 24px; right: 24px; height: 3px; background: linear-gradient(90deg, #3d5afe, #651fff); border-radius: 0 0 100px 100px; }\n    body.light-theme .ag-rating-modal { background: rgba(248, 249, 250, 0.85) !important; border: 1px solid rgba(0, 0, 0, 0.08) !important; box-shadow: 0 16px 48px rgba(60, 64, 67, 0.15) !important; }\n    @keyframes ag-slide-in-right { from { transform: translateX(50px) scale(0.95); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }\n    @keyframes ag-slide-up { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }\n    @media (max-width: 768px) { .ag-rating-modal { top: auto; bottom: 24px; right: 24px; left: 24px; width: auto; animation: ag-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); } }\n    .ag-rating-title { font-size: 18px; font-weight: 600; color: var(--ag-text); margin: 0; }\n    .ag-rating-text { font-size: 14px; color: var(--ag-text-dim); margin: 0; line-height: 1.5; }\n    .ag-rating-buttons { display: flex; gap: 10px; margin-top: 8px; }\n    .ag-rating-btn { flex: 1; padding: 10px; border-radius: 12px; border: 1px solid var(--ag-border); background: var(--ag-bubble-bg); color: var(--ag-text); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }\n    .ag-rating-btn:hover { background: var(--ag-bg-hover); transform: translateY(-2px); box-shadow: 0 4px 12px var(--ag-shadow); }\n    .ag-rating-btn-primary { background: linear-gradient(135deg, #3d5afe, #651fff) !important; color: white !important; border: none !important; }\n    .ag-rating-btn-primary:hover { background: linear-gradient(135deg, #4d6aff, #7530ff) !important; box-shadow: 0 6px 16px rgba(61, 90, 254, 0.4) !important; }\n    .ag-rating-close { position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: var(--ag-text-dim); cursor: pointer; padding: 4px; border-radius: 50%; transition: all 0.2s; }\n    .ag-rating-close:hover { background: var(--ag-bg-hover); color: var(--ag-text); }\n    .ql-editor::before { transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out !important; opacity: 1; }\n    .ql-editor.ag-placeholder-fade-out::before { opacity: 0 !important; transform: translateY(4px) !important; }\n    .ql-editor.ag-placeholder-fade-in::before { opacity: 0 !important; transform: translateY(-4px) !important; }\n    @keyframes ag-text-highlight-blink-anim { 0% { background-color: transparent; } 15% { background-color: rgba(61, 90, 254, 0.35); } 85% { background-color: rgba(61, 90, 254, 0.35); } 100% { background-color: transparent; } }\n    .ag-text-highlight-blink { animation: ag-text-highlight-blink-anim 2s ease-in-out; border-radius: 2px; padding: 2px 0; display: inline; }\n    .ag-feature-banner { position: fixed; top: 76px; right: 24px; width: 340px; background: rgba(45, 46, 48, 0.85) !important; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08) !important; border-radius: 20px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35) !important; padding: 20px; z-index: 9999999; display: flex; flex-direction: column; gap: 16px; font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif; animation: ag-slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1); box-sizing: border-box; }\n    body.light-theme .ag-feature-banner { background: rgba(248, 249, 250, 0.85) !important; border: 1px solid rgba(0, 0, 0, 0.08) !important; box-shadow: 0 16px 48px rgba(60, 64, 67, 0.15) !important; }\n    .ag-feature-banner.slide-out { animation: ag-slide-out-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }\n    .ag-feature-banner .banner-top { display: flex; flex-direction: column; }\n    .ag-feature-banner .text-container { display: flex; flex-direction: column; gap: 6px; }\n    .ag-feature-banner .banner-title { font-size: 16px; font-weight: 600; color: var(--ag-text) !important; margin: 0; line-height: 1.4; }\n    .ag-feature-banner .body-text { font-size: 13.5px; color: var(--ag-text-dim) !important; line-height: 1.5; margin: 0; }\n    .ag-feature-banner .actions-container { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }\n    .ag-feature-banner .banner-btn-secondary { background: transparent !important; border: none !important; color: var(--ag-text) !important; padding: 8px 16px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background-color 0.2s, color 0.2s; font-family: inherit; }\n    .ag-feature-banner .banner-btn-secondary:hover { background-color: var(--ag-bg-hover) !important; }\n    .ag-feature-banner .banner-btn-primary { background: var(--ag-primary, #3d5afe) !important; color: #ffffff !important; border: none !important; padding: 8px 20px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s; font-family: inherit; }\n    .ag-feature-banner .banner-btn-primary:hover { background: var(--ag-primary-hover, #4d6aff) !important; box-shadow: 0 4px 12px rgba(61, 90, 254, 0.3) !important; }\n    .ag-feature-banner .banner-btn-primary:active { transform: scale(0.98); }\n    @keyframes ag-slide-out-right { from { transform: translateX(0) scale(1); opacity: 1; } to { transform: translateX(50px) scale(0.95); opacity: 0; } }\n    @media (max-width: 768px) { .ag-feature-banner { top: auto; bottom: 24px; right: 24px; left: 24px; width: auto; animation: ag-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); } }\n";
    document.head.appendChild(styleSheet);
})();

// ─── ICONS ────────────────────────────────────────────────────────────────────
window.AskGemini.ICONS = {
    ask: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
    reply: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ag-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
};

// ─── Remaining Core State ─────────────────────────────────────────────────────
window.AskGemini.usageLimitsEnabled = true;
window.AskGemini.isFreeUser = false;
window.AskGemini.wasGenerating = false;
window.AskGemini.lastRefreshTime = 0;

// ─── findInputArea ────────────────────────────────────────────────────────────
window.AskGemini.findInputArea = function findInputArea() {
    return document.querySelector('.ql-editor[contenteditable="true"]')
        || document.querySelector('div[contenteditable="true"][aria-label*="rompt"]')
        || document.querySelector('div[contenteditable="true"][role="textbox"]')
        || document.querySelector('div[contenteditable="true"]');
};

// ─── findSendButton ───────────────────────────────────────────────────────────
window.AskGemini.findSendButton = function findSendButton() {
    return document.querySelector('button[aria-label="Send message"]')
        || document.querySelector('button[aria-label*="Send"]')
        || document.querySelector('button.send-button')
        || document.querySelector('button[data-test-id*="send"]');
};

// ─── updateUserProfile ────────────────────────────────────────────────────────
window.AskGemini.updateUserProfile = async function updateUserProfile() {
    const meta = document.querySelector('meta[name="og-profile-acct"]');
    let email = meta ? meta.getAttribute('content') : null;
    const profileLink = document.querySelector('a[aria-label*="Google Account"]');
    let name = null;
    if (profileLink) {
        const ariaLabel = profileLink.getAttribute('aria-label') || "";
        const nameMatch = ariaLabel.match(/Google Account:\s*([^\n\(\r]+)/i);
        if (nameMatch && nameMatch[1]) name = nameMatch[1].trim();
        if (!email) {
            const emailMatch = ariaLabel.match(/\(([^)]+)\)/);
            if (emailMatch && emailMatch[1]) email = emailMatch[1].trim();
        }
    }
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const normalizedName = name ? name.trim() : null;
    const res = await chrome.storage.local.get(['user_email', 'user_name']);
    const updates = {};
    if (normalizedEmail && res.user_email !== normalizedEmail) updates.user_email = normalizedEmail;
    if (normalizedName && res.user_name !== normalizedName) updates.user_name = normalizedName;
    if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
};

// ─── incrementSessionVisits ───────────────────────────────────────────────────
window.AskGemini.incrementSessionVisits = async function incrementSessionVisits() {
    const key = 'gemini_visits_since_last_reply';
    const res = await chrome.storage.local.get([key]);
    const current = res[key] || 0;
    await chrome.storage.local.set({ [key]: current + 1 });
};

// ─── animatePlaceholderChange ─────────────────────────────────────────────────
window.AskGemini.animatePlaceholderChange = function animatePlaceholderChange(input, newPlaceholder) {
    if (input.getAttribute('data-placeholder') === newPlaceholder) return;
    input.classList.add('ag-placeholder-fade-out');
    setTimeout(() => {
        input.setAttribute('data-placeholder', newPlaceholder);
        input.classList.remove('ag-placeholder-fade-out');
        input.classList.add('ag-placeholder-fade-in');
        setTimeout(() => { input.classList.remove('ag-placeholder-fade-in'); }, 150);
    }, 150);
};

// ─── trackEvent ───────────────────────────────────────────────────────────────
window.AskGemini.trackEvent = function trackEvent(name, params) {
    console.log('🏰 [AskGemini] Sending event to background:', name, params);
    chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name, params }, () => {
        if (chrome.runtime.lastError) {
            console.warn('🏰 [AskGemini] Event send error:', chrome.runtime.lastError.message);
        }
    });
};

// ─── evaluateRetentionTip ─────────────────────────────────────────────────────
window.AskGemini.evaluateRetentionTip = async function evaluateRetentionTip() {
    var AG = window.AskGemini;
    const input = AG.findInputArea();
    if (!input) return;
    const oldTip = document.getElementById('ag-retention-tip');
    if (oldTip) oldTip.remove();
    const res = await chrome.storage.local.get([
        'reply_count_lifetime', 'last_reply_time', 'gemini_visits_since_last_reply'
    ]);
    const replyCount = res.reply_count_lifetime || 0;
    const lastReplyTime = res.last_reply_time || 0;
    const visits = res.gemini_visits_since_last_reply || 0;
    let shouldShow = false;
    if (replyCount < 5) {
        shouldShow = true;
    } else {
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if ((Date.now() - lastReplyTime) > sevenDays && visits >= 2) shouldShow = true;
    }
    const currentText = input.innerText || "";
    const isInputEmpty = currentText.trim().length === 0;
    if (!isInputEmpty) shouldShow = false;
    const replyElement = document.querySelector('.model-response, .message-content, .markdown-main-panel, message-content');
    const hasReply = !!(replyElement && replyElement.textContent.trim().length > 0);
    if (!hasReply && AG.currentContexts.length === 0) shouldShow = false;
    const originalPlaceholder = input.getAttribute('data-placeholder');
    if (originalPlaceholder
        && originalPlaceholder !== "Highlight any text to quote-reply."
        && originalPlaceholder !== "Highlight another passage to add a 2nd quote..."
        && !input.hasAttribute('data-ag-original-placeholder')) {
        input.setAttribute('data-ag-original-placeholder', originalPlaceholder);
    }
    const basePlaceholder = input.getAttribute('data-ag-original-placeholder') || 'Ask Gemini';
    let targetPlaceholder = basePlaceholder;
    if (AG.currentContexts.length > 0 && AG.multiQuoteEnabled && isInputEmpty) {
        targetPlaceholder = "Highlight another passage to add a 2nd quote...";
    } else if (shouldShow && !AG.isTipTemporarilyDismissed && isInputEmpty) {
        targetPlaceholder = "Highlight any text to quote-reply.";
    }
    if (input.getAttribute('data-placeholder') !== targetPlaceholder) {
        AG.animatePlaceholderChange(input, targetPlaceholder);
        if (targetPlaceholder === "Highlight any text to quote-reply.") {
            if (AG.retentionTipTimeout) clearTimeout(AG.retentionTipTimeout);
            AG.retentionTipTimeout = setTimeout(() => {
                AG.isTipTemporarilyDismissed = true;
                AG.evaluateRetentionTip().catch(console.error);
            }, 6000);
        } else {
            if (AG.retentionTipTimeout) { clearTimeout(AG.retentionTipTimeout); AG.retentionTipTimeout = null; }
        }
    }
    if (!input.hasAttribute('data-ag-tip-listener')) {
        input.setAttribute('data-ag-tip-listener', 'true');
        input.addEventListener('input', () => { AG.evaluateRetentionTip().catch(console.error); });
    }
};

// ─── updateQuotaDisplay ───────────────────────────────────────────────────────
window.AskGemini.updateQuotaDisplay = function updateQuotaDisplay(limits) {
    var AG = window.AskGemini;
    if (!AG.usageLimitsEnabled) {
        const card = document.getElementById('ag-quota-sidebar');
        if (card) card.remove();
        return;
    }
    if (!limits) return;
    const isAdvancedDom = document.body.innerText.includes('Gemini Advanced')
        || !!document.querySelector('a[href*="/app"] svg[aria-label*="Advanced"]')
        || !!document.querySelector('a[href*="/app"] img[src*="advanced"]');
    const isPro = limits.isProUser !== false && (limits.isProUser || isAdvancedDom);
    if (!isPro) {
        AG.isFreeUser = true;
        const card = document.getElementById('ag-quota-sidebar');
        if (card) card.remove();
        return;
    }
    const currentUsage = limits.currentUsage || 0;
    const resetTime = limits.resetTime || '';
    const oldPill = document.getElementById('ag-quota-pill');
    if (oldPill) oldPill.remove();
    const oldBar = document.getElementById('ag-quota-bar');
    if (oldBar) oldBar.remove();
    const sidebarFooter = document.querySelector('.mavatar-footer-left')?.closest('div')
        || document.querySelector('.mavatar-footer-left')
        || document.querySelector('div[class*="sidebar"] footer')
        || document.querySelector('div[class*="lower-sidebar"]');
    if (sidebarFooter) {
        let card = document.getElementById('ag-quota-sidebar');
        if (!card) {
            card = document.createElement('div');
            card.id = 'ag-quota-sidebar';
            card.className = 'ag-sidebar-usage-card';
            sidebarFooter.parentNode.insertBefore(card, sidebarFooter);
        }
        const fillColor = currentUsage > 80 ? '#ea4335' : currentUsage > 50 ? '#fbbc05' : '#a8c7fa';
        card.innerHTML = `
            <div class="ag-sidebar-usage-header">
                <div class="ag-sidebar-usage-info">
                    <span>Gemini Usage</span>
                    <strong>${currentUsage}%</strong>
                </div>
                <button id="ag-quota-refresh-btn" class="ag-quota-refresh-btn" title="Refresh usage limits">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                    </svg>
                </button>
            </div>
            <div class="ag-sidebar-usage-bar">
                <div class="ag-sidebar-usage-fill" style="width:${currentUsage}%;background-color:${fillColor}"></div>
            </div>
            ${resetTime ? `<div class="ag-sidebar-usage-reset">Resets at ${resetTime}</div>` : ''}
        `;
        const isCollapsed = !!document.querySelector('button[aria-label*="Expand"]')
            || !document.querySelector('button[aria-label*="Close"]')
            || sidebarFooter.getBoundingClientRect().width < 150;
        card.style.display = isCollapsed ? 'none' : 'block';
        const refreshBtn = card.querySelector('#ag-quota-refresh-btn');
        if (refreshBtn) {
            refreshBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                refreshBtn.classList.add('spinning');
                AG.lastRefreshTime = Date.now();
                chrome.runtime.sendMessage({ type: 'FORCE_REFRESH_USAGE_LIMITS' }, (response) => {
                    setTimeout(() => {
                        refreshBtn.classList.remove('spinning');
                        if (response && response.success && response.limits) AG.updateQuotaDisplay(response.limits);
                    }, 600);
                });
            };
        }
    }
};

// ─── requestUsageLimits ───────────────────────────────────────────────────────
window.AskGemini.requestUsageLimits = function requestUsageLimits() {
    chrome.runtime.sendMessage({ type: 'GET_USAGE_LIMITS' }, (response) => {
        if (response && response.success && response.limits) {
            window.AskGemini.updateQuotaDisplay(response.limits);
        }
    });
};

// ─── checkAndInjectQuota ──────────────────────────────────────────────────────
window.AskGemini.checkAndInjectQuota = function checkAndInjectQuota() {
    var AG = window.AskGemini;
    if (AG.isFreeUser) return;
    const hasSidebar = document.getElementById('ag-quota-sidebar');
    if (!hasSidebar) {
        AG.requestUsageLimits();
    } else {
        const sidebarFooter = document.querySelector('.mavatar-footer-left')?.closest('div')
            || document.querySelector('.mavatar-footer-left')
            || document.querySelector('div[class*="sidebar"] footer')
            || document.querySelector('div[class*="lower-sidebar"]');
        const isCollapsed = !!document.querySelector('button[aria-label*="Expand"]')
            || !document.querySelector('button[aria-label*="Close"]')
            || (sidebarFooter && sidebarFooter.getBoundingClientRect().width < 150);
        hasSidebar.style.display = isCollapsed ? 'none' : 'block';
    }
};

// ─── checkAndTriggerOnGenerationEnd ──────────────────────────────────────────
window.AskGemini.checkAndTriggerOnGenerationEnd = function checkAndTriggerOnGenerationEnd() {
    var AG = window.AskGemini;
    const isCurrentlyGenerating = !!document.querySelector('button[aria-label*="Stop"]')
        || !!document.querySelector('button[class*="stop"]')
        || !!document.querySelector('mat-progress-bar')
        || !!document.querySelector('.is-generating')
        || !!document.querySelector('div[class*="generating"]');

    // Prompt submitted & generation started: flush queued smart pastes
    if (!AG.wasGenerating && isCurrentlyGenerating) {
        if (AG.flushPendingSmartPastesOnSend) {
            AG.flushPendingSmartPastesOnSend();
        }
    }

    if (AG.wasGenerating && !isCurrentlyGenerating) {
        console.log('Ask Gemini: Generation finished! Triggering auto-refresh...');
        if (AG.flushPendingSmartPastesOnSend) {
            AG.flushPendingSmartPastesOnSend();
        }
        const refreshBtn = document.getElementById('ag-quota-refresh-btn');
        if (refreshBtn) refreshBtn.click();
    }
    AG.wasGenerating = isCurrentlyGenerating;
};

// ─── attachInputFocusListener ─────────────────────────────────────────────────
window.AskGemini.attachInputFocusListener = function attachInputFocusListener() {
    var AG = window.AskGemini;
    const input = AG.findInputArea();
    if (input && !input.hasAttribute('data-ag-refresh-hook')) {
        input.setAttribute('data-ag-refresh-hook', 'true');
        const triggerRefresh = () => {
            const now = Date.now();
            if (now - AG.lastRefreshTime < 15000) return;
            console.log('Ask Gemini: Input focused/tapped! Triggering auto-refresh...');
            const refreshBtn = document.getElementById('ag-quota-refresh-btn');
            if (refreshBtn) refreshBtn.click();
        };
        input.addEventListener('focus', triggerRefresh);
        input.addEventListener('click', triggerRefresh);
    }
};

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('paste', (e) => {
    var AG = window.AskGemini;
    const input = AG.findInputArea();
    const isInputTarget = !input || input.contains(e.target) || e.target === input || (e.target.closest && e.target.closest('.ql-editor, rich-textarea, .text-input-field, .input-area-container, [contenteditable="true"]'));
    if (!isInputTarget) return;
    const pastedText = (e.clipboardData || window.clipboardData)?.getData('text/plain');

    // ── Paste Analytics ───────────────────────────────────────────────────────
    // Record every paste targeting the Gemini input. If smart paste later
    // converts this to a .txt upload (smart_paste_success), cancelLastPasteStat
    // will remove this entry so uploads are excluded from the daily summary.
    if (pastedText && AG.recordPasteStats) {
        AG.recordPasteStats(pastedText);
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (AG.smartPasteBehavior === 'off') return;
    if (!pastedText || pastedText.length < AG.smartPasteThreshold) return;
    e.preventDefault();
    if (AG.smartPasteBehavior === 'ask') {
        AG.promptSmartPasteConfirmation(pastedText);
    } else {
        AG.processSmartPaste(pastedText);
    }
}, true);

document.addEventListener('keydown', (e) => {
    var AG = window.AskGemini;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        if (AG.flushPendingSmartPastesOnSend) AG.flushPendingSmartPastesOnSend();
        if (AG.currentContexts.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            AG.maybeInjectAndSend();
        }
    }
}, true);

document.addEventListener('click', (e) => {
    var AG = window.AskGemini;
    const sendBtn = e.target.closest('button[aria-label*="Send" i], button.send-button, gem-icon-button.send-button, [data-test-id*="send"], .send-button, [aria-label*="Submit" i], mat-icon[fonticon*="send"], button:has(mat-icon[fonticon*="send"]), .send-button-container');
    if (sendBtn) {
        if (AG.flushPendingSmartPastesOnSend) AG.flushPendingSmartPastesOnSend();
        if (AG.maybeShowPowerUserFeedbackPrompt) AG.maybeShowPowerUserFeedbackPrompt();
    }
    if (AG.currentContexts.length > 0 && sendBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        AG.maybeInjectAndSend();
    }

    // If user clicked any close button on an attachment, sync smart paste state
    if (e.target.closest('.gem-attachment-close-button, button[aria-label*="close" i], button[aria-label*="delete" i], gem-icon-button')) {
        setTimeout(() => {
            if (AG.syncSmartPasteAttachments) AG.syncSmartPasteAttachments();
        }, 120);
    }
}, true);

document.addEventListener('mouseup', () => window.AskGemini.handleSelection());

let _transformDebounceTimer = null;
const observer = new MutationObserver(() => {
    if (_transformDebounceTimer) return; // leading-edge: already queued
    _transformDebounceTimer = setTimeout(() => {
        _transformDebounceTimer = null;
        window.AskGemini.transformMessages();

        // Safety fallback: if Gemini is generating and there are pending smart pastes, flush them
        const isGenerating = !!document.querySelector('button[aria-label*="Stop"]')
            || !!document.querySelector('button[class*="stop"]')
            || !!document.querySelector('mat-progress-bar')
            || !!document.querySelector('.is-generating')
            || !!document.querySelector('div[class*="generating"]');
        if (isGenerating && window.AskGemini.pendingSmartPastes && window.AskGemini.pendingSmartPastes.length > 0) {
            window.AskGemini.flushPendingSmartPastesOnSend();
        }
    }, 150);
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message) => {
    console.log('Ask Gemini: Message Received', message);
    if (message.type === 'SHOW_RATING_PROMPT') {
        window.AskGemini.showRatingModal();
    } else if (message.type === 'USAGE_LIMITS_UPDATED') {
        window.AskGemini.updateQuotaDisplay(message.limits);
    }
});

// ─── Boot: Read Preferences ───────────────────────────────────────────────────
chrome.storage.local.get([
    'multi_quote_display', 'usage_limits_enabled', 'multi_quote_enabled',
    'smart_paste_behavior', 'smart_paste_threshold', 'smart_paste_feedback_done', 'toc_enabled'
], (res) => {
    var AG = window.AskGemini;
    AG.multiQuoteDisplay = res.multi_quote_display || 'compact';

    AG.usageLimitsEnabled = res.usage_limits_enabled !== false;
    AG.multiQuoteEnabled = res.multi_quote_enabled !== false;
    AG.smartPasteBehavior = res.smart_paste_behavior || 'auto';
    AG.smartPasteThreshold = res.smart_paste_threshold || 5000;
    AG.smartPasteFeedbackDone = res.smart_paste_feedback_done === true;
    AG.tocEnabled = res.toc_enabled !== false;
    if (!AG.usageLimitsEnabled) {
        const card = document.getElementById('ag-quota-sidebar');
        if (card) card.remove();
    }
    AG.buildTableOfContents();
    AG.setupTOCObserver();
});

// ─── Boot: React to Real-Time Pref Changes ────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    var AG = window.AskGemini;
    if (area !== 'local') return;
    if (changes.multi_quote_display) AG.multiQuoteDisplay = changes.multi_quote_display.newValue;
    if (changes.usage_limits_enabled) {
        AG.usageLimitsEnabled = changes.usage_limits_enabled.newValue !== false;
        if (!AG.usageLimitsEnabled) {
            const card = document.getElementById('ag-quota-sidebar');
            if (card) card.remove();
        } else {
            AG.requestUsageLimits();
        }
    }
    if (changes.multi_quote_enabled) {
        AG.multiQuoteEnabled = changes.multi_quote_enabled.newValue !== false;
        if (!AG.multiQuoteEnabled && AG.currentContexts.length > 1) {
            AG.currentContexts = [AG.currentContexts[0]];
            AG.renderContextBox();
        }
    }
    if (changes.smart_paste_behavior) AG.smartPasteBehavior = changes.smart_paste_behavior.newValue || 'auto';
    if (changes.smart_paste_threshold) AG.smartPasteThreshold = changes.smart_paste_threshold.newValue || 5000;
    if (changes.smart_paste_feedback_done) AG.smartPasteFeedbackDone = changes.smart_paste_feedback_done.newValue === true;
    if (changes.toc_enabled) {
        AG.tocEnabled = changes.toc_enabled.newValue !== false;
        AG.buildTableOfContents();
    }
});

// ─── Boot Sequence ────────────────────────────────────────────────────────────
window.AskGemini.transformMessages();
window.AskGemini.requestUsageLimits();
window.AskGemini.updateUserProfile().catch(console.error);
window.AskGemini.incrementSessionVisits().catch(console.error);
window.AskGemini.buildTableOfContents();
window.AskGemini.setupTOCObserver();

setInterval(window.AskGemini.requestUsageLimits, 60000);

console.log('Ask Gemini: Core Engine Active');
