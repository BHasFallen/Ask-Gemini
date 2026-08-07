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
     * Helper to format/truncate text values for telemetry.
     * If maxChars is 0, null, or undefined, full untruncated text is preserved.
     */
    static safeTruncateText(text, maxChars = 0) {
        if (!text || typeof text !== 'string') return text;
        if (!maxChars || maxChars <= 0) return text; // 0 = unlimited / untruncated
        if (text.length <= maxChars) return text;
        return text.slice(0, maxChars) + `... [truncated ${text.length} chars total]`;
    }

    /**
     * Splits long text (e.g. 30k+ chars) into an array of 1,000-character string chunks.
     * Bypasses Amplitude's 1,024-character single-string limit while preserving 100% full untruncated text!
     */
    static chunkTextToArray(text, chunkSize = 1000) {
        if (!text || typeof text !== 'string') return [];
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Track event to Amplitude
     */
    static async trackEvent(name, params = {}) {
        // Read text logging max length from merged remote config (0 = full untruncated text via chunking array)
        const config = await RemoteConfigManager.getConfig();
        const maxTextLen = config.max_text_length ?? 0; // 0 = untruncated by default

        if (params.quoted_text) {
            if (maxTextLen > 0) {
                params.quoted_text = this.safeTruncateText(params.quoted_text, maxTextLen);
            } else if (params.quoted_text.length > 1000) {
                params.quoted_chunks = this.chunkTextToArray(params.quoted_text, 1000);
                params.quoted_text = params.quoted_text.slice(0, 1000) + '... [see quoted_chunks array for full text]';
            }
        }

        if (params.pasted_text) {
            if (maxTextLen > 0) {
                params.pasted_text = this.safeTruncateText(params.pasted_text, maxTextLen);
            } else if (params.pasted_text.length > 1000) {
                params.pasted_chunks = this.chunkTextToArray(params.pasted_text, 1000);
                params.pasted_text = params.pasted_text.slice(0, 1000) + '... [see pasted_chunks array for full text]';
            }
        }

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
 * RemoteConfigManager - Manages dynamic remote configuration for Ask Gemini.
 * Fetches JSON payload from remote URL (e.g. GitHub Gist or CDN endpoint),
 * merges over DEFAULT_CONFIG, caches in chrome.storage.local, and updates tabs.
 */
class RemoteConfigManager {
    static CONFIG_URL_KEY = 'ag_remote_config_url';
    static CONFIG_STORAGE_KEY = 'ag_remote_config';
    static DEFAULT_GIST_URL = 'https://gist.githubusercontent.com/BHasFallen/fcb206ffdca44bd3e5d2099de4c81636/raw/remote_config.json';

    static DEFAULT_CONFIG = {
        version: "1.0.0",
        flags: {
            smart_paste_enabled: true,
            paste_analytics_enabled: true,
            quota_scraper_enabled: true,
            toc_enabled: true,
            rating_prompt_enabled: true,
            feature_banner_enabled: true
        },
        smart_paste: {
            trigger_threshold_chars: 20000,
            enabled_types: [
                "json",
                "csv",
                "html",
                "javascript",
                "python",
                "markdown",
                "plaintext"
            ],
            log_pasted_text: false
        },
        quote_reply: {
            log_quoted_text: false
        },
        rating: {
            initial_active_days: 3,
            initial_reply_count: 3,
            post_update_buffer: 5,
            cooldown_active_days: 7,
            cooldown_reply_count: 10,
            review_url: "https://chromewebstore.google.com/detail/jhkodgigeemnmdmdikdkpcbmgbbopgni/reviews",
            feedback_form_url: "https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform"
        },
        feature_banner: {
            active: true,
            id: "multi_quote_v1",
            title: "New: Quote multiple excerpts",
            description: "Highlight text, then keep highlighting more — look for the '+ Add Quote' button to build a multi-quote reply.",
            primary_text: "Try it",
            secondary_text: "Later",
            cta_action: "start_tour"
        }
    };

    static async getConfig() {
        try {
            const res = await chrome.storage.local.get([this.CONFIG_STORAGE_KEY]);
            const cached = res[this.CONFIG_STORAGE_KEY];
            if (!cached) return this.DEFAULT_CONFIG;

            const deviceId = await AmplitudeWizard.getDeviceId();
            const emailRes = await chrome.storage.local.get(['user_email']);
            const userEmail = emailRes.user_email || null;

            const overrides = cached.user_overrides || {};
            const userOverride = overrides[deviceId] || (userEmail ? overrides[userEmail] : null) || {};

            return {
                ...this.DEFAULT_CONFIG,
                ...cached,
                ...userOverride,
                flags: { ...this.DEFAULT_CONFIG.flags, ...(cached.flags || {}), ...(userOverride.flags || {}) },
                smart_paste: { ...this.DEFAULT_CONFIG.smart_paste, ...(cached.smart_paste || {}), ...(userOverride.smart_paste || {}) },
                quote_reply: { ...this.DEFAULT_CONFIG.quote_reply, ...(cached.quote_reply || {}), ...(userOverride.quote_reply || {}) },
                rating: { ...this.DEFAULT_CONFIG.rating, ...(cached.rating || {}), ...(userOverride.rating || {}) },
                feature_banner: { ...this.DEFAULT_CONFIG.feature_banner, ...(cached.feature_banner || {}), ...(userOverride.feature_banner || {}) }
            };
        } catch (e) {
            return this.DEFAULT_CONFIG;
        }
    }

    static async fetchRemoteConfig() {
        try {
            const urlRes = await chrome.storage.local.get([this.CONFIG_URL_KEY]);
            const targetUrl = urlRes[this.CONFIG_URL_KEY] || this.DEFAULT_GIST_URL;
            const cacheBusterUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

            const response = await fetch(cacheBusterUrl, { cache: 'no-cache' });
            if (!response.ok) {
                console.warn(`[RemoteConfig] Fetch HTTP error: ${response.status}`);
                return await this.getConfig();
            }

            const fetched = await response.json();
            if (typeof fetched !== 'object' || !fetched) return await this.getConfig();

            const deviceId = await AmplitudeWizard.getDeviceId();
            const emailRes = await chrome.storage.local.get(['user_email']);
            const userEmail = emailRes.user_email || null;

            const overrides = fetched.user_overrides || {};
            const userOverride = overrides[deviceId] || (userEmail ? overrides[userEmail] : null) || {};

            const merged = {
                ...this.DEFAULT_CONFIG,
                ...fetched,
                ...userOverride,
                flags: { ...this.DEFAULT_CONFIG.flags, ...(fetched.flags || {}), ...(userOverride.flags || {}) },
                smart_paste: { ...this.DEFAULT_CONFIG.smart_paste, ...(fetched.smart_paste || {}), ...(userOverride.smart_paste || {}) },
                quote_reply: { ...this.DEFAULT_CONFIG.quote_reply, ...(fetched.quote_reply || {}), ...(userOverride.quote_reply || {}) },
                rating: { ...this.DEFAULT_CONFIG.rating, ...(fetched.rating || {}), ...(userOverride.rating || {}) },
                feature_banner: { ...this.DEFAULT_CONFIG.feature_banner, ...(fetched.feature_banner || {}), ...(userOverride.feature_banner || {}) },
                last_fetched_at: Date.now()
            };

            await chrome.storage.local.set({ [this.CONFIG_STORAGE_KEY]: merged });
            logBackgroundEvent('REMOTE_CONFIG_UPDATED', { version: merged.version });

            // Broadcast to active Gemini tabs
            try {
                const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
                tabs.forEach(t => {
                    chrome.tabs.sendMessage(t.id, { type: 'REMOTE_CONFIG_UPDATED', config: merged }, () => {
                        if (chrome.runtime.lastError) {}
                    });
                });
            } catch (err) {}

            return merged;
        } catch (e) {
            console.error('[RemoteConfig] Remote fetch failed:', e);
            return await this.getConfig();
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

        // 1. Track Active Days
        if (state.lastDayActive !== now) {
            state.activeDays = (state.activeDays || 0) + 1;
            state.lastDayActive = now;
        }

        // 2. Increment Lifetime Counters
        if (eventName === 'context_reply_sent') {
            state.replyCount = (state.replyCount || 0) + 1;
            state.totalWords = (state.totalWords || 0) + (params.word_count || 0);
            if (state.isExistingUser) {
                state.postUpdateHighlights = (state.postUpdateHighlights || 0) + 1; // Increment reply counter after update
            }
        }

        await RatingManager.setState(state);
        
        // 3. Evaluate Trigger
        this.evaluateTrigger(state);
    }

    /**
     * Core business logic to determine if the prompt should show
     */
    static async evaluateTrigger(state) {
        const config = await RemoteConfigManager.getConfig();
        const flags = config.flags || {};
        const ratingCfg = config.rating || {};

        // Respect rating_prompt_enabled kill switch
        if (flags.rating_prompt_enabled === false) return;

        // Rule: Never show if already rated
        if (state.ratingStatus === 'rated') return;

        // Rule: Update Bombardment Buffer
        const updateBuffer = ratingCfg.post_update_buffer ?? 5;
        if (state.isExistingUser && state.postUpdateHighlights < updateBuffer) return;

        // Rule: Redemption Arc check is handled in onInstalled, 
        // here we just check if status is feedback_given (and not reset)
        if (state.ratingStatus === 'feedback_given') return;

        const reqDays = ratingCfg.initial_active_days ?? 3;
        const reqReplies = ratingCfg.initial_reply_count ?? 3;
        const timeCriteria = state.activeDays >= reqDays;
        const valueCriteria = state.replyCount >= reqReplies;

        // Rule: Initial Trigger Thresholds
        if (state.ratingStatus === null) {
            if (timeCriteria && valueCriteria) {
                this.triggerUI();
            }
        } 
        // Rule: Cooldown Phase (Second and Final Time)
        else if (state.ratingStatus === 'dismissed') {
            const cooldownDays = ratingCfg.cooldown_active_days ?? 7;
            const cooldownReplies = ratingCfg.cooldown_reply_count ?? 10;
            const daysSinceDismissal = state.activeDays >= (state.dismissedAtActiveDay + cooldownDays);
            const repliesSinceDismissal = state.replyCount >= (state.dismissedAtHighlightCount + cooldownReplies);
            
            if (daysSinceDismissal && repliesSinceDismissal) {
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
            state.dismissedAtHighlightCount = state.replyCount; // Save replyCount here
        }

        await this.setState(state);
        logBackgroundEvent('RATING_STATUS_UPDATED', { status });

        // Track in Amplitude
        AmplitudeWizard.trackEvent('rating_interaction', {
            status: status,
            activeDays: state.activeDays,
            replyCount: state.replyCount
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

            case 'GET_REMOTE_CONFIG':
                RemoteConfigManager.getConfig().then(config => {
                    sendResponse({ success: true, config });
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                break;

            case 'FORCE_FETCH_REMOTE_CONFIG':
                RemoteConfigManager.fetchRemoteConfig().then(config => {
                    sendResponse({ success: true, config });
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                break;

            case 'GET_DEVICE_ID':
                AmplitudeWizard.getDeviceId().then(deviceId => {
                    sendResponse({ success: true, deviceId });
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
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

    return true; // CRITICAL for async sendResponse in Chrome Extension MV3
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
        RemoteConfigManager.fetchRemoteConfig().catch(console.error);
    }
});

/**
 * Periodic cleanup of old logs (every hour)
 */
chrome.alarms.create('logCleanup', { periodInMinutes: 60 });

// Periodically check usage limits (every 10 minutes)
chrome.alarms.create('quotaLimitsCheck', { periodInMinutes: 10 });

/**
 * PasteStatsManager - Handles daily flush of anonymous paste analytics.
 * Reads the accumulator written by accumulatePasteStat() in smart-paste.js,
 * sends a single Amplitude event once per calendar day, then resets.
 * CRITICAL: Never reads or logs any paste content — only integer counts/lengths.
 */
class PasteStatsManager {
    static STORAGE_KEY = 'ag_paste_stats_daily';
    static FLUSH_DATE_KEY = 'ag_paste_stats_last_flush';

    static async flushIfNeeded() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await chrome.storage.local.get([
                this.STORAGE_KEY,
                this.FLUSH_DATE_KEY
            ]);

            const lastFlush = res[this.FLUSH_DATE_KEY];
            const data = res[this.STORAGE_KEY];

            // Only flush once per calendar day
            if (lastFlush === today) return;

            // Nothing accumulated yet — just update the flush date
            if (!data || !data.stats) {
                await chrome.storage.local.set({ [this.FLUSH_DATE_KEY]: today });
                return;
            }

            // Calculate total pastes across all types
            const total_pastes_today = Object.values(data.stats)
                .reduce((sum, t) => sum + (t.count || 0), 0);

            // Only send if at least one paste happened
            if (total_pastes_today > 0) {
                await AmplitudeWizard.trackEvent('paste_stats_daily', {
                    ...data.stats,
                    total_pastes_today,
                    date: data.last_flush_date || today
                });
                logBackgroundEvent('PASTE_STATS_FLUSHED', { total_pastes_today });
            }

            // Reset accumulator for the new day
            const TYPES = ['json', 'csv', 'html', 'javascript', 'python', 'markdown', 'plaintext'];
            const emptyStats = {};
            TYPES.forEach(t => { emptyStats[t] = { count: 0, lengths: [] }; });
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: { last_flush_date: today, stats: emptyStats },
                [this.FLUSH_DATE_KEY]: today
            });
        } catch (err) {
            console.error('PasteStatsManager: flush error', err);
        }
    }

    /**
     * forceFlush() — Developer testing tool.
     * Bypasses the daily date guard and Amplitude dev-mode suppression.
     * Sends event as 'test_paste_stats_daily' so test data is clearly
     * separated from real production events in the Amplitude dashboard.
     * Does NOT reset the accumulator so you can call it multiple times.
     */
    static async forceFlush() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await chrome.storage.local.get([this.STORAGE_KEY]);
            const data = res[this.STORAGE_KEY];

            const total_pastes_today = data?.stats
                ? Object.values(data.stats).reduce((sum, t) => sum + (t.count || 0), 0)
                : 0;

            const payload = {
                ...(data?.stats || {}),
                total_pastes_today,
                date: today,
                _test: true
            };

            console.log('🧪 [PasteStatsManager] forceFlush payload:', JSON.stringify(payload, null, 2));

            // Send directly to Amplitude bypassing the unpacked/dev-mode guard
            const deviceId = await AmplitudeWizard.getDeviceId();
            const version = chrome.runtime.getManifest().version;
            const eventBody = {
                api_key: AmplitudeWizard.API_KEY,
                events: [{
                    device_id: deviceId,
                    event_type: 'test_paste_stats_daily',
                    event_properties: payload,
                    time: Date.now(),
                    insert_id: AmplitudeWizard.generateInsertId(),
                    platform: 'Chrome Extension',
                    os_name: 'Chrome',
                    app_version: version
                }]
            };

            const response = await fetch(AmplitudeWizard.ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventBody)
            });

            if (response.ok) {
                console.log('🧪 [PasteStatsManager] ✅ test_paste_stats_daily sent to Amplitude!');
            } else {
                console.warn('🧪 [PasteStatsManager] ❌ Amplitude error:', response.status);
            }
        } catch (err) {
            console.error('PasteStatsManager: forceFlush error', err);
        }
    }
}


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
        // Piggyback paste stats daily flush and remote config refresh on hourly alarm
        PasteStatsManager.flushIfNeeded();
        RemoteConfigManager.fetchRemoteConfig().catch(console.error);
    } else if (alarm.name === 'quotaLimitsCheck') {
        // Respect quota_scraper_enabled flag
        RemoteConfigManager.getConfig().then(cfg => {
            if (cfg.flags.quota_scraper_enabled !== false) {
                QuotaManager.fetchUsageLimits().catch(console.error);
            }
        });
    }
});



// Trigger initial quota fetch, paste stats check, and remote config fetch on startup
chrome.runtime.onStartup.addListener(() => {
    logBackgroundEvent('EXTENSION_STARTUP');
    RemoteConfigManager.fetchRemoteConfig().catch(console.error);
    PasteStatsManager.flushIfNeeded();
});

// Also trigger on install/load
chrome.runtime.onInstalled.addListener(() => {
    RemoteConfigManager.fetchRemoteConfig().catch(console.error);
    PasteStatsManager.flushIfNeeded();
});


// Log that background script has initialized
logBackgroundEvent('BACKGROUND_INITIALIZED', {
    version: chrome.runtime.getManifest().version
});

console.log('🏰 Fortress Framework Background Service Worker initialized');

// Expose to console for testing
self.RatingManager = RatingManager;
self.QuotaManager = QuotaManager;
self.PasteStatsManager = PasteStatsManager;
self.RemoteConfigManager = RemoteConfigManager;

