/**
 * Ask Gemini: Contextual Replies
 * Simplified Direct-Injection Engine (Macro-style)
 */

(() => {
    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 1: CONFIG & UI TOKENS
    // ═══════════════════════════════════════════════════════════════════════════════

    const BTN_ID = "ask-gemini-float-btn";
    const CHIP_ID = "ask-gemini-context-box";
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 1.1: DYNAMIC THEME ENGINE
    // ═══════════════════════════════════════════════════════════════════════════════
    const THEME_CSS = `
        :root, body {
            --ag-primary: #3d5afe;
            --ag-bg: #2d2e30;
            --ag-bg-hover: #3a3b3d;
            --ag-text: #ffffff;
            --ag-text-dim: #9aa0a6;
            --ag-border: rgba(255, 255, 255, 0.1);
            --ag-bubble-bg: #37393b;
            --ag-bubble-text: #ececec;
            --ag-shadow: rgba(0, 0, 0, 0.4);
        }

        /* Light Theme Overrides */
        body.light-theme {
            --ag-bg: #f8f9fa;
            --ag-bg-hover: #f1f3f4;
            --ag-text: #202124;
            --ag-text-dim: #5f6368;
            --ag-border: #dadce0;
            --ag-bubble-bg: #f1f3f4;
            --ag-bubble-text: #3c4043;
            --ag-shadow: rgba(60, 64, 67, 0.1);
        }

        /* Apply variables to existing IDs */
        /* Floating Button Styles */
        #${BTN_ID} {
            position: fixed;
            display: none;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 8px 18px;
            background: var(--ag-bg) !important;
            border: 1px solid var(--ag-border) !important;
            border-radius: 100px !important;
            color: var(--ag-text) !important;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 4px 20px var(--ag-shadow) !important;
            backdrop-filter: blur(10px);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            animation: ag-pop-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        #${BTN_ID} span {
            display: flex;
            align-items: center;
            gap: 8px; /* Precise space between star and text */
            pointer-events: none;
        }

        @keyframes ag-pop-in {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        #${BTN_ID}:hover {
            background: var(--ag-bg-hover) !important;
            border-color: var(--ag-primary) !important;
            transform: translateY(-2px);
            box-shadow: 0 6px 25px var(--ag-shadow) !important;
        }

        #${BTN_ID} svg {
            color: var(--ag-primary);
            width: 16px;
            height: 16px;
        }
        
        #${CHIP_ID} {
            background-color: var(--ag-bg) !important;
            border-bottom: 1px solid var(--ag-border) !important;
            border-radius: 28px 28px 0 0 !important;
        }
        .ask-gemini-draft-content { color: var(--ag-text-dim) !important; }
        
        .ask-gemini-message-bubble {
            background-color: var(--ag-bubble-bg) !important;
            color: var(--ag-bubble-text) !important;
            border-radius: 28px !important;
        }
        .ask-gemini-reply-preview { color: var(--ag-text-dim) !important; }
        .ask-gemini-reply-preview:hover { color: var(--ag-text) !important; }

        /* Rating Modal Styles */
        .ag-rating-modal {
            position: fixed;
            top: 76px;
            right: 24px;
            width: 280px;
            background: rgba(45, 46, 48, 0.85) !important;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 20px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35) !important;
            padding: 20px;
            z-index: 9999999;
            display: flex;
            flex-direction: column;
            gap: 12px;
            animation: ag-slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .ag-rating-stars-container {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin: 4px 0 2px 0;
        }

        .ag-star-btn {
            background: transparent !important;
            border: none !important;
            cursor: pointer;
            padding: 2px !important;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .ag-star-btn:hover {
            transform: scale(1.2);
        }

        .ag-star {
            width: 28px;
            height: 28px;
            color: var(--ag-text-dim);
            fill: none;
            transition: all 0.2s;
        }

        .ag-star-btn.hovered .ag-star,
        .ag-star-btn.selected .ag-star {
            color: #ffb300 !important;
            fill: #ffb300 !important;
        }

        .ag-rating-modal::before {
            content: '';
            position: absolute;
            top: 0;
            left: 24px;
            right: 24px;
            height: 3px;
            background: linear-gradient(90deg, #3d5afe, #651fff);
            border-radius: 0 0 100px 100px;
        }

        /* Light Theme Overrides for Rating Modal */
        body.light-theme .ag-rating-modal {
            background: rgba(248, 249, 250, 0.85) !important;
            border: 1px solid rgba(0, 0, 0, 0.08) !important;
            box-shadow: 0 16px 48px rgba(60, 64, 67, 0.15) !important;
        }

        @keyframes ag-slide-in-right {
            from { transform: translateX(50px) scale(0.95); opacity: 0; }
            to { transform: translateX(0) scale(1); opacity: 1; }
        }

        @keyframes ag-slide-up {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        @media (max-width: 768px) {
            .ag-rating-modal {
                top: auto;
                bottom: 24px;
                right: 24px;
                left: 24px;
                width: auto;
                animation: ag-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
        }

        .ag-rating-title { font-size: 18px; font-weight: 600; color: var(--ag-text); margin: 0; }
        .ag-rating-text { font-size: 14px; color: var(--ag-text-dim); margin: 0; line-height: 1.5; }
        .ag-rating-buttons { display: flex; gap: 10px; margin-top: 8px; }
        
        .ag-rating-btn {
            flex: 1;
            padding: 10px;
            border-radius: 12px;
            border: 1px solid var(--ag-border);
            background: var(--ag-bubble-bg);
            color: var(--ag-text);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ag-rating-btn:hover { 
            background: var(--ag-bg-hover); 
            transform: translateY(-2px);
            box-shadow: 0 4px 12px var(--ag-shadow);
        }
        .ag-rating-btn-primary { 
            background: linear-gradient(135deg, #3d5afe, #651fff) !important; 
            color: white !important; 
            border: none !important; 
        }
        .ag-rating-btn-primary:hover {
            background: linear-gradient(135deg, #4d6aff, #7530ff) !important;
            box-shadow: 0 6px 16px rgba(61, 90, 254, 0.4) !important;
        }
        
        .ag-rating-close {
            position: absolute;
            top: 12px;
            right: 12px;
            background: transparent;
            border: none;
            color: var(--ag-text-dim);
            cursor: pointer;
            padding: 4px;
            border-radius: 50%;
            transition: all 0.2s;
        }
        .ag-rating-close:hover { background: var(--ag-bg-hover); color: var(--ag-text); }

        /* Placeholder fade transitions */
        .ql-editor::before {
            transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out !important;
            opacity: 1;
        }
        .ql-editor.ag-placeholder-fade-out::before {
            opacity: 0 !important;
            transform: translateY(4px) !important;
        }
        .ql-editor.ag-placeholder-fade-in::before {
            opacity: 0 !important;
            transform: translateY(-4px) !important;
        }

        /* Click to Scroll Target Selection Highlight Animation */
        @keyframes ag-text-highlight-blink-anim {
            0% {
                background-color: transparent;
            }
            15% {
                background-color: rgba(61, 90, 254, 0.35); /* Google Blue-style mouse selection highlight */
            }
            85% {
                background-color: rgba(61, 90, 254, 0.35);
            }
            100% {
                background-color: transparent;
            }
        }
        .ag-text-highlight-blink {
            animation: ag-text-highlight-blink-anim 2s ease-in-out;
            border-radius: 2px;
            padding: 2px 0;
            display: inline;
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = THEME_CSS;
    document.head.appendChild(styleSheet);
    
    const ICONS = {
        ask: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        star: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ag-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    };

    let currentContext = null;
    let floatButton = null;
    let contextBox = null;
    let isInjecting = false;
    let retentionTipTimeout = null;
    let isTipTemporarilyDismissed = false;
    let lastRepliesCount = 0;
    let wasGenerating = false;
    let lastRefreshTime = 0;

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 2: CORE INJECTION LOGIC (The "Competitor" Method)
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * Perform the direct injection and send
     */
    function maybeInjectAndSend() {
        if (isInjecting || !currentContext) return false;

        const input = findInputArea();
        const sendBtn = findSendButton();

        if (!input || !sendBtn) return false;

        isInjecting = true;
        
        try {
            const originalText = input.innerText || "";
            const contextBlock = `I'm replying to this:\n"${currentContext.trim()}"\n\n`;
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
                clearContext();
                sendBtn.click();

                // Increment reply count and reset visits since last reply
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

                // Step 4: Restore visibility after send triggers
                setTimeout(() => {
                    input.style.color = originalColor || '';
                    isInjecting = false;
                }, 50);
            });

            trackEvent('context_reply_sent', { 
                length: currentContext.length
            });
            return true;
        } catch (err) {
            input.style.color = '';
            isInjecting = false;
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 3: UI MANAGMENT
    // ═══════════════════════════════════════════════════════════════════════════════

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
            floatButton.id = BTN_ID;
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
        
        const words = text.trim().split(/\s+/).length;
        trackEvent('text_highlight', { 
            length: text.length,
            word_count: words
        });
        evaluateRetentionTip().catch(console.error);
    }

    function renderContextBox() {
        const input = findInputArea();
        if (!input) return;

        const container = input.closest('.text-input-field');
        if (!container) return;

        if (!contextBox) {
            contextBox = document.createElement('div');
            contextBox.id = CHIP_ID;
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

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 4.1: SMART RATING UI
    // ═══════════════════════════════════════════════════════════════════════════════

    function showRatingModal() {
        if (document.querySelector('.ag-rating-modal')) return;

        const modal = document.createElement('div');
        modal.className = 'ag-rating-modal';
        modal.innerHTML = `
            <button class="ag-rating-close" aria-label="Close">${ICONS.close}</button>
            <h3 class="ag-rating-title" style="text-align: center; font-size: 15px; margin-bottom: 2px;">Enjoying Quote Reply?</h3>
            <div class="ag-rating-stars-container">
                <button class="ag-star-btn" data-value="1" aria-label="1 star">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="2" aria-label="2 stars">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="3" aria-label="3 stars">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="4" aria-label="4 stars">${ICONS.star}</button>
                <button class="ag-star-btn" data-value="5" aria-label="5 stars">${ICONS.star}</button>
            </div>
        `;

        document.body.appendChild(modal);

        const stars = modal.querySelectorAll('.ag-star-btn');
        
        stars.forEach(star => {
            star.addEventListener('mouseenter', () => {
                const value = parseInt(star.getAttribute('data-value'));
                stars.forEach(s => {
                    const val = parseInt(s.getAttribute('data-value'));
                    if (val <= value) {
                        s.classList.add('hovered');
                    } else {
                        s.classList.remove('hovered');
                    }
                });
            });

            star.addEventListener('mouseleave', () => {
                stars.forEach(s => s.classList.remove('hovered'));
            });

            star.addEventListener('click', () => {
                const rating = parseInt(star.getAttribute('data-value'));
                
                if (rating >= 4) {
                    modal.innerHTML = `
                        <button class="ag-rating-close" aria-label="Close">${ICONS.close}</button>
                        <h3 class="ag-rating-title" style="font-size: 15px; text-align: center;">You're the best! 🌟</h3>
                        <p class="ag-rating-text" style="font-size: 12px; text-align: center; margin: 4px 0 8px 0; line-height: 1.4;">A quick 5-star review helps us keep Quote Reply free and powerful.</p>
                        <div class="ag-rating-buttons" style="margin-top: 4px;">
                            <button class="ag-rating-btn ag-rating-btn-primary" id="ag-go-rate" style="padding: 8px;">Leave 5 Stars</button>
                        </div>
                    `;
                    modal.querySelector('.ag-rating-close').onclick = () => modal.remove();
                    modal.querySelector('#ag-go-rate').onclick = () => {
                        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                        chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                        modal.remove();
                    };
                } else {
                    modal.innerHTML = `
                        <button class="ag-rating-close" aria-label="Close">${ICONS.close}</button>
                        <h3 class="ag-rating-title" style="font-size: 15px; text-align: center;">How can we improve?</h3>
                        <p class="ag-rating-text" style="font-size: 12px; text-align: center; margin: 4px 0 8px 0; line-height: 1.4;">Your feedback helps us improve. You can send private feedback or rate us on the store.</p>
                        <div class="ag-rating-buttons" style="margin-top: 8px; flex-direction: column; gap: 8px;">
                            <button class="ag-rating-btn ag-rating-btn-primary" id="ag-give-feedback" style="padding: 8px; width: 100%;">Send Private Feedback</button>
                            <button class="ag-rating-btn" id="ag-go-rate-stars" style="padding: 8px; width: 100%; border: 1px solid var(--ag-border); background: transparent;">Rate ${rating} Stars</button>
                        </div>
                    `;
                    modal.querySelector('.ag-rating-close').onclick = () => modal.remove();
                    modal.querySelector('#ag-give-feedback').onclick = () => {
                        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'feedback_given' });
                        window.open('https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform', '_blank');
                        modal.remove();
                    };
                    modal.querySelector('#ag-go-rate-stars').onclick = () => {
                        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                        chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                        modal.remove();
                    };
                }
            });
        });

        modal.querySelector('.ag-rating-close').onclick = () => {
            chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'dismissed' });
            modal.remove();
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 4: HISTORY BEAUTIFICATION (Turning Separators into Chips)
    // ═══════════════════════════════════════════════════════════════════════════════

    function scrollToAndHighlightText(textToFind) {
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
    }

    function transformMessages() {
        const PREFIX = "I'm replying to this:";
        const PREFIX_CURLY = "I\u2019m replying to this:";
        
        const replies = document.querySelectorAll('.model-response, .message-content, .markdown-main-panel, message-content');
        const currentCount = replies.length;
        if (currentCount > lastRepliesCount) {
            lastRepliesCount = currentCount;
            isTipTemporarilyDismissed = false;
        }
        
        const candidates = document.querySelectorAll('.query-text, .user-query-bubble-with-background, p.query-text-line, [data-test-id="user-query"]');
        
        candidates.forEach(el => {
            if (el.hasAttribute('data-ag-processed')) return;
            
            const text = el.textContent || "";
            const hasPrefix = text.includes(PREFIX) || text.includes(PREFIX_CURLY);
            
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

        // Dynamic retention tips checks
        evaluateRetentionTip().catch(console.error);

        // Check and inject quota limit visuals
        checkAndInjectQuota();

        // Check generation state and trigger quota sync
        checkAndTriggerOnGenerationEnd();

        // Attach focus listener to input area
        attachInputFocusListener();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 5: HELPERS & BOOT
    // ═══════════════════════════════════════════════════════════════════════════════

    function findInputArea() {
        return document.querySelector('.ql-editor[contenteditable="true"]') 
            || document.querySelector('div[contenteditable="true"][aria-label*="prompt"]');
    }

    function findSendButton() {
        return document.querySelector('button[aria-label="Send message"]') 
            || document.querySelector('button.send-button');
    }

    async function updateUserProfile() {
        // 1. Try to get email from meta tag
        const meta = document.querySelector('meta[name="og-profile-acct"]');
        let email = meta ? meta.getAttribute('content') : null;

        // 2. Try to get name and email from Google Account profile button
        const profileLink = document.querySelector('a[aria-label*="Google Account"]');
        let name = null;
        if (profileLink) {
            const ariaLabel = profileLink.getAttribute('aria-label') || "";
            const nameMatch = ariaLabel.match(/Google Account:\s*([^\n\(\r]+)/i);
            if (nameMatch && nameMatch[1]) {
                name = nameMatch[1].trim();
            }
            if (!email) {
                const emailMatch = ariaLabel.match(/\(([^)]+)\)/);
                if (emailMatch && emailMatch[1]) {
                    email = emailMatch[1].trim();
                }
            }
        }

        const normalizedEmail = email ? email.trim().toLowerCase() : null;
        const normalizedName = name ? name.trim() : null;

        const res = await chrome.storage.local.get(['user_email', 'user_name']);
        
        const updates = {};
        if (normalizedEmail && res.user_email !== normalizedEmail) {
            updates.user_email = normalizedEmail;
        }
        if (normalizedName && res.user_name !== normalizedName) {
            updates.user_name = normalizedName;
        }

        if (Object.keys(updates).length > 0) {
            await chrome.storage.local.set(updates);
        }
    }

    async function incrementSessionVisits() {
        const key = 'gemini_visits_since_last_reply';
        const res = await chrome.storage.local.get([key]);
        const current = res[key] || 0;
        await chrome.storage.local.set({ [key]: current + 1 });
    }

    function animatePlaceholderChange(input, newPlaceholder) {
        if (input.getAttribute('data-placeholder') === newPlaceholder) return;
        input.classList.add('ag-placeholder-fade-out');
        setTimeout(() => {
            input.setAttribute('data-placeholder', newPlaceholder);
            input.classList.remove('ag-placeholder-fade-out');
            input.classList.add('ag-placeholder-fade-in');
            setTimeout(() => {
                input.classList.remove('ag-placeholder-fade-in');
            }, 150);
        }, 150);
    }

    async function evaluateRetentionTip() {
        const input = findInputArea();
        if (!input) return;

        // Clean up any old DOM retention tip element if present
        const oldTip = document.getElementById('ag-retention-tip');
        if (oldTip) oldTip.remove();

        const res = await chrome.storage.local.get([
            'reply_count_lifetime', 
            'last_reply_time', 
            'gemini_visits_since_last_reply'
        ]);

        const replyCount = res.reply_count_lifetime || 0;
        const lastReplyTime = res.last_reply_time || 0;
        const visits = res.gemini_visits_since_last_reply || 0;

        let shouldShow = false;

        if (replyCount < 5) {
            // Still onboarding (under 5 quote-replies)
            shouldShow = true;
        } else {
            // Over 5 replies: check if 7 days passed AND they opened Gemini at least twice
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            const inactive = (Date.now() - lastReplyTime) > sevenDays;
            if (inactive && visits >= 2) {
                shouldShow = true;
            }
        }

        // Hide if a quote snippet is actively loaded
        if (currentContext) {
            shouldShow = false;
        }

        // Hide if user is currently typing in the box
        const currentText = input.innerText || "";
        if (currentText.trim().length > 0) {
            shouldShow = false;
        }

        // Hide if there is no response from Gemini on screen (convo hasn't started)
        const replyElement = document.querySelector('.model-response, .message-content, .markdown-main-panel, message-content');
        const hasReply = !!(replyElement && replyElement.textContent.trim().length > 0);
        if (!hasReply) {
            shouldShow = false;
        }

        // Store original placeholder if not already saved
        const originalPlaceholder = input.getAttribute('data-placeholder');
        if (originalPlaceholder && originalPlaceholder !== "Highlight any text to quote-reply." && !input.hasAttribute('data-ag-original-placeholder')) {
            input.setAttribute('data-ag-original-placeholder', originalPlaceholder);
        }

        const basePlaceholder = input.getAttribute('data-ag-original-placeholder') || 'Ask Gemini';
        const targetPlaceholder = (shouldShow && !isTipTemporarilyDismissed) ? "Highlight any text to quote-reply." : basePlaceholder;

        if (input.getAttribute('data-placeholder') !== targetPlaceholder) {
            animatePlaceholderChange(input, targetPlaceholder);

            // If we just showed the tip, start the auto-dismiss timer
            if (targetPlaceholder === "Highlight any text to quote-reply.") {
                if (retentionTipTimeout) clearTimeout(retentionTipTimeout);
                retentionTipTimeout = setTimeout(() => {
                    isTipTemporarilyDismissed = true;
                    evaluateRetentionTip().catch(console.error);
                }, 6000); // 6 seconds auto-dismiss
            } else {
                // If we cleared/changed away from the tip, clear any active timer
                if (retentionTipTimeout) {
                    clearTimeout(retentionTipTimeout);
                    retentionTipTimeout = null;
                }
            }
        }

        // Bind input typing handler
        if (!input.hasAttribute('data-ag-tip-listener')) {
            input.setAttribute('data-ag-tip-listener', 'true');
            input.addEventListener('input', () => {
                evaluateRetentionTip().catch(console.error);
            });
        }
    }

    function trackEvent(name, params) {
        chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name, params });
    }

    // Listen for Send triggers
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && currentContext) {
            e.preventDefault();
            e.stopImmediatePropagation();
            maybeInjectAndSend();
        }
    }, true);

    document.addEventListener('click', (e) => {
        if (currentContext && e.target.closest('button[aria-label="Send message"], button.send-button')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            maybeInjectAndSend();
        }
    }, true);

    document.addEventListener('mouseup', handleSelection);
    
    // Watch for new messages to transform
    const observer = new MutationObserver(transformMessages);
    observer.observe(document.body, { childList: true, subtree: true });

    function updateQuotaDisplay(limits) {
        if (!limits) return;

        const currentUsage = limits.currentUsage || 0;
        const resetTime = limits.resetTime || '';
        const weeklyUsage = limits.weeklyUsage || 0;

        // Clean up Option A & Option B elements if present
        const oldPill = document.getElementById('ag-quota-pill');
        if (oldPill) oldPill.remove();

        const oldBar = document.getElementById('ag-quota-bar');
        if (oldBar) oldBar.remove();

        // Option C: Sidebar Footer Card
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

            // Toggle display based on sidebar expanded/collapsed state
            const isCollapsed = !!document.querySelector('button[aria-label*="Expand"]')
                || !document.querySelector('button[aria-label*="Close"]')
                || sidebarFooter.getBoundingClientRect().width < 150;
            card.style.display = isCollapsed ? 'none' : 'block';

            // Add click listener for refresh button
            const refreshBtn = card.querySelector('#ag-quota-refresh-btn');
            if (refreshBtn) {
                refreshBtn.onclick = (e) => {
                    if (e) e.stopPropagation();
                    refreshBtn.classList.add('spinning');
                    lastRefreshTime = Date.now();
                    
                    chrome.runtime.sendMessage({ type: 'FORCE_REFRESH_USAGE_LIMITS' }, (response) => {
                        setTimeout(() => {
                            refreshBtn.classList.remove('spinning');
                            if (response && response.success && response.limits) {
                                updateQuotaDisplay(response.limits);
                            }
                        }, 600); // Visual feedback delay for spin
                    });
                };
            }
        }
    }

    function requestUsageLimits() {
        chrome.runtime.sendMessage({ type: 'GET_USAGE_LIMITS' }, (response) => {
            if (response && response.success && response.limits) {
                updateQuotaDisplay(response.limits);
            }
        });
    }

    function checkAndInjectQuota() {
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

    function checkAndTriggerOnGenerationEnd() {
        const isCurrentlyGenerating = !!document.querySelector('button[aria-label*="Stop"]') 
            || !!document.querySelector('button[class*="stop"]')
            || !!document.querySelector('mat-progress-bar')
            || !!document.querySelector('.is-generating')
            || !!document.querySelector('div[class*="generating"]');
            
        if (wasGenerating && !isCurrentlyGenerating) {
            console.log('🤖 Ask Gemini: Generation finished! Triggering auto-refresh...');
            const refreshBtn = document.getElementById('ag-quota-refresh-btn');
            if (refreshBtn) {
                refreshBtn.click();
            }
        }
        wasGenerating = isCurrentlyGenerating;
    }

    function attachInputFocusListener() {
        const input = findInputArea();
        if (input && !input.hasAttribute('data-ag-refresh-hook')) {
            input.setAttribute('data-ag-refresh-hook', 'true');
            
            const triggerRefresh = () => {
                const now = Date.now();
                if (now - lastRefreshTime < 15000) {
                    // Ignore clicks/focuses if refreshed in last 15s to avoid rate limit spam
                    return;
                }
                console.log('✍️ Ask Gemini: Input focused/tapped! Triggering auto-refresh...');
                const refreshBtn = document.getElementById('ag-quota-refresh-btn');
                if (refreshBtn) {
                    refreshBtn.click();
                }
            };
            
            input.addEventListener('focus', triggerRefresh);
            input.addEventListener('click', triggerRefresh);
        }
    }

    // Listen for rating prompts and quota updates
    chrome.runtime.onMessage.addListener((message) => {
        console.log('📬 Ask Gemini: Message Received', message);
        if (message.type === 'SHOW_RATING_PROMPT') {
            console.log('🌟 Ask Gemini: Attempting to show rating modal...');
            showRatingModal();
        } else if (message.type === 'USAGE_LIMITS_UPDATED') {
            console.log('📊 Ask Gemini: Quota limits updated', message.limits);
            updateQuotaDisplay(message.limits);
        }
    });

    // Initial run
    transformMessages();
    requestUsageLimits();
    updateUserProfile().catch(console.error);
    incrementSessionVisits().catch(console.error);
    
    // Auto-refresh limits every 60 seconds
    setInterval(requestUsageLimits, 60000);

    console.log('🚀 Ask Gemini: Simplified Engine Active');
})();
