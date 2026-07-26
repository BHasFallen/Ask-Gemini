/**
 * Ask Gemini: Table of Contents Module
 * Builds a dynamic TOC widget from user-query prompts in the conversation.
 */

window.AskGemini = window.AskGemini || {};

// ─── Owned State ─────────────────────────────────────────────────────────────
window.AskGemini.tocEnabled = true; // overwritten by boot prefs
window.AskGemini.tocExpanded = false;
window.AskGemini.tocObserver = null;
window.AskGemini.tocScheduledTimer = null;
window.AskGemini.lastTOCSignature = '';
window.AskGemini.activePromptIndex = 0;

// ─── scheduleTOCBuild ─────────────────────────────────────────────────────────
window.AskGemini.scheduleTOCBuild = function scheduleTOCBuild() {
    var AG = window.AskGemini;
    if (AG.tocScheduledTimer) return;
    AG.tocScheduledTimer = requestAnimationFrame(() => {
        AG.tocScheduledTimer = null;
        AG.buildTableOfContents();
    });
};

// ─── extractCleanPromptText ───────────────────────────────────────────────────
window.AskGemini.extractCleanPromptText = function extractCleanPromptText(promptEl) {
    if (!promptEl) return '';

    // Clone node so we can strip unwanted attachment chips and elements without affecting the page DOM
    const clone = promptEl.cloneNode(true);

    // Selectors for attachments, icons, file chips, and metadata buttons
    const unwantedSelectors = [
        'file-chip',
        '.file-chip',
        '[class*="chip"]',
        '[class*="attachment"]',
        'button',
        'mat-icon',
        'svg'
    ];

    unwantedSelectors.forEach(sel => {
        clone.querySelectorAll(sel).forEach(node => node.remove());
    });

    // Prefer querying .query-text or [data-test-id="user-query-content"] inside the clone
    const queryTextEl = clone.querySelector('.query-text, [data-test-id="user-query-content"]');
    let rawText = (queryTextEl ? queryTextEl.innerText || queryTextEl.textContent : clone.innerText || clone.textContent) || '';

    // Clean up whitespace
    let cleaned = rawText.replace(/\s+/g, ' ').trim();

    // Strip leading "You said", "You:", "You said:"
    cleaned = cleaned.replace(/^(you said|you:)\s*/i, '').trim();

    // Unwrap surrounding quotes e.g. "my prompt"
    if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2) {
        cleaned = cleaned.slice(1, -1).trim();
    }

    return cleaned;
};

// ─── buildTableOfContents ─────────────────────────────────────────────────────
window.AskGemini.buildTableOfContents = function buildTableOfContents() {
    var AG = window.AskGemini;
    if (!AG.tocEnabled) {
        AG.removeTOCWidget();
        return;
    }

    const prompts = document.querySelectorAll('user-query');
    if (!prompts || prompts.length === 0) {
        AG.removeTOCWidget();
        return;
    }

    const items = [];
    prompts.forEach((promptEl, index) => {
        // Always assign sequential ID based on current DOM position to avoid duplicate IDs during lazy-loading
        const anchorId = `ag-toc-prompt-${index}`;
        promptEl.id = anchorId;

        const cleanedText = AG.extractCleanPromptText(promptEl);
        const snippet = cleanedText.length > 55 ? cleanedText.slice(0, 55) + '...' : (cleanedText || `Prompt ${index + 1}`);

        items.push({
            index: index,
            num: index + 1,
            anchorId: anchorId,
            title: snippet
        });
    });

    // Attach ScrollSpy IntersectionObserver to user-query elements
    AG.setupTOCScrollSpy();

    // Compare signature to prevent unnecessary DOM re-renders & loops
    const currentSignature = items.map(i => `${i.anchorId}:${i.title}`).join('|') + `|active:${AG.activePromptIndex}`;
    if (currentSignature === AG.lastTOCSignature && document.getElementById('ag-toc-widget')) {
        return;
    }
    AG.lastTOCSignature = currentSignature;

    AG.renderTOCWidget(items);
};


// ─── renderTOCWidget ──────────────────────────────────────────────────────────
window.AskGemini.renderTOCWidget = function renderTOCWidget(items) {
    var AG = window.AskGemini;
    let widget = document.getElementById('ag-toc-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'ag-toc-widget';
        document.body.appendChild(widget);
    }

    // 1. Calculate 12-Dash Sliding Window for unhovered side bar (#ag-toc-bar)
    const MAX_DASHES = 12;
    let visibleDashes = items;
    if (items.length > MAX_DASHES) {
        let start = Math.max(0, AG.activePromptIndex - Math.floor(MAX_DASHES / 2));
        let end = start + MAX_DASHES;
        if (end > items.length) {
            end = items.length;
            start = Math.max(0, end - MAX_DASHES);
        }
        visibleDashes = items.slice(start, end);
    }

    const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('icons/icon48.png')
        : '';

    widget.innerHTML = `
        <div id="ag-toc-bar" class="flex flex-col items-center gap-2 py-1">
            ${visibleDashes.map((item) => `
                <button type="button"
                    class="ag-toc-dash h-0.5 w-4.5 shrink-0 rounded-full transition-all ${item.index === AG.activePromptIndex ? 'active' : ''}"
                    aria-label="Prompt ${item.num}"
                    data-toc-item-index="${item.index}"
                    ${item.index === AG.activePromptIndex ? 'data-toc-active=""' : ''}>
                </button>
            `).join('')}
        </div>
        <div id="ag-toc-panel">
            <div class="ag-toc-header">
                <div class="ag-toc-brand">
                    <img src="${iconUrl}" class="ag-toc-brand-icon" alt="Ask Gemini" onerror="this.style.display='none'" />

                    <span class="ag-toc-brand-title">Quote Reply • Table of Contents</span>
                </div>
                <span class="ag-toc-count-badge">${items.length}</span>
            </div>
            ${items.map((item) => `
                <button class="ag-toc-item ${item.index === AG.activePromptIndex ? 'active' : ''}" data-target="${item.anchorId}" data-toc-item-index="${item.index}" ${item.index === AG.activePromptIndex ? 'data-toc-active=""' : ''}>
                    <span class="ag-toc-text">${item.title}</span>
                </button>
            `).join('')}
        </div>
    `;


    // Click listeners on side dash buttons
    widget.querySelectorAll('.ag-toc-dash').forEach(dash => {
        dash.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(dash.getAttribute('data-toc-item-index'));
            AG.activePromptIndex = idx;
            if (items[idx]) AG.activeAnchorId = items[idx].anchorId;
            const targetId = items[idx] ? items[idx].anchorId : null;
            if (targetId) AG.scrollToPrompt(targetId, idx);
            AG.scheduleTOCBuild();
        };
    });

    // Click listeners inside expanded panel items
    widget.querySelectorAll('.ag-toc-item').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-toc-item-index'));
            AG.activePromptIndex = idx;
            if (items[idx]) AG.activeAnchorId = items[idx].anchorId;
            const targetId = btn.getAttribute('data-target');
            if (targetId) AG.scrollToPrompt(targetId, idx);
            AG.scheduleTOCBuild();
        };
    });

    // Auto-scroll expanded panel to center the active item when menu is opened
    widget.onmouseenter = () => {
        const panel = widget.querySelector('#ag-toc-panel');
        const activeItem = widget.querySelector('.ag-toc-item.active');
        if (panel && activeItem) {
            const panelRect = panel.getBoundingClientRect();
            const activeRect = activeItem.getBoundingClientRect();
            const relativeTop = activeRect.top - panelRect.top + panel.scrollTop;
            panel.scrollTop = Math.max(0, relativeTop - (panel.clientHeight / 2) + (activeItem.clientHeight / 2));
        }
    };
};


// ─── setupTOCScrollSpy ────────────────────────────────────────────────────────
window.AskGemini.tocIntersectionObserver = null;
window.AskGemini.hasTocWindowScrollListener = false;

window.AskGemini.setupTOCScrollSpy = function setupTOCScrollSpy() {
    var AG = window.AskGemini;
    if (AG.tocIntersectionObserver) {
        AG.tocIntersectionObserver.disconnect();
    }

    const prompts = document.querySelectorAll('user-query');
    if (!prompts || prompts.length === 0) return;

    // Window Bottom Scroll Detection (Guarantees bottom line is highlighted when at bottom of page)
    if (!AG.hasTocWindowScrollListener) {
        AG.hasTocWindowScrollListener = true;
        window.addEventListener('scroll', () => {
            const scrollPosition = window.innerHeight + window.scrollY;
            const bodyHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            if (scrollPosition >= bodyHeight - 120) {
                const currentPrompts = document.querySelectorAll('user-query');
                if (currentPrompts.length > 0) {
                    const lastIdx = currentPrompts.length - 1;
                    if (AG.activePromptIndex !== lastIdx) {
                        AG.activePromptIndex = lastIdx;
                        if (currentPrompts[lastIdx].id) AG.activeAnchorId = currentPrompts[lastIdx].id;
                        AG.scheduleTOCBuild();
                    }
                }
            }
        }, { passive: true });
    }

    AG.tocIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                if (id && id.startsWith('ag-toc-prompt-')) {
                    const promptEl = entry.target;
                    const allPrompts = Array.from(document.querySelectorAll('user-query'));
                    const idx = allPrompts.indexOf(promptEl);
                    if (idx !== -1 && idx !== AG.activePromptIndex) {
                        AG.activePromptIndex = idx;
                        AG.activeAnchorId = id;
                        AG.scheduleTOCBuild();
                    }
                }
            }
        });
    }, {
        root: null,
        rootMargin: '-5% 0px -40% 0px',
        threshold: 0.15
    });

    prompts.forEach(p => AG.tocIntersectionObserver.observe(p));
};

// ─── updateActiveState ────────────────────────────────────────────────────────
window.AskGemini.updateActiveState = function updateActiveState(items) {
    var AG = window.AskGemini;
    AG.scheduleTOCBuild();
};

// ─── removeTOCWidget ─────────────────────────────────────────────────────────
window.AskGemini.removeTOCWidget = function removeTOCWidget() {
    var AG = window.AskGemini;
    const widget = document.getElementById('ag-toc-widget');
    if (widget) widget.remove();
    if (AG.tocIntersectionObserver) {
        AG.tocIntersectionObserver.disconnect();
        AG.tocIntersectionObserver = null;
    }
    AG.tocExpanded = false;
    AG.lastTOCSignature = '';
};

// ─── scrollToPrompt ───────────────────────────────────────────────────────────
window.AskGemini.scrollToPrompt = function scrollToPrompt(targetId, index) {
    var AG = window.AskGemini;
    const prompts = document.querySelectorAll('user-query');
    let target = (typeof index === 'number' && prompts[index]) ? prompts[index] : document.getElementById(targetId);

    if (!target) return;

    try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
        console.warn('Standard scrollIntoView failed:', err);
    }
};


// ─── setupTOCObserver ─────────────────────────────────────────────────────────
window.AskGemini.setupTOCObserver = function setupTOCObserver() {
    var AG = window.AskGemini;
    if (AG.tocObserver) return;

    const targetNode = document.querySelector('infinite-scroller') || document.body;
    AG.tocObserver = new MutationObserver((mutations) => {
        // Filter out self-mutations originating inside the TOC widget
        const isSelfMutation = mutations.every(m => {
            return (m.target && m.target.closest && m.target.closest('#ag-toc-widget')) ||
                   (m.target && m.target.id === 'ag-toc-widget');
        });
        if (isSelfMutation) return;

        AG.scheduleTOCBuild();
    });

    AG.tocObserver.observe(targetNode, {
        childList: true,
        subtree: true
    });
};


