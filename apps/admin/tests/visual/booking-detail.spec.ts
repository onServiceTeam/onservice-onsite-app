import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/bookings/BK-0001';
const API_ROUTE = '**/api/v1/admin/bookings/BK-0001';

async function mockBookingFailure(page: Page, status: number, message: string): Promise<void> {
  await page.route(API_ROUTE, (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message } }),
  }));
}

test.describe('BookingDetailPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page.getByRole('heading', { name: 'Booking #BK-0001' })).toBeVisible();
        await expect(page.getByText('Cebu Home Care')).toBeVisible();
        await expect(page).toHaveScreenshot(`booking-detail-default-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`booking-detail-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('missing booking state', async ({ page }) => {
        await mockBookingFailure(page, 404, 'Booking not found.');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Failed to load booking');
        await expect(page.getByRole('alert')).toContainText('Booking not found.');
        await expect(page).toHaveScreenshot(`booking-detail-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('error state', async ({ page }) => {
        await mockBookingFailure(page, 500, 'Booking service unavailable.');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Booking service unavailable.');
        await expect(page.getByRole('status')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`booking-detail-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
