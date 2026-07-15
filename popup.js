// Powerbox for Gemini - popup.js
'use strict';

class PopupController {
    constructor() {
        this.versionBadge = document.getElementById('version-badge');
        this.timeSavedEl = document.getElementById('time-saved');
        this.wordsAnalyzedEl = document.getElementById('words-analyzed');
        
        this.toggleQuoteReply = document.getElementById('toggle-quote-reply');
        this.toggleLimitsTracker = document.getElementById('toggle-limits-tracker');
        this.toggleChatExporter = document.getElementById('toggle-chat-exporter');
        
        this.init();
    }

    async init() {
        this.loadVersion();
        this.loadStats();
        await this.loadSettings();
        this.setupEventListeners();

        // Track view
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'powerbox_popup_view' 
        });
    }

    loadVersion() {
        try {
            const manifest = chrome.runtime.getManifest();
            this.versionBadge.textContent = `v${manifest.version}`;
        } catch (e) {
            console.error('Failed to load version:', e);
        }
    }

    async loadStats() {
        try {
            const res = await chrome.storage.local.get(['rating_state']);
            const state = res.rating_state || { totalWords: 0, replyCount: 0 };
            
            const totalWords = state.totalWords || 0;
            const replyCount = state.replyCount || 0;

            const timeSavedInMinutes = Math.round((totalWords / 100) + (replyCount * 1.0));
            const wordsAnalyzed = totalWords;

            let timeStr = `${timeSavedInMinutes} mins`;
            if (timeSavedInMinutes > 60) {
                timeStr = `${(timeSavedInMinutes / 60).toFixed(1)} hrs`;
            }

            let wordsStr = `${wordsAnalyzed} words`;
            if (wordsAnalyzed > 1000) {
                wordsStr = `${(wordsAnalyzed / 1000).toFixed(1)}k words`;
            }

            this.timeSavedEl.textContent = timeStr;
            this.wordsAnalyzedEl.textContent = wordsStr;
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async loadSettings() {
        try {
            const res = await chrome.storage.local.get(['powerbox_settings']);
            const settings = res.powerbox_settings || {
                quote_reply_enabled: true,
                usage_tracker_enabled: true,
                pdf_exporter_enabled: true
            };

            this.toggleQuoteReply.checked = settings.quote_reply_enabled;
            this.toggleLimitsTracker.checked = settings.usage_tracker_enabled;
            this.toggleChatExporter.checked = settings.pdf_exporter_enabled;
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    setupEventListeners() {
        const saveSettings = async () => {
            const settings = {
                quote_reply_enabled: this.toggleQuoteReply.checked,
                usage_tracker_enabled: this.toggleLimitsTracker.checked,
                pdf_exporter_enabled: this.toggleChatExporter.checked
            };
            await chrome.storage.local.set({ powerbox_settings: settings });
            
            chrome.runtime.sendMessage({
                type: 'TRACK_EVENT',
                name: 'powerbox_settings_changed',
                params: settings
            });
        };

        this.toggleQuoteReply.addEventListener('change', saveSettings);
        this.toggleLimitsTracker.addEventListener('change', saveSettings);
        this.toggleChatExporter.addEventListener('change', saveSettings);

        const rateBtn = document.getElementById('rate-extension-btn');
        if (rateBtn) {
            rateBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ 
                    type: 'TRACK_EVENT', 
                    name: 'powerbox_rate_click' 
                });
                chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
