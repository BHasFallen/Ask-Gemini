/**
 * Powerbox for Gemini - background.js
 * Consolidated background service worker handling:
 * 1. Amplitude Analytics
 * 2. Quota scraping & Alarm scheduler
 * 3. Rating prompting lifecycle
 * 4. Message Broker (PDF preview open, settings get/set)
 */
'use strict';

// ── SECTION 1: AMPLITUDE ANALYTICS ────────────────────────────────────────────
class AmplitudeWizard {
    static API_KEY = '5db731c3bfdbdb54e8e50b7b629b1be8';
    static ENDPOINT = 'https://api2.amplitude.com/2/httpapi';

    static generateInsertId() {
        return `pb_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    static async getDeviceId() {
        const res = await chrome.storage.local.get(['device_id']);
        if (res.device_id) return res.device_id;
        const newId = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await chrome.storage.local.set({ device_id: newId });
        return newId;
    }

    static async trackEvent(name, params = {}) {
        const now = Date.now();
        const deviceId = await this.getDeviceId();
        const version = chrome.runtime.getManifest().version;
        
        const storageResult = await chrome.storage.local.get(['user_email', 'user_name', 'quota_limits']);
        const userId = storageResult.user_email || null;
        const userName = storageResult.user_name || null;
        const quotaLimits = storageResult.quota_limits || null;
        
        const event = {
            device_id: deviceId,
            event_type: name,
            event_properties: params,
            time: now,
            insert_id: this.generateInsertId(),
            session_id: logManager.startTime,
            platform: 'Chrome Extension',
            os_name: 'Chrome',
            app_version: version,
            user_properties: {
                $set: {
                    version: version,
                    name: userName,
                    is_pro_user: quotaLimits?.isProUser ?? null,
                    gemini_tier: quotaLimits?.userTier ?? null
                }
            }
        };

        if (userId) {
            event.user_id = userId;
        }

        // Suppress if developer/unpacked or explicitly disabled
        const isUnpacked = !('update_url' in chrome.runtime.getManifest());
        if (isUnpacked) {
            console.log(`⚡ [Amplitude] [Dev Suppressed] Event: ${name}`, event);
            return;
        }

        const settings = await chrome.storage.local.get(['disableTelemetry', 'developerMode']);
        if (settings.disableTelemetry || settings.developerMode) {
            console.log(`⚡ [Amplitude] [Telemetry Blocked] Event: ${name}`, event);
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
                console.log(`⚡ [Amplitude] Event Tracked: ${name}`, params);
            }
        } catch (error) {
            console.error('⚡ [Amplitude] Network Error:', error);
        }
    }
}

// ── SECTION 2: QUOTA MANAGER ─────────────────────────────────────────────────
class QuotaManager {
    static atToken = null;

    static async getAtToken() {
        try {
            const cookies = await chrome.cookies.getAll({ domain: 'gemini.google.com', name: 'SNlM0e' });
            if (cookies && cookies.length > 0) {
                return cookies[0].value;
            }
            // Scrape backup via active page fetch
            const response = await fetch('https://gemini.google.com/app', { credentials: 'include' });
            if (!response.ok) return null;
            const html = await response.text();
            const match = html.match(/"SNlM0e"\s*:\s*"(.*?)"/);
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
                        } catch (e) {}
                    }
                }
                if (innerData) break;
            }

            if (!innerData) {
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
            if (!this.atToken) return null;

            const body = new URLSearchParams();
            body.append('f.req', '[[["jSf9Qc","[]",null,"generic"]]]');
            body.append('at', this.atToken);

            let response = await fetch('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jSf9Qc&source-path=%2Fusage', {
                method: 'POST',
                body: body,
                credentials: 'include'
            });

            if (!response.ok) {
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

            if (!response.ok) return null;

            const text = await response.text();
            const limits = this.parseQuotaResponse(text);
            if (!limits) return null;

            await chrome.storage.local.set({ quota_limits: limits, last_quota_check: Date.now() });

            // Broadcast to active Gemini tabs
            try {
                const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
                tabs.forEach(t => {
                    chrome.tabs.sendMessage(t.id, { type: 'USAGE_LIMITS_UPDATED', limits }, () => {
                        if (chrome.runtime.lastError) {}
                    });
                });
            } catch (err) {}

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

// ── SECTION 3: RATING MANAGER ─────────────────────────────────────────────────
class RatingManager {
    static DEFAULTS = {
        activeDays: 0,
        highlightCount: 0,
        replyCount: 0,
        totalWords: 0,
        isExistingUser: false,
        postUpdateHighlights: 0,
        ratingStatus: null,
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

    static async recordEvent(eventName, params = {}) {
        const state = await this.getState();
        const now = new Date().toISOString().split('T')[0];

        if (state.lastDayActive !== now) {
            state.activeDays += 1;
            state.lastDayActive = now;
        }

        if (eventName === 'text_highlight') {
            state.highlightCount += 1;
            state.totalWords = (state.totalWords || 0) + (params.word_count || 0);
            if (state.isExistingUser) {
                state.postUpdateHighlights += 1;
            }
        } else if (eventName === 'context_reply_sent') {
            state.replyCount += 1;
        }

        await this.setState(state);
        this.evaluateTrigger(state);
    }

    static async evaluateTrigger(state) {
        if (state.ratingStatus === 'rated') return;
        if (state.isExistingUser && state.postUpdateHighlights < 5) return;
        if (state.ratingStatus === 'feedback_given') return;

        const timeCriteria = state.activeDays >= 3;
        const valueCriteria = state.highlightCount >= 15 || state.replyCount >= 3;

        if (state.ratingStatus === null) {
            if (timeCriteria && valueCriteria) {
                this.triggerUI();
            }
        } else if (state.ratingStatus === 'dismissed') {
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
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RATING_PROMPT' }, () => {
                    if (chrome.runtime.lastError) {}
                });
            });
            AmplitudeWizard.trackEvent('rating_prompt_shown', {
                version: chrome.runtime.getManifest().version
            });
        } catch (error) {
            console.error('Trigger UI Error:', error);
        }
    }

    static async setStatus(status) {
        const state = await this.getState();
        state.ratingStatus = status;
        state.lastPromptVersion = chrome.runtime.getManifest().version;

        if (status === 'dismissed') {
            state.dismissedAtActiveDay = state.activeDays;
            state.dismissedAtHighlightCount = state.highlightCount;
        }

        await this.setState(state);
        
        AmplitudeWizard.trackEvent('rating_interaction', {
            status: status,
            activeDays: state.activeDays,
            highlightCount: state.highlightCount
        });
    }
}

// ── SECTION 4: SYSTEM LOG MANAGER ─────────────────────────────────────────────
class LocalLogManager {
    constructor() {
        this.startTime = Date.now();
        this.logs = [];
    }
}
const logManager = new LocalLogManager();

// ── SECTION 5: MESSAGE BROKER ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case 'TRACK_EVENT':
                AmplitudeWizard.trackEvent(message.name, message.params);
                sendResponse({ success: true });
                break;

            case 'RECORD_RATING_EVENT':
                RatingManager.recordEvent(message.name, message.params);
                sendResponse({ success: true });
                break;

            case 'UPDATE_RATING_STATUS':
                RatingManager.setStatus(message.status);
                sendResponse({ success: true });
                break;

            case 'GET_USAGE_LIMITS':
                QuotaManager.getCachedLimits().then(limits => {
                    sendResponse({ limits });
                }).catch(err => {
                    console.error('Quota fetch error:', err);
                    sendResponse({ limits: null });
                });
                return true; // Keep response channel open

            case 'OPEN_PDF_PREVIEW':
                const key = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                chrome.storage.local.set({ [key]: { data: message.data } }, () => {
                    chrome.tabs.create({ url: chrome.runtime.getURL(`pdf_preview.html?key=${key}`) });
                    sendResponse({ success: true });
                });
                return true;

            case 'OPEN_REVIEW_PAGE':
                const reviewUrl = 'https://chromewebstore.google.com/detail/jhkodgigeemnmdmdikdkpcbmgbbopgni/reviews';
                chrome.tabs.create({ url: reviewUrl, active: true });
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }
    } catch (err) {
        console.error('Message handling error:', err);
        sendResponse({ error: err.message });
    }
});

// Alarms Scheduler
chrome.alarms.create('quotaLimitsCheck', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'quotaLimitsCheck') {
        QuotaManager.fetchUsageLimits().catch(console.error);
    }
});

// Startup & Install Listeners
chrome.runtime.onStartup.addListener(() => {
    QuotaManager.fetchUsageLimits().catch(console.error);
});

chrome.runtime.onInstalled.addListener(async (details) => {
    QuotaManager.fetchUsageLimits().catch(console.error);

    const state = await RatingManager.getState();
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        state.isExistingUser = false;
        AmplitudeWizard.trackEvent('extension_installed', { version: chrome.runtime.getManifest().version });
    } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        const oldVersion = details.previousVersion || '0.0.0';
        const oldMajor = parseInt(oldVersion.split('.')[0]);
        const newMajor = parseInt(chrome.runtime.getManifest().version.split('.')[0]);
        
        state.isExistingUser = true;
        state.postUpdateHighlights = 0;

        if (newMajor > oldMajor && state.ratingStatus === 'feedback_given') {
            state.ratingStatus = null; // Redemption trigger
        }
        AmplitudeWizard.trackEvent('extension_updated', {
            version: chrome.runtime.getManifest().version,
            previousVersion: oldVersion
        });
    }
    await RatingManager.setState(state);

    // Set Uninstall URL with device_id
    const deviceId = await AmplitudeWizard.getDeviceId();
    AmplitudeWizard.trackEvent('uninstall_initiated', { version: chrome.runtime.getManifest().version, device_id: deviceId });
    const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform';
    const uninstallUrl = `${feedbackFormUrl}?entry.648517234=${deviceId}&device_id=${deviceId}`;
    chrome.runtime.setUninstallURL(uninstallUrl);

    // Onboarding routing
    const isUnpacked = !('update_url' in chrome.runtime.getManifest());
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL || isUnpacked) {
        await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html?reason=install') });
    } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html?reason=update') });
    }

    // Default settings init
    const result = await chrome.storage.local.get(['developerMode', 'powerbox_settings']);
    if (result.developerMode === undefined) {
        await chrome.storage.local.set({ developerMode: false });
    }
    if (result.powerbox_settings === undefined) {
        await chrome.storage.local.set({
            powerbox_settings: {
                quote_reply_enabled: true,
                usage_tracker_enabled: true,
                pdf_exporter_enabled: true
            }
        });
    }
});
