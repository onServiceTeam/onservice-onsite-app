// Actual compiled availability form, isolated synthetic HTTP and records only.
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
// Optional follow-up checks; historical evidence was captured without this mode.
const verifyGuidance = process.env.AUDIT_GUIDANCE === '1';
let browser;
async function flow(width, mode) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const record = { width, mode, passed: false, requests: [], writes: [], captures: [], unexpected: [], pageErrors: [] };
  const overrides = [];
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
    let status = 200, data = {};
    if (p === '/api/v1/config' && method === 'GET') data = {};
    else if (p === '/api/v1/providers/me/availability/status' && method === 'GET') data = { isAvailable: verifyGuidance && mode === 'custom' };
    else if (p === '/api/v1/providers/me/availability/overrides' && method === 'GET') data = overrides;
    else if (p === '/api/v1/providers/me/availability/overrides' && method === 'POST') {
      const payload = request.postDataJSON(); record.writes.push(payload);
      data = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...payload,
        startTime: payload.startTime ?? null, endTime: payload.endTime ?? null, createdAt: '2026-09-05T12:00:00Z' };
      overrides.push(data);
    } else { status = 501; record.unexpected.push(`${method} ${p}`); }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status === 200, data }) });
  });
  const page = await context.newPage(); page.on('pageerror', error => record.pageErrors.push(error.message));
  async function capture(name) {
    await page.evaluate(async () => { await document.fonts.ready; });
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const controls = Array.from(document.querySelectorAll('input,button,[role="button"],[role="switch"]')).map(element => {
        const rect = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') ?? element.textContent, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }).filter(item => item.width > 0 && item.height > 0);
      return { width, overflow: document.documentElement.scrollWidth - width, controls };
    });
    const screenshot = `${width}-${mode}-${name}.png`;
    record.captures.push({ name, screenshot, ...layout });
    await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled' });
    assert(layout.overflow <= 1, `${name} document overflow ${layout.overflow}`);
    assert(layout.controls.every(item => item.left >= -1 && item.right <= width + 1), `${name} control clipped outside viewport`);
  }
  try {
    await page.goto(`${base}/provider/availability`);
    await expect(page.getByText('No Date Overrides', { exact: true })).toBeVisible();
    if (verifyGuidance) {
      await expect(page.getByText(mode === 'custom'
        ? 'You are open to new job offers that match your services and working hours.'
        : 'Automatic job matching is paused. Your profile may still appear in search.', { exact: true })).toBeVisible();
      await expect(page.getByText('Changing availability does not cancel or reschedule existing bookings.', { exact: true })).toBeVisible();
      await expect(page.getByText(/You are hidden from search/)).toHaveCount(0);
    }
    await capture('empty');
    await expect(page.getByText(/Your weekly schedule is active/)).toHaveCount(0);
    await page.getByText('+ Add', { exact: true }).click();
    if (verifyGuidance) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      await expect(page.getByText(`Example: ${today} (today in Manila)`, { exact: true })).toBeVisible();
      await page.getByLabel('Override date in YYYY-MM-DD format', { exact: true }).fill('2099-02-29');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const warning = page.getByText('Enter a real calendar date in YYYY-MM-DD format.', { exact: true });
      await expect(warning).toBeVisible();
      // RN animates the toast's parent. DOM visibility alone can pass while
      // its opacity is still zero or it is translated outside the viewport.
      await expect(warning).toBeInViewport();
      await expect.poll(() => warning.evaluate(element => {
        let opacity = 1;
        for (let current = element; current; current = current.parentElement) opacity *= Number(getComputedStyle(current).opacity);
        return opacity;
      })).toBeGreaterThan(0.98);
      record.warningFeedback = await warning.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      });
      assert.equal(record.writes.length, 0, 'Invalid date must not submit');
      await capture('invalid-date');
    }
    await page.getByLabel('Override date in YYYY-MM-DD format', { exact: true }).fill('2099-08-31');
    if (mode === 'custom') {
      await page.getByText('Available Hours for This Date', { exact: true }).click();
      await page.getByLabel('Override start time in HH:MM', { exact: true }).fill('08:00');
      await page.getByLabel('Override end time in HH:MM', { exact: true }).fill('17:00');
    }
    const reason = `Synthetic ${mode} override`;
    await page.getByLabel('Override reason', { exact: true }).fill(reason);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.scrollIntoViewIfNeeded(); await capture('form'); await save.click();
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Override date in YYYY-MM-DD format', { exact: true })).toHaveCount(0);
    assert.deepEqual(record.writes, [{ overrideDate: '2099-08-31', isAvailable: mode === 'custom', reason,
      ...(mode === 'custom' ? { startTime: '08:00', endTime: '17:00' } : {}) }]);
    await capture('saved');
    assert.equal(record.unexpected.length, 0); assert.equal(record.pageErrors.length, 0);
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    await page.screenshot({ path: path.join(output, `${width}-${mode}-failure.png`), animations: 'disabled' });
  } finally { await context.close(); }
  return record;
}
try {
  browser = await chromium.launch();
  outer: for (const width of [320, 390, 768, 1024, 1366, 1920]) for (const mode of ['block', 'custom']) {
    const record = await flow(width, mode); records.push(record);
    process.stdout.write(`${JSON.stringify({ width, mode, passed: record.passed, error: record.error })}\n`);
    if (!record.passed) break outer;
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { generatedAt: new Date().toISOString(), sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree',
  guidanceChecks: verifyGuidance,
  scope: 'Compiled provider availability layout, block/custom form payload and refreshed list with synthetic HTTP. Not actual persistence, matching, production, native or complete Stitch acceptance.',
  indexSha256: hash(index), entrySha256: hash(await readFile(path.resolve(bundle, `.${entry}`))), expected: 12, passed: records.filter(r => r.passed).length, records };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, expected: report.expected })}\n`);
process.exitCode = report.passed === report.expected ? 0 : 1;
