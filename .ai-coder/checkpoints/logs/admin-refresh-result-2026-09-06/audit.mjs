// Actual compiled Provider 360 note controls and auth destinations. Synthetic HTTP.
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
const notesPath = `/api/v1/admin/providers/${id}/notes`, refreshPath = '/api/v1/auth/admin/refresh';
const destination = `/providers/${id}?tab=notes`, draft = 'Synthetic support note draft';
const expectedBody = { body: draft, category: 'quality', pinned: true };
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
  evidenceType: 'compiled note errors, refresh and auth destinations; synthetic HTTP; not live acceptance',
  indexSha256: createHash('sha256').update(index).digest('hex'),
  entrySha256: createHash('sha256').update(await readFile(path.join(root, entry))).digest('hex'),
  checks: [], failure: null, failedScenario: null };
let currentPage, currentEvidence;
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const outcome of ['conflict', 'forbidden', 'server-error', 'transport-error', 'rotation', 'unauthorized', 'refresh-rejected']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-original-csrf', url: origin },
        { name: 'admin_session', value: 'synthetic-operator-session', domain: '127.0.0.1', path: '/api', httpOnly: true }]);
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [], navigations = [], documentNavigations = [];
      currentEvidence = { width, outcome, requests, unexpected, errors, captures, navigations, documentNavigations };
      const rejection = `Synthetic ${outcome}: check the current provider record.`;
      const status = { conflict: 409, forbidden: 403, 'server-error': 500, rotation: 428, unauthorized: 401 }[outcome];
      let attempted = 0, correctedByOperator = false, blockedRealtimeConnections = 0, authRejected = false;
      const storedNotes = [];
      await context.routeWebSocket('**/*', async socket => {
        blockedRealtimeConnections += 1; await socket.close({ code: 1000, reason: 'No realtime service in this fixture' });
      });
      page.on('pageerror', error => errors.push(error.message));
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname); });
      page.on('request', request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations.push(new URL(request.url()).pathname);
      });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        const headers = await request.allHeaders();
        const row = { method: request.method(), path: url.pathname, csrf: headers['x-csrf-token'] ?? null,
          ...(url.pathname === notesPath && request.method() === 'POST' ? { body: request.postDataJSON() } : {}) };
        requests.push(row);
        if (url.origin === origin && url.pathname.startsWith('/socket.io')) {
          blockedRealtimeConnections += 1; return route.fulfill({ status: 503, body: 'Realtime intentionally unavailable' });
        }
        const fail = (code, message) => route.fulfill({ status: code, contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message, ...(code === 428 ? { code: 'password_rotation_required' } : {}) } }) });
        let data, csrf;
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/v1/auth/me') {
            if (authRejected) return fail(401, 'Synthetic session remains invalid at bootstrap');
            data = actor;
          }
          if (url.pathname === `/api/v1/admin/providers/${id}/profile`) data = provider;
          if (url.pathname === notesPath) data = storedNotes;
          if (url.pathname === '/api/v1/admin/dashboard/kpis') data = kpis;
          if (url.pathname === '/api/v1/admin/dashboard/acquisition-funnel') data = { registered: 0, firstBooking: 0, repeatBooking: 0 };
          if (dashboardLists.has(url.pathname)) data = [];
        }
        if (url.origin === origin && request.method() === 'POST') {
          if (url.pathname === refreshPath) {
            if (outcome === 'refresh-rejected' || authRejected) {
              authRejected = true;
              return fail(401, 'Synthetic refresh rejected');
            }
            data = { user: actor }; csrf = 'admin_csrf=synthetic-refreshed-csrf; Path=/; SameSite=Lax';
          }
          if (url.pathname === notesPath) {
            assert.deepEqual(row.body, expectedBody); attempted += 1;
            if (attempted === 1) return fail(401, 'Synthetic expired access token');
            if (!correctedByOperator) {
              if (outcome === 'transport-error') return route.abort('failed');
              if (outcome === 'unauthorized') authRejected = true;
              return fail(status, rejection);
            }
            const cookie = /(?:^|;\s*)admin_session=([^;]+)/.exec(headers.cookie ?? '')?.[1];
            assert.equal(cookie, 'synthetic-operator-session');
            const note = { ...expectedBody, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              authorId: actor.id, authorName: 'Synthetic Operator', createdAt: '2026-09-06T00:00:00Z' };
            storedNotes.push(note); data = note;
          }
        }
        if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json',
          ...(csrf ? { headers: { 'Set-Cookie': csrf } } : {}), body: JSON.stringify({ success: true, data }) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin }); return route.abort('blockedbyclient');
      });
      const capture = async stage => {
        const file = `${width}-${outcome}-${stage}.png`;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
      };
      await page.goto(`${origin}${destination}`);
      await page.getByRole('textbox', { name: 'Internal note', exact: true }).fill(draft);
      await page.getByRole('combobox', { name: 'Note category' }).selectOption('quality');
      await page.getByRole('checkbox', { name: 'Pin to top' }).check();
      await capture('draft');
      await page.getByRole('button', { name: 'Save Note', exact: true }).click();
      const businessError = ['conflict', 'forbidden', 'server-error', 'transport-error'].includes(outcome);
      if (businessError) {
        await expect(page.getByRole('alert')).toHaveText(outcome === 'transport-error' ? /Failed to fetch/ : rejection);
        await expect(page).toHaveURL(`${origin}${destination}`);
        await expect(page.getByRole('textbox', { name: 'Internal note', exact: true })).toHaveValue(draft);
        await expect(page.getByRole('combobox', { name: 'Note category' })).toHaveValue('quality');
        await expect(page.getByRole('checkbox', { name: 'Pin to top' })).toBeChecked();
        await expect(page.getByRole('button', { name: 'Save Note', exact: true })).toBeEnabled();
        assert.equal(storedNotes.length, 0); await capture('actual-error');
        correctedByOperator = true;
        await page.getByRole('button', { name: 'Save Note', exact: true }).click();
        await expect(page.getByText(draft, { exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Internal note', exact: true })).toHaveValue('');
        assert.equal(storedNotes.length, 1); assert.equal(storedNotes[0].authorId, actor.id);
        await expect(page.getByRole('alert')).toHaveCount(0);
      } else if (outcome === 'rotation') {
        await expect(page).toHaveURL(`${origin}/change-password`);
        await expect(page.getByRole('heading', { name: 'Change password', exact: true })).toBeVisible();
        assert.equal(storedNotes.length, 0);
      } else {
        await expect(page).toHaveURL(`${origin}/login`);
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        await page.waitForLoadState('networkidle');
        assert.equal(documentNavigations.filter(url => url === '/login').length, 1, 'Repeated full login reload');
        assert.equal(storedNotes.length, 0);
      }
      await capture('settled');
      const writes = requests.filter(row => row.method === 'POST');
      // The fresh login document performs its own single bootstrap/refresh;
      // that is distinct from replaying the failed original business request.
      assert.deepEqual(writes.map(row => row.path), outcome === 'refresh-rejected' ? [notesPath, refreshPath, refreshPath]
        : outcome === 'unauthorized' ? [notesPath, refreshPath, notesPath, refreshPath]
        : businessError ? [notesPath, refreshPath, notesPath, notesPath] : [notesPath, refreshPath, notesPath]);
      assert.equal(writes[0].csrf, 'synthetic-original-csrf'); assert.equal(writes[1].csrf, 'synthetic-original-csrf');
      for (const row of writes.slice(2)) assert.equal(row.csrf, outcome === 'refresh-rejected' ? 'synthetic-original-csrf' : 'synthetic-refreshed-csrf');
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      report.checks.push({ ...currentEvidence, storedNotes, blockedRealtimeConnections, documentOverflow });
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
