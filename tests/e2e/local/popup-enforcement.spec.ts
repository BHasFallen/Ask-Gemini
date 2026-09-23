import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, selectTextInElement, setExtensionStorage } from '../helpers.js';

test.describe('Popup Settings & Live Enforcement Suite', () => {
  test('asserts toggling features in popup immediately stops/restores functionality on live page without reload', async ({ page, extensionId, context }) => {
    // 1. Start on Gemini page
    await setupMockGeminiPage(page);

    // Initial state check: TOC, Bookmarks, and Quota should be active
    const floatBtn = page.locator('#ask-gemini-float-btn');
    const tocWidget = page.locator('#ag-toc-widget');
    const bookmarkBtns = page.locator('.ag-bookmark-btn');

    await expect(tocWidget).toBeAttached({ timeout: 5000 });
    await expect(bookmarkBtns.first()).toBeVisible({ timeout: 5000 });

    // Inject quota card to test its live toggle
    await page.evaluate(() => {
      window.AskGemini.usageLimitsEnabled = true;
      window.AskGemini.updateQuotaDisplay({ isProUser: true, currentUsage: 45 });
    });
    const quotaCard = page.locator('#ag-quota-sidebar');
    await expect(quotaCard).toBeVisible({ timeout: 5000 });

    // Open popup page in a second tab
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // ─── 1. Live Enforcement: Table of Contents Toggle ───
    const tocSwitch = popupPage.locator('#switch-toc');
    await expect(tocSwitch).toBeChecked();
    await popupPage.locator('label:has(#switch-toc)').click();
    await popupPage.waitForTimeout(300);

    // Assert TOC widget is instantly removed from the Gemini page without reload
    await page.bringToFront();
    await expect(tocWidget).not.toBeAttached();

    // Toggle TOC back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-toc)').click();
    await popupPage.waitForTimeout(300);
    await page.bringToFront();
    await expect(page.locator('#ag-toc-widget')).toBeAttached({ timeout: 5000 });

    // ─── 2. Live Enforcement: Quota Limits Toggle ───
    await popupPage.bringToFront();
    const limitsSwitch = popupPage.locator('#switch-limits');
    await expect(limitsSwitch).toBeChecked();
    await popupPage.locator('label:has(#switch-limits)').click();
    await popupPage.waitForTimeout(300);

    // Assert Quota card is instantly removed
    await page.bringToFront();
    await expect(quotaCard).not.toBeAttached();

    // Toggle Quota back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-limits)').click();
    await popupPage.waitForTimeout(300);

    // ─── 3. Live Enforcement: Bookmarks Toggle ───
    await popupPage.bringToFront();
    const bookmarksSwitch = popupPage.locator('#switch-bookmarks');
    await expect(bookmarksSwitch).toBeChecked();
    await popupPage.locator('label:has(#switch-bookmarks)').click();
    await popupPage.waitForTimeout(300);

    // Assert all bookmark buttons are removed from response actions
    await page.bringToFront();
    await expect(page.locator('.ag-bookmark-btn')).toHaveCount(0);

    // Toggle Bookmarks back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-bookmarks)').click();
    await popupPage.waitForTimeout(300);
    await page.bringToFront();
    await expect(page.locator('.ag-bookmark-btn').first()).toBeVisible({ timeout: 5000 });

    // ─── 4. Live Enforcement: Quote Reply Master Toggle ───
    await popupPage.bringToFront();
    const qrSwitch = popupPage.locator('#switch-qr');
    await expect(qrSwitch).toBeChecked();
    await popupPage.locator('label:has(#switch-qr)').click();
    await popupPage.waitForTimeout(300);

    // On Gemini page: selecting text must NEVER display the float button when disabled
    await page.bringToFront();
    await selectTextInElement(page, '#gemini-response-p1');
    await page.waitForTimeout(400);
    await expect(floatBtn).not.toBeVisible();

    // Toggle Quote Reply back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-qr)').click();
    await popupPage.waitForTimeout(300);

    // Reselect text: float button must immediately reappear
    await page.bringToFront();
    await selectTextInElement(page, '#gemini-response-p1');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });

    // ─── 5. Value Dashboard Metrics ───
    await popupPage.bringToFront();
    await popupPage.evaluate(async () => {
      await chrome.storage.local.set({
        rating_state: {
          totalWords: 2500,
          replyCount: 17,
        },
      });
    });
    await popupPage.reload();

    await expect(popupPage.locator('#time-saved')).toContainText('42 mins');
    await expect(popupPage.locator('#words-analyzed')).toContainText('2.5k words');

    await popupPage.close();
  });
});
