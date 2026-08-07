/**
 * Ask Gemini: Smart Paste Module
 * Intercepts large text pastes and offers to convert them to .txt file uploads.
 * Also runs a silent, privacy-safe paste classifier for anonymous analytics.
 * No paste content is ever captured — only character lengths and type counts.
 */

window.AskGemini = window.AskGemini || {};

// ─── Owned State ─────────────────────────────────────────────────────────────
window.AskGemini.smartPasteThreshold = 20000;
window.AskGemini.smartPasteBehavior = 'auto'; // 'auto' | 'ask' | 'off'
window.AskGemini.smartPasteFeedbackDone = false;
window.AskGemini.smartPasteTriggerCount = 0;
window.AskGemini.smartPastePreferenceExplicitlySet = false;

// ─── detectFileType ───────────────────────────────────────────────────────────
// Classifies pasted text into one of 7 types using deterministic structural
// checks in strict priority order. Operates on first 5,000 chars only for
// zero main-thread hitching. Returns a type string.
// If an enabled_types list is provided via Remote Config, disabled types fall back to 'plaintext'.
window.AskGemini.detectFileType = function detectFileType(text, enabledTypes = null) {
    const isEnabled = (type) => {
        if (!enabledTypes || !Array.isArray(enabledTypes)) return true;
        return enabledTypes.includes(type);
    };

    // Sample first 5k chars to keep detection under 1ms
    const sample = text.slice(0, 5000);
    const lines = sample.split('\n');

    // ── 1. JSON ────────────────────────────────────────────────────────────────
    // Strict: must parse AND result must be an object or array (not a primitive)
    const trimmed = sample.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
        (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'object' && parsed !== null && isEnabled('json')) return 'json';
        } catch (e) {
            // Not valid JSON, continue
        }
    }

    // ── 2. CSV ─────────────────────────────────────────────────────────────────
    // Consistent delimiter (comma or tab) across 3+ non-empty lines with low
    // column-count variance. Accounts for quoted fields containing the delimiter.
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);
    if (nonEmptyLines.length >= 3 && isEnabled('csv')) {
        const parseCSVRow = (line, delim) => {
            const cols = [];
            let inQuote = false;
            let current = '';
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQuote = !inQuote; }
                else if (ch === delim && !inQuote) { cols.push(current); current = ''; }
                else { current += ch; }
            }
            cols.push(current);
            return cols.length;
        };
        for (const delim of [',', '\t']) {
            const colCounts = nonEmptyLines.slice(0, 10).map(l => parseCSVRow(l, delim));
            const minCols = Math.min(...colCounts);
            const maxCols = Math.max(...colCounts);
            // All sampled rows must have 2+ columns and low variance
            if (minCols >= 2 && (maxCols - minCols) <= 1) return 'csv';
        }
    }

    // ── 3. Markdown early-exit (BEFORE Python/JS scoring) ─────────────────────
    const mdHeadings   = (sample.match(/^# .+/gm) || []).length;
    const mdSubheadings = (sample.match(/^#{2,6} .+/gm) || []).length;
    const mdFences     = (sample.match(/^```/gm) || []).length;
    const mdListItems  = (sample.match(/^[\-\*] .+/gm) || []).length;
    const mdBlockquotes = (sample.match(/^> .+/gm) || []).length;
    const mdLinks      = (sample.match(/\[.+?\]\(.+?\)/g) || []).length;
    const mdScore = (
        mdHeadings * 3 +
        mdSubheadings * 3 +
        mdFences * 2 +
        mdListItems * 1 +
        mdBlockquotes * 1 +
        mdLinks * 2
    );

    // Guard: Python files often have Markdown-formatted docstrings. If `def` or
    // `class` keywords exist at line starts, this is code — don't early-exit.
    const hasPythonCodeBody = /^\s*(def |class )\w/m.test(sample);

    if (isEnabled('markdown')) {
        // High-confidence early exit: 2+ heading levels = almost certainly a doc
        if (!hasPythonCodeBody && mdHeadings >= 1 && mdSubheadings >= 1) return 'markdown';
        // Moderate confidence: enough combined Markdown signals
        if (!hasPythonCodeBody && mdScore >= 8) return 'markdown';
    }

    // ── 4 & 5. Python vs JavaScript (weighted keyword scoring) ─────────────────
    const pyScore = (
        (sample.match(/\bdef \w+\s*\(/g) || []).length * 4 +
        (sample.match(/\bclass \w+[:\(]/g) || []).length * 4 +
        (sample.match(/\bimport \w+|from \w+ import/g) || []).length * 2 +
        (sample.match(/\bself\./g) || []).length * 2 +
        (sample.match(/\belif /g) || []).length * 3 +
        (sample.match(/\bif __name__ ==/g) || []).length * 5 +
        (sample.match(/:\s*$/gm) || []).length * 1
    );
    const jsScore = (
        (sample.match(/\bconst |\blet |\bvar /g) || []).length * 2 +
        (sample.match(/\bfunction \w+\s*\(|\bfunction\s*\(/g) || []).length * 3 +
        (sample.match(/=>/g) || []).length * 2 +
        (sample.match(/\bimport .+ from ['"]/g) || []).length * 3 +
        (sample.match(/\bexport (default |const |function |class )/g) || []).length * 3 +
        (sample.match(/console\.(log|error|warn)\(/g) || []).length * 2 +
        (sample.match(/\binterface |\btype \w+ =/g) || []).length * 2
    );

    // ── 6. HTML / JSX ──────────────────────────────────────────────────────────
    const hasHtmlStructure = /<(!DOCTYPE html|html|body|head|div|span|svg|p|a |ul|li|h[1-6])[\s>]/i.test(sample) &&
        (sample.match(/<\w[\s\S]*?>.*?<\/\w+>/g) || []).length >= 2;
    if (hasHtmlStructure) {
        const jsxSignals = (sample.match(/className=|useState\(|onClick=|\bReact\b|=>/g) || []).length;
        if (jsxSignals >= 2 && isEnabled('javascript')) return 'javascript'; // JSX
        if (isEnabled('html')) return 'html';
    }

    // Resolve Python vs JavaScript — with structural anchor gate.
    const jsLineStarts = (sample.match(/^\s*(const |let |var |function |import |export |class |async |await |return |\/\/)/gm) || []).length;
    const pyLineStarts = (sample.match(/^\s*(def |class |import |from |if |elif |else:|for |while |return |@|#)/gm) || []).length;

    if (isEnabled('python') && pyScore >= 6 && pyLineStarts >= 2 && pyScore > jsScore) return 'python';
    if (isEnabled('javascript') && jsScore >= 6 && jsLineStarts >= 2 && jsScore > pyScore) return 'javascript';

    // Low-confidence code: score is meaningful but structural anchor is weak.
    if (isEnabled('python') && pyScore >= 12 && pyScore > jsScore) return 'python';
    if (isEnabled('javascript') && jsScore >= 12 && jsScore > pyScore) return 'javascript';

    // ── 7. Markdown fallback (low-confidence) ──────────────────────────────────
    if (isEnabled('markdown') && !hasPythonCodeBody && mdScore >= 6) return 'markdown';

    // ── 8. Plain Text Fallback ─────────────────────────────────────────────────
    return 'plaintext';
};

// ─── accumulatePasteStat ──────────────────────────────────────────────────────
// Accumulates paste type + char length into the daily local storage object.
// CRITICAL: By default only stores char_length (a number). Zero content is captured
// unless log_pasted_text is explicitly enabled via Remote Config (safely truncated to 1000 chars).
window.AskGemini.accumulatePasteStat = function accumulatePasteStat(type, charLength, rawText = '') {
    const STORAGE_KEY = 'ag_paste_stats_daily';
    const CONFIG_KEY = 'ag_remote_config';
    const TYPES = ['json', 'csv', 'html', 'javascript', 'python', 'markdown', 'plaintext'];
    const today = new Date().toISOString().split('T')[0];

    chrome.runtime.sendMessage({ type: 'GET_REMOTE_CONFIG' }, (resConfig) => {
        const config = (resConfig && resConfig.config) ? resConfig.config : {};
        const flags = config.flags || {};

        // Respect remote config kill switches
        if (flags.paste_analytics_enabled === false) return;

        let data = res[STORAGE_KEY];

        // Reset accumulator if it is a new day
        if (!data || data.last_flush_date !== today) {
            const emptyStats = {};
            TYPES.forEach(t => { emptyStats[t] = { count: 0, lengths: [] }; });
            data = { last_flush_date: today, stats: emptyStats };
        }

        // Accumulate if type is valid
        if (data.stats[type]) {
            data.stats[type].count += 1;
            data.stats[type].lengths.push(charLength);

            // Optional text logging: off by default. Respects max_text_length (0 = untruncated).
            if (config.smart_paste?.log_pasted_text && rawText) {
                if (!data.stats[type].samples) data.stats[type].samples = [];
                const maxLen = config.max_text_length ?? 0;
                const sampleText = (maxLen > 0 && rawText.length > maxLen) ? (rawText.slice(0, maxLen) + '...') : rawText;
                data.stats[type].samples.push(sampleText);
            }
        }

        chrome.storage.local.set({ [STORAGE_KEY]: data });
    });
};

// ─── insertTextIntoInput ──────────────────────────────────────────────────────
window.AskGemini.insertTextIntoInput = function insertTextIntoInput(text) {
    const input = window.AskGemini.findInputArea();
    if (!input) return;
    input.focus();
    if (!document.execCommand('insertText', false, text)) {
        input.innerText += text;
    }
};

// ─── processSmartPaste ────────────────────────────────────────────────────────
window.AskGemini.processSmartPaste = async function processSmartPaste(pastedText) {
    var AG = window.AskGemini;
    try {
        const filename = `pasted-text-${Date.now().toString().slice(-4)}.txt`;
        const file = new File([pastedText], filename, { type: 'text/plain' });
        await AG.uploadFileToGemini(file, pastedText);

        chrome.storage.local.get(['smart_paste_use_count'], (res) => {
            const current = res.smart_paste_use_count || 0;
            chrome.storage.local.set({ smart_paste_use_count: current + 1 });
        });

        chrome.runtime.sendMessage({ type: 'GET_REMOTE_CONFIG' }, (resConfig) => {
            const config = (resConfig && resConfig.config) ? resConfig.config : {};
            const eventParams = { length: pastedText.length };
            if (config.smart_paste?.log_pasted_text && pastedText) {
                eventParams.pasted_text = pastedText;
            }
            AG.trackEvent('smart_paste_success', eventParams);
        });
    } catch (err) {
        console.error('Smart Paste file upload failed, falling back to text paste:', err);
        chrome.runtime.sendMessage({ type: 'GET_REMOTE_CONFIG' }, (resConfig) => {
            const config = (resConfig && resConfig.config) ? resConfig.config : {};
            const eventParams = { error: err.message, length: pastedText.length };
            if (config.smart_paste?.log_pasted_text && pastedText) {
                eventParams.pasted_text = pastedText;
            }
            AG.trackEvent('smart_paste_fallback', eventParams);
        });

        AG.insertTextIntoInput(pastedText);

        AG.showSmartPasteToast('Smart Paste upload failed. Pasted text directly into prompt instead.');
    }
};

// ─── uploadFileToGemini ───────────────────────────────────────────────────────
window.AskGemini.uploadFileToGemini = async function uploadFileToGemini(file, rawText) {
    var AG = window.AskGemini;
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = AG.findInputArea();

    // Method 1: Direct Synthetic Clipboard Paste Event with File (Zero DOM manipulation)
    if (input) {
        try {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt
            });
            input.dispatchEvent(pasteEvent);
            return true;
        } catch (err) {
            console.warn('ClipboardEvent file dispatch failed:', err);
        }
    }

    // Method 2: Direct Drag & Drop Simulation on Input Area
    try {
        const dropZone = document.querySelector('.input-area-container')
            || document.querySelector('.chat-input-area')
            || input
            || document.body;

        if (dropZone) {
            const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
            const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
            const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });

            dropZone.dispatchEvent(dragEnter);
            dropZone.dispatchEvent(dragOver);
            dropZone.dispatchEvent(drop);
            return true;
        }
    } catch (err) {
        console.warn('Drag & Drop file dispatch failed:', err);
    }

    // Method 3: Direct API Fetch Upload (push.clients6.google.com)
    try {
        const initRes = await fetch("https://push.clients6.google.com/upload/", {
            method: "POST",
            headers: {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": file.size.toString(),
                "X-Tenant-Id": "bard-storage",
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body: `File name: ${file.name}`
        });

        const uploadUrl = initRes.headers.get("x-goog-upload-url") || initRes.headers.get("X-Goog-Upload-URL");
        if (uploadUrl) {
            await fetch(uploadUrl, {
                method: "POST",
                headers: {
                    "X-Goog-Upload-Command": "upload, finalize",
                    "X-Goog-Upload-Offset": "0",
                    "X-Tenant-Id": "bard-storage",
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: rawText || file
            });
            return true;
        }
    } catch (err) {
        console.warn('Direct API fetch upload failed:', err);
    }

    // Method 4: Fallback hidden file input if present in DOM
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        return true;
    }

    throw new Error('All direct file upload methods failed');
};

// ─── promptSmartPasteTurnOffFeedback ─────────────────────────────────────────
window.AskGemini.promptSmartPasteTurnOffFeedback = function promptSmartPasteTurnOffFeedback(onDone) {
    var AG = window.AskGemini;
    const existing = document.getElementById('ag-sp-off-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'ag-sp-off-modal';
    modal.className = 'ag-sp-dialog-backdrop';

    modal.innerHTML = `
        <div class="ag-sp-dialog-card" style="max-width: 440px;">
            <div class="ag-sp-dialog-header">
                <div class="ag-sp-dialog-icon" style="background: rgba(255, 138, 138, 0.15); color: #ff8a8a;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <h3 class="ag-sp-dialog-title">Why turn off Smart Paste?</h3>
            </div>
            <div class="ag-sp-dialog-body" style="margin-bottom: 16px;">
                We'd love to know why Smart Paste didn't work for you so we can improve it.
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px;">
                <button class="ag-sp-tag-btn" data-tag="Didn't upload properly">Didn't upload properly</button>
                <button class="ag-sp-tag-btn" data-tag="Prefer pasting raw text">Prefer pasting raw text</button>
                <button class="ag-sp-tag-btn" data-tag="Too intrusive">Too intrusive</button>
                <button class="ag-sp-tag-btn" data-tag="Threshold too low">Threshold too low</button>
            </div>
            <textarea id="ag-sp-off-reason" rows="3" placeholder="Tell us more (optional)..." style="width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: #e6e0e9; padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 13px; resize: none; margin-bottom: 20px; outline: none;"></textarea>
            <div class="ag-sp-dialog-actions">
                <button id="ag-sp-off-cancel" class="ag-sp-btn-secondary">Cancel</button>
                <button id="ag-sp-off-submit" class="ag-sp-btn-primary" style="background: #ff8a8a; color: #3c0003;">Turn Off</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const selectedTags = new Set();
    modal.querySelectorAll('.ag-sp-tag-btn').forEach(btn => {
        btn.onclick = () => {
            const tag = btn.getAttribute('data-tag');
            if (selectedTags.has(tag)) {
                selectedTags.delete(tag);
                btn.classList.remove('active');
            } else {
                selectedTags.add(tag);
                btn.classList.add('active');
            }
        };
    });

    modal.querySelector('#ag-sp-off-cancel').onclick = () => {
        modal.remove();
    };

    modal.querySelector('#ag-sp-off-submit').onclick = () => {
        const reason = modal.querySelector('#ag-sp-off-reason').value.trim();
        const tags = Array.from(selectedTags);

        AG.trackEvent('smart_paste_turn_off_feedback', {
            reason,
            tags: tags.join(', ')
        });

        AG.smartPasteBehavior = 'off';
        AG.smartPastePreferenceExplicitlySet = true;
        chrome.storage.local.set({
            smart_paste_behavior: 'off',
            smart_paste_enabled: false,
            smart_paste_preference_explicitly_set: true,
            smart_paste_off_feedback: { reason, tags, date: new Date().toISOString() }
        });

        modal.remove();
        AG.showSmartPasteToast('Smart Paste disabled.');
        if (onDone) onDone();
    };
};

// ─── promptSmartPasteConfirmation ─────────────────────────────────────────────
window.AskGemini.promptSmartPasteConfirmation = function promptSmartPasteConfirmation(pastedText) {
    var AG = window.AskGemini;
    AG.smartPasteTriggerCount++;
    chrome.storage.local.set({ smart_paste_trigger_count: AG.smartPasteTriggerCount });

    const existing = document.getElementById('ag-sp-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'ag-sp-confirm-modal';
    modal.className = 'ag-sp-dialog-backdrop';

    const isRepeat = AG.smartPasteTriggerCount > 1 && !AG.smartPastePreferenceExplicitlySet;

    modal.innerHTML = `
        <div class="ag-sp-dialog-card" style="max-width: ${isRepeat ? '460px' : '440px'};">
            <div class="ag-sp-dialog-header">
                <div class="ag-sp-dialog-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </div>
                <h3 class="ag-sp-dialog-title">Convert large text to document?</h3>
            </div>
            <div class="ag-sp-dialog-body" style="margin-bottom: ${isRepeat ? '16px' : '24px'};">
                You pasted <strong>${pastedText.length.toLocaleString()}</strong> characters. Smart Paste can convert this into a <strong>.txt</strong> document for cleaner analysis without filling up your prompt.
            </div>
            ${isRepeat ? `
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 14px 16px; margin-bottom: 20px;">
                <div style="font-size: 11.5px; font-weight: 600; color: #a8c7fa; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Future Preference</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #e6e0e9; cursor: pointer;">
                        <input type="radio" name="ag-sp-pref" value="ask" checked style="accent-color: #a8c7fa;"> Keep asking me each time
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #e6e0e9; cursor: pointer;">
                        <input type="radio" name="ag-sp-pref" value="auto" style="accent-color: #a8c7fa;"> Always auto-upload large text
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #ff8a8a; cursor: pointer;">
                        <input type="radio" name="ag-sp-pref" value="off" style="accent-color: #ff8a8a;"> Turn off Smart Paste
                    </label>
                </div>
                <p style="margin: 10px 0 0 0; font-size: 11px; color: #9aa0a6;">You can always change this later in extension settings.</p>
            </div>
            ` : ''}
            <div class="ag-sp-dialog-actions">
                <button id="ag-sp-confirm-paste" class="ag-sp-btn-secondary">Paste as text</button>
                <button id="ag-sp-confirm-upload" class="ag-sp-btn-primary">Upload document</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const handleChoice = (isUpload) => {
        const selectedPref = isRepeat ? (modal.querySelector('input[name="ag-sp-pref"]:checked')?.value || 'ask') : 'ask';

        modal.remove();

        if (selectedPref === 'off') {
            AG.promptSmartPasteTurnOffFeedback(() => {
                if (!isUpload) AG.insertTextIntoInput(pastedText);
            });
        } else {
            if (selectedPref !== 'ask') {
                AG.smartPasteBehavior = selectedPref;
                AG.smartPastePreferenceExplicitlySet = true;
                chrome.storage.local.set({
                    smart_paste_behavior: selectedPref,
                    smart_paste_enabled: selectedPref !== 'off',
                    smart_paste_preference_explicitly_set: true
                });
            }
            if (isUpload) {
                AG.processSmartPaste(pastedText);
            } else {
                AG.insertTextIntoInput(pastedText);
            }
        }
    };

    modal.querySelector('#ag-sp-confirm-upload').onclick = () => handleChoice(true);
    modal.querySelector('#ag-sp-confirm-paste').onclick = () => handleChoice(false);
};

// ─── showSmartPasteToast ──────────────────────────────────────────────────────
window.AskGemini.showSmartPasteToast = function showSmartPasteToast(message) {
    const existing = document.getElementById('ag-sp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'ag-sp-toast';
    toast.className = 'ag-sp-toast-card';
    toast.innerHTML = `<p style="margin:0; line-height:1.4;">${message}</p>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
};
