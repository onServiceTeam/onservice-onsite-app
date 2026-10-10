// Compiled admin UI with synthetic HTTP only. No production session or writes.
// Usage: node audit.mjs <compiled-admin-directory> [evidence-directory]
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence'));
await mkdir(output, { recursive: true });
const providerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const applicantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profile = {
  id: providerId, userId: applicantId, businessName: 'Synthetic Applicant Services',
  description: '', tier: 'new', status: 'pending', averageRating: 0, totalReviews: 0,
  totalJobsCompleted: 0, serviceRadiusKm: 15, yearsExperience: 5,
  vettingAnswers: { mainSkills: 'Post-build cleaning', hasOwnTools: true },
  city: 'Cebu City', province: 'Cebu', latitude: 10.32, longitude: 123.89,
  createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
  user: { id: applicantId, fullName: 'Synthetic Applicant', phone: 'Synthetic contact',
    email: null, contactMasked: true, avatarUrl: null, isVerified: false, isActive: true, lastLoginAt: null },
  documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
    avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
  categories: [], services: [], serviceAreas: [], certifications: [], portfolio: [],
};
const declarations = [
  { id: 'cleaning', name: 'Post-construction cleaning and property turnover', isActive: true },
  { id: 'painting', name: 'Painting', isActive: false },
];
const states = {
  submitted: { ...profile, declaredCategories: declarations },
  configured: { ...profile, declaredCategories: declarations, services: [{
    id: 'repair', name: 'Pipe repair', categoryName: 'Plumbing', pricingType: 'fixed',
    basePrice: 50000, hourlyRate: null, unitLabel: null, unitPrice: null, minPrice: null, maxPrice: null,
  }] },
  empty: { ...profile, declaredCategories: [] },
  older: { ...profile },
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = path.resolve(root, `.${pathname}`);
    if (!requested.startsWith(`${root}${path.sep}`) && requested !== root) { res.writeHead(403).end(); return; }
    const isFile = await stat(requested).then(value => value.isFile()).catch(() => false);
    const file = isFile ? requested : path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const pageBundle = (await readdir(path.join(root, 'assets'))).find(name => /^ProviderDetailPage-.*\.js$/.test(name));
const indexSha256 = await hash(path.join(root, 'index.html'));
const providerPageSha256 = await hash(path.join(root, 'assets', pageBundle));
// Do not relabel an arbitrary later build with this checkpoint's commit.
const knownBuild = indexSha256 === 'feaa70fb24907f6a64097b40f252e22a8b67cc126317bd5c4d943d9c4b944516'
  && providerPageSha256 === '4df4b8c5056ca11d4f2e86adb472acd6447be52192ab95ff74bb6f01fbd049a8';
const report = { sourceRevision: knownBuild ? '3ab3db17d9b29d098af20490399be812ee71b8ee' : null,
  evidenceType: 'compiled admin with synthetic HTTP, not authenticated live acceptance',
  indexSha256, providerPageSha256, checks: [], failure: null };
try {
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const [state, data] of Object.entries(states)) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-browser-fixture', url: origin }]);
      const page = await context.newPage();
      const errors = [], unexpected = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) {
          return route.continue();
        }
        requests.push({ method: request.method(), path: url.pathname });
        let body;
        if (request.method() === 'GET' && url.origin === origin) {
          if (url.pathname === '/api/v1/auth/me') body = { success: true, data: {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: 'super_admin',
            firstName: 'Synthetic', lastName: 'Reviewer', phone: '', email: null, avatarUrl: null,
          } };
          if (url.pathname === `/api/v1/admin/providers/${providerId}/profile`) body = { success: true, data };
        }
        if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        unexpected.push({ method: request.method(), path: url.pathname, origin: url.origin });
        return route.abort('blockedbyclient');
      });
      await page.goto(`${origin}/providers/${providerId}`);
      const section = page.getByRole('region', { name: 'Declared service categories' });
      await expect(section).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      if (state === 'empty') await expect(section).toContainText('No category-only selections on file.');
      else if (state === 'older') await expect(section).toContainText('Category selections are unavailable from this server.');
      else {
        await expect(section).toContainText(declarations[0].name);
        await expect(section).toContainText('Currently inactive in catalog');
      }
      await expect(section).not.toContainText('₱');
      if (state === 'configured') await expect(page.getByText('₱500.00', { exact: true })).toBeVisible();
      const bounds = await section.boundingBox();
      const layout = await section.evaluate(element => ({
        width: element.clientWidth, contentWidth: element.scrollWidth,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      const screenshot = `${width}-${state}.png`;
      await section.screenshot({ path: path.join(output, screenshot) });
      report.checks.push({ width, state, bounds, layout, screenshot, errors, unexpected, requests });
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Category region escaped viewport');
      assert.ok(layout.contentWidth <= layout.width + 1, 'Category content clipped');
      assert.equal(layout.documentOverflow, 0, 'Provider page overflowed');
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      await context.close();
    }
  }
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output }));
}
