import { test, expect } from '../fixtures.js';
import type { Page, Locator } from '@playwright/test';

declare global {
  interface Window {
    AskGemini: any;
  }
}

/**
 * Helper to ensure at least one AI response exists on live Gemini.
 * Sends a rapid, low-token query if the current chat session is empty.
 */
async function ensureLiveResponseExists(page: Page): Promise<void> {
  const responses = page.locator('model-response, .model-response, .response-container');
  if (await responses.count() > 0 && await responses.first().locator('p').count() > 0) {
    return;
  }

  // Check recent chat in sidebar
  const recentChat = page.locator('nav a[href*="/app/"]').first();
  if (await recentChat.count() > 0 && await recentChat.isVisible()) {
    await recentChat.click();
    await page.waitForTimeout(3000);
    if (await responses.count() > 0 && await responses.first().locator('p').count() > 0) {
      return;
    }
  }

  // Send a quick prompt
  await sendLivePrompt(page, 'Reply with 3 words: Sun moon stars');
}

/**
 * Sends a prompt to live Gemini and waits for token streaming to finish.
 */
async function sendLivePrompt(page: Page, text: string): Promise<void> {
  const inputArea = page.locator('.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"], rich-textarea').first();
  await inputArea.waitFor({ state: 'visible', timeout: 15000 });
  await inputArea.click();
  await page.keyboard.type(text);
  await page.waitForTimeout(300);

  const sendBtn = page.getByRole('button', { name: 'Send message' });
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  // Wait for new response to appear and finish streaming
  await page.waitForSelector('model-response p, .model-response p', { timeout: 45000 });

  // If a Stop response button is visible, wait for it to disappear
  const stopBtn = page.locator('button[aria-label*="Stop response"], [aria-label*="Stop"]');
  try {
    if (await stopBtn.count() > 0 && await stopBtn.first().isVisible()) {
      await stopBtn.first().waitFor({ state: 'hidden', timeout: 35000 });
    }
  } catch (_) {}
  await page.waitForTimeout(1500);
}

/**
 * Selects text inside an element on live Gemini.
 */
async function selectParagraphText(paragraph: Locator, startPercent = 0, endPercent = 100): Promise<void> {
  await paragraph.evaluate((el, { startP, endP }) => {
    const textNode = el.firstChild || el;
    const len = textNode.textContent?.length || 0;
    const startOffset = Math.max(0, Math.floor((startP / 100) * len));
    const endOffset = Math.min(len, Math.max(startOffset + 5, Math.floor((endP / 100) * len)));

    const range = document.createRange();
    if (textNode.nodeType === Node.TEXT_NODE) {
      range.setStart(textNode, startOffset);
      range.setEnd(textNode, endOffset);
    } else {
      range.selectNodeContents(el);
    }

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  }, { startP: startPercent, endP: endPercent });
}

test.describe('Tier 2: Live Gemini Production E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to live Gemini web app
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Guard: Verify user is authenticated in the persistent test profile
    const isSignInPage = (await page.locator('input[type="email"], #identifierId').count()) > 0;
    if (isSignInPage) {
      console.warn('\n⚠️ [Tier 2 Skipped]: Google login required. Run `npm run setup:auth` first.\n');
      test.skip(true, 'Google authentication required in .test-user-data profile');
    }
  });

  test('1. Injects Ask Gemini components (Sidebar Bookmarks, Input handlers, Quota card) on live Gemini', async ({ page }) => {
    // 1. Verify Gemini live input area exists and is visible
    const inputArea = page.locator('.ql-editor[contenteditable="true"], rich-textarea, div[contenteditable="true"]').first();
    await expect(inputArea).toBeVisible({ timeout: 15000 });

    // 2. Wait for Google sidebar to finish loading and verify Bookmarks navigation link
    const bookmarksNav = page.locator('a[data-ag-nav="bookmarks"], #ag-bookmarks-sidebar-btn, a[href="#bookmarks"], [aria-label*="Bookmarks" i]').first();
    await expect(bookmarksNav).toBeAttached({ timeout: 25000 });

    // 3. If pro user quota card is attached, verify usage display & refresh button
    const quotaCard = page.locator('#ag-quota-sidebar');
    if (await quotaCard.count() > 0 && await quotaCard.isVisible()) {
      await expect(quotaCard).toContainText('%');
      const refreshBtn = page.locator('#ag-quota-refresh-btn');
      if (await refreshBtn.isVisible()) {
        await refreshBtn.click();
        await expect(refreshBtn).toHaveClass(/spinning/);
      }
    }
  });

  test('2. Complete Live Multi-Quote Stacking (1 -> 2 -> 3), Scroll-to-Highlight & Context Clearing', async ({ page }) => {
    test.setTimeout(90000);
    await ensureLiveResponseExists(page);

    const paragraphs = page.locator('model-response p, .model-response p, .message-content p');
    await expect(paragraphs.first()).toBeVisible({ timeout: 15000 });

    const floatBtn = page.locator('#ask-gemini-float-btn');
    const contextBox = page.locator('#ask-gemini-context-box');

    // ─── Quote 1: Select first segment ───
    await selectParagraphText(paragraphs.first(), 0, 45);
    await expect(floatBtn).toBeVisible({ timeout: 8000 });
    await expect(floatBtn).toContainText('Ask Gemini');
    await floatBtn.click();
    await expect(contextBox).toBeVisible({ timeout: 5000 });

    const contextContent = page.locator('#ask-gemini-context-content');
    // Context box now has 1 quote
    await expect(contextContent).toBeVisible();

    // ─── Quote 2: Select second segment -> "+ Add Quote" ───
    await selectParagraphText(paragraphs.first(), 50, 95);
    await expect(floatBtn).toBeVisible({ timeout: 8000 });
    await expect(floatBtn).toContainText('Add Quote');
    await floatBtn.click();
    await page.waitForTimeout(300);

    // Context box now reflects 2 stacked quotes
    await expect(contextContent).toContainText('2 quotes queued');

    // ─── Quote 3: Select third segment if available, or another paragraph ───
    const secondP = (await paragraphs.count()) > 1 ? paragraphs.nth(1) : paragraphs.first();
    await selectParagraphText(secondP, 10, 60);
    await expect(floatBtn).toBeVisible({ timeout: 8000 });
    await floatBtn.click();
    await page.waitForTimeout(300);

    // Context box now reflects 3 stacked quotes
    await expect(contextContent).toContainText('3 quotes queued');

    // Click draft content to test scroll-to-highlight
    await page.locator('.ask-gemini-draft-content').click();
    await page.waitForTimeout(300);

    // Click "Clear all" context action
    const clearAllContextBtn = page.locator('.ask-gemini-draft-close');
    await clearAllContextBtn.click();
    await expect(contextBox).not.toBeVisible();
  });

  test('3. Live 4-Turn Conversational Workflow with Multi-Quote & Dynamic Table of Contents', async ({ page }) => {
    test.setTimeout(180000);

    const prompts = [
      'Reply in 3 words: Apple orange banana',
      'Reply in 3 words: Red green blue',
      'Reply in 3 words: Spring summer winter',
      'Reply in 3 words: Earth mars jupiter'
    ];

    for (let i = 0; i < prompts.length; i++) {
      // 1. Send prompt for turn
      await sendLivePrompt(page, prompts[i]);

      // 2. Highlight text in response and Quote & Reply
      const paragraphs = page.locator('model-response p, .model-response p');
      const lastP = paragraphs.last();
      await selectParagraphText(lastP, 0, 80);

      const floatBtn = page.locator('#ask-gemini-float-btn');
      await expect(floatBtn).toBeVisible({ timeout: 8000 });
      await floatBtn.click();

      // Verify quote chip is attached
      const contextBox = page.locator('#ask-gemini-context-box');
      await expect(contextBox).toBeVisible({ timeout: 5000 });

      // Clean context draft before sending next turn
      await page.locator('.ask-gemini-draft-close').click();
      await page.waitForTimeout(300);
    }

    // After 4 turns, TOC widget must be rendered with side dashes
    const tocWidget = page.locator('#ag-toc-widget');
    await expect(tocWidget).toBeAttached({ timeout: 10000 });

    const dashes = page.locator('.ag-toc-dash');
    await expect(dashes.first()).toBeVisible();

    // Click a TOC dash to verify smooth scrolling to turn
    await dashes.first().click();
    await page.waitForTimeout(500);

    const userQueries = page.locator('user-query');
    await expect(userQueries.first()).toBeInViewport();
  });

  test('4. Live Send & Enter Key Interception with Quoted Reply Context', async ({ page }) => {
    test.setTimeout(90000);
    await ensureLiveResponseExists(page);

    const paragraph = page.locator('model-response p, .model-response p').first();
    await selectParagraphText(paragraph, 0, 70);

    const floatBtn = page.locator('#ask-gemini-float-btn');
    await expect(floatBtn).toBeVisible({ timeout: 8000 });
    await floatBtn.click();

    const contextBox = page.locator('#ask-gemini-context-box');
    await expect(contextBox).toBeVisible({ timeout: 5000 });

    // Type a prompt in live input
    const inputArea = page.locator('.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"], rich-textarea').first();
    await inputArea.click();
    await page.keyboard.type('Test question regarding this quote');
    await page.waitForTimeout(300);

    // Intercepted Enter key submits with quoted markdown context prepended
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Context box draft should be flushed immediately on send
    await expect(contextBox).not.toBeVisible();
  });

  test('5. Live Smart Paste (Confirmation Modal, Paste as Text, Auto Chip, Undo Pill & Multi-File with Text)', async ({ page }) => {
    const inputArea = page.locator('.ql-editor[contenteditable="true"]').first();
    await inputArea.waitFor({ state: 'visible', timeout: 15000 });
    await inputArea.click();

    const largePayload1 = 'Live automated validation of Smart Paste large text conversion #1. '.repeat(100);
    const largePayload2 = 'Live automated validation of Smart Paste large text conversion #2. '.repeat(100);
    expect(largePayload1.length).toBeGreaterThanOrEqual(5000);

    // ── Scenario A: 'Ask' Mode Confirmation Dialog ──
    await page.evaluate(() => {
      window.AskGemini.smartPasteBehavior = 'ask';
      window.AskGemini.promptSmartPasteConfirmation('Live automated validation of Smart Paste. '.repeat(100));
    });

    const confirmModal = page.locator('#ag-sp-confirm-modal');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.ag-sp-dialog-title')).toContainText('Convert large text to document?');

    // Click "Paste as text"
    const pasteAsTextBtn = page.locator('#ag-sp-confirm-paste');
    await pasteAsTextBtn.click();
    await expect(confirmModal).not.toBeVisible();

    // ── Scenario B: 'Auto' Mode File Attachment & Inline Pill Undo ──
    await page.evaluate((text) => {
      window.AskGemini.smartPasteBehavior = 'auto';
      window.AskGemini.processSmartPaste(text);
    }, largePayload1);
    await page.waitForTimeout(400);

    // Verify "Paste as text" pill appears in DOM
    const pill = page.locator('.ag-gem-paste-as-text-pill');
    await expect(pill).toBeVisible({ timeout: 8000 });
    await expect(pill).toContainText('Paste as text');

    // Click inline pill to undo and revert to raw text
    await pill.click();
    await page.waitForTimeout(300);
    await expect(pill).not.toBeVisible();

    // Clean up input safely with keyboard
    await inputArea.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // ── Scenario C: Multi Smart Paste Files in One Chat with Text Attached ──
    await page.evaluate((payloads) => {
      window.AskGemini.smartPasteBehavior = 'auto';
      window.AskGemini.processSmartPaste(payloads.file1);
      window.AskGemini.processSmartPaste(payloads.file2);
    }, { file1: largePayload1, file2: largePayload2 });
    await page.waitForTimeout(400);

    // Verify both files are attached in the pending queue
    const queueLen = await page.evaluate(() => (window.AskGemini?.pendingSmartPastes || []).length);
    expect(queueLen).toBe(2);

    // Attach user query text alongside the attached files
    await inputArea.focus();
    await page.keyboard.type('Here is my query accompanying both pasted files.');
    await page.waitForTimeout(300);

    const inputText = await inputArea.innerText();
    expect(inputText).toContain('Here is my query accompanying both pasted files.');

    // Clean up queue and input
    await page.evaluate(() => {
      if (window.AskGemini?.pendingSmartPastes) window.AskGemini.pendingSmartPastes = [];
    });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
  });

  test('6. Live Bookmarks Full Lifecycle (Save, Toast, Ctrl+Shift+B, Search, Reader View)', async ({ page }) => {
    test.setTimeout(90000);
    await ensureLiveResponseExists(page);

    const bookmarkBtns = page.locator('.ag-bookmark-btn');
    await expect(bookmarkBtns.first()).toBeVisible({ timeout: 15000 });

    // 1. Click bookmark button on live response
    await bookmarkBtns.first().click();
    await page.waitForTimeout(500);

    const toastOrBanner = page.locator('.ag-bookmark-first-banner, .ag-bookmark-toast, #ag-sp-toast');
    await expect(toastOrBanner.first()).toBeVisible({ timeout: 5000 });

    // 2. Open overlay with keyboard shortcut Ctrl+Shift+B
    await page.keyboard.press('Control+Shift+B');
    await page.waitForTimeout(600);

    const overlay = page.locator('#ag-bookmarks-overlay');
    await expect(overlay).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.ag-headline-m')).toHaveText('Bookmarks');

    // 3. Search input filtering
    const searchInput = page.locator('#ag-bookmarks-search-input');
    await searchInput.fill('Gemini');
    await page.waitForTimeout(300);

    // 4. Open Reader View on first bookmark card
    const cards = page.locator('.ag-bookmark-card');
    if (await cards.count() > 0) {
      await cards.first().click();
      await page.waitForTimeout(400);

      const readerView = page.locator('#ag-bookmarks-reader-view');
      await expect(readerView).toBeVisible();

      // Verify Copy response button
      const copyBtn = page.locator('#ag-reader-copy-btn');
      await expect(copyBtn).toBeVisible();
      await expect(copyBtn).toContainText('Copy response');

      // Navigate back to list view
      const readerBackBtn = page.locator('#ag-reader-back-btn');
      await readerBackBtn.click();
      await page.waitForTimeout(300);
      await expect(readerView).not.toBeVisible();
    }

    // Close overlay
    const backBtn = page.locator('#ag-bookmarks-back-btn');
    await backBtn.click();
    await expect(overlay).not.toBeVisible();
  });

  test('7. Live Popup Settings Enforcement on Real Gemini (Stop/Restore without Reload)', async ({ page, extensionId, context }) => {
    await ensureLiveResponseExists(page);

    const floatBtn = page.locator('#ask-gemini-float-btn');
    const bookmarkBtns = page.locator('.ag-bookmark-btn');
    const paragraph = page.locator('model-response p, .model-response p').first();

    // Open popup page in a second tab
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // ── 1. Toggle Quote Reply OFF ──
    const qrSwitch = popupPage.locator('#switch-qr');
    await expect(qrSwitch).toBeChecked();
    await popupPage.locator('label:has(#switch-qr)').click();
    await popupPage.waitForTimeout(300);

    // On live Gemini page: selecting text must NOT display the float button
    await page.bringToFront();
    await selectParagraphText(paragraph, 0, 50);
    await page.waitForTimeout(300);
    await expect(floatBtn).not.toBeVisible();

    // Toggle Quote Reply back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-qr)').click();
    await popupPage.waitForTimeout(300);

    // Re-select: float button immediately appears
    await page.bringToFront();
    await selectParagraphText(paragraph, 0, 50);
    await expect(floatBtn).toBeVisible({ timeout: 5000 });

    // ── 2. Toggle Bookmarks OFF ──
    await popupPage.bringToFront();
    const bookmarksSwitch = popupPage.locator('#switch-bookmarks');
    await expect(bookmarksSwitch).toBeChecked();
    await popupPage.locator('label:has(#switch-bookmarks)').click();
    await popupPage.waitForTimeout(300);

    // On live Gemini page: bookmark buttons are removed
    await page.bringToFront();
    await expect(page.locator('.ag-bookmark-btn')).toHaveCount(0);

    // Toggle Bookmarks back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-bookmarks)').click();
    await popupPage.waitForTimeout(300);

    // Bookmark buttons reappear
    await page.bringToFront();
    await expect(page.locator('.ag-bookmark-btn').first()).toBeVisible({ timeout: 5000 });

    await popupPage.close();
  });
});
