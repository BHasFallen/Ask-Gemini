import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('TOC Prompt Deduplication', () => {
    beforeEach(() => {
        (globalThis as any).window = globalThis;
        delete (globalThis as any).AskGemini;
        delete (globalThis as any).AG;

        // Load selectors.js
        const selectorsCode = fs.readFileSync(path.resolve(__dirname, '../../selectors.js'), 'utf8');
        new Function(selectorsCode)();

        // Load toc.js
        const tocCode = fs.readFileSync(path.resolve(__dirname, '../../toc.js'), 'utf8');
        new Function(tocCode)();

        document.body.innerHTML = '';
    });

    it('filters out nested descendants when selector matches both parent and inner containers', () => {
        const AG = (globalThis as any).AskGemini;
        expect(AG.getPromptElements).toBeDefined();

        // Simulate Gemini DOM: 2 prompts, each with nested user-query-container
        const prompt1 = document.createElement('user-query');
        prompt1.innerHTML = `
            <div class="user-query-container">
                <div class="user-query-container">
                    <p class="query-text">First prompt text</p>
                </div>
            </div>
        `;

        const prompt2 = document.createElement('user-query');
        prompt2.innerHTML = `
            <div class="user-query-container">
                <p class="query-text">Second prompt text</p>
            </div>
        `;

        document.body.appendChild(prompt1);
        document.body.appendChild(prompt2);

        // Even if userQuery selector was overridden to match both parent and container
        AG.selectors.applyOverrides({
            userQuery: 'user-query, .user-query-container'
        });

        const elements = AG.getPromptElements();
        expect(elements.length).toBe(2);
        expect(elements[0]).toBe(prompt1);
        expect(elements[1]).toBe(prompt2);
    });

    it('buildTableOfContents creates exactly 1 TOC item per prompt without triplication', () => {
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
    });

    it('populates all items from cachedRpcTurns even if older prompts are not in the DOM', () => {
        const AG = (globalThis as any).AskGemini;
        AG.tocEnabled = true;

        // Provide 5 turns from RPC
        AG.cachedRpcTurns = [
            { turnIndex: 0, userPrompt: 'Turn 1: History of Rome', modelReply: 'Rome was founded...' },
            { turnIndex: 1, userPrompt: 'Turn 2: Julius Caesar', modelReply: 'Caesar was born...' },
            { turnIndex: 2, userPrompt: 'Turn 3: Roman Republic', modelReply: 'The Republic was...' },
            { turnIndex: 3, userPrompt: 'Turn 4: Pax Romana', modelReply: 'Pax Romana began...' },
            { turnIndex: 4, userPrompt: 'Turn 5: Fall of Rome', modelReply: 'In 476 AD...' },
        ];

        // But in the DOM, only the last prompt is mounted (not scrolled up yet)
        const prompt5 = document.createElement('user-query');
        prompt5.innerHTML = `
            <div class="user-query-container">
                <p class="query-text">Turn 5: Fall of Rome</p>
            </div>
        `;
        document.body.appendChild(prompt5);

        AG.buildTableOfContents();

        const widget = document.getElementById('ag-toc-widget');
        expect(widget).not.toBeNull();

        const tocItems = widget?.querySelectorAll('.ag-toc-item');
        expect(tocItems?.length).toBe(5);

        const countBadge = widget?.querySelector('.ag-toc-count-badge');
        expect(countBadge?.textContent).toBe('5');

        // Verify all 5 titles are present in order
        const itemTexts = Array.from(widget?.querySelectorAll('.ag-toc-text') || []).map(el => el.textContent);
        expect(itemTexts[0]).toContain('Turn 1: History of Rome');
        expect(itemTexts[1]).toContain('Turn 2: Julius Caesar');
        expect(itemTexts[2]).toContain('Turn 3: Roman Republic');
        expect(itemTexts[3]).toContain('Turn 4: Pax Romana');
        expect(itemTexts[4]).toContain('Turn 5: Fall of Rome');
    });
});
