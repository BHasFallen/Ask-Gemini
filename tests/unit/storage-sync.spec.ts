import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock Chrome Storage Area Implementation
 */
class MockStorageArea {
    private store: Record<string, any> = {};
    private listeners: Array<(changes: Record<string, any>, area: string) => void> = [];

    addListener(fn: (changes: Record<string, any>, area: string) => void) {
        this.listeners.push(fn);
    }

    async get(keys?: string | string[] | Record<string, any>): Promise<Record<string, any>> {
        if (!keys) return { ...this.store };
        if (typeof keys === 'string') return { [keys]: this.store[keys] };
        if (Array.isArray(keys)) {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = this.store[k];
            return res;
        }
        return { ...this.store };
    }

    async set(items: Record<string, any>): Promise<void> {
        const changes: Record<string, any> = {};
        for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: this.store[k], newValue: v };
            this.store[k] = v;
        }
        for (const l of this.listeners) {
            l(changes, 'local');
        }
    }

    async remove(key: string): Promise<void> {
        delete this.store[key];
    }

    clear(): void {
        this.store = {};
    }
}

describe('Chrome Storage Synchronization & Defaults', () => {
    let mockStorage: MockStorageArea;

    beforeEach(() => {
        mockStorage = new MockStorageArea();
        (globalThis as any).chrome = {
            storage: {
                local: mockStorage,
                onChanged: {
                    addListener: (fn: any) => mockStorage.addListener(fn),
                },
            },
        };
    });

    it('defaults features to enabled when storage is initially empty', async () => {
        const res = await (chrome.storage.local as any).get(['bookmarks_enabled', 'quote_reply_enabled']);
        // If undefined in storage, default fallback is true
        const bookmarksEnabled = res.bookmarks_enabled !== false;
        const quoteReplyEnabled = res.quote_reply_enabled !== false;

        expect(bookmarksEnabled).toBe(true);
        expect(quoteReplyEnabled).toBe(true);
    });

    it('dispatches onChanged events to listeners on state update', async () => {
        const listener = vi.fn();
        chrome.storage.onChanged.addListener(listener);

        await (chrome.storage.local as any).set({ bookmarks_enabled: false });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
            { bookmarks_enabled: { oldValue: undefined, newValue: false } },
            'local'
        );
    });

    it('preserves user bookmarks list across save and retrieve cycles', async () => {
        const sampleBookmark = {
            id: 'ag_bm_test_1',
            promptText: 'Summarize quantum mechanics',
            responseText: 'Quantum mechanics is the study of matter and light at the subatomic level.',
            createdAt: Date.now()
        };

        await (chrome.storage.local as any).set({ ag_bookmarks: [sampleBookmark] });

        const retrieved = await (chrome.storage.local as any).get(['ag_bookmarks']);
        expect(retrieved.ag_bookmarks).toHaveLength(1);
        expect(retrieved.ag_bookmarks[0].id).toBe('ag_bm_test_1');
    });
});
