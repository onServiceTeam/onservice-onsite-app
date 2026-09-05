// Actual compiled UI, synthetic owner-bound HTTP. This is NOT a database or production test.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const bundle = await realpath(process.argv[2]);
const output = path.resolve(process.argv[3]);
const index = await readFile(path.join(bundle, 'index.html'));
const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/mobile/assets/notification-icon.png');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let target = path.resolve(bundle, `.${pathname}`);
    if (target !== bundle && !target.startsWith(`${bundle}${path.sep}`)) throw new Error('Outside bundle');
    if (pathname === '/' || pathname.startsWith('/provider-onboarding/')) target = path.join(bundle, 'index.html');
    res.writeHead(200, { 'content-type': mime[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(target));
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const applicant = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', phone: '+639170000001', email: null,
  firstName: 'Synthetic', lastName: 'Applicant', avatarUrl: null, role: 'customer' };
const category = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', slug: 'cleaning', name: 'Cleaning', description: 'Synthetic catalog', iconUrl: null, displayOrder: 1 };
const area = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu',
  centerLat: 10.3157, centerLng: 123.8854, radiusKm: 35, status: 'active' };
const results = [];
let browser;

async function runFlow(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce',
    geolocation: { latitude: 10.3157, longitude: 123.8854 }, permissions: ['geolocation'] });
  const record = { width, passed: false, screens: [], requests: [], pageErrors: [], consoleErrors: [], unmatched: [], assertions: [] };
  let draft = null, submitted = false, uploadCount = 0, applyCount = 0, failSave = false;
  await context.addInitScript(user => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'synthetic-application-access');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'synthetic-application-refresh');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, applicant);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname, method = request.method();
    if (!pathname.startsWith('/api/v1/')) {
      if (url.origin === base) return route.continue();
      record.unmatched.push(request.url());
      return route.abort();
    }
    record.requests.push(`${method} ${pathname}`);
    let status = 200, data, error;
    if (pathname === '/api/v1/config' && method === 'GET') data = {};
    else if (pathname === '/api/v1/catalog' && method === 'GET') data = [category];
    else if (pathname === '/api/v1/service-areas/provider-markets' && method === 'GET') data = [area];
    else if (pathname === '/api/v1/providers/application-status' && method === 'GET') data = submitted ? { status: 'pending', rejectionReason: null } : null;
    else if (pathname === '/api/v1/providers/application-draft') {
      const input = method === 'GET' ? null : request.postDataJSON();
      if (submitted) { status = 409; error = { code: 'provider_application_already_submitted', message: 'Application already submitted' }; }
      else if (method === 'GET') data = draft;
      else if (failSave && method === 'PUT') { failSave = false; status = 503; error = { code: 'AUDIT_UNAVAILABLE', message: 'Synthetic save unavailable. Please retry.' }; }
      else if (input?.expectedRevision !== (draft?.revision ?? null)) { status = 409; error = { code: 'provider_application_draft_conflict', message: 'Draft changed' }; }
      else if (method === 'PUT') {
        const now = new Date().toISOString();
        draft = { revision: randomUUID(), fields: input.fields, createdAt: draft?.createdAt ?? now,
          savedAt: now, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() };
        data = draft;
      } else if (method === 'DELETE') { draft = null; status = 204; }
      else { status = 501; record.unmatched.push(`${method} ${pathname}`); }
    } else if (pathname === '/api/v1/uploads' && method === 'POST') {
      uploadCount++;
      // Assert actual browser multipart preparation, without retaining image bytes.
      const multipart = request.postDataBuffer()?.toString('latin1') ?? '';
      if (!multipart.includes('name="context"\r\n\r\nonboarding') || !multipart.includes('name="files"')) {
        status = 400; error = { code: 'AUDIT_BAD_MULTIPART', message: 'Missing onboarding image multipart' };
      } else data = [{ id: randomUUID(), url: `onboarding/${applicant.id}/synthetic-${uploadCount}.png`,
        filename: 'synthetic.png', mimeType: 'image/png', sizeBytes: 1024 }];
    } else if (pathname === '/api/v1/providers/apply' && method === 'POST') {
      applyCount++;
      const input = request.postDataJSON();
      try {
        assert(draft && !submitted, 'Active draft required');
        assert.equal(input.draftRevision, draft.revision);
        assert.equal(input.icAgreementAccepted, true);
        const { draftRevision, icAgreementAccepted, ...fields } = input;
        assert.deepEqual({ nbiExpiryDate: null, governmentIdNumber: null, yearsExperience: null, ...fields }, draft.fields);
        assert.equal(fields.businessName, 'Synthetic Cleaning Services');
        assert.deepEqual(fields.categoryIds, [category.id]);
        assert.equal(fields.serviceAreaId, area.id);
        assert.equal(fields.latitude, area.centerLat);
        assert.equal(fields.longitude, area.centerLng);
        assert.equal(fields.yearsExperience, 8);
        assert.equal(fields.vettingAnswers.references[0].name, 'Synthetic Reference');
        assert.equal(fields.vettingAnswers.references.length, 1);
        for (const key of ['governmentIdFrontUrl', 'governmentIdBackUrl', 'nbiClearanceUrl', 'selfieUrl']) assert(fields[key].startsWith(`onboarding/${applicant.id}/`));
        record.assertions.push('Final POST matches the saved revision and all six-step fields, including private upload references and consent.');
        submitted = true; draft = null; status = 201; data = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
      } catch (failure) { record.submissionMismatch = failure.message; status = 400; error = { code: 'AUDIT_SUBMISSION_MISMATCH', message: failure.message }; }
    } else { status = 501; record.unmatched.push(`${method} ${pathname}`); }
    await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(error ? { success: false, error } : { success: true, data }) });
  });
  const page = await context.newPage();
  const watch = target => {
    target.on('pageerror', error => record.pageErrors.push(error.message));
    target.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
  };
  watch(page);
  const continueStep = async () => { await page.getByRole('button', { name: 'Save & continue', exact: true }).click(); };
  const saved = async target => { await expect(target.getByText('All displayed details are saved as a draft.', { exact: true })).toBeVisible(); };
  const imageUpload = async label => {
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: label }).click();
    await (await choosing).setFiles(fixture);
  };
  const capture = async (step, title) => {
    const heading = page.getByText(title, { exact: true }).first();
    await expect(heading).toBeVisible();
    await heading.scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await document.fonts.ready; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const screenshot = `${width}-${step}.png`;
    const screen = { step, path: new URL(page.url()).pathname, overflow, screenshot };
    record.screens.push(screen);
    await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled', caret: 'hide' });
    assert(overflow <= 1, `${step}: horizontal overflow ${overflow}`);
  };
  try {
    await page.goto(`${base}/provider-onboarding/role-select`);
    await capture('01-role', 'How would you like to use onService?');
    await page.getByText('I provide services', { exact: true }).click();
    const name = page.getByPlaceholder("e.g. Juan's Plumbing");
    await name.fill('Synthetic Cleaning Services');
    await page.getByRole('checkbox', { name: 'Cleaning service category' }).click();
    failSave = true;
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Synthetic save unavailable');
    await expect(name).toHaveValue('Synthetic Cleaning Services');
    assert.equal(draft, null);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await saved(page);
    await page.reload();
    await expect(name).toHaveValue('Synthetic Cleaning Services');
    await expect(page.getByRole('checkbox', { name: 'Cleaning service category' })).toBeChecked();
    record.assertions.push('Failed save retains fields; explicit retry and full browser reload recover the saved name/category.');
    await capture('02-categories', 'Your Services');
    // Two actual pages share the synthetic server record, not client stores.
    const other = await context.newPage();
    watch(other);
    await other.goto(`${base}/provider-onboarding/categories`);
    await other.getByPlaceholder("e.g. Juan's Plumbing").fill('Saved from the other browser tab');
    await other.getByRole('button', { name: 'Save draft', exact: true }).click();
    await saved(other);
    await other.close();
    await name.fill('Unsaved local conflict edits');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('This draft changed in another session or expired');
    await expect(name).toHaveValue('Unsaved local conflict edits');
    await expect(page.getByRole('button', { name: 'Save & continue', exact: true })).toBeDisabled();
    assert.equal(draft.fields.businessName, 'Saved from the other browser tab');
    await page.getByRole('button', { name: 'Reload saved draft', exact: true }).click();
    await capture('02-reload-confirmation', 'Reload saved application?');
    for (const label of ['Cancel', 'Replace with saved draft']) {
      const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1, `Confirmation control outside viewport: ${label}`);
    }
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(name).toHaveValue('Unsaved local conflict edits');
    await page.getByRole('button', { name: 'Reload saved draft', exact: true }).click();
    await page.getByRole('button', { name: 'Replace with saved draft', exact: true }).click();
    await expect(name).toHaveValue('Saved from the other browser tab');
    await page.getByRole('button', { name: 'Draft details & recovery', exact: true }).click();
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert(draft, 'Cancel must retain draft');
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await capture('02-discard-confirmation', 'Discard this draft?');
    for (const label of ['Cancel', 'Discard unsubmitted draft']) {
      const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1, `Confirmation control outside viewport: ${label}`);
    }
    await page.getByRole('button', { name: 'Discard unsubmitted draft', exact: true }).click();
    await expect(page.getByText('I provide services', { exact: true })).toBeVisible();
    assert.equal(draft, null);
    assert.equal(applyCount, 0);
    record.assertions.push('Second-tab save causes conflict, cancel preserves local edits, confirmed reload restores newer data, and confirmed discard clears only the unsubmitted fixture draft.');
    await page.getByText('I provide services', { exact: true }).click();
    await expect(name).toHaveValue('');
    await name.fill('Synthetic Cleaning Services');
    await page.getByRole('checkbox', { name: 'Cleaning service category' }).click();
    await continueStep();
    await page.getByRole('radio', { name: /Metro Cebu/ }).click();
    await page.getByRole('button', { name: 'Capture exact provider operating location' }).click();
    await expect(page.getByText('Exact operating location captured inside Metro Cebu.', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Metro Cebu/ })).toBeChecked();
    await capture('03-area', 'Service Area');
    await continueStep();
    await expect(page.getByText('Your business & experience', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page.getByText('Service Area', { exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, '/provider-onboarding/service-area');
    await expect(page.getByText('GPS captured: 10.3157, 123.8854', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Metro Cebu/ })).toBeChecked();
    await continueStep();
    record.assertions.push('Actual back navigation returns to the preceding step with the saved market and pin; forward continuation still works.');
    await page.getByLabel('Years of experience *', { exact: true }).fill('8');
    await page.getByLabel('Main skills / specialties *', { exact: true }).fill('Cleaning and post-construction cleanup');
    await page.getByPlaceholder('e.g. Maria Santos').fill('Synthetic Reference');
    await page.getByPlaceholder('e.g. 0917 123 4567').fill('09170000002');
    await page.getByPlaceholder('e.g. past client, former supervisor').fill('Synthetic past client');
    await capture('04-vetting', 'Your business & experience');
    await continueStep();
    await imageUpload(/Government ID — Front.*Required.*upload/i);
    await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
    await imageUpload(/Government ID — Back.*Required.*upload/i);
    await expect(page.getByText('2 / 3', { exact: true })).toBeVisible();
    await imageUpload(/NBI Clearance.*Required.*upload/i);
    await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();
    await page.getByLabel('NBI expiry date, optional').fill('2028-01-15');
    await page.getByLabel('Government ID number, optional').fill('SYNTHETIC-ONLY');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await saved(page);
    await page.reload();
    await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();
    assert.equal(await page.locator('[data-testid^="document-preview-"]').count(), 0);
    await expect(page.getByLabel('Government ID number, optional')).toHaveValue('SYNTHETIC-ONLY');
    record.assertions.push('Reload restores three private references/metadata without requesting private image URLs.');
    await capture('05-documents', 'Verification Documents');
    await continueStep();
    await imageUpload('Upload Selfie');
    await expect(page.getByTestId('selfie-local-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await saved(page);
    await page.reload();
    await expect(page.getByText('Selfie on file', { exact: true })).toBeVisible();
    assert.equal(await page.getByTestId('selfie-local-preview').count(), 0);
    await capture('06-selfie', 'Selfie Verification');
    await continueStep();
    await capture('07-terms', 'Independent Contractor Agreement');
    const agreement = page.getByRole('checkbox', { name: 'Accept the Independent Contractor Agreement and Terms of Service' });
    await expect(agreement).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Submit Application', exact: true })).toBeDisabled();
    await agreement.click();
    await page.reload();
    await expect(agreement).not.toBeChecked();
    assert.equal(applyCount, 0, 'Saving and reloading cannot submit');
    await agreement.click();
    await page.getByRole('button', { name: 'Submit Application', exact: true }).click();
    await capture('08-submitted', 'Application submitted');
    assert.equal(applyCount, 1);
    assert.equal(uploadCount, 4);
    assert.equal(draft, null);
    const persistedRole = await page.evaluate(() => JSON.parse(localStorage.getItem('onservice-auth-secure:user')).role);
    assert.equal(persistedRole, 'customer');
    record.assertions.push('Consent resets after reload; exactly one confirmed submission consumes the fixture draft without promoting customer access.');
    await page.goto(`${base}/provider-onboarding/categories`);
    await expect(page.getByRole('heading', { name: 'Application submitted', exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, '/provider-onboarding/review-pending');
    record.assertions.push('Reopening editing after submission returns to the canonical status screen.');
    assert.equal(record.pageErrors.length, 0);
    assert.equal(record.unmatched.length, 0);
    assert(record.consoleErrors.every(error => /503|409/.test(error)), 'Unexpected browser console error');
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    record.failedPath = new URL(page.url()).pathname;
    record.failedText = (await page.locator('body').innerText()).slice(0, 6000);
    await page.screenshot({ path: path.join(output, `${width}-failure.png`), animations: 'disabled' });
  } finally { await context.close(); }
  return record;
}

try {
  browser = await chromium.launch();
  for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    const record = await runFlow(width);
    results.push(record);
    process.stdout.write(`${JSON.stringify({ width, passed: record.passed, screens: record.screens.length, error: record.error })}\n`);
    if (!record.passed) break;
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { evidence: 'Compiled browser with synthetic HTTP and identity. Not actual database, live deployment, admin acceptance, native or Stitch signoff.',
  sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree', indexSha256: createHash('sha256').update(index).digest('hex'),
  generatedAt: new Date().toISOString(), expectedFlows: 6, flows: results.length, passed: results.filter(result => result.passed).length, results };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ flows: report.flows, passed: report.passed, failures: results.filter(result => !result.passed), reportPath: path.join(output, 'results.json') }, null, 2)}\n`);
process.exitCode = report.flows === 6 && report.passed === 6 ? 0 : 1;
