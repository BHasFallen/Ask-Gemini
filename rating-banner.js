/**
 * Ask Gemini: Rating & Feature Banner Module
 * Handles the star-rating modal and the feature announcement banner.
 */

window.AskGemini = window.AskGemini || {};

// ─── Owned State ─────────────────────────────────────────────────────────────
window.AskGemini.hasEvaluatedFeatureBanner = false;

// ─── CURRENT_FEATURE ──────────────────────────────────────────────────────────
window.AskGemini.CURRENT_FEATURE = {
    id: "multi_quote_v1",
    title: "New: Quote multiple excerpts",
    description: "Highlight text, then keep highlighting more — look for the '+ Add Quote' button to build a multi-quote reply.",
    primaryText: "Try it",
    secondaryText: "Later",
    onTry: () => {
        chrome.storage.local.set({ ask_gemini_tour_active: true, tour_step: 1 }, () => {
            if (typeof AskGeminiTour !== 'undefined') {
                AskGeminiTour.step = 1;
                AskGeminiTour.step1ListenersAttached = false;
                AskGeminiTour.step4ListenersAttached = false;
                AskGeminiTour.step6ListenersAttached = false;

                // If a reply already exists, skip step 1 and go directly to step 2 (highlighting)
                if (AskGeminiTour.getLatestGeminiReply()) {
                    AskGeminiTour.step = 2;
                    chrome.storage.local.set({ tour_step: 2 });
                }
                AskGeminiTour.init();
            } else {
                window.location.reload();
            }
        });
    }
};

/*
// Example feature configuration when you want to show a banner:
window.AskGemini.CURRENT_FEATURE = {
    id: "nano_banana_v1", // Unique ID for this feature notification
    title: "Get your game face on ⚽️",
    description: "Picture yourself in the game with Nano Banana.",
    primaryText: "Try it",
    secondaryText: "Not now",
    onTry: () => {
        chrome.storage.local.set({ ask_gemini_tour_active: true, tour_step: 1 }, () => {
            if (typeof AskGeminiTour !== 'undefined') {
                AskGeminiTour.init();
            } else {
                window.location.reload();
            }
        });
    }
};
*/

// ─── showRatingModal (Option 2: Inline Non-Blocking Chat Banner) ─────────────
window.AskGemini.showRatingModal = function showRatingModal(options = {}) {
    var AG = window.AskGemini;
    if (document.querySelector('.ag-rating-inline-banner')) return;

    // Verify rating state to prevent showing to users who have already rated or given feedback
    chrome.storage.local.get(['rating_state'], (res) => {
        const state = res.rating_state || {};
        if (state.ratingStatus === 'rated' || state.ratingStatus === 'feedback_given') {
            console.log('🏰 [AskGemini] User has already rated or given feedback. Suppressing rating prompt.');
            return;
        }

        const title = options.title || 'Enjoying Quote Reply?';
        const subtitle = options.subtitle || 'Your feedback helps me make it even better!';

        const input = AG.findInputArea();
        const container = input ? (input.closest('.input-area-container') || input.closest('.chat-input-area') || input.closest('form') || input.parentElement) : document.body;

        const banner = document.createElement('div');
        banner.className = 'ag-rating-inline-banner';

        banner.innerHTML = `
            <div class="ag-rating-inline-left">
                <div class="ag-rating-inline-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </div>
                <div class="ag-rating-inline-text-col">
                    <span class="ag-rating-inline-title">${title}</span>
                    <span class="ag-rating-inline-sub">${subtitle}</span>
                </div>
            </div>

            <div class="ag-rating-inline-actions">
                <button class="ag-sp-btn-primary" id="ag-rate-direct" style="padding: 6px 14px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px;">
                    🌟 Rate 5 Stars
                </button>
                <button class="ag-sp-btn-secondary" id="ag-feedback-direct" style="padding: 6px 14px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px;">
                    💬 Share Feedback
                </button>
                <button class="ag-rating-inline-close" aria-label="Close">${AG.ICONS.close}</button>
            </div>
        `;

        if (container && container.parentNode) {
            container.parentNode.insertBefore(banner, container);
        } else {
            document.body.appendChild(banner);
        }

        // 1-Click Action Listeners
        const rateBtn = banner.querySelector('#ag-rate-direct');
        const feedbackBtn = banner.querySelector('#ag-feedback-direct');
        const closeBtn = banner.querySelector('.ag-rating-inline-close');

        if (rateBtn) {
            rateBtn.onclick = () => {
                chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                banner.remove();
            };
        }

        if (feedbackBtn) {
            feedbackBtn.onclick = () => {
                chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'feedback_given' });
                window.open('https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform', '_blank');
                banner.remove();
            };
        }

        if (closeBtn) {
            closeBtn.onclick = () => {
                chrome.storage.local.get(['ag_smart_paste_count'], (cRes) => {
                    chrome.storage.local.set({
                        ag_smart_paste_rating_dismissed_at: Date.now(),
                        ag_smart_paste_dismissed_count: cRes.ag_smart_paste_count || 0
                    });
                });
                chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'dismissed' });
                banner.remove();
            };
        }
    });
};

// ─── maybeShowSmartPasteRatingPrompt ─────────────────────────────────────────
window.AskGemini.maybeShowSmartPasteRatingPrompt = function maybeShowSmartPasteRatingPrompt() {
    var AG = window.AskGemini;
    if (document.querySelector('.ag-rating-inline-banner')) return;

    chrome.storage.local.get([
        'rating_state',
        'ag_smart_paste_count',
        'ag_smart_paste_dismissed_count',
        'ag_smart_paste_rating_dismissed_at'
    ], (res) => {
        const state = res.rating_state || {};

        // 1. Do NOT show for users who have already rated or given feedback (Redemption Arc resets feedback_given on major updates)
        if (state.ratingStatus === 'rated' || state.ratingStatus === 'feedback_given') {
            console.log('🏰 [AskGemini] Suppressing Smart Paste rating prompt: user has already rated or provided feedback.');
            return;
        }

        // 2. Update Bombardment Buffer check: wait at least 5 uses after extension update
        if (state.isExistingUser && (state.postUpdateHighlights || 0) < 5) {
            console.log('🏰 [AskGemini] Suppressing Smart Paste rating prompt: update bombardment buffer active.');
            return;
        }

        // 3. Increment & track Smart Paste usage count
        const currentCount = (res.ag_smart_paste_count || 0) + 1;
        chrome.storage.local.set({ ag_smart_paste_count: currentCount });

        // 4. Threshold & Cooldown Rules
        const lastDismissedAt = res.ag_smart_paste_rating_dismissed_at || 0;
        const dismissedCount = res.ag_smart_paste_dismissed_count || 0;

        if (lastDismissedAt === 0) {
            // Initial Trigger Rule: Easy to reach (requires at least 2 successful smart pastes)
            if (currentCount < 2) return;
        } else {
            // Cooldown Rule after dismissal: Light 2 calendar days OR 3 smart pastes since dismissal
            const now = Date.now();
            const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
            const pastesSinceDismissal = currentCount - dismissedCount;

            if (now - lastDismissedAt < TWO_DAYS_MS && pastesSinceDismissal < 3) {
                console.log('🏰 [AskGemini] Suppressing Smart Paste rating prompt: cooldown active.');
                return;
            }
        }

        // 5. Show non-blocking direct-action rating banner after a brief 1.5s delay
        setTimeout(() => {
            if (document.querySelector('.ag-rating-inline-banner')) return;
            AG.showRatingModal({
                source: 'smart_paste',
                title: 'Enjoying Smart Paste?',
                subtitle: 'Your feedback helps me make it even better!',
                featureName: 'Smart Paste'
            });
        }, 1500);
    });
};



// ─── evaluateFeatureBanner ────────────────────────────────────────────────────
window.AskGemini.evaluateFeatureBanner = async function evaluateFeatureBanner() {
    var AG = window.AskGemini;
    if (!AG.CURRENT_FEATURE || !AG.CURRENT_FEATURE.id) return;
    if (AG.hasEvaluatedFeatureBanner) return;

    const input = AG.findInputArea();
    if (!input) return;

    const bannerKey = `feature_banner_seen_${AG.CURRENT_FEATURE.id}`;
    const res = await chrome.storage.local.get([bannerKey]);

    // If already seen/dismissed, don't show
    if (res[bannerKey]) {
        AG.hasEvaluatedFeatureBanner = true;
        return;
    }

    // Don't show if any other modals (like rating modal or tour overlay) are active
    if (document.querySelector('.ag-rating-modal') || document.getElementById('ag-tour-overlay') || document.querySelector('.ag-feature-banner')) {
        return;
    }

    AG.hasEvaluatedFeatureBanner = true;

    // Show after a short delay so it's not jarring
    setTimeout(() => {
        // Re-verify conditions before showing
        if (document.querySelector('.ag-rating-modal') || document.getElementById('ag-tour-overlay') || document.querySelector('.ag-feature-banner')) {
            AG.hasEvaluatedFeatureBanner = false;
            return;
        }
        AG.showFeatureBanner();
    }, 3000);
};

// ─── showFeatureBanner ────────────────────────────────────────────────────────
window.AskGemini.showFeatureBanner = function showFeatureBanner() {
    var AG = window.AskGemini;
    if (document.querySelector('.ag-feature-banner')) return;

    const banner = document.createElement('section');
    banner.className = 'ag-feature-banner gem-banner-container ng-star-inserted';
    banner.setAttribute('jslog', '307885;track:impression');

    banner.innerHTML = `
        <div class="banner-top">
            <div class="text-container">
                <div class="title-container ng-star-inserted">
                    <h3 class="banner-title gds-body-m">${AG.CURRENT_FEATURE.title}</h3>
                </div>
                <div class="body-text gds-body-m ng-star-inserted">${AG.CURRENT_FEATURE.description}</div>
            </div>
        </div>
        <div class="actions-container ng-star-inserted">
            <button class="banner-btn-primary" id="ag-banner-btn-try">${AG.CURRENT_FEATURE.primaryText}</button>
            <button class="banner-btn-secondary" id="ag-banner-btn-dismiss">${AG.CURRENT_FEATURE.secondaryText}</button>
        </div>
    `;

    document.body.appendChild(banner);

    const dismissBtn = banner.querySelector('#ag-banner-btn-dismiss');
    const tryBtn = banner.querySelector('#ag-banner-btn-try');

    const closeBanner = (callback) => {
        banner.classList.add('slide-out');
        banner.addEventListener('animationend', () => {
            banner.remove();
            if (callback) callback();
        }, { once: true });
    };

    dismissBtn.onclick = () => {
        const bannerKey = `feature_banner_seen_${AG.CURRENT_FEATURE.id}`;
        chrome.storage.local.set({ [bannerKey]: true }, () => {
            AG.trackEvent('feature_banner_dismissed', { feature_id: AG.CURRENT_FEATURE.id });
            closeBanner();
        });
    };

    tryBtn.onclick = () => {
        const bannerKey = `feature_banner_seen_${AG.CURRENT_FEATURE.id}`;
        chrome.storage.local.set({ [bannerKey]: true }, () => {
            AG.trackEvent('feature_banner_try_clicked', { feature_id: AG.CURRENT_FEATURE.id });
            closeBanner(() => {
                if (AG.CURRENT_FEATURE.onTry) AG.CURRENT_FEATURE.onTry();
            });
        });
    };
};
