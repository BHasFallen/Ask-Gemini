/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                       FORTRESS FRAMEWORK v1.0                              ║
 * ║           Observability • Resilience • Telemetry                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * 
 * Ask Gemini: Contextual Replies - Content Script
 * Enterprise-grade error handling, monitoring, and diagnostics
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: TELEMETRY ENGINE (Diagnostics Module)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BufferedLogger - Maintains circular buffer of last 50 events
 */
class BufferedLogger {
    constructor(maxSize = 50) {
        this.buffer = [];
        this.maxSize = maxSize;
    }

    add(event) {
        if (this.buffer.length >= this.maxSize) {
            this.buffer.shift();
        }
        this.buffer.push(event);
    }

    getAll() {
        return [...this.buffer];
    }

    clear() {
        this.buffer = [];
    }

    getLast(count = 10) {
        return this.buffer.slice(-count);
    }
}

/**
 * Diagnostics - Centralized Telemetry Engine
 * Every action generates a log with timestamp, sessionID, and context
 */
class Diagnostics {
    static sessionId = Diagnostics.generateSessionId();
    static logger = new BufferedLogger(50);
    static startTime = performance.now();
    static errorCount = 0;
    static retryCount = 0;
    static perfIssueCount = 0;

    static generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Core logging method - all events flow through here
     */
    static log(eventType, context = {}, level = 'INFO') {
        const event = {
            timestamp: new Date().toISOString(),
            performanceTime: performance.now() - this.startTime,
            sessionId: this.sessionId,
            eventType,
            level,
            context: {
                url: window.location.href,
                ...context
            }
        };

        this.logger.add(event);

        // Sync with background script
        this.syncToBackground(event);

        // Console output for development
        const prefix = `[Fortress/${level}]`;
        const logContent = [prefix, eventType];
        
        // If context has keys, add it to the console log for expansion
        if (Object.keys(context).length > 0) {
            logContent.push(context);
        }

        if (level === 'ERROR' || level === 'CRITICAL') {
            console.error(...logContent);
        } else if (level === 'WARN') {
            console.warn(...logContent);
        } else {
            console.log(...logContent);
        }

        return event;
    }

    /**
     * Log user actions (button clicks, selections, etc.)
     */
    static logAction(action, details = {}) {
        return this.log('USER_ACTION', {
            action,
            ...details
        });
    }

    /**
     * Log DOM operations (scraping, injection, etc.)
     */
    static logDom(operation, details = {}) {
        return this.log('DOM_OPERATION', {
            operation,
            domNodeCount: document.getElementsByTagName('*').length,
            ...details
        });
    }

    /**
     * Log errors with stack traces - NO SILENT FAILURES
     */
    static logError(error, context = {}) {
        this.errorCount++;
        return this.log('ERROR', {
            message: error.message || String(error),
            stack: error.stack || 'No stack trace available',
            errorCount: this.errorCount,
            ...context
        }, 'ERROR');
    }

    /**
     * Log retry events
     */
    static logRetry(operation, attempt, maxAttempts, reason = '') {
        this.retryCount++;
        return this.log('RETRY_EVENT', {
            operation,
            attempt,
            maxAttempts,
            reason,
            totalRetries: this.retryCount
        }, 'WARN');
    }

    /**
     * Log critical failures
     */
    static logCritical(operation, details = {}) {
        return this.log('CRITICAL_FAILURE', {
            operation,
            ...details
        }, 'CRITICAL');
    }

    /**
     * Log performance issues
     */
    static logPerfIssue(operation, latencyMs, threshold, details = {}) {
        this.perfIssueCount++;
        return this.log('PERF_ISSUE', {
            operation,
            latencyMs,
            threshold,
            domNodeCount: document.getElementsByTagName('*').length,
            perfIssueCount: this.perfIssueCount,
            ...details
        }, 'WARN');
    }

    /**
     * Log heartbeat recovery events
     */
    static logHeartbeatRecovery(observerName, details = {}) {
        return this.log('HEARTBEAT_RECOVERY', {
            observerName,
            ...details
        }, 'WARN');
    }

    /**
     * Check if extension context is still valid
     */
    static isContextValid() {
        return !!(chrome.runtime && chrome.runtime.id);
    }

    /**
     * Sync event to background script
     */
    static syncToBackground(event) {
        try {
            if (this.isContextValid()) {
                chrome.runtime.sendMessage({
                    type: 'DIAGNOSTIC_EVENT',
                    event
                });
            }
        } catch (e) {
            // Context invalidated or background script unavailable
        }
    }

    /**
     * Get comprehensive error report for debugging
     */
    static async getErrorReport() {
        let manifestVersion = 'unknown';
        try {
            const manifest = chrome.runtime.getManifest();
            manifestVersion = manifest.version;
        } catch (e) {
            // Manifest might not be accessible
        }

        const report = {
            reportGeneratedAt: new Date().toISOString(),
            extensionVersion: manifestVersion,
            sessionId: this.sessionId,
            sessionDuration: `${((performance.now() - this.startTime) / 1000).toFixed(2)}s`,
            currentUrl: window.location.href,
            userAgent: navigator.userAgent,
            statistics: {
                totalErrors: this.errorCount,
                totalRetries: this.retryCount,
                totalPerfIssues: this.perfIssueCount,
                domNodeCount: document.getElementsByTagName('*').length
            },
            eventLog: this.logger.getAll(),
            systemInfo: {
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                devicePixelRatio: window.devicePixelRatio,
                language: navigator.language
            }
        };

        return JSON.stringify(report, null, 2);
    }

    /**
     * Copy error report to clipboard
     */
    static async copyReportToClipboard() {
        try {
            const report = await this.getErrorReport();
            await navigator.clipboard.writeText(report);
            this.log('REPORT_COPIED', { reportSize: report.length });
            return true;
        } catch (e) {
            this.logError(e, { operation: 'copyReportToClipboard' });
            return false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: MUTATION OBSERVER HEARTBEAT MONITOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ObserverMonitor - Ensures MutationObservers stay alive in SPA environments
 */
class ObserverMonitor {
    constructor() {
        this.observers = new Map();
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL_MS = 3000;
    }

    /**
     * Register an observer with the monitor
     */
    registerObserver(name, config) {
        this.observers.set(name, {
            observer: null,
            targetSelector: config.targetSelector,
            fallbackSelector: config.fallbackSelector,
            options: config.options,
            callback: config.callback,
            isAttached: false,
            reattachCount: 0
        });

        this.attachObserver(name);
        Diagnostics.log('OBSERVER_REGISTERED', { name, targetSelector: config.targetSelector });
    }

    /**
     * Attach/reattach an observer to its target
     */
    attachObserver(name) {
        const config = this.observers.get(name);
        if (!config) return false;

        // Disconnect existing observer if any
        if (config.observer) {
            config.observer.disconnect();
        }

        // Find target element
        let target = document.querySelector(config.targetSelector);
        if (!target && config.fallbackSelector) {
            target = document.querySelector(config.fallbackSelector);
        }
        if (!target) {
            target = document.body;
        }

        // Create and attach new observer
        config.observer = new MutationObserver(config.callback);
        config.observer.observe(target, config.options);
        config.isAttached = true;
        config.lastAttached = Date.now();

        Diagnostics.logDom('OBSERVER_ATTACHED', {
            name,
            targetFound: !!target,
            targetSelector: config.targetSelector
        });

        return true;
    }

    /**
     * Verify if observer is still functional
     */
    verifyObserver(name) {
        const config = this.observers.get(name);
        if (!config || !config.observer) return false;

        // Check if target element still exists and is connected
        const target = document.querySelector(config.targetSelector);
        const fallback = config.fallbackSelector ? document.querySelector(config.fallbackSelector) : null;

        // Only reattach if:
        // 1. Neither target nor fallback exists (Target was destroyed)
        const targetMissing = !target && !fallback;
        
        // 2. The observer is no longer observing the target (DOM node disconnected)
        // Note: For SPA resilience, we occasionally check if the target is still in document
        const targetDisconnected = target && !target.isConnected;

        const shouldReattach = targetMissing || targetDisconnected;

        return config.isAttached && !shouldReattach;
    }

    /**
     * Reinitialize a dead observer
     */
    reinitializeObserver(name) {
        const config = this.observers.get(name);
        if (!config) return;

        config.reattachCount++;
        Diagnostics.logHeartbeatRecovery(name, {
            reattachCount: config.reattachCount,
            timeSinceLastAttach: Date.now() - (config.lastAttached || 0)
        });

        this.attachObserver(name);
    }

    /**
     * Start the heartbeat monitor
     */
    startHeartbeat() {
        if (this.heartbeatInterval) return;

        this.heartbeatInterval = setInterval(() => {
            this.runHeartbeatCheck();
        }, this.HEARTBEAT_INTERVAL_MS);

        Diagnostics.log('HEARTBEAT_STARTED', { intervalMs: this.HEARTBEAT_INTERVAL_MS });
    }

    /**
     * Run heartbeat check on all observers
     */
    runHeartbeatCheck() {
        if (!Diagnostics.isContextValid()) {
            this.stopHeartbeat();
            return;
        }

        for (const [name, config] of this.observers) {
            if (!this.verifyObserver(name)) {
                this.reinitializeObserver(name);
            }
        }
    }

    /**
     * Stop the heartbeat monitor
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            Diagnostics.log('HEARTBEAT_STOPPED');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: VALIDATION LOOP INJECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InjectionManager - Handles text injection with verification and retry logic
 */
class InjectionManager {
    static VERIFICATION_DELAY_MS = 200; // Increased to match Gemini's DOM update timing
    static MAX_RETRIES = 2;
    static PERF_THRESHOLD_MS = 400; // Adjusted for validation loop overhead

    /**
     * Inject text with validation loop
     * Step A: Identify target
     * Step B: Record time, attempt injection
     * Step C: Verify after 150ms, retry if needed
     */
    static async injectWithValidation(inputElement, payload) {
        const startTime = performance.now();

        // Step A: Validate target
        if (!inputElement || !document.body.contains(inputElement)) {
            Diagnostics.logError(new Error('Target input element not found or detached'), {
                operation: 'injectWithValidation',
                step: 'A_IDENTIFY_TARGET'
            });
            return { success: false, reason: 'TARGET_NOT_FOUND' };
        }

        Diagnostics.logDom('INJECTION_START', {
            payloadLength: payload.length,
            targetTag: inputElement.tagName,
            targetId: inputElement.id
        });

        let attempt = 0;
        let success = false;

        while (attempt < this.MAX_RETRIES && !success) {
            attempt++;
            const attemptStartTime = performance.now();

            // Step B: Attempt injection
            try {
                inputElement.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, payload);

                const event = new Event('input', { bubbles: true });
                inputElement.dispatchEvent(event);
            } catch (e) {
                Diagnostics.logError(e, {
                    operation: 'injectWithValidation',
                    step: 'B_INJECTION',
                    attempt
                });
                continue;
            }

            // Step C: Verify after delay
            await this.delay(this.VERIFICATION_DELAY_MS);

            // Improved verification: check for key indicators instead of exact match
            // (DOM normalization changes \n to actual line breaks)
            const currentContent = inputElement.innerText || inputElement.textContent || '';
            const normalizedContent = currentContent.replace(/\s+/g, ' ').trim();
            const normalizedPayload = payload.replace(/\s+/g, ' ').trim();

            // Check if the injected text is present (accounting for whitespace differences)
            const hasReplyPrefix = currentContent.includes("I'm replying to this");
            const hasUserText = normalizedContent.includes(normalizedPayload.substring(normalizedPayload.indexOf('"', 20) + 1, Math.min(normalizedPayload.length, 100)));
            const injectionVerified = hasReplyPrefix && currentContent.length > payload.length * 0.8;

            if (injectionVerified) {
                success = true;
                const totalLatency = performance.now() - startTime;

                Diagnostics.logDom('INJECTION_CONFIRMED', {
                    attempt,
                    latencyMs: totalLatency.toFixed(2)
                });

                // Performance tracking
                if (totalLatency > this.PERF_THRESHOLD_MS) {
                    Diagnostics.logPerfIssue('INJECTION', totalLatency, this.PERF_THRESHOLD_MS, {
                        attempt,
                        payloadLength: payload.length
                    });
                }
            } else {
                Diagnostics.logRetry('INJECTION', attempt, this.MAX_RETRIES, 'Text not found in DOM');
                
                // Track Injection Retry
                chrome.runtime.sendMessage({ 
                    type: 'TRACK_EVENT', 
                    name: 'injection_retry', 
                    params: { attempt, max_retries: this.MAX_RETRIES } 
                });
            }
        }

        if (!success) {
            Diagnostics.logCritical('CRITICAL_INJECTION_FAILURE', {
                attempts: attempt,
                payloadLength: payload.length,
                lastContent: (inputElement.innerText || '').substring(0, 100)
            });

            // Track Injection Failure
            chrome.runtime.sendMessage({ 
                type: 'TRACK_EVENT', 
                name: 'injection_failure', 
                params: { attempts: attempt, payload_size: payload.length } 
            });
        }

        return {
            success,
            attempts: attempt,
            latencyMs: performance.now() - startTime
        };
    }

    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: DEVELOPER MODE UI
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DeveloperModeUI - Manages the floating debug button
 */
class DeveloperModeUI {
    static debugButton = null;
    static isEnabled = false;

    /**
     * Initialize developer mode UI based on stored preference
     */
    static async init() {
        try {
            const result = await chrome.storage?.local?.get(['developerMode']);
            this.isEnabled = result?.developerMode || false;
            if (this.isEnabled) {
                this.showDebugButton();
            }
            Diagnostics.log('DEVELOPER_MODE_INIT', { enabled: this.isEnabled });
        } catch (e) {
            // Storage might not be available
        }

        // Listen for toggle messages from popup
        chrome.runtime?.onMessage?.addListener((message) => {
            if (message.type === 'TOGGLE_DEVELOPER_MODE') {
                this.setEnabled(message.enabled);
            }
        });
    }

    /**
     * Enable/disable developer mode
     */
    static setEnabled(enabled) {
        this.isEnabled = enabled;
        if (enabled) {
            this.showDebugButton();
        } else {
            this.hideDebugButton();
        }
        Diagnostics.log('DEVELOPER_MODE_TOGGLED', { enabled });
    }

    /**
     * Create and show the floating debug button
     */
    static showDebugButton() {
        if (this.debugButton) return;

        this.debugButton = document.createElement('button');
        this.debugButton.id = 'ask-gemini-debug-btn';
        this.debugButton.innerHTML = '📋 Copy Debug Report';
        this.debugButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            padding: 10px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            transition: all 0.2s ease;
            opacity: 0.9;
        `;

        this.debugButton.addEventListener('mouseenter', () => {
            this.debugButton.style.transform = 'translateY(-2px)';
            this.debugButton.style.opacity = '1';
            this.debugButton.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
        });

        this.debugButton.addEventListener('mouseleave', () => {
            this.debugButton.style.transform = 'translateY(0)';
            this.debugButton.style.opacity = '0.9';
            this.debugButton.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
        });

        this.debugButton.addEventListener('click', async () => {
            Diagnostics.logAction('DEBUG_REPORT_CLICK');
            const success = await Diagnostics.copyReportToClipboard();

            const originalText = this.debugButton.innerHTML;
            this.debugButton.innerHTML = success ? '✅ Copied!' : '❌ Failed';
            this.debugButton.style.background = success
                ? 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
                : 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)';

            setTimeout(() => {
                this.debugButton.innerHTML = originalText;
                this.debugButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            }, 2000);
        });

        document.body.appendChild(this.debugButton);
        Diagnostics.log('DEBUG_BUTTON_SHOWN');
    }

    /**
     * Hide and remove the debug button
     */
    static hideDebugButton() {
        if (this.debugButton) {
            this.debugButton.remove();
            this.debugButton = null;
            Diagnostics.log('DEBUG_BUTTON_HIDDEN');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: MAIN APPLICATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

const ICONS = {
    ask: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
    reply: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
};

// Global state
let currentContext = null;
let contextBox = null;
let floatButton = null;
let inputElement = null;
let observerMonitor = null;

/**
 * Main initialization function
 */
function init() {
    Diagnostics.log('EXTENSION_INIT', { url: window.location.href });

    // Initialize observer monitor
    observerMonitor = new ObserverMonitor();

    // Set up event listeners
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('mousedown', handleOutsideClick);

    // Register input area observer
    observerMonitor.registerObserver('inputAreaObserver', {
        targetSelector: '.chat-window, [role="main"], main',
        fallbackSelector: 'body',
        options: { childList: true, subtree: true },
        callback: () => findInputArea()
    });

    // Register chat message observer
    observerMonitor.registerObserver('chatMessageObserver', {
        targetSelector: '.conversation-container, .chat-history, [role="log"]',
        fallbackSelector: 'body',
        options: { childList: true, subtree: true },
        callback: () => transformReplyMessages()
    });

    // Start heartbeat monitor
    observerMonitor.startHeartbeat();

    // Initialize developer mode UI
    DeveloperModeUI.init();

    // Initial setup
    findInputArea();

    // CRITICAL: Run transform periodically as safety net
    // Angular/React SPAs sometimes don't trigger MutationObserver reliably
    setInterval(() => {
        transformReplyMessages();
    }, 500);

    Diagnostics.log('EXTENSION_READY');
}

/**
 * Find and track the input area
 */
function findInputArea() {
    if (inputElement && document.body.contains(inputElement) && inputElement.offsetParent !== null) {
        return;
    }

    const potentialInputs = document.querySelectorAll('div[contenteditable="true"]');
    for (const el of potentialInputs) {
        const ariaLabel = el.getAttribute('aria-label') || "";
        const isVisible = el.offsetParent !== null;

        if (isVisible && (ariaLabel.toLowerCase().includes('prompt') || ariaLabel.toLowerCase().includes('ask') || ariaLabel.toLowerCase().includes('message'))) {
            inputElement = el;
            inputElement.addEventListener('keydown', handleKeydown, true);
            Diagnostics.logDom('INPUT_AREA_FOUND', { ariaLabel });
            return;
        }
    }
}

/**
 * Handle text selection
 */
function handleSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length < 5000) {
        showFloatButton(selection);
        Diagnostics.logAction('TEXT_SELECTED', { length: text.length });

        // Track Highlight Event
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'text_highlight', 
            params: { length: text.length } 
        });
    } else {
        hideFloatButton();
    }
}

/**
 * Handle clicks outside the float button
 */
function handleOutsideClick(e) {
    if (floatButton && !floatButton.contains(e.target)) {
        hideFloatButton();
    }
}

/**
 * Show the floating "Ask Gemini" button
 */
function showFloatButton(selection) {
    if (!floatButton) {
        floatButton = document.createElement('button');
        floatButton.id = 'ask-gemini-float-btn';
        floatButton.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center;">
                <span style="display: flex; align-items: center; gap: 6px; user-select: none;">
                    ${ICONS.ask}
                    <span style="white-space: nowrap; user-select: none;">Ask Gemini</span>
                </span>
            </div>
        `;
        floatButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            Diagnostics.logAction('ASK_GEMINI_CLICK');
            activateContext(selection.toString());
            window.getSelection().removeAllRanges();
            hideFloatButton();
        };
        document.body.appendChild(floatButton);
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const top = rect.top + window.scrollY - 40;
    const left = rect.left + window.scrollX;

    floatButton.style.top = `${Math.max(5, top)}px`;
    floatButton.style.left = `${left}px`;
    floatButton.style.display = 'flex';
}

/**
 * Hide the floating button
 */
function hideFloatButton() {
    if (floatButton) floatButton.style.display = 'none';
}

/**
 * Activate context for reply
 */
function activateContext(text) {
    // Normalize multi-paragraph selections: collapse newlines into spaces
    // This prevents highlighted text from "leaking" into the reply section
    currentContext = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    findInputArea();
    renderContextBox();
    interceptSendButton();
    if (inputElement) inputElement.focus();
    Diagnostics.logAction('CONTEXT_ACTIVATED', { contextLength: text.length });
}

/**
 * Render the context box UI
 */
function renderContextBox() {
    if (!inputElement || !document.body.contains(inputElement)) findInputArea();
    if (!inputElement) return;

    if (!contextBox) {
        contextBox = document.createElement('div');
        contextBox.id = 'ask-gemini-context-box';
        contextBox.innerHTML = `
            <span class="ask-gemini-draft-icon">${ICONS.reply}</span>
            <button type="button" class="ask-gemini-draft-content" aria-label="Replying to">
                <span id="ask-gemini-context-content"></span>
            </button>
            <button type="button" class="ask-gemini-draft-close" aria-label="Remove">${ICONS.close}</button>
        `;
        contextBox.querySelector('.ask-gemini-draft-close').onclick = clearContext;
    }

    const textInputField = inputElement.closest('.text-input-field');
    if (textInputField && contextBox.parentElement !== textInputField) {
        textInputField.insertBefore(contextBox, textInputField.firstChild);
    } else if (!textInputField && !document.body.contains(contextBox)) {
        document.body.appendChild(contextBox);
    }

    contextBox.querySelector('#ask-gemini-context-content').textContent = `"${currentContext}"`;
    contextBox.style.display = 'flex';
    Diagnostics.logDom('CONTEXT_BOX_RENDERED');
}

/**
 * Clear the current context
 */
function clearContext() {
    currentContext = null;
    if (contextBox) {
        contextBox.style.display = 'none';
        const wrapper = contextBox.nextElementSibling;
        if (wrapper) {
            wrapper.style.borderRadius = "";
            wrapper.style.marginTop = "";
            wrapper.style.borderTop = "";
        }
    }
    Diagnostics.logAction('CONTEXT_CLEARED');

    // Track Context Cleared
    chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name: 'context_cleared' });
}

/**
 * Handle keydown events in the input area
 */
function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && currentContext) {
        // CRITICAL: Stop the Enter from submitting before injection completes
        e.preventDefault();
        e.stopPropagation();

        Diagnostics.logAction('ENTER_KEY_WITH_CONTEXT');
        handleInjectAndSubmit();
    }
}

/**
 * Inject context and submit - uses new validation loop
 */
async function handleInjectAndSubmit() {
    const replyClickTime = performance.now();
    const userText = inputElement.innerText || inputElement.textContent || "";
    if (!userText.trim()) return;

    const payload = `I'm replying to this:\n"${currentContext}"\n${userText.trim()}`;

    // Use the new validation loop injection
    const result = await InjectionManager.injectWithValidation(inputElement, payload);

    if (result.success) {
        const totalLatency = performance.now() - replyClickTime;
        Diagnostics.log('REPLY_COMPLETE', {
            latencyMs: totalLatency.toFixed(2),
            attempts: result.attempts
        });

        // Track latency from reply click to injection confirmed
        if (totalLatency > 400) {
            Diagnostics.logPerfIssue('REPLY_TO_INJECTION', totalLatency, 400, {
                userTextLength: userText.length,
                contextLength: currentContext.length
            });
        }

        // CRITICAL: Trigger the actual submit after injection
        triggerGeminiSubmit();

        // Track Reply Success
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'context_reply_success', 
            params: { 
                context_size: currentContext.length,
                latency_ms: totalLatency.toFixed(0)
            } 
        });
    }

    clearContext();
}

/**
 * Intercept the native Gemini send button so that clicking it
 * goes through our injection flow when context is active
 */
function interceptSendButton() {
    const SEND_SELECTORS = [
        'button[aria-label*="Send"]',
        'button[data-test-id="send-button"]',
        'button.send-button',
        'button[mattooltip="Send message"]',
        '.send-button-container button',
        'button[aria-label="Send message"]'
    ].join(', ');

    // Watch for the send button to appear and attach a capturing listener
    const attachListener = () => {
        const sendButton = document.querySelector(SEND_SELECTORS);
        if (sendButton && !sendButton.__askGeminiIntercepted) {
            sendButton.__askGeminiIntercepted = true;
            sendButton.addEventListener('click', (e) => {
                if (currentContext) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    Diagnostics.logAction('SEND_BUTTON_INTERCEPTED');
                    handleInjectAndSubmit();
                }
            }, true); // Capturing phase to fire before Gemini's listener
            Diagnostics.logDom('SEND_BUTTON_INTERCEPTOR_ATTACHED');
        }
    };

    attachListener();
    // Retry a few times in case the button hasn't rendered yet
    setTimeout(attachListener, 500);
    setTimeout(attachListener, 1500);
}

const SEND_BUTTON_SELECTORS = [
    'button[aria-label*="Send"]',
    'button[data-test-id="send-button"]',
    'button.send-button',
    'button[mattooltip="Send message"]',
    '.send-button-container button',
    'button[aria-label="Send message"]'
].join(', ');

/**
 * Trigger Gemini's send button to submit the message
 */
function triggerGeminiSubmit() {
    // Method 1: Find and click the send button
    const sendButton = document.querySelector(SEND_BUTTON_SELECTORS);

    if (sendButton && !sendButton.disabled) {
        // Temporarily remove our interceptor flag so the click goes through
        sendButton.__askGeminiIntercepted = false;
        Diagnostics.logDom('SUBMIT_VIA_BUTTON');
        sendButton.click();
        // Re-flag it after click
        sendButton.__askGeminiIntercepted = true;
        return;
    }

    // Method 2: Simulate Enter keypress on the input element
    // This is a fallback if we can't find the send button
    if (inputElement) {
        Diagnostics.logDom('SUBMIT_VIA_ENTER_SIMULATION');

        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });

        // Temporarily remove our listener to avoid infinite loop
        inputElement.removeEventListener('keydown', handleKeydown, true);
        inputElement.dispatchEvent(enterEvent);

        // Re-add our listener after a tick
        setTimeout(() => {
            inputElement.addEventListener('keydown', handleKeydown, true);
        }, 100);
    }

    // Track submission method (Button vs Simulation)
    chrome.runtime.sendMessage({ 
        type: 'TRACK_EVENT', 
        name: 'reply_submitted', 
        params: { method: sendButton ? 'button' : 'enter_simulation' } 
    });
}

/**
 * Transform reply messages in the chat
 * Uses innerText (preserves line breaks) + indexOf splitting (no fragile regexes)
 */
function transformReplyMessages() {
    const containers = document.querySelectorAll(
        '.query-text:not([data-ask-gemini-transformed]), ' +
        '.user-query-bubble-with-background:not([data-ask-gemini-transformed]) .query-text'
    );

    containers.forEach(container => {
        if (container.hasAttribute('data-ask-gemini-transformed')) return;

        // CRITICAL: Use innerText, NOT textContent. innerText preserves <br> as \n
        // which gives us real line breaks to split on.
        const fullText = container.innerText || container.textContent || "";
        const PREFIX = "I'm replying to this:";

        // Also check with curly apostrophe variant (some browsers auto-convert)
        const PREFIX_CURLY = "I\u2019m replying to this:";

        let prefixIdx = fullText.indexOf(PREFIX);
        let usedPrefix = PREFIX;
        if (prefixIdx === -1) {
            prefixIdx = fullText.indexOf(PREFIX_CURLY);
            usedPrefix = PREFIX_CURLY;
        }
        if (prefixIdx === -1) return;

        // Everything after the prefix
        const afterPrefix = fullText.substring(prefixIdx + usedPrefix.length);

        // Find opening quote — skip any whitespace/newlines before it
        const openQuoteIdx = afterPrefix.indexOf('"');
        if (openQuoteIdx === -1) return;

        // Find the LAST double-quote in the string. The context is between the first and last quotes.
        // This works because our payload is: PREFIX\n"context"\nreply
        // The reply text should NOT contain unmatched leading quotes from us.
        const lastQuoteIdx = afterPrefix.lastIndexOf('"');
        if (lastQuoteIdx <= openQuoteIdx) return; // No closing quote found

        const contextText = afterPrefix.substring(openQuoteIdx + 1, lastQuoteIdx).trim();
        const userReplyText = afterPrefix.substring(lastQuoteIdx + 1).trim();

        if (!contextText || !userReplyText) return;

        container.setAttribute('data-ask-gemini-transformed', 'true');
        Diagnostics.logDom('MESSAGE_TRANSFORM_START', {
            contextLength: contextText.length,
            replyLength: userReplyText.length
        });

        // Hide the original raw container
        container.style.display = 'none';
        const parentBubble = container.closest('.user-query-bubble-with-background');
        if (parentBubble) {
            parentBubble.setAttribute('data-ask-gemini-transformed', 'true');
            parentBubble.style.background = 'transparent';
            parentBubble.style.backgroundColor = 'transparent';
            parentBubble.style.boxShadow = 'none';
            parentBubble.style.padding = '0';
        }

        // Build clean proxy from extracted strings only
        const proxy = document.createElement('div');
        proxy.className = 'ask-gemini-transformed-proxy';
        proxy.innerHTML = `
            <div class="ask-gemini-proxy-content">
                <button class="ask-gemini-reply-preview" type="button">
                    <span class="ask-gemini-reply-icon">${ICONS.reply}</span>
                    <div class="ask-gemini-reply-text-wrapper">
                        <p class="ask-gemini-reply-text">"${contextText}"</p>
                    </div>
                </button>
                <div class="ask-gemini-message-bubble">
                    <div class="ask-gemini-bubble-text">${userReplyText}</div>
                </div>
            </div>
        `;
        container.parentNode.insertBefore(proxy, container.nextSibling);
        Diagnostics.logDom('MESSAGE_TRANSFORM_COMPLETE');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: GLOBAL ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Global unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
    Diagnostics.logError(event.reason || new Error('Unhandled Promise Rejection'), {
        type: 'unhandledrejection',
        promise: String(event.promise)
    });
});

/**
 * Global error handler
 */
window.addEventListener('error', (event) => {
    Diagnostics.logError(event.error || new Error(event.message), {
        type: 'globalError',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT - Wrapped in Global Try-Catch
// ═══════════════════════════════════════════════════════════════════════════════

try {
    Diagnostics.log('FORTRESS_FRAMEWORK_LOADING', {
        version: '1.0',
        timestamp: new Date().toISOString()
    });

    init();
} catch (e) {
    Diagnostics.logCritical('INIT_FAILURE', {
        message: e.message,
        stack: e.stack
    });
}
