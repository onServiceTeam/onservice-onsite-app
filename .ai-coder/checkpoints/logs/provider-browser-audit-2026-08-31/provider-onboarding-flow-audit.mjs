import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../../..');
const uploadFixture = path.join(repositoryRoot, 'apps/mobile/assets/notification-icon.png');
const screenshotRoot = path.join(here, 'onboarding-flow-screenshots');

const customerUser = {
  id: 'provider-applicant-audit', phone: '+639191234567', email: 'applicant.audit@invalid.example',
  firstName: 'Rosa', lastName: 'Dela Cruz', role: 'customer', avatarUrl: null,
};

const category = { id: 'category-1', slug: 'aircon-services', name: 'Air Conditioning' };
const area = {
  id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu',
  centerLat: 10.3157, centerLng: 123.8854, radiusKm: 35, status: 'active', isActive: true,
};

function envelope(data, extra = {}) {
  return { success: true, data, ...extra };
}

function responseFor(url, method, uploadNumber) {
  const { pathname } = url;
  if (pathname === '/api/v1/config') return envelope({ maxServiceRadiusKm: 50 });
  if (pathname === '/api/v1/catalog') return envelope([category]);
  if (pathname === '/api/v1/service-areas/provider-markets') return envelope([area]);
  if (pathname === '/api/v1/uploads' && method === 'POST') return envelope([{
    id: `onboarding-upload-${uploadNumber}`,
    url: `https://private.invalid/onboarding/upload-${uploadNumber}.png`,
    filename: 'notification-icon.png', mimeType: 'image/png', sizeBytes: 1024,
  }]);
  if (pathname === '/api/v1/providers/apply' && method === 'POST') return envelope({ applicationId: 'application-audit', status: 'pending' });
  if (pathname === '/api/v1/providers/application-status') return envelope({ status: 'pending', rejectionReason: null });
  return null;
}

async function seedSession(page) {
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'onboarding-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'onboarding-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, customerUser);
}

async function setImageFromChooser(page, buttonName) {
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => null);
  await page.getByRole('button', { name: buttonName }).click();
  const chooser = await chooserPromise;
  if (chooser) {
    await chooser.setFiles(uploadFixture);
    return;
  }
  const input = page.locator('input[type="file"]').last();
  await input.waitFor({ state: 'attached', timeout: 5_000 });
  await input.setInputFiles(uploadFixture);
}

async function capture(page, width, step, expectedText, results) {
  await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  const state = await page.evaluate(() => ({
    path: `${location.pathname}${location.search}`,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const directory = path.join(screenshotRoot, String(width));
  await mkdir(directory, { recursive: true });
  const screenshot = path.join(directory, `${step}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  results.push({
    width, step, expectedText, actualPath: state.path,
    markerMissing: !state.text.toLocaleLowerCase().includes(expectedText.toLocaleLowerCase()),
    overflow: state.scrollWidth - state.clientWidth,
    textPreview: state.text.slice(0, 300), screenshot,
  });
}

async function runFlow(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    geolocation: { latitude: 10.3157, longitude: 123.8854 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  const results = [];
  const pageErrors = [];
  const consoleErrors = [];
  const unmatchedApi = new Set();
  let uploadNumber = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (value.includes('/socket.io/') && value.includes('WebSocket connection')) return;
    consoleErrors.push(value);
  });
  await seedSession(page);
  await page.route('**/api/v1/**', async (intercepted) => {
    const url = new URL(intercepted.request().url());
    if (url.pathname === '/api/v1/uploads') uploadNumber += 1;
    const body = responseFor(url, intercepted.request().method(), uploadNumber);
    if (body == null) {
      unmatchedApi.add(`${intercepted.request().method()} ${url.pathname}`);
      await intercepted.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'AUDIT_FIXTURE_MISSING', message: `No fixture for ${url.pathname}` } }) });
      return;
    }
    await intercepted.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  try {
    await page.goto(`${BASE_URL}/provider-onboarding/role-select`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await capture(page, width, '01-role-select', 'How would you like to use onService?', results);
    await page.getByText('I provide services', { exact: true }).click();

    await page.getByPlaceholder("e.g. Juan's Plumbing").fill('Dela Cruz Aircon Services');
    await page.getByRole('checkbox', { name: 'Air Conditioning service category' }).click();
    await capture(page, width, '02-categories', 'Your Services', results);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('radio', { name: /Metro Cebu/ }).click();
    await page.getByRole('button', { name: 'Capture exact provider operating location' }).click();
    await page.getByText(/Exact operating location captured inside Metro Cebu/i).waitFor({ timeout: 15_000 });
    await capture(page, width, '03-service-area', 'Service Area', results);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByPlaceholder('e.g. 5').fill('8');
    await page.getByPlaceholder(/aircon cleaning/i).fill('Aircon cleaning, repair, and preventive maintenance');
    await page.getByPlaceholder('e.g. Maria Santos').fill('Maria Santos');
    await page.getByPlaceholder('e.g. 0917 123 4567').fill('09171234567');
    await page.getByPlaceholder('e.g. past client, former supervisor').fill('Past client');
    await capture(page, width, '04-vetting', 'Your business & experience', results);
    await page.getByRole('button', { name: 'Next' }).click();

    await setImageFromChooser(page, /Government ID — Front.*Required.*upload/i);
    await page.getByText('1 / 3').waitFor({ timeout: 15_000 });
    await setImageFromChooser(page, /Government ID — Back.*Required.*upload/i);
    await page.getByText('2 / 3').waitFor({ timeout: 15_000 });
    await setImageFromChooser(page, /NBI Clearance.*Required.*upload/i);
    await page.getByText('3 / 3').waitFor({ timeout: 15_000 });
    await page.getByLabel('NBI expiry date, optional').fill('2028-01-15');
    await page.getByLabel('Government ID number, optional').fill('AUDIT-1234-5678');
    await capture(page, width, '05-documents', 'Verification Documents', results);
    await page.getByRole('button', { name: 'Next' }).click();

    await setImageFromChooser(page, /Selfie$/i);
    await page.getByTestId('selfie-local-preview').waitFor({ timeout: 15_000 });
    await capture(page, width, '06-selfie', 'Selfie Verification', results);
    await page.getByRole('button', { name: 'Next' }).click();

    await capture(page, width, '07-agreement', 'Independent Contractor Agreement', results);
    await page.getByText(/I have read, understood, and agree/i).click();
    await page.getByRole('button', { name: 'Submit Application' }).click();

    await capture(page, width, '08-review-pending', 'Application Under Review', results);
    await page.goto(`${BASE_URL}/provider-onboarding/background-check-status`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await capture(page, width, '09-background-check-status', 'Application Review', results);
  } catch (error) {
    results.push({ width, failedStep: true, error: error instanceof Error ? error.message : String(error), path: await page.evaluate(() => location.href) });
  }

  const failed = pageErrors.length > 0
    || consoleErrors.length > 0
    || unmatchedApi.size > 0
    || results.some((result) => result.failedStep || result.markerMissing || (result.overflow ?? 0) > 1)
    || results.filter((result) => !result.failedStep).length !== 9;
  await context.close();
  return { width, failed, pageErrors, consoleErrors, unmatchedApi: [...unmatchedApi], results };
}

const browser = await chromium.launch();
const flows = [];
try {
  for (const width of [768, 1024, 1366]) {
    flows.push(await runFlow(browser, width));
  }
} finally {
  await browser.close();
}

const reportPath = path.join(here, 'provider-onboarding-flow-results.json');
await writeFile(reportPath, `${JSON.stringify(flows, null, 2)}\n`, 'utf8');
const failures = flows.filter((flow) => flow.failed);
process.stdout.write(`${JSON.stringify({ auditedFlows: flows.length, screenChecks: flows.reduce((sum, flow) => sum + flow.results.filter((result) => !result.failedStep).length, 0), failedFlows: failures.length, reportPath, failures }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
