/**
 * Staging build script for Quote Reply for Gemini (Manifest V3)
 * Packages extension source files into a clean `dist/` directory for Playwright and distribution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

const startTime = Date.now();

// 1. Clean dist directory
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Production file manifest
const filesToCopy = [
    'manifest.json',
    'background.js',
    'content.js',
    'debug-bridge.js',
    'quote-reply.js',
    'smart-paste.js',
    'paste-stats.js',
    'rating-banner.js',
    'toc.js',
    'tour.js',
    'bookmarks.js',
    'auto-mode.js',
    'popup.html',
    'popup.js',
    'onboarding.html',
    'onboarding.js',
    'onboarding.css',
    'styles.css',
    'tour.css'
];

let totalBytes = 0;
let fileCount = 0;

for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        totalBytes += fs.statSync(dest).size;
        fileCount++;
    } else {
        console.warn(`⚠️ Warning: Expected extension file missing: ${file}`);
    }
}

// 3. Copy icons directory
const srcIcons = path.join(rootDir, 'icons');
const destIcons = path.join(distDir, 'icons');
if (fs.existsSync(srcIcons)) {
    fs.mkdirSync(destIcons, { recursive: true });
    const iconFiles = fs.readdirSync(srcIcons);
    for (const icon of iconFiles) {
        const srcIcon = path.join(srcIcons, icon);
        const destIcon = path.join(destIcons, icon);
        if (fs.statSync(srcIcon).isFile()) {
            fs.copyFileSync(srcIcon, destIcon);
            totalBytes += fs.statSync(destIcon).size;
            fileCount++;
        }
    }
}

// 4. Ensure manifest.json version is 2.8.0
const manifestPath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '2.8.0';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const duration = Date.now() - startTime;
console.log(`✅ Extension staged in dist/ (${fileCount} files, ${(totalBytes / 1024).toFixed(1)} KB) in ${duration}ms`);
