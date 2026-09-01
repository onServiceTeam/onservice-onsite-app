import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_CHROMIUM_ARGS,
  AUDIT_CONTEXT_OPTIONS,
  AUDIT_SCREENSHOT_OPTIONS,
  installFixedBrowserTime,
  settleBrowserEvidence,
} from '../browser-audit-clock.mjs';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const here = path.dirname(fileURLToPath(import.meta.url));
const screenshotRoot = path.join(here, 'sequential-quote-screenshots');

const customer = {
  id: 'customer-quote-audit', phone: '+639171112333', email: 'quote.audit@invalid.example',
  firstName: 'Mara', lastName: 'Santos', role: 'customer', avatarUrl: null,
};
const category = {
  id: 'category-renovation', name: 'Renovation', slug: 'renovation',
  description: 'Scoped renovation and custom-build services.', iconUrl: null, displayOrder: 1,
};
const service = {
  id: 'subcategory-cabinets', categoryId: category.id, categoryName: category.name, categorySlug: category.slug,
  name: 'Custom Cabinets', slug: 'custom-cabinets',
  description: 'Custom cabinetry quoted from measurements, materials, site photos, and required job details.',
  pricingType: 'quote', basePrice: null, minPrice: null, maxPrice: null,
  estimatedDurationMinutes: null, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
};
const intakeFields = [
  {
    id: 'intake-area', subcategoryId: service.id, fieldKey: 'area_sqm', label: 'Installation area',
    helpText: 'Approximate floor area of the installation zone.', fieldType: 'number', unit: 'sqm',
    options: null, placeholder: 'e.g. 24', isRequired: true, sortOrder: 1, isActive: true,
  },
  {
    id: 'intake-material', subcategoryId: service.id, fieldKey: 'material', label: 'Preferred material',
    helpText: null, fieldType: 'choice', unit: null, options: ['Marine plywood', 'Hardwood'],
    placeholder: null, isRequired: true, sortOrder: 2, isActive: true,
  },
  {
    id: 'intake-occupied', subcategoryId: service.id, fieldKey: 'occupied', label: 'Is the site occupied?',
    helpText: null, fieldType: 'boolean', unit: null, options: null, placeholder: null,
    isRequired: true, sortOrder: 3, isActive: true,
  },
];
const address = {
  id: 'address-quote', label: 'Project site', fullAddress: '42 Governor Cuenco Avenue', barangay: 'Kasambagan',
  city: 'Cebu City', province: 'Cebu', region: 'Region VII', zipCode: '6000',
  latitude: 10.3294, longitude: 123.9124, isDefault: true, notes: 'Gate beside the pharmacy',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};
const area = {
  id: 'area-cebu', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu',
  region: 'Region VII', zipCodes: ['6000'], centerLat: 10.3157, centerLng: 123.8854,
  radiusKm: 30, status: 'active', launchDate: null, launchedAt: '2026-01-01T00:00:00.000Z',
  minProvidersToLaunch: 1, activeProviderCount: 12, activeCustomerCount: 100, totalBookings: 500,
  isDefault: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};
const envelope = (data, extra = {}) => ({ success: true, data, ...extra });
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function runAtWidth(browser, width) {
  const context = await browser.newContext({
    ...AUDIT_CONTEXT_OPTIONS,
    viewport: { width, height: 900 },
  });
  const page = await context.newPage();
  await installFixedBrowserTime(page);
  const unmatchedApi = new Set();
  const pageErrors = [];
  const consoleErrors = [];
  const writes = [];
  const steps = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (value.includes('/socket.io/') && value.includes('WebSocket connection')) return;
    consoleErrors.push(value);
  });
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'browser-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'browser-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, customer);

  const requestedBooking = {
    id: 'quote-booking', customerId: customer.id, providerId: null,
    categoryId: category.id, subcategoryId: service.id, bookingType: 'quote_based', status: 'requested',
    escrowStatus: 'pending', servicePrice: 0, serviceFee: 0, totalAmount: 0,
    description: 'Build fitted kitchen cabinets with durable moisture-resistant materials and concealed hinges.',
    address: address.fullAddress, barangay: address.barangay, city: address.city, province: address.province,
    latitude: address.latitude, longitude: address.longitude, scheduledAt: null, completedAt: null,
    confirmedAt: null, cancelledAt: null, cancellationReason: null, paymentMethod: null,
    surgeMultiplier: 1, surgeAmount: 0, rebookedFromId: null, sukiDiscount: 0,
    jobPhotos: ['https://cdn.invalid/job-1.png', 'https://cdn.invalid/job-2.png'],
    providerBeforePhotos: [], providerAfterPhotos: [], createdAt: '2026-08-31T00:00:00.000Z',
    serviceName: service.name, categoryName: category.name,
  };
  const proofSummary = {
    booking: { id: requestedBooking.id, status: 'requested', description: requestedBooking.description, workStartedAt: null, workCompletedAt: null, completedAt: null, confirmedAt: null, completionNotes: null },
    readiness: { stage: 'requested', readyForProviderCompletion: false, minimumTimeOnSiteMinutes: 0, afterPhotosRequired: 2, blockers: [], qualityFlags: [] },
    checklist: null, photos: [], signatures: { identityCaveat: 'No signatures recorded.', records: [] },
    changeOrders: [], communications: { chatMessageCount: 0, supportTickets: [] }, dispute: null,
  };

  await page.route('**/api/v1/**', async (intercepted) => {
    const request = intercepted.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    if (method !== 'GET') {
      let body = null;
      const contentType = request.headers()['content-type'] ?? '';
      if (contentType.includes('multipart/form-data')) body = '[multipart image payload]';
      else {
        try { body = request.postDataJSON(); } catch { body = request.postData(); }
      }
      writes.push({ method, pathname, body, contentType });
    }
    let response;
    if (pathname === '/api/v1/config') response = envelope({ maxQuotesPerBooking: 5 });
    else if (pathname === '/api/v1/auth/me') response = envelope(customer);
    else if (pathname === `/api/v1/catalog/${category.slug}`) response = envelope({ ...category, subcategories: [service] });
    else if (pathname === `/api/v1/catalog/subcategories/${service.id}/intake-fields`) response = envelope(intakeFields);
    else if (pathname === '/api/v1/addresses') response = envelope([address]);
    else if (pathname === '/api/v1/service-areas') response = envelope([area]);
    else if (pathname === '/api/v1/service-areas/check') response = envelope({ covered: true, area, nearestArea: null });
    else if (pathname === '/api/v1/compliance/my-pending-consents') response = envelope([]);
    else if (pathname === '/api/v1/uploads' && method === 'POST') response = envelope([
      { id: 'upload-1', url: 'https://cdn.invalid/job-1.png', filename: 'job-1.png', mimeType: 'image/png', sizeBytes: tinyPng.length },
      { id: 'upload-2', url: 'https://cdn.invalid/job-2.png', filename: 'job-2.png', mimeType: 'image/png', sizeBytes: tinyPng.length },
    ]);
    else if (pathname === '/api/v1/bookings/job-request' && method === 'POST') response = envelope(requestedBooking);
    else if (pathname === `/api/v1/bookings/${requestedBooking.id}`) response = envelope(requestedBooking);
    else if (pathname === `/api/v1/uploads/booking-photo/${requestedBooking.id}`) response = envelope([]);
    else if (pathname === `/api/v1/bookings/${requestedBooking.id}/proof-summary`) response = envelope(proofSummary);
    else {
      unmatchedApi.add(`${method} ${pathname}`);
      await intercepted.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: `No fixture for ${method} ${pathname}` } }) });
      return;
    }
    await intercepted.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });

  const mark = async (name, expectedPath, expectedText) => {
    await page.waitForFunction(({ pathPart, textPart }) => {
      const content = document.body.innerText.replace(/\s+/g, ' ');
      return location.pathname.includes(pathPart) && content.toLowerCase().includes(textPart.toLowerCase());
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
    await page.getByRole('button', { name: 'Describe job' }).click();
    await mark('job-request', '/customer/booking/job-request', 'Request Custom Quote');
    await page.getByRole('button', { name: 'Choose custom job address' }).click();
    await mark('address-picker', '/customer/address-picker', 'Select Address');
    await page.getByRole('button', { name: 'Use saved address Project site' }).click();
    await page.getByRole('button', { name: 'Confirm Address' }).click();
    await mark('job-request-with-address', '/customer/booking/job-request', address.fullAddress);
    await page.getByLabel('Describe the custom job').fill(requestedBooking.description);
    await page.getByLabel('Installation area').fill('24');
    await page.getByRole('radio', { name: 'Preferred material: Marine plywood' }).click();
    await page.getByRole('radio', { name: 'Is the site occupied?: Yes' }).click();
    await page.getByLabel('Minimum budget in pesos').fill('50000');
    await page.getByLabel('Maximum budget in pesos').fill('80000');
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add a custom job photo' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([
      { name: 'job-1.png', mimeType: 'image/png', buffer: tinyPng },
      { name: 'job-2.png', mimeType: 'image/png', buffer: tinyPng },
    ]);
    await page.waitForFunction(() => document.body.innerText.includes('Remove custom job photo 2') || document.querySelectorAll('img').length >= 2, undefined, { timeout: 15_000 }).catch(() => undefined);
    const screenshotDir = path.join(screenshotRoot, String(width));
    await mkdir(screenshotDir, { recursive: true });
    await settleBrowserEvidence(page);
    await page.screenshot({ path: path.join(screenshotDir, 'completed-request.png'), fullPage: true, ...AUDIT_SCREENSHOT_OPTIONS });
    await page.getByRole('button', { name: 'Submit custom job request' }).click();
    await mark('booking-detail', `/customer/booking/${requestedBooking.id}`, 'View Quotes');
    await settleBrowserEvidence(page);
    await page.screenshot({ path: path.join(screenshotDir, 'requested-booking.png'), fullPage: true, ...AUDIT_SCREENSHOT_OPTIONS });
  } catch (error) {
    steps.push({ name: 'audit-error', error: error instanceof Error ? error.message : String(error), path: `${new URL(page.url()).pathname}${new URL(page.url()).search}` });
  }

  const uploadWrite = writes.find((entry) => entry.method === 'POST' && entry.pathname === '/api/v1/uploads');
  const requestWrite = writes.find((entry) => entry.method === 'POST' && entry.pathname === '/api/v1/bookings/job-request');
  const payloadSafe = Boolean(
    uploadWrite?.contentType.includes('multipart/form-data') &&
    requestWrite?.body?.categoryId === category.id &&
    requestWrite?.body?.subcategoryId === service.id &&
    requestWrite?.body?.address === address.fullAddress &&
    requestWrite?.body?.barangay === address.barangay &&
    requestWrite?.body?.latitude === address.latitude &&
    requestWrite?.body?.longitude === address.longitude &&
    requestWrite?.body?.budgetMin === 5_000_000 &&
    requestWrite?.body?.budgetMax === 8_000_000 &&
    requestWrite?.body?.intakeAnswers?.area_sqm === 24 &&
    requestWrite?.body?.intakeAnswers?.material === 'Marine plywood' &&
    requestWrite?.body?.intakeAnswers?.occupied === true &&
    Array.isArray(requestWrite?.body?.jobPhotos) && requestWrite.body.jobPhotos.length === 2 &&
    !Object.prototype.hasOwnProperty.call(requestWrite.body, 'servicePrice') &&
    !Object.prototype.hasOwnProperty.call(requestWrite.body, 'serviceFee')
  );
  const completed = steps.some((step) => step.name === 'booking-detail');
  const failed = !completed || !payloadSafe || unmatchedApi.size > 0 || pageErrors.length > 0 || consoleErrors.length > 0 || steps.some((step) => (step.overflow ?? 0) > 1);
  await context.close();
  return { width, completed, payloadSafe, steps, writes, unmatchedApi: [...unmatchedApi], pageErrors, consoleErrors, failed };
}

const browser = await chromium.launch({ args: AUDIT_CHROMIUM_ARGS });
const results = [];
const widths = (process.env.AUDIT_WIDTHS ?? '768,1024,1366').split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
try {
  for (const width of widths) results.push(await runAtWidth(browser, width));
} finally {
  await browser.close();
}
const reportPath = path.join(here, 'customer-sequential-quote-results.json');
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
const failures = results.filter((result) => result.failed);
process.stdout.write(`${JSON.stringify({ audited: results.length, failed: failures.length, reportPath, failures }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
