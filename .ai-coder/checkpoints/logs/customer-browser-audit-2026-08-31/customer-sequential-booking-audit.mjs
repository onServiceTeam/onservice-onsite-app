import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const here = path.dirname(fileURLToPath(import.meta.url));
const screenshotRoot = path.join(here, 'sequential-booking-screenshots');

const customer = {
  id: 'customer-sequential-audit', phone: '+639171112222', email: 'customer.audit@invalid.example',
  firstName: 'Paolo', lastName: 'Garcia', role: 'customer', avatarUrl: null,
};
const category = {
  id: 'category-1', name: 'Air Conditioning', slug: 'air-conditioning',
  description: 'Cooling-system installation, cleaning, and repair.', iconUrl: null, displayOrder: 1,
};
const service = {
  id: 'subcategory-1', categoryId: category.id, categoryName: category.name, categorySlug: category.slug,
  name: 'Aircon Cleaning', slug: 'aircon-cleaning',
  description: 'Cleaning of one wall-mounted split-type air-conditioning unit, including before and after evidence.',
  pricingType: 'fixed', basePrice: 150000, minPrice: 150000, maxPrice: 150000,
  estimatedDurationMinutes: 120, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
};
const address = {
  id: 'address-1', label: 'Home', fullAddress: '88 Banilad Road', barangay: 'Banilad',
  city: 'Mandaue City', province: 'Cebu', region: 'Region VII', zipCode: '6014',
  latitude: 10.335, longitude: 123.91, isDefault: true, notes: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};
const area = {
  id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Mandaue City', province: 'Cebu',
  region: 'Region VII', zipCodes: ['6014'], centerLat: 10.3236, centerLng: 123.9223,
  radiusKm: 25, status: 'active', launchDate: null, launchedAt: '2026-01-01T00:00:00.000Z',
  minProvidersToLaunch: 1, activeProviderCount: 10, activeCustomerCount: 100, totalBookings: 500,
  isDefault: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

const envelope = (data, extra = {}) => ({ success: true, data, ...extra });

async function runAtWidth(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const unmatchedApi = new Set();
  const pageErrors = [];
  const consoleErrors = [];
  const writes = [];
  const steps = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('/socket.io/') && text.includes('WebSocket connection')) return;
    consoleErrors.push(text);
  });
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'browser-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'browser-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, customer);

  const paidBooking = {
    id: 'sequential-booking', customerId: customer.id, providerId: null,
    categoryId: category.id, subcategoryId: service.id, bookingType: 'fixed_price', status: 'paid',
    escrowStatus: 'held', servicePrice: 150000, serviceFee: 0, totalAmount: 150000,
    description: 'Aircon Cleaning', address: address.fullAddress, barangay: address.barangay,
    city: address.city, province: address.province, latitude: address.latitude, longitude: address.longitude,
    scheduledAt: '2026-09-02T08:00:00.000Z', completedAt: null, confirmedAt: null, cancelledAt: null,
    cancellationReason: null, paymentMethod: 'wallet', surgeMultiplier: 1, surgeAmount: 0,
    rebookedFromId: null, sukiDiscount: 0, jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [],
    createdAt: '2026-08-31T00:00:00.000Z', serviceName: service.name, categoryName: category.name,
  };

  await page.route('**/api/v1/**', async (intercepted) => {
    const request = intercepted.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    if (method !== 'GET') {
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      writes.push({ method, pathname, body });
    }
    let response;
    if (pathname === '/api/v1/config') response = envelope({ maxQuotesPerBooking: 5 });
    else if (pathname === '/api/v1/auth/me') response = envelope(customer);
    else if (pathname === `/api/v1/catalog/${category.slug}`) response = envelope({ ...category, subcategories: [service] });
    else if (pathname === `/api/v1/catalog/subcategory/${service.id}/addons`) response = envelope([]);
    else if (pathname === '/api/v1/addresses') response = envelope([address]);
    else if (pathname === '/api/v1/service-areas') response = envelope([area]);
    else if (pathname === '/api/v1/service-areas/check') response = envelope({ covered: true, area, nearestArea: null });
    else if (pathname === '/api/v1/wallet') response = envelope({
      id: 'wallet-1', userId: customer.id, type: 'customer', availableBalance: 500000,
      pendingBalance: 0, currency: 'PHP', createdAt: '2026-01-01T00:00:00.000Z',
    });
    else if (pathname === '/api/v1/compliance/my-pending-consents') response = envelope([]);
    else if (pathname === '/api/v1/bookings' && method === 'POST') response = envelope({ ...paidBooking, status: 'payment_pending', escrowStatus: 'pending' });
    else if (pathname === '/api/v1/payments/intent' && method === 'POST') response = envelope({
      id: 'payment-1', bookingId: paidBooking.id, paymongoIntentId: null, amount: paidBooking.totalAmount,
      currency: 'PHP', status: 'succeeded', paymentMethod: 'wallet', clientKey: null, checkoutUrl: null,
      createdAt: '2026-08-31T00:00:00.000Z',
    });
    else if (pathname === `/api/v1/bookings/${paidBooking.id}`) response = envelope(paidBooking);
    else {
      unmatchedApi.add(`${method} ${pathname}`);
      await intercepted.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: `No fixture for ${method} ${pathname}` } }) });
      return;
    }
    await intercepted.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });

  const mark = async (name, expectedPath, expectedText) => {
    await page.waitForFunction(({ pathPart, textPart }) => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      return location.pathname.includes(pathPart) && text.toLowerCase().includes(textPart.toLowerCase());
    }, { pathPart: expectedPath, textPart: expectedText }, { timeout: 15_000 });
    const state = await page.evaluate(() => ({
      path: `${location.pathname}${location.search}`,
      text: document.body.innerText.replace(/\s+/g, ' ').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    steps.push({ name, ...state });
  };

  try {
    await page.goto(`${BASE_URL}/customer/category/${category.slug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await mark('catalog', '/customer/category/', service.name);
    await page.getByRole('button', { name: `View ${service.name} service details` }).click();
    await page.getByRole('button', { name: 'Customize service' }).click();
    await mark('configure', '/customer/booking/configure', 'Customize Your Service');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await mark('form', '/customer/booking/form', 'Book Service');
    await page.getByRole('button', { name: 'Select service address' }).click();
    await mark('address-picker', '/customer/address-picker', 'Select Address');
    await page.getByRole('button', { name: 'Use saved address Home' }).click();
    await page.getByRole('button', { name: 'Confirm Address' }).click();
    await mark('form-with-address', '/customer/booking/form', address.fullAddress);
    await page.getByRole('button', { name: /Select date / }).first().click();
    await page.getByRole('button', { name: 'Select time 08:00' }).click();
    await page.getByRole('button', { name: /Proceed to Payment/ }).click();
    await mark('checkout', '/customer/booking/checkout', service.name);
    const screenshotDir = path.join(screenshotRoot, String(width));
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'checkout.png'), fullPage: false });
    await page.getByRole('radio', { name: 'Wallet Balance, available' }).click();
    await page.getByRole('button', { name: /^Pay ₱/ }).click();
    await mark('confirmed', '/customer/booking/confirm', 'Booking Confirmed!');
    await page.screenshot({ path: path.join(screenshotDir, 'confirmation.png'), fullPage: false });
  } catch (error) {
    steps.push({ name: 'audit-error', error: error instanceof Error ? error.message : String(error), path: `${new URL(page.url()).pathname}${new URL(page.url()).search}` });
  }

  const createWrite = writes.find((entry) => entry.method === 'POST' && entry.pathname === '/api/v1/bookings');
  const paymentWrite = writes.find((entry) => entry.method === 'POST' && entry.pathname === '/api/v1/payments/intent');
  const payloadSafe = Boolean(
    createWrite?.body &&
    !Object.prototype.hasOwnProperty.call(createWrite.body, 'servicePrice') &&
    !Object.prototype.hasOwnProperty.call(createWrite.body, 'serviceFee') &&
    paymentWrite?.body?.bookingId === 'sequential-booking' &&
    paymentWrite?.body?.paymentMethod === 'wallet',
  );
  const completed = steps.some((step) => step.name === 'confirmed');
  const failed = !completed || !payloadSafe || unmatchedApi.size > 0 || pageErrors.length > 0 || consoleErrors.length > 0 || steps.some((step) => (step.overflow ?? 0) > 1);
  await context.close();
  return { width, completed, payloadSafe, steps, writes, unmatchedApi: [...unmatchedApi], pageErrors, consoleErrors, failed };
}

const browser = await chromium.launch();
const results = [];
const widths = (process.env.AUDIT_WIDTHS ?? '768,1024,1366')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
try {
  for (const width of widths) results.push(await runAtWidth(browser, width));
} finally {
  await browser.close();
}
const reportPath = path.join(here, 'customer-sequential-booking-results.json');
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
const failures = results.filter((result) => result.failed);
process.stdout.write(`${JSON.stringify({ audited: results.length, failed: failures.length, reportPath, failures }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
