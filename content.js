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
            bottom: 30px;
            right: 30px;
            width: 320px;
            background: var(--ag-bg);
            border: 1px solid var(--ag-border);
            border-radius: 20px;
            box-shadow: 0 12px 40px var(--ag-shadow);
            padding: 24px;
            z-index: 9999999;
            display: flex;
            flex-direction: column;
            gap: 16px;
            animation: ag-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes ag-slide-up {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
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
            transition: all 0.2s;
        }
        .ag-rating-btn:hover { background: var(--ag-bg-hover); transform: translateY(-1px); }
        .ag-rating-btn-primary { background: var(--ag-primary) !important; color: white !important; border: none !important; }
        
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
        }
        .ag-rating-close:hover { background: var(--ag-bg-hover); color: var(--ag-text); }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = THEME_CSS;
    document.head.appendChild(styleSheet);
    
    const ICONS = {
        ask: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
    };

    let currentContext = null;
    let floatButton = null;
    let contextBox = null;
    let isInjecting = false;

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
                sendBtn.click();
                clearContext();

                // Step 4: Restore visibility after send triggers
                setTimeout(() => {
                    input.style.color = originalColor || '';
                    isInjecting = false;
                }, 50);
            });

            trackEvent('context_reply_sent', { 
                length: currentContext.length,
                context_text: currentContext,
                reply_text: originalText
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
            word_count: words,
            highlighted_text: text 
        });
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
            <h3 class="ag-rating-title">Enjoying Ask Gemini?</h3>
            <p class="ag-rating-text">We're working hard to make your AI experience better. Would you mind supporting us?</p>
            <div class="ag-rating-buttons">
                <button class="ag-rating-btn" id="ag-rate-no">Not really</button>
                <button class="ag-rating-btn ag-rating-btn-primary" id="ag-rate-yes">I love it!</button>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.ag-rating-close').onclick = () => {
            chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'dismissed' });
            modal.remove();
        };

        modal.querySelector('#ag-rate-no').onclick = () => {
            modal.innerHTML = `
                <button class="ag-rating-close">${ICONS.close}</button>
                <h3 class="ag-rating-title">What can we do better?</h3>
                <p class="ag-rating-text">We value your feedback! Tell us how we can improve Ask Gemini for you.</p>
                <div class="ag-rating-buttons">
                    <button class="ag-rating-btn ag-rating-btn-primary" id="ag-give-feedback">Send Feedback</button>
                </div>
            `;
            modal.querySelector('.ag-rating-close').onclick = () => modal.remove();
            modal.querySelector('#ag-give-feedback').onclick = () => {
                chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'feedback_given' });
                window.open('https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform', '_blank');
                modal.remove();
            };
        };

        modal.querySelector('#ag-rate-yes').onclick = () => {
            modal.innerHTML = `
                <button class="ag-rating-close">${ICONS.close}</button>
                <h3 class="ag-rating-title">You're the best! 🌟</h3>
                <p class="ag-rating-text">A 5-star review helps us keep the extension free and powerful for everyone.</p>
                <div class="ag-rating-buttons">
                    <button class="ag-rating-btn ag-rating-btn-primary" id="ag-go-rate">Leave 5 Stars</button>
                </div>
            `;
            modal.querySelector('.ag-rating-close').onclick = () => modal.remove();
            modal.querySelector('#ag-go-rate').onclick = () => {
                chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                modal.remove();
            };
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 4: HISTORY BEAUTIFICATION (Turning Separators into Chips)
    // ═══════════════════════════════════════════════════════════════════════════════

    function transformMessages() {
        const PREFIX = "I'm replying to this:";
        const PREFIX_CURLY = "I\u2019m replying to this:";
        
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
                wrapper.appendChild(proxy);
                
                wrapper.setAttribute('data-ag-processed', 'true');
                wrapper.querySelectorAll('*').forEach(child => child.setAttribute('data-ag-processed', 'true'));
            }
        });
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

    function trackEvent(name, params) {
        chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name, params });
    }

    // Listen for Send triggers
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && currentContext) {
            if (maybeInjectAndSend()) e.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener('click', (e) => {
        if (currentContext && e.target.closest('button[aria-label="Send message"], button.send-button')) {
            maybeInjectAndSend();
        }
    }, true);

    document.addEventListener('mouseup', handleSelection);
    
    // Watch for new messages to transform
    const observer = new MutationObserver(transformMessages);
    observer.observe(document.body, { childList: true, subtree: true });

    // Listen for rating prompts
    chrome.runtime.onMessage.addListener((message) => {
        console.log('📬 Ask Gemini: Message Received', message);
        if (message.type === 'SHOW_RATING_PROMPT') {
            console.log('🌟 Ask Gemini: Attempting to show rating modal...');
            showRatingModal();
        }
    });

    // Initial run
    transformMessages();
    console.log('🚀 Ask Gemini: Simplified Engine Active');
})();
