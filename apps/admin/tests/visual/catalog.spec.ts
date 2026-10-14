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
// Since 1403b6ba (2026-08-31) CatalogPage reads the authenticated admin
// projection GET /api/v1/catalog/admin/full (catalog.routes.ts), not the
// public /catalog/full. That projection includes inactive services, so each
// subcategory carries isActive. Catalog ids are database UUIDs; since
// f1434967 (2026-09-03) the page rejects a non-UUID categoryId in the URL
// with "Catalog selection unavailable", so the fixture uses real UUIDs.
const CATEGORY_AIRCON_ID = '3f6c1a52-8d4e-4b7a-9c21-5e0f7a1b2c01';
const SERVICE_CLEAN_ID = '3f6c1a52-8d4e-4b7a-9c21-5e0f7a1b2c11';
const SERVICE_INSPECT_ID = '3f6c1a52-8d4e-4b7a-9c21-5e0f7a1b2c12';
const ADMIN_CATALOG_ROUTE = '**/api/v1/catalog/admin/full';
const CATALOG_FIXTURE = [{
  id: CATEGORY_AIRCON_ID, name: 'Aircon', slug: 'aircon', description: 'Aircon maintenance and repair',
  iconUrl: null, displayOrder: 1,
  subcategories: [
    {
      id: SERVICE_CLEAN_ID, categoryId: CATEGORY_AIRCON_ID, name: 'Aircon cleaning', slug: 'aircon-cleaning',
      description: '', pricingType: 'fixed', basePrice: 95000, minPrice: null, maxPrice: null,
      estimatedDurationMinutes: 90, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
      isActive: true,
    },
    {
      id: SERVICE_INSPECT_ID, categoryId: CATEGORY_AIRCON_ID, name: 'Aircon inspection', slug: 'aircon-inspection',
      description: 'Includes a visual inspection and written findings before any repair is approved.',
      pricingType: 'quote', basePrice: null, minPrice: null, maxPrice: null,
      estimatedDurationMinutes: 45, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 2,
      isActive: true,
    },
  ],
}];

async function mockPopulatedCatalog(page: Page): Promise<void> {
  await page.route(ADMIN_CATALOG_ROUTE, (route) => route.fulfill({
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
      // Full GET /auth/me shape (formatUserResponse + mustRotatePassword).
      data: {
        id: '00000000-0000-0000-0000-000000000098',
        phone: '+639170000098',
        email: 'catalog-reader@onservice.test',
        firstName: 'Catalog',
        lastName: 'Reader',
        role: 'admin',
        avatarUrl: null,
        isVerified: true,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
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
        // Stall the admin catalog endpoint so the loading indicator renders.
        await page.route(ADMIN_CATALOG_ROUTE, (route) => {
          void route;
        });
        await page.goto(ROUTE);
        await expect(page.getByText('Loading the service catalog…')).toBeVisible();
        await expect(page.locator('main')).toHaveScreenshot(`catalog-loading-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        await page.route(ADMIN_CATALOG_ROUTE, (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true, data: [] }),
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
        await page.route(ADMIN_CATALOG_ROUTE, (route) => {
          if (route.request().method() === 'GET') {
            // Real errorHandler body for a non-operational 500.
            route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                success: false,
                error: { message: 'An unexpected error occurred. Please try again later.', statusCode: 500 },
              }),
            });
          } else {
            route.continue();
          }
        });
        await page.goto(ROUTE);
        await expect(page.getByText('Service catalog unavailable')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.animate-spin')).toHaveCount(0);
        await expect(page.locator('main')).toHaveScreenshot(`catalog-error-${width}.png`, {
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
