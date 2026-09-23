import { describe, it, expect, beforeEach } from 'vitest';

describe('Auto Mode Model Ingestion & Payload Modification', () => {
    const AUTO_MODEL_ITEM = [
        "a74ec8485b3b5ce4", "Auto", "Adapts to your needs",
        [2,49,52,53,140,3,4,5,6,7,8,62,9,10,11,231,12,55,15,0,18,20,22,23,25,61,87,80,82,229,13,26,60,32,184,92,112,94,150,103,107,166,136,143,144,154,158,159,165,170,176,179,209,181,195,196,201,232,233,234,236,237,238,239,241,250,251,259],
        2, null, null, null, null, null, "Auto", "Auto", "Adapts to your needs", null, null, null, null, 4,
        ["https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/hdr_auto/default/24px.svg", true]
    ];

    function injectAutoModePayload(responseText: string, active: boolean = true): string {
        if (!active || !responseText || typeof responseText !== 'string' || !responseText.includes('otAQ7b')) {
            return responseText;
        }
        try {
            const lines = responseText.split('\n');
            let modified = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.includes('"otAQ7b"')) {
                    const outer = JSON.parse(line);
                    for (let item of outer) {
                        if (item[1] === 'otAQ7b' && typeof item[2] === 'string') {
                            const inner = JSON.parse(item[2]);
                            if (Array.isArray(inner) && Array.isArray(inner[15])) {
                                const alreadyHas = inner[15].some((m: any) => m && m[0] === 'a74ec8485b3b5ce4');
                                if (!alreadyHas) {
                                    inner[15].unshift(AUTO_MODEL_ITEM);
                                    item[2] = JSON.stringify(inner);
                                    lines[i] = JSON.stringify(outer);
                                    if (i > 0 && /^\d+$/.test(lines[i - 1].trim())) {
                                        lines[i - 1] = lines[i].length.toString();
                                    }
                                    modified = true;
                                }
                            }
                        }
                    }
                }
            }
            return modified ? lines.join('\n') : responseText;
        } catch (_) {
            return responseText;
        }
    }

    const mockAppResponse = `)]}'

1000
[["wrb.fr","otAQ7b","[1,[false,null,false],false,null,null,null,true,null,null,null,null,null,false,false,null,[[\\"8c46e95b1a07cecc\\",\\"Flash-Lite\\",\\"Fastest answers\\"],[\\"56fdd199312815e2\\",\\"Flash\\",\\"All-around help\\"]]]"]]`;

    it('injects Auto mode (a74ec8485b3b5ce4) at index 0 of models array', () => {
        const modified = injectAutoModePayload(mockAppResponse, true);
        expect(modified).toContain('a74ec8485b3b5ce4');
        expect(modified).toContain('Auto');
        expect(modified).toContain('Adapts to your needs');

        // Parse modified payload to verify index order
        const line = modified.split('\n').find(l => l.includes('otAQ7b'))!;
        const outer = JSON.parse(line);
        const inner = JSON.parse(outer[0][2]);
        const modes = inner[15];

        expect(modes.length).toBe(3);
        expect(modes[0][0]).toBe('a74ec8485b3b5ce4');
        expect(modes[0][1]).toBe('Auto');
        expect(modes[1][1]).toBe('Flash-Lite');
        expect(modes[2][1]).toBe('Flash');
    });

    it('does not re-inject if Auto mode is already present', () => {
        const once = injectAutoModePayload(mockAppResponse, true);
        const twice = injectAutoModePayload(once, true);
        
        const line = twice.split('\n').find(l => l.includes('otAQ7b'))!;
        const outer = JSON.parse(line);
        const inner = JSON.parse(outer[0][2]);
        const autoCount = inner[15].filter((m: any) => m[0] === 'a74ec8485b3b5ce4').length;
        expect(autoCount).toBe(1);
    });

    it('passes through unmodified if autoModeActive is false', () => {
        const untouched = injectAutoModePayload(mockAppResponse, false);
        expect(untouched).not.toContain('a74ec8485b3b5ce4');
        expect(untouched).toBe(mockAppResponse);
    });
});

describe('Extended Thinking Protection & State Transition Suite', () => {
    it('detects Extended Thinking from picker secondary text or DOM attributes', () => {
        function checkExtendedThinking(secondaryText: string | null, isToggleChecked: boolean, subOptionActive: boolean): boolean {
            if (secondaryText && /extended\s*thinking|thinking/i.test(secondaryText)) {
                return true;
            }
            if (isToggleChecked) return true;
            if (subOptionActive) return true;
            return false;
        }

        expect(checkExtendedThinking('Extended thinking', false, false)).toBe(true);
        expect(checkExtendedThinking('Thinking...', false, false)).toBe(true);
        expect(checkExtendedThinking('', true, false)).toBe(true);
        expect(checkExtendedThinking(null, false, true)).toBe(true);
        expect(checkExtendedThinking('', false, false)).toBe(false);
        expect(checkExtendedThinking('Fastest answers', false, false)).toBe(false);
    });

    it('safely updates model label without overwriting Extended Thinking subtitle', () => {
        interface LabelState {
            primary: string;
            secondary: string;
        }

        function safeApplyLabel(
            state: LabelState,
            targetModel: string,
            isAuto: boolean,
            isThinkingActive: boolean
        ): LabelState {
            // If Extended Thinking is active, do NOT clobber primary or secondary thinking text
            if (isThinkingActive) {
                return state;
            }

            const next = { ...state };
            if (isAuto) {
                next.primary = 'Auto';
                // Only clear secondary if not thinking
                if (!/extended\s*thinking/i.test(next.secondary)) {
                    next.secondary = '';
                }
            } else {
                next.primary = targetModel;
            }
            return next;
        }

        // Standard auto apply
        const autoApplied = safeApplyLabel({ primary: 'Flash', secondary: '' }, 'Auto', true, false);
        expect(autoApplied.primary).toBe('Auto');
        expect(autoApplied.secondary).toBe('');

        // Extended thinking active: must protect state and not overwrite
        const thinkingProtected = safeApplyLabel(
            { primary: '3.1 Pro', secondary: 'Extended thinking' },
            'Auto',
            true,
            true
        );
        expect(thinkingProtected.primary).toBe('3.1 Pro');
        expect(thinkingProtected.secondary).toBe('Extended thinking');
    });

    it('disengages Auto mode when user clicks Extended Thinking option', () => {
        let currentSelectedModel: string | null = 'a74ec8485b3b5ce4';
        let isAutoActive = true;

        function handleOptionClick(clickedText: string) {
            const isThinkingClick = /extended\s*thinking|complex\s*problem\s*solving/i.test(clickedText);
            if (isThinkingClick) {
                if (currentSelectedModel === 'a74ec8485b3b5ce4') {
                    currentSelectedModel = null;
                    isAutoActive = false;
                }
                return { handledByAngular: true, disengagedAuto: true };
            }
            return { handledByAngular: false, disengagedAuto: false };
        }

        const result = handleOptionClick('Extended thinking Complex problem solving');
        expect(result.handledByAngular).toBe(true);
        expect(result.disengagedAuto).toBe(true);
        expect(currentSelectedModel).toBeNull();
        expect(isAutoActive).toBe(false);
    });
});

