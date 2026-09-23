import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, setExtensionStorage } from '../helpers.js';

test.describe('Onboarding & Interactive Tour Suite', () => {
  test('verifies onboarding page layout and elements in install & update modes', async ({ page, extensionId }) => {
    // 1. Navigate to onboarding page in default install mode
    await page.goto(`chrome-extension://${extensionId}/onboarding.html?reason=install`);

    // Verify header branding and version pill
    await expect(page.locator('.ob-logo-name')).toContainText('Quote Reply for Gemini');
    await expect(page.locator('.ob-install-headline')).toContainText('Welcome to');

    // Verify Step breakdown (Steps 1, 2, 3)
    const steps = page.locator('.ob-step');
    expect(await steps.count()).toBe(3);
    await expect(steps.nth(0)).toContainText('Highlight target text');
    await expect(steps.nth(1)).toContainText('Click "Ask Gemini"');
    await expect(steps.nth(2)).toContainText('Type & Send');

    // Verify Call-to-action button
    const ctaBtn = page.locator('#ob-open-gemini-install');
    await expect(ctaBtn).toBeVisible();
    await expect(ctaBtn).toContainText('Open Gemini & try it');

    // 2. Navigate in update mode
    await page.goto(`chrome-extension://${extensionId}/onboarding.html?reason=update`);
    await expect(page.locator('.ob-update-headline')).toContainText("The fixes you've");
    await expect(page.locator('#ob-open-gemini-update')).toBeVisible();
  });

  test('verifies interactive guided tour overlay on Gemini', async ({ page, extensionId }) => {
    // Enable tour flag in extension storage
    await setExtensionStorage(page, extensionId, {
      ask_gemini_tour_active: true,
      tour_step: 1,
    });

    await setupMockGeminiPage(page);

    // Assert interactive tour overlay mounts
    const tourOverlay = page.locator('#ag-tour-overlay');
    await expect(tourOverlay).toBeAttached({ timeout: 5000 });

    // Verify tour tooltip card exists
    const tourTooltip = page.locator('#ag-tour-tooltip');
    await expect(tourTooltip).toBeAttached();

    // Verify skip button ends the tour cleanly
    const skipBtn = page.locator('#ag-tour-skip');
    await expect(skipBtn).toBeAttached();
    await skipBtn.click();
    await page.waitForTimeout(400);

    // Overlay should be dismissed
    await expect(page.locator('#ag-tour-overlay')).not.toBeAttached();
  });
});
