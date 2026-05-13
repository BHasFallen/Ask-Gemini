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
        // Basic rate limiting for high-frequency events
        const now = Date.now();
        if (name === 'text_highlight' && (now - (this.lastTracked.get('text_highlight') || 0) < 2000)) {
            return;
        }
        this.lastTracked.set(name, now);

        const deviceId = await this.getDeviceId();
        
        const eventBody = {
            api_key: this.API_KEY,
            events: [{
                device_id: deviceId,
                event_type: name,
                event_properties: params,
                time: now, // Epoch ms required
                insert_id: this.generateInsertId(),
                session_id: logManager.startTime, // Use background startup as session
                platform: 'Chrome Extension',
                os_name: 'Chrome'
            }]
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

            case 'TRACK_EVENT':
                // Track user engagement or technical events
                AmplitudeWizard.trackEvent(message.name, message.params);
                RatingManager.recordEvent(message.name, message.params);
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
chrome.runtime.onInstalled.addListener((details) => {
    logBackgroundEvent('EXTENSION_INSTALLED', {
        reason: details.reason,
        previousVersion: details.previousVersion
    });

    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL || details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        // Initialize/Update Rating State
        RatingManager.getState().then(state => {
            if (details.reason === 'install') {
                state.isExistingUser = false;
            } else if (details.reason === 'update') {
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
            RatingManager.setState(state);
        });

        fetch('https://gemini.google.com/app')
            .then(response => {
                // If it redirects to accounts.google.com, the user is signed out of Gemini
                if (response.url.includes('accounts.google.com') || !response.ok) {
                    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
                } else {
                    // User is signed in! Go straight to the live tour.
                    chrome.storage.local.set({ ask_gemini_tour_active: true, tour_step: 1 }, () => {
                        chrome.tabs.create({ url: 'https://gemini.google.com/app' });
                    });
                }
            })
            .catch(() => {
                // Fallback if fetch fails
                chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
            });
    }

    // Initialize default settings
    chrome.storage.local.get(['developerMode'], (result) => {
        if (result.developerMode === undefined) {
            chrome.storage.local.set({ developerMode: false });
            logBackgroundEvent('DEFAULT_SETTINGS_INITIALIZED');
        }
    });
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
    }
});

// Log that background script has initialized
logBackgroundEvent('BACKGROUND_INITIALIZED', {
    version: chrome.runtime.getManifest().version
});

console.log('🏰 Fortress Framework Background Service Worker initialized');

// Expose to console for testing
self.RatingManager = RatingManager;
