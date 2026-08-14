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
        const subtitle = options.subtitle || 'Tap stars to rate your experience';
        const featureName = options.featureName || (options.source === 'smart_paste' ? 'Smart Paste' : 'Ask Gemini');

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
                <div class="ag-rating-stars-row">
                    <button class="ag-star-btn ag-star-item-btn" data-value="1" aria-label="1 star">${AG.ICONS.star}</button>
                    <button class="ag-star-btn ag-star-item-btn" data-value="2" aria-label="2 stars">${AG.ICONS.star}</button>
                    <button class="ag-star-btn ag-star-item-btn" data-value="3" aria-label="3 stars">${AG.ICONS.star}</button>
                    <button class="ag-star-btn ag-star-item-btn" data-value="4" aria-label="4 stars">${AG.ICONS.star}</button>
                    <button class="ag-star-btn ag-star-item-btn" data-value="5" aria-label="5 stars">${AG.ICONS.star}</button>
                </div>
                <button class="ag-rating-inline-close" aria-label="Close">${AG.ICONS.close}</button>
            </div>
        `;

        if (container && container.parentNode) {
            container.parentNode.insertBefore(banner, container);
        } else {
            document.body.appendChild(banner);
        }

        const stars = banner.querySelectorAll('.ag-star-item-btn');

        stars.forEach(star => {
            star.addEventListener('mouseenter', () => {
                const value = parseInt(star.getAttribute('data-value'));
                stars.forEach(s => {
                    const val = parseInt(s.getAttribute('data-value'));
                    if (val <= value) {
                        s.classList.add('hovered-star');
                    } else {
                        s.classList.remove('hovered-star');
                    }
                });
            });

            star.addEventListener('mouseleave', () => {
                stars.forEach(s => s.classList.remove('hovered-star'));
            });

            star.addEventListener('click', () => {
                const rating = parseInt(star.getAttribute('data-value'));

                if (rating >= 4) {
                    banner.innerHTML = `
                        <div class="ag-rating-inline-left">
                            <div class="ag-rating-inline-icon" style="background: rgba(168, 199, 250, 0.15); color: #a8c7fa;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                            </div>
                            <div class="ag-rating-inline-text-col">
                                <span class="ag-rating-inline-title">You're the best! 🌟</span>
                                <span class="ag-rating-inline-sub">A quick review keeps ${featureName} free for everyone</span>
                            </div>
                        </div>
                        <div class="ag-rating-inline-actions">
                            <button class="ag-sp-btn-primary" id="ag-go-rate" style="padding: 7px 18px; font-size: 13px;">Leave 5 Stars</button>
                            <button class="ag-rating-inline-close" aria-label="Close">${AG.ICONS.close}</button>
                        </div>
                    `;
                    banner.querySelector('.ag-rating-inline-close').onclick = () => banner.remove();
                    banner.querySelector('#ag-go-rate').onclick = () => {
                        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                        chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                        banner.remove();
                    };
                } else {
                    banner.innerHTML = `
                        <div class="ag-rating-inline-left">
                            <div class="ag-rating-inline-icon" style="background: rgba(168, 199, 250, 0.15); color: #a8c7fa;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>
                            <div class="ag-rating-inline-text-col">
                                <span class="ag-rating-inline-title">How can we improve ${featureName}?</span>
                                <span class="ag-rating-inline-sub">We'd love your feedback to make ${featureName} better</span>
                            </div>
                        </div>
                        <div class="ag-rating-inline-actions">
                            <button class="ag-sp-btn-primary" id="ag-give-feedback" style="padding: 6px 14px; font-size: 12.5px;">Send Feedback</button>
                            <button class="ag-sp-btn-secondary" id="ag-go-rate-stars" style="padding: 5px 12px; font-size: 12.5px;">Rate ${rating} Stars</button>
                            <button class="ag-rating-inline-close" aria-label="Close">${AG.ICONS.close}</button>
                        </div>
                    `;
                    banner.querySelector('.ag-rating-inline-close').onclick = () => banner.remove();
                    banner.querySelector('#ag-give-feedback').onclick = () => {
                        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'feedback_given' });
                        window.open('https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform', '_blank');
                        banner.remove();
                    };
                    banner.querySelector('#ag-go-rate-stars').onclick = () => {
                        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                        chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                        banner.remove();
                    };
                }
            });
        });

        banner.querySelector('.ag-rating-inline-close').onclick = () => {
            chrome.storage.local.set({ ag_smart_paste_rating_dismissed_at: Date.now() });
            chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'dismissed' });
            banner.remove();
        };
    });
};

// ─── maybeShowSmartPasteRatingPrompt ─────────────────────────────────────────
window.AskGemini.maybeShowSmartPasteRatingPrompt = function maybeShowSmartPasteRatingPrompt() {
    var AG = window.AskGemini;
    if (document.querySelector('.ag-rating-inline-banner')) return;

    chrome.storage.local.get(['rating_state', 'ag_smart_paste_rating_dismissed_at'], (res) => {
        const state = res.rating_state || {};

        // 1. Do NOT show for users who have already rated or given feedback
        if (state.ratingStatus === 'rated' || state.ratingStatus === 'feedback_given') {
            console.log('🏰 [AskGemini] Suppressing Smart Paste rating prompt: user has already rated or provided feedback.');
            return;
        }

        // 2. Cooldown check: if dismissed within the last 3 days, don't show yet
        const now = Date.now();
        const lastDismissed = res.ag_smart_paste_rating_dismissed_at || 0;
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        if (state.ratingStatus === 'dismissed' && (now - lastDismissed < THREE_DAYS_MS)) {
            console.log('🏰 [AskGemini] Suppressing Smart Paste rating prompt: dismissed within last 3 days.');
            return;
        }

        // 3. Show non-blocking rating banner after a brief 1.5s delay
        setTimeout(() => {
            if (document.querySelector('.ag-rating-inline-banner')) return;
            AG.showRatingModal({
                source: 'smart_paste',
                title: 'Enjoying Smart Paste?',
                subtitle: 'Tap stars to rate your experience or share feedback',
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
