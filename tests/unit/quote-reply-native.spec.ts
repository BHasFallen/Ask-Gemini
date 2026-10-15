import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Native Quote Reply Coexistence & Detection', () => {
    beforeEach(() => {
        // Setup minimal browser globals
        (globalThis as any).window = globalThis;
        (globalThis as any).chrome = {
            storage: {
                local: {
                    get: vi.fn((keys, cb) => cb({})),
                    set: vi.fn((items, cb) => cb && cb()),
                },
                onChanged: {
                    addListener: vi.fn(),
                },
            },
            runtime: {
                getManifest: vi.fn(() => ({ update_url: 'https://clients2.google.com/service/update2/crx' })),
            },
        };

        delete (globalThis as any).AskGemini;
        delete (globalThis as any).AG;

        // Load selectors.js first
        const selectorsCode = fs.readFileSync(path.resolve(__dirname, '../../selectors.js'), 'utf8');
        new Function(selectorsCode)();

        // Load quote-reply.js
        const quoteReplyCode = fs.readFileSync(path.resolve(__dirname, '../../quote-reply.js'), 'utf8');
        new Function(quoteReplyCode)();

        // Clear DOM
        document.body.innerHTML = '';
        delete (globalThis as any).AskGemini._nativeQuoteStyleDetected;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('returns false when no Google native quote elements or styles exist', () => {
        const AG = (globalThis as any).AskGemini;
        expect(AG.isNativeQuoteReplyActive()).toBe(false);
    });

    it('detects native quote when .submitted-quote-container is in DOM', () => {
        const AG = (globalThis as any).AskGemini;
        const nativeContainer = document.createElement('div');
        nativeContainer.className = 'submitted-quote-container';
        document.body.appendChild(nativeContainer);

        expect(AG.isNativeQuoteReplyActive()).toBe(true);
    });

    it('detects native quote when .submitted-quote-in-query is in DOM', () => {
        const AG = (globalThis as any).AskGemini;
        const nativeQuote = document.createElement('div');
        nativeQuote.className = 'submitted-quote-in-query';
        document.body.appendChild(nativeQuote);

        expect(AG.isNativeQuoteReplyActive()).toBe(true);
    });

    it('detects native prompt_suggestion icon outside extension elements', () => {
        const AG = (globalThis as any).AskGemini;
        const nativeIcon = document.createElement('gem-icon');
        nativeIcon.setAttribute('fonticonname', 'prompt_suggestion');
        document.body.appendChild(nativeIcon);

        expect(AG.isNativeQuoteReplyActive()).toBe(true);
    });

    it('ignores prompt_suggestion icon if it belongs to extension UI', () => {
        const AG = (globalThis as any).AskGemini;
        const floatBtn = document.createElement('button');
        floatBtn.id = 'ask-gemini-float-btn';
        const innerIcon = document.createElement('span');
        innerIcon.setAttribute('fonticonname', 'prompt_suggestion');
        floatBtn.appendChild(innerIcon);
        document.body.appendChild(floatBtn);

        expect(AG.isNativeQuoteReplyActive()).toBe(false);
    });

    it('suppresses extension float button when native quote reply is active', () => {
        const AG = (globalThis as any).AskGemini;
        const hideSpy = vi.spyOn(AG, 'hideFloatButton');

        // Add native element
        const nativeQuote = document.createElement('div');
        nativeQuote.className = 'submitted-quote-container';
        document.body.appendChild(nativeQuote);

        expect(AG.isNativeQuoteReplyActive()).toBe(true);

        // Trigger handleSelection
        AG.handleSelection();

        expect(hideSpy).toHaveBeenCalled();
        expect(document.querySelector('#ask-gemini-float-btn')).toBeNull();
    });

    it('records has_native_quote_reply user property without dispatching events', () => {
        const AG = (globalThis as any).AskGemini;
        const sendMsgSpy = vi.fn();
        (globalThis as any).chrome.runtime.sendMessage = sendMsgSpy;

        const nativeContainer = document.createElement('div');
        nativeContainer.className = 'submitted-quote-container';
        document.body.appendChild(nativeContainer);

        // Call detection
        expect(AG.isNativeQuoteReplyActive()).toBe(true);

        // Verify SET_USER_PROPERTY was dispatched with has_native_quote_reply: true
        expect(sendMsgSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SET_USER_PROPERTY',
            properties: { has_native_quote_reply: true }
        }));

        // Verify no TRACK_EVENT was dispatched
        const trackEventCalls = sendMsgSpy.mock.calls.filter(([arg]: any) => arg && arg.type === 'TRACK_EVENT');
        expect(trackEventCalls).toHaveLength(0);

        // Calling it again should not re-dispatch duplicate user property (once per session)
        const callsCount = sendMsgSpy.mock.calls.length;
        AG.isNativeQuoteReplyActive();
        expect(sendMsgSpy.mock.calls.length).toBe(callsCount);
    });

    it('creates and positions snippet bookmark button when text is selected', () => {
        const AG = (globalThis as any).AskGemini;
        AG.bookmarksEnabled = true;

        const mockRange = {
            getBoundingClientRect: () => ({ left: 100, right: 200, top: 300, bottom: 320, width: 100, height: 20 })
        };
        const mockSelection = {
            rangeCount: 1,
            getRangeAt: () => mockRange
        };

        const responseEl = document.createElement('model-response');
        document.body.appendChild(responseEl);

        AG.showSnippetBookmarkButton(mockSelection, 'Important insight', responseEl, true);

        const btn = document.querySelector('#ask-gemini-snippet-bm-btn') as HTMLElement;
        expect(btn).not.toBeNull();
        expect(btn.style.display).toBe('inline-flex');
        expect(btn.textContent).toContain('Bookmark');

        // Test hiding
        AG.hideSnippetBookmarkButton();
        expect(btn.style.display).toBe('none');
    });

    it('saves snippet bookmark via BookmarkManager on click', async () => {
        const AG = (globalThis as any).AskGemini;
        AG.bookmarksEnabled = true;

        const addSnippetSpy = vi.fn().mockResolvedValue({ id: 'bm_123', isSnippet: true });
        AG.BookmarkManager = {
            addSnippetBookmark: addSnippetSpy
        };

        const mockRange = {
            getBoundingClientRect: () => ({ left: 100, right: 200, top: 300, bottom: 320, width: 100, height: 20 })
        };
        const mockSelection = {
            rangeCount: 1,
            getRangeAt: () => mockRange
        };

        const responseEl = document.createElement('model-response');
        document.body.appendChild(responseEl);

        AG.showSnippetBookmarkButton(mockSelection, 'Key quote excerpt', responseEl, false);
        const btn = document.querySelector('#ask-gemini-snippet-bm-btn') as HTMLElement;
        expect(btn).not.toBeNull();

        // Click the snippet bookmark button
        btn.click();
        expect(addSnippetSpy).toHaveBeenCalledWith('Key quote excerpt', responseEl);
        expect(btn.textContent).toContain('Saved!');
    });

    it('findGoogleNativePill accurately docks beside native Ask Gemini button near selection', () => {
        const AG = (globalThis as any).AskGemini;
        const nativePill = document.createElement('button');
        nativePill.className = 'mat-mdc-button-base prompt-suggestion-button';
        nativePill.textContent = 'Ask Gemini';
        nativePill.getBoundingClientRect = () => ({
            left: 150,
            right: 250,
            top: 325,
            bottom: 357,
            width: 100,
            height: 32
        } as any);
        document.body.appendChild(nativePill);

        const mockRange = {
            getBoundingClientRect: () => ({ left: 100, right: 200, top: 300, bottom: 320, width: 100, height: 20 })
        };
        const mockSelection = {
            rangeCount: 1,
            getRangeAt: () => mockRange
        };

        const found = AG.findGoogleNativePill(mockSelection);
        expect(found).not.toBeNull();
        expect(found.btn).toBe(nativePill);
        expect(found.rect.height).toBe(32);
    });
});
