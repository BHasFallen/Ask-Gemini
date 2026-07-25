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
        const anchorId = `ag-toc-prompt-${index}`;
        if (!promptEl.id || !promptEl.id.startsWith('ag-toc-prompt-')) {
            promptEl.id = anchorId;
        }

        const cleanedText = AG.extractCleanPromptText(promptEl);
        const snippet = cleanedText.length > 55 ? cleanedText.slice(0, 55) + '...' : (cleanedText || `Prompt ${index + 1}`);

        items.push({
            index: index,
            num: index + 1,
            anchorId: promptEl.id,
            title: snippet
        });
    });

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

    widget.innerHTML = `
        <div id="ag-toc-bar" class="flex flex-col items-center gap-2 py-1">
            ${items.map((item, idx) => `
                <button type="button"
                    class="ag-toc-dash h-0.5 w-4.5 shrink-0 rounded-full transition-all ${idx === AG.activePromptIndex ? 'active' : ''}"
                    aria-label="Prompt ${item.num}"
                    data-toc-item-index="${idx}"
                    ${idx === AG.activePromptIndex ? 'data-toc-active=""' : ''}>
                </button>
            `).join('')}
        </div>
        <div id="ag-toc-panel">
            ${items.map((item, idx) => `
                <button class="ag-toc-item ${idx === AG.activePromptIndex ? 'active' : ''}" data-target="${item.anchorId}" data-toc-item-index="${idx}" ${idx === AG.activePromptIndex ? 'data-toc-active=""' : ''}>
                    <span class="ag-toc-text">${item.title}</span>
                </button>
            `).join('')}
        </div>
    `;

    // Click listeners on 1:1 dash buttons
    widget.querySelectorAll('.ag-toc-dash').forEach(dash => {
        dash.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(dash.getAttribute('data-toc-item-index'));
            AG.activePromptIndex = idx;
            const targetId = items[idx] ? items[idx].anchorId : null;
            if (targetId) AG.scrollToPrompt(targetId);
            AG.updateActiveState(items);
        };
    });

    // Click listeners inside expanded panel items
    widget.querySelectorAll('.ag-toc-item').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-toc-item-index'));
            AG.activePromptIndex = idx;
            const targetId = btn.getAttribute('data-target');
            if (targetId) AG.scrollToPrompt(targetId);
            AG.updateActiveState(items);
        };
    });
};

// ─── updateActiveState ────────────────────────────────────────────────────────
window.AskGemini.updateActiveState = function updateActiveState(items) {
    var AG = window.AskGemini;
    const widget = document.getElementById('ag-toc-widget');
    if (!widget) return;

    widget.querySelectorAll('.ag-toc-dash').forEach((dash, idx) => {
        if (idx === AG.activePromptIndex) {
            dash.classList.add('active');
            dash.setAttribute('data-toc-active', '');
        } else {
            dash.classList.remove('active');
            dash.removeAttribute('data-toc-active');
        }
    });

    widget.querySelectorAll('.ag-toc-item').forEach((item, idx) => {
        if (idx === AG.activePromptIndex) {
            item.classList.add('active');
            item.setAttribute('data-toc-active', '');
        } else {
            item.classList.remove('active');
            item.removeAttribute('data-toc-active');
        }
    });
};

// ─── removeTOCWidget ─────────────────────────────────────────────────────────
window.AskGemini.removeTOCWidget = function removeTOCWidget() {
    var AG = window.AskGemini;
    const widget = document.getElementById('ag-toc-widget');
    if (widget) widget.remove();
    AG.tocExpanded = false;
    AG.lastTOCSignature = '';
};

// ─── scrollToPrompt ───────────────────────────────────────────────────────────
window.AskGemini.scrollToPrompt = function scrollToPrompt(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
