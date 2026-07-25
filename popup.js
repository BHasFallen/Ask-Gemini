/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                       FORTRESS FRAMEWORK v1.0                              ║
 * ║           Popup Controller - Minimalist Version                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

class PopupController {
    constructor() {
        this.versionBadge = document.getElementById('version-badge');
        this.reportProblemLink = document.getElementById('report-problem');
        this.timeSavedEl = document.getElementById('time-saved');
        this.wordsAnalyzedEl = document.getElementById('words-analyzed');
        this.init();
    }

    async init() {
        this.loadVersion();
        this.loadStats();
        this.loadSettings();
        this.setupEventListeners();

        // Track Popup View
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'popup_view' 
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

            // 1. Refined Math Logic
            // (1 minute per 100 words processed + 1 minute per AI reply)
            const timeSavedInMinutes = Math.round((totalWords / 100) + (replyCount * 1.0));
            const wordsAnalyzed = totalWords;

            // 2. Formatting Rules
            let timeStr = `${timeSavedInMinutes} mins`;
            if (timeSavedInMinutes > 60) {
                timeStr = `${(timeSavedInMinutes / 60).toFixed(1)} hrs`;
            }

            let wordsStr = `${wordsAnalyzed} words`;
            if (wordsAnalyzed > 1000) {
                wordsStr = `${(wordsAnalyzed / 1000).toFixed(1)}k words`;
            }

            // 3. Injection
            this.timeSavedEl.textContent = timeStr;
            this.wordsAnalyzedEl.textContent = wordsStr;
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async loadSettings() {
        const res = await chrome.storage.local.get([
            'multi_quote_display',
            'usage_limits_enabled',
            'multi_quote_enabled',
            'smart_paste_behavior'
        ]);
        const display = res.multi_quote_display || 'expanded';
        this.applyToggleState(display);

        const limits = res.usage_limits_enabled !== false;
        this.applyLimitsToggleState(limits);

        const mq = res.multi_quote_enabled !== false;
        this.applyMqToggleState(mq);

        const sp = res.smart_paste_behavior || 'auto';
        this.applySpToggleState(sp);
    }

    applyToggleState(value) {
        document.getElementById('toggle-expanded').classList.toggle('active', value === 'expanded');
        document.getElementById('toggle-compact').classList.toggle('active', value === 'compact');
    }

    applyLimitsToggleState(enabled) {
        document.getElementById('toggle-limits-on').classList.toggle('active', enabled);
        document.getElementById('toggle-limits-off').classList.toggle('active', !enabled);
    }

    applyMqToggleState(enabled) {
        document.getElementById('toggle-mq-on').classList.toggle('active', enabled);
        document.getElementById('toggle-mq-off').classList.toggle('active', !enabled);
    }

    applySpToggleState(behavior) {
        document.getElementById('toggle-sp-auto').classList.toggle('active', behavior === 'auto');
        document.getElementById('toggle-sp-ask').classList.toggle('active', behavior === 'ask');
        document.getElementById('toggle-sp-off').classList.toggle('active', behavior === 'off');
    }

    async saveMultiQuoteStyle(value) {
        await chrome.storage.local.set({ multi_quote_display: value });
        this.applyToggleState(value);
    }

    async saveUsageLimitsState(enabled) {
        await chrome.storage.local.set({ usage_limits_enabled: enabled });
        this.applyLimitsToggleState(enabled);

        // Track setting change event
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'setting_usage_limits_changed',
            params: { enabled }
        });
    }

    async saveMultiQuoteState(enabled) {
        await chrome.storage.local.set({ multi_quote_enabled: enabled });
        this.applyMqToggleState(enabled);

        // Track setting change event
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'setting_multi_quote_changed',
            params: { enabled }
        });
    }

    async saveSmartPasteBehavior(behavior) {
        await chrome.storage.local.set({ 
            smart_paste_behavior: behavior,
            smart_paste_enabled: behavior !== 'off',
            smart_paste_preference_explicitly_set: true
        });
        this.applySpToggleState(behavior);

        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'setting_smart_paste_changed',
            params: { behavior }
        });
    }

    setupEventListeners() {
        this.reportProblemLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.reportProblem();
        });

        document.getElementById('toggle-expanded').addEventListener('click', () => this.saveMultiQuoteStyle('expanded'));
        document.getElementById('toggle-compact').addEventListener('click', () => this.saveMultiQuoteStyle('compact'));

        document.getElementById('toggle-limits-on').addEventListener('click', () => this.saveUsageLimitsState(true));
        document.getElementById('toggle-limits-off').addEventListener('click', () => this.saveUsageLimitsState(false));

        document.getElementById('toggle-mq-on').addEventListener('click', () => this.saveMultiQuoteState(true));
        document.getElementById('toggle-mq-off').addEventListener('click', () => this.saveMultiQuoteState(false));

        document.getElementById('toggle-sp-auto').addEventListener('click', () => this.saveSmartPasteBehavior('auto'));
        document.getElementById('toggle-sp-ask').addEventListener('click', () => this.saveSmartPasteBehavior('ask'));
        document.getElementById('toggle-sp-off').addEventListener('click', () => this.saveSmartPasteBehavior('off'));

        const rateBtn = document.getElementById('rate-extension-btn');
        if (rateBtn) {
            rateBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ 
                    type: 'TRACK_EVENT', 
                    name: 'popup_rate_click' 
                });
                chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
            });
        }
    }

    async reportProblem() {
        try {
            // Track the report problem click
            chrome.runtime.sendMessage({ 
                type: 'TRACK_EVENT', 
                name: 'popup_report_problem_click' 
            });

            // Retrieve Amplitude device ID
            const res = await chrome.storage.local.get(['amplitude_device_id']);
            const deviceId = res.amplitude_device_id || '';
            const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform';
            const url = `${feedbackFormUrl}?entry.648517234=${deviceId}&device_id=${deviceId}`;
            
            chrome.tabs.create({ url });
        } catch (e) {
            console.error('Failed to report problem:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
