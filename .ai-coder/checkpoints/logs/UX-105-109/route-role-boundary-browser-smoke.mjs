import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:7390';

function userFor(role) {
  return {
    id: `${role}-route-test`,
    phone: '+639000000000',
    email: `${role}@route-test.invalid`,
    firstName: 'Route',
    lastName: 'Test',
    role,
    avatarUrl: null,
  };
}

async function seedSession(page, role) {
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'route-test-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'route-test-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, userFor(role));
}

async function mockApi(page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const { pathname } = new URL(url);
    let data = [];
    let meta;
    if (pathname === '/api/v1/config') data = {};
    if (pathname === '/api/v1/providers/me') {
      data = {
        id: 'provider-route-test',
        userId: 'provider-route-test',
        businessName: 'Route Test Services',
        tier: 'verified',
        status: 'approved',
        bio: null,
        rating: null,
        totalJobs: 0,
        acceptanceRate: null,
        responseTimeMinutes: null,
        yearsExperience: null,
        serviceRadiusKm: null,
        isAvailable: false,
        latitude: null,
        longitude: null,
        city: 'Cebu City',
        province: 'Cebu',
        createdAt: '2026-08-24T00:00:00.000Z',
        services: [],
        schedule: [],
        ratings: {
          overall: null,
          totalReviews: 0,
          quality: null,
          punctuality: null,
          professionalism: null,
          communication: null,
          value: null,
        },
        portfolio: [],
        certifications: [],
      };
    }
    if (pathname === '/api/v1/providers/me/nbi-status') {
      data = { status: 'valid', expiresAt: '2030-01-01' };
    }
    if (pathname === '/api/v1/bookings') meta = { total: 0, page: 1, pageSize: 5 };
    if (pathname === '/api/v1/notifications') meta = { unread: 0 };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data, ...(meta ? { meta } : {}) }),
    });
  });
}

const cases = [
  { role: 'customer', start: '/provider/certifications', expected: '/home', forbiddenWorkspace: 'Provider workspace' },
  { role: 'provider', start: '/customer/projects', expected: '/dashboard', forbiddenWorkspace: 'Customer workspace' },
  { role: 'customer', start: '/staff/jobs', expected: '/home', forbiddenWorkspace: 'Staff workspace' },
];

const browser = await chromium.launch();
const evidence = [];

try {
  for (const width of [768, 1366]) {
    for (const routeCase of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await seedSession(page, routeCase.role);
      await mockApi(page);
      await page.goto(`${BASE_URL}${routeCase.start}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const state = await page.evaluate(() => ({
        path: location.pathname,
        body: document.body.innerText,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      if (state.path !== routeCase.expected) {
        process.stderr.write(`${JSON.stringify({ width, routeCase, state, pageErrors }, null, 2)}\n`);
      }
      assert.equal(state.path, routeCase.expected);
      assert.ok(!state.body.includes(routeCase.forbiddenWorkspace));
      assert.ok(state.scrollWidth <= state.clientWidth + 1);
      assert.deepEqual(pageErrors, []);
      evidence.push({ width, ...routeCase, path: state.path, overflow: state.scrollWidth - state.clientWidth });
      await context.close();
    }

    const providerContext = await browser.newContext({ viewport: { width, height: 900 } });
    const providerPage = await providerContext.newPage();
    await seedSession(providerPage, 'provider');
    await mockApi(providerPage);
    await providerPage.goto(`${BASE_URL}/provider/certifications`, { waitUntil: 'networkidle' });
    await providerPage.getByText('Build trust with verified credentials').waitFor();
    const providerPath = new URL(providerPage.url()).pathname;
    assert.equal(providerPath, '/provider/certifications');
    evidence.push({ width, role: 'provider', start: providerPath, expected: providerPath, allowed: true });
    await providerContext.close();
  }

  const anonymousContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const anonymousPage = await anonymousContext.newPage();
  await mockApi(anonymousPage);
  await anonymousPage.goto(`${BASE_URL}/support`, { waitUntil: 'networkidle' });
  await anonymousPage.waitForTimeout(1500);
  assert.equal(new URL(anonymousPage.url()).pathname, '/auth/login');
  evidence.push({ width: 1366, role: 'anonymous', start: '/support', expected: '/auth/login' });
  await anonymousContext.close();
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
