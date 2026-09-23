import { describe, it, expect } from 'vitest';

/**
 * Pure helper logic mirrored from bookmarks.js & content.js
 * to verify prompt normalization, screen-reader deduplication, and time formatting.
 */

function deduplicateText(str: string): string {
    if (!str || typeof str !== 'string') return '';
    str = str.trim();
    if (str.length < 4) return str;

    const lines = str.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 2 && lines[0] === lines[1]) {
        return lines[0];
    }
    const half = Math.floor(str.length / 2);
    const firstHalf = str.slice(0, half).trim();
    const secondHalf = str.slice(half).trim();
    if (firstHalf && firstHalf === secondHalf) {
        return firstHalf;
    }
    return str;
}

function cleanPromptText(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    let cleaned = raw;
    // Strip leading "You said" screen reader label
    cleaned = cleaned.replace(/^\s*You said\s*/i, '');
    // Strip duplicate block
    cleaned = deduplicateText(cleaned);
    return cleaned.trim();
}

function formatRelativeTime(timestamp: number, now = Date.now()): string {
    if (!timestamp) return '';
    const diff = Math.max(0, now - timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function extractConversationId(url: string): string {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const appIdx = segments.indexOf('app');
        if (appIdx !== -1 && segments[appIdx + 1]) {
            return segments[appIdx + 1];
        }
        return segments.length > 0 ? segments[segments.length - 1] : 'current';
    } catch (e) {
        return 'current';
    }
}

describe('Bookmarks Helper Functions', () => {
    describe('cleanPromptText & deduplicateText', () => {
        it('removes screen-reader "You said" prefix cleanly', () => {
            const input = 'You said\n\nExplain quantum computing in simple terms';
            expect(cleanPromptText(input)).toBe('Explain quantum computing in simple terms');
        });

        it('deduplicates doubled line strings', () => {
            const input = 'How does photosynthesis work?\nHow does photosynthesis work?';
            expect(cleanPromptText(input)).toBe('How does photosynthesis work?');
        });

        it('deduplicates identical halved strings', () => {
            const input = 'Compare Python vs RustCompare Python vs Rust';
            expect(cleanPromptText(input)).toBe('Compare Python vs Rust');
        });

        it('preserves clean single prompts without alteration', () => {
            const input = 'Write a poem about space exploration';
            expect(cleanPromptText(input)).toBe('Write a poem about space exploration');
        });
    });

    describe('formatRelativeTime', () => {
        const baseNow = 1700000000000;

        it('returns "Just now" for less than a minute', () => {
            expect(formatRelativeTime(baseNow - 10000, baseNow)).toBe('Just now');
        });

        it('returns "1 min ago" for 60 seconds', () => {
            expect(formatRelativeTime(baseNow - 60000, baseNow)).toBe('1 min ago');
        });

        it('returns "5 mins ago" for 5 minutes', () => {
            expect(formatRelativeTime(baseNow - 300000, baseNow)).toBe('5 mins ago');
        });

        it('returns "1 hour ago" for 1 hour', () => {
            expect(formatRelativeTime(baseNow - 3600000, baseNow)).toBe('1 hour ago');
        });

        it('returns "Yesterday" for 24 hours ago', () => {
            expect(formatRelativeTime(baseNow - 86400000, baseNow)).toBe('Yesterday');
        });
    });

    describe('extractConversationId', () => {
        it('extracts ID from standard gemini.google.com/app/<id> URLs', () => {
            expect(extractConversationId('https://gemini.google.com/app/c597e33893e0497e')).toBe('c597e33893e0497e');
        });

        it('handles URLs without app segment gracefully', () => {
            expect(extractConversationId('https://gemini.google.com/')).toBe('current');
        });
    });
});
