/**
 * Ask Gemini: Auto Mode Module (v2.8.0)
 * Enables and manages Google's native Auto model routing (a74ec8485b3b5ce4)
 * on gemini.google.com.
 *
 * ARCHITECTURE & FIX MATRIX:
 * 1. Strict State Machine: isAutoModeActive() is purely state-driven
 *    (autoModeEnabled && currentSelectedModel === AUTO_MODE_ID).
 *    Zero stale DOM fallbacks to eliminate reversion bugs.
 * 2. Exclusive Checkmark Sync: syncMenuDOM() guarantees that when Auto is active,
 *    ONLY Auto has a checkmark and active classes. Sibling models (Flash-Lite, Flash,
 *    Pro) are stripped of active classes. When standard models are chosen, Auto is
 *    unselected and Angular natively displays standard model checkmarks.
 * 3. Robust Click Handling & Smooth Dismiss: Intercepts clicks on Auto, sets state,
 *    immediately updates open menu DOM, fires backend L5adhe RPC, updates uncollapsed
 *    picker label, and smoothly dismisses the menu via backdrop click / trigger toggle / Escape.
 * 4. Standard Model Exit: When clicking Flash-Lite/Flash/Pro, Auto state is cleared,
 *    an RPC is dispatched for that model to exit Auto on Google's backend, and Angular
 *    handles the click natively.
 * 5. Enterprise Diagnostics: Exposes AskGemini.debugAutoMode() in both content script
 *    and main world contexts with full event history, DOM inspection, and RPC status.
 */

window.AskGemini = window.AskGemini || {};

(function () {
    const AG = window.AskGemini;

    // ─── Constants ─────────────────────────────────────────────────────────────
    AG.AUTO_MODE_ID = 'a74ec8485b3b5ce4';
    AG.AUTO_MODE_NAME = 'Auto';
    AG.AUTO_MODE_DESC = 'Adapts to your needs';

    // ─── State & Dynamic Model Registry ─────────────────────────────────────────
    AG.autoModeEnabled = true;
    AG.currentSelectedModel = null;
    AG.autoDebugLog = [];

    // Pre-seeded model registry for fast label resolution
    AG.modelRegistry = {
        'a74ec8485b3b5ce4': { title: 'Auto', subtitle: 'Adapts to your needs' },
        '8c46e95b1a07cecc': { title: 'Flash-Lite', subtitle: 'Fastest answers' },
        '56fdd199312815e2': { title: 'Flash', subtitle: 'All-around help' },
        'e6fa609c3fa255c0': { title: 'Pro', subtitle: 'Complex reasoning' }
    };

    function registerModelItem(item) {
        if (!item) return;
        const id = item.getAttribute('data-mode-id');
        if (!id || id === AG.AUTO_MODE_ID) return;
        const titleEl = item.querySelector('.label, .mode-title, span');
        const sublabelEl = item.querySelector('.sublabel, .mode-desc');
        const title = titleEl ? titleEl.textContent.trim() : null;
        const subtitle = sublabelEl ? sublabelEl.textContent.trim() : '';
        if (id && title) {
            AG.modelRegistry[id] = { title, subtitle };
        }
    }

    // ─── Logging & Diagnostics Ring Buffer ────────────────────────────────────
    function logAuto(action, details) {
        const time = new Date().toLocaleTimeString();
        const entry = { time, action, details: details || null };
        AG.autoDebugLog.push(entry);
        if (AG.autoDebugLog.length > 50) AG.autoDebugLog.shift();
        console.log('%c[Ask Gemini:Auto] ' + action, 'color: #1a73e8; font-weight: bold;', details !== undefined ? details : '');
    }

    function warnAuto(action, details) {
        const time = new Date().toLocaleTimeString();
        const entry = { time, action: 'WARN: ' + action, details: details || null };
        AG.autoDebugLog.push(entry);
        if (AG.autoDebugLog.length > 50) AG.autoDebugLog.shift();
        console.warn('[Ask Gemini:Auto] ' + action, details !== undefined ? details : '');
    }

    function errorAuto(action, err) {
        const time = new Date().toLocaleTimeString();
        const entry = { time, action: 'ERROR: ' + action, error: err ? (err.message || String(err)) : null };
        AG.autoDebugLog.push(entry);
        if (AG.autoDebugLog.length > 50) AG.autoDebugLog.shift();
        console.error('[Ask Gemini:Auto] ' + action, err);
    }

    // ─── Reinforcement Timer Management ───────────────────────────────────────
    let reinforcementTimers = [];
    function clearReinforcementTimers() {
        reinforcementTimers.forEach(id => clearTimeout(id));
        reinforcementTimers = [];
    }

    function scheduleReinforcement(fn) {
        clearReinforcementTimers();
        [20, 60, 120, 250, 500, 1000].forEach(delay => {
            const tid = setTimeout(() => {
                fn();
            }, delay);
            reinforcementTimers.push(tid);
        });
    }

    // ─── Strict State Checker ──────────────────────────────────────────────────
    /**
     * Checks if Gemini is currently in Auto mode.
     * Pure, strict boolean based on user's active choice.
     * NEVER query stale DOM elements to determine state.
     */
    AG.isAutoModeActive = function isAutoModeActive() {
        return Boolean(AG.autoModeEnabled && AG.currentSelectedModel === AG.AUTO_MODE_ID);
    };

    /**
     * Checks if Extended Thinking mode is currently active on the page.
     * Prevents clobbering thinking chips, subtitles, or model names.
     */
    AG.isExtendedThinkingActive = function isExtendedThinkingActive() {
        try {
            // 1. Check secondary subtitle on the picker trigger button
            const secondary = document.querySelector('.picker-secondary-text');
            if (secondary && /extended\s*thinking|thinking/i.test(secondary.textContent)) {
                return true;
            }
            // 2. Check slide toggle or checkbox
            const toggle = document.querySelector(
                '[data-test-id="thinking-level-toggle"] input, ' +
                '[data-test-id="thinking-level-toggle"][aria-checked="true"], ' +
                '.embedded-thinking-level-container mat-slide-toggle.mat-mdc-slide-toggle-checked'
            );
            if (toggle && (toggle.checked || toggle.getAttribute('aria-checked') === 'true')) {
                return true;
            }
            // 3. Check active sub-option in open/closed menu
            const activeThinking = document.querySelector(
                'gem-menu-item[data-active="true"] .label, ' +
                '[data-test-id*="bard-mode-sub-option"][aria-current="true"]'
            );
            if (activeThinking && /extended\s*thinking|complex\s*problem/i.test(activeThinking.textContent)) {
                return true;
            }
        } catch (_) {}
        return false;
    };

    // ─── Storage & Main World Sync ─────────────────────────────────────────────
    function initAutoMode() {
        // Fast restore from sessionStorage
        try {
            const saved = sessionStorage.getItem('ag_gemini_mode');
            if (saved) {
                AG.currentSelectedModel = saved;
                logAuto('Restored active model from sessionStorage:', saved);
                AG.applyModelToPickerLabels(saved);
            }
        } catch (e) {
            warnAuto('sessionStorage access error', e);
        }

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['auto_mode_enabled', 'gemini_selected_mode'], (res) => {
                if (res.auto_mode_enabled !== undefined) {
                    AG.autoModeEnabled = res.auto_mode_enabled !== false;
                }
                if (res.gemini_selected_mode) {
                    AG.currentSelectedModel = res.gemini_selected_mode;
                    logAuto('Restored active model from chrome.storage:', res.gemini_selected_mode);
                    AG.applyModelToPickerLabels(res.gemini_selected_mode);
                }
                syncWithMainWorld();
            });

            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'local') {
                    if (changes.auto_mode_enabled) {
                        AG.autoModeEnabled = changes.auto_mode_enabled.newValue !== false;
                        logAuto('autoModeEnabled updated via storage:', AG.autoModeEnabled);
                        syncWithMainWorld();
                        if (!AG.autoModeEnabled && AG.currentSelectedModel === AG.AUTO_MODE_ID) {
                            AG.currentSelectedModel = null;
                        }
                    }
                    if (changes.gemini_selected_mode) {
                        AG.currentSelectedModel = changes.gemini_selected_mode.newValue;
                        logAuto('gemini_selected_mode updated via storage:', AG.currentSelectedModel);
                        AG.applyModelToPickerLabels(AG.currentSelectedModel);
                    }
                }
            });
        }
    }

    function syncWithMainWorld() {
        try {
            document.dispatchEvent(new CustomEvent('AG_AUTO_MODE_CONFIG', {
                detail: {
                    enabled: AG.autoModeEnabled,
                    modeId: AG.AUTO_MODE_ID,
                    currentSelectedModel: AG.currentSelectedModel,
                    isAuto: AG.isAutoModeActive()
                }
            }));
        } catch (e) {
            warnAuto('Failed to dispatch AG_AUTO_MODE_CONFIG', e);
        }
    }

    // Main world programmatic bridge listener
    document.addEventListener('AG_MAIN_WORLD_SELECT_MODEL', (e) => {
        if (e.detail && e.detail.modeId) {
            AG.selectModel(e.detail.modeId);
        }
    });

    // ─── Menu Dismiss (Multi-Strategy, Bulletproof) ────────────────────────────
    function dismissMenu() {
        logAuto('Dismissing model picker menu...');
        try {
            // Strategy 1: Angular CDK Overlay Backdrop click
            const backdrop = document.querySelector('.cdk-overlay-backdrop');
            if (backdrop) {
                backdrop.click();
            }

            // Strategy 2: If the trigger button has aria-expanded="true", click to toggle closed
            const expandedTrigger = document.querySelector(
                'button.input-area-switch[aria-expanded="true"], ' +
                'button[data-test-id="bard-mode-menu-button"][aria-expanded="true"], ' +
                'bard-mode-switcher button[aria-expanded="true"], ' +
                'button[gemmenutrigger][aria-expanded="true"]'
            );
            if (expandedTrigger) {
                expandedTrigger.click();
            }

            // Strategy 3: Escape key events across window, document, and activeElement
            const makeEsc = () => new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true
            });
            window.dispatchEvent(makeEsc());
            document.dispatchEvent(makeEsc());
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.dispatchEvent(makeEsc());
            }
        } catch (err) {
            errorAuto('Error during dismissMenu', err);
        }
    }

    // ─── Uncollapsed Picker Button Label Synchronization ──────────────────────
    let isApplyingLabels = false;

    /**
     * Updates the uncollapsed trigger button to display the active model name.
     * Uses AG.modelRegistry or falls back to known defaults.
     */
    AG.applyModelToPickerLabels = function applyModelToPickerLabels(modelId, force = false) {
        if (isApplyingLabels) return;

        // If Extended Thinking is active in the UI, do NOT force or overwrite labels
        if (!force && AG.isExtendedThinkingActive()) {
            return;
        }

        const targetId = modelId || AG.currentSelectedModel;
        if (!targetId) return;

        const info = AG.modelRegistry[targetId];
        const title = info ? info.title : (targetId === AG.AUTO_MODE_ID ? 'Auto' : null);
        if (!title) return;

        if (!force) {
            // Avoid modifying the button while the user is actively browsing an open menu
            const openMenu = document.querySelector(
                'gem-menu[data-visible="true"], ' +
                'gem-menu:not([style*="display: none"]), ' +
                '[data-test-id="gem-mode-menu"], ' +
                '.cdk-overlay-pane gem-menu'
            );
            if (openMenu) return;
        }

        isApplyingLabels = true;
        try {
            // 1. Primary text elements (Flash-Lite / Flash / Pro / Auto)
            const primaryEls = document.querySelectorAll(
                '.picker-primary-text, ' +
                '.logo-pill-label-container .gds-body-m, ' +
                '[data-test-id="current-model-name"], ' +
                '.current-model-title'
            );

            let updatedCount = 0;
            primaryEls.forEach(el => {
                // Ensure this is NOT an element inside an open menu item
                if (el.closest('gem-menu-item, [role="menuitem"], .bard-mode-list-button')) return;

                if (el.textContent.trim() !== title) {
                    el.textContent = title;
                    updatedCount++;
                }
            });

            if (updatedCount > 0) {
                logAuto(`Applied "${title}" to ${updatedCount} picker label(s)`);
            }

            // 2. Secondary subtitle element:
            // CRITICAL FIX: Only blank if strictly in Auto Mode AND it does not contain Extended Thinking!
            // Never clobber Google's Extended Thinking label.
            if (targetId === AG.AUTO_MODE_ID) {
                const secondaryEls = document.querySelectorAll('.picker-secondary-text');
                secondaryEls.forEach(el => {
                    if (el.closest('gem-menu-item, [role="menuitem"], .bard-mode-list-button')) return;
                    if (/extended\s*thinking|thinking/i.test(el.textContent)) return;
                    if (el.textContent.trim() !== '') {
                        el.textContent = '';
                    }
                });
            }

            // 3. Update aria-label on trigger button for accessibility
            const triggerBtns = document.querySelectorAll(
                'button.input-area-switch, ' +
                'button[data-test-id="bard-mode-menu-button"], ' +
                'bard-mode-switcher button'
            );
            triggerBtns.forEach(btn => {
                const currentAria = btn.getAttribute('aria-label') || '';
                if (currentAria && !currentAria.includes(title)) {
                    btn.setAttribute('aria-label', currentAria.replace(/(currently\s+)[^,\.]+/i, '$1' + title));
                }
            });
        } catch (err) {
            errorAuto('applyModelToPickerLabels error', err);
        } finally {
            isApplyingLabels = false;
        }
    };

    /**
     * Backwards-compatible helper for Auto mode label application.
     */
    AG.applyAutoToPickerLabels = function applyAutoToPickerLabels(force = false) {
        if (!AG.isAutoModeActive()) return;
        AG.applyModelToPickerLabels(AG.AUTO_MODE_ID, force);
    };

    // ─── Menu DOM Synchronization (Exclusive Checkmarks) ───────────────────────
    /**
     * Synchronizes checkmarks and active states inside the open menu.
     * Ensures ONLY the currently active model (Auto or standard) has a checkmark.
     */
    AG.syncMenuDOM = function syncMenuDOM(menu) {
        if (!menu) return;

        try {
            const allItems = menu.querySelectorAll('gem-menu-item[data-mode-id], .bard-mode-list-button[data-mode-id], button[role="menuitem"][data-mode-id]');
            if (!allItems || allItems.length === 0) return;

            // Register all discovered items in our model registry
            allItems.forEach(mi => registerModelItem(mi));

            // If we don't know the current model yet, detect if one already has Angular's selected class
            if (!AG.currentSelectedModel) {
                for (const mi of allItems) {
                    if (mi.classList.contains('selected') || mi.classList.contains('is-selected') || mi.getAttribute('data-active') === 'true') {
                        const mid = mi.getAttribute('data-mode-id');
                        if (mid) {
                            AG.currentSelectedModel = mid;
                            logAuto('Detected active model from menu:', mid);
                            break;
                        }
                    }
                }
            }

            const activeModelId = AG.currentSelectedModel || AG.AUTO_MODE_ID;

            // Find sample checkmark icon from menu if present
            const sampleCheckIcon = menu.querySelector('.leading-container gem-icon, .leading-container mat-icon');

            allItems.forEach(mi => {
                const miId = mi.getAttribute('data-mode-id');
                const isSelected = (miId === activeModelId);

                if (mi.tagName.toLowerCase() === 'gem-menu-item') {
                    if (isSelected) {
                        mi.classList.add('selected', 'active');
                        mi.setAttribute('data-active', 'true');
                        mi.setAttribute('tabindex', '0');

                        const content = mi.querySelector('gem-menu-item-content');
                        if (content) content.classList.add('selected', 'active');

                        const leading = mi.querySelector('.leading-container');
                        if (leading) {
                            if (!leading.querySelector('gem-icon, mat-icon')) {
                                if (sampleCheckIcon && !leading.contains(sampleCheckIcon)) {
                                    leading.innerHTML = '';
                                    leading.appendChild(sampleCheckIcon.cloneNode(true));
                                } else {
                                    leading.innerHTML = `
                                        <gem-icon aria-label="Selected" class="ng-star-inserted">
                                            <mat-icon role="img" class="mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font mat-icon-no-color ng-star-inserted" aria-hidden="true" data-mat-icon-type="font" data-mat-icon-name="check" data-mat-icon-namespace="lumi-symbols" fonticon="check">check</mat-icon>
                                        </gem-icon>
                                    `;
                                }
                            }
                        }
                    } else {
                        // Sibling item: ensure NOT selected and checkmark is removed
                        mi.classList.remove('selected', 'active');
                        mi.setAttribute('data-active', 'false');
                        mi.setAttribute('tabindex', '-1');

                        const content = mi.querySelector('gem-menu-item-content');
                        if (content) content.classList.remove('selected', 'active');

                        const leading = mi.querySelector('.leading-container');
                        if (leading) leading.innerHTML = '';
                    }
                } else {
                    // Button format (classic UI / tests)
                    if (isSelected) {
                        mi.classList.add('is-selected');
                        mi.setAttribute('aria-current', 'true');
                    } else {
                        mi.classList.remove('is-selected');
                        mi.removeAttribute('aria-current');
                    }
                }
            });
        } catch (err) {
            errorAuto('syncMenuDOM error', err);
        }
    };

    // ─── Click Handler for Auto Mode ──────────────────────────────────────────
    function handleAutoClick(e, item) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }

        clearReinforcementTimers();
        logAuto('🎯 Auto Mode selected by user click');

        // 1. Update State
        AG.currentSelectedModel = AG.AUTO_MODE_ID;
        try { sessionStorage.setItem('ag_gemini_mode', AG.AUTO_MODE_ID); } catch (_) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ gemini_selected_mode: AG.AUTO_MODE_ID });
        }

        // 2. Visually update menu immediately
        const menu = (item && item.closest('gem-menu, [data-test-id="gem-mode-menu"], [role="menu"], .mat-mdc-menu-panel'))
            || document.querySelector('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel');
        if (menu) {
            AG.syncMenuDOM(menu);
        }

        // 3. Dispatch native backend L5adhe RPC
        logAuto('Dispatching model switch RPC for mode:', AG.AUTO_MODE_ID);
        document.dispatchEvent(new CustomEvent('AG_TRIGGER_MODEL_SWITCH', {
            detail: { modeId: AG.AUTO_MODE_ID }
        }));

        // 4. Force trigger button label to "Auto"
        AG.applyAutoToPickerLabels(true);

        // 5. Dismiss menu smoothly
        dismissMenu();

        // 6. Progressive label reinforcement to override Angular re-renders
        scheduleReinforcement(() => {
            AG.applyAutoToPickerLabels(true);
        });
    }

    function bindAutoClickListener(autoEl) {
        if (!autoEl || autoEl.hasAttribute('data-ag-has-listener')) return;
        autoEl.setAttribute('data-ag-has-listener', 'true');

        autoEl.addEventListener('click', (e) => {
            handleAutoClick(e, autoEl);
        }, true);
    }

    // ─── DOM Injector ──────────────────────────────────────────────────────────
    /**
     * Injects or verifies the Auto Mode option at the top of the model menu.
     */
    AG.ensureAutoModeOptionInDOM = function ensureAutoModeOptionInDOM(menuContainer) {
        if (!menuContainer || !AG.autoModeEnabled) return;

        try {
            // Check if Auto is already present
            const existingAuto = menuContainer.querySelector('[data-mode-id="' + AG.AUTO_MODE_ID + '"]');
            if (existingAuto) {
                bindAutoClickListener(existingAuto);
                AG.syncMenuDOM(menuContainer);
                return existingAuto;
            }

            // Find an existing sibling item to clone
            const sampleItem = menuContainer.querySelector(
                'gem-menu-item[data-mode-id], ' +
                '.bard-mode-list-button[data-mode-id], ' +
                'button[role="menuitem"][data-mode-id]'
            );

            if (!sampleItem) {
                // Angular might still be populating items; schedule retry
                setTimeout(() => {
                    const retryMenu = document.querySelector('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel');
                    if (retryMenu && !retryMenu.querySelector('[data-mode-id="' + AG.AUTO_MODE_ID + '"]')) {
                        AG.ensureAutoModeOptionInDOM(retryMenu);
                    }
                }, 25);
                return;
            }

            const isLumi = sampleItem.tagName.toLowerCase() === 'gem-menu-item';
            logAuto('Injecting Auto option into menu (Type: ' + (isLumi ? 'Lumi' : 'Button') + ')');

            if (isLumi) {
                // Clone Google's exact Lumi gem-menu-item
                const autoItem = sampleItem.cloneNode(true);
                autoItem.setAttribute('data-mode-id', AG.AUTO_MODE_ID);
                autoItem.setAttribute('data-test-id', 'bard-mode-option-auto');
                autoItem.setAttribute('data-ag-injected', 'true');
                autoItem.setAttribute('role', 'menuitem');
                autoItem.setAttribute('jslog', '242569;track:generic_click,impression;BardVeMetadataKey:W251bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsWyJhNzRlYzg0ODViM2I1Y2U0Il1d;mutable:true');

                // Set labels
                const labelEl = autoItem.querySelector('.label');
                if (labelEl) labelEl.textContent = 'Auto';
                const sublabelEl = autoItem.querySelector('.sublabel');
                if (sublabelEl) sublabelEl.textContent = 'Adapts to your needs';

                // Also support legacy/test selectors if present
                const modeTitle = autoItem.querySelector('.mode-title');
                if (modeTitle) modeTitle.textContent = 'Auto';
                const modeDesc = autoItem.querySelector('.mode-desc');
                if (modeDesc) modeDesc.textContent = 'Adapts to your needs';

                bindAutoClickListener(autoItem);

                // Insert at the very top of the menu
                const parent = sampleItem.parentNode;
                parent.insertBefore(autoItem, parent.firstChild);

                AG.syncMenuDOM(menuContainer);
                return autoItem;
            } else {
                // Material Design button clone fallback (used in unit/local tests and classic UI)
                const autoBtn = sampleItem.cloneNode(true);
                autoBtn.setAttribute('data-mode-id', AG.AUTO_MODE_ID);
                autoBtn.setAttribute('data-test-id', 'bard-mode-option-auto');
                autoBtn.setAttribute('data-ag-injected', 'true');
                autoBtn.classList.remove('is-selected');
                autoBtn.removeAttribute('aria-current');

                // Update text content
                let title = autoBtn.querySelector('.mode-title');
                if (!title) {
                    title = autoBtn.querySelector('span');
                    if (title) title.classList.add('mode-title');
                }
                if (title) title.textContent = 'Auto';

                let desc = autoBtn.querySelector('.mode-desc');
                if (!desc) {
                    desc = document.createElement('span');
                    desc.className = 'mode-desc';
                    autoBtn.appendChild(desc);
                }
                desc.textContent = 'Adapts to your needs';

                bindAutoClickListener(autoBtn);

                const parent = sampleItem.parentNode;
                parent.insertBefore(autoBtn, parent.firstChild);

                AG.syncMenuDOM(menuContainer);
                return autoBtn;
            }
        } catch (err) {
            errorAuto('ensureAutoModeOptionInDOM error', err);
        }
    };

    // ─── Global Capture Listener for Model Selection ───────────────────────────
    // Intercepts click at document root BEFORE Angular tears down or modifies menu DOM
    document.addEventListener('click', (e) => {
        try {
            // Check if click was on or inside the mode picker trigger button
            const trigger = e.target.closest(
                'button.input-area-switch, ' +
                'button[data-test-id="bard-mode-menu-button"], ' +
                'bard-mode-switcher button, ' +
                '[gemmenutrigger]'
            );
            if (trigger) {
                logAuto('Trigger button clicked; starting menu detection polling...');
                // Poll at rapid intervals to detect the menu as soon as Angular opens it
                [10, 30, 60, 120, 250, 500].forEach(delay => {
                    setTimeout(() => {
                        const menu = document.querySelector('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel, .cdk-overlay-pane');
                        if (menu) {
                            AG.ensureAutoModeOptionInDOM(menu);
                        }
                    }, delay);
                });
            }

            // Check if click was on Extended Thinking option
            const isThinkingClick = Boolean(
                e.target.closest(
                    '[data-test-id*="thinking"], ' +
                    '[data-test-id*="bard-mode-sub-option"], ' +
                    '.embedded-thinking-level-container, ' +
                    'thinking-level-picker, ' +
                    '[id*="extended-thinking"]'
                ) || (
                    e.target.closest('gem-menu-item, button, [role="menuitem"]') &&
                    /extended\s*thinking|complex\s*problem\s*solving/i.test(e.target.closest('gem-menu-item, button, [role="menuitem"]').textContent)
                )
            );

            if (isThinkingClick) {
                logAuto('🧠 Extended Thinking option clicked; yielding to Angular and clearing Auto mode');
                clearReinforcementTimers();

                // Clear Auto mode state so Ask Gemini stops enforcing 'Auto' labels
                if (AG.currentSelectedModel === AG.AUTO_MODE_ID) {
                    AG.currentSelectedModel = null;
                    try { sessionStorage.removeItem('ag_gemini_mode'); } catch (_) {}
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.remove('gemini_selected_mode');
                    }
                    syncWithMainWorld();
                }
                // Yield to Angular: do NOT preventDefault or stopPropagation
                return;
            }

            // Check if click was on a model option inside the menu
            const item = e.target.closest(
                'gem-menu-item[data-mode-id], ' +
                '[role="menuitem"][data-mode-id], ' +
                '.bard-mode-list-button[data-mode-id], ' +
                'button[data-mode-id]'
            );
            if (!item) return;

            const modeId = item.getAttribute('data-mode-id');
            if (!modeId) return;

            if (modeId === AG.AUTO_MODE_ID) {
                // Auto Mode option clicked
                handleAutoClick(e, item);
            } else {
                // Standard Model (Flash-Lite, Flash, Pro) option clicked!
                clearReinforcementTimers();
                logAuto('🎯 Standard model option clicked:', modeId);
                registerModelItem(item);

                // Explicitly record standard model ID so isAutoModeActive() becomes FALSE
                AG.currentSelectedModel = modeId;
                try { sessionStorage.setItem('ag_gemini_mode', modeId); } catch (_) {}
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ gemini_selected_mode: modeId });
                }

                // Visually sync open menu immediately
                const menu = item.closest('gem-menu, [data-test-id="gem-mode-menu"], [role="menu"], .mat-mdc-menu-panel')
                    || document.querySelector('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel');
                if (menu) {
                    AG.syncMenuDOM(menu);
                }

                // Dispatch RPC to notify Google backend to switch to this standard mode
                logAuto('Dispatching model switch RPC for mode:', modeId);
                document.dispatchEvent(new CustomEvent('AG_TRIGGER_MODEL_SWITCH', {
                    detail: { modeId: modeId }
                }));

                // Force update trigger button label to the standard model's title
                AG.applyModelToPickerLabels(modeId, true);

                // Progressive label reinforcement to prevent Angular reverts
                scheduleReinforcement(() => {
                    AG.applyModelToPickerLabels(modeId, true);
                });

                // Dismiss menu smoothly
                setTimeout(() => {
                    dismissMenu();
                }, 40);

                syncWithMainWorld();
            }
        } catch (err) {
            errorAuto('Global click handler error', err);
        }
    }, true); // Capture phase: intercepts before Angular teardown

    // ─── Programmatic Selection API ───────────────────────────────────────────
    AG.selectAutoMode = function selectAutoMode() {
        logAuto('Programmatic selectAutoMode called');
        handleAutoClick(null, document.querySelector('[data-mode-id="' + AG.AUTO_MODE_ID + '"]'));
        return true;
    };

    AG.selectModel = function selectModel(modeId) {
        logAuto('Programmatic selectModel called with:', modeId);
        if (modeId === AG.AUTO_MODE_ID) {
            return AG.selectAutoMode();
        }
        AG.currentSelectedModel = modeId;
        try { sessionStorage.setItem('ag_gemini_mode', modeId); } catch (_) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ gemini_selected_mode: modeId });
        }
        const menu = document.querySelector('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel');
        if (menu) AG.syncMenuDOM(menu);
        AG.applyModelToPickerLabels(modeId, true);
        dismissMenu();
        document.dispatchEvent(new CustomEvent('AG_TRIGGER_MODEL_SWITCH', { detail: { modeId } }));
        syncWithMainWorld();
        return true;
    };

    // ─── Diagnostics Suite ────────────────────────────────────────────────────
    AG.debugAutoMode = function debugAutoMode() {
        console.group('%c=== ASK GEMINI AUTO MODE DIAGNOSTICS ===', 'color: #1a73e8; font-weight: bold; font-size: 14px;');

        const report = {
            state: {
                autoModeEnabled: AG.autoModeEnabled,
                currentSelectedModel: AG.currentSelectedModel,
                isAutoModeActive: AG.isAutoModeActive(),
                isExtendedThinkingActive: AG.isExtendedThinkingActive(),
                activeModelTitle: AG.modelRegistry[AG.currentSelectedModel]?.title || (AG.currentSelectedModel === AG.AUTO_MODE_ID ? 'Auto' : 'UNKNOWN'),
                sessionStorage_ag_gemini_mode: (function () { try { return sessionStorage.getItem('ag_gemini_mode'); } catch (e) { return 'ERROR: ' + e.message; } })(),
                lastRpcStatus: window.AskGemini.lastModelSwitch || 'No RPC sent yet'
            },
            modelRegistry: AG.modelRegistry,
            dom: {
                pickerButtons: Array.from(document.querySelectorAll(
                    'button.input-area-switch, button[data-test-id="bard-mode-menu-button"], bard-mode-switcher button'
                )).map(b => ({
                    primaryText: b.querySelector('.picker-primary-text, .logo-pill-label-container .gds-body-m')?.textContent?.trim() || 'NONE',
                    secondaryText: b.querySelector('.picker-secondary-text')?.textContent?.trim() || 'NONE',
                    ariaLabel: b.getAttribute('aria-label'),
                    ariaExpanded: b.getAttribute('aria-expanded')
                })),
                openMenus: Array.from(document.querySelectorAll('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel')).map(m => ({
                    tagName: m.tagName,
                    visible: m.getAttribute('data-visible') || getComputedStyle(m).display !== 'none',
                    itemCount: m.querySelectorAll('[data-mode-id]').length
                })),
                menuItems: Array.from(document.querySelectorAll('gem-menu-item[data-mode-id], .bard-mode-list-button[data-mode-id]')).map(item => ({
                    modeId: item.getAttribute('data-mode-id'),
                    label: item.querySelector('.label, .mode-title, span')?.textContent?.trim() || '',
                    isSelected: item.classList.contains('selected') || item.classList.contains('is-selected'),
                    isActive: item.getAttribute('data-active') === 'true' || item.getAttribute('aria-current') === 'true',
                    hasCheckmark: Boolean(item.querySelector('.leading-container gem-icon, .leading-container mat-icon, [data-mat-icon-name="check"]')),
                    injected: item.hasAttribute('data-ag-injected')
                }))
            },
            recentEvents: AG.autoDebugLog.slice(-15)
        };

        console.log('Status Summary:', {
            active: report.state.isAutoModeActive,
            model: report.state.currentSelectedModel,
            title: report.state.activeModelTitle,
            enabled: report.state.autoModeEnabled
        });

        console.log('Picker Trigger Buttons in DOM:', report.dom.pickerButtons);
        console.log('Active Menu Items in DOM:', report.dom.menuItems);
        console.table(report.recentEvents);
        console.groupEnd();

        return report;
    };

    // ─── MutationObserver: Keep Auto Option in Menu & Safe Debounced Trigger Sync ─
    let labelSyncDebounce = null;
    function debouncedSyncPickerLabels() {
        if (labelSyncDebounce) return;
        labelSyncDebounce = requestAnimationFrame(() => {
            labelSyncDebounce = null;
            if (AG.currentSelectedModel && !AG.isExtendedThinkingActive()) {
                AG.applyModelToPickerLabels(AG.currentSelectedModel, false);
            }
        });
    }

    const menuObserver = new MutationObserver((mutations) => {
        if (!AG.autoModeEnabled) return;

        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const isMenu = node.matches && (
                        node.matches('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel, .cdk-overlay-pane')
                            ? node
                            : node.querySelector('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel, .cdk-overlay-pane')
                    );
                    if (isMenu) {
                        AG.ensureAutoModeOptionInDOM(isMenu);
                    }

                    // Also check if individual menu items are streamed in
                    if (node.matches && (node.matches('gem-menu-item, .bard-mode-list-button') || node.querySelector('gem-menu-item, .bard-mode-list-button'))) {
                        const parentMenu = node.closest('gem-menu, [data-test-id="gem-mode-menu"], .mat-mdc-menu-panel, .cdk-overlay-pane');
                        if (parentMenu) {
                            AG.ensureAutoModeOptionInDOM(parentMenu);
                        }
                    }

                    // Only sync picker label if the trigger button itself was mounted/re-rendered
                    const isTrigger = node.matches && (
                        node.matches('button.input-area-switch, bard-mode-switcher, [data-test-id="bard-mode-menu-button"]')
                            ? node
                            : node.querySelector('button.input-area-switch, bard-mode-switcher, [data-test-id="bard-mode-menu-button"]')
                    );
                    if (isTrigger) {
                        debouncedSyncPickerLabels();
                    }
                }
            }
        }
    });

    if (document.body) {
        menuObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            menuObserver.observe(document.body, { childList: true, subtree: true });
        });
    }

    initAutoMode();
    logAuto('Module initialized successfully');
})();
