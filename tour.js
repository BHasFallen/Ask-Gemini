/**
 * Ask Gemini: Interactive Guided Tour on gemini.google.com
 */

class AskGeminiTour {
    static step = 1;
    static step1ListenersAttached = false;
    static step4ListenersAttached = false;

    static init() {
        chrome.storage.local.get(['ask_gemini_tour_active', 'tour_step'], (res) => {
            if (res.ask_gemini_tour_active) {
                this.step = res.tour_step || 1;
                this.createUI();
                this.runLoop();
            }
        });
    }

    static createUI() {
        if (document.getElementById('ag-tour-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'ag-tour-overlay';
        overlay.innerHTML = `
            <svg width="100%" height="100%" style="position:absolute;top:0;left:0;">
                <defs>
                    <mask id="ag-spotlight-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <!-- Primary spotlight -->
                        <rect id="ag-spotlight-cutout" x="0" y="0" width="0" height="0" rx="10" fill="black" />
                        <!-- Secondary spotlight (for send button alongside input) -->
                        <rect id="ag-spotlight-cutout-2" x="0" y="0" width="0" height="0" rx="10" fill="black" />
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.75)" mask="url(#ag-spotlight-mask)" />
            </svg>
            <div id="ag-tour-tooltip" class="ag-tour-card" style="opacity: 0; pointer-events: none;">
                <div id="ag-tour-step" class="ag-tour-step">Step 1</div>
                <h3 id="ag-tour-title" class="ag-tour-title">Welcome</h3>
                <p id="ag-tour-text" class="ag-tour-text">...</p>
                <button id="ag-tour-ok" class="ag-tour-btn" style="display: none;">Got it! 🎉</button>
                <button id="ag-tour-skip" class="ag-tour-btn ag-tour-btn-skip">Skip Tour</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('ag-tour-skip').addEventListener('click', () => this.endTour());
        document.getElementById('ag-tour-ok').addEventListener('click', () => this.endTour());
    }

    static endTour() {
        chrome.storage.local.set({ ask_gemini_tour_active: false });
        const overlay = document.getElementById('ag-tour-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.4s ease';
            setTimeout(() => overlay.remove(), 400);
        }
        this.step = 99;
    }

    /**
     * Spotlight a single element
     */
    static spotlightEl(cutoutId, el, padding = 12) {
        const cutout = document.getElementById(cutoutId);
        if (!cutout) return;
        if (!el || el.offsetParent === null) {
            cutout.setAttribute('width', '0');
            cutout.setAttribute('height', '0');
            return;
        }
        const r = el.getBoundingClientRect();
        cutout.setAttribute('x', r.left - padding);
        cutout.setAttribute('y', r.top - padding);
        cutout.setAttribute('width', r.width + padding * 2);
        cutout.setAttribute('height', r.height + padding * 2);
    }

    /**
     * Hide a secondary spotlight cutout
     */
    static clearSpotlight2() {
        const c2 = document.getElementById('ag-spotlight-cutout-2');
        if (c2) { c2.setAttribute('width', '0'); c2.setAttribute('height', '0'); }
    }

    /**
     * Position the tooltip card near a target rect
     */
    static positionTooltip(anchorRect, position = 'top') {
        const tooltip = document.getElementById('ag-tour-tooltip');
        if (!tooltip) return;

        tooltip.style.opacity = '1';
        tooltip.style.pointerEvents = 'auto';

        if (!anchorRect) {
            // Centered
            tooltip.style.left = '50%';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
            return;
        }

        tooltip.style.transform = 'none';
        const TW = 320, TH = 200;
        let x = anchorRect.left + anchorRect.width / 2 - TW / 2;
        let y;

        if (position === 'top') y = anchorRect.top - TH - 16;
        else if (position === 'bottom') y = anchorRect.bottom + 16;
        else y = anchorRect.top;

        // Clamp within viewport
        x = Math.max(16, Math.min(window.innerWidth - TW - 16, x));
        y = Math.max(16, Math.min(window.innerHeight - TH - 16, y));

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    /**
     * Full tooltip setter: updates text + spotlights + positions card
     */
    static setTooltip({ stepName, title, text, primaryEl, secondaryEl, position = 'top' }) {
        const stepEl = document.getElementById('ag-tour-step');
        const titleEl = document.getElementById('ag-tour-title');
        const textEl = document.getElementById('ag-tour-text');
        if (!stepEl || !titleEl || !textEl) return;

        stepEl.innerText = stepName;
        titleEl.innerText = title;
        textEl.innerHTML = text;

        this.spotlightEl('ag-spotlight-cutout', primaryEl);
        if (secondaryEl) {
            this.spotlightEl('ag-spotlight-cutout-2', secondaryEl);
        } else {
            this.clearSpotlight2();
        }

        // Anchor tooltip to primary element if available, else center
        const anchorRect = primaryEl && primaryEl.offsetParent !== null
            ? primaryEl.getBoundingClientRect()
            : null;
        this.positionTooltip(anchorRect, position);
    }

    static runLoop() {
        if (this.step >= 99) return;
        const loop = setInterval(() => {
            if (this.step >= 99) { clearInterval(loop); return; }
            this.evaluateStep();
        }, 400);
    }

    // ─── Selectors (from real Gemini DOM) ────────────────────────────────────
    static getInput() {
        return document.querySelector('.ql-editor[contenteditable="true"]')
            || document.querySelector('div[contenteditable="true"]');
    }

    static getSendButton() {
        return document.querySelector('button.send-button')
            || document.querySelector('button[aria-label="Send message"]');
    }

    static getLatestGeminiReply() {
        // Get all finished (not busy) markdown panels, return the last one
        const panels = document.querySelectorAll('.markdown-main-panel[aria-busy="false"]');
        if (!panels.length) return null;
        return panels[panels.length - 1];
    }

    // ─── Step machine ────────────────────────────────────────────────────────
    static evaluateStep() {

        // ── Step 1: Type & send a message ──────────────────────────────
        if (this.step === 1) {
            const input = this.getInput();
            const send = this.getSendButton();

            if (input && input.offsetParent !== null) {
                this.setTooltip({
                    stepName: 'Step 1 of 4',
                    title: 'Say Hello to Gemini',
                    text: 'Type a quick message in the box below, then hit <b>Send</b> to start the conversation!',
                    primaryEl: input,
                    secondaryEl: send,
                    position: 'top'
                });

                if (!this.step1ListenersAttached) {
                    this.step1ListenersAttached = true;

                    const advance = () => {
                        if (this.step !== 1) return;
                        this.step = 2;
                        chrome.storage.local.set({ tour_step: 2 });
                    };

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) advance();
                    });
                    document.addEventListener('click', (e) => {
                        if (e.target.closest('button.send-button, button[aria-label="Send message"]')) advance();
                    }, true);
                }
            }
        }

        // ── Step 2: Wait for reply, then highlight it ──────────────────
        else if (this.step === 2) {
            const reply = this.getLatestGeminiReply();

            if (!reply) {
                // Still generating — show centered "waiting" card, no spotlight
                this.setTooltip({
                    stepName: 'Step 2 of 4',
                    title: 'Gemini is Thinking…',
                    text: 'Wait for the reply to finish, then <b>highlight a sentence</b> in Gemini\'s response using your mouse.',
                    primaryEl: null,
                    position: 'top'
                });
            } else {
                // Reply is ready — spotlight it and prompt user to highlight
                this.setTooltip({
                    stepName: 'Step 2 of 4',
                    title: 'Highlight a Sentence',
                    text: 'Gemini replied! Now <b>click and drag</b> to highlight any word or sentence in that response.',
                    primaryEl: reply,
                    position: 'top'
                });
            }

            // Advance when the extension's float button appears (user highlighted something)
            const floatBtn = document.getElementById('ask-gemini-float-btn');
            if (floatBtn && floatBtn.style.display !== 'none') {
                this.step = 3;
                chrome.storage.local.set({ tour_step: 3 });
            }
        }

        // ── Step 3: Click the float button ─────────────────────────────
        else if (this.step === 3) {
            const floatBtn = document.getElementById('ask-gemini-float-btn');
            const reply = this.getLatestGeminiReply();

            if (floatBtn && floatBtn.style.display !== 'none') {
                this.setTooltip({
                    stepName: 'Step 3 of 4',
                    title: 'Click "Ask Gemini"',
                    text: 'The floating button appeared! Click it to <b>lock in your highlighted context</b>.',
                    primaryEl: floatBtn,
                    secondaryEl: reply,
                    position: 'bottom'
                });
            } else {
                // Selection was lost — go back to step 2
                this.step = 2;
                chrome.storage.local.set({ tour_step: 2 });
                return;
            }

            const contextBox = document.getElementById('ask-gemini-context-box');
            if (contextBox && contextBox.style.display !== 'none') {
                this.step = 4;
                chrome.storage.local.set({ tour_step: 4 });
            }
        }

        // ── Step 4: Type reply & send ──────────────────────────────────
        else if (this.step === 4) {
            const input = this.getInput();
            const send = this.getSendButton();
            const contextBox = document.getElementById('ask-gemini-context-box');

            if (!contextBox || contextBox.style.display === 'none') {
                this.step = 2; return; // context cleared, restart
            }

            if (input) {
                this.setTooltip({
                    stepName: 'Step 4 of 4',
                    title: 'Context Locked! Now Reply',
                    text: 'Type your follow-up (e.g. <i>"expand on this"</i>) and hit <b>Send</b> to reply with perfect context!',
                    primaryEl: input,
                    secondaryEl: send,
                    position: 'top'
                });

                if (!this.step4ListenersAttached) {
                    this.step4ListenersAttached = true;

                    const advance = () => {
                        if (this.step !== 4) return;
                        this.step = 5;
                        chrome.storage.local.set({ tour_step: 5 });
                    };

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) advance();
                    });
                    document.addEventListener('click', (e) => {
                        if (e.target.closest('button.send-button, button[aria-label="Send message"]')) advance();
                    }, true);
                }
            }
        }

        // ── Step 5: Done ───────────────────────────────────────────────
        else if (this.step === 5) {
            this.clearSpotlight2();
            this.setTooltip({
                stepName: '🎉 Done!',
                title: "You're a Pro Now",
                text: "You've mastered contextual replies on Gemini. Every reply from here on will be laser-precise. Enjoy!",
                primaryEl: null
            });

            const stepEl = document.getElementById('ag-tour-step');
            if (stepEl) {
                stepEl.style.background = 'rgba(56, 239, 125, 0.15)';
                stepEl.style.color = '#38ef7d';
            }
            document.getElementById('ag-tour-skip').style.display = 'none';
            document.getElementById('ag-tour-ok').style.display = 'block';
        }
    }
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AskGeminiTour.init());
} else {
    AskGeminiTour.init();
}
