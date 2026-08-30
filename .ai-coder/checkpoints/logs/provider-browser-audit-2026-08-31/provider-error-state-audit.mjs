import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const ROUTE_FILTER = process.env.AUDIT_ROUTE?.trim() || null;
const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.join(here, 'error-state-screenshots');

const providerUser = {
  id: 'provider-browser-audit',
  phone: '+639000000101',
  email: 'provider.browser.audit@invalid.example',
  firstName: 'Roberto',
  lastName: 'Santos',
  role: 'provider',
  avatarUrl: null,
};

const staffUser = {
  id: 'staff-browser-audit',
  phone: '+639000000102',
  email: 'staff.browser.audit@invalid.example',
  firstName: 'Ana',
  lastName: 'Reyes',
  role: 'provider_staff',
  avatarUrl: null,
};

const providerRoutes = [
  '/dashboard',
  '/jobs',
  '/earnings',
  '/provider-profile',
  '/provider/account-management',
  '/provider/availability',
  '/provider/calendar',
  '/provider/certifications',
  '/provider/chat/audit-booking',
  '/provider/clients',
  '/provider/clients/audit-customer',
  '/provider/disputes',
  '/provider/dispute/audit-dispute',
  '/provider/help',
  '/provider/insights',
  '/provider/job/audit-booking',
  '/provider/job/audit-booking/change-order',
  '/provider/job/audit-booking/checklist',
  '/provider/job/audit-booking/complete',
  '/provider/job/audit-booking/navigate',
  '/provider/job/audit-booking/photos',
  '/provider/job/audit-booking/quote',
  '/provider/job/active?id=audit-booking',
  '/provider/leads',
  '/provider/notification-settings',
  '/provider/notifications',
  '/provider/payout-settings',
  '/provider/payouts',
  '/provider/portfolio',
  '/provider/quote-templates',
  '/provider/reminders',
  '/provider/reviews',
  '/provider/schedule',
  '/provider/service-area',
  '/provider/services',
  '/provider/settings',
  '/provider/skills',
  '/provider/standards',
  '/provider/suki-customers',
  '/provider/team',
  '/provider/tier-progression',
  '/provider/withdraw',
  '/support',
  '/support/new',
  '/support/audit-ticket',
];

const staffRoutes = [
  '/staff/jobs',
  '/staff/job/audit-booking',
  '/staff/job/audit-booking/checklist',
  '/staff/job/audit-booking/complete',
  '/staff/invites',
  '/support',
  '/support/new',
  '/support/audit-ticket',
];

function safeName(route) {
  return route
    .replace(/^\//, '')
    .replace(/[/?=&]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '') || 'root';
}

async function seedSession(page, user) {
  await page.addInitScript((seedUser) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'browser-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'browser-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(seedUser));
  }, user);
}

async function forceApiOutage(page) {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: {
          code: 'AUDIT_FORCED_OUTAGE',
          message: 'The audit intentionally made this service unavailable.',
        },
      }),
    });
  });
}

async function auditRoute(browser, { route, user, width }) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (!value.includes('Failed to load resource: the server responded with a status of 503')) {
      consoleErrors.push(value);
    }
  });

  await seedSession(page, user);
  await forceApiOutage(page);
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3_600);

  const readState = () => page.evaluate(() => ({
    path: `${location.pathname}${location.search}`,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  let state = await readState();
  // A few screens use skeletons without text while React Query performs its
  // bounded retries. Do not misclassify that normal retry window as a blank
  // page; give only those pages enough time to reach their terminal error UI.
  if (state.text.length < 4) {
    await page.waitForTimeout(5_000);
    state = await readState();
  }

  const screenshotDir = path.join(evidenceRoot, String(width), user.role);
  await mkdir(screenshotDir, { recursive: true });
  const screenshot = path.join(screenshotDir, `${safeName(route)}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });

  const globalBoundary = state.text.includes(
    'The app ran into an unexpected problem. You can try again.',
  );
  const blank = state.text.length < 4;
  const overflow = state.scrollWidth - state.clientWidth;
  const failed =
    pageErrors.length > 0 ||
    consoleErrors.length > 0 ||
    globalBoundary ||
    blank ||
    overflow > 1;

  await context.close();
  return {
    route,
    role: user.role,
    width,
    actualPath: state.path,
    textPreview: state.text.slice(0, 260),
    globalBoundary,
    blank,
    overflow,
    pageErrors,
    consoleErrors,
    screenshot,
    failed,
  };
}

const browser = await chromium.launch();
const jobs = [];
for (const width of [768, 1024, 1366]) {
  for (const route of providerRoutes) {
    if (!ROUTE_FILTER || route === ROUTE_FILTER) jobs.push({ route, user: providerUser, width });
  }
  for (const route of staffRoutes) {
    if (!ROUTE_FILTER || route === ROUTE_FILTER) jobs.push({ route, user: staffUser, width });
  }
}

const results = [];
try {
  const pending = [...jobs];
  const workers = Array.from({ length: 6 }, async () => {
    while (pending.length > 0) {
      const job = pending.shift();
      if (!job) return;
      try {
        results.push(await auditRoute(browser, job));
      } catch (error) {
        results.push({
          ...job,
          user: undefined,
          failed: true,
          auditError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
  await Promise.all(workers);
} finally {
  await browser.close();
}

results.sort((a, b) =>
  a.width - b.width || a.role.localeCompare(b.role) || a.route.localeCompare(b.route),
);
const reportPath = path.join(here, 'provider-error-state-results.json');
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

const failures = results.filter((result) => result.failed);
process.stdout.write(
  `${JSON.stringify({ audited: results.length, failed: failures.length, reportPath, failures }, null, 2)}\n`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
