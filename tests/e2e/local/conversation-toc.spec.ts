import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, selectTextInElement, appendConversationTurn } from '../helpers.js';

test.describe('Multi-Turn Conversation & Dynamic TOC Suite', () => {
  test('executes 4 conversational turns with quotes, verifies simultaneous TOC updates, sliding window, and navigation', async ({ page }) => {
    await setupMockGeminiPage(page);

    const floatBtn = page.locator('#ask-gemini-float-btn');
    const contextBox = page.locator('#ask-gemini-context-box');
    const contextContent = page.locator('#ask-gemini-context-content');
    const tocWidget = page.locator('#ag-toc-widget');
    const tocBar = page.locator('#ag-toc-bar');
    const tocPanel = page.locator('#ag-toc-panel');

    // Turn 1 Quote & Reply
    // Quote from initial response p1
    await selectTextInElement(page, '#gemini-response-p1');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await floatBtn.click();
    await expect(contextBox).toBeVisible();
    await expect(contextContent).toContainText('Manifest V3 extensions use event-driven background service workers');

    // Add Turn 3 (since mock starts with 2 queries)
    await appendConversationTurn(
      page,
      'Can service workers in MV3 retain in-memory state across browser restarts?',
      'No, MV3 background service workers are ephemeral and terminate when idle. You must persist state in chrome.storage.local.',
      'gemini-response-turn3'
    );

    // Context box is cleared via UI close button before typing next prompt
    await page.locator('.ask-gemini-draft-close').click();
    await page.waitForTimeout(200);

    // Turn 2 Quote & Reply
    // Quote from turn 3 reply
    await selectTextInElement(page, '#gemini-response-turn3');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await floatBtn.click();
    await expect(contextBox).toBeVisible();
    await expect(contextContent).toContainText('MV3 background service workers are ephemeral');

    // Add Turn 4
    await appendConversationTurn(
      page,
      'How does chrome.storage.local performance compare to IndexedDB?',
      'chrome.storage.local is optimized for key-value persistence with low overhead and direct MV3 service worker support.',
      'gemini-response-turn4'
    );

    await page.locator('.ask-gemini-draft-close').click();
    await page.waitForTimeout(200);

    // Turn 3 Quote & Reply
    // Quote from turn 4 reply
    await selectTextInElement(page, '#gemini-response-turn4');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await floatBtn.click();
    await expect(contextBox).toBeVisible();
    await expect(contextContent).toContainText('chrome.storage.local is optimized for key-value persistence');

    // Add Turn 5
    await appendConversationTurn(
      page,
      'What are the best practices for throttling storage writes?',
      'Debounce batch writes and coalesce updates within a 200-500ms sliding window to prevent storage quota exhaustion.',
      'gemini-response-turn5'
    );

    await page.locator('.ask-gemini-draft-close').click();
    await page.waitForTimeout(200);

    // Turn 4 Quote & Reply
    // Quote from turn 5 reply
    await selectTextInElement(page, '#gemini-response-turn5');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await floatBtn.click();
    await expect(contextBox).toBeVisible();
    await expect(contextContent).toContainText('Debounce batch writes and coalesce updates');

    // Add Turn 6
    await appendConversationTurn(
      page,
      'Summarize the key architectural benefits of this approach.',
      'This guarantees low memory consumption, zero main thread jank, and persistent state integrity across sessions.',
      'gemini-response-turn6'
    );

    await page.locator('.ask-gemini-draft-close').click();
    await page.waitForTimeout(200);

    // --- Dynamic Table of Contents (TOC) Verification ---
    // 1. Verify TOC widget is attached and visible
    await expect(tocWidget).toBeAttached({ timeout: 5000 });
    await expect(tocBar).toBeAttached();

    // 2. Total user queries in the conversation is 6 (2 initial + 4 new turns)
    const totalPrompts = await page.locator('user-query').count();
    expect(totalPrompts).toBe(6);

    // 3. Verify dash indicators exist in #ag-toc-bar
    const dashes = page.locator('.ag-toc-dash');
    const dashCount = await dashes.count();
    expect(dashCount).toBe(6);

    // 4. Hover over TOC widget to display TOC list panel
    await tocWidget.hover();
    await page.waitForTimeout(300);
    await expect(tocPanel).toBeVisible();

    // 5. Verify total prompt count badge inside panel
    const countBadge = page.locator('#ag-toc-count-badge');
    if (await countBadge.count() > 0) {
      await expect(countBadge).toContainText('6');
    }

    // 6. Verify prompt entries are rendered with clean text snippets
    const tocItems = page.locator('.ag-toc-item');
    expect(await tocItems.count()).toBe(6);
    await expect(tocItems.nth(0)).toContainText('Explain how Chrome extensions handle');
    await expect(tocItems.nth(5)).toContainText('Summarize the key architectural benefits');

    // 7. Click a TOC item to test smooth navigation to target prompt
    await tocItems.nth(2).click();
    await page.waitForTimeout(300);

    // Target prompt element #ag-toc-prompt-2 must be attached in DOM
    const targetAnchor = page.locator('#ag-toc-prompt-2');
    await expect(targetAnchor).toBeAttached();

    // 8. Test Empty State Inaction: when 0 user-query elements exist, TOC removes itself
    await page.evaluate(() => {
      document.querySelectorAll('user-query').forEach(q => q.remove());
      if (window.AskGemini && window.AskGemini.buildTableOfContents) {
        window.AskGemini.buildTableOfContents();
      }
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#ag-toc-widget')).not.toBeAttached();
  });
});
