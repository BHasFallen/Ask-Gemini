document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');

    // 1. Load saved state
    chrome.storage.local.get(['enabled'], (result) => {
        // Default to true if not set
        toggle.checked = result.enabled !== false; 
    });

    // 2. Listen for changes
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        
        // Save to storage
        chrome.storage.local.set({ enabled: isEnabled });

        // Send message to current tab content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { 
                    action: "togglePlugin", 
                    enabled: isEnabled 
                });
            }
        });
    });
});