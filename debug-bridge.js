/**
 * Ask Gemini: Main World Debug Bridge
 * Exposes AskGemini helpers directly to the page's 'top' console context
 * so you can test prompts without needing to switch execution contexts in DevTools.
 */
(function() {
    window.AskGemini = window.AskGemini || {};

    // ── Rating Debug Helpers ─────────────────────────────────────────────────────
    window.AskGemini.debugRating = {
        preview: function(feature) {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'preview', feature: feature || 'context_reply' } 
            }));
        },
        prepTrigger: function(feature) {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'prepTrigger', feature: feature || 'context_reply' } 
            }));
        },
        getState: function() {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'getState' } 
            }));
        },
        reset: function() {
            document.dispatchEvent(new CustomEvent('AG_DEBUG_RATING', { 
                detail: { action: 'reset' } 
            }));
        }
    };

    // ── Debug Report ─────────────────────────────────────────────────────────────
    window.AskGemini.debug = {
        /**
         * Collects full storage state + live runtime state from the content script
         * and copies a formatted report to the clipboard.
         *
         * Usage (Gemini tab, top frame):
         *   AskGemini.debug.report();
         */
        report: function() {
            console.log('[Ask Gemini] Collecting debug report...');

            function handleResponse(e) {
                document.removeEventListener('AG_DEBUG_REPORT_RESPONSE', handleResponse);
                const report = e.detail;
                const formatted = JSON.stringify(report, null, 2);

                navigator.clipboard.writeText(formatted).then(function() {
                    console.log('[Ask Gemini] \u2705 Debug report copied to clipboard! Paste it in your message to us.');
                }).catch(function() {
                    console.log('[Ask Gemini] Could not auto-copy \u2014 here is the full report to copy manually:');
                    console.log(formatted);
                });

                console.group('[Ask Gemini] Debug Report');
                console.log(report);
                console.groupEnd();
            }

            document.addEventListener('AG_DEBUG_REPORT_RESPONSE', handleResponse);
            document.dispatchEvent(new CustomEvent('AG_DEBUG_REPORT_REQUEST'));

            setTimeout(function() {
                document.removeEventListener('AG_DEBUG_REPORT_RESPONSE', handleResponse);
                console.warn('[Ask Gemini] Debug report timed out \u2014 content script may not be active on this page.');
            }, 3000);
        }
    };
})();

