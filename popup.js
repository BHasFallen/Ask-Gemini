/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                       FORTRESS FRAMEWORK v1.0                              ║
 * ║           Popup Controller - Minimalist Version                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

class PopupController {
    constructor() {
        this.versionBadge = document.getElementById('version-badge');
        this.viewLogsLink = document.getElementById('view-logs');
        this.timeSavedEl = document.getElementById('time-saved');
        this.wordsAnalyzedEl = document.getElementById('words-analyzed');
        this.init();
    }

    async init() {
        this.loadVersion();
        this.loadStats();
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

    setupEventListeners() {
        this.viewLogsLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.viewSessionLogs();
        });
    }

    async viewSessionLogs() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION_LOGS' });
            if (response && response.logs) {
                console.log('📊 Session Logs:', response.logs);
                alert(`📊 Captured ${response.logs.length} events in this session.\nCheck console for details.`);
            }
        } catch (e) {
            console.error('Failed to fetch logs:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
