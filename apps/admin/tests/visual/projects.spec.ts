import type { Page, Route } from '@playwright/test';
import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/projects';

const VISUAL_PROJECT = {
  id: 'PROJECT-VISUAL-0001',
  customerId: 'CU-0001',
  providerId: 'PV-0001',
  customerName: 'Visual Customer',
  providerName: 'Cebu Home Care',
  title: 'Post-construction turnover plan',
  description: 'Coordinate the final cleanup, inspection, and material choices before handover.',
  city: 'Cebu City',
  status: 'active',
  estimatedTotal: 185_000,
  createdAt: '2026-08-31T01:00:00.000Z',
};

type ListMode = 'success' | 'empty' | 'error' | 'loading';

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockProjectsApi(page: Page, mode: ListMode): Promise<void> {
  await page.route('**/api/v1/admin/projects**', async (route) => {
    if (mode === 'loading') {
      await new Promise<void>(() => {});
      return;
    }
    if (mode === 'error') {
      await fulfillJson(route, { error: { message: 'Project planning index unavailable.' } }, 500);
      return;
    }

    const projects = mode === 'success' ? [VISUAL_PROJECT] : [];
    await fulfillJson(route, {
      success: true,
      data: projects,
      summary: {
        totalProjects: projects.length,
        activeProjects: projects.length,
        legacyProviderLinks: projects.length,
      },
      pagination: {
        page: 1,
        pageSize: 20,
        total: projects.length,
        totalPages: projects.length === 0 ? 0 : 1,
      },
    });
  });
}

test.describe('ProjectsPage', () => {
  for (const width of [768, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockProjectsApi(page, 'success');
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('Post-construction turnover plan')).toBeVisible();
        const overflow = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        await expect(page).toHaveScreenshot(`projects-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        await mockProjectsApi(page, 'loading');
        await page.goto(ROUTE);
        await expect(page.getByText('Loading customer planning records…')).toBeVisible();
        await expect(page).toHaveScreenshot(`projects-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        await mockProjectsApi(page, 'empty');
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('No project planning records match')).toBeVisible();
        await expect(page).toHaveScreenshot(`projects-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        await mockProjectsApi(page, 'error');
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('Projects unavailable')).toBeVisible();
        await expect(page).toHaveScreenshot(`projects-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
