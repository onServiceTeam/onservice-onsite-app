// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { get } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

const adminRoot = fileURLToPath(new URL('../..', import.meta.url));

function request(url: URL): Promise<{ status: number; type: string; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const call = get(url, response => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        type: response.headers['content-type'] ?? '',
        bytes: Buffer.concat(chunks),
      }));
    });
    call.setTimeout(10_000, () => call.destroy(new Error('Preview request timed out')));
    call.on('error', reject);
  });
}

// The admin's own house favicon set (Ken, 2026-10-14; UX-1399 checks the
// pictures). Until then the admin borrowed ../mobile/assets/icon.png, the old
// slate "oS" launcher icon. Each link must reach the browser as a hashed file
// under assets/: the tester release check (scripts/server/paired-web-release.mjs,
// validateCandidateFiles) rejects any other admin file name except index.html
// and build-audit.json, and a new hashed name is what gets past the long
// browser cache when the art changes.
const ICONS = [
  { selector: 'link[rel="icon"][type="image/svg+xml"]', source: 'favicon.svg', type: 'image/svg+xml', name: /^\/assets\/favicon-[A-Za-z0-9_-]{8,}\.svg$/ },
  { selector: 'link[rel="icon"]:not([type])', source: 'favicon.ico', type: 'image/x-icon', name: /^\/assets\/favicon-[A-Za-z0-9_-]{8,}\.ico$/ },
  { selector: 'link[rel="apple-touch-icon"]', source: 'apple-touch-icon.png', type: 'image/png', name: /^\/assets\/apple-touch-icon-[A-Za-z0-9_-]{8,}\.png$/ },
];
// The admin rule from validateCandidateFiles in paired-web-release.mjs.
const RELEASE_ADMIN_MUTABLE = ['build-audit.json', 'index.html'];
const RELEASE_ADMIN_HASHED_ASSET = /^assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

async function builtFiles(root: string, prefix = ''): Promise<string[]> {
  const names: string[] = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...await builtFiles(root, name));
    else names.push(name);
  }
  return names;
}

it('Bug UX-1374 — the built admin page serves the onService browser icons (the house favicon set) instead of an absent template asset', async () => {
  // Build the actual application and HTML, not an invented template or source
  // string assertion. Vite's real preview server must serve the icon bytes;
  // a SPA fallback returning HTTP 200 with index.html cannot pass.
  const temporary = await fs.mkdtemp(path.join(tmpdir(), 'onservice-admin-brand-'));
  let server: PreviewServer | undefined;
  let dom: JSDOM | undefined;
  try {
    vi.stubEnv('NODE_ENV', 'production');
    await build({
      root: adminRoot,
      configFile: path.join(adminRoot, 'vite.config.ts'),
      envFile: false,
      mode: 'production',
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify('https://admin.onservice.ph'),
        'import.meta.env.VITE_DEMO_MODE': JSON.stringify('0'),
        'import.meta.env.VITE_DEMO_ADMIN_EMAIL': JSON.stringify(''),
        'import.meta.env.VITE_DEMO_ADMIN_PASSWORD': JSON.stringify(''),
      },
      build: { outDir: temporary, emptyOutDir: false },
      logLevel: 'silent',
    });
    server = await preview({
      root: adminRoot,
      configFile: false,
      envFile: false,
      build: { outDir: temporary },
      preview: { host: '127.0.0.1', port: 0, open: false },
      logLevel: 'silent',
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Preview did not bind an isolated TCP port');
    const base = new URL(`http://127.0.0.1:${address.port}/`);
    const page = await request(base);
    expect(page.status).toBe(200);
    expect(page.type).toContain('text/html');
    dom = new JSDOM(page.bytes.toString('utf8'));
    const parsed = dom.window.document;
    expect(parsed.title).toBe('onService Admin');
    expect(parsed.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')).toHaveLength(ICONS.length);
    for (const icon of ICONS) {
      const links = parsed.querySelectorAll(icon.selector);
      expect(links).toHaveLength(1);
      const href = links[0]?.getAttribute('href');
      if (!href) throw new Error(`Built admin page has no ${icon.source} link`);
      // Vite must link a file, never inline the icon as a data: URI.
      expect(href.startsWith('data:')).toBe(false);
      const iconUrl = new URL(href, base);
      expect(iconUrl.origin).toBe(base.origin);
      expect(iconUrl.pathname).toMatch(icon.name);
      const served = await request(iconUrl);
      const canonical = await fs.readFile(path.join(adminRoot, 'src/assets/brand', icon.source));
      expect(served.status).toBe(200);
      expect(served.type).toContain(icon.type);
      expect(served.bytes.equals(canonical)).toBe(true);
    }
    // Every file the build wrote passes the release check's admin name rule.
    const unreleasable = (await builtFiles(temporary))
      .filter((name) => !RELEASE_ADMIN_MUTABLE.includes(name) && !RELEASE_ADMIN_HASHED_ASSET.test(name));
    expect(unreleasable).toEqual([]);
  } finally {
    vi.unstubAllEnvs();
    dom?.window.close();
    if (server) await server.close();
    // Only this exact, freshly created fixture directory may be removed.
    expect(await fs.realpath(temporary)).toBe(temporary);
    expect(path.dirname(temporary)).toBe(await fs.realpath(tmpdir()));
    expect(path.basename(temporary)).toMatch(/^onservice-admin-brand-/);
    await fs.rm(temporary, { recursive: true, force: true });
  }
}, 120_000);
