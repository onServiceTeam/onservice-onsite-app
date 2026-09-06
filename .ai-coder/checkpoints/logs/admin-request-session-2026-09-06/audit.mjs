// Compiled Provider 360 Save Note, Header logout and LoginPage. Synthetic HTTP.
// Request authorship is derived from the browser's actual HttpOnly fixture cookie.
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
const nextActor = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', firstName: 'New', email: 'new@example.invalid' };
const providerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const profile = { id: providerId, userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  businessName: 'Synthetic Provider Record', description: '', tier: 'new', status: 'approved',
  averageRating: 0, totalReviews: 0, totalJobsCompleted: 0, serviceRadiusKm: 20, yearsExperience: null,
  vettingAnswers: null, city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', fullName: 'Synthetic Provider', phone: '+63919****888',
    email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
  documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false, avatarUrl: null,
    governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
  categories: [], declaredCategories: [], services: [], serviceAreas: [], certifications: [], portfolio: [] };
const kpis = Object.fromEntries(['revenue', 'revenueTrendPct', 'activeBookings', 'pendingDisputes', 'newSignups',
  'pendingApprovals', 'todayBookings', 'escalatedDisputes', 'staleDisputes', 'escrowBalance', 'platformRevenue',
  'guaranteeFund', 'guaranteeFundRunwayMonths'].map(key => [key, 0]));
const dashboardLists = new Set(['/api/v1/admin/dashboard/revenue-trend', '/api/v1/admin/dashboard/booking-volume',
  '/api/v1/admin/dashboard/alerts', '/api/v1/admin/dashboard/cities', '/api/v1/admin/compliance/dsr-alerts',
  '/api/v1/admin/analytics/quality-watch']);
const notesPath = `/api/v1/admin/providers/${providerId}/notes`;
const destination = `/providers/${providerId}?tab=notes`;
const refreshPath = '/api/v1/auth/admin/refresh';
const oldBody = 'Synthetic old operator note', nextBody = 'Synthetic current operator note';
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
const entry = /src="([^"]+\.js)"/.exec(index)?.[1];
assert.ok(entry);
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null, createdAt: new Date().toISOString(),
  evidenceType: 'compiled note/auth/refresh controls; synthetic HTTP and HttpOnly cookies; not production acceptance',
  indexSha256: createHash('sha256').update(index).digest('hex'),
  entrySha256: createHash('sha256').update(await readFile(path.join(root, entry))).digest('hex'), checks: [], failure: null, failedScenario: null };
let currentPage, currentEvidence;
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const scenario of ['operator-switch', 'same-owner-refresh', 'stale-rotation']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const issue = async actor => context.addCookies([{ name: 'admin_session', value: `synthetic-${actor.id}`,
        domain: '127.0.0.1', path: '/api', httpOnly: true, sameSite: 'Lax' }]);
      await issue(oldActor);
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-old-csrf', url: origin }]);
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [], storedNotes = [];
      currentEvidence = { width, scenario, requests, unexpected, errors, captures, storedNotes };
      let releaseOld;
      const oldBarrier = new Promise(resolve => { releaseOld = resolve; });
      let blockedRealtimeConnections = 0;
      await context.routeWebSocket('**/*', async socket => {
        blockedRealtimeConnections += 1;
        await socket.close({ code: 1000, reason: 'Synthetic request audit has no realtime service' });
      });
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        const headers = await request.allHeaders();
        const cookie = /(?:^|;\s*)admin_session=([^;]+)/.exec(headers.cookie ?? '')?.[1];
        const actor = [oldActor, nextActor].find(candidate => cookie === `synthetic-${candidate.id}`);
        const row = { method: request.method(), path: url.pathname, actorId: actor?.id ?? null,
          csrf: headers['x-csrf-token'] ?? null, ...(url.pathname === notesPath && request.method() === 'POST' ? { body: request.postDataJSON() } : {}) };
        requests.push(row);
        if (url.origin === origin && url.pathname.startsWith('/socket.io')) {
          blockedRealtimeConnections += 1;
          return route.fulfill({ status: 503, body: 'Realtime deliberately unavailable' });
        }
        let data, csrf;
        if (url.origin === origin && request.method() === 'GET' && actor) {
          if (url.pathname === '/api/v1/auth/me') data = actor;
          if (url.pathname === `/api/v1/admin/providers/${providerId}/profile`) data = profile;
          if (url.pathname === notesPath) data = storedNotes;
          if (url.pathname === '/api/v1/admin/dashboard/kpis') data = kpis;
          if (url.pathname === '/api/v1/admin/dashboard/acquisition-funnel') data = { registered: 0, firstBooking: 0, repeatBooking: 0 };
          if (dashboardLists.has(url.pathname)) data = [];
        }
        if (url.origin === origin && request.method() === 'POST') {
          if (url.pathname === '/api/v1/auth/admin/logout' && actor) {
            await context.clearCookies({ name: 'admin_session' });
            data = {}; csrf = 'admin_csrf=; Max-Age=0; Path=/';
          }
          if (url.pathname === '/api/v1/auth/admin/login') {
            assert.deepEqual(request.postDataJSON(), { email: nextActor.email, password: 'synthetic-test-only-not-a-credential' });
            await issue(nextActor); data = { user: nextActor, mustRotatePassword: false };
            csrf = 'admin_csrf=synthetic-new-csrf; Path=/; SameSite=Lax';
          }
          if (url.pathname === refreshPath && actor) {
            await issue(actor); data = { user: actor };
            csrf = `admin_csrf=synthetic-refreshed-${actor.id}; Path=/; SameSite=Lax`;
          }
          if (url.pathname === notesPath && actor) {
            const body = request.postDataJSON();
            assert.deepEqual(body, { body: body.body, category: 'quality', pinned: true });
            const noteWrites = requests.filter(item => item.method === 'POST' && item.path === notesPath);
            if (noteWrites.length === 1) {
              if (scenario !== 'same-owner-refresh') await oldBarrier;
              const status = scenario === 'stale-rotation' ? 428 : 401;
              return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false,
                error: { message: 'Synthetic old request rejected', ...(status === 428 ? { code: 'password_rotation_required' } : {}) } }) });
            }
            const note = { id: `eeeeeeee-eeee-4eee-8eee-${String(storedNotes.length + 1).padStart(12, '0')}`,
              body: body.body, category: body.category, pinned: body.pinned, authorId: actor.id,
              authorName: `${actor.firstName} ${actor.lastName}`, createdAt: '2026-09-06T00:00:00Z' };
            storedNotes.push(note); data = note;
          }
        }
        if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json',
          ...(csrf ? { headers: { 'Set-Cookie': csrf } } : {}), body: JSON.stringify({ success: true, data }) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin });
        return route.abort('blockedbyclient');
      });
      const capture = async stage => {
        const file = `${width}-${scenario}-${stage}.png`;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
      };
      const writeNote = async body => {
        await page.getByRole('textbox', { name: 'Internal note', exact: true }).fill(body);
        await page.getByRole('combobox', { name: 'Note category' }).selectOption('quality');
        await page.getByRole('checkbox', { name: 'Pin to top' }).check();
        await page.getByRole('button', { name: 'Save Note', exact: true }).click();
      };
      await page.goto(`${origin}${destination}`);
      await expect(page.getByRole('textbox', { name: 'Internal note', exact: true })).toBeVisible();
      await writeNote(oldBody);
      await expect.poll(() => requests.filter(row => row.method === 'POST' && row.path === notesPath).length).toBeGreaterThan(0);
      await capture('old-note');
      if (scenario !== 'same-owner-refresh') {
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        await page.getByRole('button', { name: 'Log out', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        await page.getByLabel('Email', { exact: true }).fill(nextActor.email);
        await page.getByLabel('Password', { exact: true }).fill('synthetic-test-only-not-a-credential');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await page.waitForURL(`${origin}/`);
        await page.evaluate(url => { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, destination);
        await expect(page.getByRole('textbox', { name: 'Internal note', exact: true })).toHaveValue('');
        const delivered = page.waitForResponse(result => result.request().method() === 'POST' && new URL(result.url()).pathname === notesPath);
        releaseOld(); await delivered;
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(`${origin}${destination}`);
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        await expect(page.getByText(nextActor.email, { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Open admin account menu' }).click();
        assert.equal(requests.filter(row => row.method === 'POST' && row.path === notesPath).length, 1, 'Old note replayed under the new operator');
        assert.equal(requests.filter(row => row.path === refreshPath).length, 0);
        await capture('new-owner');
        await writeNote(nextBody);
        await expect(page.getByText(nextBody, { exact: true })).toBeVisible();
        assert.equal(storedNotes.length, 1); assert.equal(storedNotes[0].authorId, nextActor.id);
        assert.equal(storedNotes[0].body, nextBody);
        await expect(page.getByText(oldBody, { exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByText(oldBody, { exact: true })).toBeVisible();
        assert.equal(storedNotes.length, 1); assert.equal(storedNotes[0].authorId, oldActor.id);
        assert.equal(requests.filter(row => row.path === refreshPath).length, 1);
        await capture('same-owner-refreshed');
      }
      await capture('saved-current-note');
      const writes = requests.filter(row => row.method === 'POST' && row.path === notesPath);
      assert.equal(writes.length, 2);
      assert.equal(writes[0].actorId, oldActor.id); assert.equal(writes[0].csrf, 'synthetic-old-csrf');
      assert.equal(writes[1].actorId, scenario === 'same-owner-refresh' ? oldActor.id : nextActor.id);
      assert.equal(writes[1].csrf, scenario === 'same-owner-refresh' ? `synthetic-refreshed-${oldActor.id}` : 'synthetic-new-csrf');
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      report.checks.push({ ...currentEvidence, documentOverflow, blockedRealtimeConnections });
      await context.close(); currentPage = null; currentEvidence = null;
    }
  }
} catch (error) {
  report.failure = error.stack; report.failedScenario = currentEvidence; process.exitCode = 1;
  if (currentPage) await currentPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output }));
}
