import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage } from '../helpers.js';

test.describe('Auto Mode Feature Suite', () => {
  test('verifies Auto Mode state, DOM option insertion, and popup toggle control', async ({ page, extensionId, context }) => {
    // 1. Setup Mock Gemini Page
    await setupMockGeminiPage(page);

    // Verify AskGemini has Auto Mode module loaded
    const isModuleLoaded = await page.evaluate(() => {
      return typeof window.AskGemini?.autoModeEnabled === 'boolean' && window.AskGemini?.AUTO_MODE_ID === 'a74ec8485b3b5ce4';
    });
    expect(isModuleLoaded).toBe(true);

    // 2. Test DOM Menu Enhancement (simulates Gemini opening the model menu)
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'mat-mdc-menu-panel';
      overlay.innerHTML = `
        <button role="menuitem" class="mat-mdc-menu-item bard-mode-list-button" data-mode-id="8c46e95b1a07cecc">
          <span>Flash-Lite</span>
        </button>
      `;
      document.body.appendChild(overlay);
      window.AskGemini.ensureAutoModeOptionInDOM(overlay);
    });

    const autoBtn = page.locator('button[data-mode-id="a74ec8485b3b5ce4"]');
    await expect(autoBtn).toBeVisible({ timeout: 5000 });
    await expect(autoBtn).toHaveAttribute('data-test-id', 'bard-mode-option-auto');
    await expect(autoBtn.locator('.mode-title')).toHaveText('Auto');
    await expect(autoBtn.locator('.mode-desc')).toHaveText('Adapts to your needs');

    // Click Auto Mode button and assert selection
    await autoBtn.click();
    await expect(autoBtn).toHaveClass(/is-selected/);

    // 3. Open Popup and verify Auto Mode switch exists and is checked
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    const autoSwitch = popupPage.locator('#switch-auto-mode');
    await expect(popupPage.locator('label:has(#switch-auto-mode)')).toBeVisible({ timeout: 5000 });
    await expect(autoSwitch).toBeAttached();
    await expect(autoSwitch).toBeChecked();

    // Toggle Auto Mode OFF
    await popupPage.locator('label:has(#switch-auto-mode)').click();
    await popupPage.waitForTimeout(300);
    await expect(autoSwitch).not.toBeChecked();

    // Verify storage was updated to false
    const storageState = await popupPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get(['auto_mode_enabled'], resolve);
      });
    });
    expect((storageState as any).auto_mode_enabled).toBe(false);

    // Verify page state updated via storage listener
    await page.bringToFront();
    const isAutoActiveOnPage = await page.evaluate(() => window.AskGemini.autoModeEnabled);
    expect(isAutoActiveOnPage).toBe(false);

    // Toggle Auto Mode back ON
    await popupPage.bringToFront();
    await popupPage.locator('label:has(#switch-auto-mode)').click();
    await popupPage.waitForTimeout(300);
    await expect(autoSwitch).toBeChecked();

    await page.bringToFront();
    const isAutoRestored = await page.evaluate(() => window.AskGemini.autoModeEnabled);
    expect(isAutoRestored).toBe(true);
  });

  test('verifies symmetrical switching between Auto and standard models updates trigger label and exclusive checkmarks', async ({ page }) => {
    await setupMockGeminiPage(page);

    // Setup trigger button and mock menu in page
    await page.evaluate(() => {
      // Create trigger button
      const triggerBtn = document.createElement('button');
      triggerBtn.className = 'input-area-switch';
      triggerBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
      triggerBtn.innerHTML = `
        <span class="picker-primary-text">Flash-Lite</span>
        <span class="picker-secondary-text">Fastest answers</span>
      `;
      document.body.appendChild(triggerBtn);

      // Create model menu
      const overlay = document.createElement('div');
      overlay.className = 'mat-mdc-menu-panel';
      overlay.innerHTML = `
        <button role="menuitem" class="mat-mdc-menu-item bard-mode-list-button is-selected" data-mode-id="8c46e95b1a07cecc">
          <span class="mode-title">Flash-Lite</span>
          <span class="mode-desc">Fastest answers</span>
        </button>
        <button role="menuitem" class="mat-mdc-menu-item bard-mode-list-button" data-mode-id="56fdd199312815e2">
          <span class="mode-title">Flash</span>
          <span class="mode-desc">All-around help</span>
        </button>
      `;
      document.body.appendChild(overlay);
      window.AskGemini.ensureAutoModeOptionInDOM(overlay);
    });

    const triggerLabel = page.locator('.picker-primary-text');
    await expect(triggerLabel).toHaveText('Flash-Lite');

    const autoBtn = page.locator('button[data-mode-id="a74ec8485b3b5ce4"]');
    const flashLiteBtn = page.locator('button[data-mode-id="8c46e95b1a07cecc"]');
    const flashBtn = page.locator('button[data-mode-id="56fdd199312815e2"]');

    // 1. Click Auto Mode
    await autoBtn.click();
    await expect(autoBtn).toHaveClass(/is-selected/);
    await expect(flashLiteBtn).not.toHaveClass(/is-selected/);
    await expect(flashBtn).not.toHaveClass(/is-selected/);
    await expect(triggerLabel).toHaveText('Auto');

    // 2. Click standard model Flash (56fdd199312815e2)
    await flashBtn.click();
    await expect(flashBtn).toHaveClass(/is-selected/);
    await expect(autoBtn).not.toHaveClass(/is-selected/);
    await expect(flashLiteBtn).not.toHaveClass(/is-selected/);
    await expect(triggerLabel).toHaveText('Flash');

    // 3. Verify debugAutoMode diagnostics output
    const diag = await page.evaluate(() => window.AskGemini.debugAutoMode());
    expect(diag.currentModel).toBe('56fdd199312815e2');
    expect(diag.isAuto).toBe(false);
    expect(diag.pickerText).toContain('Flash');

    // 4. Click Flash-Lite (8c46e95b1a07cecc)
    await flashLiteBtn.click();
    await expect(flashLiteBtn).toHaveClass(/is-selected/);
    await expect(flashBtn).not.toHaveClass(/is-selected/);
    await expect(autoBtn).not.toHaveClass(/is-selected/);
    await expect(triggerLabel).toHaveText('Flash-Lite');

    const diagLite = await page.evaluate(() => window.AskGemini.debugAutoMode());
    expect(diagLite.currentModel).toBe('8c46e95b1a07cecc');
    expect(diagLite.isAuto).toBe(false);
    expect(diagLite.pickerText).toContain('Flash-Lite');
  });
});
