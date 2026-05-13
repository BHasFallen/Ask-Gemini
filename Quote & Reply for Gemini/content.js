// Gemini: "Ask about this" selection button + reply chip + send-time injection
(() => {
    const BTN_ID = "gemini-reply-float-btn";
    const CHIP_ID = "gemini-reply-chip";
    const SEPARATOR = "⟦◈⟧";
    const MAX_CONTEXT_CHARS = 900;
    const MAX_CHIP_PREVIEW = 80;
    let extensionEnabled = true;

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['enabled'], (result) => {
            extensionEnabled = result.enabled !== false;
            if (!extensionEnabled) {
                cleanupUI();
                setTimeout(showDisabledNudge, 1000);
            }
        });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "togglePlugin") {
                extensionEnabled = request.enabled;
                if (!extensionEnabled) {
                    cleanupUI();
                    showDisabledNudge();
                } else {
                    removeNudge();
                    document.querySelectorAll('.gemini-reply-chip-in-chat').forEach(chip => {
                        chip.style.display = '';
                    });
                    handleDomUpdates();
                }
            }
        });
    }

    function cleanupUI() {
        hideButton();
        removeChip();
        replyContext = "";
        replySourceId = null;
        document.querySelectorAll('.gemini-reply-chip-in-chat').forEach(chip => {
            chip.style.display = 'none';
        });
    }
    let activeListeners = [];

    function addManagedListener(element, event, handler, options) {
        element.addEventListener(event, handler, options);
        activeListeners.push({ element, event, handler, options });
    }

    function cleanup() {
        activeListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        activeListeners = [];
        mo.disconnect();
        const btn = document.getElementById(BTN_ID);
        const chip = document.getElementById(CHIP_ID);
        if (btn) btn.remove();
        if (chip) chip.remove();
        console.log('[Gemini Reply] Cleaned up');
    }
    // Defines colors for Light and Dark modes automatically based on parent body class
    const THEME_CSS = `
        /* Animations */
        
        @keyframes fadeInButton {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }   
        /* Highlight animation for the target message */
        @keyframes flashHighlight {
            0% { background-color: rgba(168, 199, 250, 0.4); }
            100% { background-color: transparent; }
        }
        .highlight-flash {
            animation: flashHighlight 1.5s ease-out;
            border-radius: 4px;
        }
        @keyframes fadeInChip {
            from { 
                opacity: 0; 
                transform: translateY(-8px) scale(0.96); 
            }
            to { 
                opacity: 1; 
                transform: translateY(0) scale(1); 
            }
        }
        @keyframes fadeOutChip {
            from {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
            to {
                opacity: 0;
                transform: translateY(8px) scale(0.96);
            }
        }

        @keyframes slideInChip {
            from { 
                opacity: 0; 
                transform: translateX(-12px); 
            }
            to { 
                opacity: 1; 
                transform: translateX(0); 
            }
        }

        /* Default (Dark Theme) Variables */
        :root, body.dark-theme {
            --reply-accent: #a8c7fa;
            --reply-accent-hover: #c2dcff;
            --reply-bg: #2a2b2d;
            --reply-bg-hover: #35363a;
            --reply-border: #444746;
            --reply-text-primary: #e8eaed;
            --reply-text-secondary: #9aa0a6;
            --reply-chip-bg-history: rgba(138, 180, 248, 0.12);
            --reply-chip-bg-history-hover: rgba(138, 180, 248, 0.18);
            --reply-btn-bg: #e8f0fe;
            --reply-btn-text: #041e49;
            --reply-btn-shadow: rgba(0,0,0,0.4);
            --reply-font: 'Google Sans', system-ui, -apple-system, sans-serif;
            --reply-icon-opacity: 0.9;
        }

        /* Light Theme Overrides */
        body.light-theme {
            --reply-accent: #1a73e8;
            --reply-accent-hover: #1557b0;
            --reply-bg: #f1f3f4;
            --reply-bg-hover: #e8eaed;
            --reply-border: #dadce0;
            --reply-text-primary: #202124;
            --reply-text-secondary: #5f6368;
            --reply-chip-bg-history: rgba(26, 115, 232, 0.08);
            --reply-chip-bg-history-hover: rgba(26, 115, 232, 0.12);
            --reply-btn-bg: #1a73e8;
            --reply-btn-text: #ffffff;
            --reply-btn-shadow: rgba(0,0,0,0.15);
            --reply-icon-opacity: 0.8;
        }

        .gemini-reply-chip-in-chat {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: var(--reply-chip-bg-history);
            border: 1px solid transparent;
            border-left: 3px solid var(--reply-accent);
            padding: 8px 14px;
            border-radius: 8px;
            margin: 0 0 12px 0;
            font-family: var(--reply-font);
            font-size: 13.5px;
            color: var(--reply-text-secondary);
            width: fit-content;
            max-width: 90%;
            cursor: default;
            user-select: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            animation: slideInChip 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .gemini-reply-chip-in-chat:hover {
            background: var(--reply-chip-bg-history-hover);
            border-color: var(--reply-border);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        }
        
        .gemini-reply-chip-in-chat svg {
            opacity: var(--reply-icon-opacity);
            flex-shrink: 0;
            transition: transform 0.2s ease;
        }
        
        .gemini-reply-chip-in-chat:hover svg {
            transform: translateX(-2px);
        }
        
        .gemini-reply-content {
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
            flex: 1;
        }
        
        .gemini-reply-text {
            font-style: italic;
            opacity: 0.95;
            color: var(--reply-text-secondary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
        }
        
        #${CHIP_ID} {
            display: none;
            align-items: center;
            gap: 10px;
            margin: 0 0 -1px 0;
            padding: 10px 12px 12px 12px;
            border-radius: 12px 12px 12px 12px;
            background: var(--reply-bg);
            border: 1px solid var(--reply-border);
            color: var(--reply-text-primary);
            font-family: var(--reply-font);
            font-size: 13px;
            width: 100%;
            box-sizing: border-box;
            z-index: 999;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 -1px 2px rgba(0,0,0,0.04);
            animation: fadeInChip 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        
        #${CHIP_ID}.show {
            display: flex !important;
        }
        
        #${CHIP_ID} svg {
            opacity: var(--reply-icon-opacity);
            flex-shrink: 0;
        }
        
        #${CHIP_ID}-preview {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: 0.9;
            font-style: italic;
            color: var(--reply-text-secondary);
            flex: 1;
        }
        
        #${CHIP_ID}-clear {
            background: none;
            border: none;
            color: var(--reply-text-secondary);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.15s ease;
            opacity: 0.7;
        }
        
        #${CHIP_ID}-clear:hover {
            background: var(--reply-bg-hover);
            opacity: 1;
            transform: scale(1.1);
        }
        
        #${CHIP_ID}-clear svg {
            width: 16px;
            height: 16px;
        }
        #${CHIP_ID}.fade-out {
            animation: fadeOutChip 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
        }

        
        /* Floating Button Styles */
        #${BTN_ID} {
            font-family: var(--reply-font);
            font-size: 14px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: fixed;
            z-index: 999999;
            display: none;
            align-items: center;
            padding: 8px 16px;
            border-radius: 20px;
            background: var(--reply-btn-bg);
            color: var(--reply-btn-text);
            border: none;
            font-weight: 500;
            box-shadow: 0 4px 12px var(--reply-btn-shadow);
            cursor: pointer;
            animation: fadeInButton 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #${BTN_ID}:hover { 
            transform: scale(1.05) translateY(-1px); 
            box-shadow: 0 6px 16px var(--reply-btn-shadow);
        }
        
        #${BTN_ID}:active {
            transform: scale(0.98);
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = THEME_CSS;
    document.head.appendChild(styleSheet);


    let replyContext = "";
    let replySourceId = null;
    let injecting = false;

    function buildContextBlock(context, asHtml = false) {
        let cleanContext = context.trim().replace(/\s+/g, " ");
        if (cleanContext.length > MAX_CONTEXT_CHARS) {
            cleanContext = cleanContext.slice(0, MAX_CONTEXT_CHARS) + "…";
        }

        const idBlock = replySourceId ? `source_id:${replySourceId} ${SEPARATOR} ` : "";

        return `The user is referring to this part of the chat: > ${cleanContext} ${SEPARATOR} ${idBlock}`;
    }
    function maybeInjectAndSend() {
        if (injecting) return false;
        if (!replyContext) return false;

        const input = findComposerInput();
        if (!input) return false;
        const sendBtn = findSendButton();
        if (!sendBtn) return false;

        injecting = true;

        try {
            const original = getComposerText(input);
            const useHtml = (input.tagName !== "TEXTAREA");
            const contextBlock = buildContextBlock(replyContext, useHtml);
            const composed = contextBlock + (original || "");

            const originalColor = input.style.color;
            input.style.color = 'transparent';

            setComposerTextDirect(input, composed, useHtml);

            requestAnimationFrame(() => {
                sendBtn.click();
                removeChip();
                
                setTimeout(() => {
                    input.style.color = originalColor || '';
                }, 50);
                
                setTimeout(() => {
                    const now = getComposerText(input);
                    if (now && now.trim().length > 0) {
                        setComposerTextDirect(input, original, useHtml);
                    }
                    clearReplyContext();
                    injecting = false;
                }, 650);
            });
            return true;
        } catch (err) {
            if (input) {
                input.style.color = '';
            }
            injecting = false;
            return false;
        }
    }

    function handleDomUpdates() {
        if (!extensionEnabled) return;

        if (replyContext) {
            const container = findComposerContainer();
            const chip = document.getElementById(CHIP_ID);
            if (container && (!chip || !container.contains(chip))) scheduleChipRender();
        }

        const textLines = document.querySelectorAll('p.query-text-line');
        textLines.forEach(p => {
            if (p.getAttribute('data-reply-processed')) return;

            const fullParagraphText = p.textContent || '';
            if (!fullParagraphText.includes(SEPARATOR)) return;

            const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);
            let targetNode = null;
            let precedingNodes = [];
            let found = false;

            while (walker.nextNode()) {
                if (!found) {
                    if (walker.currentNode.textContent.includes(SEPARATOR)) {
                        targetNode = walker.currentNode;
                        found = true;
                    } else {
                        precedingNodes.push(walker.currentNode);
                    }
                }
            }

            if (targetNode) {
                const fullText = targetNode.textContent;
                const splitParts = fullText.split(SEPARATOR);
                
                if (splitParts.length < 2) {
                    p.setAttribute('data-reply-processed', 'true');
                    return;
                }
                
                const firstPart = splitParts[0];

                let tempQuote = firstPart.replace("The user is referring to this part of the chat:", "").trim();
                if (tempQuote.startsWith('>')) tempQuote = tempQuote.substring(1).trim();
                const rawQuote = tempQuote;
                
                if (!rawQuote || rawQuote.length < 2) {
                    p.setAttribute('data-reply-processed', 'true');
                    return;
                }

                let extractedId = null;
                for (let i = 1; i < splitParts.length - 1; i++) {
                    const part = splitParts[i].trim();
                    if (part.startsWith('source_id:')) {
                        extractedId = part.replace('source_id:', '').trim();
                    }
                }

                const replyRemainder = splitParts[splitParts.length - 1];

                const chip = document.createElement('div');
                chip.className = 'gemini-reply-chip-in-chat';

                chip.style.cursor = "pointer";
                chip.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    scrollToQuote(rawQuote, chip, extractedId);
                });

                const escapedQuote = truncate(rawQuote, 70)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');

                chip.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--reply-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 14L4 9l5-5"/>
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
                    </svg>
                    <div class="gemini-reply-content">
                        <span class="gemini-reply-text">"${escapedQuote}"</span>
                    </div>
                `;

                targetNode.textContent = replyRemainder.trimStart();
                precedingNodes.forEach(node => {
                    try {
                        if (node.parentNode === p) p.removeChild(node);
                    } catch (e) {}
                });
                while (p.firstChild && (p.firstChild.nodeName === 'BR' || (p.firstChild.nodeType === 3 && !p.firstChild.textContent.trim()))) {
                    p.removeChild(p.firstChild);
                }

                if (p.parentNode) p.parentNode.insertBefore(chip, p);
                p.setAttribute('data-reply-processed', 'true');
            }
        });
    }

    const mo = new MutationObserver(handleDomUpdates);

    const obsInit = () => { 
        mo.observe(document.body, { childList: true, subtree: true }); 
        if (extensionEnabled) {
            handleDomUpdates();
        }
    };
    setTimeout(obsInit, 500);



    function ensureChip() {
        const container = findComposerContainer();
        if (!container) return null;

        let chip = document.getElementById(CHIP_ID);
        if (chip && container.contains(chip)) return chip;

        chip = document.createElement("div");
        chip.id = CHIP_ID;

        chip.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--reply-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 14L4 9l5-5"/>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
            </svg>
            <div style="flex: 1; overflow: hidden; display: flex; align-items: center;">
                <div id="${CHIP_ID}-preview"></div>
            </div>
            <button id="${CHIP_ID}-clear">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        chip.querySelector(`#${CHIP_ID}-clear`).addEventListener("click", (e) => {
            e.preventDefault();
            clearReplyContext();
        });

        try {
            const anchor = container.querySelector("input-area-v2");
            if (anchor) container.insertBefore(chip, anchor);
            else container.appendChild(chip);
        } catch {
            container.appendChild(chip);
        }
        chip.setAttribute('tabindex', '0');

        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearReplyContext();
            }
            if (e.key === 'Enter' || e.key === ' ') {
                const input = findComposerInput();
                if (input) input.focus();
            }
        });

        return chip;
    }

    function ensureButton() {
        let btn = document.getElementById(BTN_ID);
        if (btn) return btn;
        btn = document.createElement("button");
        btn.id = BTN_ID;
        btn.style.cssText = `
            position: absolute; /* <--- CHANGED FROM FIXED */
            z-index: 999999;
            display: none;
            /* ... keep your other styling (align-items, padding, colors, etc.) ... */
        `;
        btn.setAttribute('tabindex', '0');
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                <path d="M9 14L4 9l5-5"/>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
            </svg>
            Ask about this
        `;

        btn.addEventListener("keydown", (e) => {
            if (e.key === "Tab" && !e.shiftKey) {
                const chip = document.getElementById(CHIP_ID);
                if (chip && chip.style.display !== "none") {
                    e.preventDefault();
                    chip.focus();
                }
            }
        });
        btn.addEventListener("click", () => {
            const sel = window.getSelection();
            const text = selectionText(sel);

            if (text && sel && sel.anchorNode) {
                replyContext = text;

                const anchor = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
                const messageContainer = anchor ? anchor.closest('message-content') : null;
                replySourceId = messageContainer ? messageContainer.id : null;

                renderChip();
                hideButton();
                const input = findComposerInput();
                if (input) {
                    input.focus();
                    try {
                        const range = document.createRange();
                        range.selectNodeContents(input);
                        range.collapse(false);
                        const newSel = window.getSelection();
                        newSel.removeAllRanges();
                        newSel.addRange(range);
                    } catch (e) {}
                }
            }
        });
        document.body.appendChild(btn);
        return btn;
    }


    function findComposerContainer() {
        const container = document.querySelector(".input-area-container");
        return (container && isVisible(container)) ? container : null;
    }
    function isVisible(el) { return !!(el && el.getClientRects && el.getClientRects().length); }
    function findComposerInput() {
        const container = findComposerContainer();
        if (!container) return null;
        const candidates = [...container.querySelectorAll('[contenteditable="true"]'), ...container.querySelectorAll('[role="textbox"]'), ...container.querySelectorAll("textarea")].filter(isVisible);
        return candidates[candidates.length - 1] || null;
    }
    function getComposerText(input) { if (!input) return ""; return input.tagName === "TEXTAREA" ? input.value : input.innerText; }
    function setComposerText(input, content, isHtml = false) {
        if (!input) return false; input.focus();
        if (input.tagName === "TEXTAREA") { input.value = content; input.dispatchEvent(new Event("input", { bubbles: true })); return true; }
        try { document.execCommand("selectAll", false, null); document.execCommand(isHtml ? "insertHTML" : "insertText", false, content); } catch { input.innerText = content; }
        input.dispatchEvent(new Event("input", { bubbles: true })); return true;
    }
    function setComposerTextDirect(input, content, isHtml = false) {
        if (!input) return false;
        if (input.tagName === "TEXTAREA") { 
            input.value = content; 
            input.dispatchEvent(new Event("input", { bubbles: true })); 
            return true; 
        }
        input.textContent = content;
        input.dispatchEvent(new Event("input", { bubbles: true })); 
        return true;
    }
    function findSendButton() {
        const container = findComposerContainer(); if (!container) return null;
        const b = container.querySelector('button[aria-label="Send message"]'); return b && isVisible(b) ? b : null;
    }
    function clearReplyContext() { replyContext = ""; replySourceId = null; removeChip(); }

    function renderChip() {
        const chip = ensureChip();
        if (!chip || !replyContext) {
            if (chip) {
                chip.classList.remove('show');
                setTimeout(() => chip.style.display = "none", 250);
            }
            return;
        }
        chip.querySelector(`#${CHIP_ID}-preview`).textContent = truncate(replyContext.replace(/\s+/g, " ").trim(), MAX_CHIP_PREVIEW);

        chip.style.display = "none";
        chip.offsetHeight;
        chip.style.display = "flex";
        requestAnimationFrame(() => {
            chip.classList.add('show');
        });
    }

    function removeChip() {
        const c = document.getElementById(CHIP_ID);
        if (c) {
            c.classList.remove('show');
            c.classList.add('fade-out');
            setTimeout(() => {
                c.style.display = "none";
                c.classList.remove('fade-out');
            }, 250);
        }
    }
    function showDisabledNudge() {
        if (document.getElementById('gemini-reply-nudge')) return;
        if (sessionStorage.getItem('gemini-reply-nudge-dismissed')) return;

        const nudge = document.createElement('div');
        nudge.id = 'gemini-reply-nudge';

        nudge.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            max-width: 280px;
            background: var(--reply-bg);
            border: 1px solid var(--reply-border);
            color: var(--reply-text-primary);
            padding: 12px 16px;
            border-radius: 12px;
            box-shadow: 0 4px 20px var(--reply-btn-shadow);
            font-family: var(--reply-font);
            font-size: 13px;
            line-height: 1.4;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            animation: slideIn 0.3s cubic-bezier(0.2, 0.0, 0.2, 1);
        `;

        nudge.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 10px;">
                <div style="background: var(--reply-bg-hover); border-radius: 50%; padding: 6px; display: flex;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--reply-accent)" stroke-width="2">
                        <path d="M7 17L17 7M17 7H7M17 7V17"/>
                    </svg>
                </div>
                <div>
                    <div style="font-weight: 600; color: var(--reply-accent); margin-bottom: 2px;">Extension Disabled</div>
                    <div style="opacity: 0.9;">Enable <b>Quote & Reply for Gemini</b> to access quote & reply features.</div>
                </div>
            </div>
            <button id="nudge-close" style="align-self: flex-end; background: none; border: none; color: var(--reply-text-secondary); font-family: var(--reply-font); font-size: 11px; font-weight: 500; cursor: pointer; padding: 4px 8px; margin-top: 4px; transition: background 0.15s, opacity 0.15s;">Dismiss</button>
            <style>
                @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                #nudge-close:hover {
                    background: var(--reply-bg-hover);
                    opacity: 1;
                }
                #nudge-close {
                    opacity: 0.8;
                }
            </style>
        `;

        document.body.appendChild(nudge);

        const closeBtn = nudge.querySelector('#nudge-close');
        closeBtn.addEventListener('click', () => {
            nudge.remove();
            sessionStorage.setItem('gemini-reply-nudge-dismissed', 'true');
        });
    }

    function removeNudge() {
        const nudge = document.getElementById('gemini-reply-nudge');
        if (nudge) nudge.remove();
    }
    function scheduleChipRender() { if (!replyContext) return; requestAnimationFrame(renderChip); }
    function getSelection() { const sel = window.getSelection(); return (sel && sel.rangeCount > 0) ? sel : null; }
    function selectionText(sel) { return (sel?.toString() || "").trim(); }
    function hideButton() { const b = document.getElementById(BTN_ID); if (b) b.style.display = "none"; }
    function positionButtonNear(rect) {
        const btn = ensureButton();

        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        const btnHeight = 40;
        const isTopVisible = rect.top > (btnHeight + 10);

        let top;
        if (isTopVisible) {
            top = (rect.top + scrollY) - btnHeight - 8;
        } else {
            top = (rect.bottom + scrollY) + 10;
        }

        const btnWidth = 140;
        let left = (rect.left + scrollX) + (rect.width / 2) - (btnWidth / 2);

        const maxLeft = document.body.clientWidth - btnWidth - 16;
        left = Math.max(16, Math.min(left, maxLeft));

        btn.style.top = `${top}px`;
        btn.style.left = `${left}px`;
        btn.style.display = "flex";
    }
    function truncate(str, n) { 
        if (!str) return ''; 
        return str.length > n ? str.slice(0, n - 1) + "…" : str; 
    }
    function scrollToQuote(targetText, currentChip, targetId) {
        if (targetId) {
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetEl.classList.add('highlight-flash');
                setTimeout(() => targetEl.classList.remove('highlight-flash'), 1500);
                return;
            }
        }

        if (!targetText) return;
        const cleanTarget = targetText.toLowerCase().replace(/\s+/g, ' ').trim();
        const candidates = document.querySelectorAll('.query-text-line, structured-content-container, .model-response-text');
        const reversedCandidates = Array.from(candidates).reverse();

        for (const el of reversedCandidates) {
            if (el.contains(currentChip) || currentChip.contains(el)) continue;
            const elText = el.textContent.toLowerCase().replace(/\s+/g, ' ').trim();
            if (elText.includes(cleanTarget)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('highlight-flash');
                setTimeout(() => el.classList.remove('highlight-flash'), 1500);
                return;
            }
        }
    }
    document.addEventListener("mouseup", () => {
        if (!extensionEnabled) return;
        setTimeout(() => {
            const sel = window.getSelection();

            if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
                hideButton();
                return;
            }

            if (sel.anchorNode) {
                const anchor = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
                if (!anchor || !anchor.closest("structured-content-container, .model-response-text, model-response")) {
                    hideButton();
                    return;
                }
            }

            const text = selectionText(sel);
            if (text.length > 2) {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                positionButtonNear(rect);
            } else {
                hideButton();
            }
        }, 10); 
    });
    document.addEventListener("click", (e) => {
        if (!extensionEnabled) return;
        const sendBtn = findSendButton();
        if (sendBtn && (e.target === sendBtn || sendBtn.contains(e.target))) {
            if (maybeInjectAndSend()) { e.preventDefault(); e.stopPropagation(); }
        }
    }, true);

    document.addEventListener("keydown", (e) => {
        if (!extensionEnabled) return;
        if (e.key === "Enter" && !e.shiftKey) {
            if (maybeInjectAndSend()) { e.preventDefault(); e.stopPropagation(); }
        }
        if (e.key === "Escape") {
            hideButton();
            if (replyContext) { clearReplyContext(); e.preventDefault(); e.stopPropagation(); }
        }

    }, true);
    document.addEventListener("selectionchange", () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
            hideButton();
        }
    });
    window.addEventListener('beforeunload', cleanup);
})();