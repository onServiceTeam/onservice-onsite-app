// Compiled customer operator page; synthetic HTTP only, no financial/status writes.
// Usage: node audit.mjs <compiled-admin-directory> <new-evidence-directory>
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const ids = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
const profiles = ids.map((id, index) => ({ id, firstName: 'Synthetic',
  lastName: `${index ? 'Beta' : 'Alpha'} Customer`, fullName: `Synthetic ${index ? 'Beta' : 'Alpha'} Customer`,
  phone: `+63918****${index ? '222' : '111'}`, email: null, contactMasked: true, avatarUrl: null,
  isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z', lifetimeBookings: 0, lifetimeSpent: 0,
  activeBookings: 0, openDisputes: 0, averageRatingGiven: null, totalReviewsGiven: 0,
  addresses: [], sukiProviders: [] }));
const payments = { walletAvailable: 0, walletPending: 0, recentTransactions: [], recentPaymentIntents: [], paymentMethodCounts: {} };
const disputes = { rows: [], total: 0, page: 1, pageSize: 20, fraudPattern: {
  disputesInWindow: 3, windowDays: 30, favorProviderRate: null, flagged: true, reason: 'Synthetic pattern needing human review' } };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = path.resolve(root, `.${pathname}`);
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const isFile = await stat(requested).then(value => value.isFile()).catch(() => false);
    const file = isFile ? requested : path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const bundle = (await readdir(path.join(root, 'assets'))).find(name => /^CustomerDetailPage-.*\.js$/.test(name));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null, createdAt: new Date().toISOString(),
  evidenceType: 'compiled admin browser with synthetic HTTP; not authenticated live acceptance',
  indexSha256: await hash(path.join(root, 'index.html')), customerPageSha256: await hash(path.join(root, 'assets', bundle)),
  checks: [], failure: null };
let currentPage;
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const scenario of ['reveal', 'delayed-reveal', 'wallet', 'status', 'session', 'fraud']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-customer-audit', url: origin }]);
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [];
      let releaseReveal;
      const barrier = new Promise(resolve => { releaseReveal = resolve; });
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        requests.push({ method: request.method(), path: url.pathname });
        let data;
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/v1/auth/me') data = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            role: scenario.includes('reveal') ? 'admin' : 'super_admin', firstName: 'Synthetic', lastName: 'Operator', phone: '', email: null, avatarUrl: null };
          for (const profile of profiles) {
            if (url.pathname === `/api/v1/admin/customers/${profile.id}`) data = profile;
            if (url.pathname === `/api/v1/admin/customers/${profile.id}/payments`) data = payments;
            if (url.pathname === `/api/v1/admin/customers/${profile.id}/disputes`) data = disputes;
          }
        }
        if (url.origin === origin && request.method() === 'POST' && url.pathname.endsWith('/reveal-contact')) {
          const index = ids.findIndex(id => url.pathname === `/api/v1/admin/customers/${id}/reveal-contact`);
          if (index >= 0) {
            if (!index && scenario === 'delayed-reveal') await barrier;
            data = { phone: index ? '+639180002222' : '+639180001111', email: index ? null : 'alpha.customer@example.invalid' };
          }
        }
        if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin });
        return route.abort('blockedbyclient');
      });
      const tab = scenario === 'wallet' ? '?tab=payments' : scenario === 'fraud' ? '?tab=disputes' : '';
      const destination = index => `/customers/${ids[index]}${tab}`;
      const navigate = async index => {
        await page.evaluate(url => { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, destination(index));
        await expect(page.getByRole('heading', { name: profiles[index].fullName, includeHidden: true })).toBeAttached();
      };
      const capture = async stage => {
        const file = `${width}-${scenario}-${stage}.png`;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(output, file), fullPage: true }); captures.push(file);
      };
      const openDecision = async () => {
        if (scenario === 'status') {
          await page.getByRole('button', { name: 'Manage status', exact: true }).click();
          await page.getByRole('button', { name: 'Suspend', exact: true }).click();
        } else await page.getByRole('button', { name: scenario === 'session' ? 'Force sign-out' : 'Flag for fraud review', exact: true }).click();
      };
      const reasonLabel = scenario === 'status' ? 'Suspension reason' : scenario === 'session' ? 'Security or support reason' : 'Fraud-review reason';
      await page.goto(`${origin}${destination(1)}`);
      await expect(page.getByRole('heading', { name: profiles[1].fullName })).toBeVisible();
      if (scenario === 'wallet') await expect(page.getByRole('spinbutton', { name: 'Amount (PHP)' })).toBeVisible();
      if (scenario === 'fraud') await expect(page.getByRole('button', { name: 'Flag for fraud review' })).toBeVisible();
      await navigate(0);
      if (scenario.includes('reveal')) {
        await page.getByRole('button', { name: 'Reveal contact' }).click();
        await expect.poll(() => requests.filter(row => row.method === 'POST').length).toBe(1);
        if (scenario === 'reveal') await expect(page.getByText('+639180001111', { exact: true })).toBeVisible();
      } else if (scenario === 'wallet') {
        await page.getByRole('spinbutton', { name: 'Amount (PHP)' }).fill('100.00');
        await page.getByRole('textbox', { name: 'Reason (min 5 chars)' }).fill('Synthetic Alpha-only adjustment draft');
        await expect(page.getByRole('button', { name: 'Submit wallet adjustment' })).toBeEnabled();
      } else {
        await openDecision();
        await page.getByRole('textbox', { name: reasonLabel }).fill('Synthetic Alpha-only support case details');
      }
      await capture('alpha');
      const readsBefore = requests.filter(row => row.path === `/api/v1/admin/customers/${ids[1]}`).length;
      await navigate(1);
      if (scenario === 'delayed-reveal') {
        const completed = page.waitForResponse(response => response.url().endsWith(`/${ids[0]}/reveal-contact`));
        releaseReveal(); await completed;
      }
      await capture('beta');
      if (scenario.includes('reveal')) {
        await expect(page.getByText('+639180001111', { exact: true })).toHaveCount(0);
        await expect(page.getByText('alpha.customer@example.invalid', { exact: true })).toHaveCount(0);
        await expect(page.getByText('+63918****222', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Reveal contact' }).click();
        await expect(page.getByText('+639180002222', { exact: true })).toBeVisible();
      } else if (scenario === 'wallet') {
        await expect(page.getByRole('spinbutton', { name: 'Amount (PHP)' })).toHaveValue('');
        await expect(page.getByRole('textbox', { name: 'Reason (min 5 chars)' })).toHaveValue('');
        await expect(page.getByRole('button', { name: 'Submit wallet adjustment' })).toBeDisabled();
      } else {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        if (scenario === 'status') await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toHaveCount(0);
        await openDecision();
        if (scenario === 'status') await expect(page.getByRole('dialog', { name: `Suspend ${profiles[1].fullName}?` })).toBeVisible();
        if (scenario === 'session') await expect(page.getByRole('dialog', { name: `Force ${profiles[1].fullName} to sign in again?` })).toBeVisible();
        await expect(page.getByRole('textbox', { name: reasonLabel })).toHaveValue('');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      const readsAfter = requests.filter(row => row.path === `/api/v1/admin/customers/${ids[1]}`).length;
      assert.equal(readsBefore, 1); assert.equal(readsAfter, readsBefore, 'Return did not use the warm customer cache');
      assert.deepEqual(requests.filter(row => row.method !== 'GET' && !row.path.endsWith('/reveal-contact')), []);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      report.checks.push({ width, scenario, captures, readsBefore, readsAfter, requests, unexpected, errors, documentOverflow });
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
