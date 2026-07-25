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

// ─── showRatingModal ──────────────────────────────────────────────────────────
window.AskGemini.showRatingModal = function showRatingModal() {
    var AG = window.AskGemini;
    if (document.querySelector('.ag-rating-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'ag-rating-modal';
    modal.innerHTML = `
        <button class="ag-rating-close" aria-label="Close">${AG.ICONS.close}</button>
        <h3 class="ag-rating-title" style="text-align: center; font-size: 15px; margin-bottom: 2px;">Enjoying Quote Reply?</h3>
        <div class="ag-rating-stars-container">
            <button class="ag-star-btn" data-value="1" aria-label="1 star">${AG.ICONS.star}</button>
            <button class="ag-star-btn" data-value="2" aria-label="2 stars">${AG.ICONS.star}</button>
            <button class="ag-star-btn" data-value="3" aria-label="3 stars">${AG.ICONS.star}</button>
            <button class="ag-star-btn" data-value="4" aria-label="4 stars">${AG.ICONS.star}</button>
            <button class="ag-star-btn" data-value="5" aria-label="5 stars">${AG.ICONS.star}</button>
        </div>
    `;

    document.body.appendChild(modal);

    const stars = modal.querySelectorAll('.ag-star-btn');

    stars.forEach(star => {
        star.addEventListener('mouseenter', () => {
            const value = parseInt(star.getAttribute('data-value'));
            stars.forEach(s => {
                const val = parseInt(s.getAttribute('data-value'));
                if (val <= value) {
                    s.classList.add('hovered');
                } else {
                    s.classList.remove('hovered');
                }
            });
        });

        star.addEventListener('mouseleave', () => {
            stars.forEach(s => s.classList.remove('hovered'));
        });

        star.addEventListener('click', () => {
            const rating = parseInt(star.getAttribute('data-value'));

            if (rating >= 4) {
                modal.innerHTML = `
                    <button class="ag-rating-close" aria-label="Close">${AG.ICONS.close}</button>
                    <h3 class="ag-rating-title" style="font-size: 15px; text-align: center;">You're the best! 🌟</h3>
                    <p class="ag-rating-text" style="font-size: 12px; text-align: center; margin: 4px 0 8px 0; line-height: 1.4;">A quick 5-star review helps us keep Quote Reply free and powerful.</p>
                    <div class="ag-rating-buttons" style="margin-top: 4px;">
                        <button class="ag-rating-btn ag-rating-btn-primary" id="ag-go-rate" style="padding: 8px;">Leave 5 Stars</button>
                    </div>
                `;
                modal.querySelector('.ag-rating-close').onclick = () => modal.remove();
                modal.querySelector('#ag-go-rate').onclick = () => {
                    chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                    chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                    modal.remove();
                };
            } else {
                modal.innerHTML = `
                    <button class="ag-rating-close" aria-label="Close">${AG.ICONS.close}</button>
                    <h3 class="ag-rating-title" style="font-size: 15px; text-align: center;">How can we improve?</h3>
                    <p class="ag-rating-text" style="font-size: 12px; text-align: center; margin: 4px 0 8px 0; line-height: 1.4;">Your feedback helps us improve. You can send private feedback or rate us on the store.</p>
                    <div class="ag-rating-buttons" style="margin-top: 8px; flex-direction: column; gap: 8px;">
                        <button class="ag-rating-btn ag-rating-btn-primary" id="ag-give-feedback" style="padding: 8px; width: 100%;">Send Private Feedback</button>
                        <button class="ag-rating-btn" id="ag-go-rate-stars" style="padding: 8px; width: 100%; border: 1px solid var(--ag-border); background: transparent;">Rate ${rating} Stars</button>
                    </div>
                `;
                modal.querySelector('.ag-rating-close').onclick = () => modal.remove();
                modal.querySelector('#ag-give-feedback').onclick = () => {
                    chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'feedback_given' });
                    window.open('https://docs.google.com/forms/d/e/1FAIpQLSfr82mMdRgwSPY9ZsQkdRp_HXKKwmVuWO7GmjeZ3fS9XHpqsA/viewform', '_blank');
                    modal.remove();
                };
                modal.querySelector('#ag-go-rate-stars').onclick = () => {
                    chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'rated' });
                    chrome.runtime.sendMessage({ type: 'OPEN_REVIEW_PAGE' });
                    modal.remove();
                };
            }
        });
    });

    modal.querySelector('.ag-rating-close').onclick = () => {
        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'dismissed' });
        modal.remove();
    };
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
