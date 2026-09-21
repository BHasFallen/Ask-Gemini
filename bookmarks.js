/**
 * Ask Gemini: Bookmarks Module
 * Allows users to bookmark Gemini responses, browse them in a full-page overlay,
 * and export/import bookmarks for backup and device migration.
 */

window.AskGemini = window.AskGemini || {};

(function () {
    const AG = window.AskGemini;

    // ─── Material Symbols Rounded Icons ─────────────────────────────────────────
    const MATERIAL_BOOKMARK_OUTLINE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2zm0 13.97-4.46-2.75c-.33-.2-.75-.2-1.08 0L7 16.97V5h10v11.97z"/></svg>';
    const MATERIAL_BOOKMARK_FILLED = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2z"/></svg>';

    AG.ICONS = AG.ICONS || {};
    AG.ICONS.bookmarkOutline = MATERIAL_BOOKMARK_OUTLINE;
    AG.ICONS.bookmarkFilled = MATERIAL_BOOKMARK_FILLED;
    AG.ICONS.bookmark_outline = MATERIAL_BOOKMARK_OUTLINE;
    AG.ICONS.bookmark_filled = MATERIAL_BOOKMARK_FILLED;

    // ─── State ──────────────────────────────────────────────────────────────────
    AG.bookmarksEnabled = true;
    AG.bookmarksList = [];
    AG.isBookmarksOverlayOpen = false;
    AG.isBookmarkReaderOpen = false;
    AG.activeReaderBookmark = null;
    AG.readerOpenedFromList = false;
    let _bookmarksInitialized = false;

    // ─── Helpers ────────────────────────────────────────────────────────────────
    function generateId() {
        return 'ag_bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    function extractConversationId(url) {
        try {
            const parsed = new URL(url || window.location.href);
            const segments = parsed.pathname.split('/').filter(Boolean);
            const appIdx = segments.indexOf('app');
            if (appIdx !== -1 && segments[appIdx + 1]) {
                return segments[appIdx + 1];
            }
            return segments.length > 0 ? segments[segments.length - 1] : 'current';
        } catch (e) {
            return 'current';
        }
    }

    function formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const now = Date.now();
        const diff = Math.max(0, now - timestamp);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'Just now';
        if (minutes === 1) return '1 min ago';
        if (minutes < 60) return `${minutes} mins ago`;
        if (hours === 1) return '1 hour ago';
        if (hours < 24) return `${hours} hours ago`;
        if (days === 1) return 'Yesterday';
        if (days < 30) return `${days} days ago`;
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ─── Toast Notification ─────────────────────────────────────────────────────
    AG.showBookmarkToast = function (message, actionText, actionCallback) {
        const existing = document.getElementById('ag-bookmark-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'ag-bookmark-toast';
        toast.className = 'ag-bookmark-toast';

        let actionBtnHtml = '';
        if (actionText && typeof actionCallback === 'function') {
            actionBtnHtml = `<button type="button" class="ag-bookmark-toast-action">${escapeHtml(actionText)}</button>`;
        }

        toast.innerHTML = `
            <div class="ag-bookmark-toast-content">
                <span class="ag-bookmark-toast-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2z"/>
                    </svg>
                </span>
                <span class="ag-bookmark-toast-message">${escapeHtml(message)}</span>
            </div>
            ${actionBtnHtml}
        `;

        if (actionText && typeof actionCallback === 'function') {
            const btn = toast.querySelector('.ag-bookmark-toast-action');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toast.remove();
                    actionCallback();
                });
            }
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('ag-toast-fadeout');
                setTimeout(() => toast.remove(), 300);
            }
        }, 3600);
    };

    // ─── Text Cleaning & Deduplication Helpers ─────────────────────────────────
    function deduplicateText(str) {
        if (!str || typeof str !== 'string') return '';
        str = str.trim();
        if (str.length < 4) return str;

        // Check newline duplication
        const lines = str.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (lines.length === 2 && lines[0] === lines[1]) {
            return lines[0];
        }
        if (lines.length > 2 && lines.every(l => l === lines[0])) {
            return lines[0];
        }

        // Check space duplication: e.g. "My battery health is 77% My battery health is 77%"
        if (str.length % 2 === 1) {
            const mid = Math.floor(str.length / 2);
            if (str[mid] === ' ') {
                const firstHalf = str.slice(0, mid);
                const secondHalf = str.slice(mid + 1);
                if (firstHalf === secondHalf) return firstHalf;
            }
        }
        if (str.length % 2 === 0) {
            const mid = str.length / 2;
            const firstHalf = str.slice(0, mid).trim();
            const secondHalf = str.slice(mid).trim();
            if (firstHalf === secondHalf) return firstHalf;
        }

        // Check repeated words/tokens
        const words = str.split(/\s+/);
        if (words.length >= 2 && words.length % 2 === 0) {
            const halfWords = words.length / 2;
            const firstW = words.slice(0, halfWords).join(' ');
            const secondW = words.slice(halfWords).join(' ');
            if (firstW === secondW) return firstW;
        }

        return str;
    }

    function cleanPromptText(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text.trim();
        cleaned = cleaned.replace(/\bEdit prompt\b/gi, '').trim();
        return deduplicateText(cleaned);
    }

    function cleanResponsePreview(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^Gemini\s+said:?\s*/i, '');
        cleaned = cleaned.replace(/^Gemini\s+said(?=[A-Z0-9])/i, '');
        return cleaned.trim();
    }

    AG.cleanPromptText = cleanPromptText;
    AG.cleanResponsePreview = cleanResponsePreview;

    // ─── DOM Data Extraction ────────────────────────────────────────────────────
    function findPrecedingUserPrompt(responseEl) {
        if (!responseEl) return '';

        function getUqText(uq) {
            if (!uq) return '';
            const textContainer = uq.querySelector('.query-text, .user-query-text, .text-content, p');
            const raw = textContainer ? (textContainer.innerText || textContainer.textContent || '') : (uq.innerText || uq.textContent || '');
            return cleanPromptText(raw);
        }

        // 1. Traverse preceding sibling containers
        let current = responseEl.closest('.conversation-turn, .chat-turn, message-turn, .message-content') || responseEl;
        let prev = current.previousElementSibling;
        while (prev) {
            const uq = prev.matches?.('user-query') ? prev : prev.querySelector?.('user-query');
            if (uq) {
                const text = getUqText(uq);
                if (text) return text;
            }
            prev = prev.previousElementSibling;
        }

        // 2. Query all user-query elements and pick the closest one vertically above
        const allUserQueries = Array.from(document.querySelectorAll('user-query'));
        if (allUserQueries.length > 0) {
            const respRect = responseEl.getBoundingClientRect();
            let closest = null;
            let minDistance = Infinity;
            for (const uq of allUserQueries) {
                const uqRect = uq.getBoundingClientRect();
                const dist = respRect.top - uqRect.bottom;
                if (dist >= -50 && dist < minDistance) {
                    minDistance = dist;
                    closest = uq;
                }
            }
            const chosen = closest || allUserQueries[allUserQueries.length - 1];
            if (chosen) {
                return getUqText(chosen);
            }
        }

        return '';
    }

    function extractResponseData(responseEl) {
        if (!responseEl) return { text: '', html: '' };

        const textContainer = responseEl.querySelector(
            '.markdown-main-panel, .model-response-text, .response-container, [data-test-id="model-response"], .message-content, message-content'
        ) || responseEl;

        // ── Build clean semantic HTML from Gemini's live DOM ──────────────────────
        function nodeToHtml(node) {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent || '';
                return escapeHtml(t);
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const tag = node.tagName.toLowerCase();

            // Skip UI-only elements entirely
            if ([
                'button', 'mat-icon', 'svg', 'path', 'gem-icon', 'gem-icon-button',
                'mat-ripple', 'span[class*="mat-focus"]', 'style', 'script'
            ].includes(tag)) return '';

            const cls = node.className || '';
            const skipClasses = [
                'buttons-container-v2', 'message-actions', 'response-actions',
                'mat-mdc-tooltip-trigger', 'ag-bookmark-btn', 'mat-focus-indicator',
                'mat-mdc-button-touch-target', 'mat-mdc-button-persistent-ripple',
                'mdc-icon-button__ripple', 'code-block-decoration', 'buttons',
                'only-show-to-message-actions', 'avatar-container', 'model-avatar',
                'attachment-container'
            ];
            if (skipClasses.some(sc => typeof cls === 'string' && cls.includes(sc))) return '';

            // aria-hidden nodes
            if (node.getAttribute('aria-hidden') === 'true') return '';

            // ── Gemini custom elements ──
            if (tag === 'code-block') {
                const lang = node.getAttribute('language') ||
                    node.querySelector('.code-block-decoration span, .language')?.textContent?.trim() || '';
                const codeEl = node.querySelector('[data-test-id="code-content"], code, pre') || node;
                const codeText = codeEl.textContent || '';
                const headerHtml = lang
                    ? `<div class="ag-modal-code-header"><span>${escapeHtml(lang)}</span></div>`
                    : '';
                return `<div class="ag-modal-code-wrapper">${headerHtml}<pre class="ag-modal-pre"><code>${escapeHtml(codeText)}</code></pre></div>`;
            }

            // <sequence> → numbered stepper — convert to ordered list with headers
            if (tag === 'sequence') {
                const events = node.querySelectorAll('.sequence-event');
                if (events.length === 0) return childrenToHtml(node);
                let html = '<ol class="ag-modal-ol ag-modal-sequence">';
                events.forEach(ev => {
                    const title = ev.querySelector('.sequence-event-title')?.textContent?.trim() || '';
                    const subtitle = ev.querySelector('.sequence-event-subtitle')?.textContent?.trim() || '';
                    const descEl = ev.querySelector('.sequence-event-description');
                    const desc = descEl ? innerContentToHtml(descEl) : '';
                    html += '<li class="ag-modal-oli ag-modal-sequence-step">';
                    if (title) {
                        html += `<strong class="ag-modal-step-title">${escapeHtml(title)}</strong>`;
                        if (subtitle) html += ` <span class="ag-modal-step-sub">${escapeHtml(subtitle)}</span>`;
                    }
                    if (desc) html += `<div class="ag-modal-step-body">${desc}</div>`;
                    html += '</li>';
                });
                html += '</ol>';
                return html;
            }

            // <response-element> → recurse into structured children
            if (tag === 'response-element') return childrenToHtml(node);

            // <structured-node-sequence>, <structured-text> → extract inner content
            if (tag === 'structured-node-sequence' || tag === 'structured-text') {
                return childrenToHtml(node);
            }

            // <structured-list> → extract the inner ul/ol
            if (tag === 'structured-list') {
                return childrenToHtml(node);
            }

            // Standard semantic elements – pass through with children
            const blockTags = ['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside'];
            const inlineTags = ['span', 'a', 'abbr', 'cite', 'q', 'time'];
            const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
            const listTags = ['ul', 'ol', 'li'];
            const emphTags = ['strong', 'b', 'em', 'i', 'u', 's', 'mark', 'del', 'ins'];

            if (tag === 'code') {
                const text = node.textContent || '';
                return `<code class="ag-inline-code">${escapeHtml(text)}</code>`;
            }

            if (tag === 'pre') {
                const codeEl = node.querySelector('code');
                const codeText = codeEl ? (codeEl.textContent || '') : (node.textContent || '');
                return `<div class="ag-modal-code-wrapper"><pre class="ag-modal-pre"><code>${escapeHtml(codeText)}</code></pre></div>`;
            }

            if (tag === 'blockquote') return `<blockquote class="ag-modal-quote">${childrenToHtml(node)}</blockquote>`;
            if (tag === 'table') return `<table>${childrenToHtml(node)}</table>`;
            if (tag === 'thead') return `<thead>${childrenToHtml(node)}</thead>`;
            if (tag === 'tbody') return `<tbody>${childrenToHtml(node)}</tbody>`;
            if (tag === 'tr') return `<tr>${childrenToHtml(node)}</tr>`;
            if (tag === 'th') return `<th>${childrenToHtml(node)}</th>`;
            if (tag === 'td') return `<td>${childrenToHtml(node)}</td>`;
            if (tag === 'br') return '<br>';
            if (tag === 'hr') return '<hr>';

            if (headingTags.includes(tag)) {
                const cls2 = `ag-modal-h${tag[1]}`;
                return `<${tag} class="${cls2}">${childrenToHtml(node)}</${tag}>`;
            }

            if (emphTags.includes(tag)) {
                const inner = childrenToHtml(node);
                if (!inner.trim()) return '';
                return `<${tag}>${inner}</${tag}>`;
            }

            if (tag === 'li') {
                return `<li class="ag-modal-oli">${childrenToHtml(node)}</li>`;
            }

            if (tag === 'ul') return `<ul class="ag-modal-ul">${childrenToHtml(node)}</ul>`;
            if (tag === 'ol') return `<ol class="ag-modal-ol">${childrenToHtml(node)}</ol>`;

            if (tag === 'p') {
                const inner = childrenToHtml(node);
                if (!inner.trim()) return '';
                return `<p class="ag-modal-p">${inner}</p>`;
            }

            if (tag === 'a') {
                const href = (node.getAttribute('href') || '').trim();
                const safe = href && !href.toLowerCase().startsWith('javascript:') ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : '';
                return `<a${safe}>${childrenToHtml(node)}</a>`;
            }

            // div / span / unknown — just recurse children
            return childrenToHtml(node);
        }

        function childrenToHtml(node) {
            let out = '';
            node.childNodes.forEach(child => { out += nodeToHtml(child); });
            return out;
        }

        // Inner content of a description container (skips sequence export headers etc.)
        function innerContentToHtml(container) {
            let out = '';
            container.childNodes.forEach(child => { out += nodeToHtml(child); });
            return out;
        }

        // Walk the live DOM and build clean HTML
        let cleanHtml = childrenToHtml(textContainer);

        // Collapse runs of whitespace-only lines while preserving structure
        cleanHtml = cleanHtml.replace(/(<\/(?:p|h[1-6]|blockquote|li|div)>)\s+(<(?:p|h[1-6]|blockquote|li|div|ul|ol))/g, '$1$2');
        cleanHtml = cleanHtml.replace(/^(\s*<p[^>]*>\s*Gemini\s+said:?\s*<\/p>\s*)/i, '');
        cleanHtml = cleanHtml.trim();

        // ── Build markdown text fallback ───────────────────────────────────────────
        const textClone = textContainer.cloneNode(true);
        textClone.querySelectorAll(
            '.buttons-container-v2, .message-actions, .response-actions, button, mat-icon, svg, .mat-mdc-tooltip-trigger, .ag-bookmark-btn, .visually-hidden, [aria-hidden="true"], .avatar-container, .model-avatar, .code-block-decoration, .only-show-to-message-actions'
        ).forEach(n => n.remove());

        // Sequence → numbered list text
        textClone.querySelectorAll('sequence').forEach(seq => {
            let text = '';
            const events = seq.querySelectorAll('.sequence-event');
            events.forEach((ev, i) => {
                const title = ev.querySelector('.sequence-event-title')?.textContent?.trim() || '';
                if (title) text += `\n**${i + 1}. ${title}**\n`;
                const desc = ev.querySelector('.sequence-event-description');
                if (desc) {
                    // code blocks inside
                    desc.querySelectorAll('code-block, pre').forEach(cb => {
                        const lang = cb.getAttribute?.('language') || cb.querySelector?.('.code-block-decoration span')?.textContent?.trim() || '';
                        const codeEl = cb.querySelector?.('[data-test-id="code-content"], code') || cb;
                        text += `\n\`\`\`${lang}\n${(codeEl.textContent || '').trim()}\n\`\`\`\n`;
                        cb.remove();
                    });
                    text += desc.innerText || desc.textContent || '';
                }
            });
            seq.replaceWith(document.createTextNode(text));
        });

        // Code blocks to markdown ```
        textClone.querySelectorAll('code-block, pre').forEach(block => {
            const lang = block.getAttribute?.('language') || block.querySelector?.('.code-block-decoration span, .language')?.textContent?.trim() || '';
            const codeEl = block.querySelector?.('[data-test-id="code-content"], code') || block;
            const codeText = (codeEl.textContent || '').trim();
            block.replaceWith(document.createTextNode('\n```' + lang + '\n' + codeText + '\n```\n'));
        });

        textClone.querySelectorAll('code').forEach(c => {
            c.replaceWith(document.createTextNode(' `' + c.textContent.trim() + '` '));
        });
        textClone.querySelectorAll('strong, b').forEach(b => {
            b.replaceWith(document.createTextNode(' **' + b.textContent.trim() + '** '));
        });
        textClone.querySelectorAll('li').forEach(li => {
            li.replaceWith(document.createTextNode('\n• ' + li.textContent.trim()));
        });

        let rawText = (textClone.innerText || textClone.textContent || '').trim();
        rawText = rawText.replace(/\n{3,}/g, '\n\n');
        const cleanText = cleanResponsePreview(rawText);

        return { text: cleanText, html: cleanHtml };
    }

    function extractResponseText(responseEl) {
        return extractResponseData(responseEl).text;
    }

    function extractModelName() {
        // Try common model selector buttons or titles in Gemini
        const modelBtn = document.querySelector(
            'button[data-test-id="model-select-button"], .model-select-button, button:has(.model-title), [aria-label*="model" i], button.input-area-model-picker-btn'
        );
        if (modelBtn) {
            const text = (modelBtn.innerText || modelBtn.textContent || '').trim();
            if (text && text.length < 30) {
                return text.replace(/\n.*/g, '').trim();
            }
        }
        const modelTitle = document.querySelector('.model-title, [class*="model-pill"], [class*="model-badge"]');
        if (modelTitle) {
            const titleText = (modelTitle.innerText || modelTitle.textContent || '').trim();
            if (titleText && titleText.length < 30) return titleText;
        }
        return '';
    }

    // ─── Bookmark Manager ───────────────────────────────────────────────────────
    AG.BookmarkManager = {
        async init() {
            if (_bookmarksInitialized) return;
            _bookmarksInitialized = true;

            try {
                const res = await chrome.storage.local.get(['ag_bookmarks', 'bookmarks_enabled']);
                AG.bookmarksEnabled = res.bookmarks_enabled !== false;
                AG.bookmarksList = Array.isArray(res.ag_bookmarks) ? res.ag_bookmarks : [];
            } catch (e) {
                console.error('Ask Gemini: Failed to load bookmarks', e);
                AG.bookmarksList = [];
            }

            // Listen for cross-tab or background changes
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;
                if (changes.ag_bookmarks) {
                    AG.bookmarksList = Array.isArray(changes.ag_bookmarks.newValue) ? changes.ag_bookmarks.newValue : [];
                    AG.updateAllBookmarkButtonStates();
                    if (AG.isBookmarksOverlayOpen) {
                        AG.renderBookmarksList();
                    }
                    AG.updateSidebarBadge();
                }
                if (changes.bookmarks_enabled) {
                    AG.bookmarksEnabled = changes.bookmarks_enabled.newValue !== false;
                    if (!AG.bookmarksEnabled) {
                        document.querySelectorAll('.ag-bookmark-btn').forEach(b => b.remove());
                        const navItem = document.getElementById('ag-bookmarks-sidebar-btn');
                        if (navItem) navItem.remove();
                        if (AG.restoreGemsLink) AG.restoreGemsLink();
                        if (AG.isBookmarksOverlayOpen) AG.closeBookmarksOverlay();
                    } else {
                        AG.injectBookmarkButtons();
                        AG.injectSidebarBookmarkNav();
                    }
                }
            });

            // Keyboard shortcut Ctrl+Shift+B / Cmd+Shift+B
            window.addEventListener('keydown', (e) => {
                if (!AG.bookmarksEnabled) return;
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const isModifier = isMac ? e.metaKey : e.ctrlKey;
                if (isModifier && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
                    e.preventDefault();
                    e.stopPropagation();
                    AG.toggleBookmarksOverlay();
                } else if (e.key === 'Escape' && AG.isBookmarksOverlayOpen) {
                    e.preventDefault();
                    if (AG.isBookmarkReaderOpen) {
                        AG.closeBookmarkReader();
                    } else {
                        AG.closeBookmarksOverlay();
                    }
                }
            });

            AG.injectSidebarBookmarkNav();
        },

        async saveToStorage() {
            try {
                await chrome.storage.local.set({
                    ag_bookmarks: AG.bookmarksList,
                    bookmarks_count: AG.bookmarksList.length
                });
            } catch (e) {
                console.error('Ask Gemini: Failed to save bookmarks to storage', e);
            }
        },

        async addBookmark(responseEl) {
            if (!responseEl) return null;

            const promptText = findPrecedingUserPrompt(responseEl) || 'Saved Gemini response';
            const { text: fullResponse, html: responseHtml } = extractResponseData(responseEl);
            // Generous 50,000 character buffer ensures extensive code blocks and long replies are never cut off
            const responseText = fullResponse.slice(0, 50000);
            const currentUrl = window.location.href;
            const conversationId = extractConversationId(currentUrl);
            const modelName = extractModelName();

            // Create new bookmark object with rich HTML and markdown text
            const bookmark = {
                id: generateId(),
                promptText: promptText,
                responseText: responseText,
                responseHtml: responseHtml || '',
                conversationUrl: currentUrl,
                conversationId: conversationId,
                createdAt: Date.now(),
                modelName: modelName
            };

            AG.bookmarksList.unshift(bookmark);
            await this.saveToStorage();

            AG.updateAllBookmarkButtonStates();
            AG.updateSidebarBadge();

            // Track event
            if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    name: 'bookmark_added',
                    params: {
                        response_length: responseText.length,
                        has_code: responseText.includes('```') || !!responseEl.querySelector('pre, code'),
                        prompt_length: promptText.length
                    }
                });
            }

            AG.showBookmarkToast('Bookmarked!', 'View', () => {
                AG.openBookmarksOverlay();
            });

            return bookmark;
        },

        async removeBookmark(bookmarkIdOrEl) {
            let idToRemove = null;
            if (typeof bookmarkIdOrEl === 'string') {
                idToRemove = bookmarkIdOrEl;
            } else if (bookmarkIdOrEl instanceof Element) {
                const matched = AG.findBookmarkForResponse(bookmarkIdOrEl);
                if (matched) idToRemove = matched.id;
            }

            if (!idToRemove) return;

            AG.bookmarksList = AG.bookmarksList.filter(b => b.id !== idToRemove);
            await this.saveToStorage();

            AG.updateAllBookmarkButtonStates();
            AG.updateSidebarBadge();

            if (AG.isBookmarksOverlayOpen) {
                AG.renderBookmarksList();
            }

            if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    name: 'bookmark_removed',
                    params: { bookmark_id: idToRemove }
                });
            }

            AG.showBookmarkToast('Bookmark removed');
        },

        async clearAll() {
            if (AG.bookmarksList.length === 0) return;
            const confirmed = window.confirm('Are you sure you want to delete all bookmarks? This cannot be undone.');
            if (!confirmed) return;

            AG.bookmarksList = [];
            await this.saveToStorage();

            AG.updateAllBookmarkButtonStates();
            AG.updateSidebarBadge();

            if (AG.isBookmarksOverlayOpen) {
                AG.renderBookmarksList();
            }

            AG.showBookmarkToast('All bookmarks cleared');
        },

        exportBookmarks() {
            const count = AG.bookmarksList.length;
            if (count === 0) {
                AG.showBookmarkToast('No bookmarks to export');
                return;
            }

            const exportData = {
                version: 1,
                exportedAt: new Date().toISOString(),
                count: count,
                bookmarks: AG.bookmarksList
            };

            const jsonStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const a = document.createElement('a');
            a.href = url;
            a.download = `ask-gemini-bookmarks-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: 'TRACK_EVENT',
                    name: 'bookmarks_exported',
                    params: { count: count }
                });
            }

            AG.showBookmarkToast(`Exported ${count} bookmark${count === 1 ? '' : 's'}`);
        },

        async importBookmarks(file) {
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    let incoming = [];
                    if (Array.isArray(parsed)) {
                        incoming = parsed;
                    } else if (parsed && Array.isArray(parsed.bookmarks)) {
                        incoming = parsed.bookmarks;
                    } else {
                        throw new Error('Invalid bookmark file structure');
                    }

                    const existingIds = new Set(AG.bookmarksList.map(b => b.id));
                    const existingSnippets = new Set(AG.bookmarksList.map(b => (b.responseText || '').slice(0, 100)));

                    let addedCount = 0;
                    let skippedCount = 0;

                    for (const item of incoming) {
                        if (!item || (!item.responseText && !item.promptText)) continue;
                        const snippet = (item.responseText || '').slice(0, 100);

                        if (existingIds.has(item.id) || (snippet && existingSnippets.has(snippet))) {
                            skippedCount++;
                            continue;
                        }

                        const cleanItem = {
                            id: item.id || generateId(),
                            promptText: item.promptText || 'Imported response',
                            responseText: item.responseText || '',
                            conversationUrl: item.conversationUrl || window.location.href,
                            conversationId: item.conversationId || extractConversationId(item.conversationUrl),
                            createdAt: item.createdAt || Date.now(),
                            modelName: item.modelName || ''
                        };

                        AG.bookmarksList.unshift(cleanItem);
                        existingIds.add(cleanItem.id);
                        if (snippet) existingSnippets.add(snippet);
                        addedCount++;
                    }

                    // Re-sort newest first
                    AG.bookmarksList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

                    await AG.BookmarkManager.saveToStorage();
                    AG.updateAllBookmarkButtonStates();
                    AG.updateSidebarBadge();

                    if (AG.isBookmarksOverlayOpen) {
                        AG.renderBookmarksList();
                    }

                    if (chrome.runtime && chrome.runtime.sendMessage) {
                        chrome.runtime.sendMessage({
                            type: 'TRACK_EVENT',
                            name: 'bookmarks_imported',
                            params: { count: addedCount, skipped: skippedCount }
                        });
                    }

                    AG.showBookmarkToast(`Imported ${addedCount} new bookmark${addedCount === 1 ? '' : 's'} (${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped)`);
                } catch (err) {
                    console.error('Ask Gemini: Error importing bookmarks', err);
                    AG.showBookmarkToast('Failed to import: Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
    };

    // ─── Find Bookmark For Given Response DOM ───────────────────────────────────
    AG.findBookmarkForResponse = function (responseEl) {
        if (!responseEl || AG.bookmarksList.length === 0) return null;

        const text = extractResponseText(responseEl);
        if (!text) return null;

        const snippet = text.slice(0, 100);
        // 1. Try matching first 100 characters of response text
        for (const bm of AG.bookmarksList) {
            if (bm.responseText && bm.responseText.slice(0, 100) === snippet) {
                return bm;
            }
        }

        // 2. Try prompt text matching if within current conversation
        const prompt = findPrecedingUserPrompt(responseEl);
        if (prompt) {
            const currentConvId = extractConversationId(window.location.href);
            for (const bm of AG.bookmarksList) {
                if (bm.conversationId === currentConvId && bm.promptText === prompt) {
                    return bm;
                }
            }
        }

        return null;
    };

    // ─── Bookmark Buttons Injection ─────────────────────────────────────────────
    AG.injectBookmarkButtons = function () {
        if (!AG.bookmarksEnabled) return;

        const containers = document.querySelectorAll(
            '.buttons-container-v2, .message-actions .buttons-container, .response-actions'
        );

        containers.forEach((container) => {
            if (container.querySelector('.ag-bookmark-btn')) return;

            const responseEl = container.closest(
                '.model-response, model-response, .message-content, message-content, .conversation-turn, message-turn'
            ) || container.parentElement;

            const existingBm = AG.findBookmarkForResponse(responseEl);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ag-bookmark-btn' + (existingBm ? ' bookmarked' : '');
            btn.setAttribute('aria-label', existingBm ? 'Remove bookmark (Quote Reply)' : 'Bookmark response (Quote Reply)');
            btn.setAttribute('title', existingBm ? 'Remove bookmark (Quote Reply)' : 'Bookmark response (Quote Reply)');
            btn.setAttribute('data-test-id', 'ag-bookmark-button');
            if (existingBm) {
                btn.dataset.bookmarkId = existingBm.id;
            }

            const iconSvg = existingBm ? MATERIAL_BOOKMARK_FILLED : MATERIAL_BOOKMARK_OUTLINE;

            btn.innerHTML = `<span class="ag-bookmark-icon-wrap">${iconSvg}</span>`;

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                btn.classList.add('ag-bookmark-pop');
                setTimeout(() => btn.classList.remove('ag-bookmark-pop'), 350);

                const isCurrentlyBookmarked = btn.classList.contains('bookmarked');
                if (isCurrentlyBookmarked) {
                    const id = btn.dataset.bookmarkId;
                    await AG.BookmarkManager.removeBookmark(id || responseEl);
                    btn.classList.remove('bookmarked');
                    delete btn.dataset.bookmarkId;
                    btn.setAttribute('aria-label', 'Bookmark response');
                    btn.setAttribute('title', 'Bookmark response');
                    btn.querySelector('.ag-bookmark-icon-wrap').innerHTML = MATERIAL_BOOKMARK_OUTLINE;
                } else {
                    const newBm = await AG.BookmarkManager.addBookmark(responseEl);
                    if (newBm) {
                        btn.classList.add('bookmarked');
                        btn.dataset.bookmarkId = newBm.id;
                        btn.setAttribute('aria-label', 'Remove bookmark');
                        btn.setAttribute('title', 'Remove bookmark');
                        btn.querySelector('.ag-bookmark-icon-wrap').innerHTML = MATERIAL_BOOKMARK_FILLED;
                    }
                }
            });

            // Positioning: after copy button, or before more menu button, or append
            const copyBtn = container.querySelector(
                'copy-button, button[aria-label*="Copy" i], [data-test-id="copy-button"]'
            );
            const moreBtn = container.querySelector(
                'button[aria-label*="More" i], [data-test-id="more-menu-button"], mat-menu-trigger'
            );

            if (copyBtn && copyBtn.parentElement === container) {
                copyBtn.insertAdjacentElement('afterend', btn);
            } else if (moreBtn && moreBtn.parentElement === container) {
                container.insertBefore(btn, moreBtn);
            } else {
                container.appendChild(btn);
            }
        });
    };

    AG.updateAllBookmarkButtonStates = function () {
        const buttons = document.querySelectorAll('.ag-bookmark-btn');
        buttons.forEach((btn) => {
            const container = btn.parentElement;
            if (!container) return;
            const responseEl = container.closest(
                '.model-response, model-response, .message-content, message-content, .conversation-turn, message-turn'
            ) || container.parentElement;

            const existingBm = AG.findBookmarkForResponse(responseEl);
            const iconWrap = btn.querySelector('.ag-bookmark-icon-wrap');
            if (existingBm) {
                btn.classList.add('bookmarked');
                btn.dataset.bookmarkId = existingBm.id;
                btn.setAttribute('aria-label', 'Remove bookmark');
                btn.setAttribute('title', 'Remove bookmark');
                if (iconWrap) iconWrap.innerHTML = MATERIAL_BOOKMARK_FILLED;
            } else {
                btn.classList.remove('bookmarked');
                delete btn.dataset.bookmarkId;
                btn.setAttribute('aria-label', 'Bookmark response');
                btn.setAttribute('title', 'Bookmark response');
                if (iconWrap) iconWrap.innerHTML = MATERIAL_BOOKMARK_OUTLINE;
            }
        });
    };

    // ─── Sidebar Navigation Helper ──────────────────────────────────────────────
    function findSidebarAnchor(sidebar) {
        if (!sidebar) return null;

        function isGems(el) {
            if (!el || el.id === 'ag-bookmarks-sidebar-btn' || el.closest('#ag-bookmarks-sidebar-btn')) return false;
            const text = (el.textContent || '').trim().toLowerCase();
            const href = el.getAttribute ? (el.getAttribute('href') || '') : '';
            const testId = el.getAttribute ? (el.getAttribute('data-test-id') || '') : '';
            const aria = el.getAttribute ? (el.getAttribute('aria-label') || '') : '';
            return text === 'gems' || text.startsWith('gems\n') || href.includes('/gems') || testId.includes('gems') || aria.toLowerCase() === 'gems';
        }

        function isLibrary(el) {
            if (!el || el.id === 'ag-bookmarks-sidebar-btn' || el.closest('#ag-bookmarks-sidebar-btn')) return false;
            const text = (el.textContent || '').trim().toLowerCase();
            const href = el.getAttribute ? (el.getAttribute('href') || '') : '';
            const testId = el.getAttribute ? (el.getAttribute('data-test-id') || '') : '';
            const aria = el.getAttribute ? (el.getAttribute('aria-label') || '') : '';
            return text === 'library' || text.startsWith('library\n') || href.includes('/library') || testId.includes('library') || aria.toLowerCase() === 'library';
        }

        const candidates = Array.from(sidebar.querySelectorAll('a, button, [role="button"], [role="listitem"], mat-list-item, div'));
        let target = candidates.find(isGems) || candidates.find(isLibrary);

        if (target) {
            let itemWrapper = target.closest('mat-list-item, [role="listitem"], [role="presentation"], li, a, button') || target;
            let current = itemWrapper;
            while (current && current.parentElement && current.parentElement !== sidebar) {
                const parent = current.parentElement;
                if (parent.children.length > 1 && !parent.matches('bard-sidenav, mat-sidenav, body, html')) {
                    return current;
                }
                current = parent;
            }
            return itemWrapper;
        }

        // Fallback: After "New chat" button container
        const newChatBtn = sidebar.querySelector(
            'button[aria-label*="New chat" i], a[aria-label*="New chat" i], .new-chat-button, [data-test-id="new-chat-button"]'
        );
        if (newChatBtn) {
            return newChatBtn.closest('.new-chat-container, mat-list-item, [role="listitem"], li') || newChatBtn;
        }

        return null;
    }

    // ─── Sidebar Navigation Item ────────────────────────────────────────────────
    AG.injectSidebarBookmarkNav = function () {
        if (!AG.bookmarksEnabled) return;

        // 1. Clean up any stray custom button so there is never a duplicate bookmark button
        document.querySelectorAll('#ag-bookmarks-sidebar-btn').forEach(el => el.remove());

        // 2. Discover all Gems nav items or links in sidebar (both expanded list row & collapsed rail button)
        const gemsLinks = new Set();
        document.querySelectorAll('gem-nav-list-item[data-test-id="gems-side-nav-entry-button"]').forEach(container => {
            const link = container.querySelector('a, button');
            if (link) gemsLinks.add(link);
        });
        document.querySelectorAll(
            'a[href="/gems/view"], a[href*="/gems"], a[aria-label="Gems"], a[data-ag-nav="bookmarks"], ' +
            'a:has(mat-icon[fonticon="gems"]), a:has(mat-icon[data-mat-icon-name="gems"])'
        ).forEach(link => {
            gemsLinks.add(link);
        });

        if (gemsLinks.size > 0) {
            gemsLinks.forEach(gemsLink => {
                // Set link attributes
                gemsLink.setAttribute('aria-label', 'Bookmarks (Quote Reply)');
                gemsLink.setAttribute('title', 'Bookmarks (Quote Reply • Ctrl+Shift+B)');
                gemsLink.setAttribute('href', '#');
                gemsLink.dataset.agNav = 'bookmarks';

                const isIconButton = gemsLink.classList.contains('mdc-icon-button') ||
                                     gemsLink.hasAttribute('maticonbutton') ||
                                     Boolean(gemsLink.closest('gem-icon-button, .icon-button-badge-container'));

                if (isIconButton) {
                    // COLLAPSED RAIL MODE: Circular button matching Students/Images/Videos/Library
                    gemsLink.style.paddingLeft = '';
                    gemsLink.style.paddingRight = '';
                    gemsLink.style.paddingInlineStart = '';

                    const iconEl = gemsLink.querySelector('gem-icon, mat-icon');
                    if (iconEl) {
                        iconEl.style.marginLeft = '';
                        iconEl.style.marginInlineStart = '';
                        iconEl.style.paddingLeft = '';
                        iconEl.style.paddingInlineStart = '';
                        iconEl.style.width = '';
                        iconEl.style.minWidth = '';
                        iconEl.style.display = 'flex';
                        iconEl.style.justifyContent = 'center';
                        iconEl.style.alignItems = 'center';

                        const existingSvg = iconEl.querySelector('svg');
                        if (!existingSvg || iconEl.querySelector('.ag-bookmarks-nav-icon')) {
                            iconEl.innerHTML = MATERIAL_BOOKMARK_OUTLINE;
                        }
                    }
                } else {
                    // EXPANDED SIDEBAR MODE: Row item with left icon, 13px label, and trailing badge
                    const titleSpan = gemsLink.querySelector('.title-text, .label-and-badge span, .mdc-list-item__primary-text span');
                    if (titleSpan) {
                        if (titleSpan.textContent !== 'Bookmarks') {
                            titleSpan.textContent = 'Bookmarks';
                        }
                        titleSpan.style.fontSize = '13px';
                    }

                    // Push SVG to the farthest left of the containing container
                    gemsLink.style.paddingLeft = '0px';
                    gemsLink.style.paddingInlineStart = '0px';

                    // Replace icon with Google Material Symbols Rounded Bookmark directly (no wrapper span)
                    const iconContainer = gemsLink.querySelector('[matlistitemicon], .leading-icon-container, gem-icon');
                    if (iconContainer) {
                        iconContainer.style.marginLeft = '0px';
                        iconContainer.style.marginInlineStart = '0px';
                        iconContainer.style.paddingLeft = '0px';
                        iconContainer.style.paddingInlineStart = '0px';
                        iconContainer.style.width = 'auto';
                        iconContainer.style.minWidth = '0px';
                        iconContainer.style.display = 'flex';
                        iconContainer.style.justifyContent = 'flex-start';
                        iconContainer.style.alignItems = 'center';

                        const existingSvg = iconContainer.querySelector('svg');
                        if (!existingSvg || iconContainer.querySelector('.ag-bookmarks-nav-icon')) {
                            iconContainer.innerHTML = MATERIAL_BOOKMARK_OUTLINE;
                        }
                    }

                    // Update badge in trailing meta slot
                    const count = AG.bookmarksList.length;
                    const trailingSlot = gemsLink.querySelector('.trailing-slot-content, [matlistitemmeta], .mat-mdc-list-item-meta');
                    if (trailingSlot) {
                        if (count > 0) {
                            trailingSlot.className = 'trailing-slot-content ng-star-inserted';
                            trailingSlot.innerHTML = `<span class="ag-bookmarks-nav-badge">${count}</span>`;
                        } else {
                            trailingSlot.className = 'trailing-slot-content no-trailing-content ng-star-inserted';
                            trailingSlot.innerHTML = '';
                        }
                    }
                }

                // Intercept clicks and Enter keys in capture phase before Angular router executes
                if (!gemsLink.dataset.agIntercepted) {
                    gemsLink.dataset.agIntercepted = 'true';
                    gemsLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        AG.toggleBookmarksOverlay();
                    }, true);

                    gemsLink.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            AG.toggleBookmarksOverlay();
                        }
                    }, true);
                }
            });

            return; // Never fall back to creating custom element when Gems entries are present
        }

        // 3. Fallback only if Gems entry does not exist at all in DOM: inject custom button into sidebar
        const sidebar = document.querySelector('bard-sidenav, mat-sidenav, .side-nav-container, nav[role="navigation"], div[class*="sidebar"]');
        if (!sidebar) return;

        const existingBtn = document.getElementById('ag-bookmarks-sidebar-btn');
        const anchor = findSidebarAnchor(sidebar);
        if (!anchor) {
            if (existingBtn) AG.updateSidebarBadge();
            return;
        }

        if (existingBtn && existingBtn.previousElementSibling === anchor) {
            AG.updateSidebarBadge();
            return;
        }

        if (existingBtn) existingBtn.remove();

        const navBtn = document.createElement('div');
        navBtn.id = 'ag-bookmarks-sidebar-btn';
        navBtn.className = 'ag-bookmarks-nav-item';
        navBtn.setAttribute('role', 'button');
        navBtn.setAttribute('tabindex', '0');
        navBtn.setAttribute('title', 'Bookmarks (Ctrl+Shift+B)');

        const count = AG.bookmarksList.length;
        const countHtml = count > 0 ? `<span class="ag-bookmarks-nav-badge">${count}</span>` : '';

        navBtn.innerHTML = `
            <span class="ag-bookmarks-nav-icon">
                ${MATERIAL_BOOKMARK_OUTLINE}
            </span>
            <span class="ag-bookmarks-nav-label">Bookmarks</span>
            ${countHtml}
        `;

        navBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            AG.toggleBookmarksOverlay();
        });

        navBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                AG.toggleBookmarksOverlay();
            }
        });

        anchor.insertAdjacentElement('afterend', navBtn);
    };

    AG.updateSidebarBadge = function () {
        const count = AG.bookmarksList.length;

        // Check if Gems was replaced
        const gemsLinks = document.querySelectorAll('a[data-ag-nav="bookmarks"]');
        if (gemsLinks.length > 0) {
            // Clean up any stray custom button if Gems is present
            document.querySelectorAll('#ag-bookmarks-sidebar-btn').forEach(el => el.remove());

            gemsLinks.forEach(gemsLink => {
                const trailingSlot = gemsLink.querySelector('.trailing-slot-content, [matlistitemmeta], .mat-mdc-list-item-meta');
                if (trailingSlot) {
                    if (count > 0) {
                        trailingSlot.className = 'trailing-slot-content ng-star-inserted';
                        trailingSlot.innerHTML = `<span class="ag-bookmarks-nav-badge">${count}</span>`;
                    } else {
                        trailingSlot.className = 'trailing-slot-content no-trailing-content ng-star-inserted';
                        trailingSlot.innerHTML = '';
                    }
                }
            });
            return;
        }

        const navBtn = document.getElementById('ag-bookmarks-sidebar-btn');
        if (navBtn) {
            let badge = navBtn.querySelector('.ag-bookmarks-nav-badge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'ag-bookmarks-nav-badge';
                    navBtn.appendChild(badge);
                }
                badge.textContent = count;
            } else if (badge) {
                badge.remove();
            }
        }
    };

    AG.restoreGemsLink = function () {
        document.querySelectorAll('a[data-ag-nav="bookmarks"]').forEach(gemsLink => {
            gemsLink.style.paddingLeft = '';
            gemsLink.style.paddingRight = '';
            gemsLink.style.paddingInlineStart = '';
            delete gemsLink.dataset.agNav;
            delete gemsLink.dataset.agIntercepted;
            gemsLink.setAttribute('aria-label', 'Gems');
            gemsLink.setAttribute('title', 'Gems');
            gemsLink.setAttribute('href', '/gems/view');
            const titleSpan = gemsLink.querySelector('.title-text, .label-and-badge span');
            if (titleSpan) titleSpan.textContent = 'Gems';
            const iconContainer = gemsLink.querySelector('[matlistitemicon], .leading-icon-container, gem-icon');
            if (iconContainer) {
                iconContainer.innerHTML = `
                    <mat-icon role="img" class="mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font mat-icon-no-color ng-star-inserted" aria-hidden="true" data-mat-icon-type="font" data-mat-icon-name="gems" data-mat-icon-namespace="lumi-symbols" fonticon="gems"></mat-icon>
                `;
            }
            const trailingSlot = gemsLink.querySelector('.trailing-slot-content');
            if (trailingSlot) {
                trailingSlot.className = 'trailing-slot-content no-trailing-content ng-star-inserted';
                trailingSlot.innerHTML = '';
            }
        });
    };

    // ─── Bookmarks Overlay Page ─────────────────────────────────────────────────
    AG.toggleBookmarksOverlay = function () {
        if (AG.isBookmarksOverlayOpen) {
            AG.closeBookmarksOverlay();
        } else {
            AG.openBookmarksOverlay();
        }
    };

    AG.openBookmarksOverlay = function () {
        if (AG.isBookmarksOverlayOpen) return;

        const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('icons/icon16.png')
            : '';

        // Locate Gemini's main content area
        const sidenavContent = document.querySelector('bard-sidenav-content') || document.querySelector('main') || document.body;
        const contentWrapper = sidenavContent.querySelector('.content-wrapper') || sidenavContent;
        const chatContainer = contentWrapper.querySelector('.content-container') || contentWrapper.querySelector('chat-window') || contentWrapper.children[0];

        // Hide chat container
        if (chatContainer && chatContainer !== contentWrapper) {
            chatContainer.dataset.agPrevDisplay = chatContainer.style.display || '';
            chatContainer.style.display = 'none';
        }

        const overlay = document.createElement('div');
        overlay.id = 'ag-bookmarks-overlay';
        overlay.className = 'ag-bookmarks-overlay';

        overlay.innerHTML = `
            <div id="ag-bookmarks-list-view" class="ag-bookmarks-view-panel">
                <div class="ag-bookmarks-header">
                    <div class="ag-bookmarks-header-left">
                        <button type="button" class="ag-native-icon-btn ag-bookmarks-back-btn" id="ag-bookmarks-back-btn" title="Back to chat (Esc)" aria-label="Back to chat">
                            <span class="google-symbols" style="font-size: 22px;" aria-hidden="true">arrow_back</span>
                        </button>
                        <div class="ag-bookmarks-header-title">
                            <h2 class="ag-headline-m">Bookmarks</h2>
                            <span class="ag-bookmarks-count-pill" id="ag-overlay-count-pill">0</span>
                            <div class="ag-bookmarks-brand-tag" title="Feature provided by Quote Reply for Gemini">
                                ${iconUrl ? `<img src="${iconUrl}" class="ag-brand-mini-logo" alt="" />` : ''}
                                <span>powered by Quote Reply for Gemini</span>
                            </div>
                        </div>
                    </div>

                    <div class="ag-bookmarks-header-right">
                        <div class="ag-bookmarks-search-box">
                            <span class="google-symbols ag-search-icon" style="font-size: 19px;" aria-hidden="true">search</span>
                            <input type="text" id="ag-bookmarks-search-input" placeholder="Search bookmarks..." autocomplete="off">
                            <button type="button" id="ag-bookmarks-search-clear" class="ag-search-clear-btn" title="Clear search" style="display: none;" aria-label="Clear search">
                                <span class="google-symbols" style="font-size: 16px;" aria-hidden="true">close</span>
                            </button>
                        </div>
                        <button type="button" class="ag-native-icon-btn" id="ag-bookmarks-export-btn" title="Export bookmarks (JSON)" aria-label="Export bookmarks">
                            <span class="google-symbols" style="font-size: 20px;" aria-hidden="true">download</span>
                        </button>
                        <button type="button" class="ag-native-icon-btn" id="ag-bookmarks-import-btn" title="Import bookmarks (JSON)" aria-label="Import bookmarks">
                            <span class="google-symbols" style="font-size: 20px;" aria-hidden="true">upload</span>
                        </button>
                        <input type="file" id="ag-bookmarks-file-input" accept=".json" style="display:none;">
                        <button type="button" class="ag-native-icon-btn ag-btn-danger" id="ag-bookmarks-clear-btn" title="Clear all bookmarks" aria-label="Clear all bookmarks">
                            <span class="google-symbols" style="font-size: 20px;" aria-hidden="true">delete</span>
                        </button>
                    </div>
                </div>

                <div class="ag-bookmarks-scroll-container" id="ag-bookmarks-list-scroll">
                    <div class="ag-bookmarks-main">
                        <div class="ag-bookmarks-section-header">
                            <span class="ag-section-title">Saved responses</span>
                            <span class="ag-bookmarks-section-badge">Quote Reply feature</span>
                        </div>
                        <div id="ag-bookmarks-list" class="ag-bookmarks-list"></div>
                        <div class="ag-bookmarks-footer-branding">
                            ${iconUrl ? `<img src="${iconUrl}" class="ag-footer-brand-logo" alt="" />` : ''}
                            <span>Bookmarks provided by <strong>Quote Reply for Gemini</strong></span>
                        </div>
                    </div>
                </div>
            </div>

            <div id="ag-bookmarks-reader-view" class="ag-bookmarks-view-panel" style="display: none;">
                <div class="ag-bookmarks-header ag-bookmarks-reader-header">
                    <div class="ag-bookmarks-header-left ag-reader-header-left">
                        <button type="button" class="ag-native-icon-btn ag-bookmarks-reader-back-btn" id="ag-reader-back-btn" title="Back to bookmarks (Esc)" aria-label="Back to bookmarks">
                            <span class="google-symbols" style="font-size: 22px;" aria-hidden="true">arrow_back</span>
                        </button>
                        <div class="ag-reader-header-titles">
                            <div class="ag-reader-prompt-line">
                                <span class="google-symbols ag-reader-header-icon" style="font-size: 18px; color: #a8c7fa;" aria-hidden="true">bookmark</span>
                                <h2 id="ag-reader-title" class="ag-reader-title-text" title="">Quick View</h2>
                                <div class="ag-bookmarks-brand-tag" title="Feature provided by Quote Reply for Gemini">
                                    ${iconUrl ? `<img src="${iconUrl}" class="ag-brand-mini-logo" alt="" />` : ''}
                                    <span>powered by Quote Reply for Gemini</span>
                                </div>
                            </div>
                            <div id="ag-reader-meta" class="ag-reader-header-meta"></div>
                        </div>
                    </div>

                    <div class="ag-bookmarks-header-right">
                        <button type="button" class="ag-modal-btn ag-modal-copy-btn" id="ag-reader-copy-btn" title="Copy full response text">
                            <span class="google-symbols" style="font-size: 16px;" aria-hidden="true">content_copy</span>
                            <span>Copy response</span>
                        </button>
                        <button type="button" class="ag-modal-btn ag-modal-jump-btn" id="ag-reader-jump-btn" title="Open this conversation in Gemini">
                            <span class="google-symbols" style="font-size: 16px;" aria-hidden="true">open_in_new</span>
                            <span>Jump to chat</span>
                        </button>
                        <button type="button" class="ag-native-icon-btn ag-btn-danger" id="ag-reader-delete-btn" title="Delete bookmark" aria-label="Delete bookmark">
                            <span class="google-symbols" style="font-size: 20px;" aria-hidden="true">delete</span>
                        </button>
                    </div>
                </div>

                <div class="ag-bookmarks-reader-scroll" id="ag-reader-scroll-container">
                    <div class="ag-bookmarks-reader-main">
                        <div class="ag-reader-prompt-card" id="ag-reader-prompt-card">
                            <div class="ag-reader-prompt-topline">
                                <span class="ag-reader-prompt-label">Prompt</span>
                                <span class="ag-reader-prompt-meta" id="ag-reader-card-meta"></span>
                            </div>
                            <div class="ag-reader-prompt-text" id="ag-reader-prompt-body"></div>
                        </div>

                        <div class="ag-bookmarks-reader-content ag-bookmark-modal-content" id="ag-reader-body"></div>

                        <div class="ag-bookmarks-footer-branding ag-reader-footer-branding">
                            ${iconUrl ? `<img src="${iconUrl}" class="ag-footer-brand-logo" alt="" />` : ''}
                            <span>Saved Gemini response &bull; Quote Reply for Gemini</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        contentWrapper.appendChild(overlay);
        AG.isBookmarksOverlayOpen = true;
        AG.isBookmarkReaderOpen = false;
        AG.activeReaderBookmark = null;

        // Wire up overlay header events
        document.getElementById('ag-bookmarks-back-btn').addEventListener('click', () => {
            AG.closeBookmarksOverlay();
        });

        document.getElementById('ag-bookmarks-export-btn').addEventListener('click', () => {
            AG.BookmarkManager.exportBookmarks();
        });

        const fileInput = document.getElementById('ag-bookmarks-file-input');
        document.getElementById('ag-bookmarks-import-btn').addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                AG.BookmarkManager.importBookmarks(e.target.files[0]);
                e.target.value = '';
            }
        });

        document.getElementById('ag-bookmarks-clear-btn').addEventListener('click', () => {
            AG.BookmarkManager.clearAll();
        });

        const searchInput = document.getElementById('ag-bookmarks-search-input');
        const searchClear = document.getElementById('ag-bookmarks-search-clear');
        searchInput.addEventListener('input', () => {
            const val = searchInput.value;
            if (searchClear) searchClear.style.display = val ? 'flex' : 'none';
            AG.renderBookmarksList(val.trim());
        });
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                searchInput.focus();
                AG.renderBookmarksList('');
            });
        }

        AG.renderBookmarksList();

        // Track page open
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                name: 'bookmarks_page_opened',
                params: { bookmark_count: AG.bookmarksList.length }
            });
        }
    };

    AG.closeBookmarkReader = function () {
        const listView = document.getElementById('ag-bookmarks-list-view');
        const readerView = document.getElementById('ag-bookmarks-reader-view');
        if (readerView) readerView.style.display = 'none';
        if (listView) listView.style.display = 'flex';
        AG.isBookmarkReaderOpen = false;
        AG.activeReaderBookmark = null;

        // Re-render list to ensure fresh state/counts
        const searchInput = document.getElementById('ag-bookmarks-search-input');
        AG.renderBookmarksList(searchInput ? searchInput.value.trim() : '');
    };

    AG.closeBookmarksOverlay = function () {
        const overlay = document.getElementById('ag-bookmarks-overlay');
        if (overlay) {
            overlay.classList.add('ag-overlay-out');
            setTimeout(() => {
                overlay.remove();
            }, 200);
        }

        // Restore chat container
        const sidenavContent = document.querySelector('bard-sidenav-content') || document.querySelector('main') || document.body;
        const contentWrapper = sidenavContent.querySelector('.content-wrapper') || sidenavContent;
        const chatContainer = contentWrapper.querySelector('.content-container') || contentWrapper.querySelector('chat-window') || contentWrapper.children[0];
        if (chatContainer && chatContainer.dataset.agPrevDisplay !== undefined) {
            chatContainer.style.display = chatContainer.dataset.agPrevDisplay;
            delete chatContainer.dataset.agPrevDisplay;
        }

        AG.isBookmarksOverlayOpen = false;
        AG.isBookmarkReaderOpen = false;
        AG.activeReaderBookmark = null;
    };

    // ─── HTML Sanitizer & Markdown Formatter ──────────────────────────────────
    function isOldFlatHtml(html) {
        // Old bookmarks stored everything in 1–2 <p> tags with all content flattened.
        // Detect: HTML has very few block elements, all text is in <p> tags, no code wrappers.
        if (!html) return false;
        const hasCodeWrapper = html.includes('ag-modal-code-wrapper') || html.includes('ag-modal-pre');
        const hasStructure = html.includes('<ul') || html.includes('<ol') || html.includes('<h2') || html.includes('<h3');
        if (hasCodeWrapper || hasStructure) return false;
        // Count block tags — old format has very few
        const blockCount = (html.match(/<\/?(p|div|li|h[1-6])\b/g) || []).length;
        const textLen = html.replace(/<[^>]+>/g, '').length;
        // If there's a lot of text compressed into very few blocks — it's old format
        return blockCount < 6 && textLen > 200;
    }

    function sanitizeResponseHtml(rawHtml) {
        if (!rawHtml || typeof rawHtml !== 'string') return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, 'text/html');

            // Remove unsafe tags
            doc.querySelectorAll('script, iframe, object, embed, applet, style, link, form, input, button, select, textarea').forEach(el => el.remove());

            // Remove inline event handlers and unsafe links
            doc.querySelectorAll('*').forEach(el => {
                for (let i = el.attributes.length - 1; i >= 0; i--) {
                    const attr = el.attributes[i];
                    const name = attr.name.toLowerCase();
                    const val = attr.value.toLowerCase();
                    if (name.startsWith('on') || val.includes('javascript:') || val.includes('data:text/html')) {
                        el.removeAttribute(attr.name);
                    }
                }
                if (el.tagName === 'A') {
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            });

            return doc.body.innerHTML;
        } catch (_) {
            return escapeHtml(rawHtml);
        }
    }

    function formatFullResponseMarkdown(text) {
        if (!text) return '';

        // 1. Extract and protect code blocks
        const codeBlocks = [];
        let processed = text.replace(/```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
            const placeholder = `__AG_CODE_BLOCK_${codeBlocks.length}__`;
            codeBlocks.push({
                lang: lang ? lang.trim() : '',
                code: code.trimEnd()
            });
            return placeholder;
        });

        // 2. Headings
        processed = processed.replace(/^####\s+(.+)$/gm, '<h4 class="ag-modal-h4">$1</h4>');
        processed = processed.replace(/^###\s+(.+)$/gm, '<h4 class="ag-modal-h4">$1</h4>');
        processed = processed.replace(/^##\s+(.+)$/gm, '<h3 class="ag-modal-h3">$1</h3>');
        processed = processed.replace(/^#\s+(.+)$/gm, '<h2 class="ag-modal-h2">$1</h2>');

        // 3. Blockquotes
        processed = processed.replace(/^>\s+(.+)$/gm, '<blockquote class="ag-modal-quote">$1</blockquote>');

        // 4. Bullet lists
        processed = processed.replace(/^[\*•-]\s+(.+)$/gm, '<li class="ag-modal-li">$1</li>');
        processed = processed.replace(/((?:<li class="ag-modal-li">.*?<\/li>\s*)+)/gs, '<ul class="ag-modal-ul">$1</ul>');

        // 5. Numbered lists
        processed = processed.replace(/^\d+\.\s+(.+)$/gm, '<li class="ag-modal-oli">$1</li>');
        processed = processed.replace(/((?:<li class="ag-modal-oli">.*?<\/li>\s*)+)/gs, '<ol class="ag-modal-ol">$1</ol>');

        // 6. Bold & Italic
        processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 7. Inline code
        processed = processed.replace(/`([^`\n]+)`/g, '<code class="ag-inline-code">$1</code>');

        // 8. Paragraphs — split on double newlines
        const parts = processed.split(/\n\n+/).map(block => {
            block = block.trim();
            if (!block) return '';
            if (
                block.startsWith('__AG_CODE_BLOCK_') ||
                block.startsWith('<h') ||
                block.startsWith('<ul') ||
                block.startsWith('<ol') ||
                block.startsWith('<blockquote')
            ) {
                return block;
            }
            return `<p class="ag-modal-p">${block.replace(/\n/g, '<br>')}</p>`;
        }).filter(Boolean);

        let result = parts.join('');

        // 9. Restore code blocks with native-styled wrappers
        result = result.replace(/__AG_CODE_BLOCK_(\d+)__/g, (match, idx) => {
            const item = codeBlocks[parseInt(idx, 10)];
            if (!item) return '';
            const header = item.lang
                ? `<div class="ag-modal-code-header"><span>${escapeHtml(item.lang)}</span></div>`
                : '';
            return `<div class="ag-modal-code-wrapper">${header}<pre class="ag-modal-pre"><code>${escapeHtml(item.code)}</code></pre></div>`;
        });

        return result;
    }

    // ── Smart parser for old flat-format bookmarks ─────────────────────────────
    // Old bookmarks stored everything in a single <p> with <br> for newlines.
    // Language labels (Bash, YAML, etc.) were concatenated directly before their code.
    // This parser reconstructs code blocks and step headings from that raw HTML.

    function parseOldFlatHtml(rawHtml) {
        if (!rawHtml) return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, 'text/html');
            // Turn <br> into real newlines
            doc.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode('\n')));
            const text = (doc.body.textContent || '').trim();
            return text ? smartFormatOldText(text) : '';
        } catch (e) {
            return '';
        }
    }

    function smartFormatOldText(text) {
        if (!text) return '';

        // Known Gemini code-block language labels that appear concatenated before code in old flat format
        const LANGS = [
            'Bash', 'Shell', 'Python', 'JavaScript', 'TypeScript', 'JSON', 'YAML',
            'SQL', 'CSS', 'HTML', 'Java', 'Kotlin', 'Swift', 'Rust', 'Go', 'Ruby',
            'PHP', 'Dockerfile', 'PowerShell', 'Plaintext', 'Text', 'Markdown',
            'XML', 'TOML', 'GraphQL', 'Terraform', 'Scala', 'Dart', 'Elixir',
            'Haskell', 'R', 'Lua', 'Perl'
        ];
        const langAlts = LANGS.join('|');

        // Insert double newlines before "Step N:" that was concatenated to previous prose
        // e.g., "...DockerStep 1: Title" → "...Docker\n\nStep 1: Title"
        text = text.replace(/([\w),!?.])(Step\s+\d+:)/g, '$1\n\n$2');

        // Split text into prose and code blocks using ":LANG" markers as delimiters
        const blocks = [];
        const splitRe = new RegExp(`:(?:${langAlts})`, 'g');

        let pos = 0;
        let m;
        splitRe.lastIndex = 0;

        while ((m = splitRe.exec(text)) !== null) {
            // Everything before the ":LANG" marker is prose
            const before = text.slice(pos, m.index);
            if (before.trim()) blocks.push({ type: 'prose', content: before });

            const lang = m[0].slice(1); // remove ':'
            const codeStart = m.index + m[0].length;

            // Find code end: next ":LANG" marker OR next "Step N:" (on its own line) OR end
            const endRe = new RegExp(`(:(?:${langAlts}))|(\\n\\s*Step\\s+\\d+:)`, 'g');
            endRe.lastIndex = codeStart;
            const endM = endRe.exec(text);

            let codeEnd;
            if (endM) {
                codeEnd = endM.index;
                pos = codeEnd;
                splitRe.lastIndex = codeEnd; // restart from delimiter
            } else {
                codeEnd = text.length;
                pos = text.length;
            }

            const codeContent = text.slice(codeStart, codeEnd).trim();
            if (codeContent) blocks.push({ type: 'code', lang, content: codeContent });
        }

        // Remaining prose after the last code block
        if (pos < text.length) {
            const remaining = text.slice(pos).trim();
            if (remaining) blocks.push({ type: 'prose', content: remaining });
        }

        // Render blocks to structured HTML
        let html = '';
        for (const block of blocks) {
            if (block.type === 'code') {
                const hdr = block.lang
                    ? `<div class="ag-modal-code-header"><span>${escapeHtml(block.lang)}</span></div>`
                    : '';
                html += `<div class="ag-modal-code-wrapper">${hdr}<pre class="ag-modal-pre"><code>${escapeHtml(block.content)}</code></pre></div>`;
            } else {
                html += renderOldProse(block.content);
            }
        }

        return html || '';
    }

    function renderOldProse(text) {
        if (!text.trim()) return '';
        let html = '';

        // Split into paragraphs on double-newlines
        const paras = text.split(/\n\n+/);
        for (const para of paras) {
            const t = para.trim();
            if (!t) continue;

            // Check if paragraph starts with "Step N:"
            const stepM = t.match(/^(Step\s+\d+:)\s?([\s\S]*)/);
            if (stepM) {
                const stepLabel = stepM[1];        // "Step 1:"
                const rest = stepM[2] || '';

                // Heuristic: in old flat format, the step title and body are concatenated
                // without separator. Detect the junction by finding a lowercase→uppercase
                // transition within the first 60 chars: "RunningMake" → split at 'g'/'M'.
                const junctionIdx = rest.search(/[a-z][A-Z]/);
                let stepTitle, stepBody;
                if (junctionIdx >= 0 && junctionIdx < 60) {
                    stepTitle = rest.slice(0, junctionIdx + 1); // includes the lowercase char
                    stepBody = rest.slice(junctionIdx + 1).trim();
                } else {
                    stepTitle = '';
                    stepBody = rest;
                }

                const fullTitle = stepTitle
                    ? `${stepLabel} ${stepTitle.trim()}`
                    : stepLabel;
                html += `<h4 class="ag-modal-h4">${escapeHtml(fullTitle.trim())}</h4>`;
                if (stepBody.trim()) {
                    html += `<p class="ag-modal-p">${escapeHtml(stepBody.trim()).replace(/\n/g, '<br>')}</p>`;
                }
            } else {
                html += `<p class="ag-modal-p">${escapeHtml(t).replace(/\n/g, '<br>')}</p>`;
            }
        }

        return html;
    }

    function renderFullBookmarkContent(bm) {
        if (!bm) return '<p class="ag-modal-p" style="color: #8e918f; font-style: italic;">No text saved for this bookmark.</p>';

        if (bm.responseHtml && bm.responseHtml.trim()) {
            if (!isOldFlatHtml(bm.responseHtml)) {
                // New rich-HTML format from the updated extraction pipeline
                return sanitizeResponseHtml(bm.responseHtml);
            }
            // Old flat-format bookmark — parse it intelligently
            const parsed = parseOldFlatHtml(bm.responseHtml);
            if (parsed && parsed.trim()) return parsed;
        }

        // Fallback: render responseText as markdown
        if (bm.responseText && bm.responseText.trim()) {
            return formatFullResponseMarkdown(bm.responseText);
        }

        return '<p class="ag-modal-p" style="color: #8e918f; font-style: italic;">No content saved for this bookmark.</p>';
    }

    function formatCardPreviewHtml(bm) {
        if (!bm) return '';

        // 1. If we have saved rich HTML, extract inline formatted preview snippet
        if (bm.responseHtml && bm.responseHtml.trim()) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(bm.responseHtml, 'text/html');

                // Convert code blocks to clean preview pills
                doc.querySelectorAll('.ag-modal-code-wrapper, pre').forEach(pre => {
                    if (pre.tagName.toLowerCase() === 'pre' && pre.closest('.ag-modal-code-wrapper')) {
                        return; // already handled by outer wrapper
                    }
                    const code = pre.querySelector('code') || pre;
                    const lang = pre.querySelector('.ag-modal-code-header span')?.textContent?.trim() || '';
                    const codeSnippet = (code.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 85);
                    const replacement = document.createElement('span');
                    replacement.className = 'ag-preview-code-pill';
                    replacement.innerHTML = `${lang ? `<span class="ag-preview-code-tag">${escapeHtml(lang)}</span>` : '<span class="ag-preview-code-tag">Code</span>'}<code class="ag-preview-code">${escapeHtml(codeSnippet)}</code>`;
                    pre.replaceWith(replacement);
                });

                // Convert li to inline bullets
                doc.querySelectorAll('li').forEach(li => {
                    const span = document.createElement('span');
                    span.className = 'ag-preview-li';
                    span.innerHTML = `<span class="ag-preview-bullet">•</span> ${li.innerHTML} `;
                    li.replaceWith(span);
                });

                // Strip outer block containers while keeping inline tags (strong, em, code, span)
                let html = doc.body.innerHTML;
                html = html.replace(/<\/(p|div|h[1-6]|blockquote)>/gi, ' ');
                html = html.replace(/<(p|div|h[1-6]|blockquote)[^>]*>/gi, '');
                html = html.replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
                html = html.replace(/^Gemini\s+said:?\s*/i, '');

                if (html.length > 340) {
                    const temp = document.createElement('div');
                    temp.innerHTML = html.slice(0, 340);
                    // Automatic tag closure by browser DOM
                    return temp.innerHTML + '...';
                }
                return html;
            } catch (_) {}
        }

        // 2. Fallback: parse markdown from responseText
        let text = cleanResponsePreview(bm.responseText || '');
        if (!text) return '';

        // Extract code blocks first to protect them from HTML escaping
        const codeBlockPills = [];
        text = text.replace(/```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
            const snippet = code.trim().replace(/\s+/g, ' ').slice(0, 80);
            const idx = codeBlockPills.length;
            codeBlockPills.push(`<span class="ag-preview-code-pill"><span class="ag-preview-code-tag">${escapeHtml(lang || 'Code')}</span><code class="ag-preview-code">${escapeHtml(snippet)}</code></span>`);
            return ` __AG_PREVIEW_CODE_${idx}__ `;
        });

        // Extract inline code
        const inlineCodePills = [];
        text = text.replace(/`([^`\n]+)`/g, (match, code) => {
            const idx = inlineCodePills.length;
            inlineCodePills.push(`<code class="ag-preview-code">${escapeHtml(code)}</code>`);
            return ` __AG_PREVIEW_INLINE_${idx}__ `;
        });

        // Safe HTML escape for remainder of text
        text = escapeHtml(text);

        // Convert bold
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Convert bullet lists
        text = text.replace(/^[•*-]\s+(.+)$/gm, '<span class="ag-preview-bullet">•</span> $1');

        // Newlines to spaces
        text = text.replace(/\n+/g, ' ');

        // Restore code pills
        text = text.replace(/__AG_PREVIEW_CODE_(\d+)__/g, (m, i) => codeBlockPills[parseInt(i, 10)] || '');
        text = text.replace(/__AG_PREVIEW_INLINE_(\d+)__/g, (m, i) => inlineCodePills[parseInt(i, 10)] || '');

        if (text.length > 340) {
            const temp = document.createElement('div');
            temp.innerHTML = text.slice(0, 340);
            return temp.innerHTML + '...';
        }

        return text;
    }

    // ─── Quick View Full-Page Reader ────────────────────────────────────────────
    AG.openBookmarkQuickView = function (bm) {
        if (!bm) return;

        // Clean up any old popup modal if it somehow exists
        const oldModal = document.getElementById('ag-bookmark-modal-overlay');
        if (oldModal) oldModal.remove();

        const wasOverlayAlreadyOpen = AG.isBookmarksOverlayOpen && document.getElementById('ag-bookmarks-overlay');
        if (!wasOverlayAlreadyOpen) {
            AG.openBookmarksOverlay();
            AG.readerOpenedFromList = false;
        } else {
            AG.readerOpenedFromList = true;
        }

        const listView = document.getElementById('ag-bookmarks-list-view');
        const readerView = document.getElementById('ag-bookmarks-reader-view');
        if (!readerView) return;

        if (listView) listView.style.display = 'none';
        readerView.style.display = 'flex';
        AG.isBookmarkReaderOpen = true;
        AG.activeReaderBookmark = bm;

        const cleanPrompt = cleanPromptText(bm.promptText || 'Saved Gemini response');
        const rawResponse = bm.responseText || '';
        const charCount = rawResponse.length.toLocaleString();
        const timeStr = formatRelativeTime(bm.createdAt);
        const formattedHtml = renderFullBookmarkContent(bm);
        const modelBadge = bm.modelName ? `<span class="ag-bookmark-model-tag">${escapeHtml(bm.modelName)}</span>` : '';

        // Update Header
        const titleEl = document.getElementById('ag-reader-title');
        if (titleEl) {
            titleEl.textContent = cleanPrompt;
            titleEl.setAttribute('title', cleanPrompt);
        }

        const metaEl = document.getElementById('ag-reader-meta');
        if (metaEl) {
            metaEl.innerHTML = `
                ${modelBadge}
                <span class="ag-modal-time">${escapeHtml(timeStr)}</span>
                <span class="ag-modal-char-count">${charCount} characters</span>
            `;
        }

        // Update Prompt Card
        const promptCardMeta = document.getElementById('ag-reader-card-meta');
        if (promptCardMeta) promptCardMeta.textContent = timeStr;
        const promptBody = document.getElementById('ag-reader-prompt-body');
        if (promptBody) promptBody.textContent = cleanPrompt;

        // Update Response Body
        const readerBody = document.getElementById('ag-reader-body');
        if (readerBody) {
            readerBody.innerHTML = formattedHtml || '<p class="ag-modal-p" style="color: #8e918f; font-style: italic;">No text saved for this bookmark.</p>';
        }

        // Scroll reader to top
        const scrollContainer = document.getElementById('ag-reader-scroll-container');
        if (scrollContainer) scrollContainer.scrollTop = 0;

        // Back button navigation
        const backBtn = document.getElementById('ag-reader-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                if (AG.readerOpenedFromList) {
                    AG.closeBookmarkReader();
                } else {
                    AG.closeBookmarksOverlay();
                }
            };
            backBtn.setAttribute('title', AG.readerOpenedFromList ? 'Back to bookmarks (Esc)' : 'Back to chat (Esc)');
            backBtn.setAttribute('aria-label', AG.readerOpenedFromList ? 'Back to bookmarks' : 'Back to chat');
        }

        // Copy button
        const copyBtn = document.getElementById('ag-reader-copy-btn');
        if (copyBtn) {
            const originalCopyHtml = `
                <span class="google-symbols" style="font-size: 16px;" aria-hidden="true">content_copy</span>
                <span>Copy response</span>
            `;
            copyBtn.innerHTML = originalCopyHtml;
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(rawResponse);
                    copyBtn.innerHTML = `
                        <span class="google-symbols" style="font-size: 16px; color: #81c995;" aria-hidden="true">check</span>
                        <span>Copied!</span>
                    `;
                    setTimeout(() => { if (copyBtn) copyBtn.innerHTML = originalCopyHtml; }, 2000);
                } catch (err) {
                    console.error('Ask Gemini: Failed to copy response', err);
                }
            };
        }

        // Jump to chat button
        const jumpBtn = document.getElementById('ag-reader-jump-btn');
        if (jumpBtn) {
            jumpBtn.onclick = () => {
                jumpToBookmark(bm);
            };
        }

        // Delete bookmark button
        const deleteBtn = document.getElementById('ag-reader-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                AG.BookmarkManager.removeBookmark(bm.id);
                if (AG.readerOpenedFromList) {
                    AG.closeBookmarkReader();
                } else {
                    AG.closeBookmarksOverlay();
                }
            };
        }

        // Track Quick View open
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                name: 'bookmark_quick_view_opened',
                params: { bookmark_id: bm.id }
            });
        }
    };

    function jumpToBookmark(bm) {
        const currentConvId = extractConversationId(window.location.href);
        const isSameConv = currentConvId === bm.conversationId || window.location.href === bm.conversationUrl;

        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                name: 'bookmark_navigated',
                params: {
                    bookmark_id: bm.id,
                    same_conversation: isSameConv
                }
            });
        }

        if (isSameConv) {
            AG.closeBookmarksOverlay();
            // Try scrolling to matching prompt or response
            setTimeout(() => {
                const snippet = cleanResponsePreview(bm.responseText || '').slice(0, 80);
                const cleanPrompt = cleanPromptText(bm.promptText || '');
                const prompts = Array.from(document.querySelectorAll('user-query'));
                let target = null;

                for (const p of prompts) {
                    const clean = cleanPromptText(p.innerText || '');
                    if (clean && clean.includes(cleanPrompt.slice(0, 35))) {
                        target = p;
                        break;
                    }
                }

                if (!target && snippet) {
                    const responses = Array.from(document.querySelectorAll('.model-response, model-response, .markdown-main-panel'));
                    for (const r of responses) {
                        const cleanResp = cleanResponsePreview(r.innerText || r.textContent || '');
                        if (cleanResp.includes(snippet)) {
                            target = r;
                            break;
                        }
                    }
                }

                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('ag-text-highlight-blink');
                    setTimeout(() => target.classList.remove('ag-text-highlight-blink'), 2200);
                } else {
                    // Turn is not rendered in current DOM (lazy loaded / scrolled off)
                    AG.showBookmarkToast(
                        'Earlier in chat (not loaded yet)',
                        'Read Full Saved Text',
                        () => AG.openBookmarkQuickView(bm)
                    );
                }
            }, 250);
        } else {
            // Navigate to conversation URL
            window.location.href = bm.conversationUrl;
        }
    }

    AG.renderBookmarksList = function (filterQuery = '') {
        const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('icons/icon16.png')
            : '';

        const listEl = document.getElementById('ag-bookmarks-list');
        const countPill = document.getElementById('ag-overlay-count-pill');
        if (!listEl) return;

        const totalCount = AG.bookmarksList.length;
        if (countPill) countPill.textContent = totalCount;

        // Clear all button visibility
        const clearBtn = document.getElementById('ag-bookmarks-clear-btn');
        if (clearBtn) clearBtn.style.display = totalCount > 0 ? 'inline-flex' : 'none';

        if (totalCount === 0) {
            listEl.innerHTML = `
                <div class="ag-bookmarks-empty">
                    <div class="ag-bookmarks-empty-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                            <path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2zm0 13.97-4.46-2.75c-.33-.2-.75-.2-1.08 0L7 16.97V5h10v11.97z"/>
                        </svg>
                    </div>
                    <h3>No bookmarks yet</h3>
                    <p>Click the bookmark icon under any Gemini response to save it here for quick access.</p>
                    <div class="ag-empty-brand-note">
                        ${iconUrl ? `<img src="${iconUrl}" class="ag-empty-brand-logo" alt="" />` : ''}
                        <span>Quote Reply for Gemini</span>
                    </div>
                </div>
            `;
            return;
        }

        let filtered = AG.bookmarksList;
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            filtered = AG.bookmarksList.filter(b => {
                const prompt = cleanPromptText(b.promptText || '').toLowerCase();
                const response = cleanResponsePreview(b.responseText || '').toLowerCase();
                const model = (b.modelName || '').toLowerCase();
                return prompt.includes(q) || response.includes(q) || model.includes(q);
            });
        }

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div class="ag-bookmarks-empty">
                    <p>No bookmarks match "<strong>${escapeHtml(filterQuery)}</strong>"</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = '';
        filtered.forEach((bm) => {
            const card = document.createElement('div');
            card.className = 'ag-bookmark-card';
            card.dataset.id = bm.id;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            const timeStr = formatRelativeTime(bm.createdAt);
            const modelBadge = bm.modelName ? `<span class="ag-bookmark-model-tag">${escapeHtml(bm.modelName)}</span>` : '';
            const cleanPrompt = cleanPromptText(bm.promptText || 'Saved response');

            card.setAttribute('aria-label', `Quick View bookmark: ${cleanPrompt}`);

            const previewHtml = formatCardPreviewHtml(bm);

            card.innerHTML = `
                <div class="ag-bookmark-icon-container">
                    <span class="google-symbols" style="font-size: 22px;" aria-hidden="true">bookmark</span>
                </div>

                <div class="ag-bookmark-content">
                    <div class="ag-bookmark-topline">
                        <h4 class="ag-bookmark-prompt" title="${escapeHtml(cleanPrompt)}">${escapeHtml(cleanPrompt)}</h4>
                        <div class="ag-bookmark-meta">
                            ${modelBadge}
                            <span class="ag-bookmark-time">${escapeHtml(timeStr)}</span>
                        </div>
                    </div>
                    <div class="ag-bookmark-preview">${previewHtml}</div>
                    <div class="ag-bookmark-card-links">
                        <span class="ag-card-read-more-link">Quick View &rarr;</span>
                    </div>
                </div>

                <div class="ag-bookmark-actions">
                    <button type="button" class="ag-native-icon-btn ag-card-view-btn" title="Quick View" aria-label="Quick View">
                        <span class="google-symbols" style="font-size: 19px;" aria-hidden="true">chrome_reader_mode</span>
                    </button>
                    <button type="button" class="ag-native-icon-btn ag-card-jump-btn" title="Open in chat" aria-label="Open in chat">
                        <span class="google-symbols" style="font-size: 19px;" aria-hidden="true">open_in_new</span>
                    </button>
                    <button type="button" class="ag-native-icon-btn ag-card-copy-btn" title="Copy response" aria-label="Copy response">
                        <span class="google-symbols" style="font-size: 19px;" aria-hidden="true">content_copy</span>
                    </button>
                    <button type="button" class="ag-native-icon-btn ag-card-delete-btn" title="Remove bookmark" aria-label="Remove bookmark">
                        <span class="google-symbols" style="font-size: 19px;" aria-hidden="true">delete</span>
                    </button>
                </div>
            `;

            // Card click opens Quick View (NOT chat/full response)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.ag-native-icon-btn')) return;
                AG.openBookmarkQuickView(bm);
            });

            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.closest('.ag-native-icon-btn')) return;
                    e.preventDefault();
                    AG.openBookmarkQuickView(bm);
                }
            });

            // Action: Quick View (Modal reader)
            const viewBtn = card.querySelector('.ag-card-view-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    AG.openBookmarkQuickView(bm);
                });
            }

            const readMoreLink = card.querySelector('.ag-card-read-more-link');
            if (readMoreLink) {
                readMoreLink.addEventListener('click', (e) => {
                    e.stopPropagation();
                    AG.openBookmarkQuickView(bm);
                });
            }

            // Action: Jump to chat
            const jumpBtn = card.querySelector('.ag-card-jump-btn');
            jumpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                jumpToBookmark(bm);
            });

            // Action: Copy response text
            const copyBtn = card.querySelector('.ag-card-copy-btn');
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(bm.responseText || '');
                    copyBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="color: #81c995;">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                    `;
                    copyBtn.setAttribute('title', 'Copied!');
                    setTimeout(() => {
                        copyBtn.innerHTML = `
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                        `;
                        copyBtn.setAttribute('title', 'Copy response');
                    }, 1800);
                } catch (err) {
                    console.error('Ask Gemini: Failed to copy text', err);
                }
            });

            // Action: Delete bookmark
            const deleteBtn = card.querySelector('.ag-card-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                card.style.opacity = '0';
                card.style.transform = 'scale(0.97)';
                setTimeout(() => {
                    AG.BookmarkManager.removeBookmark(bm.id);
                }, 180);
            });

            listEl.appendChild(card);
        });
    };
})();
