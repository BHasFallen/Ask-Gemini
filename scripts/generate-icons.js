import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4C84FF"/>
      <stop offset="1" stop-color="#2253EA"/>
    </linearGradient>
    <linearGradient id="st" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#DDE8FF"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="1" y="1" width="126" height="126" rx="27" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"/>
  <path d="M64 25C64 50 78 64 103 64C78 64 64 78 64 103C64 78 50 64 25 64C50 64 64 50 64 25Z" fill="url(#st)"/>
</svg>`;

async function generate() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1
  });

  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1024px; height: 1024px; background: transparent; overflow: hidden; }
  svg { display: block; width: 1024px; height: 1024px; }
</style>
</head>
<body>
${SVG_CONTENT}
</body>
</html>`);

  const masterPngBuffer = await page.screenshot({ omitBackground: true, type: 'png' });
  const masterBase64 = masterPngBuffer.toString('base64');

  const sizes = [16, 32, 48, 128];
  const targetDirs = [
    path.join(rootDir, 'icons'),
    path.join(rootDir, 'docs', 'icons')
  ];

  for (const dir of targetDirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'icon.svg'), SVG_CONTENT);
  }

  const canvasPage = await browser.newPage();
  await canvasPage.setContent('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>');

  for (const size of sizes) {
    const pngBase64 = await canvasPage.evaluate(async ({ srcBase64, targetSize }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + srcBase64;
      await new Promise(r => img.onload = r);

      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetSize, targetSize);

      // Premultiply / clamp tiny alpha fringes in the outermost corner pixels if any
      const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 5) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      return canvas.toDataURL('image/png').split(',')[1];
    }, { srcBase64: masterBase64, targetSize: size });

    const pngBuffer = Buffer.from(pngBase64, 'base64');
    for (const dir of targetDirs) {
      const outPath = path.join(dir, `icon${size}.png`);
      fs.writeFileSync(outPath, pngBuffer);
      console.log(`Generated: ${outPath} (${size}x${size}, ${pngBuffer.length} bytes)`);
    }
  }

  await browser.close();
  console.log('✅ All icons generated with pristine antialiasing.');
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
