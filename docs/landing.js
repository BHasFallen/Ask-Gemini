/**
 * Ask Gemini: Landing Site Interactive Logic
 * Powers theme switching, interactive Gemini simulation playground,
 * search filtering, and FAQ accordions.
 */

(function () {
  'use strict';

  // ─── Theme Management ───────────────────────────────────────────────────────
  const THEME_KEY = 'ask_gemini_landing_theme';
  const html = document.documentElement;

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const active = saved || (prefersDark ? 'dark' : 'dark'); // default dark for tech aesthetic
    html.setAttribute('data-theme', active);
  }

  function toggleTheme() {
    const current = html.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  }

  initTheme();

  document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle buttons
    const themeBtns = document.querySelectorAll('.theme-btn, #theme-toggle-btn');
    themeBtns.forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });

    // ─── FAQ Accordion ────────────────────────────────────────────────────────
    const faqTriggers = document.querySelectorAll('.faq-trigger');
    faqTriggers.forEach(trigger => {
      trigger.addEventListener('click', () => {
        const card = trigger.closest('.faq-card');
        const isOpen = card.classList.contains('open');

        // Close other open cards
        document.querySelectorAll('.faq-card.open').forEach(c => {
          if (c !== card) c.classList.remove('open');
        });

        if (isOpen) {
          card.classList.remove('open');
        } else {
          card.classList.add('open');
        }
      });
    });

    // ─── Interactive Playground (Simulation on index.html) ───────────────────
    const floatBtnMock = document.getElementById('playground-float-btn');
    const chipContainer = document.getElementById('playground-chip-container');
    const inputMockText = document.getElementById('playground-input-text');
    const modelBadge = document.getElementById('playground-model-badge');
    const bookmarkBtn = document.getElementById('playground-bookmark-btn');

    if (floatBtnMock && chipContainer) {
      floatBtnMock.addEventListener('click', () => {
        // Animate quote insertion into input area
        chipContainer.style.display = 'inline-flex';
        floatBtnMock.style.display = 'none';
        if (inputMockText) {
          inputMockText.textContent = 'Can you recommend the best bakery there?';
          inputMockText.style.color = 'var(--text-main)';
        }

        // Show brief notification
        showToast('Quote added to your question box!');
      });
    }

    // Model cycle in playground
    if (modelBadge) {
      const models = ['Auto Mode (Smart)', 'Gemini 1.5 Pro', 'Gemini 1.5 Flash'];
      let modelIdx = 0;
      modelBadge.addEventListener('click', () => {
        modelIdx = (modelIdx + 1) % models.length;
        modelBadge.textContent = models[modelIdx];
        showToast(`Switched to ${models[modelIdx]}`);
      });
    }

    // Bookmark toggle in playground
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', () => {
        const isFilled = bookmarkBtn.getAttribute('data-active') === 'true';
        if (!isFilled) {
          bookmarkBtn.setAttribute('data-active', 'true');
          bookmarkBtn.style.color = '#2563eb';
          showToast('Answer saved! (Ctrl+Shift+B)');
        } else {
          bookmarkBtn.setAttribute('data-active', 'false');
          bookmarkBtn.style.color = 'var(--text-dim)';
          showToast('Saved answer removed.');
        }
      });
    }

    // ─── Live Search Filter (support.html) ────────────────────────────────────
    const searchInput = document.getElementById('support-search');
    const searchableItems = document.querySelectorAll('.searchable-item');

    if (searchInput && searchableItems.length > 0) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        searchableItems.forEach(item => {
          const text = item.textContent.toLowerCase();
          if (text.includes(query)) {
            item.style.display = '';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }

    // ─── Copy Code Snippets / Shortcuts ──────────────────────────────────────
    const copyBtns = document.querySelectorAll('.btn-copy');
    copyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const textToCopy = btn.getAttribute('data-copy');
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
              btn.textContent = originalText;
            }, 2000);
          });
        }
      });
    });
  });

  // Simple clean toast helper
  function showToast(message) {
    let toast = document.getElementById('site-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'site-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 24px;
        background: #1e293b;
        color: #f8fafc;
        padding: 12px 20px;
        border-radius: 12px;
        font-size: 0.875rem;
        font-weight: 600;
        box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.1);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.25s ease;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 3200);
  }
})();
