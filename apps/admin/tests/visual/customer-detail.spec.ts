import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/customers/CU-0001';
const API_ROUTE = '**/api/v1/admin/customers/CU-0001';

async function mockCustomerFailure(page: Page, status: number, message: string): Promise<void> {
  await page.route(API_ROUTE, (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message } }),
  }));
}

test.describe('CustomerDetailPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page.getByRole('heading', { name: 'Visual Baseline' })).toBeVisible();
        await expect(page.getByText('12 Mango Avenue, Lahug')).toBeVisible();
        await expect(page).toHaveScreenshot(`customer-detail-default-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`customer-detail-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('missing customer state', async ({ page }) => {
        await mockCustomerFailure(page, 404, 'Customer not found.');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Failed to load customer');
        await expect(page.getByRole('alert')).toContainText('Customer not found.');
        await expect(page).toHaveScreenshot(`customer-detail-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('error state', async ({ page }) => {
        await mockCustomerFailure(page, 500, 'Customer service unavailable.');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Customer service unavailable.');
        await expect(page.getByRole('status')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`customer-detail-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
