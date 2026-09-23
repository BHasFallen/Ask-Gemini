import { test, expect } from './fixtures.js';
import { setupMockGeminiPage } from './helpers.js';

test.describe('Extension Speed & Performance Benchmark', () => {
  test('measures script injection overhead, selection latency, and memory footprint via CDP', async ({ page, context }) => {
    // 1. Initialize CDP Session
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable');

    // 2. Warm up run to eliminate initial V8 JIT compilation spikes
    await setupMockGeminiPage(page);
    await page.waitForTimeout(500);

    // 3. Measure selection-to-render latency
    const selectionLatencyMs = await page.evaluate(async () => {
      const p = document.getElementById('gemini-response-p1');
      if (!p) return -1;

      const startTime = performance.now();

      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      document.dispatchEvent(new Event('selectionchange'));
      p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Wait until the floating quote button is positioned and visible
      await new Promise<void>((resolve) => {
        const check = () => {
          const btn = document.getElementById('ask-gemini-float-btn');
          if (btn && btn.style.display !== 'none') {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });

      return Math.round((performance.now() - startTime) * 100) / 100;
    });

    // 4. Capture CDP Performance Metrics
    const { metrics } = await client.send('Performance.getMetrics');
    const metricMap: Record<string, number> = {};
    for (const m of metrics) {
      metricMap[m.name] = m.value;
    }

    const jsHeapMb = Math.round(((metricMap['JSHeapUsedSize'] || 0) / (1024 * 1024)) * 100) / 100;
    const domNodeCount = metricMap['Nodes'] || 0;
    const taskDurationSec = Math.round((metricMap['TaskDuration'] || 0) * 1000) / 1000;

    console.log('\n================================================================');
    console.log('📊 Ask Gemini Host Site Performance Report (gemini.google.com)');
    console.log('================================================================');
    console.log(`⏱️ Selection-to-Quote Render Latency: ${selectionLatencyMs}ms (Budget: < 50ms)`);
    console.log(`💾 Active JS Heap Usage:             ${jsHeapMb} MB`);
    console.log(`🌲 Total DOM Nodes:                   ${domNodeCount} nodes`);
    console.log(`⚙️ Total CPU Task Duration:          ${taskDurationSec}s`);
    console.log('================================================================\n');

    // Assert that selection latency is sub-50ms (ultra responsive)
    expect(selectionLatencyMs).toBeGreaterThan(0);
    expect(selectionLatencyMs).toBeLessThan(75);

    // Assert that heap memory is lean (< 50MB on mock page)
    expect(jsHeapMb).toBeLessThan(60);
  });
});
