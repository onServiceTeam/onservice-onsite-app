// Compiled date-label verification with synthetic HTTP and device timezones.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const bundle = await realpath(process.argv[2]), output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const index = await readFile(path.join(bundle, 'index.html'));
const entry = index.toString().match(/src="([^"]+\.js)"/)?.[1];
assert(entry);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let target = path.resolve(bundle, `.${p}`);
    if (target !== bundle && !target.startsWith(`${bundle}${path.sep}`)) throw new Error('Outside bundle');
    if (!path.extname(p)) target = path.join(bundle, 'index.html');
    const bytes = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(bytes);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const records = [];
let browser;
async function flow(width, timezone) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: timezone });
  const record = { width, timezone, passed: false, requests: [], unexpected: [], pageErrors: [], captures: [] };
  await context.addInitScript(() => {
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'provider',
      phone: '+639170000001', firstName: 'Synthetic', lastName: 'Provider', email: null, avatarUrl: null }));
    localStorage.setItem('onservice-auth-secure:accessToken', 'synthetic-access');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'synthetic-refresh');
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname, method = request.method();
    if (!p.startsWith('/api/v1/')) {
      if (url.origin === base) return route.continue();
      record.unexpected.push(`${method} ${url.origin}${p}`); return route.abort();
    }
    record.requests.push(`${method} ${p}`);
    let data = {};
    if (p === '/api/v1/config' && method === 'GET') data = {};
    else if (p === '/api/v1/providers/me/availability/status' && method === 'GET') data = { isAvailable: false };
    else if (p === '/api/v1/providers/me/availability/overrides' && method === 'GET') data = [
      { id: 'month-boundary', overrideDate: '2099-08-31', isAvailable: false, startTime: null, endTime: null, reason: 'Synthetic month-boundary block' },
      { id: 'leap-day', overrideDate: '2104-02-29', isAvailable: false, startTime: null, endTime: null, reason: 'Synthetic leap-day block' },
    ];
    else { record.unexpected.push(`${method} ${p}`); return route.abort(); }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  const page = await context.newPage(); page.on('pageerror', error => record.pageErrors.push(error.message));
  const prefix = `${width}-${timezone.replaceAll('/', '-')}`;
  try {
    await page.goto(`${base}/provider/availability`);
    record.runtimeTimezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.equal(record.runtimeTimezone, timezone);
    for (const [name, expected] of [['month-boundary', 'Mon, Aug 31, 2099'], ['leap-day', 'Fri, Feb 29, 2104']]) {
      const label = page.getByText(expected, { exact: true });
      await expect(label).toBeVisible(); await label.scrollIntoViewIfNeeded(); await expect(label).toBeInViewport();
      await page.evaluate(async () => { await document.fonts.ready; });
      const layout = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const controls = Array.from(document.querySelectorAll('input,button,[role="button"],[role="switch"]')).map(element => {
          const rect = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') ?? element.textContent, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        }).filter(item => item.width > 0 && item.height > 0);
        return { width, overflow: document.documentElement.scrollWidth - width, controls };
      });
      const screenshot = `${prefix}-${name}.png`;
      record.captures.push({ name, expected, screenshot, ...layout });
      await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled' });
      assert.equal(layout.overflow, 0);
      assert(layout.controls.every(control => control.left >= -1 && control.right <= width + 1));
    }
    await expect(page.getByText('Sun, Aug 30, 2099', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Thu, Feb 28, 2104', { exact: true })).toHaveCount(0);
    assert(record.requests.every(request => request.startsWith('GET ')), 'Date display must not write');
    assert.equal(record.unexpected.length, 0); assert.equal(record.pageErrors.length, 0);
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    await page.screenshot({ path: path.join(output, `${prefix}-failure.png`), animations: 'disabled' });
  } finally { await context.close(); }
  return record;
}
try {
  browser = await chromium.launch();
  outer: for (const timezone of ['Pacific/Auckland', 'Asia/Manila', 'America/Los_Angeles', 'UTC']) for (const width of [320, 768, 1366]) {
    const record = await flow(width, timezone); records.push(record);
    process.stdout.write(`${JSON.stringify({ width, timezone, passed: record.passed, error: record.error })}\n`);
    if (!record.passed) break outer;
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { generatedAt: new Date().toISOString(), sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree',
  scope: 'Compiled read-only date override labels in four real Chromium timezones and three viewport widths with synthetic HTTP. Not PostgreSQL, native, production, all accessibility requirements or full Stitch acceptance.',
  indexSha256: hash(index), entrySha256: hash(await readFile(path.resolve(bundle, `.${entry}`))), expected: 12, passed: records.filter(record => record.passed).length, records };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, expected: report.expected })}\n`);
process.exitCode = report.passed === report.expected ? 0 : 1;
