// Compiled-browser behavior/layout evidence with synthetic HTTP, not production acceptance.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, realpath, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const bundle = await realpath(process.argv[2]);
const output = path.resolve(process.argv[3]);
assert((await stat(path.join(bundle, 'index.html'))).isFile());
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(bundle, `.${pathname}`);
    if (!target.startsWith(`${bundle}${path.sep}`) && target !== bundle) { res.writeHead(404); res.end(); return; }
    let file = target;
    if (pathname === '/' || pathname.startsWith('/provider-onboarding/')) file = path.join(bundle, 'index.html');
    const bytes = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const applicant = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', phone: '+639170000001',
  email: null, firstName: 'Synthetic', lastName: 'Applicant', avatarUrl: null, role: 'customer' };
const cases = [
  ['pending', 'Application submitted'], ['rejected', 'Application not approved'],
  ['suspended', 'Provider access suspended'], ['deactivated', 'Provider account deactivated'],
  ['empty', 'No provider application found'], ['unavailable', 'Status unavailable'],
  ['approved', 'Application approved'],
];
const results = [];
const browser = await chromium.launch();
try {
  audit: for (const width of [320, 390, 768, 1024, 1366, 1920]) {
    for (const route of ['review-pending', 'background-check-status']) {
      for (const [state, heading] of cases) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const pageErrors = [], consoleErrors = [], unmatched = [], requests = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        await page.addInitScript(user => {
          localStorage.setItem('onservice-auth-secure:accessToken', 'synthetic-review-access');
          localStorage.setItem('onservice-auth-secure:refreshToken', 'synthetic-review-refresh');
          localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
        }, applicant);
        await page.route('**/*', async intercepted => {
          const request = intercepted.request();
          const url = new URL(request.url());
          const pathname = url.pathname;
          if (pathname.startsWith('/api/v1/')) {
            requests.push(`${request.method()} ${pathname}`);
            let status = 200, data;
            if (pathname === '/api/v1/config') data = {};
            else if (pathname === '/api/v1/providers/application-status') {
              status = state === 'unavailable' ? 503 : 200;
              data = state === 'empty' ? null : { status: state, rejectionReason: 'Synthetic recorded rejection reason.' };
            } else if (pathname === '/api/v1/auth/refresh-token') data = { accessToken: 'synthetic-review-rotated', refreshToken: 'synthetic-review-next' };
            else if (pathname === '/api/v1/auth/me') data = applicant; // Approval alone must not grant provider access.
            else { unmatched.push(`${request.method()} ${pathname}`); status = 501; }
            await intercepted.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200
              ? { success: true, data } : { success: false, error: { code: 'AUDIT_UNAVAILABLE', message: 'Synthetic unavailable response' } }) });
          } else if (url.origin === base) await intercepted.continue();
          else { unmatched.push(request.url()); await intercepted.abort(); }
        });
        const record = { width, route, state, heading, pageErrors, consoleErrors, unmatched, requests, passed: false };
        try {
          await page.goto(`${base}/provider-onboarding/${route}`, { waitUntil: 'domcontentloaded' });
          await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 15000 });
          if (state === 'approved') await page.getByRole('alert').filter({ hasText: 'could not be confirmed for this account' }).waitFor();
          await page.evaluate(async () => { await document.fonts.ready; });
          record.overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert(record.overflow <= 1, `Document overflows horizontally by ${record.overflow}px`);
          assert.equal(await page.getByText('In review', { exact: true }).count(), 0);
          assert.equal(await page.getByText('Synthetic recorded rejection reason.', { exact: true }).count(), state === 'rejected' ? 1 : 0);
          assert.equal(await page.getByText(/A completion date is not available yet/).count(), state === 'pending' ? 1 : 0);
          if (width < 700) {
            const card = page.getByRole('heading', { name: heading, exact: true }).locator('..');
            const cardBox = await card.boundingBox();
            const exitBox = await page.getByRole('button', { name: 'Go to Customer Home' }).boundingBox();
            const padding = await card.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingBottom) + Number.parseFloat(getComputedStyle(element).borderBottomWidth));
            record.extraDecisionSpace = cardBox.y + cardBox.height - exitBox.y - exitBox.height - padding;
            assert(record.extraDecisionSpace <= 1, `Phone decision card has ${record.extraDecisionSpace}px of unnecessary allocated space`);
          }
          record.path = new URL(page.url()).pathname;
          assert.equal(record.path, `/provider-onboarding/${route}`);
          const name = `${width}-${route}-${state}`;
          const captureVisual = route === 'review-pending' && [320, 768, 1366].includes(width);
          if (captureVisual && ['pending', 'rejected', 'approved'].includes(state)) {
            record.topScreenshot = `${name}-top.png`;
            await page.screenshot({ path: path.join(output, record.topScreenshot), animations: 'disabled', caret: 'hide' });
          }
          await page.getByRole('button', { name: 'What happens after a decision?' }).click();
          const guidance = page.getByText('If your application was declined or your provider access is restricted, contact support. You cannot edit or resubmit a submitted application here yet.', { exact: true });
          await guidance.scrollIntoViewIfNeeded();
          const guidanceBox = await guidance.boundingBox();
          assert(guidanceBox && guidanceBox.x >= 0 && guidanceBox.x + guidanceBox.width <= width + 1);
          for (const label of ['Contact support', 'Notification history', 'Go to Customer Home']) {
            const control = page.getByRole('button', { name: label, exact: true });
            await control.scrollIntoViewIfNeeded();
            const box = await control.boundingBox();
            assert(box && box.width > 0 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1, `Clipped/undersized control: ${label}`);
          }
          await guidance.scrollIntoViewIfNeeded();
          if (captureVisual && state === 'pending') {
            record.helpScreenshot = `${name}-guidance.png`;
            await page.screenshot({ path: path.join(output, record.helpScreenshot), animations: 'disabled', caret: 'hide' });
          }
          assert.equal(pageErrors.length, 0, 'Unhandled browser errors');
          assert.equal(unmatched.length, 0, 'Unexpected or external network request');
          assert(consoleErrors.every(message => state === 'unavailable' && /503/.test(message)), `Unexpected console errors: ${consoleErrors.join('; ')}`);
          record.passed = true;
        } catch (error) { record.error = error.message; }
        results.push(record);
        await context.close();
        if (!record.passed) break audit;
      }
    }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
const indexBytes = await readFile(path.join(bundle, 'index.html'));
const report = { evidence: 'Compiled browser with synthetic HTTP and identity. Not live/server/native/Stitch signoff.',
  sourceRevision: process.env.AUDIT_SOURCE_REVISION ?? 'unverified working tree',
  indexSha256: createHash('sha256').update(indexBytes).digest('hex'),
  generatedAt: new Date().toISOString(), expectedChecks: 84, checks: results.length, passed: results.filter(x => x.passed).length, results };
await writeFile(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ checks: report.checks, passed: report.passed, failures: results.filter(x => !x.passed), reportPath: path.join(output, 'results.json') }, null, 2)}\n`);
process.exitCode = report.checks === 84 && report.passed === 84 ? 0 : 1;
