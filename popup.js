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
        this.init();
    }

    async init() {
        this.loadVersion();
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
