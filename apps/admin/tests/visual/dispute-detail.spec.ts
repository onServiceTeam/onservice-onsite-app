import type { Page } from '@playwright/test';
import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/disputes/DSP-0001';
const API_ROUTE = '**/api/v1/admin/disputes/DSP-0001';

async function mockDisputeFailure(page: Page, status: number, message: string): Promise<void> {
  await page.route(API_ROUTE, (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message } }),
  }));
}

test.describe('DisputeDetailPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page.getByRole('heading', { name: 'Dispute #DSP-0001' })).toBeVisible();
        await expect(page.getByText('The completed cleanup did not cover the agreed kitchen scope.')).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`dispute-detail-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('loading state', async ({ page }) => {
        await page.route(API_ROUTE, async () => {
          await new Promise<void>(() => {});
        });
        await page.goto(ROUTE);
        await expect(page.getByRole('status')).toContainText('Loading…');
        await expect(page).toHaveScreenshot(`dispute-detail-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('missing dispute state', async ({ page }) => {
        await mockDisputeFailure(page, 404, 'Dispute not found.');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Failed to load dispute');
        await expect(page.getByRole('alert')).toContainText('Dispute not found.');
        await expect(page).toHaveScreenshot(`dispute-detail-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('error state', async ({ page }) => {
        await mockDisputeFailure(page, 500, 'Dispute service unavailable.');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Dispute service unavailable.');
        await expect(page.getByRole('status')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`dispute-detail-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
