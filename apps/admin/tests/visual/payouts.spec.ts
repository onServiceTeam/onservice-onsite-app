import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/payouts';
type ListMode = 'success' | 'empty' | 'error' | 'loading';

const VISUAL_PAYOUT = {
  id: 'payout-visual-1',
  providerId: 'provider-visual-1',
  walletId: 'wallet-visual-1',
  amount: 52_500_000,
  method: 'bank_transfer',
  destinationAccount: '•••• 2481',
  accountName: 'Visual Provider Co.',
  status: 'aml_review_pending',
  paymongoTransferId: null,
  failureReason: null,
  rejectionReason: null,
  notes: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-08-31T01:00:00.000Z',
  completedAt: null,
  requiresAmlReview: true,
  amlThresholdAtRequest: 50_000_000,
  providerBusinessName: 'Visual Provider Co.',
};

async function mockPayouts(page: Page, mode: ListMode): Promise<void> {
  await page.route('**/api/v1/payouts**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (mode === 'loading') {
      await new Promise<void>(() => {});
      return;
    }
    if (mode === 'error') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Payout queue unavailable.' } }) });
      return;
    }
    const data = mode === 'success' ? [VISUAL_PAYOUT] : [];
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

test.describe('PayoutsPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockPayouts(page, 'success');
        await page.goto(ROUTE);
        await expect(page.getByRole('link', { name: 'Visual Provider Co.' })).toBeVisible();
        await expect(page.getByText('No payout requests found.')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`payouts-default-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('loading state', async ({ page }) => {
        await mockPayouts(page, 'loading');
        await page.goto(ROUTE);
        await expect(page.getByText('Loading...')).toBeVisible();
        await expect(page).toHaveScreenshot(`payouts-loading-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('empty state', async ({ page }) => {
        await mockPayouts(page, 'empty');
        await page.goto(ROUTE);
        await expect(page.getByText('No payout requests found.')).toBeVisible();
        await expect(page).toHaveScreenshot(`payouts-empty-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('error state', async ({ page }) => {
        await mockPayouts(page, 'error');
        await page.goto(ROUTE);
        await expect(page.getByText('Failed to load payouts. Please try refreshing the page.')).toBeVisible();
        await expect(page.getByText('Loading...')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`payouts-error-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });
    });
  }
});
