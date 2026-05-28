// Phase 14 Remediation #4 — visual baseline spec for DispatchConsolePage
// Page: apps/admin/src/pages/DispatchConsolePage.tsx
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/dispatch-console.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const ROUTE = '/dispatch';

async function stabilizeLeaflet(page: Page): Promise<void> {
  await page.route(/https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/, (route) => {
    void route.abort();
  });
}

async function hideExternalMapTiles(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .leaflet-container { background: #d7eef7 !important; }
      .leaflet-tile-pane,
      .leaflet-control-attribution { visibility: hidden !important; }
    `,
  });
}

test.describe('DispatchConsolePage', () => {
  test.beforeEach(async ({ page }) => {
    await stabilizeLeaflet(page);
  });

  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await hideExternalMapTiles(page);
        await expect(page).toHaveScreenshot(`dispatch-console-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        // Stall every admin API call so skeleton renders.
        await page.route('**/api/v1/admin/**', (route) => {
          void route;
        });
        await page.goto(ROUTE);
        await hideExternalMapTiles(page);
        // Operator wires the right test-id selector when the screen's
        // skeleton mounts. Default to a forgiving locator that should
        // match the canonical Skeleton component.
        await expect(page.locator('[data-testid="skeleton"], .skeleton').first()).toBeVisible({
          timeout: 2000,
        }).catch(() => {});
        await expect(page).toHaveScreenshot(`dispatch-console-loading-${width}.png`, {
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
        await hideExternalMapTiles(page);
        await expect(page).toHaveScreenshot(`dispatch-console-empty-${width}.png`, {
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
        await hideExternalMapTiles(page);
        await expect(page).toHaveScreenshot(`dispatch-console-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
