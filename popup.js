/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                       FORTRESS FRAMEWORK v1.0                              ║
 * ║                  Popup Controller - Modern UI Redesign                    ║
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

class PopupController {
    constructor() {
        this.versionBadge = document.getElementById('version-badge');
        this.reportProblemLink = document.getElementById('report-problem');
        this.timeSavedEl = document.getElementById('time-saved');
        this.wordsAnalyzedEl = document.getElementById('words-analyzed');

        // Form & switch controls
        this.switchMq = document.getElementById('switch-mq');
        this.subRowMqStyle = document.getElementById('sub-row-mq-style');
        this.switchToc = document.getElementById('switch-toc');
        this.switchLimits = document.getElementById('switch-limits');

        // Segmented options
        this.btnToggleCompact = document.getElementById('toggle-compact');
        this.btnToggleExpanded = document.getElementById('toggle-expanded');
        this.btnSpAuto = document.getElementById('toggle-sp-auto');
        this.btnSpAsk = document.getElementById('toggle-sp-ask');
        this.btnSpOff = document.getElementById('toggle-sp-off');

        // Accordion & CTA
        this.toggleGuideBtn = document.getElementById('toggle-guide-btn');
        this.guideBody = document.getElementById('guide-body');
        this.rateBtn = document.getElementById('rate-extension-btn');
        this.openGeminiLink = document.getElementById('open-gemini-link');

        this.currentSettings = {
            multi_quote_display: 'compact',
            usage_limits_enabled: true,
            multi_quote_enabled: true,
            smart_paste_behavior: 'auto',
            toc_enabled: true
        };

        this.init();
    }

    async init() {
        this.loadVersion();
        this.loadStats();
        await this.loadSettings();
        this.setupEventListeners();

        // Track Popup View
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ 
                type: 'TRACK_EVENT', 
                name: 'popup_view' 
            });
        }
    }

    loadVersion() {
        try {
            const manifest = chrome.runtime.getManifest();
            if (this.versionBadge) {
                this.versionBadge.textContent = `v${manifest.version}`;
            }
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

            // Refined Math Logic:
            // (1 minute per 100 words processed + 1 minute per AI reply)
            const timeSavedInMinutes = Math.round((totalWords / 100) + (replyCount * 1.0));
            const wordsAnalyzed = totalWords;

            // Formatting Rules
            let timeStr = `${timeSavedInMinutes} mins`;
            if (timeSavedInMinutes >= 60) {
                timeStr = `${(timeSavedInMinutes / 60).toFixed(1)} hrs`;
            }

            let wordsStr = `${wordsAnalyzed} words`;
            if (wordsAnalyzed >= 1000) {
                wordsStr = `${(wordsAnalyzed / 1000).toFixed(1)}k words`;
            }

            if (this.timeSavedEl) this.timeSavedEl.textContent = timeStr;
            if (this.wordsAnalyzedEl) this.wordsAnalyzedEl.textContent = wordsStr;
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async loadSettings() {
        try {
            const res = await chrome.storage.local.get([
                'multi_quote_display',
                'usage_limits_enabled',
                'multi_quote_enabled',
                'smart_paste_behavior',
                'toc_enabled'
            ]);

            const display = res.multi_quote_display || 'compact';
            const limits = res.usage_limits_enabled !== false;
            const mq = res.multi_quote_enabled !== false;
            const sp = res.smart_paste_behavior || 'auto';
            const toc = res.toc_enabled !== false;

            this.applyMqToggleState(mq);
            this.applyToggleState(display);
            this.applySpToggleState(sp);
            this.applyTocToggleState(toc);
            this.applyLimitsToggleState(limits);

            this.currentSettings = {
                multi_quote_display: display,
                usage_limits_enabled: limits,
                multi_quote_enabled: mq,
                smart_paste_behavior: sp,
                toc_enabled: toc
            };
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    applyMqToggleState(enabled) {
        if (this.switchMq) this.switchMq.checked = enabled;
        if (this.subRowMqStyle) {
            this.subRowMqStyle.classList.toggle('disabled', !enabled);
        }
    }

    applyToggleState(value) {
        if (this.btnToggleExpanded) this.btnToggleExpanded.classList.toggle('active', value === 'expanded');
        if (this.btnToggleCompact) this.btnToggleCompact.classList.toggle('active', value === 'compact');
    }

    applyLimitsToggleState(enabled) {
        if (this.switchLimits) this.switchLimits.checked = enabled;
    }

    applySpToggleState(behavior) {
        if (this.btnSpAuto) this.btnSpAuto.classList.toggle('active', behavior === 'auto');
        if (this.btnSpAsk) this.btnSpAsk.classList.toggle('active', behavior === 'ask');
        if (this.btnSpOff) this.btnSpOff.classList.toggle('active', behavior === 'off');
    }

    applyTocToggleState(enabled) {
        if (this.switchToc) this.switchToc.checked = enabled;
    }

    async saveSetting({ storageKey, settingName, featureName, newValue, extraStorage = {} }) {
        try {
            const previousValue = this.currentSettings ? this.currentSettings[storageKey] : undefined;
            if (previousValue === newValue) return;

            if (this.currentSettings) {
                this.currentSettings[storageKey] = newValue;
            }

            await chrome.storage.local.set({ [storageKey]: newValue, ...extraStorage });

            // Streamlined settings_changed Amplitude event
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ 
                    type: 'TRACK_EVENT', 
                    name: 'settings_changed',
                    params: {
                        setting_name: settingName,
                        feature_name: featureName,
                        new_value: newValue,
                        previous_value: previousValue,
                        value: newValue
                    }
                });
            }
        } catch (e) {
            console.error('Failed to save setting:', e);
        }
    }

    async saveMultiQuoteState(enabled) {
        this.applyMqToggleState(enabled);
        await this.saveSetting({
            storageKey: 'multi_quote_enabled',
            settingName: 'multi_quote_enabled',
            featureName: 'multi_quote',
            newValue: enabled
        });
    }

    async saveMultiQuoteStyle(value) {
        this.applyToggleState(value);
        await this.saveSetting({
            storageKey: 'multi_quote_display',
            settingName: 'multi_quote_display',
            featureName: 'multi_quote_style',
            newValue: value
        });
    }

    async saveUsageLimitsState(enabled) {
        this.applyLimitsToggleState(enabled);
        await this.saveSetting({
            storageKey: 'usage_limits_enabled',
            settingName: 'usage_limits_enabled',
            featureName: 'usage_limits',
            newValue: enabled
        });
    }

    async saveSmartPasteBehavior(behavior) {
        this.applySpToggleState(behavior);
        await this.saveSetting({
            storageKey: 'smart_paste_behavior',
            settingName: 'smart_paste_behavior',
            featureName: 'smart_paste',
            newValue: behavior,
            extraStorage: {
                smart_paste_enabled: behavior !== 'off',
                smart_paste_preference_explicitly_set: true
            }
        });
    }

    async saveTocState(enabled) {
        this.applyTocToggleState(enabled);
        await this.saveSetting({
            storageKey: 'toc_enabled',
            settingName: 'toc_enabled',
            featureName: 'toc',
            newValue: enabled
        });
    }

    setupEventListeners() {
        // Report Problem Link
        if (this.reportProblemLink) {
            this.reportProblemLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.reportProblem();
            });
        }

        // Open Gemini Link
        if (this.openGeminiLink) {
            this.openGeminiLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: 'https://gemini.google.com' });
            });
        }

        // Feature Switches
        if (this.switchMq) {
            this.switchMq.addEventListener('change', () => this.saveMultiQuoteState(this.switchMq.checked));
        }

        if (this.switchToc) {
            this.switchToc.addEventListener('change', () => this.saveTocState(this.switchToc.checked));
        }

        if (this.switchLimits) {
            this.switchLimits.addEventListener('change', () => this.saveUsageLimitsState(this.switchLimits.checked));
        }

        // Multi-Quote Style Segmented Buttons
        if (this.btnToggleCompact) {
            this.btnToggleCompact.addEventListener('click', () => this.saveMultiQuoteStyle('compact'));
        }
        if (this.btnToggleExpanded) {
            this.btnToggleExpanded.addEventListener('click', () => this.saveMultiQuoteStyle('expanded'));
        }

        // Smart Paste Segmented Buttons
        if (this.btnSpAuto) {
            this.btnSpAuto.addEventListener('click', () => this.saveSmartPasteBehavior('auto'));
        }
        if (this.btnSpAsk) {
            this.btnSpAsk.addEventListener('click', () => this.saveSmartPasteBehavior('ask'));
        }
        if (this.btnSpOff) {
            this.btnSpOff.addEventListener('click', () => this.saveSmartPasteBehavior('off'));
        }

        // How to Use Accordion
        if (this.toggleGuideBtn && this.guideBody) {
            this.toggleGuideBtn.addEventListener('click', () => {
                const isOpen = this.guideBody.classList.toggle('open');
                this.toggleGuideBtn.classList.toggle('open', isOpen);
                this.toggleGuideBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        }

        // Rate Extension Button
        if (this.rateBtn) {
            this.rateBtn.addEventListener('click', () => {
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
            chrome.runtime.sendMessage({ 
                type: 'TRACK_EVENT', 
                name: 'popup_report_problem_click' 
            });

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
