import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, setExtensionStorage } from '../helpers.js';

test.describe('Quota / Usage Limits Suite', () => {
  test('renders pro user quota card, updates dynamic color thresholds, triggers refresh, and respects free user tier', async ({ page, extensionId }) => {
    // Seed initial quota cache in storage
    await setExtensionStorage(page, extensionId, {
      usage_limits_enabled: true,
      quota_limits: {
        isProUser: true,
        currentUsage: 25,
        resetTime: '4:00 PM',
      },
      last_quota_check: Date.now(),
    });

    await setupMockGeminiPage(page);

    const quotaSidebar = page.locator('#ag-quota-sidebar');
    const refreshBtn = page.locator('#ag-quota-refresh-btn');

    // Wait for initial quota card mount and background roundtrip
    await expect(quotaSidebar).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    // ─── 1. Pro User Usage Display: Low Usage (<= 50%) ───
    await page.evaluate(() => {
      window.AskGemini.updateQuotaDisplay({
        isProUser: true,
        currentUsage: 25,
        resetTime: '4:00 PM',
      });
    });
    await page.waitForTimeout(300);

    await expect(quotaSidebar).toContainText('25%');
    await expect(quotaSidebar).toContainText('Resets at 4:00 PM');

    // Verify fill color for <= 50% is light blue (#a8c7fa or rgb(168, 199, 250))
    const fillEl = page.locator('.ag-sidebar-usage-fill');
    await expect(fillEl).toHaveCSS('background-color', 'rgb(168, 199, 250)');

    // ─── 2. Medium Usage (> 50%, <= 80%) ───
    await page.evaluate(() => {
      window.AskGemini.updateQuotaDisplay({
        isProUser: true,
        currentUsage: 65,
        resetTime: '4:00 PM',
      });
    });
    await page.waitForTimeout(200);

    await expect(quotaSidebar).toContainText('65%');
    // Verify fill color for > 50% is yellow (#fbbc05 or rgb(251, 188, 5))
    await expect(fillEl).toHaveCSS('background-color', 'rgb(251, 188, 5)');

    // ─── 3. High Usage (> 80%) ───
    await page.evaluate(() => {
      window.AskGemini.updateQuotaDisplay({
        isProUser: true,
        currentUsage: 92,
        resetTime: '5:30 PM',
      });
    });
    await page.waitForTimeout(200);

    await expect(quotaSidebar).toContainText('92%');
    // Verify fill color for > 80% is warning red (#ea4335 or rgb(234, 67, 53))
    await expect(fillEl).toHaveCSS('background-color', 'rgb(234, 67, 53)');

    // ─── 4. Refresh Button Interaction ───
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Clicking refresh adds .spinning class
    await expect(refreshBtn).toHaveClass(/spinning/);
    await page.waitForTimeout(1000);

    // ─── 5. Free Plan Behavior (isProUser: false) ───
    await page.evaluate(() => {
      window.AskGemini.updateQuotaDisplay({
        isProUser: false,
        currentUsage: 0,
      });
    });
    await page.waitForTimeout(300);

    // Sidebar quota card must be removed for free tier users
    await expect(quotaSidebar).not.toBeAttached();
  });
});
