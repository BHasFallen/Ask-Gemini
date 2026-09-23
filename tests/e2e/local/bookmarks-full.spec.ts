import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, clearExtensionStorage } from '../helpers.js';

test.describe('Full Bookmarks Lifecycle Suite', () => {
  test('tests new user badge, first banner, subsequent toast, count badge, Ctrl+Shift+B, reader view, multi-token search, export, import, and empty state', async ({ page, extensionId }) => {
    // 1. Reset storage to simulate fresh install
    await clearExtensionStorage(page, extensionId);

    await setupMockGeminiPage(page);

    const bookmarkBtns = page.locator('.ag-bookmark-btn');
    await expect(bookmarkBtns.first()).toBeVisible({ timeout: 5000 });

    // 2. Fresh user sees solid purple "NEW" badge on sidebar
    const newBadge = page.locator('.ag-bookmarks-nav-new-badge');
    await expect(newBadge).toBeVisible();
    await expect(newBadge).toHaveText('New');

    // 3. First Bookmark Save: triggers First-Time Educational Banner
    await bookmarkBtns.first().click();
    await page.waitForTimeout(300);

    const firstBanner = page.locator('.ag-bookmark-first-banner');
    await expect(firstBanner).toBeVisible({ timeout: 5000 });
    await expect(firstBanner).toContainText('You just bookmarked a reply!');

    const viewBtn = page.locator('#ag-first-bm-view-btn');
    await expect(viewBtn).toBeVisible();
    await expect(viewBtn).toHaveText('View in Bookmarks');

    // Close first-time banner
    const closeBannerBtn = page.locator('#ag-first-bm-close-btn');
    if (await closeBannerBtn.count() > 0) {
      await closeBannerBtn.click();
      await expect(firstBanner).not.toBeVisible();
    }

    // 4. Second Bookmark Save: triggers quick Toast notification instead of banner
    if (await bookmarkBtns.count() > 1) {
      await bookmarkBtns.nth(1).click();
      await page.waitForTimeout(200);

      const toast = page.locator('#ag-bookmark-toast');
      await expect(toast).toBeVisible();
      await expect(toast).toContainText('Bookmarked!');
    }

    // 5. Sidebar badge should now show count "2" instead of "New"
    const countBadge = page.locator('.ag-bookmarks-nav-badge');
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toHaveText('2');
    await expect(newBadge).not.toBeVisible();

    // 6. Test Ctrl+Shift+B Keyboard Shortcut to Open Bookmarks Overlay
    await page.keyboard.press('Control+Shift+KeyB');
    await page.waitForTimeout(400);

    const overlay = page.locator('#ag-bookmarks-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('.ag-headline-m')).toHaveText('Bookmarks');

    // Overlay counter pill shows 2
    await expect(page.locator('#ag-overlay-count-pill')).toHaveText('2');

    // 7. Multi-Token Search Filtering
    const searchInput = page.locator('#ag-bookmarks-search-input');
    const cards = page.locator('.ag-bookmark-card');
    expect(await cards.count()).toBe(2);

    // Filter with multi-tokens matching first card
    await searchInput.fill('service workers');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Manifest V3 extensions');

    // Filter with non-matching token
    await searchInput.fill('quantum cryptography token xyz');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(0);
    await expect(page.locator('.ag-bookmarks-empty')).toBeVisible();

    // Clear search using clear button
    const clearSearchBtn = page.locator('#ag-bookmarks-search-clear');
    await expect(clearSearchBtn).toBeVisible();
    await clearSearchBtn.click();
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(2);

    // 8. Full Reader View
    // Click second card (first saved bookmark) to open reader view
    await cards.nth(1).click();
    await page.waitForTimeout(300);

    const readerView = page.locator('#ag-bookmarks-reader-view');
    await expect(readerView).toBeVisible();

    // Verify reader view displays prompt body, response body, copy button, and delete button
    const readerPrompt = page.locator('#ag-reader-prompt-body');
    await expect(readerPrompt).toBeVisible();
    await expect(readerPrompt).toContainText('Explain how Chrome extensions handle service workers');

    const readerBody = page.locator('#ag-reader-body');
    await expect(readerBody).toBeVisible();
    await expect(readerBody).toContainText('Manifest V3 extensions use event-driven background service workers');

    const copyBtn = page.locator('#ag-reader-copy-btn');
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toContainText('Copy response');

    // Test Reader Back button to return to list view
    const readerBackBtn = page.locator('#ag-reader-back-btn');
    await readerBackBtn.click();
    await page.waitForTimeout(300);
    await expect(readerView).not.toBeVisible();
    await expect(page.locator('#ag-bookmarks-list-view')).toBeVisible();

    // 9. Export Bookmarks
    const exportBtn = page.locator('#ag-bookmarks-export-btn');
    await expect(exportBtn).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/gemini-bookmarks-.*\.json/);
    await page.waitForTimeout(300);

    // 10. Clear All Bookmarks & Empty State
    const clearAllBtn = page.locator('#ag-bookmarks-clear-btn');
    // Clear all prompts a window.confirm dialog; handle it via page.once('dialog')
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await clearAllBtn.click();
    await page.waitForTimeout(400);

    // Verify empty state is displayed
    const emptyState = page.locator('.ag-bookmarks-empty');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No bookmarks yet');

    // 11. Import Bookmarks from JSON
    const testBookmarkData = [
      {
        id: 'ag_bm_import_1',
        promptText: 'Imported test question about Gemini',
        responseText: 'This is an imported response verified via Playwright.',
        responseHtml: '<p>This is an imported response verified via Playwright.</p>',
        conversationUrl: 'https://gemini.google.com/app',
        conversationId: 'app',
        createdAt: Date.now(),
        modelName: 'Gemini 1.5 Pro',
      },
    ];

    const fileInput = page.locator('#ag-bookmarks-file-input');
    await fileInput.setInputFiles({
      name: 'bookmarks-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(testBookmarkData)),
    });
    await page.waitForTimeout(400);

    // Verify imported card appears in list
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Imported test question about Gemini');

    // Close overlay via back button
    const backBtn = page.locator('#ag-bookmarks-back-btn');
    await backBtn.click();
    await page.waitForTimeout(300);
    await expect(overlay).not.toBeVisible();
  });
});
