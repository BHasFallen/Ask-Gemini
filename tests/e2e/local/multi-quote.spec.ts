import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, selectTextInElement } from '../helpers.js';

test.describe('Deep Multi-Quote Suite', () => {
  test('tests stacking quotes 1 -> 2 -> 3, scroll-to-highlight, context clearing, and compact vs expanded formats', async ({ page }) => {
    await setupMockGeminiPage(page);

    const floatBtn = page.locator('#ask-gemini-float-btn');
    const contextBox = page.locator('#ask-gemini-context-box');
    const contextContent = page.locator('#ask-gemini-context-content');

    // 1. Highlight Quote 1
    await selectTextInElement(page, '#gemini-response-p1');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await expect(floatBtn).toContainText('Ask Gemini');
    await floatBtn.click();
    await page.waitForTimeout(200);

    // Verify context box chip has quote 1 text
    await expect(contextBox).toBeVisible();
    await expect(contextContent).toContainText('Manifest V3 extensions use event-driven background service workers');

    // 2. Highlight Quote 2
    await selectTextInElement(page, '#gemini-response-p2');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    // Floating button dynamic label should now reflect "+ Add Quote (1)"
    await expect(floatBtn).toContainText('+ Add Quote');
    await floatBtn.click();
    await page.waitForTimeout(200);

    // Verify chip shows 2 quotes queued
    await expect(contextContent).toContainText('2 quotes queued');

    // 3. Highlight Quote 3
    await selectTextInElement(page, '#gemini-response-p3');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await expect(floatBtn).toContainText('+ Add Quote (2)');
    await floatBtn.click();
    await page.waitForTimeout(200);

    // Verify chip shows 3 quotes queued
    await expect(contextContent).toContainText('3 quotes queued');

    // 4. Test Scroll-to-Quote: clicking context box chip triggers scroll & highlight blink on latest quote
    const draftContentBtn = page.locator('.ask-gemini-draft-content');
    await draftContentBtn.click();
    await page.waitForTimeout(200);

    // Target text inside p3 must be wrapped with the animation class .ag-text-highlight-blink
    const highlightSpan = page.locator('.ag-text-highlight-blink');
    await expect(highlightSpan).toBeAttached();
    await expect(highlightSpan).toContainText('Quote Reply lets you highlight any specific passage');

    // 5. Test Context Removal: click close button on context chip
    const closeBtn = page.locator('.ask-gemini-draft-close');
    await closeBtn.click();
    await page.waitForTimeout(200);
    await expect(contextBox).not.toBeVisible();

    // Highlight again to verify queue was reset: button should say "Ask Gemini", not "+ Add Quote"
    await selectTextInElement(page, '#gemini-response-p1');
    await expect(floatBtn).toBeVisible();
    await expect(floatBtn).toContainText('Ask Gemini');

    // 6. Test Multi-Quote Display Formats: Compact vs Expanded
    // Test Compact mode
    await page.evaluate(() => {
      window.AskGemini.multiQuoteDisplay = 'compact';
      const container = document.querySelector('.content-container');
      if (!container) return;

      const userQuery = document.createElement('user-query');
      userQuery.className = 'user-query-container';
      userQuery.innerHTML = `
        <div class="user-query-bubble-with-background">
          <p class="query-text">I'm replying to these excerpts:
1. "First excerpt from response"
2. "Second excerpt from response"

How are these connected?</p>
        </div>
      `;
      container.appendChild(userQuery);
      window.AskGemini.transformMessages();
    });
    await page.waitForTimeout(300);

    // In compact mode, preview text shows "2 quoted excerpts"
    const compactProxy = page.locator('.ask-gemini-transformed-proxy').last();
    await expect(compactProxy).toBeVisible();
    await expect(compactProxy.locator('.ask-gemini-reply-text')).toContainText('2 quoted excerpts');

    // Test Expanded mode
    await page.evaluate(() => {
      window.AskGemini.multiQuoteDisplay = 'expanded';
      const container = document.querySelector('.content-container');
      if (!container) return;

      const userQuery2 = document.createElement('user-query');
      userQuery2.className = 'user-query-container';
      userQuery2.innerHTML = `
        <div class="user-query-bubble-with-background">
          <p class="query-text">I'm replying to these excerpts:
1. "First excerpt in expanded test"
2. "Second excerpt in expanded test"

Give me a comparative breakdown.</p>
        </div>
      `;
      container.appendChild(userQuery2);
      window.AskGemini.transformMessages();
    });
    await page.waitForTimeout(300);

    // In expanded mode, multiple individual reply previews are rendered
    const expandedProxy = page.locator('.ask-gemini-transformed-proxy').last();
    await expect(expandedProxy).toBeVisible();
    const previews = expandedProxy.locator('.ask-gemini-reply-preview');
    expect(await previews.count()).toBe(2);
    await expect(previews.nth(0)).toContainText('First excerpt in expanded test');
    await expect(previews.nth(1)).toContainText('Second excerpt in expanded test');
  });
});
