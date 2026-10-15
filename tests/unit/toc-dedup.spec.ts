import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('TOC Prompt DOM Navigation & Extraction', () => {
    beforeEach(() => {
        (globalThis as any).window = globalThis;
        delete (globalThis as any).AskGemini;
        delete (globalThis as any).AG;

        // Mock chrome API for storage & icons
        (globalThis as any).chrome = {
            runtime: {
                getURL: vi.fn(() => 'chrome-extension://dummy/icons/icon48.png')
            },
            storage: {
                local: {
                    get: vi.fn((_keys, cb) => cb && cb({})),
                    set: vi.fn()
                }
            }
        };

        // Mock IntersectionObserver for Node/JSDOM
        (globalThis as any).IntersectionObserver = class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        };

        // Load toc.js (reverted to commit f4a3866)
        const tocCode = fs.readFileSync(path.resolve(__dirname, '../../toc.js'), 'utf8');
        new Function(tocCode)();

        document.body.innerHTML = '';
    });

    it('buildTableOfContents creates exactly 1 TOC item per user-query element in DOM', () => {
        const AG = (globalThis as any).AskGemini;
        AG.tocEnabled = true;

        const prompt1 = document.createElement('user-query');
        prompt1.innerHTML = `
            <div class="user-query-container">
                <p class="query-text">What is quantum computing?</p>
            </div>
        `;
        const prompt2 = document.createElement('user-query');
        prompt2.innerHTML = `
            <div class="user-query-container">
                <p class="query-text">How does superposition work?</p>
            </div>
        `;
        document.body.appendChild(prompt1);
        document.body.appendChild(prompt2);

        AG.buildTableOfContents();

        const widget = document.getElementById('ag-toc-widget');
        expect(widget).not.toBeNull();

        const tocItems = widget?.querySelectorAll('.ag-toc-item');
        expect(tocItems?.length).toBe(2);

        const countBadge = widget?.querySelector('.ag-toc-count-badge');
        expect(countBadge?.textContent).toBe('2');

        expect(prompt1.id).toBe('ag-toc-prompt-0');
        expect(prompt2.id).toBe('ag-toc-prompt-1');
    });

    it('extractCleanPromptText correctly cleans prompt text from attachments and headings', () => {
        const AG = (globalThis as any).AskGemini;

        // Case 1: Standard user query
        const container1 = document.createElement('user-query');
        container1.innerHTML = `
            <div class="user-query-container">
                <p class="query-text">Can service workers retain state in memory?</p>
            </div>
        `;
        expect(AG.extractCleanPromptText(container1)).toBe('Can service workers retain state in memory?');

        // Case 2: Query with file chip and attachment button
        const container2 = document.createElement('user-query');
        container2.innerHTML = `
            <div class="user-query-container">
                <div class="file-chip">document.pdf</div>
                <button type="button">Remove</button>
                <p class="query-text">Analyze this document</p>
            </div>
        `;
        expect(AG.extractCleanPromptText(container2)).toBe('Analyze this document');

        // Case 3: Leading "You said" prefix
        const container3 = document.createElement('user-query');
        container3.innerHTML = `
            <div class="user-query-container">
                <p class="query-text">You said Explain the difference between local and sync storage</p>
            </div>
        `;
        expect(AG.extractCleanPromptText(container3)).toBe('Explain the difference between local and sync storage');
    });

    it('scrollToPrompt accurately triggers scrollIntoView on target prompt element', () => {
        const AG = (globalThis as any).AskGemini;

        const p0 = document.createElement('user-query');
        p0.id = 'ag-toc-prompt-0';
        p0.innerHTML = '<p class="query-text">First Prompt</p>';

        const p1 = document.createElement('user-query');
        p1.id = 'ag-toc-prompt-1';
        p1.innerHTML = '<p class="query-text">Second Prompt</p>';

        document.body.appendChild(p0);
        document.body.appendChild(p1);

        // Mock scrollIntoView
        p1.scrollIntoView = vi.fn();

        AG.scrollToPrompt('ag-toc-prompt-1', 1);

        expect(p1.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });

    it('removeTOCWidget cleans up widget element and resets state', () => {
        const AG = (globalThis as any).AskGemini;
        AG.tocEnabled = true;

        const p = document.createElement('user-query');
        p.innerHTML = '<p class="query-text">Hello</p>';
        document.body.appendChild(p);

        AG.buildTableOfContents();
        expect(document.getElementById('ag-toc-widget')).not.toBeNull();

        AG.removeTOCWidget();
        expect(document.getElementById('ag-toc-widget')).toBeNull();
        expect(AG.tocExpanded).toBe(false);
    });
});
