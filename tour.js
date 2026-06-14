/**
 * Quote Reply for Gemini: Interactive Guided Tour on gemini.google.com
 */

class AskGeminiTour {
    static step = 1;
    static lastTrackedStep = 0;
    static step1ListenersAttached = false;
    static step4ListenersAttached = false;

    static trackEvent(name, params = {}) {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            const mergedParams = { type: 'tour', ...params };
            chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name, params: mergedParams });
        }
    }

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
                        <rect id="ag-spotlight-cutout" x="0" y="0" width="0" height="0" rx="14" fill="black" />
                        <!-- Secondary spotlight (for send button alongside input) -->
                        <rect id="ag-spotlight-cutout-2" x="0" y="0" width="0" height="0" rx="14" fill="black" />
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.65)" mask="url(#ag-spotlight-mask)" />
            </svg>
            
            <!-- Glowing border outlines matching the active spotlights -->
            <div id="ag-tour-glow-outline-1" class="ag-tour-glow-outline"></div>
            <div id="ag-tour-glow-outline-2" class="ag-tour-glow-outline"></div>

            <div id="ag-tour-tooltip" class="ag-tour-card" style="opacity: 0; pointer-events: none;">
                <div id="ag-tour-step" class="ag-tour-step">Step 1</div>
                <h3 id="ag-tour-title" class="ag-tour-title">Welcome</h3>
                <p id="ag-tour-text" class="ag-tour-text">...</p>
                <button id="ag-tour-ok" class="ag-tour-btn" style="display: none;">Got it! 🎉</button>
                <button id="ag-tour-skip" class="ag-tour-btn ag-tour-btn-skip">Skip Tour</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('ag-tour-skip').addEventListener('click', () => {
            this.trackEvent('tour_skipped', { step: this.step });
            this.endTour();
        });
        document.getElementById('ag-tour-ok').addEventListener('click', () => {
            this.trackEvent('tour_completed');
            this.endTour();
        });
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
     * Spotlight a single element and match its glowing outline
     */
    static spotlightEl(cutoutId, outlineId, el, padding = 12) {
        const cutout = document.getElementById(cutoutId);
        const outline = document.getElementById(outlineId);
        if (!cutout) return;

        if (!el || el.offsetParent === null) {
            cutout.setAttribute('width', '0');
            cutout.setAttribute('height', '0');
            if (outline) outline.classList.remove('active');
            return;
        }

        const r = el.getBoundingClientRect();
        const x = r.left - padding;
        const y = r.top - padding;
        const w = r.width + padding * 2;
        const h = r.height + padding * 2;

        // Position SVG Cutout
        cutout.setAttribute('x', x);
        cutout.setAttribute('y', y);
        cutout.setAttribute('width', w);
        cutout.setAttribute('height', h);

        // Position Glowing Border Outline
        if (outline) {
            outline.style.left = `${x}px`;
            outline.style.top = `${y}px`;
            outline.style.width = `${w}px`;
            outline.style.height = `${h}px`;
            outline.classList.add('active');
        }
    }

    /**
     * Hide a secondary spotlight cutout
     */
    static clearSpotlight2() {
        const c2 = document.getElementById('ag-spotlight-cutout-2');
        if (c2) { c2.setAttribute('width', '0'); c2.setAttribute('height', '0'); }
        const o2 = document.getElementById('ag-tour-glow-outline-2');
        if (o2) o2.classList.remove('active');
    }

    /**
     * Position the tooltip card near a target rect without overlapping the subject
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
        
        // Measure tooltip size dynamically, fallback to standard bounds
        const TW = 320;
        const TH = tooltip.offsetHeight || 180;
        
        let targetPos = position;
        let x = anchorRect.left + anchorRect.width / 2 - TW / 2;
        let y;

        // If the anchor element is very large (e.g. spans > 50% of the screen height),
        // place the tooltip in the bottom-right corner so it never blocks the main content.
        const isElementHuge = anchorRect.height > window.innerHeight * 0.5;

        if (isElementHuge) {
            x = window.innerWidth - TW - 24;
            y = window.innerHeight - TH - 24;
        } else {
            // Auto-swap position if there's no space in the requested direction
            if (targetPos === 'top') {
                const topSpaceNeeded = TH + 20;
                if (anchorRect.top < topSpaceNeeded) {
                    const bottomSpaceAvailable = window.innerHeight - anchorRect.bottom;
                    if (bottomSpaceAvailable > topSpaceNeeded) {
                        targetPos = 'bottom';
                    }
                }
            } else if (targetPos === 'bottom') {
                const bottomSpaceNeeded = TH + 20;
                const bottomSpaceAvailable = window.innerHeight - anchorRect.bottom;
                if (bottomSpaceAvailable < bottomSpaceNeeded) {
                    if (anchorRect.top > bottomSpaceNeeded) {
                        targetPos = 'top';
                    }
                }
            }

            // Calculate Y coordinate based on final position
            if (targetPos === 'top') {
                y = anchorRect.top - TH - 16;
            } else if (targetPos === 'bottom') {
                y = anchorRect.bottom + 16;
            } else {
                y = anchorRect.top;
            }

            // Clamp X and Y within viewport boundaries
            x = Math.max(20, Math.min(window.innerWidth - TW - 20, x));
            y = Math.max(20, Math.min(window.innerHeight - TH - 20, y));

            // Collision check: if the clamped card still overlaps the anchor element,
            // push it to the safe bottom-right corner of the screen.
            const overlapsVertically = (y < anchorRect.bottom && y + TH > anchorRect.top);
            const overlapsHorizontally = (x < anchorRect.right && x + TW > anchorRect.left);
            
            if (overlapsVertically && overlapsHorizontally) {
                x = window.innerWidth - TW - 24;
                y = window.innerHeight - TH - 24;
            }
        }

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

        this.spotlightEl('ag-spotlight-cutout', 'ag-tour-glow-outline-1', primaryEl);
        if (secondaryEl) {
            this.spotlightEl('ag-spotlight-cutout-2', 'ag-tour-glow-outline-2', secondaryEl);
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

    // ─── Robust Selectors (from real Gemini DOM) ─────────────────────────────
    static getInput() {
        return document.querySelector('div[contenteditable="true"][aria-label*="rompt"]')
            || document.querySelector('div[contenteditable="true"][role="textbox"]')
            || document.querySelector('.ql-editor[contenteditable="true"]')
            || document.querySelector('div[contenteditable="true"]');
    }

    static getSendButton() {
        return document.querySelector('button[aria-label*="Send"]')
            || document.querySelector('button[class*="send"]')
            || document.querySelector('.send-button-container button')
            || document.querySelector('button[aria-label="Send message"]')
            || document.querySelector('button.send-button');
    }

    static getLatestGeminiReply() {
        const selectors = [
            'message-content',
            '.message-content',
            '.model-response',
            '.markdown-main-panel',
            'div[class*="message-content"]',
            'div[class*="model-response"]'
        ];
        
        for (const selector of selectors) {
            const panels = document.querySelectorAll(selector);
            if (panels.length > 0) {
                const last = panels[panels.length - 1];
                if (last.textContent.trim().length > 0 && last.offsetParent !== null) {
                    return last;
                }
            }
        }
        return null;
    }

    // ─── Step machine ────────────────────────────────────────────────────────
    static evaluateStep() {
        if (this.step !== this.lastTrackedStep) {
            const previousStep = this.lastTrackedStep;
            this.lastTrackedStep = this.step;
            
            if (previousStep === 0 && this.step === 1) {
                this.trackEvent('tour_started');
            }
            this.trackEvent('tour_step_reached', { step: this.step });
        }

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
                        if (e.target.closest('button[aria-label*="Send"], button[class*="send"], button.send-button')) advance();
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
            // Check if context box is already active (i.e. float button was clicked)
            const contextBox = document.getElementById('ask-gemini-context-box');
            if (contextBox && contextBox.style.display !== 'none') {
                this.step = 4;
                chrome.storage.local.set({ tour_step: 4 });
                return;
            }

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
                        if (e.target.closest('button[aria-label*="Send"], button[class*="send"], button.send-button')) advance();
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
                text: "You've mastered contextual replies with <b>Quote Reply for Gemini</b>. Every reply from here on will be laser-precise. Enjoy!",
                primaryEl: null
            });

            const stepEl = document.getElementById('ag-tour-step');
            if (stepEl) {
                stepEl.style.background = 'rgba(56, 239, 125, 0.15)';
                stepEl.style.color = '#38ef7d';
                stepEl.style.borderColor = 'rgba(56, 239, 125, 0.25)';
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
