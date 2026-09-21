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

    // ─── DOM Data Extraction ────────────────────────────────────────────────────
    function findPrecedingUserPrompt(responseEl) {
        if (!responseEl) return '';
        // 1. Traverse preceding sibling containers
        let current = responseEl.closest('.conversation-turn, .chat-turn, message-turn, .message-content') || responseEl;
        let prev = current.previousElementSibling;
        while (prev) {
            const uq = prev.matches?.('user-query') ? prev : prev.querySelector?.('user-query');
            if (uq) {
                return AG.extractCleanPromptText ? AG.extractCleanPromptText(uq) : (uq.innerText || uq.textContent || '').trim();
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
                return AG.extractCleanPromptText ? AG.extractCleanPromptText(chosen) : (chosen.innerText || chosen.textContent || '').trim();
            }
        }

        return '';
    }

    function extractResponseText(responseEl) {
        if (!responseEl) return '';
        // Look for markdown or text container
        const textContainer = responseEl.querySelector(
            '.markdown-main-panel, .model-response-text, .response-container, [data-test-id="model-response"], .message-content, message-content'
        ) || responseEl;

        const clone = textContainer.cloneNode(true);
        // Strip out actions, buttons, tooltips, and badges
        const toRemove = clone.querySelectorAll(
            '.buttons-container-v2, .message-actions, button, mat-icon, svg, .mat-mdc-tooltip-trigger, .ag-bookmark-btn'
        );
        toRemove.forEach(n => n.remove());

        let text = (clone.innerText || clone.textContent || '').trim();
        return text.replace(/\n{3,}/g, '\n\n');
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
                    AG.closeBookmarksOverlay();
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
            const fullResponse = extractResponseText(responseEl);
            const responseText = fullResponse.slice(0, 2500);
            const currentUrl = window.location.href;
            const conversationId = extractConversationId(currentUrl);
            const modelName = extractModelName();

            // Create new bookmark object
            const bookmark = {
                id: generateId(),
                promptText: promptText,
                responseText: responseText,
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
            btn.setAttribute('aria-label', existingBm ? 'Remove bookmark' : 'Bookmark response');
            btn.setAttribute('title', existingBm ? 'Remove bookmark' : 'Bookmark response');
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
                gemsLink.setAttribute('aria-label', 'Bookmarks');
                gemsLink.setAttribute('title', 'Bookmarks (Ctrl+Shift+B)');
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
            <div class="ag-bookmarks-header">
                <div class="ag-bookmarks-header-left">
                    <button type="button" class="ag-bookmarks-back-btn" id="ag-bookmarks-back-btn" title="Back to chat (Esc)">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>Back</span>
                    </button>
                    <div class="ag-bookmarks-header-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="color: #fbbc04;">
                            <path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2z"/>
                        </svg>
                        <h2>Bookmarks</h2>
                        <span class="ag-bookmarks-count-pill" id="ag-overlay-count-pill">0</span>
                    </div>
                </div>

                <div class="ag-bookmarks-header-right">
                    <div class="ag-bookmarks-search-box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" id="ag-bookmarks-search-input" placeholder="Search saved responses..." autocomplete="off">
                    </div>
                    <button type="button" class="ag-bookmarks-header-action" id="ag-bookmarks-export-btn" title="Export bookmarks as JSON file">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Export</span>
                    </button>
                    <button type="button" class="ag-bookmarks-header-action" id="ag-bookmarks-import-btn" title="Import bookmarks from JSON file">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <span>Import</span>
                    </button>
                    <input type="file" id="ag-bookmarks-file-input" accept=".json" style="display:none;">
                    <button type="button" class="ag-bookmarks-header-action ag-btn-danger" id="ag-bookmarks-clear-btn" title="Clear all bookmarks">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Clear All</span>
                    </button>
                </div>
            </div>

            <div class="ag-bookmarks-scroll-container">
                <div class="ag-bookmarks-main">
                    <div id="ag-bookmarks-list" class="ag-bookmarks-list"></div>
                </div>
            </div>
        `;

        contentWrapper.appendChild(overlay);
        AG.isBookmarksOverlayOpen = true;

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
        searchInput.addEventListener('input', () => {
            AG.renderBookmarksList(searchInput.value.trim());
        });

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
    };

    AG.renderBookmarksList = function (filterQuery = '') {
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2zm0 13.97-4.46-2.75c-.33-.2-.75-.2-1.08 0L7 16.97V5h10v11.97z"/>
                        </svg>
                    </div>
                    <h3>No bookmarks yet</h3>
                    <p>Click the bookmark icon (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;display:inline;"><path d="M17 3H7c-1.1 0-2 .9-2 2v14.55c0 .91 1.01 1.44 1.77.96L12 17.29l5.23 3.22c.76.47 1.77-.05 1.77-.96V5c0-1.1-.9-2-2-2zm0 13.97-4.46-2.75c-.33-.2-.75-.2-1.08 0L7 16.97V5h10v11.97z"/></svg>) under any Gemini response to save it here for quick access.</p>
                </div>
            `;
            return;
        }

        let filtered = AG.bookmarksList;
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            filtered = AG.bookmarksList.filter(b =>
                (b.promptText && b.promptText.toLowerCase().includes(q)) ||
                (b.responseText && b.responseText.toLowerCase().includes(q)) ||
                (b.modelName && b.modelName.toLowerCase().includes(q))
            );
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

            const timeStr = formatRelativeTime(bm.createdAt);
            const modelBadge = bm.modelName ? `<span class="ag-bookmark-model-tag">${escapeHtml(bm.modelName)}</span>` : '';

            // Clean preview snippet
            let previewText = bm.responseText || '';
            if (previewText.length > 300) {
                previewText = previewText.slice(0, 300) + '...';
            }

            card.innerHTML = `
                <div class="ag-bookmark-card-header">
                    <div class="ag-bookmark-card-title-group">
                        <span class="ag-bookmark-card-icon">🔖</span>
                        <h4 class="ag-bookmark-card-prompt">${escapeHtml(bm.promptText || 'Saved response')}</h4>
                    </div>
                    <div class="ag-bookmark-card-meta">
                        ${modelBadge}
                        <span class="ag-bookmark-card-time">${escapeHtml(timeStr)}</span>
                    </div>
                </div>

                <div class="ag-bookmark-card-body">
                    <p class="ag-bookmark-card-preview">${escapeHtml(previewText)}</p>
                </div>

                <div class="ag-bookmark-card-actions">
                    <button type="button" class="ag-bookmark-card-btn ag-card-jump-btn" title="Open response in conversation">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        <span>Jump to chat</span>
                    </button>
                    <button type="button" class="ag-bookmark-card-btn ag-card-copy-btn" title="Copy response text">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy</span>
                    </button>
                    <button type="button" class="ag-bookmark-card-btn ag-card-delete-btn" title="Remove this bookmark">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Delete</span>
                    </button>
                </div>
            `;

            // Wire up card actions
            const jumpBtn = card.querySelector('.ag-card-jump-btn');
            jumpBtn.addEventListener('click', () => {
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
                        const snippet = (bm.responseText || '').slice(0, 80);
                        const prompts = Array.from(document.querySelectorAll('user-query'));
                        let target = null;

                        for (const p of prompts) {
                            const clean = AG.extractCleanPromptText ? AG.extractCleanPromptText(p) : (p.innerText || '');
                            if (clean && clean.includes(bm.promptText.slice(0, 40))) {
                                target = p;
                                break;
                            }
                        }

                        if (!target && snippet) {
                            const responses = Array.from(document.querySelectorAll('.model-response, model-response, .markdown-main-panel'));
                            for (const r of responses) {
                                if ((r.innerText || r.textContent || '').includes(snippet)) {
                                    target = r;
                                    break;
                                }
                            }
                        }

                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            target.classList.add('ag-text-highlight-blink');
                            setTimeout(() => target.classList.remove('ag-text-highlight-blink'), 2200);
                        }
                    }, 250);
                } else {
                    // Navigate to conversation URL
                    window.location.href = bm.conversationUrl;
                }
            });

            const copyBtn = card.querySelector('.ag-card-copy-btn');
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(bm.responseText || '');
                    const label = copyBtn.querySelector('span');
                    const oldText = label.textContent;
                    label.textContent = 'Copied!';
                    setTimeout(() => { label.textContent = oldText; }, 1800);
                } catch (e) {
                    console.error('Ask Gemini: Failed to copy text', e);
                }
            });

            const deleteBtn = card.querySelector('.ag-card-delete-btn');
            deleteBtn.addEventListener('click', () => {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    AG.BookmarkManager.removeBookmark(bm.id);
                }, 180);
            });

            listEl.appendChild(card);
        });
    };
})();
