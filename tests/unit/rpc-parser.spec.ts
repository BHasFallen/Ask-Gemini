import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Google batchexecute RPC Parser Suite', () => {
    let AG: any;

    beforeEach(() => {
        delete (globalThis as any).AskGemini;
        delete (globalThis as any).AG;

        const code = fs.readFileSync(path.resolve(__dirname, '../../rpc-client.js'), 'utf8');
        new Function(code)();
        AG = (globalThis as any).AskGemini;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('extracts conversation ID from current location pathname', () => {
        expect(AG.rpc.extractConvoId('https://gemini.google.com/app/abc123xyz789')).toBe('abc123xyz789');
        expect(AG.rpc.extractConvoId('https://gemini.google.com/app/chat-convo-999')).toBe('chat-convo-999');
        expect(AG.rpc.extractConvoId('https://gemini.google.com/app')).toBeNull();
    });

    it('parses realistic Google batchexecute response text', () => {
        // High-fidelity replica of Google batchexecute multi-line chunked format
        const turn0 = [
            // Turn 1
            [
                "c_abc123",
                "t_001"
            ],
            null,
            [
                ["What is Manifest V3?"] // User prompt at [2][0][0]
            ],
            [
                [
                    [
                        null,
                        "Manifest V3 is the latest Chrome extension platform.", // Model reply at [3][0][0][1]
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        [["Thinking step: Explain MV3 features"]] // Thinking block at [3][0][0][37][0][0]
                    ]
                ],
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "gemini-2.0-flash" // Model ID at [3][21]
            ],
            [
                1728648000 // Timestamp at [4][0]
            ]
        ];

        const samplePayload = [
            [turn0], // Array of turns at payload[0]
            "cursor_page_2" // Continuation cursor at payload[1]
        ];

        const innerJson = JSON.stringify(samplePayload);
        const rpcChunk = JSON.stringify([
            "wrb.fr",
            "hNvQHb",
            innerJson,
            null,
            null,
            null,
            "generic"
        ]);

        const fullRawText = ")]}'\n\n1234\n[[" + rpcChunk.slice(1, -1) + "]]\n";

        const parsed = AG.rpc.parseBatchexecuteText(fullRawText);
        expect(parsed.rawItems).toHaveLength(1);

        const turn = AG.rpc.parseTurnItem(parsed.rawItems[0], 0, 'abc123xyz789');
        expect(turn).toBeDefined();
        expect(turn.userPrompt).toBe('What is Manifest V3?');
        expect(turn.modelReply).toBe('Manifest V3 is the latest Chrome extension platform.');
        expect(turn.modelId).toBe('gemini-2.0-flash');
        expect(turn.thinking).toBe('Thinking step: Explain MV3 features');
        expect(turn.timestamp).toBe(1728648000 * 1000);
    });

    it('handles malformed, empty, or unexpected batchexecute data gracefully', () => {
        expect(AG.rpc.parseBatchexecuteText('')).toEqual({ rawItems: [], continueCursor: null });
        expect(AG.rpc.parseBatchexecuteText(')]}\'\nINVALID')).toEqual({ rawItems: [], continueCursor: null });
        expect(AG.rpc.parseBatchexecuteText(')]}\'\n[[]]')).toEqual({ rawItems: [], continueCursor: null });

        expect(AG.rpc.parseTurnItem(null, 0, 'convo1')).toBeNull();
        expect(AG.rpc.parseTurnItem([], 0, 'convo1')).toEqual({
            turnIndex: 0,
            turnId: 'convo1_turn_0',
            userPrompt: '',
            modelReply: '',
            modelId: 'gemini',
            thinking: '',
            citations: [],
            timestamp: expect.any(Number),
        });
    });
});
