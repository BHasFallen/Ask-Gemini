/**
 * Ask Gemini: Main World Debug Bridge
 * Exposes AskGemini helpers directly to the page's 'top' console context
 * so you can test prompts without needing to switch execution contexts in DevTools.
 */
(function() {
    window.AskGemini = window.AskGemini || {};
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
})();
