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

    // ── Selectors Sync ──────────────────────────────────────────────────────────
    var _activeSelectors = null;
    document.addEventListener('AG_SELECTORS_SYNC', function(e) {
        if (e.detail && typeof e.detail === 'object') {
            _activeSelectors = Object.assign({}, e.detail);
        }
    });

    // ── Debug Report & Tools ─────────────────────────────────────────────────────
    window.AskGemini.debug = {
        /**
         * Inspect active DOM selectors directly from DevTools 'top' console.
         */
        selectors: function() {
            if (!_activeSelectors) {
                document.dispatchEvent(new CustomEvent('AG_DEBUG_SELECTORS_REQUEST'));
            }
            var s = _activeSelectors || {
                sidebarExpandedNav: 'mat-nav-list.top-nav-expanded, mat-nav-list.top-action-list-scrollable',
                sidebarCollapsedNav: 'mat-nav-list.top-nav-collapsed',
                sidebarStudentsItem: '[data-test-id="learn-side-nav-entry-button"]',
                sidebarMoreItem: '[data-test-id="overflow-side-nav-entry-button"]',
                sidebarGemsItem: '[data-test-id="gems-side-nav-entry-button"], a[href="/gems/view"]',
                composerInputArea: 'div.input-area-container, fieldset.input-area-container',
                composerTextArea: 'rich-textarea, div[contenteditable="true"]',
                modelResponse: 'model-response, .model-response, message-content',
                userQuery: 'user-query',
                scroller: 'infinite-scroller'
            };
            console.group('[Ask Gemini] Active Selectors');
            console.table(s);
            console.groupEnd();
            return s;
        },

        /**
         * Tests Google RPC batchexecute turn hydration from DevTools console.
         * Usage: await AskGemini.debug.testRpc()
         */
        testRpc: function(convoId) {
            console.log('[Ask Gemini RPC] Requesting turn hydration...');
            return new Promise(function(resolve) {
                var reqId = 'ag_test_rpc_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                var timer = null;
                function onResponse(e) {
                    if (e.detail && e.detail.reqId === reqId) {
                        if (timer) clearTimeout(timer);
                        document.removeEventListener('AG_DEBUG_RPC_RESPONSE', onResponse);
                        var res = e.detail.result;
                        console.group('[Ask Gemini RPC Result]');
                        console.log('Success:', res ? res.success : false);
                        console.log('Total Turns:', (res && res.turns) ? res.turns.length : 0);
                        if (res && res.turns && res.turns.length > 0) {
                            console.table(res.turns.map(function(t) {
                                return {
                                    index: t.turnIndex,
                                    prompt: t.userPrompt ? (t.userPrompt.length > 40 ? t.userPrompt.slice(0, 40) + '...' : t.userPrompt) : '',
                                    reply: t.modelReply ? (t.modelReply.length > 40 ? t.modelReply.slice(0, 40) + '...' : t.modelReply) : '',
                                    citations: t.citations ? t.citations.length : 0
                                };
                            }));
                        }
                        console.log('Raw Result:', res);
                        console.groupEnd();
                        resolve(res);
                    }
                }

                document.addEventListener('AG_DEBUG_RPC_RESPONSE', onResponse);
                document.dispatchEvent(new CustomEvent('AG_DEBUG_RPC_REQUEST', {
                    detail: { reqId: reqId, convoId: convoId }
                }));

                timer = setTimeout(function() {
                    document.removeEventListener('AG_DEBUG_RPC_RESPONSE', onResponse);
                    console.warn('[Ask Gemini RPC] Request timed out. Ensure the Gemini tab was reloaded so content scripts are running.');
                    resolve({ success: false, reason: 'TIMEOUT' });
                }, 8000);
            });
        },

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

        const secondaryEls = Array.from(document.querySelectorAll('.picker-secondary-text'));
        const isThinking = secondaryEls.some(el => /extended\s*thinking|thinking/i.test(el.textContent));
        console.log('Extended Thinking Detected in DOM:', isThinking);
        if (secondaryEls.length > 0) {
            console.log('Picker Button Secondary Text:', secondaryEls.map(el => el.textContent.trim()));
        }

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
            isExtendedThinking: isThinking,
            lastRpc: window.AskGemini.lastModelSwitch,
            pickerText: primaryEls.map(el => el.textContent.trim()),
            secondaryText: secondaryEls.map(el => el.textContent.trim()),
            menuItemsCount: menuItems.length
        };
    };

    window.AskGemini.testBanner = function(featureId) {
        document.dispatchEvent(new CustomEvent('AG_TEST_FEATURE_BANNER', {
            detail: { featureId: featureId || 'bookmarks_v1' }
        }));
    };
    window.AskGemini.showFeatureBanner = function() {
        document.dispatchEvent(new CustomEvent('AG_TEST_FEATURE_BANNER', {
            detail: { featureId: 'bookmarks_v1' }
        }));
    };

    // ── SPA Navigation & Route Change Interceptor ──────────────────────────────
    var _origPushState = history.pushState;
    if (_origPushState) {
        history.pushState = function() {
            var ret = _origPushState.apply(this, arguments);
            try {
                document.dispatchEvent(new CustomEvent('AG_ROUTE_CHANGED', { detail: { url: location.href } }));
            } catch (e) {}
            return ret;
        };
    }

    var _origReplaceState = history.replaceState;
    if (_origReplaceState) {
        history.replaceState = function() {
            var ret = _origReplaceState.apply(this, arguments);
            try {
                document.dispatchEvent(new CustomEvent('AG_ROUTE_CHANGED', { detail: { url: location.href } }));
            } catch (e) {}
            return ret;
        };
    }

    window.addEventListener('popstate', function() {
        try {
            document.dispatchEvent(new CustomEvent('AG_ROUTE_CHANGED', { detail: { url: location.href } }));
        } catch (e) {}
    });

    // ── Google RPC Session Tokens & Header Interceptor ──────────────────────────
    var _geminiRpcState = {
        latestReqId: null,
        extHeaders: {}
    };

    // Intercept XMLHttpRequest to capture dynamic x-goog-ext-* protobuf headers and _reqid
    var _rawXHR = window.XMLHttpRequest;
    if (_rawXHR && _rawXHR.prototype) {
        var _rawOpen = _rawXHR.prototype.open;
        var _rawSetRequestHeader = _rawXHR.prototype.setRequestHeader;
        var _rawSend = _rawXHR.prototype.send;

        _rawXHR.prototype.open = function(method, url) {
            this.__agUrl = url;
            this.__agHeaders = {};
            if (url && typeof url === 'string' && url.includes('/_/BardChatUi/data/batchexecute')) {
                try {
                    var parsed = new URL(url, location.origin);
                    var reqId = parsed.searchParams.get('_reqid');
                    if (reqId) {
                        _geminiRpcState.latestReqId = reqId;
                    }
                } catch (e) {}
            }
            return _rawOpen.apply(this, arguments);
        };

        _rawXHR.prototype.setRequestHeader = function(header, value) {
            if (this.__agUrl && /^x-goog-ext-/i.test(header || '')) {
                this.__agHeaders[header] = value;
            }
            return _rawSetRequestHeader.apply(this, arguments);
        };

        _rawXHR.prototype.send = function() {
            if (this.__agUrl && typeof this.__agUrl === 'string' && this.__agUrl.includes('rpcids=hNvQHb') && this.__agHeaders) {
                Object.assign(_geminiRpcState.extHeaders, this.__agHeaders);
            }
            return _rawSend.apply(this, arguments);
        };
    }

    function getGeminiTokens() {
        var wiz = window.WIZ_global_data;
        if (!wiz || typeof wiz !== 'object') return null;
        var requiredKeys = ['SNlM0e', 'FdrFJe', 'cfb2h', 'Im6cmf'];
        var tokens = {};
        for (var i = 0; i < requiredKeys.length; i++) {
            var k = requiredKeys[i];
            if (typeof wiz[k] === 'string') {
                tokens[k] = wiz[k];
            }
        }
        return tokens;
    }

    window.AskGemini.getRpcTokens = function() {
        var tokens = getGeminiTokens();
        var res = {
            hasTokens: Boolean(tokens && tokens.SNlM0e),
            tokens: tokens,
            extHeaders: _geminiRpcState.extHeaders,
            latestReqId: _geminiRpcState.latestReqId
        };
        console.group('[Ask Gemini] WIZ Session Tokens');
        console.log('Tokens detected:', res.hasTokens);
        if (tokens) {
            console.log('SNlM0e (at):', tokens.SNlM0e ? tokens.SNlM0e.slice(0, 15) + '...' : 'none');
            console.log('FdrFJe (f.sid):', tokens.FdrFJe || 'none');
            console.log('cfb2h (bl):', tokens.cfb2h || 'none');
        } else {
            console.warn('WIZ_global_data not found or incomplete yet.');
        }
        console.log('Intercepted x-goog-ext-* headers:', Object.keys(_geminiRpcState.extHeaders).length);
        console.groupEnd();
        return res;
    };

    // Bridge event listener for Content Script queries
    document.addEventListener('AG_RPC_GET_SESSION_TOKENS', function(e) {
        var reqId = e.detail && e.detail.id;
        var sessionData = window.AskGemini.getRpcTokens();
        document.dispatchEvent(new CustomEvent('AG_RPC_SESSION_TOKENS_RESPONSE', {
            detail: {
                id: reqId,
                sessionData: sessionData
            }
        }));
    });
})();

