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
            if (AG.flushPendingSmartPastesOnSend) AG.flushPendingSmartPastesOnSend();
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

    // Collect response candidates (model responses and message containers)
    const responseCandidates = document.querySelectorAll(
        '.model-response, model-response, .message-content, message-content, .markdown-main-panel, [data-test-id="model-response"], .response-container, model-response-content, structured-content-container'
    );

    let bestElement = null;

    // Helper to search within a list of elements
    function searchElements(elements, targetStr) {
        for (const el of elements) {
            if (el.closest('.ask-gemini-transformed-proxy')) continue;
            const text = normalize(el.textContent);
            if (text.includes(targetStr)) {
                return el;
            }
        }
        return null;
    }

    // 1. First search: Exact normalized match across assistant message blocks
    let matchedBlock = searchElements(responseCandidates, normalizedTarget);

    // If not found in assistant responses, try all conversation containers (in case quoting earlier user prompt)
    if (!matchedBlock) {
        const allCandidates = document.querySelectorAll('.query-text, .user-query-container, .conversation-container, user-query');
        matchedBlock = searchElements(allCandidates, normalizedTarget);
    }

    // 2. If exact normalized string not found (e.g. cross-element quote or formatting differences),
    // try anchoring on the first 6-8 words or first 40 characters:
    if (!matchedBlock && normalizedTarget.length > 25) {
        const words = normalizedTarget.split(/\s+/);
        if (words.length >= 4) {
            const anchorWords = words.slice(0, Math.min(8, words.length)).join(' ');
            matchedBlock = searchElements(responseCandidates, anchorWords);
        }
    }

    // 3. Drill down to the most specific child element inside matchedBlock (p, li, blockquote, etc.)
    if (matchedBlock) {
        bestElement = matchedBlock;
        const subElements = matchedBlock.querySelectorAll('p, li, blockquote, pre, h1, h2, h3, h4, span');
        for (const subEl of subElements) {
            if (normalize(subEl.textContent).includes(normalizedTarget)) {
                bestElement = subEl;
                break;
            }
        }
        // If whole text didn't fit in a single subEl, check if the anchor words match a subEl
        if (bestElement === matchedBlock && normalizedTarget.length > 25) {
            const anchorWords = normalizedTarget.split(/\s+/).slice(0, 6).join(' ');
            for (const subEl of subElements) {
                if (normalize(subEl.textContent).includes(anchorWords)) {
                    bestElement = subEl;
                    break;
                }
            }
        }
    }

    // 4. Scroll to and highlight ONLY the specific quoted text (normal highlight, no block styling)
    if (bestElement) {
        let highlighted = false;
        try {
            // First check: Exact match within a single text node
            const walk = document.createTreeWalker(bestElement, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walk.nextNode())) {
                const nodeText = node.nodeValue || '';
                const idx = nodeText.indexOf(cleanText);
                if (idx !== -1 && node.parentNode && !node.parentNode.classList.contains('ag-text-highlight-blink')) {
                    highlighted = true;
                    const span = document.createElement('span');
                    span.className = 'ag-text-highlight-blink';
                    span.textContent = cleanText;

                    const beforeText = nodeText.substring(0, idx);
                    const afterText = nodeText.substring(idx + cleanText.length);

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
                            const merged = beforeText + cleanText + afterText;
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
                    if (!n.parentNode || n.parentNode.classList.contains('ag-text-highlight-blink')) continue;
                    const start = cumulative.length;
                    cumulative += n.nodeValue;
                    const end = cumulative.length;
                    textNodes.push({ node: n, start, end, text: n.nodeValue });
                }

                let matchIdx = cumulative.indexOf(cleanText);
                let matchLen = cleanText.length;
                if (matchIdx === -1 && cleanText.length > 25) {
                    const anchor = cleanText.slice(0, 30);
                    matchIdx = cumulative.indexOf(anchor);
                    if (matchIdx !== -1) matchLen = anchor.length;
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

        // Fallback: If inline text highlight couldn't be wrapped, just scroll to the element without any block highlight
        if (!highlighted) {
            bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    const replies = document.querySelectorAll('.model-response, model-response, .message-content, message-content, .markdown-main-panel');
    const currentCount = replies.length;
    if (currentCount > AG.lastRepliesCount) {
        AG.lastRepliesCount = currentCount;
        AG.isTipTemporarilyDismissed = false;
    }

    // Query top-level user prompt bubbles, avoiding child duplicates
    const allBubbles = document.querySelectorAll(
        '.user-query-bubble-with-background, [data-test-id="luminous-collapsed-bubble"], .query-text'
    );

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
