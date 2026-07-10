/**
 * Powerbox for Gemini - content.js
 * Consolidated content script containing modular features:
 * 1. Quote Reply (Floating button, input injection, click-to-scroll)
 * 2. Advanced Usage Tracker (Sidebar quota indicator)
 * 3. Chat Exporter (PDF conversion button & DOM parser)
 */
'use strict';

(function() {
    let settings = {
        quote_reply_enabled: true,
        usage_tracker_enabled: true,
        pdf_exporter_enabled: true
    };

    // Icons library
    const ICONS = {
        ask: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        star: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        export: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
    };

    // Helper: Send event tracking
    function trackEvent(name, params = {}) {
        chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name, params });
    }

    // Helper: Send rating event
    function recordRatingEvent(name, params = {}) {
        chrome.runtime.sendMessage({ type: 'RECORD_RATING_EVENT', name, params });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // MODULE 1: QUOTE REPLY
    // ═══════════════════════════════════════════════════════════════════════════════
    let floatButton = null;
    let contextBox = null;
    let currentContext = null;
    let isInjecting = false;
    let isTipTemporarilyDismissed = false;
    let originalPlaceholder = '';

    function findInputArea() {
        return document.querySelector('.ql-editor[contenteditable="true"]')
            || document.querySelector('div[contenteditable="true"][aria-label*="rompt"]')
            || document.querySelector('div[contenteditable="true"][role="textbox"]')
            || document.querySelector('div[contenteditable="true"]');
    }

    function findSendButton() {
        return document.querySelector('button[aria-label="Send message"]')
            || document.querySelector('button[aria-label*="Send"]')
            || document.querySelector('button.send-button')
            || document.querySelector('button[data-test-id*="send"]');
    }

    function handleSelection() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text.length > 0 && text.length < 5000) {
            showFloatButton(selection);
            isTipTemporarilyDismissed = true;
            evaluateRetentionTip().catch(console.error);
        } else {
            hideFloatButton();
        }
    }

    function showFloatButton(selection) {
        if (!floatButton) {
            floatButton = document.createElement('button');
            floatButton.id = 'ask-gemini-float-btn';
            floatButton.innerHTML = `<span>${ICONS.ask} Ask Gemini</span>`;
            floatButton.onclick = (e) => {
                e.preventDefault();
                activateContext(selection.toString());
                hideFloatButton();
            };
            document.body.appendChild(floatButton);
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        floatButton.style.top = `${rect.top + window.scrollY - 45}px`;
        floatButton.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 60}px`;
        floatButton.style.display = 'flex';
    }

    function hideFloatButton() {
        if (floatButton) floatButton.style.display = 'none';
    }

    function activateContext(text) {
        currentContext = text;
        renderContextBox();
        const input = findInputArea();
        if (input) input.focus();
        evaluateRetentionTip().catch(console.error);
    }

    function renderContextBox() {
        const input = findInputArea();
        if (!input) return;
        const container = input.closest('.text-input-field');
        if (!container) return;

        if (!contextBox) {
            contextBox = document.createElement('div');
            contextBox.id = 'ask-gemini-context-box';
            contextBox.innerHTML = `
                <span class="ask-gemini-draft-icon">${ICONS.reply}</span>
                <button type="button" class="ask-gemini-draft-content" aria-label="Replying to">
                    <span id="ask-gemini-context-content"></span>
                </button>
                <button type="button" class="ask-gemini-draft-close" aria-label="Remove">${ICONS.close}</button>
            `;
            contextBox.querySelector('.ask-gemini-draft-close').onclick = clearContext;
        }
        if (contextBox.parentElement !== container) {
            container.prepend(contextBox);
        }
        document.getElementById('ask-gemini-context-content').innerText = `"${currentContext}"`;
        contextBox.style.display = 'flex';
    }

    function clearContext() {
        currentContext = null;
        if (contextBox) contextBox.style.display = 'none';
        evaluateRetentionTip().catch(console.error);
    }

    function composeReply(originalText, input, sendBtn) {
        if (isInjecting) return false;
        isInjecting = true;
        try {
            const contextBlock = `I'm replying to this:\n"${currentContext.trim()}"\n\n`;
            const composed = contextBlock + originalText;
            const originalColor = input.style.color;
            input.style.color = 'transparent';

            input.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, composed);

            requestAnimationFrame(() => {
                clearContext();
                sendBtn.click();
                chrome.storage.local.get(['reply_count_lifetime'], (res) => {
                    const count = (res.reply_count_lifetime || 0) + 1;
                    chrome.storage.local.set({
                        reply_count_lifetime: count,
                        last_reply_time: Date.now(),
                        gemini_visits_since_last_reply: 0
                    }, () => {
                        evaluateRetentionTip().catch(console.error);
                    });
                });
                setTimeout(() => {
                    input.style.color = originalColor || '';
                    isInjecting = false;
                }, 50);
            });

            trackEvent('context_reply_sent', { length: currentContext.length });
            recordRatingEvent('context_reply_sent');
            return true;
        } catch (err) {
            input.style.color = '';
            isInjecting = false;
            return false;
        }
    }

    // Intercept Enter key/Click on send
    function setupInputInterception() {
        document.addEventListener('keydown', (e) => {
            if (!settings.quote_reply_enabled || !currentContext) return;
            if (e.key === 'Enter' && !e.shiftKey) {
                const input = findInputArea();
                if (input && document.activeElement === input) {
                    const originalText = input.innerText.trim();
                    const sendBtn = findSendButton();
                    if (sendBtn) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        composeReply(originalText, input, sendBtn);
                    }
                }
            }
        }, true);

        document.addEventListener('click', (e) => {
            if (!settings.quote_reply_enabled || !currentContext) return;
            const sendBtn = findSendButton();
            if (sendBtn && (e.target === sendBtn || sendBtn.contains(e.target))) {
                const input = findInputArea();
                if (input) {
                    const originalText = input.innerText.trim();
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    composeReply(originalText, input, sendBtn);
                }
            }
        }, true);
    }

    // Beautify Chat History Quotes (Click to Scroll)
    function transformMessages() {
        if (!settings.quote_reply_enabled) return;
        const messages = document.querySelectorAll('user-query .query-text-line, ms-user-query .query-text-line');
        messages.forEach(msg => {
            if (msg.dataset.transformed) return;
            const text = msg.innerText;
            const match = text.match(/^I'm replying to this:\n"([\s\S]*?)"\n\n([\s\S]*)$/m);
            if (match) {
                const quote = match[1];
                const reply = match[2];
                msg.innerHTML = '';

                const proxy = document.createElement('div');
                proxy.className = 'ask-gemini-transformed-proxy';
                proxy.innerHTML = `
                    <div class="ask-gemini-proxy-content">
                        <button type="button" class="ask-gemini-reply-preview">
                            <span class="ask-gemini-reply-icon">${ICONS.reply}</span>
                            <div class="ask-gemini-reply-text-wrapper">
                                <p class="ask-gemini-reply-text">${escapeHtml(quote)}</p>
                            </div>
                        </button>
                        <div class="ask-gemini-message-bubble">
                            <div class="ask-gemini-bubble-text">
                                <p>${escapeHtml(reply).replace(/\n/g, '<br>')}</p>
                            </div>
                        </div>
                    </div>
                `;

                // Add Click-to-Scroll anchor handler
                proxy.querySelector('.ask-gemini-reply-preview').onclick = (e) => {
                    e.preventDefault();
                    anchorSearchAndScroll(quote);
                };

                msg.appendChild(proxy);
                msg.dataset.transformed = 'true';
            }
        });
    }

    function anchorSearchAndScroll(quoteText) {
        const textTarget = quoteText.trim();
        if (!textTarget) return;

        // Traverse deep shadow DOM to search chat bubbles
        function deepShadowSearch(root) {
            const cards = root.querySelectorAll('model-response, ms-model-response, .response-container-content');
            for (const card of cards) {
                if (card.innerText.includes(textTarget)) {
                    return card;
                }
            }
            const all = root.querySelectorAll('*');
            for (let i = 0; i < all.length; i++) {
                if (all[i].shadowRoot) {
                    const found = deepShadowSearch(all[i].shadowRoot);
                    if (found) return found;
                }
            }
            return null;
        }

        const matchNode = deepShadowSearch(document);
        if (matchNode) {
            matchNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            matchNode.style.transition = 'outline 0.2s ease-in-out';
            matchNode.style.outline = '2px solid var(--ask-gemini-primary, #a8c7fa)';
            setTimeout(() => {
                matchNode.style.outline = 'none';
            }, 1500);
        }
    }

    async function evaluateRetentionTip() {
        const input = findInputArea();
        if (!input) return;
        
        const res = await chrome.storage.local.get(['reply_count_lifetime', 'gemini_visits_since_last_reply']);
        const count = res.reply_count_lifetime || 0;
        const visits = res.gemini_visits_since_last_reply || 0;

        if (count < 5 && visits >= 2 && !currentContext && !isTipTemporarilyDismissed) {
            const ph = input.getAttribute('placeholder');
            if (ph && ph !== 'Highlight any text to quote-reply.') {
                originalPlaceholder = ph;
            }
            input.setAttribute('placeholder', 'Highlight any text to quote-reply.');
        } else if (originalPlaceholder) {
            input.setAttribute('placeholder', originalPlaceholder);
        }
    }

    function initQuoteReply() {
        document.addEventListener('selectionchange', handleSelection);
        document.addEventListener('mouseup', handleSelection);
        setupInputInterception();
    }

    function destroyQuoteReply() {
        document.removeEventListener('selectionchange', handleSelection);
        document.removeEventListener('mouseup', handleSelection);
        hideFloatButton();
        clearContext();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // MODULE 2: LIMITS TRACKER (SIDEBAR CARD)
    // ═══════════════════════════════════════════════════════════════════════════════
    let usageCard = null;

    function updateQuotaDisplay(limits) {
        if (!settings.usage_tracker_enabled || !limits) return;

        const isAdvancedDom = document.body.innerText.includes('Gemini Advanced')
            || !!document.querySelector('a[href*="/app"] svg[aria-label*="Advanced"]')
            || !!document.querySelector('a[href*="/app"] img[src*="advanced"]');
            
        const isPro = limits.isProUser !== false && (limits.isProUser || isAdvancedDom);

        if (!isPro) {
            const card = document.getElementById('ag-quota-sidebar');
            if (card) card.remove();
            return;
        }

        const currentUsage = limits.currentUsage || 0;
        const resetTime = limits.resetTime || '';

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
                    <div class="ag-sidebar-usage-fill" style="width: ${currentUsage}%; background-color: ${currentUsage > 80 ? '#ea4335' : currentUsage > 50 ? '#fbbc05' : '#a8c7fa'}"></div>
                </div>
                ${resetTime ? `<div class="ag-sidebar-usage-reset">Resets at ${resetTime}</div>` : ''}
            `;

            // Bind refresh action
            const refreshBtn = card.querySelector('#ag-quota-refresh-btn');
            if (refreshBtn) {
                refreshBtn.onclick = (e) => {
                    e.preventDefault();
                    refreshBtn.classList.add('spinning');
                    chrome.runtime.sendMessage({ type: 'GET_USAGE_LIMITS' }, (response) => {
                        refreshBtn.classList.remove('spinning');
                        if (response && response.limits) {
                            updateQuotaDisplay(response.limits);
                        }
                    });
                };
            }
        }
    }

    function requestUsageLimits() {
        if (!settings.usage_tracker_enabled) return;
        chrome.runtime.sendMessage({ type: 'GET_USAGE_LIMITS' }, (response) => {
            if (response && response.limits) {
                updateQuotaDisplay(response.limits);
            }
        });
    }

    function initUsageTracker() {
        requestUsageLimits();
        
        // Auto-refresh when prompt is submitted
        const input = findInputArea();
        if (input) {
            const triggerRefresh = () => {
                setTimeout(() => {
                    const refreshBtn = document.getElementById('ag-quota-refresh-btn');
                    if (refreshBtn) refreshBtn.click();
                }, 1000);
            };
            input.addEventListener('focus', triggerRefresh);
            input.addEventListener('click', triggerRefresh);
        }
    }

    function destroyUsageTracker() {
        const card = document.getElementById('ag-quota-sidebar');
        if (card) card.remove();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // MODULE 3: CHAT EXPORTER (PDF GENERATOR)
    // ═══════════════════════════════════════════════════════════════════════════════
    let exportBtn = null;

    function deepShadowAll(sel) {
        const found = [];
        const visited = new WeakSet();
        function walk(root) {
            if (visited.has(root)) return;
            visited.add(root);
            try {
                root.querySelectorAll(sel).forEach(n => found.push(n));
            } catch(e) {}
            try {
                root.querySelectorAll('*').forEach(el => {
                    if (el.shadowRoot) walk(el.shadowRoot);
                });
            } catch(e) {}
        }
        walk(document);
        return found;
    }

    function parseCurrentChat() {
        const msgs = [], ts = {}, cm = {}, am = {};
        let ti = 1, ci = 1, fi = 1;
        let pairs = [];

        // Strategy 1: ms-chat-turn
        const msChatTurns = deepShadowAll('ms-chat-turn');
        if (msChatTurns.length > 0) {
            msChatTurns.forEach(turn => {
                const model = (turn.getAttribute('model') || '').toLowerCase();
                pairs.push({ node: turn, role: model === 'user' ? 'u' : 'a' });
            });
        }

        // Strategy 2: user-query & model-response
        if (!pairs.length) {
            const userNodes = deepShadowAll('user-query, ms-user-query');
            const aiNodes   = deepShadowAll('model-response, ms-model-response');
            userNodes.forEach(n => pairs.push({ node: n, role: 'u' }));
            aiNodes.forEach(n   => pairs.push({ node: n, role: 'a' }));
        }

        if (!pairs.length) return null;

        // Sort DOM nodes chronologically
        pairs.sort((a, b) => a.node.compareDocumentPosition(b.node) & 4 ? -1 : 1);

        // Deduplicate
        const deduped = [];
        pairs.forEach(p => {
            if (!deduped.some(q => q.node.contains(p.node) || p.node.contains(q.node))) deduped.push(p);
        });

        deduped.forEach(({ node, role }) => {
            const tId = 't' + ti++;
            ts[tId] = new Date().toISOString();

            // Extract code blocks
            const codeRefs = [];
            node.querySelectorAll('pre, code-block').forEach(pre => {
                const codeEl = pre.querySelector('code') || pre;
                let lang = '';
                for (const cls of codeEl.classList) {
                    if (cls.startsWith('language-')) { lang = cls.slice(9).toLowerCase(); break; }
                }
                const body = (codeEl.innerText || codeEl.textContent || '').trim();
                if (body && body.length >= 10) {
                    const cId = 'c' + ci++;
                    cm[cId] = [lang || 'text', body];
                    codeRefs.push(cId);
                }
            });

            // Extract plain text (excluding layout controls/buttons)
            const clone = node.cloneNode(true);
            ["pre", "button", "svg", "[aria-hidden='true']", "ms-copy-button", "ms-chat-turn-actions", "ms-vote-buttons"].forEach(s => {
                try { clone.querySelectorAll(s).forEach(e => e.remove()); } catch(e){}
            });
            const text = clone.innerText.trim().replace(/\n{3,}/g, '\n\n');

            const contentBlock = { txt: text };
            if (codeRefs.length > 0) contentBlock.c = codeRefs;

            msgs.push([role, tId, contentBlock]);
        });

        const chatTitle = document.querySelector('h1[class*="chat-title"]')?.innerText
            || document.querySelector('title')?.innerText.split(' - ')[0]
            || 'Gemini Chat Export';

        return { p: 'gemini', m: msgs, c: cm, t: ts, chatTitle };
    }

    function injectExportButton() {
        if (!settings.pdf_exporter_enabled) return;
        if (document.getElementById('ag-export-pdf-btn')) return;

        // Target placement: next to chat actions or top header bar
        const header = document.querySelector('header')
            || document.querySelector('[class*="chat-header"]')
            || document.querySelector('[class*="header-actions"]');
        
        if (header) {
            exportBtn = document.createElement('button');
            exportBtn.id = 'ag-export-pdf-btn';
            exportBtn.innerHTML = `${ICONS.export} Export PDF`;
            exportBtn.title = 'Save conversation to PDF';

            exportBtn.onclick = (e) => {
                e.preventDefault();
                const data = parseCurrentChat();
                if (!data || !data.m.length) {
                    alert('No chat data found on screen. Try loading a conversation first.');
                    return;
                }
                chrome.runtime.sendMessage({ type: 'OPEN_PDF_PREVIEW', data });
            };

            document.body.appendChild(exportBtn);
        }
    }

    function destroyExporter() {
        const btn = document.getElementById('ag-export-pdf-btn');
        if (btn) btn.remove();
    }

    function initExporter() {
        injectExportButton();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // MODULES ROUTING AND LIFE-CYCLE
    // ═══════════════════════════════════════════════════════════════════════════════
    function syncModules() {
        if (settings.quote_reply_enabled) initQuoteReply();
        else destroyQuoteReply();

        if (settings.usage_tracker_enabled) initUsageTracker();
        else destroyUsageTracker();

        if (settings.pdf_exporter_enabled) initExporter();
        else destroyExporter();
    }

    async function loadSettingsAndBootstrap() {
        const res = await chrome.storage.local.get(['powerbox_settings']);
        if (res.powerbox_settings) {
            settings = { ...settings, ...res.powerbox_settings };
        }
        
        syncModules();

        // Listen for setting changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.powerbox_settings) {
                settings = { ...settings, ...changes.powerbox_settings.newValue };
                syncModules();
            }
        });

        // Initialize general mutations observer
        const observer = new MutationObserver(() => {
            transformMessages();
            if (settings.pdf_exporter_enabled && !document.getElementById('ag-export-pdf-btn')) {
                injectExportButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Update visits metrics for rating evaluation
        chrome.storage.local.get(['gemini_visits_since_last_reply'], (data) => {
            const count = (data.gemini_visits_since_last_reply || 0) + 1;
            chrome.storage.local.set({ gemini_visits_since_last_reply: count });
        });
    }

    // Listen for rating trigger messages
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SHOW_RATING_PROMPT') {
            showRatingModal();
        } else if (message.type === 'USAGE_LIMITS_UPDATED') {
            updateQuotaDisplay(message.limits);
        }
    });

    // Rating Prompt Modal injection
    function showRatingModal() {
        if (document.querySelector('.ag-rating-modal')) return;

        const modal = document.createElement('div');
        modal.className = 'ag-rating-modal';
        modal.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            background: var(--ag-surface-2, #322f37);
            border: 1px solid var(--ag-border, rgba(255, 255, 255, 0.08));
            border-radius: 16px; padding: 18px; width: 280px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.4);
            font-family: 'Google Sans', 'Roboto', sans-serif;
            color: var(--ag-text, #ffffff);
            animation: ask-gemini-fade-in 0.3s ease;
        `;
        modal.innerHTML = `
            <button class="ag-rating-close" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--ag-text-dim, #9aa0a6); cursor: pointer;">${ICONS.close}</button>
            <h3 style="margin: 0 0 6px; font-size: 14px; font-weight: 600; text-align: center;">Enjoying Powerbox?</h3>
            <p style="margin: 0 0 14px; font-size: 11.5px; color: var(--ag-text-dim, #9aa0a6); text-align: center; line-height: 1.4;">Tap a star to rate your experience.</p>
            <div style="display: flex; justify-content: center; gap: 8px;">
                <button class="ag-star-btn" data-value="1" style="background:none; border:none; color:#5f6368; cursor:pointer;">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="2" style="background:none; border:none; color:#5f6368; cursor:pointer;">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="3" style="background:none; border:none; color:#5f6368; cursor:pointer;">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="4" style="background:none; border:none; color:#5f6368; cursor:pointer;">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="5" style="background:none; border:none; color:#5f6368; cursor:pointer;">${ICONS.star}</button>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.ag-rating-close').onclick = () => {
            chrome.runtime.sendMessage({ type: 'UPDATE_RATING_STATUS', status: 'dismissed' });
            modal.remove();
        };

        const stars = modal.querySelectorAll('.ag-star-btn');
        stars.forEach(btn => {
            btn.onmouseover = () => {
                const val = parseInt(btn.dataset.value);
                stars.forEach((s, idx) => s.style.color = idx < val ? '#fbbc05' : '#5f6368');
            };
            btn.onclick = () => {
                const val = parseInt(btn.dataset.value);
                if (val >= 4) {
                    chrome.runtime.sendMessage({ type: 'UPDATE_RATING_STATUS', status: 'rated' });
                    chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                } else {
                    chrome.runtime.sendMessage({ type: 'UPDATE_RATING_STATUS', status: 'feedback_given' });
                    window.open('https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform', '_blank');
                }
                modal.remove();
            };
        });
    }

    // Helper: HTML escaper
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Run loader
    const readyStateCheckInterval = setInterval(() => {
        if (document.readyState === "complete") {
            clearInterval(readyStateCheckInterval);
            loadSettingsAndBootstrap().catch(console.error);
        }
    }, 10);
})();
