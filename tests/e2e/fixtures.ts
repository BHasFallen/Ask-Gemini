import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const pathToExtension = path.resolve(__dirname, '../../dist');
export const persistentUserDataDir = path.resolve(__dirname, '../../.test-user-data');

// Create test extension fixture
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  page: Page;
}>({
  context: async ({}, use, testInfo) => {
    // Ensure dist directory exists
    if (!fs.existsSync(pathToExtension)) {
      throw new Error(`Extension dist directory not found at: ${pathToExtension}. Run 'npm run build' first.`);
    }

    const isLive = testInfo.file.includes('live');
    const userDataDir = isLive
      ? persistentUserDataDir
      : path.resolve(__dirname, `../../.test-user-data-local-${testInfo.testId}`);

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    let context: BrowserContext | null = null;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (isLive) {
          const lockFile = path.join(userDataDir, 'lockfile');
          if (fs.existsSync(lockFile)) {
            try { fs.unlinkSync(lockFile); } catch (_) {}
          }
        }

        context = await chromium.launchPersistentContext(userDataDir, {
          headless: false, // Chrome extensions in MV3 require headed execution
          ignoreDefaultArgs: ['--enable-automation'],
          args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-gpu',
            '--window-size=1280,800',
          ],
        });
        break;
      } catch (err: any) {
        const isLockError =
          err.message?.includes('ProcessSingleton') ||
          err.message?.includes('lock') ||
          err.message?.includes('0x20') ||
          err.message?.includes('exitCode=21');
        if (isLockError && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }

    if (!context) {
      throw new Error(`Failed to launch browser context after ${maxAttempts} attempts.`);
    }

    await use(context);
    await context.close();

    // On Windows, give Chromium process a moment to flush buffers and release file locks
    if (isLive) {
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (!isLive && fs.existsSync(userDataDir)) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (_) {}
    }
  },

  extensionId: async ({ context }, use) => {
    // Locate service worker to determine extension ID dynamically
    let [background] = context.serviceWorkers();
    if (!background) {
      try {
        background = await context.waitForEvent('serviceworker', { timeout: 10000 });
      } catch (e) {
        // Fallback: check all background targets
        const sw = context.serviceWorkers()[0];
        if (sw) background = sw;
      }
    }

    if (!background) {
      throw new Error('Failed to find extension service worker after launch');
    }

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] || await context.newPage();
    await use(page);
  },
});

export const expect = test.expect;
