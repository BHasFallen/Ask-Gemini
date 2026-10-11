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

    // ─── 5. Cleanup ───
    await popupPage.close();
  });

  test('verifies popup is completely demonetized, free, and unrestricted with no Pro badges, tabs, or waitlist', async ({ context, extensionId }) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // 1. Verify NO Pro tab or Pro panel exists
    const proTabBtn = popupPage.locator('#tab-btn-pro');
    const proPanel = popupPage.locator('#tab-panel-pro');
    await expect(proTabBtn).not.toBeAttached();
    await expect(proPanel).not.toBeAttached();

    // 2. Verify NO Waitlist email input exists
    const emailInput = popupPage.locator('#waitlist-email-input');
    await expect(emailInput).not.toBeAttached();

    // 3. Verify NO Pro preview badges exist anywhere
    const proBadges = popupPage.locator('.pro-preview-badge');
    expect(await proBadges.count()).toBe(0);

    // 4. Verify all core switches are visible, functional, and unrestricted
    const switchAuto = popupPage.locator('#switch-auto-mode');
    const switchBm = popupPage.locator('#switch-bookmarks');
    const switchQr = popupPage.locator('#switch-qr');
    const switchMq = popupPage.locator('#switch-mq');
    const switchToc = popupPage.locator('#switch-toc');

    await expect(popupPage.locator('label:has(#switch-auto-mode)')).toBeVisible();
    await expect(switchAuto).toBeAttached();
    await expect(switchAuto).toBeChecked();

    await expect(popupPage.locator('label:has(#switch-bookmarks)')).toBeVisible();
    await expect(switchBm).toBeAttached();
    await expect(switchBm).toBeChecked();

    await expect(popupPage.locator('label:has(#switch-qr)')).toBeVisible();
    await expect(switchQr).toBeAttached();
    await expect(switchQr).toBeChecked();

    await expect(popupPage.locator('label:has(#switch-mq)')).toBeVisible();
    await expect(switchMq).toBeAttached();
    await expect(switchMq).toBeChecked();

    await expect(popupPage.locator('label:has(#switch-toc)')).toBeVisible();
    await expect(switchToc).toBeAttached();
    await expect(switchToc).toBeChecked();

    await popupPage.close();
  });
});
