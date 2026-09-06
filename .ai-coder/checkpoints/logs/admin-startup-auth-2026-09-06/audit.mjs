// Compiled App/LoginPage/Header/route guards; synthetic HTTP and identities.
// Usage: node audit.mjs <compiled-admin-directory> <new-evidence-directory>
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const oldActor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
  firstName: 'Old', lastName: 'Supervisor', email: 'old@example.invalid', phone: '', avatarUrl: null };
const newActor = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'admin',
  firstName: 'New', lastName: 'Operator', email: 'new@example.invalid' };
const customer = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', firstName: 'Synthetic', lastName: 'Customer',
  fullName: 'Synthetic Customer Record', phone: '+63919****888', email: null, contactMasked: true, avatarUrl: null,
  isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z',
  lifetimeBookings: 0, lifetimeSpent: 0, activeBookings: 0, openDisputes: 0, averageRatingGiven: null,
  totalReviewsGiven: 0, addresses: [], sukiProviders: [] };
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
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const index = await readFile(path.join(root, 'index.html'), 'utf8');
const entry = /src="([^"]+\.js)"/.exec(index)?.[1];
assert.ok(entry, 'Compiled entry script missing');
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null, createdAt: new Date().toISOString(),
  evidenceType: 'compiled delayed startup/login ownership; synthetic HTTP; not live auth or realtime acceptance',
  indexSha256: createHash('sha256').update(index).digest('hex'),
  entrySha256: createHash('sha256').update(await readFile(path.join(root, entry))).digest('hex'), checks: [], failure: null };
let currentPage;
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const outcome of ['old-success', 'old-failure', 'new-rotation']) {
      let releaseStartup;
      const startupBarrier = new Promise(resolve => { releaseStartup = resolve; });
      const rotate = outcome === 'new-rotation';
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-old-session', url: origin }]);
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [];
      let blockedRealtimeConnections = 0;
      await context.routeWebSocket('**/*', async socket => {
        blockedRealtimeConnections += 1;
        await socket.close({ code: 1000, reason: 'No realtime service in synthetic startup audit' });
      });
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        requests.push({ method: request.method(), path: url.pathname });
        if (url.origin === origin && url.pathname.startsWith('/socket.io')) {
          blockedRealtimeConnections += 1;
          return route.fulfill({ status: 503, body: 'Realtime intentionally unavailable in this startup fixture' });
        }
        let data, cookie;
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/v1/auth/me') {
            // This is the old request's immutable response, not the newer
            // login's identity. A 403 tests failed settlement without 401 replay.
            await startupBarrier;
            if (outcome === 'old-failure') return route.fulfill({ status: 403, contentType: 'application/json',
              body: JSON.stringify({ success: false, error: { message: 'Synthetic rejected old startup session' } }) });
            data = { ...oldActor, mustRotatePassword: !rotate };
          }
          if (url.pathname === `/api/v1/admin/customers/${customer.id}`) data = customer;
          if (url.pathname === '/api/v1/admin/dashboard/kpis') data = kpis;
          if (url.pathname === '/api/v1/admin/dashboard/acquisition-funnel') data = { registered: 0, firstBooking: 0, repeatBooking: 0 };
          if (dashboardLists.has(url.pathname)) data = [];
        }
        if (url.origin === origin && request.method() === 'POST' && url.pathname === '/api/v1/auth/admin/login') {
          assert.deepEqual(request.postDataJSON(), { email: newActor.email, password: 'synthetic-test-only-not-a-credential' });
          data = { user: newActor, mustRotatePassword: rotate };
          cookie = 'admin_csrf=synthetic-new-session; Path=/; SameSite=Lax';
        }
        if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json',
          ...(cookie ? { headers: { 'Set-Cookie': cookie } } : {}), body: JSON.stringify({ success: true, data }) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin });
        return route.abort('blockedbyclient');
      });
      const capture = async stage => {
        const file = `${width}-${outcome}-${stage}.png`;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
      };
      await page.goto(`${origin}/login`);
      await expect.poll(() => requests.filter(row => row.path === '/api/v1/auth/me').length).toBe(1);
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      await capture('pending-startup');
      await page.getByLabel('Email', { exact: true }).fill(newActor.email);
      await page.getByLabel('Password', { exact: true }).fill('synthetic-test-only-not-a-credential');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL(`${origin}${rotate ? '/change-password' : '/'}`);
      if (!rotate) await page.evaluate(url => { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, `/customers/${customer.id}`);
      await capture('new-login-before-startup');
      const currentChromeBeforeOldResponse = await page.getByRole('button', { name: 'Open admin account menu' }).count();
      const delivered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/me');
      releaseStartup(); await delivered;
      await page.getByRole('button', { name: 'Open admin account menu' }).click();
      await expect(page.getByText(newActor.email, { exact: true })).toBeVisible();
      await expect(page.getByText(oldActor.email, { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Open admin account menu' }).click();
      if (rotate) {
        await expect(page).toHaveURL(`${origin}/change-password`);
        await expect(page.getByText('Password rotation required', { exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: customer.fullName })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Manage status', exact: true })).toHaveCount(0);
      }
      await capture('current-session');
      assert.equal(currentChromeBeforeOldResponse, 1, 'Completed login remained blocked on obsolete startup');
      assert.equal(requests.filter(row => row.path === '/api/v1/auth/me').length, 1);
      assert.deepEqual(requests.filter(row => row.method !== 'GET').map(row => row.path), ['/api/v1/auth/admin/login']);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      report.checks.push({ width, outcome, captures, requests, currentChromeBeforeOldResponse,
        unexpected, errors, blockedRealtimeConnections, documentOverflow });
      await context.close(); currentPage = null;
    }
  }
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
  if (currentPage) await currentPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output }));
}
