// Bug UX-1429: testers who had already opened app.onservice.ph would keep the
// old slate "oS" browser-tab icon after the house logo shipped. The Expo web
// build linked the icon at a fixed address (<link rel="icon"
// href="/favicon.ico">), and the web server sends .ico files with "expires
// 1y" and "Cache-Control: public, immutable" (nginx/nginx.conf, app vhost), so
// a browser that has the old file never asks for it again. Changing the
// file's contents does not help while the address stays the same.
//
// Now public/index.html (Expo's page template) links the icon as
// /favicon.ico?v=<first 8 hex digits of the SHA-256 of public/favicon.ico>.
// A new icon means a new version, so a new address that no browser has
// cached. index.html itself is served "no-cache", so browsers pick up the new
// link on the next visit. No change to the web server or the release scripts.
//
// The test builds the page head with the same two Expo CLI functions that
// `expo export --platform web` uses (the page template, then the favicon
// step), so it checks what the export writes, not only the template file.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';

const MOBILE_ROOT = path.resolve(__dirname, '..');

function loadWebConfig(): ExpoConfig {
  const names = ['NODE_ENV', 'EXPO_OS', 'EAS_PROJECT_ID', 'ONSERVICE_ANDROID_STANDALONE'] as const;
  const saved = names.map((name) => [name, process.env[name]] as const);
  try {
    for (const name of names) delete process.env[name];
    process.env.NODE_ENV = 'production';
    process.env.EXPO_OS = 'web';
    let config: ExpoConfig | undefined;
    jest.isolateModules(() => {
      config = (jest.requireActual('../app.config') as { default: ExpoConfig }).default;
    });
    if (!config) throw new Error('app.config.ts did not export a config');
    return config;
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function iconHrefs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('head link[rel~="icon"]')).map((link) => link.getAttribute('href') ?? '');
}

it('Bug UX-1429 — the web build links the tab icon once, at a versioned address that changes with the icon file', async () => {
  const icon = readFileSync(path.join(MOBILE_ROOT, 'public', 'favicon.ico'));
  const version = createHash('sha256').update(icon).digest('hex').slice(0, 8);
  const expectedHref = `/favicon.ico?v=${version}`;

  // The template itself.
  const template = readFileSync(path.join(MOBILE_ROOT, 'public', 'index.html'), 'utf8');
  expect(iconHrefs(template)).toEqual([expectedHref]);

  // No web.favicon setting, so Expo has nothing of its own to generate.
  const exp = loadWebConfig();
  expect(exp.web?.favicon).toBeUndefined();

  // What `expo export --platform web` writes: the template filled in, then
  // the favicon step, which must add no second, unversioned link (browsers
  // use the last icon link in the page).
  const { createTemplateHtmlFromExpoConfigAsync } = jest.requireActual(
    '@expo/cli/build/src/start/server/webTemplate',
  ) as { createTemplateHtmlFromExpoConfigAsync: (root: string, options: object) => Promise<string> };
  const { getVirtualFaviconAssetsAsync } = jest.requireActual('@expo/cli/build/src/export/favicon') as {
    getVirtualFaviconAssetsAsync: (root: string, options: object) => Promise<((html: string) => string) | null>;
  };
  let html = await createTemplateHtmlFromExpoConfigAsync(MOBILE_ROOT, { scripts: [], cssLinks: [], exp });
  const files = new Map<string, unknown>();
  const addFaviconLink = await getVirtualFaviconAssetsAsync(MOBILE_ROOT, {
    outputDir: path.join(MOBILE_ROOT, 'dist-web'),
    baseUrl: '',
    files,
    exp,
  });
  if (addFaviconLink) html = addFaviconLink(html);

  expect(iconHrefs(html)).toEqual([expectedHref]);
  expect(html).not.toContain('href="/favicon.ico"');
  expect(files.size).toBe(0); // Expo generated no favicon.ico of its own.
  expect(html).toContain('<title>onService</title>');
});
