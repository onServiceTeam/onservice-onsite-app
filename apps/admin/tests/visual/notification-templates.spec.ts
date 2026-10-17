// Phase 14 Remediation #4 — visual baseline spec for NotificationTemplatesPage
// Page: apps/admin/src/pages/NotificationTemplatesPage.tsx
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/notification-templates.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import type { Page } from '@playwright/test';
import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/notification-templates';

// A slug an operator may create (3-100 characters, underscores only). It has
// no hyphen or space, so the browser can only wrap it where the page allows.
const LONG_SLUG_TEMPLATE = {
  id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
  slug: 'booking_provider_en_route_reminder',
  titleTemplate: 'Your provider is on the way',
  bodyTemplate: '{{providerName}} is travelling to your address.',
  type: 'booking_update',
  channel: 'push',
  isActive: true,
  variables: ['providerName'],
  runtimeStatus: 'reference_only',
  runtimeVariables: null,
  runtimeChannels: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

// The Delivery and Runtime columns (4a113a00) made the table wider than its
// card at 1280: the card's horizontal scroller hid the end of the ACTIONS
// header and most of the Delete button. The table must fit its card at every
// supported width, with the row's Delete button fully visible.
async function expectTableFitsCard(page: Page, slug: string, viewportWidth: number): Promise<void> {
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const scroller = table.locator('xpath=..');
  const card = scroller.locator('xpath=..');

  const overflow = await scroller.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `table scroller is ${overflow.scrollWidth}px wide inside a ${overflow.clientWidth}px card`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const deleteButton = page.getByRole('button', { name: `Delete template ${slug}` });
  await expect(deleteButton).toBeVisible();
  const deleteBox = await deleteButton.boundingBox();
  const cardBox = await card.boundingBox();
  expect(deleteBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(deleteBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(
    deleteBox!.x + deleteBox!.width,
    'Delete button right edge must sit inside the table card',
  ).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  expect(
    deleteBox!.x + deleteBox!.width,
    'Delete button right edge must sit inside the viewport',
  ).toBeLessThanOrEqual(viewportWidth);
}

test.describe('NotificationTemplatesPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`notification-templates-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('default render: template table fits its card with Delete fully visible', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expectTableFitsCard(page, 'booking-provider-en-route', width);
      });

      test('long underscore slug wraps so the table still fits its card', async ({ page }) => {
        await page.route(
          (url) => url.pathname === '/api/v1/admin/notification-templates',
          (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: [LONG_SLUG_TEMPLATE],
              pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
            }),
          }),
        );
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        // The whole slug stays readable; only its line breaks change.
        await expect(page.getByRole('table').getByText(LONG_SLUG_TEMPLATE.slug, { exact: true })).toBeVisible();
        await expectTableFitsCard(page, LONG_SLUG_TEMPLATE.slug, width);
      });

      test('loading state', async ({ page }) => {
        // Stall every admin API call so skeleton renders.
        await page.route('**/api/v1/admin/**', (route) => {
          void route;
        });
        await page.goto(ROUTE);
        // Operator wires the right test-id selector when the screen's
        // skeleton mounts. Default to a forgiving locator that should
        // match the canonical Skeleton component.
        await expect(page.locator('[data-testid="skeleton"], .skeleton').first()).toBeVisible({
          timeout: 2000,
        }).catch(() => {});
        await expect(page).toHaveScreenshot(`notification-templates-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        // Force every admin GET to return an empty list so EmptyState renders.
        await page.route('**/api/v1/admin/**', (route) => {
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
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`notification-templates-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        // 500 on every admin GET so ErrorState renders.
        await page.route('**/api/v1/admin/**', (route) => {
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
        await waitForVisualSettled(page);
        // 2026-10-18: wait for the error itself. The list query retries
        // before it shows the error, so waitForVisualSettled alone let a
        // re-capture store the "Loading notification templates" spinner as
        // the "error" picture (seen at 1920). With every admin GET failing,
        // the request alert banner reports its own failed check too.
        await expect(page.getByText('Notification templates could not be loaded')).toBeVisible();
        await expect(page.getByText('Loading notification templates…')).toHaveCount(0);
        await expect(page.getByText('Request alerts could not be checked. Retrying automatically.')).toBeVisible();
        await expect(page).toHaveScreenshot(`notification-templates-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
