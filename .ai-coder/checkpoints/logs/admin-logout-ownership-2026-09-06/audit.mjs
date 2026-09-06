// Real compiled admin logout/login/Header search/Provider 360. Synthetic HTTP only.
// Usage: node audit.mjs <compiled-admin-directory> <new-evidence-directory>
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const oldActor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
  firstName: 'Old', lastName: 'Operator', email: 'old@example.invalid', phone: '', avatarUrl: null };
const differentActor = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', firstName: 'New', email: 'new@example.invalid' };
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
const notesPath = `/api/v1/admin/providers/${id}/notes`, logoutPath = '/api/v1/auth/admin/logout';
const destination = `/providers/${id}?tab=notes`;
const noteBody = { body: 'Synthetic fresh note after old logout', category: 'general', pinned: false };
const kpis = Object.fromEntries(['revenue', 'revenueTrendPct', 'activeBookings', 'pendingDisputes', 'newSignups',
  'pendingApprovals', 'todayBookings', 'escalatedDisputes', 'staleDisputes', 'escrowBalance', 'platformRevenue',
  'guaranteeFund', 'guaranteeFundRunwayMonths'].map(key => [key, 0]));
const dashboardLists = new Set(['/api/v1/admin/dashboard/revenue-trend', '/api/v1/admin/dashboard/booking-volume',
  '/api/v1/admin/dashboard/alerts', '/api/v1/admin/dashboard/cities', '/api/v1/admin/compliance/dsr-alerts',
  '/api/v1/admin/analytics/quality-watch']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), requested = path.resolve(root, `.${pathname}`);
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const exists = await stat(requested).then(value => value.isFile()).catch(() => false);
    const file = exists ? requested : path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }); res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true });
const index = await readFile(path.join(root, 'index.html'), 'utf8'), entry = /src="([^"]+\.js)"/.exec(index)?.[1]; assert.ok(entry);
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null, createdAt: new Date().toISOString(),
  evidenceType: 'compiled logout completion, current login and fresh provider note; synthetic HTTP; excludes delayed Set-Cookie',
  indexSha256: createHash('sha256').update(index).digest('hex'),
  entrySha256: createHash('sha256').update(await readFile(path.join(root, entry))).digest('hex'),
  checks: [], failure: null, failedScenario: null };
let currentPage, currentEvidence, releaseOld = () => {}, releaseCurrent = () => {};
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const scenario of ['different-login', 'same-login', 'current-failure']) {
      const nextActor = scenario === 'same-login' ? oldActor : differentActor;
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const setCookies = async value => context.addCookies([
        { name: 'admin_csrf', value: `synthetic-${value}-csrf`, url: origin },
        { name: 'admin_session', value: `synthetic-${value}-session`, domain: '127.0.0.1', path: '/api', httpOnly: true },
      ]);
      await setCookies('old');
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [], navigations = [], documents = [], overflows = [], storedNotes = [];
      currentEvidence = { width, scenario, requests, unexpected, errors, captures, navigations, documents, overflows };
      const oldPending = new Promise(resolve => { releaseOld = resolve; });
      const currentPending = new Promise(resolve => { releaseCurrent = resolve; });
      let logoutCalls = 0, oldSettled = false, blockedRealtimeConnections = 0;
      await context.routeWebSocket('**/*', async socket => { blockedRealtimeConnections += 1; await socket.close({ code: 1000, reason: 'Synthetic fixture' }); });
      page.on('pageerror', error => errors.push(error.message));
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname); });
      page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(new URL(request.url()).pathname); });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        const headers = await request.allHeaders();
        const session = /(?:^|;\s*)admin_session=([^;]+)/.exec(headers.cookie ?? '')?.[1];
        const acting = session === 'synthetic-current-session' ? nextActor : oldActor;
        const row = { method: request.method(), path: url.pathname, csrf: headers['x-csrf-token'] ?? null,
          ...(url.pathname === notesPath && request.method() === 'POST' ? { body: request.postDataJSON(), authorId: acting.id } : {}) };
        requests.push(row);
        if (url.origin === origin && url.pathname.startsWith('/socket.io')) { blockedRealtimeConnections += 1; return route.fulfill({ status: 503, body: 'No fixture realtime' }); }
        const reject = () => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Synthetic logout failed' } }) });
        const succeed = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
        let data;
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/v1/auth/me') data = { ...acting, mustRotatePassword: false };
          if (url.pathname === '/api/v1/admin/dashboard/kpis') data = kpis;
          if (url.pathname === '/api/v1/admin/dashboard/acquisition-funnel') data = { registered: 0, firstBooking: 0, repeatBooking: 0 };
          if (dashboardLists.has(url.pathname)) data = [];
          if (url.pathname === '/api/v1/admin/search') data = [{ kind: 'provider', id, title: provider.businessName,
            subtitle: 'Synthetic provider support record', status: 'approved', to: destination }];
          if (url.pathname === `/api/v1/admin/providers/${id}/profile`) data = provider;
          if (url.pathname === notesPath) data = storedNotes;
        }
        if (url.origin === origin && request.method() === 'POST') {
          if (url.pathname === logoutPath) {
            logoutCalls += 1; const attempt = logoutCalls;
            if (scenario === 'current-failure') return reject();
            await (attempt === 1 ? oldPending : currentPending);
            // Deliberately no late clearing-cookie response: this matrix proves
            // local completion ownership, not server/browser cookie arbitration.
            if (attempt === 2) await context.clearCookies();
            await succeed({}); if (attempt === 1) oldSettled = true; return;
          }
          if (url.pathname === '/api/v1/auth/admin/login') {
            assert.deepEqual(request.postDataJSON(), { email: nextActor.email, password: 'synthetic-password-not-a-live-credential' });
            await setCookies('current'); data = { user: nextActor, mustRotatePassword: false };
          }
          if (url.pathname === notesPath) {
            assert.equal(session, 'synthetic-current-session'); assert.equal(row.csrf, 'synthetic-current-csrf'); assert.deepEqual(row.body, noteBody);
            const note = { ...noteBody, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', authorId: acting.id,
              authorName: `${acting.firstName} ${acting.lastName}`, createdAt: '2026-09-06T00:00:00Z' };
            storedNotes.push(note); data = note;
          }
        }
        if (data !== undefined) return succeed(data);
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin }); return route.abort('blockedbyclient');
      });
      const capture = async stage => {
        await page.evaluate(() => scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file = `${width}-${scenario}-${stage}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
        const pixels = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        overflows.push({ stage, pixels }); assert.ok(pixels <= 0);
      };
      await page.goto(`${origin}/`);
      await page.getByRole('button', { name: 'Open admin account menu' }).click();
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      if (scenario !== 'current-failure') {
        await page.getByRole('button', { name: 'Log out', exact: true }).click();
        await expect.poll(() => logoutCalls).toBe(2); releaseCurrent();
      }
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      await expect(page).toHaveURL(`${origin}/login`); await capture('signed-out');
      await page.getByLabel('Email', { exact: true }).fill(nextActor.email);
      await page.getByLabel('Password', { exact: true }).fill('synthetic-password-not-a-live-credential');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/`);
      await page.getByRole('button', { name: 'Open admin account menu' }).click();
      await expect(page.getByText(nextActor.email, { exact: true })).toBeVisible();
      if (scenario !== 'current-failure') { releaseOld(); await expect.poll(() => oldSettled).toBe(true); }
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(`${origin}/`);
      await expect(page.getByText(nextActor.email, { exact: true })).toBeVisible();
      assert.equal(navigations.filter(value => value === '/login').length, 1, 'Obsolete Header navigated to login again');
      await capture('current-account');
      // Continue real operator support work through Header search, not a reload.
      await page.getByRole('textbox', { name: 'Search admin pages and records' }).fill('Synthetic Provider');
      await page.getByRole('button', { name: `Open Provider ${provider.businessName}`, exact: true }).click();
      await page.getByRole('textbox', { name: 'Internal note', exact: true }).fill(noteBody.body);
      await page.getByRole('button', { name: 'Save Note', exact: true }).click();
      await expect(page.getByText(noteBody.body, { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Internal note', exact: true })).toHaveValue('');
      assert.equal(storedNotes.length, 1); assert.equal(storedNotes[0].authorId, nextActor.id); await capture('fresh-note');
      assert.deepEqual(requests.filter(row => row.method === 'POST').map(row => row.path),
        scenario === 'current-failure' ? [logoutPath, '/api/v1/auth/admin/login', notesPath] : [logoutPath, logoutPath, '/api/v1/auth/admin/login', notesPath]);
      assert.deepEqual(documents, ['/']); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      report.checks.push({ ...currentEvidence, storedNotes, logoutCalls, blockedRealtimeConnections });
      releaseOld(); releaseCurrent(); await context.close(); currentPage = null; currentEvidence = null;
    }
  }
} catch (error) {
  report.failure = error.stack; report.failedScenario = currentEvidence; process.exitCode = 1;
  if (currentPage) await currentPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  releaseOld(); releaseCurrent(); await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output }));
}
