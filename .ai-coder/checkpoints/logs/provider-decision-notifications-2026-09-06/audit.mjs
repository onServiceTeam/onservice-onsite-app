// Compiled UI + synthetic HTTP. No production users, messages or records.
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
assert(entry, 'Compiled entry required');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
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
const approvalBody = 'Your provider account has been approved. Sign in again with your verified mobile number, then review your services, pricing and availability in your provider workspace before accepting work.';
const rejectionReason = 'Your qualification evidence could not be confirmed. Contact support for clarification about the documents reviewed and the decision. Do not create another account or submit duplicate evidence.';
const records = [];
let browser;

async function flow(width, scenario) {
  const role = scenario === 'provider-approved' ? 'provider' : 'customer';
  const rejected = scenario === 'customer-rejected';
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role, firstName: 'Synthetic', lastName: 'Applicant', phone: '+639170000001', email: null, avatarUrl: null };
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const notice = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', type: rejected ? 'provider_rejected' : 'provider_approved',
    title: rejected ? 'Application Declined' : 'Account Approved', body: rejected ? `Your provider application has been declined. Reason: ${rejectionReason}` : approvalBody,
    data: { providerId }, isRead: false, createdAt: '2026-09-05T12:00:00Z' };
  const record = { width, scenario, passed: false, requests: [], unexpected: [], pageErrors: [], captures: [] };
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(user => {
    if (sessionStorage.getItem('fixture-initialized')) return;
    sessionStorage.setItem('fixture-initialized', 'true');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
    localStorage.setItem('onservice-auth-secure:accessToken', 'synthetic-access');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'synthetic-refresh');
  }, user);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), p = url.pathname;
    if (!p.startsWith('/api/v1/')) {
      if (url.origin === base) return route.continue();
      record.unexpected.push(`${method} ${url.origin}${p}`); return route.abort();
    }
    record.requests.push(`${method} ${p}`);
    let status = 200, data = {}, meta;
    if (p === '/api/v1/config' && method === 'GET') data = {};
    else if (p === '/api/v1/notifications' && method === 'GET') { data = [notice]; meta = { total: 1, unread: notice.isRead ? 0 : 1 }; }
    else if (p === `/api/v1/notifications/${notice.id}/read` && method === 'POST') notice.isRead = true;
    else if (p === '/api/v1/providers/application-status' && method === 'GET') {
      if (rejected) data = { status: 'rejected', rejectionReason };
      else status = 401;
    } else if (p === '/api/v1/auth/refresh-token' && method === 'POST' && scenario === 'customer-approved') status = 401;
    else if (role === 'provider' && method === 'GET' && p === '/api/v1/providers/me') data = {
      id: providerId, userId: user.id, status: 'approved', tier: 'new', isAvailable: false,
      rating: null, totalJobs: 0, acceptanceRate: null, services: [], schedule: [], portfolio: [], certifications: [], ratings: { overall: null, totalReviews: 0 },
    };
    else if (role === 'provider' && method === 'GET' && p === '/api/v1/bookings') { data = []; meta = { total: 0, page: 1, pageSize: 5 }; }
    else if (role === 'provider' && method === 'GET' && p === '/api/v1/providers/me/nbi-status') data = { status: 'valid', expiresAt: '2028-01-01' };
    else { status = 501; record.unexpected.push(`${method} ${p}`); }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 401
      ? { success: false, error: { code: 'session_revoked', message: 'Please sign in again.' } }
      : { success: true, data, ...(meta ? { meta } : {}) }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => record.pageErrors.push(error.message));
  const capture = async name => {
    await page.evaluate(async () => { await document.fonts.ready; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const screenshot = `${width}-${scenario}-${name}.png`;
    record.captures.push({ name, path: new URL(page.url()).pathname, screenshot, overflow });
    await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled' });
    assert(overflow <= 1, `${name} overflow ${overflow}`);
  };
  try {
    await page.goto(`${base}/${role}/notifications`);
    const body = page.getByText(notice.body, { exact: true });
    await expect(body).toBeVisible();
    record.bodyLayout = await body.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, clamp: getComputedStyle(element).webkitLineClamp }));
    await capture('inbox');
    assert(['none', ''].includes(record.bodyLayout.clamp), 'Admission text must not be clamped');
    assert(record.bodyLayout.height + 1 >= record.bodyLayout.scrollHeight, 'Full admission text must be visible');
    await body.click();
    if (rejected) {
      await expect(page).toHaveURL(/\/provider-onboarding\/review-pending$/);
      await expect(page.getByText('Application not approved', { exact: true })).toBeVisible();
      await expect(page.getByText(rejectionReason, { exact: true })).toBeVisible();
    } else if (role === 'provider') {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText('Hello, Synthetic', { exact: true })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/auth\/login$/);
      await expect(page.getByRole('alert')).toContainText('Sign in again to confirm your current account access.');
      assert.equal(await page.evaluate(() => localStorage.getItem('onservice-auth-secure:user')), null);
    }
    await capture('destination');
    assert.equal(record.requests.filter(item => item === `POST /api/v1/notifications/${notice.id}/read`).length, 1);
    assert.equal(record.pageErrors.length, 0); assert.equal(record.unexpected.length, 0);
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    record.failedPath = new URL(page.url()).pathname;
    await page.screenshot({ path: path.join(output, `${width}-${scenario}-failure.png`), animations: 'disabled' });
  } finally { await context.close(); }
  return record;
}
try {
  browser = await chromium.launch();
  outer: for (const width of [320, 390, 768, 1024, 1366, 1920]) for (const scenario of ['customer-rejected', 'customer-approved', 'provider-approved']) {
    const record = await flow(width, scenario); records.push(record);
    process.stdout.write(`${JSON.stringify({ width, scenario, passed: record.passed, error: record.error })}\n`);
    if (!record.passed) break outer;
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { generatedAt: new Date().toISOString(), sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree',
  scope: 'Compiled notification inbox, full admission text and destination routes with synthetic local HTTP. Not production, actual SMS/PG, native or full inbox/Stitch acceptance.',
  indexSha256: hash(index), entrySha256: hash(await readFile(path.resolve(bundle, `.${entry}`))), expected: 18, passed: records.filter(r => r.passed).length, records };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, expected: report.expected })}\n`);
process.exitCode = report.passed === report.expected ? 0 : 1;
