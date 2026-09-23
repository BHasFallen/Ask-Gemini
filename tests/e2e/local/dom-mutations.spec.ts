import { test, expect } from '../fixtures.js';
import { setupMockGeminiPage } from '../helpers.js';

test.describe('DOM Mutation Resilience Suite', () => {
  test('handles rapid streaming token additions without crashing or creating duplicate buttons', async ({ page }) => {
    await setupMockGeminiPage(page);

    const initialBookmarkBtns = await page.locator('.ag-bookmark-btn').count();
    expect(initialBookmarkBtns).toBeGreaterThan(0);

    // 1. Simulate rapid token streaming into the active model response (50 rapid updates)
    await page.evaluate(() => {
      const responseEl = document.querySelector('model-response .message-content');
      if (!responseEl) throw new Error('Response container missing');

      for (let i = 0; i < 50; i++) {
        const span = document.createElement('span');
        span.textContent = ` streaming-chunk-${i}`;
        responseEl.appendChild(span);
      }
    });

    await page.waitForTimeout(400);

    // 2. Verify bookmark buttons count has NOT duplicated on the same response
    const updatedBookmarkBtns = await page.locator('.ag-bookmark-btn').count();
    expect(updatedBookmarkBtns).toBe(initialBookmarkBtns);

    // 3. Simulate new assistant message container appended dynamically (e.g. follow-up response)
    await page.evaluate(() => {
      const container = document.querySelector('.content-container');
      if (!container) return;

      const newResponse = document.createElement('model-response');
      newResponse.className = 'model-response';
      newResponse.innerHTML = `
        <div class="message-content">
          <p>Here is a dynamically appended follow-up response from Gemini.</p>
        </div>
        <div class="response-container-footer response-actions">
          <button class="action-btn">👍</button>
        </div>
      `;
      container.appendChild(newResponse);
    });

    await page.waitForTimeout(600);

    // 4. Assert new response gets its bookmark button attached cleanly
    const afterAppendCount = await page.locator('.ag-bookmark-btn').count();
    expect(afterAppendCount).toBe(initialBookmarkBtns + 1);
  });
});
