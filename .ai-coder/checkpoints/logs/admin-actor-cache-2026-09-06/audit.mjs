// Actual compiled login/logout and 360 pages. Synthetic cookies/HTTP only.
// Realtime connections are explicitly blocked, not certified by this audit.
// Usage: node audit.mjs <compiled-admin-directory> <new-evidence-directory>
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const supervisor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
  firstName: 'Synthetic', lastName: 'Supervisor', email: 'supervisor@example.invalid', phone: '', avatarUrl: null };
const operator = { ...supervisor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'admin',
  lastName: 'Operator', email: 'operator@example.invalid' };
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const customer = { id, firstName: 'Synthetic', lastName: 'Customer', fullName: 'Synthetic Customer Record',
  phone: '+639199998888', email: 'private.customer@example.invalid', contactMasked: false, avatarUrl: null,
  isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z', lifetimeBookings: 0, lifetimeSpent: 0,
  activeBookings: 0, openDisputes: 0, averageRatingGiven: null, totalReviewsGiven: 0, addresses: [], sukiProviders: [] };
const provider = { id, userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', businessName: 'Synthetic Provider Record',
  description: '', tier: 'new', status: 'approved', averageRating: 0, totalReviews: 0,
  totalJobsCompleted: 0, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
  city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', fullName: 'Synthetic Provider',
    phone: '+639199998888', email: 'private.provider@example.invalid', contactMasked: false,
    avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
  documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
    avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
  categories: [], declaredCategories: [], services: [], serviceAreas: [], certifications: [], portfolio: [] };
const kpis = Object.fromEntries(['revenue', 'revenueTrendPct', 'activeBookings', 'pendingDisputes',
  'newSignups', 'pendingApprovals', 'todayBookings', 'escalatedDisputes', 'staleDisputes',
  'escrowBalance', 'platformRevenue', 'guaranteeFund', 'guaranteeFundRunwayMonths'].map(key => [key, 0]));
const dashboardLists = new Set(['/api/v1/admin/dashboard/revenue-trend', '/api/v1/admin/dashboard/booking-volume',
  '/api/v1/admin/dashboard/alerts', '/api/v1/admin/dashboard/cities', '/api/v1/admin/compliance/dsr-alerts',
  '/api/v1/admin/analytics/quality-watch']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = path.resolve(root, `.${pathname}`);
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const isFile = await stat(requested).then(value => value.isFile()).catch(() => false);
    const file = isFile ? requested : path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }); res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const index = await readFile(path.join(root, 'index.html'), 'utf8');
const entry = /src="([^"]+\.js)"/.exec(index)?.[1];
assert.ok(entry, 'Compiled entry script missing');
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null, createdAt: new Date().toISOString(),
  evidenceType: 'compiled login/logout and record pages; synthetic HTTP; realtime blocked; not live acceptance',
  indexSha256: createHash('sha256').update(index).digest('hex'),
  entrySha256: createHash('sha256').update(await readFile(path.join(root, entry))).digest('hex'), checks: [], failure: null };
let currentPage;
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const area of ['customer', 'provider']) {
      for (const timing of ['completed', 'delayed']) {
        let activeAdmin = supervisor, releaseOld;
        const oldResponseBarrier = new Promise(resolve => { releaseOld = resolve; });
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-supervisor', url: origin }]);
        const page = currentPage = await context.newPage();
        const requests = [], unexpected = [], errors = [], captures = [];
        let blockedRealtimeConnections = 0;
        await context.routeWebSocket('**/*', async socket => {
          blockedRealtimeConnections += 1;
          await socket.close({ code: 1000, reason: 'No realtime server in this synthetic cache audit' });
        });
        page.on('pageerror', error => errors.push(error.message));
        const recordPath = `/api/v1/admin/${area}s/${id}${area === 'provider' ? '/profile' : ''}`;
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
          const actor = activeAdmin;
          requests.push({ method: request.method(), path: url.pathname, actorId: actor.id, actorRole: actor.role });
          if (url.origin === origin && url.pathname.startsWith('/socket.io')) {
            blockedRealtimeConnections += 1;
            return route.fulfill({ status: 503, body: 'Realtime intentionally unavailable in this cache fixture' });
          }
          let data, cookie;
          if (url.origin === origin && request.method() === 'GET') {
            if (url.pathname === '/api/v1/auth/me') data = actor;
            if (url.pathname === recordPath) {
              data = area === 'customer'
                ? actor.role === 'super_admin' ? customer : { ...customer, phone: '+63919****888', email: null, contactMasked: true }
                : actor.role === 'super_admin' ? provider : { ...provider, user: { ...provider.user, phone: '+63919****888', email: null, contactMasked: true } };
              // Capture the privileged response before waiting, so a later
              // login cannot accidentally turn the old response into masked data.
              if (actor.id === supervisor.id && timing === 'delayed') await oldResponseBarrier;
            }
            if (url.pathname === '/api/v1/admin/dashboard/kpis') data = kpis;
            if (url.pathname === '/api/v1/admin/dashboard/acquisition-funnel') data = { registered: 0, firstBooking: 0, repeatBooking: 0 };
            if (dashboardLists.has(url.pathname)) data = [];
          }
          if (url.origin === origin && request.method() === 'POST') {
            if (url.pathname === '/api/v1/auth/admin/logout') { data = {}; cookie = 'admin_csrf=; Max-Age=0; Path=/; SameSite=Lax'; }
            if (url.pathname === '/api/v1/auth/admin/login') {
              const body = request.postDataJSON();
              assert.equal(body.email, operator.email);
              assert.equal(body.password, 'synthetic-test-only-not-a-credential');
              activeAdmin = operator; data = { user: operator, mustRotatePassword: false };
              cookie = 'admin_csrf=synthetic-operator; Path=/; SameSite=Lax';
            }
          }
          if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json',
            ...(cookie ? { headers: { 'Set-Cookie': cookie } } : {}), body: JSON.stringify({ success: true, data }) });
          unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin });
          return route.abort('blockedbyclient');
        });
        const capture = async stage => {
          const file = `${width}-${area}-${timing}-${stage}.png`;
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
        };
        const destination = `/${area}s/${id}`;
        await page.goto(`${origin}${destination}`);
        await expect.poll(() => requests.filter(row => row.path === recordPath).length).toBe(1);
        if (timing === 'completed') await expect(page.getByText('+639199998888', { exact: true })).toBeVisible();
        await capture('supervisor');
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        await page.getByRole('button', { name: 'Log out', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        await capture('signed-out');
        await page.getByLabel('Email', { exact: true }).fill(operator.email);
        await page.getByLabel('Password', { exact: true }).fill('synthetic-test-only-not-a-credential');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await page.waitForURL(`${origin}/`);
        await page.evaluate(url => { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, destination);
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        await expect(page.getByText(operator.email, { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        await expect(page.getByText('+63919****888', { exact: true })).toBeVisible();
        if (timing === 'delayed') {
          const completed = page.waitForResponse(response => new URL(response.url()).pathname === recordPath);
          releaseOld(); await completed;
        }
        await capture('operator');
        await expect(page.getByText('+639199998888', { exact: true })).toHaveCount(0);
        await expect(page.getByText(`private.${area}@example.invalid`, { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Reveal contact' })).toBeEnabled();
        await expect(page.getByRole('button', { name: area === 'customer' ? 'Manage status' : 'Force sign-out', exact: true })).toHaveCount(0);
        assert.deepEqual(requests.filter(row => row.path === recordPath).map(row => row.actorId), [supervisor.id, operator.id]);
        assert.equal(requests.filter(row => row.path === '/api/v1/auth/me').length, 1, 'Cache remount repeated auth bootstrap');
        assert.deepEqual(requests.filter(row => row.method !== 'GET').map(row => row.path), ['/api/v1/auth/admin/logout', '/api/v1/auth/admin/login']);
        assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
        const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        report.checks.push({ width, area, timing, captures, requests, unexpected, errors, blockedRealtimeConnections, documentOverflow });
        await context.close(); currentPage = null;
      }
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
