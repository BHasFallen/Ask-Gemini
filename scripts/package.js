/**
 * Packaging script for Chrome Web Store (CWS)
 * Stages clean extension files into dist/ and creates a production zip archive.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

// 1. Run build script to stage dist/
console.log('📦 Step 1: Building and staging clean dist/ directory...');
execSync('node scripts/build.js', { stdio: 'inherit', cwd: rootDir });

// 2. Read manifest version
const manifestPath = path.join(distDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;
console.log(`\n📦 Step 2: Packaging Quote Reply for Gemini v${version} for Chrome Web Store...`);

// 3. Clean up previous zip archives
const oldZips = fs.readdirSync(rootDir).filter(f => f.endsWith('.zip') && f.startsWith('quote-reply-for-gemini-v'));
for (const oldZip of oldZips) {
    fs.unlinkSync(path.join(rootDir, oldZip));
    console.log(`   Removed old archive: ${oldZip}`);
}

// 4. Create new zip file directly from dist/
const zipName = `quote-reply-for-gemini-v${version}.zip`;
const zipPath = path.join(rootDir, zipName);

const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(distDir, '*')}' -DestinationPath '${zipPath}' -Force"`;
execSync(cmd, { stdio: 'inherit', cwd: rootDir });

if (!fs.existsSync(zipPath)) {
    console.error(`❌ Packaging failed: ${zipPath} not found.`);
    process.exit(1);
}

const stats = fs.statSync(zipPath);
console.log(`\n🎉 Package created successfully: ${zipName}`);
console.log(`   Location: ${zipPath}`);
console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
