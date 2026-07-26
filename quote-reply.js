/**
 * Ask Gemini: Quote Reply Module
 * Handles text selection, float button, context box, injection, and message transformation.
 */

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
window.AskGemini.floatButton = null;
window.AskGemini.contextBox = null;
window.AskGemini.isInjecting = false;
window.AskGemini.retentionTipTimeout = null;
window.AskGemini.isTipTemporarilyDismissed = false;
window.AskGemini.lastRepliesCount = 0;

// ─── maybeInjectAndSend ───────────────────────────────────────────────────────
window.AskGemini.maybeInjectAndSend = function maybeInjectAndSend() {
    var AG = window.AskGemini;
    if (AG.isInjecting || !AG.currentContexts.length) return false;

    const input = AG.findInputArea();
    const sendBtn = AG.findSendButton();

    if (!input || !sendBtn) return false;

    AG.isInjecting = true;

    try {
        const originalText = input.innerText || "";
        const contextBlock = AG.currentContexts.length === 1
            ? `I'm replying to this:\n"${AG.currentContexts[0].trim()}"\n\n`
            : `I'm replying to these excerpts:\n${AG.currentContexts.map((q, i) => `${i + 1}. "${q.trim()}"`).join('\n')}\n\n`;
        const composed = contextBlock + originalText;

        // Step 1: Hide the technical string from user
        const originalColor = input.style.color;
        input.style.color = 'transparent';

        // Step 2: Inject directly into DOM
        input.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, composed);

        // Step 3: Trigger Send immediately
        requestAnimationFrame(() => {
            AG.clearContext();
            sendBtn.click();

            // Increment reply count and reset visits since last reply
            chrome.storage.local.get(['reply_count_lifetime'], (res) => {
                const count = (res.reply_count_lifetime || 0) + 1;
                chrome.storage.local.set({
                    reply_count_lifetime: count,
                    last_reply_time: Date.now(),
                    gemini_visits_since_last_reply: 0
                }, () => {
                    AG.evaluateRetentionTip().catch(console.error);
                });
            });

            // Step 4: Restore visibility after send triggers
            setTimeout(() => {
                input.style.color = originalColor || '';
                AG.isInjecting = false;
            }, 50);
        });

        const totalWords = AG.currentContexts.reduce((a, c) => a + c.trim().split(/\s+/).length, 0);
        AG.trackEvent('context_reply_sent', {
            length: AG.currentContexts.reduce((a, c) => a + c.length, 0),
            quote_count: AG.currentContexts.length,
            word_count: totalWords
        });
        return true;
    } catch (err) {
        input.style.color = '';
        AG.isInjecting = false;
        return false;
    }
};

// ─── handleSelection ──────────────────────────────────────────────────────────
window.AskGemini.handleSelection = function handleSelection() {
    var AG = window.AskGemini;
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length < 5000) {
        AG.showFloatButton(selection);
        AG.isTipTemporarilyDismissed = true;
        AG.evaluateRetentionTip().catch(console.error);
    } else {
        AG.hideFloatButton();
    }
};

// ─── showFloatButton ──────────────────────────────────────────────────────────
window.AskGemini.showFloatButton = function showFloatButton(selection) {
    var AG = window.AskGemini;
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
        };
        AG.floatButton.style.left = `${centerX - 75}px`;
    } else {
        // Normal single-quote mode: identical to before
        AG.floatButton.innerHTML = `<span>${AG.ICONS.ask} Ask Gemini</span>`;
        AG.floatButton.onclick = (e) => {
            e.preventDefault();
            AG.activateContext(text);
            AG.hideFloatButton();
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
        AG.contextBox.querySelector('.ask-gemini-draft-close').onclick = AG.clearContext;
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
    const cleanText = textToFind.trim();
    if (cleanText.length === 0) return;

    // Gather all text elements in the chat log (excluding transformed proxy components)
    const candidates = document.querySelectorAll(
        '.model-response, .message-content, .markdown-main-panel, message-content, .query-text, .user-query-bubble-with-background'
    );

    let targetElement = null;

    for (const el of candidates) {
        if (el.closest('.ask-gemini-transformed-proxy')) continue;

        const contentText = el.textContent || "";
        if (contentText.includes(cleanText)) {
            targetElement = el;
            // Drill down to more specific child elements if available
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
        // Traverse targetElement to find the exact text node containing the textToHighlight
        const walk = document.createTreeWalker(targetElement, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let foundTextNode = false;

        while (node = walk.nextNode()) {
            const index = node.nodeValue.indexOf(cleanText);
            if (index !== -1) {
                foundTextNode = true;
                const parent = node.parentNode;

                // Create a span representing the selection highlight
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

                // Restore clean DOM after the highlight animation ends
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
                }, 2000);

                break;
            }
        }

        // Fallback to highlighting the parent if specific text node mapping fails
        if (!foundTextNode) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('ag-text-highlight-blink');
            setTimeout(() => {
                targetElement.classList.remove('ag-text-highlight-blink');
            }, 2000);
        }
    }
};

// ─── transformMessages ────────────────────────────────────────────────────────
window.AskGemini.transformMessages = function transformMessages() {
    var AG = window.AskGemini;
    const PREFIX = "I'm replying to this:";
    const PREFIX_CURLY = "I\u2019m replying to this:";
    const PREFIX_MULTI = "I'm replying to these excerpts:";
    const PREFIX_MULTI_CURLY = "I\u2019m replying to these excerpts:";

    const replies = document.querySelectorAll('.model-response, .message-content, .markdown-main-panel, message-content');
    const currentCount = replies.length;
    if (currentCount > AG.lastRepliesCount) {
        AG.lastRepliesCount = currentCount;
        AG.isTipTemporarilyDismissed = false;
    }

    const candidates = document.querySelectorAll('.query-text, .user-query-bubble-with-background, p.query-text-line, [data-test-id="user-query"]');

    candidates.forEach(el => {
        if (el.hasAttribute('data-ag-processed')) return;

        const text = el.textContent || "";
        const hasPrefix = text.includes(PREFIX) || text.includes(PREFIX_CURLY);
        const hasMultiPrefix = text.includes(PREFIX_MULTI) || text.includes(PREFIX_MULTI_CURLY);

        if (hasPrefix && text.includes('"')) {
            // Extract everything after the prefix
            const prefixUsed = text.includes(PREFIX) ? PREFIX : PREFIX_CURLY;
            const afterPrefix = text.substring(text.indexOf(prefixUsed) + prefixUsed.length);

            // Find context between the first and last quotes
            const firstQuote = afterPrefix.indexOf('"');
            const lastQuote = afterPrefix.lastIndexOf('"');

            if (firstQuote === -1 || lastQuote === -1 || firstQuote === lastQuote) return;

            const context = afterPrefix.substring(firstQuote + 1, lastQuote).trim();
            let actualMessage = afterPrefix.substring(lastQuote + 1).trim();

            // Robustly strip any leftover technical separators from previous versions
            actualMessage = actualMessage.replace(/^\u27e6\u25c8\u27e7\s*/, '').trim();

            if (!context || !actualMessage) return;

            const chipHtml = `
                <div class="ask-gemini-proxy-content">
                    <button class="ask-gemini-reply-preview" type="button">
                        <div class="ask-gemini-reply-icon">${AG.ICONS.reply}</div>
                        <div class="ask-gemini-reply-text-wrapper">
                            <p class="ask-gemini-reply-text">${AG.escapeHtml(context)}</p>
                        </div>
                    </button>
                    <div class="ask-gemini-message-bubble">
                        <div class="ask-gemini-bubble-text"><p>${AG.escapeHtml(actualMessage)}</p></div>
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
        } else if (hasMultiPrefix) {
            // Multi-quote transform: parse numbered quoted items
            const prefixUsed = text.includes(PREFIX_MULTI) ? PREFIX_MULTI : PREFIX_MULTI_CURLY;
            const afterPrefix = text.substring(text.indexOf(prefixUsed) + prefixUsed.length).trim();

            const quoteMatches = [...afterPrefix.matchAll(/(\d+)\.\s*"([^"]+)"/g)];
            if (quoteMatches.length === 0) return;

            const lastMatch = quoteMatches[quoteMatches.length - 1];
            let actualMessage = afterPrefix.substring(lastMatch.index + lastMatch[0].length).trim();
            actualMessage = actualMessage.replace(/^\u27e6\u25c8\u27e7\s*/, '').trim();

            if (!actualMessage) return;

            const quotes = quoteMatches.map(m => m[2].trim());

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
                            <div class="ask-gemini-bubble-text"><p>${AG.escapeHtml(actualMessage)}</p></div>
                        </div>
                    </div>
                `;
            } else {
                chipHtml = `
                    <div class="ask-gemini-proxy-content">
                        ${chipsHtml}
                        <div class="ask-gemini-message-bubble">
                            <div class="ask-gemini-bubble-text"><p>${AG.escapeHtml(actualMessage)}</p></div>
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

    // Dynamic retention tips checks
    AG.evaluateRetentionTip().catch(console.error);

    // Check and inject quota limit visuals
    AG.checkAndInjectQuota();

    // Check generation state and trigger quota sync
    AG.checkAndTriggerOnGenerationEnd();

    // Attach focus listener to input area
    AG.attachInputFocusListener();

    // Evaluate feature banner display
    if (!AG.hasEvaluatedFeatureBanner) {
        AG.hasEvaluatedFeatureBanner = true;
        AG.evaluateFeatureBanner().catch(console.error);
    }
};
