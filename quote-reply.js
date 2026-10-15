/**
 * Ask Gemini: Quote Reply Module
 * Handles text selection, float button, context box, injection, and message transformation.
 */

// ─── Extension Log Control Guard ──────────────────────────────────────────────
(function initExtensionLogger() {
    var isUnpacked = true;
    try {
        isUnpacked = !('update_url' in chrome.runtime.getManifest());
    } catch (e) {}

    var rawLog = console.log.bind(console);
    var rawInfo = console.info.bind(console);
    var rawWarn = console.warn.bind(console);
    var rawDebug = console.debug.bind(console);

    function applyLoggerState(enabled) {
        if (!enabled) {
            console.log = function() {};
            console.info = function() {};
            console.debug = function() {};
        } else {
            console.log = rawLog;
            console.info = rawInfo;
            console.debug = rawDebug;
        }
    }

    function checkAndApply() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['developerLogsEnabled', 'developerMode'], function(res) {
                    var enabled;
                    if (res.developerLogsEnabled !== undefined) {
                        enabled = !!res.developerLogsEnabled;
                    } else if (isUnpacked) {
                        enabled = true; // Always ON by default for unpacked dev
                    } else {
                        enabled = !!res.developerMode;
                    }
                    applyLoggerState(enabled);
                });
            } else {
                applyLoggerState(isUnpacked);
            }
        } catch (e) {
            applyLoggerState(isUnpacked);
        }
    }

    checkAndApply();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function(changes, namespace) {
            if (namespace === 'local' && (changes.developerLogsEnabled !== undefined || changes.developerMode !== undefined)) {
                checkAndApply();
            }
        });
    }

    if (typeof window !== 'undefined') {
        window.AskGemini = window.AskGemini || {};
        window.AskGemini.setConsoleLogs = function(enable) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ developerLogsEnabled: enable }, function() {
                    applyLoggerState(true);
                    console.log('🏰 [AskGemini] Console logging set to:', enable);
                    applyLoggerState(enable);
                });
            }
        };
    }
})();

window.AskGemini = window.AskGemini || {};

// ─── Security Helpers ────────────────────────────────────────────────────────
window.AskGemini.escapeHtml = function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// ─── Owned State ─────────────────────────────────────────────────────────────
window.AskGemini.currentContexts = [];
window.AskGemini.multiQuoteDisplay = 'compact'; // overwritten by boot prefs

window.AskGemini.multiQuoteEnabled = true;       // overwritten by boot prefs
window.AskGemini.quoteReplyEnabled = true;        // overwritten by boot prefs
window.AskGemini.floatButton = null;
window.AskGemini.contextBox = null;
window.AskGemini.isInjecting = false;
window.AskGemini.retentionTipTimeout = null;
window.AskGemini.isTipTemporarilyDismissed = false;
window.AskGemini.lastRepliesCount = 0;

// ─── maybeInjectAndSend ───────────────────────────────────────────────────────
window.AskGemini.maybeInjectAndSend = function maybeInjectAndSend() {
    var AG = window.AskGemini;

    // Auto-recover if isInjecting was stuck from an earlier unexpected exception
    if (AG.isInjecting) {
        if (Date.now() - (AG._injectStartTime || 0) < 2500) {
            return false;
        }
        AG.isInjecting = false;
    }

    if (!AG.currentContexts || !AG.currentContexts.length) return false;

    const input = AG.findInputArea();
    if (!input) return false;

    AG.isInjecting = true;
    AG._injectStartTime = Date.now();

    // Preserve original context before clearing
    const contextsToInject = [...AG.currentContexts];
    const totalWords = contextsToInject.reduce((a, c) => a + (c || '').trim().split(/\s+/).length, 0);
    const totalLength = contextsToInject.reduce((a, c) => a + (c || '').length, 0);

    const originalColor = input.style.color;

    try {
        const rawInputText = input.innerText || "";
        // Clean out blank paragraph artifact newlines Quill creates when empty (<p><br></p>)
        const originalText = rawInputText.replace(/^[\r\n\s]+|[\r\n\s]+$/g, '');

        const contextBlock = contextsToInject.length === 1
            ? `I'm replying to this:\n"${contextsToInject[0].trim()}"\n\n`
            : `I'm replying to these excerpts:\n${contextsToInject.map((q, i) => `${i + 1}. "${q.trim()}"`).join('\n')}\n\n`;
        const composed = contextBlock + originalText;

        // Step 1: Hide the technical string temporarily from user
        input.style.color = 'transparent';

        // Step 2: Inject directly into DOM
        input.focus();
        let inserted = false;
        try {
            document.execCommand('selectAll', false, null);
            inserted = document.execCommand('insertText', false, composed);
        } catch (_) {
            inserted = false;
        }

        // Selection Range / textNode fallback if execCommand was blocked
        if (!inserted || !input.textContent.includes("I'm replying to")) {
            try {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.selectNodeContents(input);
                    range.deleteContents();
                    const textNode = document.createTextNode(composed);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    inserted = true;
                }
            } catch (_) {}

            if (!inserted) {
                input.innerText = composed;
            }
        }

        // CRITICAL: Notify Angular and Quill that the model value changed!
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        // Clear draft chips and state
        AG.clearContext();
        if (AG.flushPendingSmartPastesOnSend) AG.flushPendingSmartPastesOnSend();

        // Step 3: Trigger send with polling retry so Angular has time to render/enable the send button
        function cleanupAndRestore() {
            setTimeout(() => {
                input.style.color = originalColor || '';
                AG.isInjecting = false;
            }, 50);
        }

        function triggerSendWithRetry(attempt) {
            try {
                const sendBtn = AG.findSendButton();
                const isBtnDisabled = sendBtn && (
                    sendBtn.hasAttribute('disabled') ||
                    sendBtn.getAttribute('aria-disabled') === 'true' ||
                    sendBtn.classList.contains('disabled') ||
                    sendBtn.classList.contains('waiting')
                );

                if (sendBtn && !isBtnDisabled) {
                    const nativeBtn = (sendBtn.tagName === 'BUTTON')
                        ? sendBtn
                        : (sendBtn.querySelector('button') || sendBtn);

                    nativeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    nativeBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    nativeBtn.click();
                    if (sendBtn !== nativeBtn) {
                        sendBtn.click();
                    }
                    cleanupAndRestore();
                    return;
                }

                if (attempt < 6) {
                    setTimeout(() => triggerSendWithRetry(attempt + 1), 25);
                    return;
                }

                // Ultimate fallback: Dispatch Enter keydown directly to Quill input
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                }));
            } catch (innerErr) {
                console.warn('🏰 [AskGemini] Send trigger fallback error:', innerErr);
            } finally {
                cleanupAndRestore();
            }
        }

        requestAnimationFrame(() => triggerSendWithRetry(0));

        // Increment reply count and reset visits since last reply
        chrome.storage.local.get(['reply_count_lifetime'], (res) => {
            const count = (res.reply_count_lifetime || 0) + 1;
            chrome.storage.local.set({
                reply_count_lifetime: count,
                last_reply_time: Date.now(),
                gemini_visits_since_last_reply: 0
            }, () => {
                if (AG.evaluateRetentionTip) AG.evaluateRetentionTip().catch(console.error);
            });
        });

        AG.trackEvent('context_reply_sent', {
            length: totalLength,
            quote_count: contextsToInject.length,
            word_count: totalWords
        });

        return true;
    } catch (err) {
        console.error('🏰 [AskGemini] Error during quote reply injection:', err);
        input.style.color = originalColor || '';
        AG.isInjecting = false;
        return false;
    }
};

// ─── isSelectionInsideAiResponse ─────────────────────────────────────────────
window.AskGemini.isSelectionInsideAiResponse = function isSelectionInsideAiResponse(selection) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

    let range;
    try {
        range = selection.getRangeAt(0);
    } catch (_) {
        return false;
    }
    if (!range) return false;

    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const commonNode = range.commonAncestorContainer;
    if (!startNode || !endNode || !commonNode) return false;

    const startEl = startNode.nodeType === Node.ELEMENT_NODE ? startNode : startNode.parentElement;
    const endEl = endNode.nodeType === Node.ELEMENT_NODE ? endNode : endNode.parentElement;
    const commonEl = commonNode.nodeType === Node.ELEMENT_NODE ? commonNode : commonNode.parentElement;
    if (!startEl || !endEl || !commonEl) return false;

    const EXCLUSION_SELECTOR = [
        'user-query', '.user-query', '.user-query-container', 'user-turn', '.user-turn',
        '.query-content', '.query-text', '.user-message', '.user-query-bubble-with-background',
        '.ask-gemini-transformed-proxy', '.ask-gemini-message-bubble', '.ask-gemini-reply-preview',
        'rich-textarea', '.ql-editor', 'textarea', 'input', '[contenteditable="true"]',
        '.text-input-field', '.chat-input-area', '.input-area-container', '.input-box-wrapper',
        'bard-sidenav', 'mat-sidenav', '.side-nav-container', 'header', 'nav',
        '.response-container-footer', '.response-actions', '.action-btn', 'button', 'mat-icon',
        '#ag-bookmarks-overlay', '#ag-bookmarks-view-panel', '#ag-quota-sidebar',
        '#ask-gemini-float-btn', '#ask-gemini-snippet-bm-btn', '#ask-gemini-context-box', '.ag-feature-banner',
        '.ag-rating-modal', '#ag-tour-overlay', '.ag-bookmark-btn'
    ].join(', ');

    // If start, end, or common ancestor is inside an excluded component, reject
    if (startEl.closest(EXCLUSION_SELECTOR) || endEl.closest(EXCLUSION_SELECTOR) || commonEl.closest(EXCLUSION_SELECTOR)) {
        return false;
    }

    const TOP_RESPONSE_SELECTOR = 'model-response, .model-response, [data-test-id="model-response"], .response-container, div[class*="model-response"]';
    const FALLBACK_RESPONSE_SELECTOR = 'message-content, .message-content, .markdown-main-panel, model-response-content, structured-content-container, div[class*="message-content"]';

    function findTopModelResponse(el) {
        if (!el || !(el instanceof Element)) return null;
        const containers = [];
        let cur = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
            if (cur.matches && cur.matches(TOP_RESPONSE_SELECTOR)) {
                containers.push(cur);
            }
            cur = cur.parentElement;
        }
        if (containers.length > 0) {
            return containers[containers.length - 1];
        }
        return el.closest(FALLBACK_RESPONSE_SELECTOR);
    }

    window.AskGemini.findTopModelResponse = findTopModelResponse;

    const startContainer = findTopModelResponse(startEl);
    const endContainer = findTopModelResponse(endEl);
    const commonContainer = findTopModelResponse(commonEl);

    if (!startContainer || !endContainer || !commonContainer) {
        return false;
    }

    // Both start and end of selection must belong to the exact same top-level AI response
    if (startContainer !== endContainer) {
        return false;
    }

    return true;
};

// ─── Native Quote Reply Detection & Telemetry ──────────────────────────────
window.AskGemini.recordNativeQuoteDetection = function recordNativeQuoteDetection(method) {
    var AG = window.AskGemini;
    if (AG._hasRecordedNativeQuote) return;
    AG._hasRecordedNativeQuote = true;

    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['has_native_quote_reply'], function(res) {
                if (!res || !res.has_native_quote_reply) {
                    chrome.storage.local.set({
                        has_native_quote_reply: true,
                        native_quote_detected_at: Date.now()
                    });
                }
            });
        }
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'SET_USER_PROPERTY',
                properties: {
                    has_native_quote_reply: true
                }
            });
        }
    } catch (_) {}
};

window.AskGemini.isNativeQuoteReplyActive = function isNativeQuoteReplyActive() {
    var AG = window.AskGemini;
    // 1. Check for submitted native quotes in current conversation
    var selector = (AG.getSelector && AG.getSelector('nativeQuoteReply')) || '.submitted-quote-container, .submitted-quote-in-query, blockquote[aria-label="Submitted quote"]';
    if (document.querySelector(selector)) {
        if (AG.recordNativeQuoteDetection) AG.recordNativeQuoteDetection('dom_quote');
        return true;
    }

    // 2. Check for active/visible native prompt suggestion icon or quote buttons
    var btnSelector = (AG.getSelector && AG.getSelector('nativeQuoteButton')) || '[fonticonname="prompt_suggestion"]';
    var nativeIcons = document.querySelectorAll(btnSelector);
    for (var i = 0; i < nativeIcons.length; i++) {
        var icon = nativeIcons[i];
        if (icon.closest('#ask-gemini-float-btn, .ask-gemini-reply-preview, #ask-gemini-context-box')) continue;
        if (AG.recordNativeQuoteDetection) AG.recordNativeQuoteDetection('prompt_suggestion_icon');
        return true;
    }

    // 3. Inspect stylesheets for Google's native submitted-quote rules
    if (AG._nativeQuoteStyleDetected !== undefined) {
        if (AG._nativeQuoteStyleDetected && AG.recordNativeQuoteDetection) {
            AG.recordNativeQuoteDetection('stylesheet_rule');
        }
        return AG._nativeQuoteStyleDetected;
    }

    try {
        for (var s = 0; s < document.styleSheets.length; s++) {
            var sheet = document.styleSheets[s];
            try {
                var rules = sheet.cssRules || sheet.rules;
                if (!rules) continue;
                for (var r = 0; r < rules.length; r++) {
                    var rule = rules[r];
                    if (rule.selectorText && rule.selectorText.indexOf('submitted-quote-container') !== -1) {
                        AG._nativeQuoteStyleDetected = true;
                        if (AG.recordNativeQuoteDetection) AG.recordNativeQuoteDetection('stylesheet_rule');
                        return true;
                    }
                }
            } catch (_) {}
        }
    } catch (_) {}

    AG._nativeQuoteStyleDetected = false;
    return false;
};

// ─── handleSelection ──────────────────────────────────────────────────────────
window.AskGemini.handleSelection = function handleSelection() {
    var AG = window.AskGemini;
    if (!AG.quoteReplyEnabled && !AG.bookmarksEnabled) return; // master toggles off

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        AG.hideFloatButton();
        AG.hideSnippetBookmarkButton();
        return;
    }

    const text = selection.toString().trim();
    if (text.length === 0 || text.length >= 5000) {
        AG.hideFloatButton();
        AG.hideSnippetBookmarkButton();
        return;
    }

    // Only show button if selection is strictly inside an AI response
    if (!AG.isSelectionInsideAiResponse(selection)) {
        AG.hideFloatButton();
        AG.hideSnippetBookmarkButton();
        return;
    }

    const anchorEl = selection.anchorNode ? (selection.anchorNode.parentElement || selection.anchorNode) : null;
    const responseEl = AG.findTopModelResponse ? AG.findTopModelResponse(anchorEl) : null;
    const isNative = AG.isNativeQuoteReplyActive && AG.isNativeQuoteReplyActive();

    // If Google's native quote reply is active or quote reply disabled, hide our quote button
    if (isNative || !AG.quoteReplyEnabled) {
        AG.hideFloatButton();
    } else {
        AG.showFloatButton(selection);
    }

    // Show snippet bookmark button next to the floating pill (native or extension)
    if (AG.bookmarksEnabled !== false) {
        AG.showSnippetBookmarkButton(selection, text, responseEl, isNative);
    } else {
        AG.hideSnippetBookmarkButton();
    }

    AG.isTipTemporarilyDismissed = true;
    AG.evaluateRetentionTip().catch(console.error);
};

// ─── showFloatButton ──────────────────────────────────────────────────────────
window.AskGemini.showFloatButton = function showFloatButton(selection) {
    var AG = window.AskGemini;
    if (!selection || selection.rangeCount === 0) return;
    const text = selection.toString().trim();

    if (!AG.floatButton) {
        AG.floatButton = document.createElement('button');
        AG.floatButton.id = AG.BTN_ID;
        document.body.appendChild(AG.floatButton);
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const centerX = rect.left + window.scrollX + (rect.width / 2);
    const topY = rect.top + window.scrollY - 45;

    if (AG.currentContexts.length > 0 && AG.multiQuoteEnabled) {
        // Multi-quote mode: offer to add another quote to the queue
        AG.floatButton.innerHTML = `<span>${AG.ICONS.ask} + Add Quote (${AG.currentContexts.length})</span>`;
        AG.floatButton.onclick = (e) => {
            e.preventDefault();
            AG.currentContexts.push(text);
            AG.renderContextBox();
            AG.evaluateRetentionTip().catch(console.error);
            AG.hideFloatButton();
            AG.hideSnippetBookmarkButton();
        };
        AG.floatButton.style.left = `${centerX - 75}px`;
    } else {
        // Normal single-quote mode: identical to before
        AG.floatButton.innerHTML = `<span>${AG.ICONS.ask} Ask Gemini</span>`;
        AG.floatButton.onclick = (e) => {
            e.preventDefault();
            AG.activateContext(text);
            AG.hideFloatButton();
            AG.hideSnippetBookmarkButton();
        };
        AG.floatButton.style.left = `${centerX - 60}px`;
    }

    AG.floatButton.style.top = `${topY}px`;
    AG.floatButton.style.display = 'flex';
};

// ─── hideFloatButton ──────────────────────────────────────────────────────────
window.AskGemini.hideFloatButton = function hideFloatButton() {
    if (window.AskGemini.floatButton) window.AskGemini.floatButton.style.display = 'none';
};

// ─── Native Google Floating Pill Detection ──────────────────────────────────
window.AskGemini.findGoogleNativePill = function findGoogleNativePill(selection) {
    if (!selection && typeof window !== 'undefined' && window.getSelection) {
        selection = window.getSelection();
    }
    let rRect = null;
    if (selection && selection.rangeCount > 0) {
        try {
            rRect = selection.getRangeAt(0).getBoundingClientRect();
        } catch (_) {}
    }

    // 1. Check known selectors
    const selectors = [
        '[fonticonname="prompt_suggestion"]',
        'mat-icon[fonticon*="prompt_suggestion"]',
        'mat-icon[data-mat-icon-name*="prompt_suggestion"]',
        '.prompt-suggestion-button',
        '.chat-selection-toolbar button',
        '.cdk-overlay-pane button'
    ];
    for (const sel of selectors) {
        const matches = document.querySelectorAll(sel);
        for (const m of matches) {
            if (m.closest('#ask-gemini-float-btn, #ask-gemini-snippet-bm-btn, .input-area-container, rich-textarea, footer, header, mat-nav-list, bard-sidenav, .ag-bookmark-btn')) continue;
            const btn = m.closest('button, [role="button"], .mat-mdc-button-base') || m;
            const rect = btn.getBoundingClientRect();
            if (rect.width >= 35 && rect.width <= 220 && rect.height >= 20 && rect.height <= 48 && rect.top > 0) {
                if (rRect && (rRect.width > 0 || rRect.height > 0)) {
                    const vDist = Math.min(Math.abs(rect.top - rRect.bottom), Math.abs(rect.bottom - rRect.top));
                    const hDist = Math.min(Math.abs(rect.left - rRect.left), Math.abs(rect.right - rRect.right), Math.abs((rect.left + rect.width / 2) - (rRect.left + rRect.width / 2)));
                    if (vDist > 120 || hDist > 400) continue;
                }
                return { btn, rect };
            }
        }
    }

    // 2. Search visible buttons containing "Ask Gemini"
    const allButtons = document.querySelectorAll('button, [role="button"], .mat-mdc-button-base');
    for (const b of allButtons) {
        if (b.closest('#ask-gemini-float-btn, #ask-gemini-snippet-bm-btn, .input-area-container, rich-textarea, footer, header, mat-nav-list, bard-sidenav, .ag-bookmark-btn')) continue;
        const txt = (b.textContent || '').trim();
        if (txt.includes('Ask Gemini')) {
            const rect = b.getBoundingClientRect();
            if (rect.width >= 35 && rect.width <= 220 && rect.height >= 20 && rect.height <= 48 && rect.top > 0) {
                if (rRect && (rRect.width > 0 || rRect.height > 0)) {
                    const vDist = Math.min(Math.abs(rect.top - rRect.bottom), Math.abs(rect.bottom - rRect.top));
                    const hDist = Math.min(Math.abs(rect.left - rRect.left), Math.abs(rect.right - rRect.right), Math.abs((rect.left + rect.width / 2) - (rRect.left + rRect.width / 2)));
                    if (vDist > 120 || hDist > 400) continue;
                }
                return { btn: b, rect };
            }
        }
    }
    return null;
};

// ─── Snippet Bookmark Button ─────────────────────────────────────────────────
window.AskGemini.snippetBookmarkBtn = null;

window.AskGemini.showSnippetBookmarkButton = function showSnippetBookmarkButton(selection, text, responseEl, isNative) {
    var AG = window.AskGemini;
    if (AG.bookmarksEnabled === false) return;
    if (!selection || selection.rangeCount === 0) return;

    const bmOutlineSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2zm0 13.97-4.46-2.75c-.33-.2-.75-.2-1.08 0L7 16.97V5h10v11.97z"/></svg>';
    const bmFilledSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2z"/></svg>';

    if (!AG.snippetBookmarkBtn) {
        AG.snippetBookmarkBtn = document.createElement('button');
        AG.snippetBookmarkBtn.id = 'ask-gemini-snippet-bm-btn';
        AG.snippetBookmarkBtn.setAttribute('type', 'button');
        AG.snippetBookmarkBtn.setAttribute('aria-label', 'Bookmark highlighted text');
        AG.snippetBookmarkBtn.className = 'mdc-button mat-mdc-button-base mat-badge mdc-button--unelevated mat-mdc-unelevated-button mat-unthemed ng-star-inserted';
    }

    AG.snippetBookmarkBtn.innerHTML = `
        <span class="mat-mdc-button-persistent-ripple mdc-button__ripple"></span>
        <span class="mdc-button__label">
            <span class="gem-button-content ng-star-inserted">
                <span class="gem-button-icon-container menu-entry-with-badge ng-star-inserted">
                    <span class="ag-snippet-bm-icon">${bmOutlineSvg}</span>
                </span>
                <span class="gds-body-m">Bookmark</span>
            </span>
        </span>
        <span class="mat-focus-indicator"></span>
        <span class="mat-mdc-button-touch-target"></span>
    `;

    function syncWithNativeDesign() {
        if (!AG.snippetBookmarkBtn) return;
        var nativeBtn = document.querySelector('highlight-to-ask-menu button, .ask-gemini-button button, [fonticonname="prompt_suggestion"] button');
        if (!nativeBtn) {
            var native = AG.findGoogleNativePill(selection);
            if (native && native.btn) nativeBtn = native.btn.querySelector('button') || native.btn;
        }

        var btnStyle = AG.snippetBookmarkBtn.style;
        if (nativeBtn) {
            try {
                var comp = window.getComputedStyle(nativeBtn);
                if (comp) {
                    if (comp.height && comp.height !== 'auto' && comp.height !== '0px') {
                        btnStyle.setProperty('height', comp.height, 'important');
                        btnStyle.setProperty('min-height', comp.height, 'important');
                    }
                    if (comp.backgroundColor && comp.backgroundColor !== 'transparent' && comp.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                        btnStyle.setProperty('background-color', comp.backgroundColor, 'important');
                        AG.snippetBookmarkBtn._baseBg = comp.backgroundColor;
                    }
                    if (comp.color) {
                        btnStyle.setProperty('color', comp.color, 'important');
                        AG.snippetBookmarkBtn._baseColor = comp.color;
                    }
                    if (comp.borderRadius) {
                        btnStyle.setProperty('border-radius', comp.borderRadius, 'important');
                    }
                    if (comp.paddingLeft && comp.paddingRight) {
                        btnStyle.setProperty('padding', '0 ' + comp.paddingRight + ' 0 ' + comp.paddingLeft, 'important');
                    }
                    if (comp.fontFamily) {
                        btnStyle.setProperty('font-family', comp.fontFamily, 'important');
                    }
                    if (comp.fontSize) {
                        btnStyle.setProperty('font-size', comp.fontSize, 'important');
                    }
                    if (comp.fontWeight) {
                        btnStyle.setProperty('font-weight', comp.fontWeight, 'important');
                    }
                }
            } catch (err) {}
        }

        // Guarantee core filled-pill geometry with absolutely NO border and NO drop shadow
        btnStyle.setProperty('border', 'none', 'important');
        btnStyle.setProperty('outline', 'none', 'important');
        btnStyle.setProperty('box-shadow', 'none', 'important');
        btnStyle.setProperty('cursor', 'pointer', 'important');
        btnStyle.setProperty('user-select', 'none', 'important');
        btnStyle.setProperty('white-space', 'nowrap', 'important');
        btnStyle.setProperty('display', 'inline-flex', 'important');
        btnStyle.setProperty('align-items', 'center', 'important');
        btnStyle.setProperty('box-sizing', 'border-box', 'important');
        btnStyle.setProperty('gap', '8px', 'important');
        btnStyle.setProperty('transition', 'background-color 0.15s ease, color 0.15s ease', 'important');

        if (!AG.snippetBookmarkBtn._baseBg) {
            btnStyle.setProperty('background-color', '#282a2c', 'important');
            btnStyle.setProperty('color', '#e3e3e3', 'important');
            btnStyle.setProperty('height', '38px', 'important');
            btnStyle.setProperty('min-height', '38px', 'important');
            btnStyle.setProperty('border-radius', '9999px', 'important');
            btnStyle.setProperty('padding', '0 16px', 'important');
            btnStyle.setProperty('font-family', '"Google Sans Text", "Google Sans", Roboto, sans-serif', 'important');
            btnStyle.setProperty('font-size', '14px', 'important');
            btnStyle.setProperty('font-weight', '500', 'important');
            AG.snippetBookmarkBtn._baseBg = '#282a2c';
            AG.snippetBookmarkBtn._baseColor = '#e3e3e3';
        }
    }

    syncWithNativeDesign();

    AG.snippetBookmarkBtn.onmouseenter = function() {
        var base = this._baseBg || '#282a2c';
        if (base.includes('28, 2a, 2c') || base.includes('40, 42, 44') || base === '#282a2c' || base === '#1F1F1F') {
            this.style.setProperty('background-color', '#353739', 'important');
        } else {
            this.style.setProperty('filter', 'brightness(0.95)', 'important');
        }
        this.style.setProperty('color', '#ffffff', 'important');
        this.style.setProperty('border', 'none', 'important');
    };
    AG.snippetBookmarkBtn.onmouseleave = function() {
        this.style.setProperty('background-color', this._baseBg || '#282a2c', 'important');
        this.style.setProperty('color', this._baseColor || '#e3e3e3', 'important');
        this.style.removeProperty('filter');
        this.style.setProperty('border', 'none', 'important');
    };

    AG.snippetBookmarkBtn.onclick = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const label = AG.snippetBookmarkBtn.querySelector('.gds-body-m');
        const iconWrap = AG.snippetBookmarkBtn.querySelector('.ag-snippet-bm-icon');

        if (label) {
            label.textContent = 'Saved!';
            label.style.setProperty('color', '#8ab4f8', 'important');
        }
        if (iconWrap) {
            iconWrap.innerHTML = bmFilledSvg;
            iconWrap.style.setProperty('color', '#8ab4f8', 'important');
        }

        if (AG.BookmarkManager && AG.BookmarkManager.addSnippetBookmark) {
            Promise.resolve(AG.BookmarkManager.addSnippetBookmark(text, responseEl)).catch(console.error);
        }

        setTimeout(function() {
            AG.hideSnippetBookmarkButton();
        }, 1200);
    };

    function attachOrAlign() {
        if (!AG.snippetBookmarkBtn) return false;

        // Priority 1: Nest directly inside Google's native highlight-to-ask-menu container
        const menu = document.querySelector('highlight-to-ask-menu');
        if (menu) {
            if (!menu.contains(AG.snippetBookmarkBtn)) {
                menu.appendChild(AG.snippetBookmarkBtn);
            }
            AG.snippetBookmarkBtn.classList.remove('ag-standalone-pill');
            AG.snippetBookmarkBtn.style.position = 'static';
            AG.snippetBookmarkBtn.style.transform = 'none';
            AG.snippetBookmarkBtn.style.display = 'inline-flex';
            syncWithNativeDesign();
            return true;
        }

        // Priority 2: Check for .cdk-overlay-pane container
        const overlayPane = document.querySelector('.cdk-overlay-pane:has([fonticonname="prompt_suggestion"]), .cdk-overlay-pane:has(.ask-gemini-button)');
        if (overlayPane) {
            if (!overlayPane.contains(AG.snippetBookmarkBtn)) {
                overlayPane.appendChild(AG.snippetBookmarkBtn);
            }
            AG.snippetBookmarkBtn.classList.remove('ag-standalone-pill');
            AG.snippetBookmarkBtn.style.position = 'static';
            AG.snippetBookmarkBtn.style.transform = 'none';
            AG.snippetBookmarkBtn.style.display = 'inline-flex';
            syncWithNativeDesign();
            return true;
        }

        // Priority 3: Fallback standalone positioning on document.body
        if (!document.body.contains(AG.snippetBookmarkBtn)) {
            document.body.appendChild(AG.snippetBookmarkBtn);
        }
        AG.snippetBookmarkBtn.classList.add('ag-standalone-pill');
        AG.snippetBookmarkBtn.style.position = 'absolute';

        const native = AG.findGoogleNativePill(selection);
        if (native && native.rect.width > 0 && native.rect.height > 0) {
            const nRect = native.btn.getBoundingClientRect();
            const btnWidth = AG.snippetBookmarkBtn.offsetWidth || 86;
            let left = nRect.right + window.scrollX + 6;
            if (left + btnWidth > window.innerWidth - 12) {
                left = nRect.left + window.scrollX - btnWidth - 6;
            }
            AG.snippetBookmarkBtn.style.left = `${Math.max(8, left)}px`;
            AG.snippetBookmarkBtn.style.top = `${nRect.top + window.scrollY}px`;
            AG.snippetBookmarkBtn.style.display = 'inline-flex';
            return true;
        }

        if (AG.floatButton && AG.floatButton.style.display !== 'none') {
            const fRect = AG.floatButton.getBoundingClientRect();
            const btnWidth = AG.snippetBookmarkBtn.offsetWidth || 86;
            let left = fRect.right + window.scrollX + 6;
            if (left + btnWidth > window.innerWidth - 12) {
                left = fRect.left + window.scrollX - btnWidth - 6;
            }
            AG.snippetBookmarkBtn.style.left = `${Math.max(8, left)}px`;
            AG.snippetBookmarkBtn.style.top = `${fRect.top + window.scrollY}px`;
            AG.snippetBookmarkBtn.style.display = 'inline-flex';
            return true;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const centerX = rect.left + window.scrollX + (rect.width / 2);
        let fallbackLeft = centerX + 58;
        let fallbackTop = rect.bottom + window.scrollY + 8;
        if (fallbackTop + 36 > window.scrollY + window.innerHeight) {
            fallbackTop = rect.top + window.scrollY - 36;
        }
        AG.snippetBookmarkBtn.style.left = `${Math.max(8, fallbackLeft)}px`;
        AG.snippetBookmarkBtn.style.top = `${Math.max(8, fallbackTop)}px`;
        AG.snippetBookmarkBtn.style.display = 'inline-flex';
        return false;
    }

    // Try immediately and across subsequent animation frames
    attachOrAlign();
    [15, 35, 75, 120, 200, 350, 500].forEach(function(delay) {
        setTimeout(function() {
            attachOrAlign();
        }, delay);
    });
};

// ─── hideSnippetBookmarkButton ───────────────────────────────────────────────
window.AskGemini.hideSnippetBookmarkButton = function hideSnippetBookmarkButton() {
    if (window.AskGemini.snippetBookmarkBtn) {
        window.AskGemini.snippetBookmarkBtn.style.display = 'none';
        const label = window.AskGemini.snippetBookmarkBtn.querySelector('.gds-body-m');
        if (label) {
            label.textContent = ' Bookmark';
            label.style.color = '';
        }
        const iconWrap = window.AskGemini.snippetBookmarkBtn.querySelector('mat-icon') || window.AskGemini.snippetBookmarkBtn.querySelector('gem-icon');
        if (iconWrap) {
            const bmOutlineSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2zm0 13.97-4.46-2.75c-.33-.2-.75-.2-1.08 0L7 16.97V5h10v11.97z"/></svg>';
            iconWrap.innerHTML = bmOutlineSvg;
            iconWrap.style.color = '';
        }
    }
};

document.addEventListener('mousedown', function(e) {
    var AG = window.AskGemini;
    if (!AG) return;
    if (e.target.closest && e.target.closest('#ask-gemini-float-btn, #ask-gemini-snippet-bm-btn')) {
        return;
    }
    if (AG.hideFloatButton) AG.hideFloatButton();
    if (AG.hideSnippetBookmarkButton) AG.hideSnippetBookmarkButton();
}, true);

// ─── activateContext ──────────────────────────────────────────────────────────
window.AskGemini.activateContext = function activateContext(text) {
    var AG = window.AskGemini;
    if (!AG.multiQuoteEnabled) {
        AG.currentContexts = [];
    }
    AG.currentContexts.push(text);
    AG.renderContextBox();
    const input = AG.findInputArea();
    if (input) input.focus();

    AG.evaluateRetentionTip().catch(console.error);
};

// ─── renderContextBox ─────────────────────────────────────────────────────────
window.AskGemini.renderContextBox = function renderContextBox() {
    var AG = window.AskGemini;
    const input = AG.findInputArea();
    if (!input) return;

    const container = input.closest('.text-input-field');
    if (!container) return;

    if (!AG.contextBox) {
        AG.contextBox = document.createElement('div');
        AG.contextBox.id = AG.CHIP_ID;
        AG.contextBox.innerHTML = `
            <span class="ask-gemini-draft-icon">${AG.ICONS.reply}</span>
            <button type="button" class="ask-gemini-draft-content" aria-label="Replying to">
                <span id="ask-gemini-context-content"></span>
            </button>
            <button type="button" class="ask-gemini-draft-close" aria-label="Remove">${AG.ICONS.close}</button>
        `;
        AG.contextBox.querySelector('.ask-gemini-draft-close').onclick = (e) => {
            e.stopPropagation();
            AG.clearContext();
        };
        AG.contextBox.querySelector('.ask-gemini-draft-content').onclick = (e) => {
            e.preventDefault();
            if (AG.currentContexts && AG.currentContexts.length > 0) {
                AG.scrollToAndHighlightText(AG.currentContexts[AG.currentContexts.length - 1]);
            }
        };
    }

    if (AG.contextBox.parentElement !== container) {
        container.prepend(AG.contextBox);
    }

    const count = AG.currentContexts.length;
    document.getElementById('ask-gemini-context-content').innerText =
        count === 1 ? `"${AG.currentContexts[0]}"` : `${count} quotes queued`;
    AG.contextBox.style.display = 'flex';
};

// ─── clearContext ─────────────────────────────────────────────────────────────
window.AskGemini.clearContext = function clearContext() {
    var AG = window.AskGemini;
    AG.currentContexts = [];
    if (AG.contextBox) AG.contextBox.style.display = 'none';
    AG.evaluateRetentionTip().catch(console.error);
};

// ─── scrollToAndHighlightText ─────────────────────────────────────────────────
window.AskGemini.scrollToAndHighlightText = function scrollToAndHighlightText(textToFind) {
    if (!textToFind) return;
    let cleanText = textToFind.trim();
    if (cleanText.length === 0) return;

    // Safety cleanup: If textToFind contains a prefix (e.g. from previously corrupted chips),
    // extract everything after the last prefix instance:
    const prefixPattern = /(?:I['\u2019]m replying to this:|I['\u2019]m replying to these excerpts:)\s*/gi;
    let lastIndex = -1;
    let match;
    while ((match = prefixPattern.exec(cleanText)) !== null) {
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex !== -1) {
        cleanText = cleanText.substring(lastIndex).trim();
    }
    // Strip leading/trailing quotation marks if left over
    cleanText = cleanText.replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '').trim();
    if (!cleanText) return;

    const normalize = (str) => (str || '').replace(/\s+/g, ' ').trim();
    const normalizedTarget = normalize(cleanText);
    const words = normalizedTarget.split(/\s+/).filter(Boolean);
    const headWords = words.slice(0, Math.min(6, words.length)).join(' ');

    // Collect response candidates (model responses and message containers)
    const responseCandidates = document.querySelectorAll(
        '.model-response, model-response, .message-content, message-content, .markdown-main-panel, [data-test-id="model-response"], .response-container, model-response-content, structured-content-container'
    );

    let bestElement = null;

    // Helper: Verify if an element belongs to the Ask Gemini UI
    function isExtensionUi(el) {
        if (!el || !(el instanceof Element)) return false;
        return Boolean(
            el.closest(
                '.ask-gemini-transformed-proxy, #ask-gemini-context-box, .ask-gemini-reply-preview, #ask-gemini-float-btn, #ask-gemini-snippet-bm-btn, [data-ag-processed="true"], .ag-text-highlight-blink'
            )
        );
    }

    // Helper to search within a list of elements
    function searchElements(elements, targetStr) {
        if (!targetStr) return null;
        for (const el of elements) {
            if (isExtensionUi(el)) continue;
            const text = normalize(el.textContent);
            if (text.includes(targetStr)) {
                return el;
            }
        }
        return null;
    }

    // 1. First search: Exact normalized match across assistant message blocks
    let matchedBlock = searchElements(responseCandidates, normalizedTarget);

    // 2. If exact normalized string not found (e.g. cross-element quote, multiline or formatting differences),
    // try anchoring on the head words (first 5-6 words) across assistant responses:
    if (!matchedBlock && headWords.length >= 6) {
        matchedBlock = searchElements(responseCandidates, headWords);
    }

    // 3. If still not found in assistant responses, search user prompt blocks (EXCLUDING any quote previews)
    if (!matchedBlock) {
        const userPromptCandidates = Array.from(document.querySelectorAll(
            '.ask-gemini-bubble-text, .user-query-container .query-text, user-query .query-text'
        )).filter(el => !isExtensionUi(el));
        matchedBlock = searchElements(userPromptCandidates, normalizedTarget);
        if (!matchedBlock && headWords.length >= 6) {
            matchedBlock = searchElements(userPromptCandidates, headWords);
        }
    }

    // 4. Drill down to the most specific child element inside matchedBlock (p, li, blockquote, etc.)
    if (matchedBlock) {
        bestElement = matchedBlock;
        const subElements = Array.from(
            matchedBlock.querySelectorAll('p, li, blockquote, pre, h1, h2, h3, h4, span')
        ).filter(el => !isExtensionUi(el));

        // First attempt drill down: exact normalized target in subEl
        for (const subEl of subElements) {
            if (normalize(subEl.textContent).includes(normalizedTarget)) {
                bestElement = subEl;
                break;
            }
        }
        // Second attempt drill down: if quote is multiline/cross-element, find subEl matching the head anchor
        if (bestElement === matchedBlock && headWords.length >= 6) {
            for (const subEl of subElements) {
                if (normalize(subEl.textContent).includes(headWords)) {
                    bestElement = subEl;
                    break;
                }
            }
        }
    }

    // Final safety check: NEVER allow bestElement to be extension UI!
    if (bestElement && isExtensionUi(bestElement)) {
        bestElement = null;
    }

    // 5. Scroll to and highlight ONLY the specific quoted text (normal highlight, no block styling)
    if (bestElement) {
        let highlighted = false;

        // Determine what text to highlight within bestElement.
        // If bestElement contains the entire cleanText, highlight cleanText.
        // If cleanText is multiline or spans across sibling elements, highlight the first line or headWords!
        let targetSlice = cleanText;
        if (!normalize(bestElement.textContent).includes(normalizedTarget)) {
            const firstLine = cleanText.split(/[\r\n]+/)[0].trim();
            if (firstLine && normalize(bestElement.textContent).includes(normalize(firstLine))) {
                targetSlice = firstLine;
            } else if (headWords && normalize(bestElement.textContent).includes(headWords)) {
                targetSlice = headWords;
            }
        }

        try {
            // First check: Exact match within a single text node
            const walk = document.createTreeWalker(bestElement, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walk.nextNode())) {
                if (isExtensionUi(node.parentElement)) continue;
                const nodeText = node.nodeValue || '';
                const idx = nodeText.indexOf(targetSlice);
                if (idx !== -1 && node.parentNode && !node.parentNode.classList.contains('ag-text-highlight-blink')) {
                    highlighted = true;
                    const span = document.createElement('span');
                    span.className = 'ag-text-highlight-blink';
                    span.textContent = targetSlice;

                    const beforeText = nodeText.substring(0, idx);
                    const afterText = nodeText.substring(idx + targetSlice.length);

                    const beforeNode = document.createTextNode(beforeText);
                    const afterNode = document.createTextNode(afterText);

                    const pNode = node.parentNode;
                    pNode.insertBefore(beforeNode, node);
                    pNode.insertBefore(span, node);
                    pNode.insertBefore(afterNode, node);
                    pNode.removeChild(node);

                    span.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    setTimeout(() => {
                        if (span.parentNode) {
                            const merged = beforeText + targetSlice + afterText;
                            const restored = document.createTextNode(merged);
                            pNode.insertBefore(restored, beforeNode);
                            pNode.removeChild(beforeNode);
                            pNode.removeChild(span);
                            pNode.removeChild(afterNode);
                            pNode.normalize();
                        }
                    }, 2000);
                    break;
                }
            }

            // Second check: Multi-node match across inline tags (<b>, <i>, <code>, etc.)
            if (!highlighted) {
                const textNodes = [];
                const fullWalk = document.createTreeWalker(bestElement, NodeFilter.SHOW_TEXT, null, false);
                let cumulative = '';
                let n;
                while ((n = fullWalk.nextNode())) {
                    if (!n.parentNode || n.parentNode.classList.contains('ag-text-highlight-blink') || isExtensionUi(n.parentElement)) continue;
                    const start = cumulative.length;
                    cumulative += n.nodeValue;
                    const end = cumulative.length;
                    textNodes.push({ node: n, start, end, text: n.nodeValue });
                }

                let matchIdx = cumulative.indexOf(targetSlice);
                let matchLen = targetSlice.length;

                // Flexible regex matching if whitespace differences exist
                if (matchIdx === -1) {
                    const sliceWords = targetSlice.split(/\s+/).filter(Boolean);
                    if (sliceWords.length >= 2) {
                        const escaped = sliceWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
                        try {
                            const re = new RegExp(escaped, 'i');
                            const reMatch = re.exec(cumulative);
                            if (reMatch) {
                                matchIdx = reMatch.index;
                                matchLen = reMatch[0].length;
                            }
                        } catch (e) {}
                    }
                }

                if (matchIdx !== -1) {
                    const matchStart = matchIdx;
                    const matchEnd = matchIdx + matchLen;
                    const createdSpans = [];

                    for (const item of textNodes) {
                        if (item.end <= matchStart || item.start >= matchEnd) continue;

                        const nodeRelStart = Math.max(0, matchStart - item.start);
                        const nodeRelEnd = Math.min(item.text.length, matchEnd - item.start);

                        const before = item.text.substring(0, nodeRelStart);
                        const matchPart = item.text.substring(nodeRelStart, nodeRelEnd);
                        const after = item.text.substring(nodeRelEnd);

                        if (!matchPart) continue;

                        const span = document.createElement('span');
                        span.className = 'ag-text-highlight-blink';
                        span.textContent = matchPart;

                        const pNode = item.node.parentNode;
                        if (!pNode) continue;

                        if (before) pNode.insertBefore(document.createTextNode(before), item.node);
                        pNode.insertBefore(span, item.node);
                        if (after) pNode.insertBefore(document.createTextNode(after), item.node);
                        pNode.removeChild(item.node);

                        createdSpans.push({ span, pNode });
                    }

                    if (createdSpans.length > 0) {
                        highlighted = true;
                        createdSpans[0].span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => {
                            for (const item of createdSpans) {
                                if (item.span.parentNode) {
                                    const txt = document.createTextNode(item.span.textContent);
                                    item.span.parentNode.insertBefore(txt, item.span);
                                    item.span.parentNode.removeChild(item.span);
                                    item.pNode.normalize();
                                }
                            }
                        }, 2000);
                    }
                }
            }
        } catch (e) {
            // Slicing text nodes failed
        }

        // Fallback: If inline text highlight couldn't be wrapped, smoothly scroll to bestElement without breaking DOM
        if (!highlighted && bestElement && !isExtensionUi(bestElement)) {
            bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            bestElement.classList.add('ag-text-highlight-blink');
            setTimeout(() => {
                bestElement.classList.remove('ag-text-highlight-blink');
            }, 2000);
        }
    }
};

// ─── Prompt Text Extraction Helper ───────────────────────────────────────────
function extractPromptText(bubble) {
    // 1. Screen-reader label often contains the clean, full un-collapsed text
    const srLabel = bubble.querySelector('.screen-reader-user-query-label, h5.cdk-visually-hidden, h5');
    let srText = '';
    if (srLabel) {
        const srClone = srLabel.cloneNode(true);
        srClone.querySelectorAll('span').forEach(s => {
            if (/you said/i.test(s.textContent)) s.remove();
        });
        srText = srClone.textContent.replace(/^(you said|you:)\s*/i, '').trim();
    }

    // 2. Visible text by cloning and stripping visually hidden elements and buttons
    const clone = bubble.cloneNode(true);
    clone.querySelectorAll(
        '.screen-reader-user-query-label, h5, .cdk-visually-hidden, button, svg, mat-icon, [data-test-id="prompt-copy-button"], [data-test-id="prompt-edit-button"]'
    ).forEach(n => n.remove());

    const lines = clone.querySelectorAll('.query-text-line');
    let visibleText = '';
    if (lines.length > 0) {
        visibleText = Array.from(lines).map(l => l.textContent).join('\n').trim();
    } else {
        visibleText = (clone.textContent || '').trim();
    }

    const hasPrefix = (t) => t.includes("I'm replying to this:") || t.includes("I\u2019m replying to this:") ||
                             t.includes("I'm replying to these excerpts:") || t.includes("I\u2019m replying to these excerpts:");

    // If srText has prefix and is not truncated with ellipsis, prefer it
    if (srText && hasPrefix(srText) && !srText.includes('\u2026')) {
        return srText;
    }
    if (visibleText && hasPrefix(visibleText) && !visibleText.includes('\u2026')) {
        return visibleText;
    }
    if (srText && hasPrefix(srText)) {
        return srText;
    }
    if (visibleText && hasPrefix(visibleText)) {
        return visibleText;
    }
    return srText || visibleText || bubble.textContent || '';
}

// ─── Single-Quote Parsing Helper ──────────────────────────────────────────────
function parseSingleQuote(text) {
    const prefixPattern = /I['\u2019]m replying to this:/gi;
    let lastIndex = -1;
    let match;
    while ((match = prefixPattern.exec(text)) !== null) {
        lastIndex = match.index;
    }
    if (lastIndex === -1) return null;

    const after = text.substring(lastIndex).replace(/^I['\u2019]m replying to this:\s*/i, '').trim();
    if (!after.startsWith('"')) return null;

    // Standard pattern: "<quote>"\n\n<message>
    const separatorMatch = after.match(/^"([\s\S]*?)"\s*(?:[\r\n]+([\s\S]*))?$/);
    if (separatorMatch) {
        let context = separatorMatch[1].trim();
        let message = (separatorMatch[2] || '').trim();
        message = message.replace(/^\u27e6\u25c8\u27e7\s*/, '').trim();
        if (context) return { context, message };
    }

    // Fallback: first quote to last quote in the after-prefix block
    const firstQuote = after.indexOf('"');
    const lastQuote = after.lastIndexOf('"');
    if (firstQuote !== -1 && lastQuote > firstQuote) {
        let context = after.substring(firstQuote + 1, lastQuote).trim();
        let message = after.substring(lastQuote + 1).trim();
        message = message.replace(/^\u27e6\u25c8\u27e7\s*/, '').trim();
        if (context) return { context, message };
    }
    return null;
}

// ─── Multi-Quote Parsing Helper ───────────────────────────────────────────────
function parseMultiQuote(text) {
    const prefixPattern = /I['\u2019]m replying to these excerpts:/gi;
    let lastIndex = -1;
    let match;
    while ((match = prefixPattern.exec(text)) !== null) {
        lastIndex = match.index;
    }
    if (lastIndex === -1) return null;

    const after = text.substring(lastIndex).replace(/^I['\u2019]m replying to these excerpts:\s*/i, '').trim();

    const quoteMatches = [...after.matchAll(/(\d+)\.\s*"([\s\S]*?)"(?=\s*(?:\d+\.|\n\n|$))/g)];
    if (quoteMatches.length === 0) return null;

    const quotes = quoteMatches.map(m => m[2].trim());
    const lastMatch = quoteMatches[quoteMatches.length - 1];
    let actualMessage = after.substring(lastMatch.index + lastMatch[0].length).trim();
    actualMessage = actualMessage.replace(/^\u27e6\u25c8\u27e7\s*/, '').trim();

    return { quotes, message: actualMessage };
}

// ─── transformMessages ────────────────────────────────────────────────────────
window.AskGemini.transformMessages = function transformMessages() {
    var AG = window.AskGemini;

    const replies = document.querySelectorAll('model-response, .model-response');
    const currentCount = replies.length;
    if (currentCount > AG.lastRepliesCount) {
        AG.lastRepliesCount = currentCount;
        AG.isTipTemporarilyDismissed = false;
    }

    // Query top-level user prompt bubbles that have not been transformed yet
    const allBubbles = document.querySelectorAll(
        '.user-query-bubble-with-background:not([data-ag-processed]), [data-test-id="luminous-collapsed-bubble"]:not([data-ag-processed]), .query-text:not([data-ag-processed])'
    );

    if (allBubbles.length > 0) {
        const rootBubbles = [];
        allBubbles.forEach(b => {
            if (b.closest('[data-ag-processed="true"]')) return;
            if (rootBubbles.some(p => p.contains(b))) return;
            rootBubbles.push(b);
        });

        rootBubbles.forEach(el => {
            if (el.hasAttribute('data-ag-processed')) return;

        const text = extractPromptText(el);
        const hasSingle = /I['\u2019]m replying to this:/i.test(text);
        const hasMulti = /I['\u2019]m replying to these excerpts:/i.test(text);

        if (hasSingle) {
            const parsed = parseSingleQuote(text);
            if (!parsed || !parsed.context) return;
            const { context, message: actualMessage } = parsed;

            const chipHtml = `
                <div class="ask-gemini-proxy-content">
                    <button class="ask-gemini-reply-preview" type="button">
                        <div class="ask-gemini-reply-icon">${AG.ICONS.reply}</div>
                        <div class="ask-gemini-reply-text-wrapper">
                            <p class="ask-gemini-reply-text">${AG.escapeHtml(context)}</p>
                        </div>
                    </button>
                    <div class="ask-gemini-message-bubble">
                        <div class="ask-gemini-bubble-text"><p>${AG.escapeHtml(actualMessage || '')}</p></div>
                    </div>
                </div>
            `;

            const wrapper = el.closest('.user-query-bubble-with-background') || el.closest('.query-text') || el;
            wrapper.innerHTML = '';
            const proxy = document.createElement('div');
            proxy.className = 'ask-gemini-transformed-proxy';
            proxy.innerHTML = chipHtml;

            const btn = proxy.querySelector('.ask-gemini-reply-preview');
            if (btn) {
                btn.onclick = () => AG.scrollToAndHighlightText(context);
            }

            wrapper.appendChild(proxy);
            wrapper.setAttribute('data-ag-processed', 'true');
            wrapper.querySelectorAll('*').forEach(child => child.setAttribute('data-ag-processed', 'true'));
        } else if (hasMulti) {
            const parsed = parseMultiQuote(text);
            if (!parsed || !parsed.quotes || parsed.quotes.length === 0) return;
            const { quotes, message: actualMessage } = parsed;

            const chipsHtml = quotes.map(q => `
                <button class="ask-gemini-reply-preview" type="button">
                    <div class="ask-gemini-reply-icon">${AG.ICONS.reply}</div>
                    <div class="ask-gemini-reply-text-wrapper">
                        <p class="ask-gemini-reply-text">${AG.escapeHtml(q)}</p>
                    </div>
                </button>
            `).join('');

            let chipHtml;
            if (AG.multiQuoteDisplay === 'compact') {
                chipHtml = `
                    <div class="ask-gemini-proxy-content">
                        <button class="ask-gemini-reply-preview" type="button"
                            title="${AG.escapeHtml(quotes.map((q, i) => `${i + 1}. ${q}`).join('\n'))}">
                            <div class="ask-gemini-reply-icon">${AG.ICONS.reply}</div>
                            <div class="ask-gemini-reply-text-wrapper">
                                <p class="ask-gemini-reply-text">${quotes.length} quoted excerpts</p>
                            </div>
                        </button>
                        <div class="ask-gemini-message-bubble">
                            <div class="ask-gemini-bubble-text"><p>${AG.escapeHtml(actualMessage || '')}</p></div>
                        </div>
                    </div>
                `;
            } else {
                chipHtml = `
                    <div class="ask-gemini-proxy-content">
                        ${chipsHtml}
                        <div class="ask-gemini-message-bubble">
                            <div class="ask-gemini-bubble-text"><p>${AG.escapeHtml(actualMessage || '')}</p></div>
                        </div>
                    </div>
                `;
            }

            const wrapper = el.closest('.user-query-bubble-with-background') || el.closest('.query-text') || el;
            wrapper.innerHTML = '';
            const proxy = document.createElement('div');
            proxy.className = 'ask-gemini-transformed-proxy';
            proxy.innerHTML = chipHtml;

            proxy.querySelectorAll('.ask-gemini-reply-preview').forEach((btn, i) => {
                if (AG.multiQuoteDisplay === 'compact') {
                    btn.onclick = null; // compact chip is informational only
                } else {
                    btn.onclick = () => AG.scrollToAndHighlightText(quotes[i]);
                }
            });

            wrapper.appendChild(proxy);
            wrapper.setAttribute('data-ag-processed', 'true');
            wrapper.querySelectorAll('*').forEach(child => child.setAttribute('data-ag-processed', 'true'));
        }
    });
    }

    // Dynamic retention tips checks
    AG.evaluateRetentionTip().catch(console.error);

    // Check and inject quota limit visuals
    AG.checkAndInjectQuota();

    // Check generation state and trigger quota sync
    AG.checkAndTriggerOnGenerationEnd();

    // Inject Bookmarks buttons & sidebar nav item
    if (AG.injectBookmarkButtons) AG.injectBookmarkButtons();
    if (AG.injectSidebarBookmarkNav) AG.injectSidebarBookmarkNav();

    // Attach focus listener to input area
    AG.attachInputFocusListener();

    // Evaluate feature banner display
    if (!AG.hasEvaluatedFeatureBanner) {
        AG.hasEvaluatedFeatureBanner = true;
        AG.evaluateFeatureBanner().catch(console.error);
    }
};
