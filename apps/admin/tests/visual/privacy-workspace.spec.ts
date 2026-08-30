import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const DPO = {
  id: '00000000-0000-0000-0000-000000000519',
  email: 'privacy-officer@onservice.test',
  phone: '+639170000519',
  firstName: 'Privacy',
  lastName: 'Officer',
  role: 'dpo',
  avatarUrl: null,
  isVerified: true,
  isActive: true,
  mustRotatePassword: false,
};

async function mockDpo(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: DPO }),
  }));
  await page.route('**/api/v1/admin/compliance/dsr-alerts', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: [{
        id: 'dsr-visual-1', requestType: 'access',
        dueAt: '2026-09-01T04:00:00.000Z', daysUntilDue: 1, isOverdue: false,
      }],
    }),
  }));
}

test.describe('DPO Privacy Workspace responsive contract', () => {
  for (const width of [768, 1280]) {
    test(`privacy-only landing at ${width}px`, async ({ page }) => {
      test.setTimeout(30_000);
      await mockDpo(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/privacy');

      await expect(page.getByRole('heading', { name: 'Privacy Workspace' })).toBeVisible();
      if (width >= 1024) await expect(page.getByText('Privacy Console')).toBeVisible();
      else await expect(page.getByText('Privacy Console')).toBeHidden();
      await expect(page.getByRole('link', { name: 'Bookings' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Breach Response' })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.locator('main')).toHaveScreenshot(`privacy-workspace-dpo-${width}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
