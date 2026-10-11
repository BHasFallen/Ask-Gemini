/**
 * Diagnostic & E2E verification: verify Bookmarks nav item appears in the main sidebar,
 * NOT hidden inside the More/overflow drawer, positioned under Students and before More.
 *
 * Run with: npx playwright test tests/e2e/live/bookmarks-sidebar-check.spec.ts
 */
import { test, expect } from '../fixtures';

test.describe('Bookmarks sidebar placement', () => {
  test('bookmarks button is visible in main nav, not inside the More drawer', async ({ page }) => {
    // Navigate to Gemini
    await page.goto('https://gemini.google.com', { waitUntil: 'domcontentloaded' });

    // Wait for the expanded nav items to be present
    await page.waitForSelector('mat-nav-list.top-nav-expanded', { timeout: 25000 });
    await page.waitForSelector('[data-test-id="overflow-side-nav-entry-button"]', { timeout: 25000 });

    // Wait for Bookmarks button to be injected by Ask Gemini extension
    const bookmarksBtn = await page.waitForSelector('#ag-bookmarks-sidebar-btn', { timeout: 15000 });
    expect(bookmarksBtn).not.toBeNull();

    // ── 1. Capture a screenshot showing the full sidebar state ──────────────
    await page.screenshot({ path: 'test-results/bookmarks-sidebar-live.png', fullPage: false });

    // ── 2. Check position in expandedNav: Bookmarks should come AFTER Students, BEFORE More ─
    const orderedItems = await page.$$eval(
      'mat-nav-list.top-nav-expanded > *',
      (els) => els.map(el => {
        const navItem = el.tagName === 'GEM-NAV-LIST-ITEM' ? el : el.querySelector('gem-nav-list-item');
        return {
          tag: el.tagName,
          id: el.id || navItem?.id || '',
          testId: el.getAttribute('data-test-id') || navItem?.getAttribute('data-test-id') || '',
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        };
      })
    );

    console.log('\n=== ORDERED EXPANDED NAV ITEMS ===');
    orderedItems.forEach((item, i) => console.log(`  [${i}] <${item.tag}> id="${item.id}" testId="${item.testId}" text="${item.text}"`));

    const studentsIdx  = orderedItems.findIndex(i => i.testId === 'learn-side-nav-entry-button');
    const bookmarksIdx = orderedItems.findIndex(i => i.id === 'ag-bookmarks-sidebar-btn' || i.testId.includes('bookmarks'));
    const moreIdx      = orderedItems.findIndex(i => i.testId === 'overflow-side-nav-entry-button');

    console.log(`\n  Students index: ${studentsIdx}`);
    console.log(`  Bookmarks index: ${bookmarksIdx}`);
    console.log(`  More index: ${moreIdx}`);

    // Assert: Students is before Bookmarks, and Bookmarks is before More
    expect(studentsIdx).toBeGreaterThanOrEqual(0);
    expect(bookmarksIdx).toBeGreaterThan(studentsIdx);
    expect(moreIdx).toBeGreaterThan(bookmarksIdx);

    // ── 3. Click the Bookmarks button and verify overlay opens ──────────────
    await page.click('#ag-bookmarks-sidebar-btn');
    await page.waitForSelector('#ag-bookmarks-overlay', { state: 'visible', timeout: 5000 });

    await page.screenshot({ path: 'test-results/bookmarks-overlay-opened.png', fullPage: false });
  });
});
