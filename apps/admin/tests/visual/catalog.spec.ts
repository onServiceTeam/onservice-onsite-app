// Phase 14 Remediation #4 — visual baseline spec for CatalogPage
// Page: apps/admin/src/pages/CatalogPage.tsx
//
// Captures 7 operator states at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/catalog.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const ROUTE = '/catalog';
const CATALOG_FIXTURE = [{
  id: 'cat-aircon', name: 'Aircon', slug: 'aircon', description: 'Aircon maintenance and repair',
  iconUrl: null, displayOrder: 1,
  subcategories: [
    {
      id: 'svc-clean', categoryId: 'cat-aircon', name: 'Aircon cleaning', slug: 'aircon-cleaning',
      description: '', pricingType: 'fixed', basePrice: 95000, minPrice: null, maxPrice: null,
      estimatedDurationMinutes: 90, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
    },
    {
      id: 'svc-inspect', categoryId: 'cat-aircon', name: 'Aircon inspection', slug: 'aircon-inspection',
      description: 'Includes a visual inspection and written findings before any repair is approved.',
      pricingType: 'quote', basePrice: null, minPrice: null, maxPrice: null,
      estimatedDurationMinutes: 45, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 2,
    },
  ],
}];

async function mockPopulatedCatalog(page: Page): Promise<void> {
  await page.route('**/api/v1/catalog/full', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: CATALOG_FIXTURE }),
  }));
}

async function mockOrdinaryAdmin(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        id: '00000000-0000-0000-0000-000000000098',
        email: 'catalog-reader@onservice.test',
        firstName: 'Catalog',
        lastName: 'Reader',
        role: 'admin',
        isVerified: true,
        isActive: true,
        mustRotatePassword: false,
      },
    }),
  }));
}

test.describe('CatalogPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockPopulatedCatalog(page);
        await page.goto(ROUTE);
        await expect(page.getByText('1 active service need customer scope.')).toBeVisible();
        await expect(page.locator('main')).toHaveScreenshot(`catalog-default-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('ordinary admin read-only workspace', async ({ page }) => {
        await mockOrdinaryAdmin(page);
        await mockPopulatedCatalog(page);
        await page.goto(ROUTE);
        await expect(page.getByText(/read-only catalog access/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /Add Category/i })).toHaveCount(0);
        await page.getByRole('button', { name: 'Expand Aircon services' }).click();
        await expect(page.getByRole('button', { name: 'Edit service Aircon cleaning' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Show add-ons for Aircon cleaning' })).toBeVisible();
        await expect(page.locator('main')).toHaveScreenshot(`catalog-read-only-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('missing-scope queue', async ({ page }) => {
        await mockPopulatedCatalog(page);
        await page.goto(ROUTE);
        await page.getByRole('button', { name: /1 Need customer scope/i }).click();
        await expect(page.getByText('Missing customer scope')).toBeVisible();
        await expect(page.locator('main')).toHaveScreenshot(`catalog-needs-scope-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('customer preview editor', async ({ page }) => {
        await mockPopulatedCatalog(page);
        await page.goto(ROUTE);
        await page.getByRole('button', { name: /1 Need customer scope/i }).click();
        await page.getByRole('button', { name: 'Edit service Aircon cleaning' }).click();
        await expect(page.getByLabel('Customer service preview')).toBeVisible();
        await expect(page.locator('main')).toHaveScreenshot(`catalog-customer-preview-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        // Stall the public catalog endpoint so the loading indicator renders.
        await page.route('**/api/v1/catalog/full', (route) => {
          void route;
        });
        await page.goto(ROUTE);
        await expect(page.locator('.animate-spin')).toBeVisible();
        await expect(page.locator('main')).toHaveScreenshot(`catalog-loading-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        await page.route('**/api/v1/catalog/full', (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: [], pagination: { total: 0, page: 1 } }),
            });
          } else {
            route.continue();
          }
        });
        await page.goto(ROUTE);
        await expect(page.getByRole('heading', { name: 'Service Catalog' })).toBeVisible();
        await expect(page.getByText('No categories yet. Create one to get started.')).toBeVisible();
        await expect(page.locator('.animate-spin')).toHaveCount(0);
        await expect(page.locator('main')).toHaveScreenshot(`catalog-empty-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        await page.route('**/api/v1/catalog/full', (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: { message: 'server_error' } }),
            });
          } else {
            route.continue();
          }
        });
        await page.goto(ROUTE);
        await expect(page.getByText('Failed to load catalog. Please try again.')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.animate-spin')).toHaveCount(0);
        await expect(page.locator('main')).toHaveScreenshot(`catalog-error-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
