import { test, expect } from '../fixtures';

test('compare Students and Bookmarks computed styles', async ({ page }) => {
  await page.goto('https://gemini.google.com', { waitUntil: 'domcontentloaded' });

  // Ensure sidebar is expanded
  const collapsedNav = page.locator('mat-nav-list.top-nav-collapsed');
  const isCollapsed = await collapsedNav.isVisible({ timeout: 3000 }).catch(() => false);
  if (isCollapsed) {
    const expandBtn = page.locator('button[aria-label="Expand menu"], button[aria-label="Main menu"], button[aria-label*="sidebar" i], button[aria-label="Open side navigation"]').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  await page.waitForSelector('mat-nav-list.top-nav-expanded:not(.removed)', { timeout: 25000 });
  await page.waitForSelector('mat-nav-list.top-nav-expanded [data-test-id="learn-side-nav-entry-button"]', { timeout: 25000 });
  await page.waitForSelector('#ag-bookmarks-sidebar-btn', { timeout: 20000 });

  const diff = await page.evaluate(() => {
    const studentsA = document.querySelector('mat-nav-list.top-nav-expanded [data-test-id="learn-side-nav-entry-button"] a') as HTMLElement;
    const bookmarksA = document.querySelector('mat-nav-list.top-nav-expanded #ag-bookmarks-sidebar-btn a') as HTMLElement;

    const studentsIconWrap = studentsA?.querySelector('[matlistitemicon]') as HTMLElement;
    const bookmarksIconWrap = bookmarksA?.querySelector('[matlistitemicon]') as HTMLElement;

    const studentsGemIcon = studentsA?.querySelector('gem-icon') as HTMLElement;
    const bookmarksGemIcon = bookmarksA?.querySelector('gem-icon') as HTMLElement;
    const studentsMatIcon = studentsA?.querySelector('mat-icon') as HTMLElement;
    const bookmarksSvg = bookmarksA?.querySelector('svg') as HTMLElement;

    const studentsText = studentsA?.querySelector('.title-text') as HTMLElement;
    const bookmarksText = bookmarksA?.querySelector('.title-text') as HTMLElement;

    const studentsMeta = studentsA?.querySelector('[matlistitemmeta]') as HTMLElement;
    const bookmarksMeta = bookmarksA?.querySelector('[matlistitemmeta]') as HTMLElement;

    const props = [
      'display', 'flexDirection', 'alignItems', 'justifyContent', 'gap',
      'height', 'minHeight', 'maxHeight',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color',
      'borderRadius', 'backgroundColor', 'cursor'
    ];

    const getProps = (el: HTMLElement | null) => {
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const res: Record<string, string> = {};
      props.forEach(p => { res[p] = (cs as any)[p]; });
      return res;
    };

    const findDiff = (a: any, b: any) => {
      if (!a || !b) return { a, b };
      const d: Record<string, { students: string, bookmarks: string }> = {};
      props.forEach(p => {
        if (a[p] !== b[p]) {
          d[p] = { students: a[p], bookmarks: b[p] };
        }
      });
      return d;
    };

    const getRules = (el: HTMLElement) => {
      const sheets = Array.from(document.styleSheets);
      const matched: string[] = [];
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && el.matches(rule.selectorText)) {
              matched.push(`${rule.selectorText} { ${rule.style.cssText} }`);
            }
          }
        } catch (e) {}
      }
      return matched;
    };

    const getVars = (el: HTMLElement) => {
      const cs = window.getComputedStyle(el);
      const vars: Record<string, string> = {};
      const relevant = [
        '--mat-list-list-item-leading-icon-start-space',
        '--mat-list-list-item-leading-icon-end-space',
        '--mat-list-list-item-trailing-meta-start-space',
        '--mat-list-list-item-trailing-meta-end-space',
        '--mat-list-list-item-one-line-container-height',
        '--gem-sys-spacing--s',
        '--gem-sys-spacing--xs',
        '--nav-item-label-opacity',
        '--nav-item-label-visibility',
        'color',
        'fill',
      ];
      relevant.forEach(v => {
        vars[v] = cs.getPropertyValue(v);
      });
      return vars;
    };

    const host = studentsA.parentElement as HTMLElement;
    const getMoreRules = (el: HTMLElement) => {
      // Find all rules across sheets that set margin or padding or gap or height
      const sheets = Array.from(document.styleSheets);
      const matched: string[] = [];
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && (el.matches(rule.selectorText) || (rule.selectorText.includes('leading-icon') && el.querySelector(rule.selectorText)))) {
              matched.push(`${rule.selectorText} { ${rule.style.cssText} }`);
            }
          }
        } catch (e) {}
      }
      return matched;
    };

    return {
      hostRules: host ? getRules(host) : [],
      hostComputed: host ? { height: getComputedStyle(host).height, display: getComputedStyle(host).display } : null,
      studentsVars: getVars(studentsA),
      bookmarksVars: getVars(bookmarksA),
      linkDiff: findDiff(getProps(studentsA), getProps(bookmarksA)),
      iconWrapDiff: findDiff(getProps(studentsIconWrap), getProps(bookmarksIconWrap)),
      gemIconDiff: findDiff(getProps(studentsGemIcon), getProps(bookmarksGemIcon)),
      matIconVsSvgDiff: findDiff(getProps(studentsMatIcon), getProps(bookmarksSvg)),
      textDiff: findDiff(getProps(studentsText), getProps(bookmarksText)),
      metaDiff: findDiff(getProps(studentsMeta), getProps(bookmarksMeta)),
      studentsGemIconProps: getProps(studentsGemIcon),
      studentsMatIconProps: getProps(studentsMatIcon),
      bookmarksGemIconProps: getProps(bookmarksGemIcon),
      bookmarksSvgProps: getProps(bookmarksSvg),
    };
  });

  const studentsLoc = page.locator('mat-nav-list.top-nav-expanded [data-test-id="learn-side-nav-entry-button"] a');
  await studentsLoc.hover();
  const studentsHover = await studentsLoc.evaluate(el => {
    const cs = window.getComputedStyle(el);
    const before = window.getComputedStyle(el, '::before');
    const after = window.getComputedStyle(el, '::after');
    const focusInd = el.querySelector('.mat-focus-indicator') ? window.getComputedStyle(el.querySelector('.mat-focus-indicator')!) : null;
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      beforeBg: before.backgroundColor,
      afterBg: after.backgroundColor,
      focusIndBg: focusInd?.backgroundColor,
      focusIndOpacity: focusInd?.opacity,
    };
  });

  const bookmarksLoc = page.locator('mat-nav-list.top-nav-expanded #ag-bookmarks-sidebar-btn a');
  await bookmarksLoc.hover();
  const bookmarksHover = await bookmarksLoc.evaluate(el => {
    const cs = window.getComputedStyle(el);
    const before = window.getComputedStyle(el, '::before');
    const after = window.getComputedStyle(el, '::after');
    const focusInd = el.querySelector('.mat-focus-indicator') ? window.getComputedStyle(el.querySelector('.mat-focus-indicator')!) : null;
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      beforeBg: before.backgroundColor,
      afterBg: after.backgroundColor,
      focusIndBg: focusInd?.backgroundColor,
      focusIndOpacity: focusInd?.opacity,
    };
  });

  diff.hover = { students: studentsHover, bookmarks: bookmarksHover };

  console.log('\n=== COMPUTED STYLES COMPARISON ===');
  console.log(JSON.stringify(diff, null, 2));
});
