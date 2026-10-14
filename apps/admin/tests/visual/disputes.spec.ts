import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/disputes';
type ListMode = 'success' | 'empty' | 'error' | 'loading';

const VISUAL_DISPUTE = {
  id: 'dispute-visual-1',
  bookingId: 'booking-visual-1',
  filedBy: 'customer-visual-1',
  type: 'service_quality',
  description: 'Customer and provider need an evidence-based service review.',
  status: 'under_review',
  tier: 2,
  assignedTo: null,
  resolutionType: null,
  refundAmount: 0,
  refundPercent: null,
  decisionNotes: null,
  providerResponse: null,
  providerRespondedAt: null,
  autoResolved: false,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: '2026-08-31T01:00:00.000Z',
  updatedAt: '2026-08-31T01:00:00.000Z',
  customerName: 'Visual Customer',
  providerName: 'Visual Provider Co.',
};

async function mockDisputes(page: Page, mode: ListMode): Promise<void> {
  await page.route('**/api/v1/disputes**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (mode === 'loading') {
      await new Promise<void>(() => {});
      return;
    }
    if (mode === 'error') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'An unexpected error occurred. Please try again later.', statusCode: 500 } }) });
      return;
    }
    const data = mode === 'success' ? [VISUAL_DISPUTE] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data,
        pagination: { page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0 },
      }),
    });
  });
}

test.describe('DisputesPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockDisputes(page, 'success');
        await page.goto(ROUTE);
        await expect(page.getByText('Visual Customer')).toBeVisible();
        await expect(page.getByText('No disputes found.')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`disputes-default-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('loading state', async ({ page }) => {
        await mockDisputes(page, 'loading');
        await page.goto(ROUTE);
        await expect(page.getByText('Loading...')).toBeVisible();
        await expect(page).toHaveScreenshot(`disputes-loading-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('empty state', async ({ page }) => {
        await mockDisputes(page, 'empty');
        await page.goto(ROUTE);
        await expect(page.getByText('No disputes found.')).toBeVisible();
        await expect(page).toHaveScreenshot(`disputes-empty-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('error state', async ({ page }) => {
        await mockDisputes(page, 'error');
        await page.goto(ROUTE);
        // UX-1260 (6b3a6778, 2026-09-04) replaced the one-line red text with an
        // ErrorState that has a heading, a "not an empty queue" warning and a retry button.
        await expect(page.getByRole('heading', { name: 'Dispute queue unavailable' })).toBeVisible();
        await expect(page.getByText('The dispute queue could not be read. Do not treat this as an empty queue.')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry disputes' })).toBeVisible();
        await expect(page.getByText('No disputes found.')).toHaveCount(0);
        await expect(page.getByText('Loading...')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`disputes-error-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });
    });
  }
});
