/**
 * Ask Gemini: Main World Debug Bridge
 * Exposes AskGemini helpers directly to the page's 'top' console context
 * so you can test prompts without needing to switch execution contexts in DevTools.
 */
(function() {
    window.AskGemini = window.AskGemini || {};

    // ── Rating Debug Helpers ─────────────────────────────────────────────────────
    window.AskGemini.debugRating = {
        preview: function(feature) {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'preview', feature: feature || 'context_reply' } 
            }));
        },
        prepTrigger: function(feature) {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'prepTrigger', feature: feature || 'context_reply' } 
            }));
        },
        getState: function() {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'getState' } 
            }));
        },
        reset: function() {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'reset' } 
            }));
        }
    };

    // ── Debug Report ─────────────────────────────────────────────────────────────
    window.AskGemini.debug = {
        /**
         * Collects full storage state + live runtime state from the content script
         * and copies a formatted report to the clipboard.
         *
         * Usage (Gemini tab, top frame):
         *   AskGemini.debug.report();
         */
        report: function() {
            console.log('[Ask Gemini] Collecting debug report...');

            function handleResponse(e) {
                document.removeEventListener('AG_DEBUG_REPORT_RESPONSE', handleResponse);
                const report = e.detail;
                const formatted = JSON.stringify(report, null, 2);

                navigator.clipboard.writeText(formatted).then(function() {
                    console.log('[Ask Gemini] \u2705 Debug report copied to clipboard! Paste it in your message to us.');
                }).catch(function() {
                    console.log('[Ask Gemini] Could not auto-copy \u2014 here is the full report to copy manually:');
                    console.log(formatted);
                });

                console.group('[Ask Gemini] Debug Report');
                console.log(report);
                console.groupEnd();
            }

            document.addEventListener('AG_DEBUG_REPORT_RESPONSE', handleResponse);
            document.dispatchEvent(new CustomEvent('AG_DEBUG_REPORT_REQUEST'));

            setTimeout(function() {
                document.removeEventListener('AG_DEBUG_REPORT_RESPONSE', handleResponse);
                console.warn('[Ask Gemini] Debug report timed out — content script may not be active on this page.');
            }, 3000);
        }
    };

    // ── Test & Automation Bridge Helpers ─────────────────────────────────────────
    window.AskGemini.transformMessages = function() {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'transformMessages' } }));
    };
    window.AskGemini.updateQuotaDisplay = function(limits) {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'updateQuotaDisplay', data: JSON.stringify(limits) } }));
    };
    window.AskGemini.processSmartPaste = function(text) {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'processSmartPaste', data: text } }));
    };
    window.AskGemini.buildTableOfContents = function() {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'buildTableOfContents' } }));
    };
    window.AskGemini.clearDraft = function() {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'clearDraft' } }));
    };
    window.AskGemini.promptSmartPasteTurnOffFeedback = function() {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'promptSmartPasteTurnOffFeedback' } }));
    };
    window.AskGemini.promptSmartPasteConfirmation = function(text) {
        document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'promptSmartPasteConfirmation', data: text } }));
    };
    Object.defineProperty(window.AskGemini, 'multiQuoteDisplay', {
        configurable: true,
        get: function() { return this._multiQuoteDisplay || 'compact'; },
        set: function(val) {
            this._multiQuoteDisplay = val;
            document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'setMultiQuoteDisplay', data: val } }));
        }
    });
    Object.defineProperty(window.AskGemini, 'smartPasteBehavior', {
        configurable: true,
        get: function() { return this._smartPasteBehavior || 'auto'; },
        set: function(val) {
            this._smartPasteBehavior = val;
            document.dispatchEvent(new CustomEvent('AG_TEST_DISPATCH', { detail: { action: 'setSmartPasteBehavior', data: val } }));
        }
    });
    Object.defineProperty(window.AskGemini, 'pendingSmartPastes', {
        configurable: true,
        get: function() {
            const count = parseInt(document.body?.dataset?.agPendingPastes || '0', 10);
            return new Array(count).fill({});
        }
    });





    // ── Auto Mode Bridge Helpers ────────────────────────────────────────────────
    window.AskGemini.AUTO_MODE_ID = 'a74ec8485b3b5ce4';
    window.AskGemini.autoModeEnabled = true;
    window.AskGemini.currentSelectedModel = null;

    document.addEventListener('AG_AUTO_MODE_CONFIG', function(e) {
        if (e.detail) {
            if (typeof e.detail.enabled === 'boolean') {
                window.AskGemini.autoModeEnabled = e.detail.enabled;
            }
            if (e.detail.modeId) {
                window.AskGemini.AUTO_MODE_ID = e.detail.modeId;
            }
            if (e.detail.currentSelectedModel !== undefined) {
                window.AskGemini.currentSelectedModel = e.detail.currentSelectedModel;
            }
        }
    });

    window.AskGemini.ensureAutoModeOptionInDOM = function(container) {
        if (!container) return;
        const existing = container.querySelector('[data-mode-id="a74ec8485b3b5ce4"]');
        if (existing) return existing;

        const sample = container.querySelector('gem-menu-item[data-mode-id], .bard-mode-list-button[data-mode-id], button[data-mode-id]');
        if (!sample) return;

        const isLumi = sample.tagName.toLowerCase() === 'gem-menu-item';
        if (isLumi) {
            const clone = sample.cloneNode(true);
            clone.setAttribute('data-mode-id', 'a74ec8485b3b5ce4');
            clone.setAttribute('data-test-id', 'bard-mode-option-auto');
            clone.setAttribute('data-ag-injected', 'true');
            const lbl = clone.querySelector('.label');
            if (lbl) lbl.textContent = 'Auto';
            const sub = clone.querySelector('.sublabel');
            if (sub) sub.textContent = 'Adapts to your needs';
            sample.parentNode.insertBefore(clone, sample);
            return clone;
        } else {
            const clone = sample.cloneNode(true);
            clone.setAttribute('data-mode-id', 'a74ec8485b3b5ce4');
            clone.setAttribute('data-test-id', 'bard-mode-option-auto');
            clone.setAttribute('data-ag-injected', 'true');
            clone.classList.remove('is-selected');

            let title = clone.querySelector('.mode-title');
            if (!title) {
                title = clone.querySelector('span');
                if (title) title.classList.add('mode-title');
            }
            if (title) title.textContent = 'Auto';

            let desc = clone.querySelector('.mode-desc');
            if (!desc) {
                desc = document.createElement('span');
                desc.className = 'mode-desc';
                clone.appendChild(desc);
            }
            desc.textContent = 'Adapts to your needs';

            clone.addEventListener('click', function(e) {
                clone.classList.add('is-selected');
                document.dispatchEvent(new CustomEvent('AG_TRIGGER_MODEL_SWITCH', {
                    detail: { modeId: 'a74ec8485b3b5ce4' }
                }));
            });

            sample.parentNode.insertBefore(clone, sample);
            return clone;
        }
    };

    // Safe Send Button finder in main world
    window.AskGemini.findSendButton = function() {
        const container = document.querySelector('.send-button-container, .input-buttons-wrapper-bottom');
        if (container) {
            const sendBtn = container.querySelector(
                'button:has(mat-icon[data-mat-icon-name="send"]), ' +
                'button:has(svg[data-icon="send"]), ' +
                'button[aria-label*="Send" i], ' +
                'button[aria-label*="Kirim" i], ' +
                'button.send-button, ' +
                '.send-button'
            );
            if (sendBtn) return sendBtn;
        }
        return document.querySelector('button[aria-label*="Send" i], button[aria-label*="Kirim" i], button[data-test-id*="send"]');
    };

    // Model Switch Listener
    document.addEventListener('AG_TRIGGER_MODEL_SWITCH', function(e) {
        const modeId = (e.detail && e.detail.modeId) || 'a74ec8485b3b5ce4';
        window.AskGemini.currentSelectedModel = modeId;
        console.log('%c[Ask Gemini:Bridge] 🚀 Triggering switch to model mode: ' + modeId, 'color: #1a73e8; font-weight: bold;');

        try {
            const wiz = window.WIZ_global_data;
            const atToken = wiz && wiz.SNlM0e;
            if (atToken) {
                const fsid = (wiz && wiz.FdrFJe) || '';
                const bl = (wiz && wiz.cfb2h) || '';
                const innerArray = new Array(165).fill(null);
                innerArray[164] = modeId;
                const reqPayload = [[["L5adhe", JSON.stringify([innerArray, null, [165]]), null, "generic"]]];

                const params = new URLSearchParams();
                params.set('f.req', JSON.stringify(reqPayload));
                params.set('at', atToken);

                const url = `https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=L5adhe&source-path=${encodeURIComponent(location.pathname)}&bl=${encodeURIComponent(bl)}&f.sid=${encodeURIComponent(fsid)}&hl=en-US&_reqid=${Date.now() % 1000000}&rt=c`;

                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                    body: params.toString(),
                    credentials: 'include'
                }).then(function(r) {
                    console.log('%c[Ask Gemini:Bridge] ✅ Model switch RPC response status: ' + r.status, 'color: #1e8e3e; font-weight: bold;');
                    window.AskGemini.lastModelSwitch = {
                        modeId: modeId,
                        status: r.status,
                        ok: r.ok,
                        timestamp: new Date().toISOString()
                    };
                }).catch(function(err) {
                    console.warn('[Ask Gemini:Bridge] ⚠️ Model switch RPC network error:', err);
                    window.AskGemini.lastModelSwitch = {
                        modeId: modeId,
                        status: 'FETCH_ERROR',
                        error: err ? err.message : String(err),
                        timestamp: new Date().toISOString()
                    };
                });
            } else {
                console.warn('[Ask Gemini:Bridge] ⚠️ atToken (SNlM0e) not found in WIZ_global_data');
                window.AskGemini.lastModelSwitch = {
                    modeId: modeId,
                    status: 'NO_TOKEN',
                    timestamp: new Date().toISOString()
                };
            }
        } catch (err) {
            console.warn('[Ask Gemini:Bridge] ⚠️ Failed to construct model switch RPC:', err);
            window.AskGemini.lastModelSwitch = {
                modeId: modeId,
                status: 'CONSTRUCT_ERROR',
                error: err ? err.message : String(err),
                timestamp: new Date().toISOString()
            };
        }
    });

    // Expose Auto Mode helpers in MAIN world ('top' console frame)
    window.AskGemini.selectAutoMode = function() {
        console.log('[Ask Gemini:Bridge] Calling selectAutoMode from main world');
        document.dispatchEvent(new CustomEvent('AG_MAIN_WORLD_SELECT_MODEL', {
            detail: { modeId: 'a74ec8485b3b5ce4' }
        }));
    };

    window.AskGemini.selectModel = function(modeId) {
        console.log('[Ask Gemini:Bridge] Calling selectModel from main world:', modeId);
        document.dispatchEvent(new CustomEvent('AG_MAIN_WORLD_SELECT_MODEL', {
            detail: { modeId: modeId }
        }));
    };

    window.AskGemini.debugAutoMode = function() {
        console.group('%c=== ASK GEMINI AUTO MODE DIAGNOSTICS (MAIN WORLD) ===', 'color: #1a73e8; font-weight: bold; font-size: 14px;');
        console.log('Auto Mode Enabled:', window.AskGemini.autoModeEnabled);
        console.log('Current Selected Model:', window.AskGemini.currentSelectedModel || 'None recorded yet');
        console.log('Is Auto Active:', window.AskGemini.currentSelectedModel === window.AskGemini.AUTO_MODE_ID);
        console.log('Last Model Switch RPC:', window.AskGemini.lastModelSwitch || 'None recorded yet');
        console.log('WIZ Global Data available:', Boolean(window.WIZ_global_data));
        console.log('Auth Token (SNlM0e) present:', Boolean(window.WIZ_global_data && window.WIZ_global_data.SNlM0e));

        const primaryEls = Array.from(document.querySelectorAll('.picker-primary-text, .logo-pill-label-container .gds-body-m'));
        console.log('Picker Button Primary Text:', primaryEls.map(el => el.textContent.trim()));

        const menuItems = Array.from(document.querySelectorAll('gem-menu-item[data-mode-id], .bard-mode-list-button[data-mode-id]'));
        console.log('Menu Items in DOM:', menuItems.map(m => ({
            modeId: m.getAttribute('data-mode-id'),
            label: m.querySelector('.label, .mode-title, span')?.textContent?.trim(),
            selected: m.classList.contains('selected') || m.classList.contains('is-selected'),
            active: m.getAttribute('data-active') === 'true'
        })));
        console.groupEnd();

        return {
            enabled: window.AskGemini.autoModeEnabled,
            currentModel: window.AskGemini.currentSelectedModel,
            isAuto: window.AskGemini.currentSelectedModel === window.AskGemini.AUTO_MODE_ID,
            lastRpc: window.AskGemini.lastModelSwitch,
            pickerText: primaryEls.map(el => el.textContent.trim()),
            menuItemsCount: menuItems.length
        };
    };
})();

