import { expect, test, waitForVisualSettled } from './_fixtures';

const ROUTE = '/data-protection-log';
const DSR_ENDPOINT = /\/api\/v1\/admin\/compliance\/dsr(?:\?.*)?$/;
// data_subject_requests.id and users.id are UUID columns (migration 057), and
// GET /api/v1/admin/compliance/dsr/:id rejects anything else with a 400. The
// page puts the reviewed case id into ?dsrId= and only accepts a UUID there,
// so a non-UUID fixture id paints a false "Invalid privacy case link" error
// behind the review dialog.
const RECEIVED_DSR_ID = '01990b6e-4c00-7a2d-8f31-2b9c0d5e7a41';
// Single-case endpoint the page calls once ?dsrId= holds the reviewed case.
const DSR_DETAIL_ENDPOINT = `**/api/v1/admin/compliance/dsr/${RECEIVED_DSR_ID}`;
// Same fields as DsrRecord in packages/api/src/services/compliance.service.ts.
const RECEIVED_DSR = {
  id: RECEIVED_DSR_ID,
  userId: '01990b6e-3f10-7c55-9e02-6d1a4b8c2f90',
  userEmail: 'privacy-subject@onservice.test',
  userRole: 'customer',
  providerProfileId: null,
  requestType: 'access',
  status: 'received',
  receivedAt: '2026-08-29T04:00:00.000Z',
  dueAt: '2026-09-13T04:00:00.000Z',
  completedAt: null,
  handledBy: null,
  handledByName: null,
  handledByEmail: null,
  userMessage: 'Please provide the personal data connected to my customer account.',
  adminNotes: null,
  responsePayloadUrl: null,
  rejectionReason: null,
  daysUntilDue: 14,
  isOverdue: false,
};

test.describe('DataProtectionLogPage', () => {
  for (const width of [820, 1024, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByRole('heading', { name: 'Data Subject Requests' })).toBeVisible();
        await expect(page.getByText(/current internal 15-day response target/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /Review data request/i })).toBeVisible();
        await expect(page).toHaveScreenshot(`data-protection-log-default-${width}.png`, { fullPage: true });
      });

      test('received case review', async ({ page }) => {
        await page.route(DSR_ENDPOINT, (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { rows: [RECEIVED_DSR], total: 1 } }),
        }));
        // GET /dsr/:id answers { success, data: DsrRecord } (compliance-admin.routes.ts).
        await page.route(DSR_DETAIL_ENDPOINT, (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: RECEIVED_DSR }),
        }));
        await page.goto(ROUTE);
        const detailResponse = page.waitForResponse(DSR_DETAIL_ENDPOINT);
        await page.getByRole('button', { name: /Review data request/i }).click();
        await expect(page.getByRole('dialog')).toContainText('Please provide the personal data');
        await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page.getByText('Invalid privacy case link')).toHaveCount(0);
        expect((await detailResponse).status()).toBe(200);
        await expect(page).toHaveScreenshot(`data-protection-log-review-${width}.png`, { fullPage: true });
      });

      test('loading state', async ({ page }) => {
        await page.route(DSR_ENDPOINT, () => {});
        await page.goto(ROUTE);
        await expect(page.getByText('Loading privacy cases…')).toBeVisible();
        await expect(page).toHaveScreenshot(`data-protection-log-loading-${width}.png`, { fullPage: true });
      });

      test('empty state', async ({ page }) => {
        await page.route(DSR_ENDPOINT, (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { rows: [], total: 0 } }),
        }));
        await page.goto(ROUTE);
        await expect(page.getByText('No matching data requests')).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`data-protection-log-empty-${width}.png`, { fullPage: true });
      });

      test('error state', async ({ page }) => {
        await page.route(DSR_ENDPOINT, (route) => route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Privacy evidence source unavailable.' } }),
        }));
        await page.goto(ROUTE);
        await expect(page.getByText('Privacy cases unavailable')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry privacy queue' })).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`data-protection-log-error-${width}.png`, { fullPage: true });
      });
    });
  }
});
