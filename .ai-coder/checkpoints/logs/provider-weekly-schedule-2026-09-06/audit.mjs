// Actual compiled screen. Synthetic identities and HTTP, no production calls.
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
const suggested = 'Suggested hours are not saved yet. Review them, then Save Schedule to set your weekly hours.';
let browser;

async function flow(width, mode) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Asia/Manila' });
  const record = { width, mode, passed: false, requests: [], writes: [], captures: [], unexpected: [], pageErrors: [] };
  let saved = mode === 'empty' ? [] : [{ id: 'synthetic-wednesday', dayOfWeek: 3, startTime: '09:00:00', endTime: '17:00:00', isAvailable: true }];
  let releaseFirstSave;
  const firstSave = new Promise(resolve => { releaseFirstSave = resolve; });
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
    else if (p === '/api/v1/providers/me/schedule' && method === 'GET') data = saved;
    else if (p === '/api/v1/providers/me/schedule' && method === 'PUT') {
      const payload = request.postDataJSON(); record.writes.push(payload);
      if (mode === 'partial-delayed' && record.writes.length === 1) await firstSave;
      saved = payload.schedule.map(day => ({ id: `synthetic-${day.dayOfWeek}`, ...day })); data = saved;
    } else { status = 501; record.unexpected.push(`${method} ${p}`); }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status === 200, data }) });
  });
  const page = await context.newPage(); page.on('pageerror', error => record.pageErrors.push(error.message));
  const save = page.getByRole('button', { name: 'Save Schedule', exact: true });
  const wednesday = page.getByLabel('Wednesday start time in HH:MM', { exact: true });
  async function capture(name) {
    await page.evaluate(async () => { await document.fonts.ready; });
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const controls = Array.from(document.querySelectorAll('input,button,[role="button"],[role="checkbox"]')).map(element => {
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
  async function onlyWednesday() {
    for (const day of ['Sunday', 'Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday']) {
      await expect(page.getByLabel(`${day} start time in HH:MM`, { exact: true })).toHaveCount(0);
    }
  }
  try {
    await page.goto(`${base}/provider/schedule`);
    await expect(page.getByText('Weekly Schedule', { exact: true })).toBeVisible();
    if (mode === 'partial-delayed') { await expect(wednesday).toHaveValue('09:00'); await onlyWednesday(); }
    else { await expect(page.getByText(suggested, { exact: true })).toBeVisible(); await expect(save).toBeEnabled(); }
    await expect(page.getByText('Set your regular hours for new job matching, in Manila time. Use 24-hour HH:MM, such as 08:00 to 17:00.', { exact: true })).toBeVisible();
    await capture('initial');
    if (mode === 'empty') {
      await save.click();
      await expect(page.getByText(suggested, { exact: true })).toHaveCount(0);
      await expect(save).toBeDisabled();
      assert.equal(record.writes.length, 1);
      assert.equal(saved.length, 7);
      assert.deepEqual(saved.filter(day => day.isAvailable).map(day => day.dayOfWeek), [1, 2, 3, 4, 5]);
      await capture('saved');
    } else {
      await wednesday.fill('10:00'); await save.click();
      await expect.poll(() => record.writes.length).toBe(1);
      assert.equal(record.writes[0].schedule.length, 7);
      assert.deepEqual(record.writes[0].schedule.filter(day => day.isAvailable), [{ dayOfWeek: 3, startTime: '10:00', endTime: '17:00', isAvailable: true }]);
      await wednesday.fill('12:00');
      await expect(page.getByRole('button', { name: 'Saving...', exact: true })).toBeDisabled();
      await capture('pending-newer-edit');
      releaseFirstSave();
      await expect(save).toBeEnabled();
      await expect(wednesday).toHaveValue('12:00');
      await expect(page.getByText('Submitted hours saved. Your newer changes still need saving.', { exact: true })).toBeVisible();
      assert.equal(saved.find(day => day.dayOfWeek === 3).startTime, '10:00');
      await capture('newer-edit-retained');
      await save.click(); await expect(save).toBeDisabled();
      await expect.poll(() => record.writes.length).toBe(2);
      await expect.poll(() => saved.find(day => day.dayOfWeek === 3).startTime).toBe('12:00');
      await expect(page.getByRole('button', { name: 'Saving...', exact: true })).toHaveCount(0);
      await capture('saved');
    }
    await page.reload();
    await expect(wednesday).toHaveValue(mode === 'empty' ? '08:00' : '12:00');
    await expect(page.getByText(suggested, { exact: true })).toHaveCount(0);
    await expect(save).toBeDisabled();
    if (mode === 'partial-delayed') await onlyWednesday();
    await capture('reloaded');
    assert.equal(record.writes.length, mode === 'empty' ? 1 : 2, 'Reload must not save anything');
    assert.equal(record.unexpected.length, 0); assert.equal(record.pageErrors.length, 0);
    record.saved = saved; record.passed = true;
  } catch (error) {
    record.error = error.message;
    await page.screenshot({ path: path.join(output, `${width}-${mode}-failure.png`), animations: 'disabled' });
  } finally { releaseFirstSave(); await context.close(); }
  return record;
}
try {
  browser = await chromium.launch();
  outer: for (const width of [320, 390, 768, 1024, 1366, 1920]) for (const mode of ['partial-delayed', 'empty']) {
    const record = await flow(width, mode); records.push(record);
    process.stdout.write(`${JSON.stringify({ width, mode, passed: record.passed, error: record.error })}\n`);
    if (!record.passed) break outer;
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { generatedAt: new Date().toISOString(), sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree',
  scope: 'Compiled weekly schedule first save, partial saved week, editing during delayed saves, submitted payloads and reloads, using synthetic HTTP. Not actual PostgreSQL, production, native, every accessibility interaction or complete Stitch acceptance.',
  indexSha256: hash(index), entrySha256: hash(await readFile(path.resolve(bundle, `.${entry}`))), expected: 12, passed: records.filter(r => r.passed).length, records };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, expected: report.expected })}\n`);
process.exitCode = report.passed === report.expected ? 0 : 1;
