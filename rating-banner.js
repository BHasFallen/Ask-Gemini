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
window.AskGemini.showRatingModal = function showRatingModal() {
    var AG = window.AskGemini;
    if (document.querySelector('.ag-rating-inline-banner')) return;

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
                <span class="ag-rating-inline-title">Enjoying Quote Reply?</span>
                <span class="ag-rating-inline-sub">Tap stars to rate your experience</span>
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
                            <span class="ag-rating-inline-sub">A quick review keeps Quote Reply free for everyone</span>
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
                            <span class="ag-rating-inline-title">How can we improve?</span>
                            <span class="ag-rating-inline-sub">We'd love your feedback to make Quote Reply better</span>
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
        chrome.runtime.sendMessage({ type: 'SET_RATING_STATUS', status: 'dismissed' });
        banner.remove();
    };
};



// ─── evaluateFeatureBanner ────────────────────────────────────────────────────
window.AskGemini.evaluateFeatureBanner = async function evaluateFeatureBanner(retryCount = 0) {
    var AG = window.AskGemini;
    if (AG.hasEvaluatedFeatureBanner) return;

    const input = AG.findInputArea();
    if (!input) {
        if (retryCount < 5) {
            setTimeout(() => AG.evaluateFeatureBanner(retryCount + 1), 1000);
        }
        return;
    }

    const resConfig = await chrome.storage.local.get(['ag_remote_config']);
    const config = resConfig.ag_remote_config || {};
    const flags = config.flags || {};
    const featureCfg = config.feature_banner || AG.CURRENT_FEATURE;

    // Check remote config kill switch and active status
    if (flags.feature_banner_enabled === false || featureCfg.active === false || !featureCfg.id) {
        AG.hasEvaluatedFeatureBanner = true;
        return;
    }

    const bannerKey = `feature_banner_seen_${featureCfg.id}`;
    const resSeen = await chrome.storage.local.get([bannerKey]);

    // If already seen/dismissed, don't show
    if (resSeen[bannerKey]) {
        AG.hasEvaluatedFeatureBanner = true;
        return;
    }

    // If an existing feature banner is on the screen, remove it so the new update can display
    const existingFeatureBanner = document.querySelector('.ag-feature-inline-banner');
    if (existingFeatureBanner) {
        existingFeatureBanner.remove();
    }

    // Don't show if rating prompt or tour overlay is open
    if (document.querySelector('.ag-rating-inline-banner') || document.getElementById('ag-tour-overlay')) {
        return;
    }

    AG.hasEvaluatedFeatureBanner = true;
    AG.showFeatureBanner(featureCfg);
};

// ─── showFeatureBanner (Inline Native Banner Styled Identically to Rating Banner) ──
window.AskGemini.showFeatureBanner = function showFeatureBanner(featureOverride = null) {
    var AG = window.AskGemini;
    const existing = document.querySelector('.ag-feature-inline-banner');
    if (existing) existing.remove();

    const feature = featureOverride || AG.CURRENT_FEATURE;
    if (!feature || !feature.id) return;

    const input = AG.findInputArea();
    const container = input ? (input.closest('.input-area-container') || input.closest('.chat-input-area') || input.closest('form') || input.parentElement) : document.body;

    const banner = document.createElement('div');
    banner.className = 'ag-rating-inline-banner ag-feature-inline-banner';

    const showPrimary = feature.show_primary !== false;
    const showSecondary = feature.show_secondary !== false;

    let actionsHtml = '';
    if (showPrimary) {
        actionsHtml += `<button class="ag-sp-btn-primary" id="ag-feature-btn-primary" style="padding: 6px 14px; font-size: 12.5px;">${AG.escapeHtml(feature.primary_text || feature.primaryText || 'Try it')}</button>`;
    }
    if (showSecondary) {
        actionsHtml += `<button class="ag-sp-btn-secondary" id="ag-feature-btn-secondary" style="padding: 5px 12px; font-size: 12.5px;">${AG.escapeHtml(feature.secondary_text || feature.secondaryText || 'Later')}</button>`;
    }
    actionsHtml += `<button class="ag-rating-inline-close" aria-label="Close">${AG.ICONS.close}</button>`;

    banner.innerHTML = `
        <div class="ag-rating-inline-left">
            <div class="ag-rating-inline-icon" style="background: rgba(168, 199, 250, 0.15); color: #a8c7fa;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            </div>
            <div class="ag-rating-inline-text-col">
                <span class="ag-rating-inline-title">${AG.escapeHtml(feature.title)}</span>
                <span class="ag-rating-inline-sub">${AG.escapeHtml(feature.description)}</span>
            </div>
        </div>

        <div class="ag-rating-inline-actions">
            ${actionsHtml}
        </div>
    `;

    if (container && container.parentNode) {
        container.parentNode.insertBefore(banner, container);
    } else {
        document.body.appendChild(banner);
    }

    const dismiss = () => {
        const bannerKey = `feature_banner_seen_${feature.id}`;
        chrome.storage.local.set({ [bannerKey]: true }, () => {
            AG.trackEvent('feature_banner_dismissed', { feature_id: feature.id });
            banner.remove();
        });
    };

    const handleBtnAction = (actionType, targetUrl, isPrimary) => {
        const bannerKey = `feature_banner_seen_${feature.id}`;
        chrome.storage.local.set({ [bannerKey]: true }, () => {
            AG.trackEvent(isPrimary ? 'feature_banner_primary_click' : 'feature_banner_secondary_click', { feature_id: feature.id, action: actionType });
            banner.remove();

            if (actionType === 'open_url' && targetUrl) {
                window.open(targetUrl, '_blank');
            } else if (actionType === 'start_tour') {
                if (feature.onTry) {
                    feature.onTry();
                } else if (AG.CURRENT_FEATURE && AG.CURRENT_FEATURE.onTry) {
                    AG.CURRENT_FEATURE.onTry();
                }
            }
        });
    };

    const primaryBtn = banner.querySelector('#ag-feature-btn-primary');
    if (primaryBtn) {
        const action = feature.primary_action || feature.cta_action || 'start_tour';
        const url = feature.primary_url || null;
        primaryBtn.onclick = () => handleBtnAction(action, url, true);
    }

    const secondaryBtn = banner.querySelector('#ag-feature-btn-secondary');
    if (secondaryBtn) {
        const action = feature.secondary_action || 'dismiss';
        const url = feature.secondary_url || null;
        secondaryBtn.onclick = () => handleBtnAction(action, url, false);
    }

    const closeBtn = banner.querySelector('.ag-rating-inline-close');
    if (closeBtn) closeBtn.onclick = dismiss;
};
