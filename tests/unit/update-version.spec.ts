import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Version Patch Suppression (What\'s New Gating)', () => {
    let isPatchUpdate: (prev: string, curr: string) => boolean;

    beforeEach(() => {
        // Setup mock environment for background script execution
        (globalThis as any).self = globalThis;
        (globalThis as any).chrome = {
            runtime: {
                getManifest: () => ({ version: '2.8.3', update_url: 'https://clients2.google.com/service/update2/crx' }),
                onInstalled: { addListener: () => {} },
                onStartup: { addListener: () => {} },
                onMessage: { addListener: () => {} },
                setUninstallURL: () => {},
                getURL: (path: string) => `chrome-extension://mock-id/${path}`,
            },
            tabs: {
                create: () => Promise.resolve({}),
                onUpdated: { addListener: () => {} },
            },
            alarms: {
                create: () => {},
                clear: () => {},
                onAlarm: { addListener: () => {} },
            },
            storage: {
                local: {
                    get: () => Promise.resolve({}),
                    set: () => Promise.resolve({}),
                    remove: () => Promise.resolve({})
                },
                onChanged: { addListener: () => {} }
            }
        };

        const bgCode = fs.readFileSync(path.resolve(__dirname, '../../background.js'), 'utf8');
        new Function(bgCode)();
        isPatchUpdate = (globalThis as any).isPatchUpdate;
    });

    it('identifies patch bumps (x.x.x) as patch updates', () => {
        // 2.8.1 -> 2.8.2 (patch update)
        expect(isPatchUpdate('2.8.1', '2.8.2')).toBe(true);

        // 2.8.0 -> 2.8.1
        expect(isPatchUpdate('2.8.0', '2.8.1')).toBe(true);

        // 1.0.0 -> 1.0.5
        expect(isPatchUpdate('1.0.0', '1.0.5')).toBe(true);
    });

    it('identifies minor and major version changes as NOT patch updates (so What\'s New will show)', () => {
        // 2.7.5 -> 2.8.0 (minor bump)
        expect(isPatchUpdate('2.7.5', '2.8.0')).toBe(false);

        // 2.7.0 -> 2.8.2 (user was on older minor branch)
        expect(isPatchUpdate('2.7.0', '2.8.2')).toBe(false);

        // 2.8.2 -> 3.0.0 (major bump)
        expect(isPatchUpdate('2.8.2', '3.0.0')).toBe(false);
    });

    it('safely handles missing or malformed version strings', () => {
        expect(isPatchUpdate('', '2.8.2')).toBe(false);
        expect(isPatchUpdate('2.8.1', '')).toBe(false);
        expect(isPatchUpdate(null as any, '2.8.2')).toBe(false);
        expect(isPatchUpdate('2.8.2', undefined as any)).toBe(false);
    });
});
