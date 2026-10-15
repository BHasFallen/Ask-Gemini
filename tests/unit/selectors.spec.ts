import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

class MockStorageArea {
    private store: Record<string, any> = {};

    get(keys: string | string[], cb: (res: Record<string, any>) => void) {
        const res: Record<string, any> = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
            res[k] = this.store[k];
        }
        setTimeout(() => cb(res), 0);
    }

    set(items: Record<string, any>, cb?: () => void) {
        Object.assign(this.store, items);
        if (cb) setTimeout(cb, 0);
    }

    clear() {
        this.store = {};
    }
}

describe('Dynamic Selectors Registry', () => {
    let mockStorage: MockStorageArea;

    beforeEach(() => {
        mockStorage = new MockStorageArea();
        (globalThis as any).chrome = {
            storage: {
                local: mockStorage,
            },
        };
        (globalThis as any).window = globalThis;
        delete (globalThis as any).AskGemini;
        delete (globalThis as any).AG;

        // Load selectors.js code into execution context
        const code = fs.readFileSync(path.resolve(__dirname, '../../selectors.js'), 'utf8');
        new Function(code)();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exposes AG.selectors with complete defaults', () => {
        const AG = (globalThis as any).AskGemini;
        expect(AG).toBeDefined();
        expect(AG.selectors).toBeDefined();

        const defaults = AG.selectors.defaults;
        expect(defaults.sidebarExpandedNav).toContain('mat-nav-list');
        expect(defaults.sidebarStudentsItem).toContain('learn-side-nav-entry-button');
        expect(defaults.sidebarMoreItem).toContain('overflow-side-nav-entry-button');
        expect(defaults.userQuery).toContain('user-query');
        expect(defaults.modelResponse).toContain('model-response');
        expect(defaults.nativeQuoteReply).toContain('.submitted-quote-container');
        expect(defaults.nativeQuoteButton).toContain('prompt_suggestion');

        expect(AG.selectors.get('sidebarStudentsItem')).toBe(defaults.sidebarStudentsItem);
    });

    it('allows local overrides via applyOverrides', () => {
        const AG = (globalThis as any).AskGemini;
        AG.selectors.applyOverrides({
            sidebarStudentsItem: '[data-test-id="new-student-button-v2"]',
        });

        expect(AG.selectors.get('sidebarStudentsItem')).toBe('[data-test-id="new-student-button-v2"]');
        // Unmodified keys remain at default
        expect(AG.selectors.get('sidebarMoreItem')).toBe(AG.selectors.defaults.sidebarMoreItem);
    });

    it('falls back to default selector if queried key does not exist or override is empty', () => {
        const AG = (globalThis as any).AskGemini;
        AG.selectors.applyOverrides({
            sidebarStudentsItem: '   ', // empty string
        });

        expect(AG.selectors.get('sidebarStudentsItem')).toBe(AG.selectors.defaults.sidebarStudentsItem);
        expect(AG.selectors.get('nonExistentKey', '.fallback-el')).toBe('.fallback-el');
    });

    it('queries DOM safely using AG.selectors.query', () => {
        const AG = (globalThis as any).AskGemini;

        const container = document.createElement('div');
        const navItem = document.createElement('div');
        navItem.setAttribute('data-test-id', 'learn-side-nav-entry-button');
        container.appendChild(navItem);

        const found = AG.selectors.query('sidebarStudentsItem', container);
        expect(found).toBe(navItem);

        // Unknown key returns null safely
        const missing = AG.selectors.query('nonExistentKey', container);
        expect(missing).toBeNull();
    });

    it('resets back to defaults cleanly with reset()', () => {
        const AG = (globalThis as any).AskGemini;
        AG.selectors.applyOverrides({
            sidebarExpandedNav: '.custom-sidebar',
        });
        expect(AG.selectors.get('sidebarExpandedNav')).toBe('.custom-sidebar');

        AG.selectors.reset();
        expect(AG.selectors.get('sidebarExpandedNav')).toBe(AG.selectors.defaults.sidebarExpandedNav);
    });
});
