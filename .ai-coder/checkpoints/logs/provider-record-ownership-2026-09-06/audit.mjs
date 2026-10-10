// Real compiled admin, real client-side history/cache, synthetic HTTP only.
// No production session, wallet submission, suspension or external requests.
// Usage: node audit.mjs <compiled-admin-directory> <new-evidence-directory>
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const profiles = ids.map((id, index) => ({
  id, userId: `user-${id}`, businessName: `Synthetic ${index ? 'Beta' : 'Alpha'} Services`,
  description: '', tier: 'new', status: 'approved', averageRating: 0, totalReviews: 0,
  totalJobsCompleted: 0, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
  city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  user: { id: `user-${id}`, fullName: `Synthetic ${index ? 'Beta' : 'Alpha'}`,
    phone: `+63917****${index ? '222' : '111'}`, email: null, contactMasked: true,
    avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
  documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
    avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
  categories: [], declaredCategories: [], services: [], serviceAreas: [], certifications: [], portfolio: [],
}));
const financials = { totalEarned: 0, totalCommissionPaid: 0, walletAvailable: 0,
  walletPending: 0, monthlyEarnings: [], recentPayouts: [] };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
const bundle = (await readdir(path.join(root, 'assets'))).find(name => /^ProviderDetailPage-.*\.js$/.test(name));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const report = { sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? null,
  evidenceType: 'compiled browser with synthetic HTTP; not live acceptance',
  createdAt: new Date().toISOString(), indexSha256: await hash(path.join(root, 'index.html')),
  providerPageSha256: await hash(path.join(root, 'assets', bundle)), checks: [], failure: null };
let currentPage;
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const scenario of ['reveal', 'delayed-reveal', 'note', 'decision', 'wallet']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-record-audit', url: origin }]);
      const page = currentPage = await context.newPage();
      const requests = [], unexpected = [], errors = [], captures = [];
      let releaseReveal;
      const revealBarrier = new Promise(resolve => { releaseReveal = resolve; });
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
        requests.push({ method: request.method(), path: url.pathname });
        let data;
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/v1/auth/me') data = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            role: scenario.includes('reveal') ? 'admin' : 'super_admin', firstName: 'Synthetic', lastName: 'Operator', phone: '', email: null, avatarUrl: null };
          for (const profile of profiles) {
            if (url.pathname === `/api/v1/admin/providers/${profile.id}/profile`) data = profile;
            if (url.pathname === `/api/v1/admin/providers/${profile.id}/financials`) data = financials;
            if (url.pathname === `/api/v1/admin/providers/${profile.id}/notes`) data = [];
          }
        }
        if (url.origin === origin && request.method() === 'POST' && url.pathname.endsWith('/reveal-contact')) {
          const index = ids.findIndex(id => url.pathname === `/api/v1/admin/providers/${id}/reveal-contact`);
          if (index >= 0) {
            if (!index && scenario === 'delayed-reveal') await revealBarrier;
            data = { phone: index ? '+639170002222' : '+639170001111', email: index ? null : 'alpha@example.invalid' };
          }
        }
        if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin });
        return route.abort('blockedbyclient');
      });
      const tab = scenario === 'note' ? '?tab=notes' : scenario === 'wallet' ? '?tab=financials' : '';
      const destination = index => `/providers/${ids[index]}${tab}`;
      const navigate = async index => {
        await page.evaluate(url => { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, destination(index));
        await expect(page.getByRole('heading', { name: profiles[index].businessName, includeHidden: true })).toBeAttached();
      };
      const capture = async stage => {
        const file = `${width}-${scenario}-${stage}.png`;
        // Focus/clicks can scroll the window. Reset before a full-page capture
        // so sticky application chrome is not photographed mid-document.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        captures.push(file);
      };
      // Prime Beta through the actual application, then open Alpha without reload.
      await page.goto(`${origin}${destination(1)}`);
      await expect(page.getByRole('heading', { name: profiles[1].businessName })).toBeVisible();
      if (scenario === 'wallet') await expect(page.getByRole('button', { name: 'Adjust Wallet' })).toBeVisible();
      if (scenario === 'note') await expect(page.getByRole('textbox', { name: 'Internal note' })).toBeVisible();
      await navigate(0);
      if (scenario.includes('reveal')) {
        await page.getByRole('button', { name: 'Reveal contact' }).click();
        await expect.poll(() => requests.filter(row => row.method === 'POST').length).toBe(1);
        if (scenario === 'reveal') await expect(page.getByText('+639170001111', { exact: true })).toBeVisible();
      } else if (scenario === 'note') {
        await page.getByRole('textbox', { name: 'Internal note' }).fill('Synthetic Alpha-only case details');
        await page.getByRole('combobox', { name: 'Note category' }).selectOption('quality');
        await page.getByRole('checkbox', { name: 'Pin to top' }).check();
      } else if (scenario === 'decision') {
        await page.getByRole('button', { name: 'Suspend provider', exact: true }).click();
        await page.getByRole('textbox', { name: 'Suspension reason' }).fill('Synthetic Alpha-only security case');
      } else {
        await page.getByRole('button', { name: 'Adjust Wallet' }).click();
        await page.getByRole('spinbutton', { name: 'Wallet adjustment amount in PHP' }).fill('100.00');
        await page.getByRole('textbox', { name: 'Wallet adjustment reason' }).fill('Synthetic Alpha-specific adjustment draft');
      }
      await capture('alpha');
      const betaReadsBefore = requests.filter(row => row.path === `/api/v1/admin/providers/${ids[1]}/profile`).length;
      await navigate(1);
      if (scenario === 'delayed-reveal') {
        const completed = page.waitForResponse(response => response.url().endsWith(`/${ids[0]}/reveal-contact`));
        releaseReveal(); await completed;
      }
      await capture('beta');
      if (scenario.includes('reveal')) {
        await expect(page.getByText('+639170001111', { exact: true })).toHaveCount(0);
        await expect(page.getByText('alpha@example.invalid', { exact: true })).toHaveCount(0);
        await expect(page.getByText('+63917****222', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Reveal contact' }).click();
        await expect(page.getByText('+639170002222', { exact: true })).toBeVisible();
      } else if (scenario === 'note') {
        await expect(page.getByRole('textbox', { name: 'Internal note' })).toHaveValue('');
        await expect(page.getByRole('combobox', { name: 'Note category' })).toHaveValue('general');
        await expect(page.getByRole('checkbox', { name: 'Pin to top' })).not.toBeChecked();
        await expect(page.getByRole('button', { name: 'Save Note' })).toBeDisabled();
      } else if (scenario === 'decision') {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByRole('button', { name: 'Suspend provider', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Suspend Synthetic Beta Services?' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Suspension reason' })).toHaveValue('');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      } else {
        await expect(page.getByRole('spinbutton', { name: 'Wallet adjustment amount in PHP' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Adjust Wallet' }).click();
        await expect(page.getByRole('spinbutton', { name: 'Wallet adjustment amount in PHP' })).toHaveValue('');
        await expect(page.getByRole('textbox', { name: 'Wallet adjustment reason' })).toHaveValue('');
        await expect(page.getByRole('button', { name: 'Submit Adjustment' })).toBeDisabled();
      }
      const betaReadsAfter = requests.filter(row => row.path === `/api/v1/admin/providers/${ids[1]}/profile`).length;
      assert.equal(betaReadsAfter, betaReadsBefore, 'Beta was not served from the warm query cache');
      assert.equal(betaReadsBefore, 1);
      assert.deepEqual(requests.filter(row => row.method !== 'GET' && !row.path.endsWith('/reveal-contact')), []);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      // Report layout separately. Ownership verification does not certify design parity.
      const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      report.checks.push({ width, scenario, betaReadsBefore, betaReadsAfter, captures, requests, unexpected, errors, documentOverflow });
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
