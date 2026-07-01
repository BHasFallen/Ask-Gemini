/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                       FORTRESS FRAMEWORK v1.0                              ║
 * ║           Background Service Worker - State & Log Management               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * AmplitudeWizard - Handles Amplitude HTTP V2 API tracking
 * Professional implementation of Amplitude for Chrome Extensions
 */
class AmplitudeWizard {
    static API_KEY = '4495bcd2d5c7a66ee74635fd56d16275';
    static ENDPOINT = 'https://api2.amplitude.com/2/httpapi';
    static lastTracked = new Map();

    static async getDeviceId() {
        const result = await chrome.storage.local.get(['amplitude_device_id']);
        if (result.amplitude_device_id) return result.amplitude_device_id;
        
        const newId = `dev_${Math.random().toString(36).substr(2, 9)}`;
        await chrome.storage.local.set({ amplitude_device_id: newId });
        return newId;
    }

    /**
     * Get unique insert_id for deduplication
     */
    static generateInsertId() {
        return `ins_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    /**
     * Track event to Amplitude
     */
    static async trackEvent(name, params = {}) {
        // Exclude text_highlight from Amplitude completely to be privacy-first
        if (name === 'text_highlight') {
            return;
        }

        const now = Date.now();
        const deviceId = await this.getDeviceId();
        const version = chrome.runtime.getManifest().version;
        
        // Retrieve raw email and name from local storage
        const storageResult = await chrome.storage.local.get(['user_email', 'user_name']);
        const userId = storageResult.user_email || null;
        const userName = storageResult.user_name || null;
        
        const event = {
            device_id: deviceId,
            event_type: name,
            event_properties: params,
            time: now, // Epoch ms required
            insert_id: this.generateInsertId(),
            session_id: logManager.startTime, // Use background startup as session
            platform: 'Chrome Extension',
            os_name: 'Chrome',
            app_version: version,
            user_properties: {
                version: version,
                name: userName
            }
        };

        if (userId) {
            event.user_id = userId;
        }

        // 1. Exclude if running as an unpacked local extension (development mode)
        const isUnpacked = !('update_url' in chrome.runtime.getManifest());
        if (isUnpacked) {
            console.log(`🏰 [Amplitude] [Dev Mode] Event suppressed: ${name}`, event);
            return;
        }

        // 2. Exclude if telemetry is explicitly disabled or developerMode is enabled on this profile
        const result = await chrome.storage.local.get(['disableTelemetry', 'developerMode']);
        if (result.disableTelemetry || result.developerMode) {
            console.log(`🏰 [Amplitude] [Telemetry Suppressed] Event: ${name}`, event);
            return;
        }

        const eventBody = {
            api_key: this.API_KEY,
            events: [event]
        };

        try {
            const response = await fetch(this.ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventBody)
            });

            if (response.ok) {
                console.log(`🏰 [Amplitude] Event Tracked: ${name}`, params);
            } else {
                console.warn(`🏰 [Amplitude] API Error: ${response.status}`);
            }
        } catch (error) {
            console.error('🏰 [Amplitude] Network Error', error);
        }
    }
}


/**
 * RatingManager - Handles local usage metrics and rating prompt logic
 * Implements the "Smart Rating" business rules
 */
class RatingManager {
    static DEFAULTS = {
        activeDays: 0,
        highlightCount: 0,
        replyCount: 0,
        totalWords: 0,
        isExistingUser: false,
        postUpdateHighlights: 0,
        ratingStatus: null, // null, 'rated', 'feedback_given', 'dismissed'
        dismissedAtActiveDay: 0,
        dismissedAtHighlightCount: 0,
        lastPromptVersion: '0.0.0',
        lastDayActive: null
    };

    static async getState() {
        const res = await chrome.storage.local.get(['rating_state']);
        return res.rating_state || { ...this.DEFAULTS };
    }

    static async setState(newState) {
        await chrome.storage.local.set({ rating_state: newState });
    }

    /**
     * Record a specific event and potentially trigger evaluation
     */
    static async recordEvent(eventName, params = {}) {
        const state = await this.getState();
        const now = new Date().toISOString().split('T')[0];

        // 1. Track Active Days
        if (state.lastDayActive !== now) {
            state.activeDays += 1;
            state.lastDayActive = now;
        }

        // 2. Increment Lifetime Counters
        if (eventName === 'text_highlight') {
            state.highlightCount += 1;
            state.totalWords = (state.totalWords || 0) + (params.word_count || 0);
            if (state.isExistingUser) {
                state.postUpdateHighlights += 1;
            }
        } else if (eventName === 'context_reply_sent') {
            state.replyCount += 1;
        }

        await RatingManager.setState(state);
        
        // 3. Evaluate Trigger
        this.evaluateTrigger(state);
    }

    /**
     * Core business logic to determine if the prompt should show
     */
    static async evaluateTrigger(state) {
        // Rule: Never show if already rated
        if (state.ratingStatus === 'rated') return;

        // Rule: Update Bombardment Buffer
        if (state.isExistingUser && state.postUpdateHighlights < 5) return;

        // Rule: Redemption Arc check is handled in onInstalled, 
        // here we just check if status is feedback_given (and not reset)
        if (state.ratingStatus === 'feedback_given') return;

        const timeCriteria = state.activeDays >= 3;
        const valueCriteria = state.highlightCount >= 15 || state.replyCount >= 3;

        // Rule: Initial Trigger Thresholds
        if (state.ratingStatus === null) {
            if (timeCriteria && valueCriteria) {
                this.triggerUI();
            }
        } 
        // Rule: Cooldown Phase (Second and Final Time)
        else if (state.ratingStatus === 'dismissed') {
            const daysSinceDismissal = state.activeDays >= (state.dismissedAtActiveDay + 7);
            const highlightsSinceDismissal = state.highlightCount >= (state.dismissedAtHighlightCount + 30);
            
            if (daysSinceDismissal && highlightsSinceDismissal) {
                this.triggerUI();
            }
        }
    }

    static async triggerUI() {
        try {
            const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
            console.log(`🎯 RatingManager: Found ${tabs.length} Gemini tabs`);
            
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RATING_PROMPT' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn(`❌ Message failed for tab ${tab.id}:`, chrome.runtime.lastError.message);
                    } else {
                        console.log(`✅ Message sent successfully to tab ${tab.id}`);
                    }
                });
            });

            // Track in Amplitude once per trigger attempt
            AmplitudeWizard.trackEvent('rating_prompt_shown', { 
                version: chrome.runtime.getManifest().version 
            });
        } catch (error) {
            console.error('Trigger UI Error:', error);
        }
    }

    /**
     * Handle user interaction with the prompt
     */
    static async setStatus(status) {
        const state = await this.getState();
        state.ratingStatus = status;
        state.lastPromptVersion = chrome.runtime.getManifest().version;

        if (status === 'dismissed') {
            state.dismissedAtActiveDay = state.activeDays;
            state.dismissedAtHighlightCount = state.highlightCount;
        }

        await this.setState(state);
        logBackgroundEvent('RATING_STATUS_UPDATED', { status });

        // Track in Amplitude
        AmplitudeWizard.trackEvent('rating_interaction', {
            status: status,
            activeDays: state.activeDays,
            highlightCount: state.highlightCount
        });
    }
}

/**
 * QuotaManager - Handles periodic scraping of Gemini usage limits
 */
class QuotaManager {
    static atToken = null;

    static async getAtToken() {
        try {
            const response = await fetch('https://gemini.google.com/app', { credentials: 'include' });
            if (!response.ok) return null;
            const html = await response.text();
            const match = html.match(/"SNlM0e"\s*:\s*"([^"]+)"/);
            return match ? match[1] : null;
        } catch (e) {
            console.error('Error fetching AT token:', e);
            return null;
        }
    }

    static parseQuotaResponse(text) {
        try {
            const lines = text.split('\n');
            let innerData = null;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (/^\d+$/.test(line)) {
                    const jsonStr = lines[i + 1];
                    if (jsonStr) {
                        try {
                            const parsed = JSON.parse(jsonStr);
                            if (Array.isArray(parsed)) {
                                for (const item of parsed) {
                                    if (item[0] === 'wrb.fr' && item[1] === 'jSf9Qc') {
                                        innerData = JSON.parse(item[2]);
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            // Ignore chunk errors
                        }
                    }
                }
                if (innerData) break;
            }

            if (!innerData) {
                // Fallback direct regex check if chunks split weirdly
                const match = text.match(/"wrb.fr"\s*,\s*"jSf9Qc"\s*,\s*"(.*?)"/);
                if (match) {
                    const innerJson = JSON.parse('"' + match[1] + '"');
                    innerData = JSON.parse(innerJson);
                }
            }

            if (!innerData) return null;

            const limitsList = innerData[1];
            if (!Array.isArray(limitsList)) return null;

            let currentUsage = 0;
            let resetTime = '';
            let weeklyUsage = 0;

            for (const item of limitsList) {
                const val = Math.round((item[1] || 0) * 100);
                const type = item[2];
                const resetTsSec = item[3]?.[0]?.[0];

                if (type === 1) {
                    currentUsage = val;
                    if (resetTsSec) {
                        const date = new Date(resetTsSec * 1000);
                        resetTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }
                } else if (type === 2) {
                    weeklyUsage = val;
                }
            }

            return { currentUsage, resetTime, weeklyUsage };
        } catch (e) {
            console.error('Error parsing quota response:', e);
            return null;
        }
    }

    static async fetchUsageLimits() {
        try {
            if (!this.atToken) {
                this.atToken = await this.getAtToken();
            }

            if (!this.atToken) {
                console.error('Could not retrieve SNlM0e (at) token');
                return null;
            }

            const body = new URLSearchParams();
            body.append('f.req', '[[["jSf9Qc","[]",null,"generic"]]]');
            body.append('at', this.atToken);

            let response = await fetch('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jSf9Qc&source-path=%2Fusage', {
                method: 'POST',
                body: body,
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 400 || response.status === 403) {
                    // Token might be expired, reset and try once more
                    this.atToken = await this.getAtToken();
                    if (this.atToken) {
                        body.set('at', this.atToken);
                        response = await fetch('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jSf9Qc&source-path=%2Fusage', {
                            method: 'POST',
                            body: body,
                            credentials: 'include'
                        });
                    }
                }
            }

            if (!response.ok) return null;

            const text = await response.text();
            const limits = this.parseQuotaResponse(text);
            if (!limits) return null;

            await chrome.storage.local.set({ quota_limits: limits, last_quota_check: Date.now() });
            logBackgroundEvent('QUOTA_LIMITS_FETCHED', limits);

            // Broadcast limits update to all active Gemini tabs
            try {
                const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
                tabs.forEach(t => {
                    chrome.tabs.sendMessage(t.id, { type: 'USAGE_LIMITS_UPDATED', limits }, () => {
                        if (chrome.runtime.lastError) {
                            // Suppress errors for unloaded tabs
                        }
                    });
                });
            } catch (err) {
                console.error('Failed to broadcast quota limits:', err);
            }

            return limits;
        } catch (e) {
            console.error('Failed to scrape usage limits:', e);
            return null;
        }
    }

    static async getCachedLimits() {
        const res = await chrome.storage.local.get(['quota_limits', 'last_quota_check']);
        if (res.quota_limits && res.last_quota_check && (Date.now() - res.last_quota_check < 5 * 60 * 1000)) {
            return res.quota_limits;
        }
        return await this.fetchUsageLimits();
    }
}


/**
 * Centralized log storage for the background script
 * Maintains logs from all content scripts across tabs
 */
class BackgroundLogManager {
    constructor() {
        this.logs = [];
        this.maxLogs = 200;
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
    }

    generateSessionId() {
        return `bg_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    addLog(event) {
        if (this.logs.length >= this.maxLogs) {
            this.logs.shift();
        }
        this.logs.push({
            ...event,
            receivedAt: new Date().toISOString()
        });
    }

    getLogs() {
        return [...this.logs];
    }

    getStats() {
        const errorCount = this.logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length;
        const warnCount = this.logs.filter(l => l.level === 'WARN').length;
        return {
            totalLogs: this.logs.length,
            errorCount,
            warnCount,
            sessionId: this.sessionId,
            uptime: Date.now() - this.startTime
        };
    }

    clear() {
        this.logs = [];
    }
}

// Initialize log manager
const logManager = new BackgroundLogManager();

/**
 * Log a background-specific event
 */
function logBackgroundEvent(eventType, context = {}, level = 'INFO') {
    const event = {
        timestamp: new Date().toISOString(),
        sessionId: logManager.sessionId,
        eventType,
        level,
        source: 'background',
        context
    };
    logManager.addLog(event);
    console.log(`[Fortress/BG/${level}]`, eventType, context);
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case 'DIAGNOSTIC_EVENT':
                // Receive diagnostic events from content scripts
                if (message.event) {
                    logManager.addLog({
                        ...message.event,
                        tabId: sender.tab?.id,
                        tabUrl: sender.tab?.url
                    });
                }
                sendResponse({ success: true });
                break;

            case 'GET_SESSION_LOGS':
                // Return logs to popup or content script
                sendResponse({
                    logs: logManager.getLogs(),
                    stats: logManager.getStats()
                });
                break;

            case 'CLEAR_LOGS':
                // Clear all stored logs
                logManager.clear();
                logBackgroundEvent('LOGS_CLEARED');
                sendResponse({ success: true });
                break;

            case 'GET_STATS':
                // Return statistics only
                sendResponse({ stats: logManager.getStats() });
                break;

            case 'DEVELOPER_MODE_CHANGED':
                // Log developer mode changes
                logBackgroundEvent('DEVELOPER_MODE_CHANGED', {
                    enabled: message.enabled
                });
                sendResponse({ success: true });
                break;

            case 'GET_ERROR_REPORT':
                // Generate comprehensive error report
                const manifest = chrome.runtime.getManifest();
                const report = {
                    reportGeneratedAt: new Date().toISOString(),
                    extensionVersion: manifest.version,
                    sessionId: logManager.sessionId,
                    stats: logManager.getStats(),
                    logs: logManager.getLogs()
                };
                sendResponse({ report });
                break;

            case 'GET_USAGE_LIMITS':
                QuotaManager.getCachedLimits().then(limits => {
                    sendResponse({ success: true, limits });
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                break;

            case 'FORCE_REFRESH_USAGE_LIMITS':
                QuotaManager.fetchUsageLimits().then(limits => {
                    sendResponse({ success: true, limits });
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                break;

            case 'TRACK_EVENT':
                // Track user engagement or technical events
                AmplitudeWizard.trackEvent(message.name, message.params);
                RatingManager.recordEvent(message.name, message.params);
                if (message.name === 'context_reply_sent') {
                    // Force refresh limits when user submits contextual reply
                    QuotaManager.fetchUsageLimits().catch(console.error);
                }
                sendResponse({ success: true });
                break;

            case 'SET_RATING_STATUS':
                RatingManager.setStatus(message.status);
                sendResponse({ success: true });
                break;

            case 'OPEN_REVIEW_PAGE':
                const reviewUrl = `https://chromewebstore.google.com/detail/jhkodgigeemnmdmdikdkpcbmgbbopgni/reviews`;
                chrome.tabs.create({ url: reviewUrl, active: true });
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }
    } catch (error) {
        logBackgroundEvent('MESSAGE_HANDLER_ERROR', {
            messageType: message.type,
            error: error.message
        }, 'ERROR');
        sendResponse({ error: error.message });
    }

    // Return true to indicate async response
    return true;
});

/**
 * Handle extension installation/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    logBackgroundEvent('EXTENSION_INSTALLED', {
        reason: details.reason,
        previousVersion: details.previousVersion
    });

    try {
        // 1. Initialize/Update Rating State
        const state = await RatingManager.getState();
        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
            state.isExistingUser = false;
        } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
            const oldVersion = state.lastPromptVersion || '0.0.0';
            const oldMajor = parseInt(oldVersion.split('.')[0]);
            const newMajor = parseInt(chrome.runtime.getManifest().version.split('.')[0]);
            
            state.isExistingUser = true;
            state.postUpdateHighlights = 0;

            // Redemption Arc: Reset feedback_given if major version increases
            if (newMajor > oldMajor && state.ratingStatus === 'feedback_given') {
                state.ratingStatus = null;
            }
        }
        await RatingManager.setState(state);

        // 2. Set uninstall URL with pre-filled device ID
        const deviceId = await AmplitudeWizard.getDeviceId();
        const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform';
        const uninstallUrl = `${feedbackFormUrl}?entry.648517234=${deviceId}&device_id=${deviceId}`;
        chrome.runtime.setUninstallURL(uninstallUrl);

        // 3. Launch Onboarding/Live Tour (on fresh INSTALL, or on dev reloads for testing)
        const isUnpacked = !('update_url' in chrome.runtime.getManifest());
        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL || isUnpacked) {
            try {
                const response = await fetch('https://gemini.google.com/app', { credentials: 'include' });
                if (response.url.includes('accounts.google.com') || !response.ok) {
                    await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
                } else {
                    // User is signed in! Go straight to the live tour.
                    await new Promise((resolve) => {
                        chrome.storage.local.set({ ask_gemini_tour_active: true, tour_step: 1 }, async () => {
                            await chrome.tabs.create({ url: 'https://gemini.google.com/app' });
                            resolve();
                        });
                    });
                }
            } catch (err) {
                await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
            }
        }

        // Initialize default settings
        const result = await chrome.storage.local.get(['developerMode']);
        if (result.developerMode === undefined) {
            await chrome.storage.local.set({ developerMode: false });
            logBackgroundEvent('DEFAULT_SETTINGS_INITIALIZED');
        }
    } catch (error) {
        logBackgroundEvent('ON_INSTALLED_ERROR', { error: error.message }, 'ERROR');
    }
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
    logBackgroundEvent('EXTENSION_STARTUP');
});

/**
 * Handle tab updates - useful for SPA navigation detection
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url?.includes('gemini.google.com') && changeInfo.status === 'complete') {
        logBackgroundEvent('GEMINI_TAB_LOADED', {
            tabId,
            url: tab.url
        });
    }
});

/**
 * Periodic cleanup of old logs (every hour)
 */
chrome.alarms.create('logCleanup', { periodInMinutes: 60 });

// Fire once per day when extension is active
chrome.alarms.create('heartbeat', { periodInMinutes: 1440 });

// Periodically check usage limits (every 10 minutes)
chrome.alarms.create('quotaLimitsCheck', { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'logCleanup') {
        const stats = logManager.getStats();
        if (stats.totalLogs > 150) {
            // Trim to keep only the last 100 logs
            logManager.logs = logManager.logs.slice(-100);
            logBackgroundEvent('LOGS_TRIMMED', {
                before: stats.totalLogs,
                after: 100
            });
        }
    } else if (alarm.name === 'heartbeat') {
        AmplitudeWizard.trackEvent('extension_active');
    } else if (alarm.name === 'quotaLimitsCheck') {
        QuotaManager.fetchUsageLimits().catch(console.error);
    }
});

// Trigger initial quota fetch on startup
chrome.runtime.onStartup.addListener(() => {
    logBackgroundEvent('EXTENSION_STARTUP');
    QuotaManager.fetchUsageLimits().catch(console.error);
});

// Also trigger on install/load
chrome.runtime.onInstalled.addListener(() => {
    QuotaManager.fetchUsageLimits().catch(console.error);
});

// Log that background script has initialized
logBackgroundEvent('BACKGROUND_INITIALIZED', {
    version: chrome.runtime.getManifest().version
});

console.log('🏰 Fortress Framework Background Service Worker initialized');

// Expose to console for testing
self.RatingManager = RatingManager;
self.QuotaManager = QuotaManager;
