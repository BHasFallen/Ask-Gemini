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

// ─── recordPasteStats (DEPRECATED) ──────────────────────────────────────────
/**
 * Deprecated: paste_daily_summary event is deprecated.
 * Preserved as a safe no-op so callers do not error.
 */
window.AskGemini.recordPasteStats = function recordPasteStats(_text) {
    // No-op: daily summary event is deprecated
};

// ─── cancelLastPasteStat (DEPRECATED) ────────────────────────────────────────
/**
 * Deprecated: paste_daily_summary event is deprecated.
 * Preserved as a safe no-op so callers do not error.
 */
window.AskGemini.cancelLastPasteStat = function cancelLastPasteStat() {
    // No-op: daily summary event is deprecated
};

// ─── recordSmartPasteSuccess (DEPRECATED) ────────────────────────────────────
/**
 * Deprecated: paste_daily_summary event is deprecated.
 * Preserved as a safe no-op so callers do not error.
 */
window.AskGemini.recordSmartPasteSuccess = function recordSmartPasteSuccess(_lengthsOrLength) {
    // No-op: daily summary event is deprecated
};
