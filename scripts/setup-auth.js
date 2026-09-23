/**
 * One-time interactive Google Authentication helper for Tier 2 Live E2E tests.
 * Launches Chromium pointing to `./.test-user-data/`.
 * Log into your Google account once, press Enter in the terminal, and your session
 * cookies will be preserved for all subsequent live E2E tests.
 */

import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const userDataDir = path.resolve(__dirname, '../.test-user-data');
const pathToExtension = path.resolve(__dirname, '../dist');

async function setupAuth() {
    console.log('🚀 Launching Chromium browser with persistent test profile:');
    console.log(`📁 User Data Dir: ${userDataDir}\n`);

    let context;
    try {
        // Try launching system Google Chrome first (avoids Google anti-bot login block)
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
            ]
        });
    } catch (e) {
        // Fallback to bundled chromium with stealth flags
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
            ]
        });
    }

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://gemini.google.com/app');

    console.log('================================================================');
    console.log('👉 Please log into Google manually in the open Chromium window.');
    console.log('👉 Once logged in and viewing Gemini chat, press [Enter] here.');
    console.log('================================================================\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Press [Enter] after successful login to save session and exit: ', async () => {
        rl.close();
        console.log('\n💾 Saving session cookies and closing browser...');
        await context.close();
        console.log('✅ Auth setup complete! You can now run `npm run test:e2e:live` without login barriers.');
        process.exit(0);
    });
}

setupAuth().catch(err => {
    console.error('❌ Failed to run auth setup:', err);
    process.exit(1);
});
