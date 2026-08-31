import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const ROUTE_FILTER = process.env.AUDIT_ROUTE?.trim() || null;
const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.join(here, 'error-state-screenshots');

const customerUser = {
  id: 'customer-browser-audit', phone: '+639171112222', email: 'customer.audit@invalid.example',
  firstName: 'Paolo', lastName: 'Garcia', role: 'customer', avatarUrl: null,
};

const routes = [
  '/home', '/bookings', '/wallet', '/profile',
  '/customer/account-management', '/customer/address-picker', '/customer/addresses',
  '/customer/booking/audit-booking', '/customer/booking/change-order?bookingId=audit-booking',
  '/customer/booking/checkout', '/customer/booking/complete?bookingId=audit-booking',
  '/customer/booking/configure', '/customer/booking/confirm?bookingId=audit-booking',
  '/customer/booking/dispute?bookingId=audit-booking', '/customer/booking/form',
  '/customer/booking/job-request', '/customer/booking/make-recurring?bookingId=audit-booking',
  '/customer/booking/pay?bookingId=audit-booking',
  '/customer/booking/payment-failed?bookingId=audit-booking&reason=Payment%20was%20not%20completed',
  '/customer/booking/photos?bookingId=audit-booking', '/customer/booking/quotes?bookingId=audit-booking',
  '/customer/booking/review?bookingId=audit-booking', '/customer/booking/tip?bookingId=audit-booking',
  '/customer/booking/tracker?bookingId=audit-booking', '/customer/category/air-conditioning',
  '/customer/chat/audit-booking', '/customer/data-rights', '/customer/dispute/audit-dispute',
  '/customer/disputes', '/customer/help', '/customer/notification-settings',
  '/customer/notifications', '/customer/payment-methods', '/customer/projects/audit-project',
  '/customer/projects', '/customer/projects/new', '/customer/provider/audit-provider',
  '/customer/recurring/audit-recurring', '/customer/recurring', '/customer/referral',
  '/customer/safety-and-support', '/customer/search?q=aircon', '/customer/suki-pros',
  '/customer/terms', '/customer/wallet-topup', '/support', '/support/new', '/support/audit-ticket',
];

function safeName(route) {
  return route.replace(/^\//, '').replace(/[/?=&]+/g, '-').replace(/[^a-zA-Z0-9-]/g, '') || 'root';
}

async function seedSession(page) {
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'browser-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'browser-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, customerUser);
}

async function forceApiOutage(page) {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/config') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { code: 'AUDIT_FORCED_OUTAGE', message: 'The audit intentionally made this service unavailable.' } }),
    });
  });
}

async function auditRoute(browser, { route, width }) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (!value.includes('Failed to load resource: the server responded with a status of 503') &&
        !(value.includes('/socket.io/') && value.includes('WebSocket connection'))) {
      consoleErrors.push(value);
    }
  });

  await seedSession(page);
  await forceApiOutage(page);
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // React Query's default retry schedule can take roughly seven seconds to
  // reach its terminal error state. Capture after that point so a persistent
  // tab label or header cannot make an intermediate skeleton look like the
  // final outage UI.
  await page.waitForTimeout(8_500);
  const readState = () => page.evaluate(() => ({
    path: `${location.pathname}${location.search}`,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  let state = await readState();
  if (state.text.length < 4) {
    await page.waitForTimeout(5_000);
    state = await readState();
  }

  const screenshotDir = path.join(evidenceRoot, String(width));
  await mkdir(screenshotDir, { recursive: true });
  const screenshot = path.join(screenshotDir, `${safeName(route)}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });

  const globalBoundary = state.text.includes('The app ran into an unexpected problem. You can try again.');
  const blank = state.text.length < 4;
  const overflow = state.scrollWidth - state.clientWidth;
  const failed = pageErrors.length > 0 || consoleErrors.length > 0 || globalBoundary || blank || overflow > 1;
  await context.close();
  return { route, width, actualPath: state.path, textPreview: state.text.slice(0, 1_000), globalBoundary, blank, overflow, pageErrors, consoleErrors, screenshot, failed };
}

const browser = await chromium.launch();
const jobs = [768, 1024, 1366].flatMap((width) => routes
  .filter((route) => !ROUTE_FILTER || route === ROUTE_FILTER)
  .map((route) => ({ route, width })));
const results = [];
try {
  const pending = [...jobs];
  const workers = Array.from({ length: 6 }, async () => {
    while (pending.length) {
      const job = pending.shift();
      if (!job) return;
      try {
        results.push(await auditRoute(browser, job));
      } catch (error) {
        results.push({ ...job, failed: true, auditError: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  await Promise.all(workers);
} finally {
  await browser.close();
}

results.sort((a, b) => a.width - b.width || a.route.localeCompare(b.route));
const reportPath = path.join(here, 'customer-error-state-results.json');
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
const failures = results.filter((result) => result.failed);
process.stdout.write(`${JSON.stringify({ audited: results.length, failed: failures.length, reportPath, failures }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
