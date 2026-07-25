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
            --ag-primary-hover: #4d6aff;
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
            --ag-primary: #1a73e8;
            --ag-primary-hover: #1557b0;
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

        /* Scoped Feature Banner */
        .ag-feature-banner {
            position: fixed;
            top: 76px;
            right: 24px;
            width: 340px;
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
            gap: 16px;
            font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
            animation: ag-slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1);
            box-sizing: border-box;
        }

        body.light-theme .ag-feature-banner {
            background: rgba(248, 249, 250, 0.85) !important;
            border: 1px solid rgba(0, 0, 0, 0.08) !important;
            box-shadow: 0 16px 48px rgba(60, 64, 67, 0.15) !important;
        }

        .ag-feature-banner.slide-out {
            animation: ag-slide-out-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .ag-feature-banner .banner-top {
            display: flex;
            flex-direction: column;
        }

        .ag-feature-banner .text-container {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .ag-feature-banner .banner-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--ag-text) !important;
            margin: 0;
            line-height: 1.4;
        }

        .ag-feature-banner .body-text {
            font-size: 13.5px;
            color: var(--ag-text-dim) !important;
            line-height: 1.5;
            margin: 0;
        }

        .ag-feature-banner .actions-container {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 4px;
        }

        /* Secondary Button ("Not now") */
        .ag-feature-banner .banner-btn-secondary {
            background: transparent !important;
            border: none !important;
            color: var(--ag-text) !important;
            padding: 8px 16px;
            border-radius: 100px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s, color 0.2s;
            font-family: inherit;
        }

        .ag-feature-banner .banner-btn-secondary:hover {
            background-color: var(--ag-bg-hover) !important;
        }

        /* Primary Button ("Try it") */
        .ag-feature-banner .banner-btn-primary {
            background: var(--ag-primary, #3d5afe) !important;
            color: #ffffff !important;
            border: none !important;
            padding: 8px 20px;
            border-radius: 100px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
            font-family: inherit;
        }

        .ag-feature-banner .banner-btn-primary:hover {
            background: var(--ag-primary-hover, #4d6aff) !important;
            box-shadow: 0 4px 12px rgba(61, 90, 254, 0.3) !important;
        }

        .ag-feature-banner .banner-btn-primary:active {
            transform: scale(0.98);
        }

        @keyframes ag-slide-out-right {
            from { transform: translateX(0) scale(1); opacity: 1; }
            to { transform: translateX(50px) scale(0.95); opacity: 0; }
        }

        /* Responsive */
        @media (max-width: 768px) {
            .ag-feature-banner {
                top: auto;
                bottom: 24px;
                right: 24px;
                left: 24px;
                width: auto;
                animation: ag-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
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

    let currentContexts = [];
    let multiQuoteDisplay = 'expanded'; // 'expanded' | 'compact'
    let usageLimitsEnabled = true;
    let multiQuoteEnabled = true;
    let floatButton = null;
    let contextBox = null;
    let isInjecting = false;
    let retentionTipTimeout = null;
    let isTipTemporarilyDismissed = false;
    let lastRepliesCount = 0;
    let wasGenerating = false;
    let lastRefreshTime = 0;
    let isFreeUser = false;
    let hasEvaluatedFeatureBanner = false;
    let smartPasteThreshold = 20000;
    let smartPasteBehavior = 'auto'; // 'auto' | 'ask' | 'off'
    let smartPasteFeedbackDone = false;

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 2: CORE INJECTION LOGIC (The "Competitor" Method)
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * Perform the direct injection and send
     */
    function maybeInjectAndSend() {
        if (isInjecting || !currentContexts.length) return false;

        const input = findInputArea();
        const sendBtn = findSendButton();

        if (!input || !sendBtn) return false;

        isInjecting = true;
        
        try {
            const originalText = input.innerText || "";
            const contextBlock = currentContexts.length === 1
                ? `I'm replying to this:\n"${currentContexts[0].trim()}"\n\n`
                : `I'm replying to these excerpts:\n${currentContexts.map((q, i) => `${i + 1}. "${q.trim()}"`).join('\n')}\n\n`;
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
                length: currentContexts.reduce((a, c) => a + c.length, 0),
                quote_count: currentContexts.length
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
        const text = selection.toString().trim();

        if (!floatButton) {
            floatButton = document.createElement('button');
            floatButton.id = BTN_ID;
            document.body.appendChild(floatButton);
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const centerX = rect.left + window.scrollX + (rect.width / 2);
        const topY = rect.top + window.scrollY - 45;

        if (currentContexts.length > 0 && multiQuoteEnabled) {
            // Multi-quote mode: offer to add another quote to the queue
            floatButton.innerHTML = `<span>${ICONS.ask} + Add Quote (${currentContexts.length})</span>`;
            floatButton.onclick = (e) => {
                e.preventDefault();
                currentContexts.push(text);
                renderContextBox();
                evaluateRetentionTip().catch(console.error);
                hideFloatButton();
            };
            floatButton.style.left = `${centerX - 75}px`;
        } else {
            // Normal single-quote mode: identical to before
            floatButton.innerHTML = `<span>${ICONS.ask} Ask Gemini</span>`;
            floatButton.onclick = (e) => {
                e.preventDefault();
                activateContext(text);
                hideFloatButton();
            };
            floatButton.style.left = `${centerX - 60}px`;
        }

        floatButton.style.top = `${topY}px`;
        floatButton.style.display = 'flex';
    }

    function hideFloatButton() {
        if (floatButton) floatButton.style.display = 'none';
    }

    function activateContext(text) {
        if (!multiQuoteEnabled) {
            currentContexts = [];
        }
        currentContexts.push(text);
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

        const count = currentContexts.length;
        document.getElementById('ask-gemini-context-content').innerText =
            count === 1 ? `"${currentContexts[0]}"` : `${count} quotes queued`;
        contextBox.style.display = 'flex';
    }

    function clearContext() {
        currentContexts = [];
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
    // SECTION 4.2: FEATURE BANNER SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════════

    const CURRENT_FEATURE = {
        id: "multi_quote_v1",
        title: "New: Quote multiple excerpts",
        description: "Highlight text, then keep highlighting more — look for the '+ Add Quote' button to build a multi-quote reply.",
        primaryText: "Try it",
        secondaryText: "Later",
        onTry: () => {
            chrome.storage.local.set({ ask_gemini_tour_active: true, tour_step: 1 }, () => {
                if (typeof AskGeminiTour !== 'undefined') {
                    AskGeminiTour.step = 1;
                    AskGeminiTour.step1ListenersAttached = false;
                    AskGeminiTour.step4ListenersAttached = false;
                    AskGeminiTour.step6ListenersAttached = false;

                    // If a reply already exists, skip step 1 and go directly to step 2 (highlighting)
                    if (AskGeminiTour.getLatestGeminiReply()) {
                        AskGeminiTour.step = 2;
                        chrome.storage.local.set({ tour_step: 2 });
                    }
                    AskGeminiTour.init();
                } else {
                    window.location.reload();
                }
            });
        }
    };

    /*
    // Example feature configuration when you want to show a banner:
    const CURRENT_FEATURE = {
        id: "nano_banana_v1", // Unique ID for this feature notification
        title: "Get your game face on ⚽️",
        description: "Picture yourself in the game with Nano Banana.",
        primaryText: "Try it",
        secondaryText: "Not now",
        onTry: () => {
            chrome.storage.local.set({ ask_gemini_tour_active: true, tour_step: 1 }, () => {
                if (typeof AskGeminiTour !== 'undefined') {
                    AskGeminiTour.init();
                } else {
                    window.location.reload();
                }
            });
        }
    };
    */

    async function evaluateFeatureBanner() {
        if (!CURRENT_FEATURE || !CURRENT_FEATURE.id) return;
        if (hasEvaluatedFeatureBanner) return;

        const input = findInputArea();
        if (!input) return;

        const bannerKey = `feature_banner_seen_${CURRENT_FEATURE.id}`;
        const res = await chrome.storage.local.get([bannerKey]);
        
        // If already seen/dismissed, don't show
        if (res[bannerKey]) {
            hasEvaluatedFeatureBanner = true;
            return;
        }

        // Don't show if any other modals (like rating modal or tour overlay) are active
        if (document.querySelector('.ag-rating-modal') || document.getElementById('ag-tour-overlay') || document.querySelector('.ag-feature-banner')) {
            return;
        }

        hasEvaluatedFeatureBanner = true;

        // Show after a short delay so it's not jarring
        setTimeout(() => {
            // Re-verify conditions before showing
            if (document.querySelector('.ag-rating-modal') || document.getElementById('ag-tour-overlay') || document.querySelector('.ag-feature-banner')) {
                hasEvaluatedFeatureBanner = false;
                return;
            }
            showFeatureBanner();
        }, 3000);
    }

    function showFeatureBanner() {
        if (document.querySelector('.ag-feature-banner')) return;

        const banner = document.createElement('section');
        banner.className = 'ag-feature-banner gem-banner-container ng-star-inserted';
        banner.setAttribute('jslog', '307885;track:impression');
        
        banner.innerHTML = `
            <div class="banner-top">
                <div class="text-container">
                    <div class="title-container ng-star-inserted">
                        <h3 class="banner-title gds-body-m">${CURRENT_FEATURE.title}</h3>
                    </div>
                    <div class="body-text gds-body-m ng-star-inserted">${CURRENT_FEATURE.description}</div>
                </div>
            </div>
            <div class="actions-container ng-star-inserted">
                <button class="banner-btn-primary" id="ag-banner-btn-try">${CURRENT_FEATURE.primaryText}</button>
                <button class="banner-btn-secondary" id="ag-banner-btn-dismiss">${CURRENT_FEATURE.secondaryText}</button>
            </div>
        `;

        document.body.appendChild(banner);

        const dismissBtn = banner.querySelector('#ag-banner-btn-dismiss');
        const tryBtn = banner.querySelector('#ag-banner-btn-try');

        const closeBanner = (callback) => {
            banner.classList.add('slide-out');
            banner.addEventListener('animationend', () => {
                banner.remove();
                if (callback) callback();
            }, { once: true });
        };

        dismissBtn.onclick = () => {
            const bannerKey = `feature_banner_seen_${CURRENT_FEATURE.id}`;
            chrome.storage.local.set({ [bannerKey]: true }, () => {
                trackEvent('feature_banner_dismissed', { feature_id: CURRENT_FEATURE.id });
                closeBanner();
            });
        };

        tryBtn.onclick = () => {
            const bannerKey = `feature_banner_seen_${CURRENT_FEATURE.id}`;
            chrome.storage.local.set({ [bannerKey]: true }, () => {
                trackEvent('feature_banner_try_clicked', { feature_id: CURRENT_FEATURE.id });
                closeBanner(() => {
                    if (CURRENT_FEATURE.onTry) CURRENT_FEATURE.onTry();
                });
            });
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
        const PREFIX_MULTI = "I'm replying to these excerpts:";
        const PREFIX_MULTI_CURLY = "I\u2019m replying to these excerpts:";
        
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
                        <div class="ask-gemini-reply-icon">${ICONS.reply}</div>
                        <div class="ask-gemini-reply-text-wrapper">
                            <p class="ask-gemini-reply-text">${q}</p>
                        </div>
                    </button>
                `).join('');

                let chipHtml;
                if (multiQuoteDisplay === 'compact') {
                    chipHtml = `
                        <div class="ask-gemini-proxy-content">
                            <button class="ask-gemini-reply-preview" type="button"
                                title="${quotes.map((q, i) => `${i + 1}. ${q}`).join('\n')}">
                                <div class="ask-gemini-reply-icon">${ICONS.reply}</div>
                                <div class="ask-gemini-reply-text-wrapper">
                                    <p class="ask-gemini-reply-text">${quotes.length} quoted excerpts</p>
                                </div>
                            </button>
                            <div class="ask-gemini-message-bubble">
                                <div class="ask-gemini-bubble-text"><p>${actualMessage}</p></div>
                            </div>
                        </div>
                    `;
                } else {
                    chipHtml = `
                        <div class="ask-gemini-proxy-content">
                            ${chipsHtml}
                            <div class="ask-gemini-message-bubble">
                                <div class="ask-gemini-bubble-text"><p>${actualMessage}</p></div>
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
                    if (multiQuoteDisplay === 'compact') {
                        btn.onclick = null; // compact chip is informational only
                    } else {
                        btn.onclick = () => scrollToAndHighlightText(quotes[i]);
                    }
                });

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

        // Evaluate feature banner display
        if (!hasEvaluatedFeatureBanner) {
            hasEvaluatedFeatureBanner = true;
            evaluateFeatureBanner().catch(console.error);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 5: HELPERS & BOOT
    // ═══════════════════════════════════════════════════════════════════════════════

    function findInputArea() {
        return document.querySelector('.ql-editor[contenteditable="true"]')
            || document.querySelector('div[contenteditable="true"][aria-label*="rompt"]')
            || document.querySelector('div[contenteditable="true"][role="textbox"]')
            || document.querySelector('div[contenteditable="true"]'); // generic catch-all
    }

    function findSendButton() {
        return document.querySelector('button[aria-label="Send message"]')
            || document.querySelector('button[aria-label*="Send"]')
            || document.querySelector('button.send-button')
            || document.querySelector('button[data-test-id*="send"]'); // generic catch-all
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

        // Hide if user is currently typing in the box
        const currentText = input.innerText || "";
        const isInputEmpty = currentText.trim().length === 0;
        if (!isInputEmpty) {
            shouldShow = false;
        }

        // Hide if there is no response from Gemini on screen (convo hasn't started)
        const replyElement = document.querySelector('.model-response, .message-content, .markdown-main-panel, message-content');
        const hasReply = !!(replyElement && replyElement.textContent.trim().length > 0);
        if (!hasReply && currentContexts.length === 0) {
            shouldShow = false;
        }

        // Store original placeholder if not already saved
        const originalPlaceholder = input.getAttribute('data-placeholder');
        if (originalPlaceholder && 
            originalPlaceholder !== "Highlight any text to quote-reply." && 
            originalPlaceholder !== "Highlight another passage to add a 2nd quote..." &&
            !input.hasAttribute('data-ag-original-placeholder')) {
            input.setAttribute('data-ag-original-placeholder', originalPlaceholder);
        }

        const basePlaceholder = input.getAttribute('data-ag-original-placeholder') || 'Ask Gemini';
        
        let targetPlaceholder = basePlaceholder;
        if (currentContexts.length > 0 && multiQuoteEnabled && isInputEmpty) {
            targetPlaceholder = "Highlight another passage to add a 2nd quote...";
        } else if (shouldShow && !isTipTemporarilyDismissed && isInputEmpty) {
            targetPlaceholder = "Highlight any text to quote-reply.";
        }

        if (input.getAttribute('data-placeholder') !== targetPlaceholder) {
            animatePlaceholderChange(input, targetPlaceholder);

            // If we just showed the single-quote tip, start the auto-dismiss timer
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

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 4.3: SMART PASTE (MVP) - Auto-converting Large Pastes into Files
    // ═══════════════════════════════════════════════════════════════════════════════

    function insertTextIntoInput(text) {
        const input = findInputArea();
        if (!input) return;
        input.focus();
        if (!document.execCommand('insertText', false, text)) {
            input.innerText += text;
        }
    }

    let smartPasteTriggerCount = 0;
    let smartPastePreferenceExplicitlySet = false;

    async function processSmartPaste(pastedText) {
        try {
            const filename = `pasted-text-${Date.now().toString().slice(-4)}.txt`;
            const file = new File([pastedText], filename, { type: 'text/plain' });
            await uploadFileToGemini(file, pastedText);

            trackEvent('smart_paste_success', { length: pastedText.length });
        } catch (err) {
            console.error('Smart Paste file upload failed, falling back to text paste:', err);
            trackEvent('smart_paste_fallback', { error: err.message, length: pastedText.length });
            
            insertTextIntoInput(pastedText);

            showSmartPasteToast('Smart Paste upload failed. Pasted text directly into prompt instead.');
        }
    }

    async function uploadFileToGemini(file, rawText) {
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = findInputArea();

        // Method 1: Direct Synthetic Clipboard Paste Event with File (Zero DOM manipulation)
        if (input) {
            try {
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt
                });
                input.dispatchEvent(pasteEvent);
                return true;
            } catch (err) {
                console.warn('ClipboardEvent file dispatch failed:', err);
            }
        }

        // Method 2: Direct Drag & Drop Simulation on Input Area
        try {
            const dropZone = document.querySelector('.input-area-container') 
                || document.querySelector('.chat-input-area') 
                || input 
                || document.body;

            if (dropZone) {
                const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
                const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
                const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });

                dropZone.dispatchEvent(dragEnter);
                dropZone.dispatchEvent(dragOver);
                dropZone.dispatchEvent(drop);
                return true;
            }
        } catch (err) {
            console.warn('Drag & Drop file dispatch failed:', err);
        }

        // Method 3: Direct API Fetch Upload (push.clients6.google.com)
        try {
            const initRes = await fetch("https://push.clients6.google.com/upload/", {
                method: "POST",
                headers: {
                    "X-Goog-Upload-Protocol": "resumable",
                    "X-Goog-Upload-Command": "start",
                    "X-Goog-Upload-Header-Content-Length": file.size.toString(),
                    "X-Tenant-Id": "bard-storage",
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
                },
                body: `File name: ${file.name}`
            });

            const uploadUrl = initRes.headers.get("x-goog-upload-url") || initRes.headers.get("X-Goog-Upload-URL");
            if (uploadUrl) {
                await fetch(uploadUrl, {
                    method: "POST",
                    headers: {
                        "X-Goog-Upload-Command": "upload, finalize",
                        "X-Goog-Upload-Offset": "0",
                        "X-Tenant-Id": "bard-storage",
                        "Content-Type": "text/plain;charset=utf-8"
                    },
                    body: rawText || file
                });
                return true;
            }
        } catch (err) {
            console.warn('Direct API fetch upload failed:', err);
        }

        // Method 4: Fallback hidden file input if present in DOM
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            return true;
        }

        throw new Error('All direct file upload methods failed');
    }

    function promptSmartPasteTurnOffFeedback(onDone) {
        const existing = document.getElementById('ag-sp-off-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'ag-sp-off-modal';
        modal.className = 'ag-sp-dialog-backdrop';

        modal.innerHTML = `
            <div class="ag-sp-dialog-card" style="max-width: 440px;">
                <div class="ag-sp-dialog-header">
                    <div class="ag-sp-dialog-icon" style="background: rgba(255, 138, 138, 0.15); color: #ff8a8a;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                    </div>
                    <h3 class="ag-sp-dialog-title">Why turn off Smart Paste?</h3>
                </div>
                <div class="ag-sp-dialog-body" style="margin-bottom: 16px;">
                    We'd love to know why Smart Paste didn't work for you so we can improve it.
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px;">
                    <button class="ag-sp-tag-btn" data-tag="Didn't upload properly">Didn't upload properly</button>
                    <button class="ag-sp-tag-btn" data-tag="Prefer pasting raw text">Prefer pasting raw text</button>
                    <button class="ag-sp-tag-btn" data-tag="Too intrusive">Too intrusive</button>
                    <button class="ag-sp-tag-btn" data-tag="Threshold too low">Threshold too low</button>
                </div>
                <textarea id="ag-sp-off-reason" rows="3" placeholder="Tell us more (optional)..." style="width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: #e6e0e9; padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 13px; resize: none; margin-bottom: 20px; outline: none;"></textarea>
                <div class="ag-sp-dialog-actions">
                    <button id="ag-sp-off-cancel" class="ag-sp-btn-secondary">Cancel</button>
                    <button id="ag-sp-off-submit" class="ag-sp-btn-primary" style="background: #ff8a8a; color: #3c0003;">Turn Off</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const selectedTags = new Set();
        modal.querySelectorAll('.ag-sp-tag-btn').forEach(btn => {
            btn.onclick = () => {
                const tag = btn.getAttribute('data-tag');
                if (selectedTags.has(tag)) {
                    selectedTags.delete(tag);
                    btn.classList.remove('active');
                } else {
                    selectedTags.add(tag);
                    btn.classList.add('active');
                }
            };
        });

        modal.querySelector('#ag-sp-off-cancel').onclick = () => {
            modal.remove();
        };

        modal.querySelector('#ag-sp-off-submit').onclick = () => {
            const reason = modal.querySelector('#ag-sp-off-reason').value.trim();
            const tags = Array.from(selectedTags);
            
            trackEvent('smart_paste_turn_off_feedback', {
                reason,
                tags: tags.join(', ')
            });

            smartPasteBehavior = 'off';
            smartPastePreferenceExplicitlySet = true;
            chrome.storage.local.set({
                smart_paste_behavior: 'off',
                smart_paste_enabled: false,
                smart_paste_preference_explicitly_set: true,
                smart_paste_off_feedback: { reason, tags, date: new Date().toISOString() }
            });

            modal.remove();
            showSmartPasteToast('Smart Paste disabled.');
            if (onDone) onDone();
        };
    }

    function promptSmartPasteConfirmation(pastedText) {
        smartPasteTriggerCount++;
        chrome.storage.local.set({ smart_paste_trigger_count: smartPasteTriggerCount });

        const existing = document.getElementById('ag-sp-confirm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'ag-sp-confirm-modal';
        modal.className = 'ag-sp-dialog-backdrop';

        const isRepeat = smartPasteTriggerCount > 1 && !smartPastePreferenceExplicitlySet;

        modal.innerHTML = `
            <div class="ag-sp-dialog-card" style="max-width: ${isRepeat ? '460px' : '440px'};">
                <div class="ag-sp-dialog-header">
                    <div class="ag-sp-dialog-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    </div>
                    <h3 class="ag-sp-dialog-title">Convert large text to document?</h3>
                </div>
                <div class="ag-sp-dialog-body" style="margin-bottom: ${isRepeat ? '16px' : '24px'};">
                    You pasted <strong>${pastedText.length.toLocaleString()}</strong> characters. Smart Paste can convert this into a <strong>.txt</strong> document for cleaner analysis without filling up your prompt.
                </div>
                ${isRepeat ? `
                <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 14px 16px; margin-bottom: 20px;">
                    <div style="font-size: 11.5px; font-weight: 600; color: #a8c7fa; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Future Preference</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #e6e0e9; cursor: pointer;">
                            <input type="radio" name="ag-sp-pref" value="ask" checked style="accent-color: #a8c7fa;"> Keep asking me each time
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #e6e0e9; cursor: pointer;">
                            <input type="radio" name="ag-sp-pref" value="auto" style="accent-color: #a8c7fa;"> Always auto-upload large text
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #ff8a8a; cursor: pointer;">
                            <input type="radio" name="ag-sp-pref" value="off" style="accent-color: #ff8a8a;"> Turn off Smart Paste
                        </label>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 11px; color: #9aa0a6;">You can always change this later in extension settings.</p>
                </div>
                ` : ''}
                <div class="ag-sp-dialog-actions">
                    <button id="ag-sp-confirm-paste" class="ag-sp-btn-secondary">Paste as text</button>
                    <button id="ag-sp-confirm-upload" class="ag-sp-btn-primary">Upload document</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const handleChoice = (isUpload) => {
            const selectedPref = isRepeat ? (modal.querySelector('input[name="ag-sp-pref"]:checked')?.value || 'ask') : 'ask';
            
            modal.remove();

            if (selectedPref === 'off') {
                promptSmartPasteTurnOffFeedback(() => {
                    if (!isUpload) insertTextIntoInput(pastedText);
                });
            } else {
                if (selectedPref !== 'ask') {
                    smartPasteBehavior = selectedPref;
                    smartPastePreferenceExplicitlySet = true;
                    chrome.storage.local.set({
                        smart_paste_behavior: selectedPref,
                        smart_paste_enabled: selectedPref !== 'off',
                        smart_paste_preference_explicitly_set: true
                    });
                }
                if (isUpload) {
                    processSmartPaste(pastedText);
                } else {
                    insertTextIntoInput(pastedText);
                }
            }
        };

        modal.querySelector('#ag-sp-confirm-upload').onclick = () => handleChoice(true);
        modal.querySelector('#ag-sp-confirm-paste').onclick = () => handleChoice(false);
    }

    function showSmartPasteToast(message) {
        const existing = document.getElementById('ag-sp-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'ag-sp-toast';
        toast.className = 'ag-sp-toast-card';
        toast.innerHTML = `<p style="margin:0; line-height:1.4;">${message}</p>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Attach paste interceptor for Smart Paste
    document.addEventListener('paste', (e) => {
        if (smartPasteBehavior === 'off') return;

        const input = findInputArea();
        if (!input) return;

        // Check if paste event occurred inside or on the input box
        const isInputTarget = input.contains(e.target) || e.target === input;
        if (!isInputTarget) return;

        const pastedText = (e.clipboardData || window.clipboardData)?.getData('text/plain');
        if (!pastedText || pastedText.length < smartPasteThreshold) return;

        // Threshold reached! Intercept paste
        e.preventDefault();

        if (smartPasteBehavior === 'ask') {
            promptSmartPasteConfirmation(pastedText);
        } else {
            processSmartPaste(pastedText);
        }
    }, true);

    // Listen for Send triggers
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && currentContexts.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            maybeInjectAndSend();
        }
    }, true);

    document.addEventListener('click', (e) => {
        if (currentContexts.length > 0 && e.target.closest('button[aria-label="Send message"], button.send-button')) {
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
        if (!usageLimitsEnabled) {
            const card = document.getElementById('ag-quota-sidebar');
            if (card) card.remove();
            return;
        }
        if (!limits) return;

        // Check if user is Gemini Advanced (Pro)
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
        if (isFreeUser) return;
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

    // Read preferences on boot
    chrome.storage.local.get([
        'multi_quote_display',
        'usage_limits_enabled',
        'multi_quote_enabled',
        'smart_paste_behavior',
        'smart_paste_threshold',
        'smart_paste_feedback_done',
        'toc_enabled'
    ], (res) => {
        multiQuoteDisplay = res.multi_quote_display || 'expanded';
        usageLimitsEnabled = res.usage_limits_enabled !== false;
        multiQuoteEnabled = res.multi_quote_enabled !== false;
        smartPasteBehavior = res.smart_paste_behavior || 'auto';
        smartPasteThreshold = res.smart_paste_threshold || 20000;
        smartPasteFeedbackDone = res.smart_paste_feedback_done === true;
        tocEnabled = res.toc_enabled !== false;

        // Hide sidebar immediately if limits are disabled
        if (!usageLimitsEnabled) {
            const card = document.getElementById('ag-quota-sidebar');
            if (card) card.remove();
        }

        buildTableOfContents();
        setupTOCObserver();
    });

    // React to preference changes from the popup in real-time
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.multi_quote_display) {
                multiQuoteDisplay = changes.multi_quote_display.newValue;
            }
            if (changes.usage_limits_enabled) {
                usageLimitsEnabled = changes.usage_limits_enabled.newValue !== false;
                if (!usageLimitsEnabled) {
                    const card = document.getElementById('ag-quota-sidebar');
                    if (card) card.remove();
                } else {
                    requestUsageLimits();
                }
            }
            if (changes.multi_quote_enabled) {
                multiQuoteEnabled = changes.multi_quote_enabled.newValue !== false;
                if (!multiQuoteEnabled && currentContexts.length > 1) {
                    currentContexts = [currentContexts[0]];
                    renderContextBox();
                }
            }
            if (changes.smart_paste_behavior) {
                smartPasteBehavior = changes.smart_paste_behavior.newValue || 'auto';
            }
            if (changes.smart_paste_threshold) {
                smartPasteThreshold = changes.smart_paste_threshold.newValue || 20000;
            }
            if (changes.smart_paste_feedback_done) {
                smartPasteFeedbackDone = changes.smart_paste_feedback_done.newValue === true;
            }
            if (changes.toc_enabled) {
                tocEnabled = changes.toc_enabled.newValue !== false;
                buildTableOfContents();
            }
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 4.4: DYNAMIC TABLE OF CONTENTS (TOC)
    // ═══════════════════════════════════════════════════════════════════════════════

    let tocEnabled = true;
    let tocExpanded = false;
    let tocObserver = null;

    function buildTableOfContents() {
        if (!tocEnabled) {
            removeTOCWidget();
            return;
        }

        const prompts = document.querySelectorAll('user-query');
        if (!prompts || prompts.length === 0) {
            removeTOCWidget();
            return;
        }

        const items = [];
        prompts.forEach((promptEl, index) => {
            const anchorId = `ag-toc-prompt-${index}`;
            if (!promptEl.id || !promptEl.id.startsWith('ag-toc-prompt-')) {
                promptEl.id = anchorId;
            }

            const rawText = promptEl.innerText || promptEl.textContent || '';
            const cleanedText = rawText.replace(/\s+/g, ' ').trim();
            const snippet = cleanedText.length > 50 ? cleanedText.slice(0, 50) + '...' : (cleanedText || `Prompt ${index + 1}`);

            items.push({
                index: index + 1,
                anchorId: promptEl.id,
                title: snippet
            });
        });

        renderTOCWidget(items);
    }

    function renderTOCWidget(items) {
        let widget = document.getElementById('ag-toc-widget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'ag-toc-widget';
            document.body.appendChild(widget);
        }

        widget.innerHTML = `
            <button id="ag-toc-trigger" aria-label="Table of Contents">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                <span>Contents (${items.length})</span>
            </button>
            <div id="ag-toc-panel" style="display: ${tocExpanded ? 'flex' : 'none'};">
                <div id="ag-toc-header">
                    <h4 id="ag-toc-title">Table of Contents</h4>
                    <span id="ag-toc-count">${items.length} prompts</span>
                </div>
                <div id="ag-toc-list">
                    ${items.map(item => `
                        <button class="ag-toc-item" data-target="${item.anchorId}">
                            <span class="ag-toc-num">${item.index}.</span>
                            <span class="ag-toc-text">${item.title}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        const trigger = widget.querySelector('#ag-toc-trigger');
        const panel = widget.querySelector('#ag-toc-panel');

        trigger.onclick = (e) => {
            e.stopPropagation();
            tocExpanded = !tocExpanded;
            panel.style.display = tocExpanded ? 'flex' : 'none';
        };

        widget.querySelectorAll('.ag-toc-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const targetId = btn.getAttribute('data-target');
                scrollToPrompt(targetId);
                tocExpanded = false;
                panel.style.display = 'none';
            };
        });
    }

    function removeTOCWidget() {
        const widget = document.getElementById('ag-toc-widget');
        if (widget) widget.remove();
        tocExpanded = false;
    }

    function scrollToPrompt(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        target.classList.remove('ag-prompt-pulse');
        // Force reflow
        void target.offsetWidth;
        target.classList.add('ag-prompt-pulse');

        setTimeout(() => {
            target.classList.remove('ag-prompt-pulse');
        }, 2000);
    }

    function setupTOCObserver() {
        if (tocObserver) return;

        const targetNode = document.querySelector('infinite-scroller') || document.body;
        tocObserver = new MutationObserver(() => {
            buildTableOfContents();
        });

        tocObserver.observe(targetNode, {
            childList: true,
            subtree: true
        });
    }

    // Initial run
    transformMessages();
    requestUsageLimits();
    updateUserProfile().catch(console.error);
    incrementSessionVisits().catch(console.error);
    buildTableOfContents();
    setupTOCObserver();
    
    // Auto-refresh limits every 60 seconds
    setInterval(requestUsageLimits, 60000);

    console.log('🚀 Ask Gemini: Simplified Engine Active');
})();
