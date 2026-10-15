/**
 * Ask Gemini: Dynamic Selector Registry
 * Decouples fragile DOM selectors from code by managing local defaults
 * and automatically refreshing from a remote config endpoint with storage caching.
 */
(function() {
    'use strict';

    var AG = window.AskGemini = window.AskGemini || {};
    window.AG = window.AG || AG;

    var DEFAULT_SELECTORS = {
        sidebarExpandedNav: 'mat-nav-list.top-nav-expanded, mat-nav-list.top-action-list-scrollable',
        sidebarCollapsedNav: 'mat-nav-list.top-nav-collapsed',
        sidebarStudentsItem: '[data-test-id="learn-side-nav-entry-button"]',
        sidebarMoreItem: '[data-test-id="overflow-side-nav-entry-button"]',
        sidebarGemsItem: '[data-test-id="gems-side-nav-entry-button"], a[href="/gems/view"]',
        composerInputArea: 'div.input-area-container, fieldset.input-area-container',
        composerTextArea: 'rich-textarea, div[contenteditable="true"]',
        modelResponse: 'model-response, .model-response, message-content',
        userQuery: 'user-query',
        scroller: 'infinite-scroller',
        nativeQuoteReply: '.submitted-quote-container, .submitted-quote-in-query, blockquote[aria-label="Submitted quote"]',
        nativeQuoteButton: '[fonticonname="prompt_suggestion"], [aria-label*="quote" i]'
    };

    var REMOTE_CONFIG_URL = 'https://raw.githubusercontent.com/BHasFallen/Ask-Gemini/main/config/selectors.json';
    var STORAGE_KEY = 'ag_remote_selectors';
    var STORAGE_TIME_KEY = 'ag_remote_selectors_timestamp';
    var CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

    var activeSelectors = Object.assign({}, DEFAULT_SELECTORS);
    var isInitialized = false;
    var initPromise = null;

    function syncSelectorsToMainWorld() {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('AG_SELECTORS_SYNC', {
                detail: Object.assign({}, activeSelectors)
            }));
        }
    }

    function applySelectors(newSelectors) {
        if (!newSelectors || typeof newSelectors !== 'object') return;
        for (var key in newSelectors) {
            if (Object.prototype.hasOwnProperty.call(newSelectors, key) && typeof newSelectors[key] === 'string' && newSelectors[key].trim()) {
                activeSelectors[key] = newSelectors[key].trim();
            }
        }
        syncSelectorsToMainWorld();
    }

    function fetchRemoteSelectors() {
        if (typeof fetch === 'undefined') return Promise.resolve(null);

        return fetch(REMOTE_CONFIG_URL, { cache: 'no-cache' })
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function(data) {
                if (data && data.selectors && typeof data.selectors === 'object') {
                    applySelectors(data.selectors);
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        var update = {};
                        update[STORAGE_KEY] = data.selectors;
                        update[STORAGE_TIME_KEY] = Date.now();
                        chrome.storage.local.set(update);
                    }
                    return data.selectors;
                }
                return null;
            })
            .catch(function(err) {
                // Silently fallback to active / default selectors
                return null;
            });
    }

    function init() {
        if (isInitialized && initPromise) return initPromise;

        initPromise = new Promise(function(resolve) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get([STORAGE_KEY, STORAGE_TIME_KEY], function(res) {
                    var cached = res ? res[STORAGE_KEY] : null;
                    var timestamp = res ? res[STORAGE_TIME_KEY] : 0;
                    var isExpired = !timestamp || (Date.now() - timestamp > CACHE_TTL_MS);

                    if (cached && typeof cached === 'object') {
                        applySelectors(cached);
                    }

                    if (isExpired) {
                        fetchRemoteSelectors();
                    }

                    isInitialized = true;
                    resolve(activeSelectors);
                });
            } else {
                // Non-extension environment (e.g. unit tests)
                isInitialized = true;
                resolve(activeSelectors);
            }
        });

        return initPromise;
    }

    // Auto-initialize
    init();

    AG.selectors = {
        init: init,
        defaults: DEFAULT_SELECTORS,
        get: function(key, fallback) {
            return activeSelectors[key] || fallback || DEFAULT_SELECTORS[key] || '';
        },
        getAll: function() {
            return Object.assign({}, activeSelectors);
        },
        query: function(key, root) {
            var selector = activeSelectors[key] || DEFAULT_SELECTORS[key];
            if (!selector) return null;
            var targetRoot = root || document;
            try {
                return targetRoot.querySelector(selector);
            } catch (e) {
                var def = DEFAULT_SELECTORS[key];
                return def ? targetRoot.querySelector(def) : null;
            }
        },
        queryAll: function(key, root) {
            var selector = activeSelectors[key] || DEFAULT_SELECTORS[key];
            var targetRoot = root || document;
            if (!selector) return targetRoot.querySelectorAll(':not(*)');
            try {
                return targetRoot.querySelectorAll(selector);
            } catch (e) {
                var def = DEFAULT_SELECTORS[key];
                return def ? targetRoot.querySelectorAll(def) : targetRoot.querySelectorAll(':not(*)');
            }
        },
        refresh: function() {
            return fetchRemoteSelectors();
        },
        applyOverrides: function(overrides) {
            applySelectors(overrides);
        },
        reset: function() {
            activeSelectors = Object.assign({}, DEFAULT_SELECTORS);
            syncSelectorsToMainWorld();
        }
    };

    // Listen for debug requests from main world
    if (typeof document !== 'undefined') {
        document.addEventListener('AG_DEBUG_SELECTORS_REQUEST', function() {
            syncSelectorsToMainWorld();
        });
    }

    // Initial sync
    syncSelectorsToMainWorld();

    AG.debug = AG.debug || {};
    AG.debug.selectors = function() {
        return AG.selectors.getAll();
    };
})();
