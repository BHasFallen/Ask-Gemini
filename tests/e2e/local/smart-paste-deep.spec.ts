import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, clearExtensionStorage, setExtensionStorage } from '../helpers.js';

test.describe('Advanced Smart Paste Suite', () => {
  test('handles threshold interception, ask dialog, auto conversion, paste-as-text pill, multi-file attachments, send flush, and feedback dialog', async ({ page, extensionId }) => {
    // 1. Configure Smart Paste mode to 'ask'
    await clearExtensionStorage(page, extensionId);
    await setExtensionStorage(page, extensionId, {
      smart_paste_behavior: 'ask',
      smart_paste_threshold: 5000,
    });

    await setupMockGeminiPage(page);

    const largePayload1 = 'Detailed algorithmic analysis and system architecture data points. '.repeat(100);
    expect(largePayload1.length).toBeGreaterThanOrEqual(5000);

    // ─── Scenario 1: 'Ask' Mode Confirmation Dialog ───
    await page.evaluate((text) => {
      const editor = document.querySelector('.ql-editor') as HTMLElement | null;
      if (!editor) throw new Error('Editor not found');
      editor.focus();

      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(pasteEvent);
    }, largePayload1);

    const confirmModal = page.locator('#ag-sp-confirm-modal');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.ag-sp-dialog-title')).toContainText('Convert large text to document?');

    // Click "Paste as text"
    const pasteAsTextBtn = page.locator('#ag-sp-confirm-paste');
    await pasteAsTextBtn.click();

    // Verify modal dismissed and editor received the text
    await expect(confirmModal).not.toBeVisible();
    const editor = page.locator('.ql-editor');
    await expect(editor).toContainText('Detailed algorithmic analysis');

    // Clear editor
    await editor.evaluate((el) => { el.innerHTML = ''; });

    // ─── Scenario 2: 'Auto' Mode with 'Paste as text' Pill ───
    await page.evaluate(() => {
      window.AskGemini.smartPasteBehavior = 'auto';
    });

    const largePayload2 = 'Second massive data block for auto-attachment test execution. '.repeat(100);

    await page.evaluate((text) => {
      const ed = document.querySelector('.ql-editor') as HTMLElement | null;
      if (!ed) throw new Error('Editor not found');
      ed.focus();

      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      ed.dispatchEvent(pasteEvent);
    }, largePayload2);

    // Verify file preview chip appears in DOM
    const filePreviews = page.locator('uploader-file-preview');
    await expect(filePreviews.first()).toBeVisible({ timeout: 5000 });

    // Verify inline 'Paste as text' pill appears next to attachment chip
    const pill = page.locator('.ag-gem-paste-as-text-pill');
    await expect(pill).toBeVisible({ timeout: 5000 });
    await expect(pill).toContainText('Paste as text');

    // Click 'Paste as text' pill to undo attachment and revert to raw text in input
    await pill.click();
    await page.waitForTimeout(300);

    // Attachment chip must be removed and editor populated with raw text
    await expect(filePreviews).toHaveCount(0);
    await expect(editor).toContainText('Second massive data block');

    // Clear editor for next test
    await editor.evaluate((el) => { el.innerHTML = ''; });

    // ─── Scenario 3: Multi Smart Paste Files in One Chat ───
    // Directly process two smart paste files in sequence
    await page.evaluate(async () => {
      const AG = window.AskGemini;
      await AG.processSmartPaste('File payload 1 content: '.repeat(200));
      await AG.processSmartPaste('File payload 2 content: '.repeat(200));
    });
    await page.waitForTimeout(400);

    // Both attachments must exist in pending queue
    const pendingQueueLength = await page.evaluate(() => {
      return (window.AskGemini?.pendingSmartPastes || []).length;
    });
    expect(pendingQueueLength).toBe(2);

    // Pill should be visible and attached to the latest attachment
    await expect(page.locator('.ag-gem-paste-as-text-pill')).toBeVisible();

    // ─── Scenario 4: Queue Flush on Send ───
    const sendBtn = page.locator('button[aria-label*="Send message"]');
    await sendBtn.click();
    await page.waitForTimeout(300);

    // Queue must now be flushed to 0
    const queueAfterSend = await page.evaluate(() => {
      return (window.AskGemini?.pendingSmartPastes || []).length;
    });
    expect(queueAfterSend).toBe(0);

    // Inline pills should be cleaned up
    await expect(page.locator('.ag-gem-paste-as-text-pill-container')).toHaveCount(0);

    // ─── Scenario 5: Turn-off Feedback Modal ───
    await page.evaluate(() => {
      window.AskGemini.promptSmartPasteTurnOffFeedback(() => {});
    });
    await page.waitForTimeout(200);

    const offModal = page.locator('#ag-sp-off-modal');
    await expect(offModal).toBeVisible();
    await expect(offModal).toContainText('Why turn off Smart Paste?');

    // Close feedback modal
    const cancelFeedbackBtn = page.locator('#ag-sp-off-cancel');
    if (await cancelFeedbackBtn.count() > 0) {
      await cancelFeedbackBtn.click();
      await expect(offModal).not.toBeVisible();
    }
  });
});
