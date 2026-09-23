import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const userDataDir = path.resolve(__dirname, '../.test-user-data');
const lockFile = path.join(userDataDir, 'lockfile');

if (process.platform === 'win32') {
  try {
    execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'chrome.exe\'\\" | Where-Object { $_.CommandLine -like \'*\\.test-user-data*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

if (fs.existsSync(lockFile)) {
  try {
    fs.unlinkSync(lockFile);
  } catch (_) {}
}
