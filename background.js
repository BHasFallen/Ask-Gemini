/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                       FORTRESS FRAMEWORK v1.0                              ║
 * ║           Background Service Worker - State & Log Management               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Extension Log Control Guard ──────────────────────────────────────────────
(function initExtensionLogger() {
    var isUnpacked = true;
    try {
        isUnpacked = !('update_url' in chrome.runtime.getManifest());
    } catch (e) {}

    var rawLog = console.log.bind(console);
    var rawInfo = console.info.bind(console);
    var rawWarn = console.warn.bind(console);
    var rawDebug = console.debug.bind(console);

    function applyLoggerState(enabled) {
        if (!enabled) {
            console.log = function() {};
            console.info = function() {};
            console.debug = function() {};
        } else {
            console.log = rawLog;
            console.info = rawInfo;
            console.debug = rawDebug;
        }
    }

    function checkAndApply() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['developerLogsEnabled', 'developerMode'], function(res) {
                    var enabled;
                    if (res.developerLogsEnabled !== undefined) {
                        enabled = !!res.developerLogsEnabled;
                    } else if (isUnpacked) {
                        enabled = true; // Always ON by default for unpacked dev
                    } else {
                        enabled = !!res.developerMode;
                    }
                    applyLoggerState(enabled);
                });
            } else {
                applyLoggerState(isUnpacked);
            }
        } catch (e) {
            applyLoggerState(isUnpacked);
        }
    }

    checkAndApply();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function(changes, namespace) {
            if (namespace === 'local' && (changes.developerLogsEnabled !== undefined || changes.developerMode !== undefined)) {
                checkAndApply();
            }
        });
    }
})();

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

        const now = Date.now();
        const deviceId = await this.getDeviceId();
        const version = chrome.runtime.getManifest().version;
        
        // Retrieve raw email, name, tier, and feature settings/usage from local storage
        const storageResult = await chrome.storage.local.get([
            'user_email',
            'user_name',
            'quota_limits',
            'smart_paste_behavior',
            'smart_paste_trigger_count',
            'smart_paste_use_count',
            'toc_enabled',
            'toc_click_count',
            'multi_quote_enabled',
            'multi_quote_display',
            'usage_limits_enabled',
            'bookmarks_enabled',
            'bookmarks_count',
            'reply_count_lifetime'
        ]);
        const userId = storageResult.user_email || null;
        const userName = storageResult.user_name || null;
        const quotaLimits = storageResult.quota_limits || null;
        
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
                $set: {
                    version: version,
                    name: userName,
                    is_pro_user: quotaLimits?.isProUser ?? null,
                    gemini_tier: quotaLimits?.userTier ?? null,
                    // Feature Settings & Usage Properties
                    smart_paste_behavior: storageResult.smart_paste_behavior || 'auto',
                    smart_paste_enabled: (storageResult.smart_paste_behavior || 'auto') !== 'off',
                    smart_paste_trigger_count: storageResult.smart_paste_trigger_count || 0,
                    smart_paste_use_count: storageResult.smart_paste_use_count || 0,
                    toc_enabled: storageResult.toc_enabled !== false,
                    toc_click_count: storageResult.toc_click_count || 0,
                    multi_quote_enabled: storageResult.multi_quote_enabled !== false,
                    multi_quote_display: storageResult.multi_quote_display || 'compact',
                    usage_limits_enabled: storageResult.usage_limits_enabled !== false,
                    bookmarks_enabled: storageResult.bookmarks_enabled !== false,
                    bookmarks_count: storageResult.bookmarks_count || 0,
                    reply_count_lifetime: storageResult.reply_count_lifetime || 0
                }
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
 * Implements the Two-Gate habit-first rating business rules
 */
class RatingManager {
    static DEFAULTS = {
        activeDays: 0,
        replyCount: 0,
        smartPasteSuccessCount: 0,
        tocClickCount: 0,
        totalWords: 0,
        isExistingUser: false,
        postUpdateHighlights: 0,
        ratingStatus: null, // null, 'rated', 'feedback_given', 'dismissed'
        dismissedAtActiveDay: 0,
        dismissedAtTimestamp: 0,
        dismissedAtTotalActions: 0,
        dismissCount: 0,
        lastPromptTimestamp: 0,
        lastPromptVersion: '0.0.0',
        lastDayActive: null
    };

    static async getState() {
        const res = await chrome.storage.local.get(['rating_state']);
        return { ...this.DEFAULTS, ...(res.rating_state || {}) };
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

        // 1. Track Active Days across calendar days
        if (state.lastDayActive !== now) {
            state.activeDays = (state.activeDays || 0) + 1;
            state.lastDayActive = now;
        }

        // 2. Increment Lifetime Feature Counters
        if (eventName === 'context_reply_sent') {
            state.replyCount = (state.replyCount || 0) + 1;
            state.totalWords = (state.totalWords || 0) + (params.word_count || 0);
            if (state.isExistingUser) {
                state.postUpdateHighlights = (state.postUpdateHighlights || 0) + 1;
            }
        } else if (eventName === 'smart_paste_success') {
            state.smartPasteSuccessCount = (state.smartPasteSuccessCount || 0) + 1;
            if (state.isExistingUser) {
                state.postUpdateHighlights = (state.postUpdateHighlights || 0) + 1;
            }
        } else if (eventName === 'toc_item_clicked') {
            state.tocClickCount = (state.tocClickCount || 0) + 1;
            if (state.isExistingUser) {
                state.postUpdateHighlights = (state.postUpdateHighlights || 0) + 1;
            }
        }

        await RatingManager.setState(state);
        
        // 3. Evaluate Two-Gate Trigger
        this.evaluateTrigger(state, eventName, params);
    }

    /**
     * Core two-gate logic: Habit Gate (Gate 1) + Aha! Catalyst (Gate 2)
     */
    static async evaluateTrigger(state, eventName, params = {}) {
        // Rule: Never show if already rated
        if (state.ratingStatus === 'rated') return;

        // Rule: Max 2 prompt dismissals lifetime (permanently silenced if dismissed twice)
        if ((state.dismissCount || 0) >= 2) return;

        // Rule: Cooldown between prompt attempts (do not re-prompt within 24 hours)
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        if (Date.now() - (state.lastPromptTimestamp || 0) < TWENTY_FOUR_HOURS_MS) return;

        // Rule: Update Bombardment Buffer (wait 5 uses after extension update)
        if (state.isExistingUser && (state.postUpdateHighlights || 0) < 5) return;

        // Rule: Never show if feedback was already provided
        if (state.ratingStatus === 'feedback_given') return;

        const totalActions = (state.replyCount || 0) + (state.smartPasteSuccessCount || 0) + (state.tocClickCount || 0);

        // Rule: Cooldown Phase if previously dismissed (at least 5 days AND 8 total actions since dismissal)
        if (state.ratingStatus === 'dismissed') {
            const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
            const nowMs = Date.now();
            const timeSinceDismissal = state.dismissedAtTimestamp ? (nowMs - state.dismissedAtTimestamp >= FIVE_DAYS_MS) : ((state.activeDays || 0) >= ((state.dismissedAtActiveDay || 0) + 5));
            const actionsSinceDismissal = totalActions >= ((state.dismissedAtTotalActions || 0) + 8);
            if (!timeSinceDismissal || !actionsSinceDismissal) {
                return;
            }
        }

        // ─── GATE 1: Habit Gate ───────────────────────────────────────────────
        // Strictly requires at least 3 distinct calendar active days AND >= 5 total meaningful actions
        const isHabitFormed = (state.activeDays || 0) >= 3 && totalActions >= 5;
        if (!isHabitFormed) return;

        // ─── GATE 2: Aha! Delight Catalyst (Context-Specific Moments) ─────────
        let promptOptions = null;

        if (eventName === 'context_reply_sent') {
            const isMultiQuote = (params.quote_count || 1) >= 2;
            if (state.replyCount >= 3 || isMultiQuote) {
                promptOptions = {
                    source: 'context_reply',
                    featureName: 'Quote Reply',
                    title: 'Enjoying Quote Reply?',
                    subtitle: 'Takes 5 seconds to help an indie developer on the Chrome Web Store!',
                    delay: 2000
                };
            }
        } else if (eventName === 'smart_paste_success') {
            if ((state.smartPasteSuccessCount || 0) >= 2) {
                promptOptions = {
                    source: 'smart_paste',
                    featureName: 'Smart Paste',
                    title: 'Smart Paste saved your chat from clutter!',
                    subtitle: 'If converting large text to file uploads saves you time, drop a quick review!',
                    delay: 2500
                };
            }
        } else if (eventName === 'toc_item_clicked') {
            const inLongConversation = (params.totalPrompts || 0) >= 4;
            if ((state.tocClickCount || 0) >= 3 && inLongConversation) {
                promptOptions = {
                    source: 'toc',
                    featureName: 'Table of Contents',
                    title: 'Navigating long chats faster with Table of Contents?',
                    subtitle: 'Glad it keeps your long conversations organized! Support future updates with a rating.',
                    delay: 1500
                };
            }
        }

        if (promptOptions) {
            this.triggerUI(promptOptions);
        }
    }

    static async triggerUI(options = {}) {
        try {
            const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
            console.log(`🎯 RatingManager: Found ${tabs.length} Gemini tabs for ${options.source}`);
            
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { 
                    type: 'SHOW_RATING_PROMPT',
                    options: options
                }, () => {
                    if (chrome.runtime.lastError) {
                        // Tab may not be active or content script not ready
                    }
                });
            });

            // Track in Amplitude once per trigger attempt
            AmplitudeWizard.trackEvent('rating_prompt_shown', { 
                version: chrome.runtime.getManifest().version,
                source: options.source || 'unknown',
                feature: options.featureName || 'Quote Reply'
            });

            // Update last prompt timestamp and lifetime prompt counter
            const state = await this.getState();
            state.lastPromptTimestamp = Date.now();
            state.promptCount = (state.promptCount || 0) + 1;
            await this.setState(state);
        } catch (error) {
            console.error('Trigger UI Error:', error);
        }
    }

    /**
     * Handle user interaction with the prompt
     */
    static async setStatus(status, source = 'rating_banner') {
        const state = await this.getState();
        state.ratingStatus = status;
        state.lastPromptVersion = chrome.runtime.getManifest().version;

        const totalActions = (state.replyCount || 0) + (state.smartPasteSuccessCount || 0) + (state.tocClickCount || 0);

        if (status === 'dismissed') {
            state.dismissCount = (state.dismissCount || 0) + 1;
            state.dismissedAtActiveDay = state.activeDays;
            state.dismissedAtTimestamp = Date.now();
            state.dismissedAtTotalActions = totalActions;
        }

        await this.setState(state);
        logBackgroundEvent('RATING_STATUS_UPDATED', { status, source });

        // Track in Amplitude
        AmplitudeWizard.trackEvent('rating_interaction', {
            status: status,
            source: source,
            activeDays: state.activeDays,
            replyCount: state.replyCount,
            smartPasteCount: state.smartPasteSuccessCount,
            tocCount: state.tocClickCount
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

            const userTier = innerData[0];
            const isProUser = [2, 3, 4, 6].includes(userTier);

            return { currentUsage, resetTime, weeklyUsage, isProUser, userTier };
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
        // Defaults used synchronously until storage resolves
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        // Restore persisted session (30-min window — Amplitude's standard timeout)
        this._restoreSession();
    }

    async _restoreSession() {
        try {
            const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
            const res = await chrome.storage.local.get(['ag_session_id', 'ag_session_start']);
            const storedId = res.ag_session_id;
            const storedStart = res.ag_session_start;
            const now = Date.now();
            if (storedId && storedStart && (now - storedStart) < SESSION_TTL) {
                // Resume the existing session
                this.sessionId = storedId;
                this.startTime = storedStart;
            } else {
                // Persist the newly generated session
                await chrome.storage.local.set({
                    ag_session_id: this.sessionId,
                    ag_session_start: this.startTime
                });
            }
        } catch (e) {
            // Storage unavailable — keep in-memory defaults
        }
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
                RatingManager.setStatus(message.status, message.source || 'rating_banner');
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
            state.isExistingUser = true;
            state.postUpdateHighlights = 0;

            // Redemption Arc: Unblock users previously locked in feedback_given or stale dismissals
            if (state.ratingStatus === 'feedback_given' || state.ratingStatus === 'dismissed') {
                logBackgroundEvent('RATING_STATUS_UNBLOCKED_ON_UPDATE', { previousStatus: state.ratingStatus });
                state.ratingStatus = null;
            }
        }
        await RatingManager.setState(state);

        // 2. Track install/update event then set uninstall URL
        const deviceId = await AmplitudeWizard.getDeviceId();
        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
            AmplitudeWizard.trackEvent('extension_installed', {
                version: chrome.runtime.getManifest().version
            });
        } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
            AmplitudeWizard.trackEvent('extension_updated', {
                version: chrome.runtime.getManifest().version,
                previousVersion: details.previousVersion
            });
        }

        const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform';
        const uninstallUrl = `${feedbackFormUrl}?entry.648517234=${deviceId}&device_id=${deviceId}`;
        chrome.runtime.setUninstallURL(uninstallUrl);

        // 3. Launch Onboarding page (on fresh INSTALL, dev reloads, or UPDATE)
        const isUnpacked = !('update_url' in chrome.runtime.getManifest());
        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL || isUnpacked) {
            await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html?reason=install') });
        } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
            await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html?reason=update') });
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

// Periodically check usage limits (every 10 minutes)
chrome.alarms.create('quotaLimitsCheck', { periodInMinutes: 10 });

// ─── Paste Stats: Deprecated paste_daily_summary Cleanup ──────────────────────
// The paste_daily_summary event is deprecated. Clear the alarm and clean up any
// lingering daily accumulator from local storage.
chrome.alarms.clear('pasteDailyFlush');
chrome.storage.local.remove('ag_paste_stats_daily');

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
    } else if (alarm.name === 'quotaLimitsCheck') {
        QuotaManager.fetchUsageLimits().catch(console.error);
    }
});

// Trigger initial quota fetch on startup
chrome.runtime.onStartup.addListener(() => {
    logBackgroundEvent('EXTENSION_STARTUP');
    QuotaManager.fetchUsageLimits().catch(console.error);
    chrome.storage.local.remove('ag_paste_stats_daily');
});

// Also trigger on install/load
chrome.runtime.onInstalled.addListener(() => {
    QuotaManager.fetchUsageLimits().catch(console.error);
    chrome.storage.local.remove('ag_paste_stats_daily');
});

// Log that background script has initialized
logBackgroundEvent('BACKGROUND_INITIALIZED', {
    version: chrome.runtime.getManifest().version
});

console.log('🏰 Fortress Framework Background Service Worker initialized');

// Expose to console for testing
self.RatingManager = RatingManager;
self.QuotaManager = QuotaManager;
