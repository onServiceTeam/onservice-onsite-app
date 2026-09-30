/** UX-1377 isolated compiled-app acceptance. Run after building and starting a loopback
 * Vite preview. Every API response is synthetic; this is not server acceptance,
 * live authentication, a Stitch baseline, or permission to deploy.
 * ADMIN_PREVIEW_URL defaults to http://127.0.0.1:17482.
 */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = new URL(process.env.ADMIN_PREVIEW_URL ?? 'http://127.0.0.1:17482');
assert.equal(origin.protocol, 'http:');
assert.equal(origin.hostname, '127.0.0.1');
assert.equal(origin.pathname, '/');
const out = path.resolve(import.meta.dirname, '../../../../qa-frameworks/session-audit-2026-09-06/provider-submission-browser');
await mkdir(out, { recursive: true });
const providerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const revisionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const base = `/api/v1/admin/providers/${providerId}/application-revisions`;
const at = '2026-09-06T02:02:00.000Z';
const user = { id: '11111111-1111-4111-8111-111111111111', role: 'admin',
  firstName: 'Synthetic', lastName: 'Reviewer', phone: '+639170000000', email: 'reviewer@example.invalid', avatarUrl: null };
const profile = {
  id: providerId, userId: '22222222-2222-4222-8222-222222222222', businessName: 'Current Cebu Services',
  description: '', status: 'approved', tier: 'new', averageRating: 0, totalReviews: 0, totalJobsCompleted: 0,
  serviceRadiusKm: 50, yearsExperience: 12, vettingAnswers: { mainSkills: 'Current profile skills' },
  city: 'Cebu City', province: 'Cebu', latitude: 10.3, longitude: 123.9, createdAt: at, updatedAt: at,
  user: { id: '22222222-2222-4222-8222-222222222222', fullName: 'Synthetic Provider', phone: '+63917****000',
    email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: at },
  documents: { governmentIdUrl: null, governmentIdBackUrl: null, nbiClearanceUrl: null, selfieUrl: null,
    nbiExpiryDate: null, nbiExpiryNotified: false, avatarUrl: null },
  categories: [], declaredCategories: [], services: [], serviceAreas: [], certifications: [], portfolio: [],
};
const revision = {
  id: revisionId, revisionNumber: 1, previousRevisionNumber: null, schemaVersion: 1,
  businessName: 'Original Cebu Services', serviceRadiusKm: 25, latitude: 10.3157, longitude: 123.8854,
  city: 'Cebu City', province: 'Cebu', serviceArea: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Original Metro Cebu market' },
  categories: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Original cleaning category' }],
  nbiExpiryDate: '2027-02-03', governmentIdNumber: 'SYNTHETIC-ID-001', yearsExperience: 0,
  vettingAnswers: { mainSkills: 'Post-construction cleaning.\nDetailed original applicant explanation kept on separate lines.',
    hasOwnTools: false, businessType: 'Individual', yearStarted: '2026', teamSize: '1',
    fullAddress: 'Synthetic original operating address, Cebu City, Cebu',
    website: `https://example.invalid/${'long-submitted-link-'.repeat(30)}`, facebook: 'https://example.invalid/profile',
    credentials: 'Original training details', registrations: 'Original registration', socialOther: 'Not supplied', resumeUrl: 'https://example.invalid/resume',
    references: [{ name: 'Synthetic Client', contact: 'reference@example.invalid', relation: 'Former customer' }] },
  agreementAcceptedAt: at, submittedAt: at, recordedAt: at,
  documents: Object.fromEntries(['government_id_front', 'government_id_back', 'nbi_clearance', 'selfie']
    .map(type => [type, `${base}/${revisionId}/kyc/${type}`])),
};
it('Bug UX-1377 — submitted application review keeps a readable stacked header on narrow browsers', async () => {
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const unexpected = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addCookies([{ name: 'admin_csrf', value: 'synthetic-not-a-live-credential', url: origin.origin }]);
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push(`${request.method()} ${url.pathname}${url.search}`);
      let data;
      if (request.method() !== 'GET') unexpected.push(requests.at(-1));
      else if (url.pathname === '/api/v1/auth/me') data = user;
      else if (url.pathname === `/api/v1/admin/providers/${providerId}/profile`) data = profile;
      else if (url.pathname === base) data = { providerId, currentStatus: 'approved', historyState: 'recorded',
        revisions: [{ id: revisionId, revisionNumber: 1, submittedAt: at }], nextBeforeRevision: null };
      else if (url.pathname === `${base}/${revisionId}`) data = { providerId, currentStatus: 'approved', revision };
      else if (url.pathname === `${base}/${revisionId}/kyc/government_id_front`) {
        await route.fulfill({ contentType: 'image/png', headers: { 'Cache-Control': 'private, no-store' },
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVscAAAAASUVORK5CYII=', 'base64') });
        return;
      } else unexpected.push(requests.at(-1));
      await route.fulfill({ status: data === undefined ? 503 : 200, contentType: 'application/json',
        body: JSON.stringify(data === undefined ? { success: false, error: { message: 'Unexpected synthetic request' } } : { success: true, data }) });
    });
    await page.goto(`${origin.origin}/providers/${providerId}`);
    const open = page.getByRole('button', { name: 'Review submitted applications' });
    await expect(open).toBeEnabled();
    assert(!requests.some(request => request.includes('application-revisions')));
    await open.focus();
    await page.keyboard.press('Enter');
    const select = page.getByRole('button', { name: 'View submission 1' });
    await expect(select).toBeVisible();
    await select.focus();
    await page.keyboard.press('Space');
    const evidence = page.getByRole('region', { name: 'Submission 1 as submitted' });
    await expect(evidence).toBeVisible();
    await expect(evidence.getByText('Original Cebu Services', { exact: true })).toBeVisible();
    await expect(evidence.getByText(revision.vettingAnswers.website, { exact: true })).toBeVisible();
    await expect(evidence.getByRole('link')).toHaveCount(0);
    if (width === 390) {
      const explanation = await page.getByText('Review preserved submission records separately from the current profile below. Later profile edits do not rewrite these records.', { exact: true }).boundingBox();
      const close = await page.getByRole('button', { name: 'Close submitted applications' }).boundingBox();
      assert(explanation && close && close.y >= explanation.y + explanation.height,
        'narrow history header must stack its action below the readable explanation');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `page overflow at ${width}`);
    const controls = await evidence.getByRole('button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert(controls.every(height => height >= 44), `small document targets at ${width}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, `submission-${width}.png`), fullPage: true });
    const load = evidence.getByRole('button', { name: 'Load submitted Government ID (front)' });
    await load.focus();
    await page.keyboard.press('Enter');
    const image = evidence.getByRole('img', { name: 'Submitted Government ID (front)' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBe(1);
    await evidence.getByRole('button', { name: 'Close Government ID (front) preview' }).click();
    await expect(image).toHaveCount(0);
    await page.getByRole('button', { name: 'Close submitted applications' }).click();
    await expect(evidence).toHaveCount(0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ width, passed: true, requests, screenshot: path.join(out, `submission-${width}.png`) }));
    await context.close();
  }
} finally { await browser.close(); }
});
