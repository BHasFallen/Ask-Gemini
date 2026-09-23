import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mockHtmlPath = path.resolve(__dirname, '../fixtures/mock-gemini.html');

/**
 * Routes `https://gemini.google.com/**` to the local high-fidelity mock HTML
 * allowing Chrome to inject extension content scripts under the official Gemini origin.
 */
export async function setupMockGeminiPage(page: Page): Promise<void> {
  const mockHtml = fs.readFileSync(mockHtmlPath, 'utf8');

  await page.route('https://gemini.google.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: mockHtml,
    });
  });

  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  // Brief pause for content script mutation observers and storage checks to bind
  await page.waitForTimeout(600);
}

/**
 * Simulates user highlighting text inside a specified element and firing selection events.
 */
export async function selectTextInElement(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  }, selector);
}

/**
 * Simulates appending a new user-prompt and model-response conversational turn to the mock DOM.
 */
export async function appendConversationTurn(
  page: Page,
  promptText: string,
  replyText: string,
  replyId?: string
): Promise<void> {
  await page.evaluate(
    ({ prompt, reply, id }) => {
      const container = document.querySelector('.content-container');
      if (!container) throw new Error('.content-container not found in mock DOM');

      // 1. User query
      const userQuery = document.createElement('user-query');
      userQuery.className = 'user-query-container';
      userQuery.innerHTML = `<p class="query-text">${prompt}</p>`;
      container.appendChild(userQuery);

      // 2. Assistant response
      const modelResponse = document.createElement('model-response');
      modelResponse.className = 'model-response';
      modelResponse.innerHTML = `
        <div class="message-content">
          <p ${id ? `id="${id}"` : ''}>${reply}</p>
        </div>
        <div class="response-container-footer response-actions">
          <button class="action-btn" aria-label="Copy response">📋</button>
          <button class="action-btn" aria-label="Good response">👍</button>
        </div>
      `;
      container.appendChild(modelResponse);
    },
    { prompt: promptText, reply: replyText, id: replyId }
  );
  await page.waitForTimeout(400);
}

/**
 * Resets chrome.storage.local using the extension popup page.
 */
export async function clearExtensionStorage(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
  });
}

/**
 * Sets values into chrome.storage.local using the extension popup page.
 */
export async function setExtensionStorage(
  page: Page,
  extensionId: string,
  data: Record<string, any>
): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async (storageData) => {
    await chrome.storage.local.set(storageData);
  }, data);
}
