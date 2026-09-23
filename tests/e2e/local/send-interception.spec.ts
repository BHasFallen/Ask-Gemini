import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage, selectTextInElement } from '../helpers.js';

test.describe('Send & Enter Key Interception Suite', () => {
  test('intercepts Enter key and Send button when context quotes are queued, composes prompt, and transforms message bubbles', async ({ page }) => {
    await setupMockGeminiPage(page);

    const floatBtn = page.locator('#ask-gemini-float-btn');
    const contextBox = page.locator('#ask-gemini-context-box');
    const editor = page.locator('.ql-editor');
    const sendBtn = page.locator('button[aria-label*="Send message"]');

    // ─── Test 1: Enter Key Interception ───
    // 1. Queue a quote
    await selectTextInElement(page, '#gemini-response-p1');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await floatBtn.click();
    await expect(contextBox).toBeVisible();

    // 2. Type user prompt into editor
    await editor.click();
    await editor.fill('Can you elaborate on how service workers differ from web workers?');

    // 3. Press Enter key inside editor
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // 4. Assert context box was cleared upon submission
    await expect(contextBox).not.toBeVisible();

    // Context in AskGemini state must be cleared
    const contextCountAfterEnter = await page.evaluate(() => {
      return window.AskGemini?.currentContexts?.length || 0;
    });
    expect(contextCountAfterEnter).toBe(0);

    // ─── Test 2: Send Button Click Interception ───
    // 1. Queue another quote
    await selectTextInElement(page, '#gemini-response-p2');
    await expect(floatBtn).toBeVisible({ timeout: 5000 });
    await floatBtn.click();
    await expect(contextBox).toBeVisible();

    // 2. Type follow-up text into editor
    await editor.click();
    await editor.fill('What specific metrics show this memory optimization?');

    // 3. Click Gemini Send button
    await sendBtn.click();
    await page.waitForTimeout(400);

    // 4. Assert context box was cleared upon click submit
    await expect(contextBox).not.toBeVisible();
    const contextCountAfterClick = await page.evaluate(() => {
      return window.AskGemini?.currentContexts?.length || 0;
    });
    expect(contextCountAfterClick).toBe(0);

    // ─── Test 3: Message Bubble Transformation ───
    // When Gemini renders a user prompt bubble containing the technical prefix "I'm replying to this:",
    // Ask Gemini must transform it into .ask-gemini-transformed-proxy with interactive quote preview
    await page.evaluate(() => {
      const container = document.querySelector('.content-container');
      if (!container) return;

      const userBubble = document.createElement('user-query');
      userBubble.className = 'user-query-container';
      userBubble.innerHTML = `
        <div class="user-query-bubble-with-background">
          <p class="query-text">I'm replying to this:
"Manifest V3 extensions use event-driven background service workers instead of persistent background pages."

Can you elaborate on how service workers differ from web workers?</p>
        </div>
      `;
      container.appendChild(userBubble);

      // Trigger mutation-driven message transformation
      window.AskGemini.transformMessages();
    });
    await page.waitForTimeout(300);

    const transformedProxy = page.locator('.ask-gemini-transformed-proxy').last();
    await expect(transformedProxy).toBeVisible();

    // Verify quote preview contains clean excerpt
    const replyPreview = transformedProxy.locator('.ask-gemini-reply-preview');
    await expect(replyPreview).toBeVisible();
    await expect(replyPreview).toContainText('Manifest V3 extensions use event-driven background service workers');

    // Verify user message text is cleanly parsed without the raw prefix
    const messageBubble = transformedProxy.locator('.ask-gemini-message-bubble');
    await expect(messageBubble).toBeVisible();
    await expect(messageBubble).toContainText('Can you elaborate on how service workers differ from web workers?');
    await expect(messageBubble).not.toContainText("I'm replying to this:");

    // Verify clicking the reply preview triggers scroll-to-highlight
    await replyPreview.click();
    await page.waitForTimeout(200);
    const highlightBlink = page.locator('.ag-text-highlight-blink');
    await expect(highlightBlink).toBeAttached();
  });
});
