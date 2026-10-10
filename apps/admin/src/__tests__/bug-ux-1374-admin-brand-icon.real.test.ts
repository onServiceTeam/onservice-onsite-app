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

it('Bug UX-1374 — the built admin page serves the shared onService browser icon instead of an absent template asset', async () => {
  // Build the actual application and HTML, not an invented template or source
  // string assertion. Vite's real preview server must serve the PNG bytes;
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
    const icon = parsed.querySelector('link[rel~="icon"]');
    const href = icon?.getAttribute('href');
    if (!href) throw new Error('Built admin page has no browser icon');
    const iconUrl = new URL(href, base);
    expect(iconUrl.origin).toBe(base.origin);
    const served = await request(iconUrl);
    const canonical = await fs.readFile(path.resolve(adminRoot, '../mobile/assets/icon.png'));
    expect(served.status).toBe(200);
    expect(served.type).toContain('image/png');
    expect(served.bytes.equals(canonical)).toBe(true);
    expect(served.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(icon?.getAttribute('type')).toBe('image/png');
    expect(iconUrl.pathname).toMatch(/^\/assets\/icon-[A-Za-z0-9_-]{8,}\.png$/);
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
