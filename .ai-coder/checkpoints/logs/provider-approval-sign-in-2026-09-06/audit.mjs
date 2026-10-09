// Actual compiled routes/controls with synthetic HTTP, not production or real SMS.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const bundle = await realpath(process.argv[2]);
const output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const index = await readFile(path.join(bundle, 'index.html'));
const entry = index.toString().match(/src="([^"]+\.js)"/)?.[1];
assert(entry, 'Compiled entry required');
const entryBytes = await readFile(path.resolve(bundle, `.${entry}`));
const hash = data => createHash('sha256').update(data).digest('hex');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let target = path.resolve(bundle, `.${pathname}`);
    if (target !== bundle && !target.startsWith(`${bundle}${path.sep}`)) throw new Error('Outside bundle');
    if (!path.extname(pathname)) target = path.join(bundle, 'index.html');
    const bytes = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(bytes);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const applicant = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', phone: '+639170000001', email: null,
  firstName: 'Synthetic', lastName: 'Applicant', avatarUrl: null, role: 'customer' };
const provider = { ...applicant, role: 'provider' };
const records = [];
let browser;

async function flow(width, mode, otpLength) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const record = { width, mode, otpLength, passed: false, captures: [], requests: [], unexpected: [], pageErrors: [], consoleErrors: [] };
  const code = '12345678'.slice(0, otpLength);
  let approved = mode === 'explicit', authenticated = false;
  await context.addInitScript(user => {
    if (sessionStorage.getItem('synthetic-fixture-initialized')) return;
    sessionStorage.setItem('synthetic-fixture-initialized', 'true');
    localStorage.setItem('onservice-auth-secure:accessToken', 'synthetic-customer-access');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'synthetic-customer-refresh');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, applicant);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname, method = request.method();
    if (!pathname.startsWith('/api/v1/')) {
      if (url.origin === base) return route.continue();
      record.unexpected.push(`${method} ${url.origin}${pathname}`); return route.abort();
    }
    record.requests.push(`${method} ${pathname}`);
    let status = 200, data, error, meta;
    const denied = () => { status = 401; error = { code: 'session_revoked', message: 'This session has been revoked. Please sign in again.' }; };
    if (pathname === '/api/v1/config' && method === 'GET') data = { otpLength };
    else if (pathname === '/api/v1/providers/application-status' && method === 'GET') {
      // Explicit mode deliberately covers a retained/legacy approved response;
      // normal mode models canonical role rejection after an actual decision.
      if (approved && mode === 'normal') denied();
      else data = { status: approved ? 'approved' : 'pending', rejectionReason: null };
    } else if (pathname === '/api/v1/auth/logout' && method === 'POST') denied();
    else if (pathname === '/api/v1/auth/refresh-token' && method === 'POST') denied();
    else if (pathname === '/api/v1/auth/send-otp' && method === 'POST' && request.postDataJSON().phone === applicant.phone) data = { message: 'Synthetic code prepared' };
    else if (pathname === '/api/v1/auth/verify-otp' && method === 'POST' && request.postDataJSON().phone === applicant.phone && request.postDataJSON().code === code) {
      authenticated = true;
      data = { user: provider, accessToken: 'synthetic-provider-access', refreshToken: 'synthetic-provider-refresh', isNewUser: false };
    } else if (authenticated && request.headers().authorization === 'Bearer synthetic-provider-access' && method === 'GET') {
      if (pathname === '/api/v1/providers/me') data = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userId: applicant.id,
        status: 'approved', tier: 'new', isAvailable: false, rating: null, totalJobs: 0, acceptanceRate: null,
        services: [], schedule: [], portfolio: [], certifications: [], ratings: { overall: null, totalReviews: 0 } };
      else if (pathname === '/api/v1/bookings') { data = []; meta = { total: 0, page: 1, pageSize: 5 }; }
      else if (pathname === '/api/v1/notifications') { data = []; meta = { unread: 0, total: 0 }; }
      else if (pathname === '/api/v1/providers/me/nbi-status') data = { status: 'valid', expiresAt: '2028-01-01' };
      else { status = 501; record.unexpected.push(`${method} ${pathname}`); }
    } else { status = 501; record.unexpected.push(`${method} ${pathname}`); }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(error ? { success: false, error } : { success: true, data, ...(meta ? { meta } : {}) }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => record.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
  const capture = async (name, element) => {
    await expect(element).toBeVisible(); await element.scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await document.fonts.ready; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const screenshot = `${width}-${mode}-${otpLength}digits-${name}.png`;
    record.captures.push({ name, path: new URL(page.url()).pathname, overflow, screenshot });
    await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled' });
    assert(overflow <= 1, `${name} document overflow ${overflow}`);
  };
  try {
    await page.goto(`${base}/provider-onboarding/${mode === 'normal' ? 'review-pending' : 'background-check-status'}`);
    await capture('review', page.getByText(mode === 'normal' ? 'Application submitted' : 'Application approved', { exact: true }));
    if (mode === 'normal') { approved = true; await page.getByRole('button', { name: 'Refresh application status', exact: true }).click(); }
    else {
      assert(!record.requests.some(item => item.endsWith('/auth/refresh-token')), 'No automatic role refresh');
      await expect(page.getByRole('button', { name: 'Go to Customer Home' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Sign in again', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/auth\/login$/);
    const notice = page.getByRole('alert').filter({ hasText: 'Sign in again to confirm your current account access.' });
    await capture('login', notice);
    assert.equal(await page.evaluate(() => localStorage.getItem('onservice-auth-secure:user')), null);
    await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill('9170000001');
    await page.getByRole('button', { name: 'Send Verification Code', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/otp-verify\?/);
    await capture('otp', page.getByText('Enter Verification Code', { exact: true }));
    const input = page.getByLabel(`Enter ${otpLength}-digit code`, { exact: true });
    record.digitBounds = await input.evaluate(element => {
      const row = element.previousElementSibling;
      const bounds = item => { const rect = item.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }; };
      return { row: bounds(row), input: bounds(element), cells: Array.from(row.children).map(bounds) };
    });
    const { row, cells } = record.digitBounds;
    assert.equal(cells.length, otpLength);
    assert(row.left >= 0 && row.right <= width, 'Code row must be inside viewport');
    for (const cell of cells) {
      assert(cell.left >= row.left - 1 && cell.right <= row.right + 1, 'Every digit must fit its form row');
      assert(cell.height >= 44 && cell.width >= 20, 'Digits retain a readable size and full input tap height');
    }
    await input.fill(code);
    await expect(page).toHaveURL(/\/dashboard$/);
    await capture('provider', page.getByText('Hello, Synthetic', { exact: true }));
    const account = await page.evaluate(() => JSON.parse(localStorage.getItem('onservice-auth-secure:user')));
    assert.equal(account.id, applicant.id); assert.equal(account.role, 'provider');
    assert.equal(record.requests.filter(item => item.endsWith('/auth/verify-otp')).length, 1);
    assert(!record.requests.some(item => item.endsWith('/providers/apply') || item.endsWith('/application-draft')));
    assert.equal(record.unexpected.length, 0); assert.equal(record.pageErrors.length, 0);
    assert(record.consoleErrors.every(item => /401/.test(item)), 'Unexpected console error');
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    record.failedPath = new URL(page.url()).pathname;
    record.failedText = (await page.locator('body').innerText()).slice(0, 6000);
    await page.screenshot({ path: path.join(output, `${width}-${mode}-${otpLength}digits-failure.png`), animations: 'disabled' });
  } finally { await context.close(); }
  return record;
}
try {
  browser = await chromium.launch();
  outer: for (const width of [320, 390, 768, 1024, 1366, 1920]) for (const mode of ['normal', 'explicit']) for (const otpLength of [4, 5, 6, 7, 8]) {
    const record = await flow(width, mode, otpLength); records.push(record);
    process.stdout.write(`${JSON.stringify({ width, mode, otpLength, passed: record.passed, error: record.error })}\n`);
    if (!record.passed) break outer;
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { generatedAt: new Date().toISOString(), sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree',
  scope: 'Compiled UI with synthetic HTTP, identity and OTP. Not actual PostgreSQL, SMS, production, native or complete dashboard/Stitch acceptance.',
  indexSha256: hash(index), entrySha256: hash(entryBytes), expectedFlows: 60, passed: records.filter(item => item.passed).length, records };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, expected: 60, output })}\n`);
process.exitCode = report.passed === 60 ? 0 : 1;
