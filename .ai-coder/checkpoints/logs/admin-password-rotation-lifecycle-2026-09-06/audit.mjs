// Real compiled Admin/Provider 360/Header/password form. All HTTP/cookies synthetic.
// Usage: node audit.mjs <compiled-admin-directory> <new-evidence-directory>
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
  firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const provider = { id, userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', businessName: 'Synthetic Provider Record',
  description: '', tier: 'new', status: 'approved', averageRating: 0, totalReviews: 0,
  totalJobsCompleted: 0, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
  city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', fullName: 'Synthetic Provider',
    phone: '+63919****888', email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
  documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
    avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
  categories: [], declaredCategories: [], services: [], serviceAreas: [], certifications: [], portfolio: [] };
const notesPath = `/api/v1/admin/providers/${id}/notes`, passwordPath = '/api/v1/security/admin/me/change-password';
const destination = `/providers/${id}?tab=notes`;
const noteBody = { body: 'Synthetic pending support note', category: 'general', pinned: false };
const passwordBody = { oldPassword: 'synthetic-old-password-1234', newPassword: 'synthetic-new-password-1234' };
const kpis = Object.fromEntries(['revenue', 'revenueTrendPct', 'activeBookings', 'pendingDisputes', 'newSignups',
  'pendingApprovals', 'todayBookings', 'escalatedDisputes', 'staleDisputes', 'escrowBalance', 'platformRevenue',
  'guaranteeFund', 'guaranteeFundRunwayMonths'].map(key => [key, 0]));
const dashboardLists = new Set(['/api/v1/admin/dashboard/revenue-trend', '/api/v1/admin/dashboard/booking-volume',
  '/api/v1/admin/dashboard/alerts', '/api/v1/admin/dashboard/cities', '/api/v1/admin/compliance/dsr-alerts',
  '/api/v1/admin/analytics/quality-watch']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = path.resolve(root, `.${pathname}`);
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const exists = await stat(requested).then(value => value.isFile()).catch(() => false);
    const file = exists ? requested : path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }); res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const index = await readFile(path.join(root, 'index.html'), 'utf8');
const entry = /src="([^"]+\.js)"/.exec(index)?.[1]; assert.ok(entry);
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null, createdAt: new Date().toISOString(),
  evidenceType: 'compiled mandatory rotation/draft/completion lifecycle; synthetic HTTP; not live authentication',
  indexSha256: createHash('sha256').update(index).digest('hex'),
  entrySha256: createHash('sha256').update(await readFile(path.join(root, entry))).digest('hex'),
  checks: [], failure: null, failedScenario: null };
let currentPage, currentEvidence, releasePending = () => {};
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const scenario of ['runtime-required', 'draft-required', 'late-after-success', 'required-submit-failure']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-original-csrf', url: origin },
        { name: 'admin_session', value: 'synthetic-original-session', domain: '127.0.0.1', path: '/api', httpOnly: true }]);
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [], documentNavigations = [], overflow = [];
      currentEvidence = { width, scenario, requests, unexpected, errors, captures, documentNavigations, overflow };
      let passwordAttempts = 0, passwordCommitted = false, noteSettled = false, blockedRealtimeConnections = 0;
      const pending = new Promise(resolve => { releasePending = resolve; });
      const deferredRequirement = ['draft-required', 'late-after-success'].includes(scenario);
      await context.routeWebSocket('**/*', async socket => {
        blockedRealtimeConnections += 1; await socket.close({ code: 1000, reason: 'Synthetic fixture, no realtime' });
      });
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations.push(new URL(request.url()).pathname);
      });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        const headers = await request.allHeaders();
        // Never retain password bodies or cookie headers in evidence.
        const row = { method: request.method(), path: url.pathname, csrf: headers['x-csrf-token'] ?? null,
          ...(url.pathname === notesPath && request.method() === 'POST' ? { body: request.postDataJSON() } : {}) };
        requests.push(row);
        if (url.origin === origin && url.pathname.startsWith('/socket.io')) {
          blockedRealtimeConnections += 1; return route.fulfill({ status: 503, body: 'Realtime intentionally unavailable' });
        }
        const fail = (status, code, message) => route.fulfill({ status, contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message, code } }) });
        let data, responseHeaders;
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/v1/auth/me') data = { ...actor, mustRotatePassword: false };
          if (url.pathname === `/api/v1/admin/providers/${id}/profile`) data = provider;
          if (url.pathname === notesPath) data = [];
          if (url.pathname === '/api/v1/admin/dashboard/kpis') data = kpis;
          if (url.pathname === '/api/v1/admin/dashboard/acquisition-funnel') data = { registered: 0, firstBooking: 0, repeatBooking: 0 };
          if (dashboardLists.has(url.pathname)) data = [];
        }
        if (url.origin === origin && request.method() === 'POST') {
          if (url.pathname === notesPath) {
            assert.deepEqual(row.body, noteBody);
            if (deferredRequirement) await pending;
            await fail(428, 'password_rotation_required', 'Synthetic requirement on the old record request');
            noteSettled = true; return;
          }
          if (url.pathname === passwordPath) {
            assert.deepEqual(request.postDataJSON(), passwordBody);
            assert.equal(row.csrf, 'synthetic-original-csrf');
            passwordAttempts += 1;
            if (scenario === 'required-submit-failure' && passwordAttempts === 1) {
              return fail(400, 'incorrect_password', 'Synthetic current password was rejected');
            }
            passwordCommitted = true; data = { message: 'Synthetic password changed' };
            responseHeaders = { 'Set-Cookie': 'admin_csrf=synthetic-replacement-csrf; Path=/; SameSite=Lax' };
          }
        }
        if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json',
          ...(responseHeaders ? { headers: responseHeaders } : {}), body: JSON.stringify({ success: true, data }) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin }); return route.abort('blockedbyclient');
      });
      const capture = async stage => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file = `${width}-${scenario}-${stage}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
        const pixels = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        overflow.push({ stage, pixels }); assert.ok(pixels <= 0, `Document overflow at ${stage}: ${pixels}`);
      };
      const checkRequired = async () => {
        await expect(page).toHaveURL(`${origin}/change-password`);
        await expect(page.getByText('Password rotation required', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cancel and return' })).toHaveCount(0);
      };
      await page.goto(`${origin}${destination}`);
      await page.getByRole('textbox', { name: 'Internal note', exact: true }).fill(noteBody.body);
      await page.getByRole('button', { name: 'Save Note', exact: true }).click();
      await expect.poll(() => requests.filter(row => row.method === 'POST' && row.path === notesPath).length).toBe(1);
      if (deferredRequirement) {
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        await page.getByRole('button', { name: 'Change password', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Cancel and return' })).toBeVisible();
      } else {
        await checkRequired(); await capture('mandatory');
        // Attempt an ordinary route through the browser history, not a reload
        // that would intentionally replace current state with a new /auth/me.
        await page.evaluate(() => { history.pushState(null, '', '/'); dispatchEvent(new Event('popstate')); });
        await checkRequired();
      }
      await page.getByLabel(/^Current password/).fill(passwordBody.oldPassword);
      await page.getByLabel(/^New password/).fill(passwordBody.newPassword);
      await page.getByLabel(/^Confirm new password/).fill(passwordBody.newPassword);
      if (scenario === 'draft-required') {
        releasePending(); await expect.poll(() => noteSettled).toBe(true); await checkRequired();
        await expect(page.getByLabel(/^Current password/)).toHaveValue(passwordBody.oldPassword);
        await expect(page.getByLabel(/^New password/)).toHaveValue(passwordBody.newPassword);
        await expect(page.getByLabel(/^Confirm new password/)).toHaveValue(passwordBody.newPassword);
        await capture('retained-draft');
      }
      await page.getByRole('button', { name: 'Update password', exact: true }).click();
      if (scenario === 'required-submit-failure') {
        await expect(page.getByRole('alert')).toContainText('Synthetic current password was rejected');
        await checkRequired(); assert.equal(passwordCommitted, false);
        await expect(page.getByLabel(/^New password/)).toHaveValue(passwordBody.newPassword);
        await capture('rejected');
        await page.getByRole('button', { name: 'Update password', exact: true }).click();
      }
      await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
      await expect(page.getByText('Password rotation required', { exact: true })).toHaveCount(0);
      assert.equal(passwordCommitted, true); await capture('updated');
      await page.getByRole('button', { name: 'Continue to operations', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/`);
      if (scenario === 'late-after-success') {
        releasePending(); await expect.poll(() => noteSettled).toBe(true);
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(`${origin}/`);
      }
      await expect(page.getByRole('heading', { name: 'Change password', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open admin account menu' })).toBeVisible();
      await capture('operations');
      assert.equal(passwordAttempts, scenario === 'required-submit-failure' ? 2 : 1);
      assert.deepEqual(requests.filter(row => row.method === 'POST').map(row => row.path),
        scenario === 'required-submit-failure' ? [notesPath, passwordPath, passwordPath] : [notesPath, passwordPath]);
      assert.deepEqual(documentNavigations, [`/providers/${id}`]);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      report.checks.push({ ...currentEvidence, passwordAttempts, passwordCommitted, noteSettled, blockedRealtimeConnections });
      releasePending(); await context.close(); currentPage = null; currentEvidence = null;
    }
  }
} catch (error) {
  report.failure = error.stack; report.failedScenario = currentEvidence; process.exitCode = 1;
  if (currentPage) await currentPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  releasePending(); await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output }));
}
