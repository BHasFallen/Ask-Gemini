/**
 * Ask Gemini: Paste Stats Module
 * Accumulates paste analytics locally and exposes helpers for the daily flush.
 * Storage key: ag_paste_stats_daily
 */

window.AskGemini = window.AskGemini || {};

// ─── detectPasteType ──────────────────────────────────────────────────────────
/**
 * Classify pasted text into one of:
 * json | html | csv | javascript | python | markdown | plaintext
 */
window.AskGemini.detectPasteType = function detectPasteType(text) {
    const trimmed = text.trim();

    // JSON
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
        try { JSON.parse(trimmed); return 'json'; } catch (_) { /* fall through */ }
    }

    // HTML
    if (/<(!DOCTYPE|html|body|head|div|span|p|ul|ol|li|table|script|style)\b/i.test(trimmed)) {
        return 'html';
    }

    // CSV — first line has ≥2 commas AND ≥60 % of lines share that comma count
    const lines = trimmed.split('\n');
    if (lines.length >= 2) {
        const firstCommas = (lines[0].match(/,/g) || []).length;
        if (firstCommas >= 2) {
            const matching = lines.filter(l => (l.match(/,/g) || []).length === firstCommas).length;
            if (matching / lines.length >= 0.6) return 'csv';
        }
    }

    // JavaScript
    if (/\b(function\s+\w+\s*\(|const\s+\w+|let\s+\w+|var\s+\w+|=>\s*[{(]|require\s*\(|import\s+.+from\b)/.test(trimmed)) {
        return 'javascript';
    }

    // Python
    if (/\b(def\s+\w+|import\s+\w+|from\s+\w+\s+import|class\s+\w+|print\s*\(|if\s+__name__)/.test(trimmed)) {
        return 'python';
    }

    // Markdown
    if (/^#{1,6}\s/m.test(trimmed) || /(\*\*|__|`{1,3}|\- \[|^---$)/m.test(trimmed)) {
        return 'markdown';
    }

    return 'plaintext';
};

// ─── recordPasteStats ─────────────────────────────────────────────────────────
/**
 * Append one paste to the daily accumulator.
 * Stores { date, types, _pending } in ag_paste_stats_daily.
 * _pending is a LIFO list of {type, length} used by cancelLastPasteStat.
 */
window.AskGemini.recordPasteStats = function recordPasteStats(text) {
    if (!text || typeof text !== 'string') return;
    const type   = window.AskGemini.detectPasteType(text);
    const length = text.length;
    const today  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    chrome.storage.local.get(['ag_paste_stats_daily'], (res) => {
        let stats = res.ag_paste_stats_daily;

        // Reset if it's a new day
        if (!stats || stats.date !== today) {
            stats = { date: today, types: {}, _pending: [] };
        }

        // Accumulate into types
        if (!stats.types[type]) {
            stats.types[type] = { count: 0, lengths: [] };
        }
        stats.types[type].count++;
        stats.types[type].lengths.push(length);

        // Push to _pending for potential cancellation
        stats._pending = stats._pending || [];
        stats._pending.push({ type, length });

        chrome.storage.local.set({ ag_paste_stats_daily: stats });
    });
};

// ─── cancelLastPasteStat ──────────────────────────────────────────────────────
/**
 * Undo the most recently recorded paste stat.
 * Called when smart paste converts a paste to a .txt upload,
 * so that upload-converted pastes are excluded from the raw text daily summary.
 */
window.AskGemini.cancelLastPasteStat = function cancelLastPasteStat() {
    chrome.storage.local.get(['ag_paste_stats_daily'], (res) => {
        const stats = res.ag_paste_stats_daily;
        if (!stats || !stats._pending || stats._pending.length === 0) return;

        const last = stats._pending.pop();
        const bucket = stats.types[last.type];
        if (!bucket) return;

        // Remove the last occurrence of this length from the bucket
        const idx = bucket.lengths.lastIndexOf(last.length);
        if (idx !== -1) bucket.lengths.splice(idx, 1);
        bucket.count = Math.max(0, bucket.count - 1);

        // Clean up empty type buckets
        if (bucket.count === 0) delete stats.types[last.type];

        chrome.storage.local.set({ ag_paste_stats_daily: stats });
    });
};

// ─── recordSmartPasteSuccess ──────────────────────────────────────────────────
/**
 * Record a smart paste attachment that was actually sent in a message by the user.
 * Stored under stats.smart_pastes = { count, lengths } and flushed at UTC midnight.
 */
window.AskGemini.recordSmartPasteSuccess = function recordSmartPasteSuccess(length) {
    if (typeof length !== 'number' || length <= 0) return;
    const today = new Date().toISOString().slice(0, 10);

    chrome.storage.local.get(['ag_paste_stats_daily'], (res) => {
        let stats = res.ag_paste_stats_daily;
        if (!stats || stats.date !== today) {
            stats = { date: today, types: {}, smart_pastes: { count: 0, lengths: [] }, _pending: [] };
        }
        stats.smart_pastes = stats.smart_pastes || { count: 0, lengths: [] };
        stats.smart_pastes.count++;
        stats.smart_pastes.lengths.push(length);

        chrome.storage.local.set({ ag_paste_stats_daily: stats });
    });
};
