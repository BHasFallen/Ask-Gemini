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
        export: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`
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
    let retentionTipTimeout = null;
    let isFreeUser = false;

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
    function scrollToAndHighlightText(textToFind) {
        if (!textToFind) return;
        const cleanText = textToFind.trim();
        if (cleanText.length === 0) return;

        const candidates = document.querySelectorAll([
            'model-response', 'ms-model-response', 'ms-chat-turn', 'ms-chat-turn-response',
            '.model-response', '.message-content', '.markdown-main-panel',
            '.model-response-text', 'message-content', '.query-text',
            '.user-query-bubble-with-background'
        ].join(', '));

        let targetElement = null;

        for (const el of candidates) {
            if (el.closest('.ask-gemini-transformed-proxy')) continue;

            const contentText = el.textContent || "";
            if (contentText.includes(cleanText)) {
                targetElement = el;
                const subElements = el.querySelectorAll('p, span, li, h1, h2, h3, code');
                for (const subEl of subElements) {
                    if (subEl.textContent.includes(cleanText)) {
                        targetElement = subEl;
                    }
                }
                break;
            }
        }

        if (targetElement) {
            const walk = document.createTreeWalker(targetElement, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let foundTextNode = false;

            while (node = walk.nextNode()) {
                const index = node.nodeValue.indexOf(cleanText);
                if (index !== -1) {
                    foundTextNode = true;
                    const parent = node.parentNode;
                    
                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = 'ag-text-highlight-blink';
                    highlightSpan.textContent = cleanText;

                    const beforeText = node.nodeValue.substring(0, index);
                    const afterText = node.nodeValue.substring(index + cleanText.length);

                    const beforeNode = document.createTextNode(beforeText);
                    const afterNode = document.createTextNode(afterText);

                    parent.insertBefore(beforeNode, node);
                    parent.insertBefore(highlightSpan, node);
                    parent.insertBefore(afterNode, node);
                    parent.removeChild(node);

                    highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    setTimeout(() => {
                        if (highlightSpan.parentNode) {
                            const mergedText = beforeText + cleanText + afterText;
                            const restoredNode = document.createTextNode(mergedText);
                            const pNode = highlightSpan.parentNode;
                            pNode.insertBefore(restoredNode, beforeNode);
                            pNode.removeChild(beforeNode);
                            pNode.removeChild(highlightSpan);
                            pNode.removeChild(afterNode);
                            pNode.normalize();
                        }
                    }, MergedBlinkHighlightTimeout());
                    
                    break;
                }
            }

            if (!foundTextNode) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetElement.classList.add('ag-text-highlight-blink');
                setTimeout(() => {
                    targetElement.classList.remove('ag-text-highlight-blink');
                }, 2000);
            }
        }
    }

    function MergedBlinkHighlightTimeout() {
        return 2000;
    }

    function transformMessages() {
        if (!settings.quote_reply_enabled) return;
        const PREFIX = "I'm replying to this:";
        const PREFIX_CURLY = "I\u2019m replying to this:";
        
        const candidates = document.querySelectorAll('.query-text, .user-query-bubble-with-background, p.query-text-line, [data-test-id="user-query"]');
        
        candidates.forEach(el => {
            if (el.hasAttribute('data-ag-processed')) return;
            
            const text = el.textContent || "";
            const hasPrefix = text.includes(PREFIX) || text.includes(PREFIX_CURLY);
            
            if (hasPrefix && text.includes('"')) {
                const prefixUsed = text.includes(PREFIX) ? PREFIX : PREFIX_CURLY;
                const afterPrefix = text.substring(text.indexOf(prefixUsed) + prefixUsed.length);
                
                const firstQuote = afterPrefix.indexOf('"');
                const lastQuote = afterPrefix.lastIndexOf('"');
                
                if (firstQuote === -1 || lastQuote === -1 || firstQuote === lastQuote) return;

                const context = afterPrefix.substring(firstQuote + 1, lastQuote).trim();
                let actualMessage = afterPrefix.substring(lastQuote + 1).trim();

                actualMessage = actualMessage.replace(/^⟦◈⟧\s*/, '').trim();

                if (!context || !actualMessage) return;

                const chipHtml = `
                    <div class="ask-gemini-proxy-content">
                        <button class="ask-gemini-reply-preview" type="button">
                            <div class="ask-gemini-reply-icon">${ICONS.reply}</div>
                            <div class="ask-gemini-reply-text-wrapper">
                                <p class="ask-gemini-reply-text">${context}</p>
                            </div>
                        </button>
                        <div class="ask-gemini-message-bubble">
                            <div class="ask-gemini-bubble-text"><p>${actualMessage}</p></div>
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
                    btn.onclick = () => scrollToAndHighlightText(context);
                }
                
                wrapper.appendChild(proxy);
                
                wrapper.setAttribute('data-ag-processed', 'true');
                wrapper.querySelectorAll('*').forEach(child => child.setAttribute('data-ag-processed', 'true'));
            }
        });
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
            isFreeUser = true;
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
                    chrome.runtime.sendMessage({ type: 'FORCE_REFRESH_USAGE_LIMITS' }, (response) => {
                        refreshBtn.classList.remove('spinning');
                        if (response && response.success && response.limits) {
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
            if (response && response.success && response.limits) {
                updateQuotaDisplay(response.limits);
            }
        });
    }

    function checkAndInjectQuota() {
        if (!settings.usage_tracker_enabled || isFreeUser) return;
        const hasSidebar = document.getElementById('ag-quota-sidebar');
        
        if (!hasSidebar) {
            requestUsageLimits();
        } else {
            // Automatically update visibility in case sidebar collapsed state changed
            const sidebarFooter = document.querySelector('.mavatar-footer-left')?.closest('div')
                || document.querySelector('.mavatar-footer-left')
                || document.querySelector('div[class*="sidebar"] footer')
                || document.querySelector('div[class*="lower-sidebar"]');
            const isCollapsed = !!document.querySelector('button[aria-label*="Expand"]')
                || !document.querySelector('button[aria-label*="Close"]')
                || (sidebarFooter && sidebarFooter.getBoundingClientRect().width < 150);
            hasSidebar.style.display = isCollapsed ? 'none' : 'block';
        }
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



    function exportChatAsPdf() {
        if (exportBtn.disabled) return;

        const originalBtnHTML = exportBtn.innerHTML;
        exportBtn.innerHTML = `<span class="ag-btn-spinner"></span> Exporting...`;
        exportBtn.disabled = true;
        exportBtn.style.opacity = '0.7';
        exportBtn.style.cursor = 'not-allowed';

        function restoreBtn() {
            exportBtn.innerHTML = originalBtnHTML;
            exportBtn.disabled = false;
            exportBtn.style.opacity = '1';
            exportBtn.style.cursor = 'pointer';
        }

        function getScrollContainer() {
            const candidates = [
                document.querySelector('infinite-scroller[data-test-id="chat-history-container"]'),
                document.querySelector('#chat-history infinite-scroller'),
                document.querySelector('infinite-scroller'),
                document.querySelector('.chat-history'),
                document.querySelector('main')
            ];
            for (const el of candidates) {
                if (el && el.scrollHeight > el.clientHeight) return el;
            }
            return document.body;
        }

        const scroller = getScrollContainer();
        const originalScrollTop = scroller.scrollTop;

        // Gemini virtualizes the DOM — only messages near the current scroll position
        // are rendered at any time. We scroll to the absolute top of the chat, wait for
        // all prepend history to load, and then scroll down to harvest messages in
        // chronological order. Deduplication by fingerprint prevents virtual-DOM swaps
        // from creating duplicate entries.
        const harvestedNodes = [];
        const seenFingerprints = new Set();

        function harvestContainerNode(container) {
            const fp = (container.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 120);
            if (!fp || seenFingerprints.has(fp)) return;
            seenFingerprints.add(fp);

            // ── USER MESSAGE ──────────────────────────────────────────────────
            const userQueryEl = container.querySelector('user-query, ms-chat-turn');
            if (userQueryEl) {
                let userText = '';
                let contextText = '';

                const replyPreviewEl = userQueryEl.querySelector('.ask-gemini-reply-preview');
                const bubbleTextEl   = userQueryEl.querySelector('.ask-gemini-bubble-text');

                if (replyPreviewEl && bubbleTextEl) {
                    contextText = (replyPreviewEl.querySelector('.ask-gemini-reply-text')?.innerText || '').trim();
                    userText = (bubbleTextEl.querySelector('p')?.innerText || bubbleTextEl.innerText || '').trim();
                }

                if (!userText) {
                    const trySelectors = [
                        'p.query-text-line', '.query-text-line',
                        '.ask-gemini-bubble-text', '.ask-gemini-message-bubble',
                        'ms-prompt-chunk', 'ms-text-chunk',
                        '[data-test-id="user-query-text"]', '[data-test-id="request-content"]',
                    ];
                    for (const sel of trySelectors) {
                        const nodes = Array.from(userQueryEl.querySelectorAll(sel));
                        if (nodes.length > 0) {
                            userText = nodes.map(n => (n.innerText || n.textContent || '').trim()).filter(Boolean).join('\n').trim();
                            if (userText) break;
                        }
                    }
                    if (!userText) {
                        const bubble = userQueryEl.querySelector('.user-query-bubble-with-background');
                        userText = ((bubble || userQueryEl).innerText || (bubble || userQueryEl).textContent || '')
                            .replace(/^You said:\s*/i, '').trim();
                    }
                    const PREFIX = "I'm replying to this:";
                    const PREFIX_CURLY = "I\u2019m replying to this:";
                    if (userText && (userText.includes(PREFIX) || userText.includes(PREFIX_CURLY))) {
                        const prefixUsed = userText.includes(PREFIX) ? PREFIX : PREFIX_CURLY;
                        const afterPrefix = userText.substring(userText.indexOf(prefixUsed) + prefixUsed.length);
                        const firstQuote = afterPrefix.indexOf('"');
                        const lastQuote  = afterPrefix.lastIndexOf('"');
                        if (firstQuote !== -1 && lastQuote !== -1 && firstQuote !== lastQuote) {
                            contextText = afterPrefix.substring(firstQuote + 1, lastQuote).trim();
                            userText = afterPrefix.substring(lastQuote + 1).replace(/^⟦◈⟧\s*/, '').trim();
                        }
                    }
                }

                if (userText) {
                    const row = document.createElement('div');
                    row.className = 'ag-user-row';
                    const contentWrapper = document.createElement('div');
                    contentWrapper.className = 'ag-user-content-wrapper';

                    if (contextText) {
                        const replyChip = document.createElement('div');
                        replyChip.className = 'ag-user-reply-preview';
                        const iconDiv = document.createElement('div');
                        iconDiv.className = 'ag-user-reply-icon';
                        iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`;
                        const textWrapper = document.createElement('div');
                        textWrapper.className = 'ag-user-reply-text-wrapper';
                        const quoteP = document.createElement('p');
                        quoteP.className = 'ag-user-reply-text';
                        quoteP.textContent = contextText;
                        textWrapper.appendChild(quoteP);
                        replyChip.appendChild(iconDiv);
                        replyChip.appendChild(textWrapper);
                        contentWrapper.appendChild(replyChip);
                    }

                    const bubble = document.createElement('div');
                    bubble.className = 'ag-user-bubble';
                    bubble.textContent = userText;
                    contentWrapper.appendChild(bubble);
                    row.appendChild(contentWrapper);
                    harvestedNodes.push(row);
                }
            }

            // ── MODEL RESPONSE ────────────────────────────────────────────────
            const modelResponseEl = container.querySelector('model-response, ms-model-response');
            if (modelResponseEl) {
                const markdownEl = modelResponseEl.querySelector(
                    '.markdown-main-panel, .markdown, [class*="markdown"], .model-response-text'
                );
                const responseRow = document.createElement('div');
                responseRow.className = 'ag-model-row';

                if (markdownEl) {
                    const mdClone = markdownEl.cloneNode(true);
                    mdClone.querySelectorAll(
                        'button, svg, .copy-button, ms-copy-button, source-footnote, ' +
                        'source-inline-chip, .citation-inline, [aria-hidden="true"], ' +
                        '.cdk-visually-hidden, .screen-reader-model-response-label'
                    ).forEach(el => el.remove());
                    responseRow.appendChild(mdClone);
                } else {
                    const rawText = (modelResponseEl.innerText || modelResponseEl.textContent || '').trim();
                    if (rawText) responseRow.textContent = rawText;
                }

                if (responseRow.textContent?.trim()) {
                    harvestedNodes.push(responseRow);
                }
            }
        }

        function harvestAll() {
            scroller.querySelectorAll('div.conversation-container').forEach(harvestContainerNode);
        }

        // Phase 1: scroll to top repeatedly to load older history.
        // Phase 2: reset and scroll down progressively, harvesting in visual order.
        function progressiveScrollAndHarvest(onComplete) {
            let prevSize = -1;
            let stableRounds = 0;

            function waitForTopLoad(cb) {
                scroller.scrollTop = 0;
                scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

                setTimeout(() => {
                    harvestAll();
                    const nowSize = seenFingerprints.size;
                    const hasSpinner = !!scroller.querySelector('mat-progress-spinner, [role="progressbar"], .loading-spinner');
                    if (nowSize > prevSize || hasSpinner) {
                        prevSize = nowSize;
                        stableRounds = 0;
                        waitForTopLoad(cb);
                    } else {
                        stableRounds++;
                        if (stableRounds < 4) { waitForTopLoad(cb); }
                        else { cb(); }
                    }
                }, 1200);
            }

            waitForTopLoad(() => {
                // Clear harvesting state, start fresh from absolute top to bottom
                harvestedNodes.length = 0;
                seenFingerprints.clear();

                scroller.scrollTop = 0;
                scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

                const STEP = 350;
                const WAIT = 800;

                function scrollDown() {
                    harvestAll();
                    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
                    if (scroller.scrollTop >= maxScroll - 10) {
                        setTimeout(() => { harvestAll(); onComplete(); }, 1200);
                        return;
                    }
                    scroller.scrollTop = Math.min(scroller.scrollTop + STEP, maxScroll);
                    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                    setTimeout(scrollDown, WAIT);
                }

                setTimeout(scrollDown, 500);
            });
        }

        progressiveScrollAndHarvest(() => {
            // Restore user scroll position now that harvesting is done
            scroller.scrollTop = originalScrollTop;

            if (harvestedNodes.length === 0) {
                restoreBtn();
                alert('Export failed: no conversation content found. Make sure the chat has messages and try again.');
                return;
            }

            const title = document.querySelector('h1[class*="chat-title"]')?.innerText
                || document.querySelector('title')?.innerText?.split(' - ')[0]
                || 'Gemini Chat Export';

            const chatBody = document.createElement('div');
            chatBody.id = 'ag-chat-body';
            for (const node of harvestedNodes) {
                chatBody.appendChild(node);
            }

            // ── Build the off-screen temp container ──────────────────────────────────
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = [
                'position:fixed', 'left:-9999px', 'top:0', 'width:800px',
                'height:auto', 'overflow:visible', 'background-color:#ffffff',
                'color:#1f1f1f', "font-family:'Google Sans','Roboto',Arial,sans-serif",
                'padding:40px 40px 60px 40px', 'box-sizing:border-box',
            ].join(';');

            const styleTag = document.createElement('style');
            styleTag.textContent = `
                .ag-user-row { display:flex; justify-content:flex-end; margin-bottom:20px; width:100%; }
                .ag-user-content-wrapper { display:flex; flex-direction:column; align-items:flex-end; max-width:75%; gap:4px; }
                .ag-user-bubble { background-color:#f0f4f9; border-radius:18px; padding:12px 18px; max-width:100%; color:#1f1f1f; font-size:15px; line-height:1.5; white-space:pre-wrap; word-wrap:break-word; display:block; }
                .ag-user-reply-preview { display:flex; flex-direction:row; align-items:center; gap:6px; padding:4px 8px; background:transparent; border:none; text-align:left; color:#5f6368; font-size:12px; max-width:100%; }
                .ag-user-reply-icon { display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#5f6368; }
                .ag-user-reply-icon svg { width:12px; height:12px; transform:scaleX(-1); stroke:currentColor; }
                .ag-user-reply-text-wrapper { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .ag-user-reply-text { margin:0; line-height:1.2; font-size:12px; color:#5f6368; }
                .ag-model-row { margin-bottom:28px; padding-left:4px; width:100%; }
                .markdown-main-panel, .markdown, [class*="markdown"] { color:#1f1f1f !important; font-size:15px; line-height:1.6; }
                .markdown-main-panel p, .markdown p { margin:0 0 12px 0; color:#1f1f1f; }
                .markdown-main-panel h1, .markdown-main-panel h2, .markdown-main-panel h3,
                .markdown h1, .markdown h2, .markdown h3 { color:#1f1f1f; margin:16px 0 8px 0; }
                .markdown-main-panel ul, .markdown-main-panel ol,
                .markdown ul, .markdown ol { color:#1f1f1f; padding-left:24px; margin:8px 0; }
                .markdown-main-panel li, .markdown li { margin-bottom:4px; }
                table { border-collapse:collapse; width:100%; margin:16px 0; font-size:13px; }
                th, td { padding:8px 12px; text-align:left; border:1px solid #e0e0e0; color:#1f1f1f; }
                th { background-color:#f0f4f9; font-weight:600; }
                pre, code { background-color:#f0f4f9 !important; border-radius:6px; font-family:'Courier New',monospace; font-size:13px; color:#1f1f1f !important; white-space:pre-wrap !important; word-wrap:break-word !important; }
                pre { padding:12px; margin:10px 0; }
                code { padding:2px 5px; }
                p, h1, h2, h3, li, pre, table, tr, .ag-user-row, .ag-model-row, .ag-user-bubble { page-break-inside:avoid !important; break-inside:avoid !important; }
                h1, h2, h3 { page-break-after:avoid !important; break-after:avoid !important; }
                * { animation:none !important; transition:none !important; }
                .cdk-visually-hidden, .screen-reader-user-query-label, .screen-reader-model-response-label,
                .citation-inline, source-footnote, source-inline-chip { display:none !important; }
                .ag-header { margin-bottom:24px; padding-bottom:14px; border-bottom:2px solid #e8eaed; }
                .ag-header h1 { margin:0 0 4px 0; font-size:20px; font-weight:500; color:#000; }
                .ag-header .ag-meta { font-size:11px; color:#5f6368; }
            `;
            tempContainer.appendChild(styleTag);

            const headerDiv = document.createElement('div');
            headerDiv.className = 'ag-header';
            headerDiv.innerHTML = `<h1>${escapeHtml(title)}</h1><div class="ag-meta">Exported via Powerbox on ${new Date().toLocaleString()}</div>`;
            tempContainer.appendChild(headerDiv);
            tempContainer.appendChild(chatBody);
            document.body.appendChild(tempContainer);

            // ── Sanitize modern CSS colors that crash html2canvas ────────────────────
            try {
                const propsToSanitize = ['color','background-color','border-color','border-top-color','border-right-color','border-bottom-color','border-left-color','fill','stroke','outline-color'];
                const modernColorRx = /color\(|color-mix\(|oklch\(|oklab\(|lch\(|lab\(/;
                Array.from(tempContainer.querySelectorAll('*')).forEach(el => {
                    const cs = window.getComputedStyle(el);
                    propsToSanitize.forEach(prop => {
                        const val = cs.getPropertyValue(prop);
                        if (val && modernColorRx.test(val)) {
                            let replacement = '#1f1f1f';
                            if (prop.includes('background')) replacement = 'transparent';
                            else if (prop.includes('border') || prop.includes('outline')) replacement = 'transparent';
                            else if (prop === 'fill' || prop === 'stroke') replacement = 'currentColor';
                            el.style.setProperty(prop, replacement, 'important');
                        }
                    });
                });
            } catch(e) {}

            // ── Serialize → storage → export tab ─────────────────────────────────────
            const htmlContent = tempContainer.innerHTML;
            tempContainer.remove();

            const cleanFileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'chat_export';

            chrome.storage.local.set({ pdf_export_data: { html: htmlContent, title: cleanFileName } }, () => {
                chrome.runtime.sendMessage({ type: 'START_PDF_EXPORT' });
                // Button UI restored via EXPORT_FINISHED broadcast from export.js
            });
        });
    }

    function injectExportButton() {
        if (!settings.pdf_exporter_enabled) return;
        
        const hasMessages = !!(document.querySelector('model-response, ms-model-response, .model-response, .message-content, ms-chat-turn'));
        if (!hasMessages) {
            destroyExporter();
            return;
        }

        if (document.getElementById('ag-export-pdf-btn')) return;

        exportBtn = document.createElement('button');
        exportBtn.id = 'ag-export-pdf-btn';
        exportBtn.innerHTML = `${ICONS.export} Export PDF`;
        exportBtn.title = 'Save conversation to PDF';

        exportBtn.onclick = (e) => {
            e.preventDefault();
            exportChatAsPdf();
        };

        document.body.appendChild(exportBtn);
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
            checkAndInjectQuota();
            if (settings.pdf_exporter_enabled) {
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
        } else if (message.type === 'EXPORT_FINISHED') {
            // Restore button UI on main tab
            if (exportBtn) {
                exportBtn.innerHTML = `${ICONS.export} Export PDF`;
                exportBtn.disabled = false;
                exportBtn.style.opacity = '1';
                exportBtn.style.cursor = 'pointer';
            }
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
            box-shadow: var(--ag-shadow, 0 4px 24px rgba(0,0,0,0.4));
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
