import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/staff';
type DirectoryMode = 'success' | 'empty' | 'error' | 'loading';

const VISUAL_ROLE = {
  id: 'role-visual-support-lead',
  name: 'support_lead',
  description: 'Owns escalated customer and provider support cases.',
  permissions: ['support.read', 'support.update'],
  created_at: '2026-08-31T01:00:00.000Z',
  updated_at: '2026-08-31T01:00:00.000Z',
  staff_count: 1,
};

const VISUAL_STAFF = {
  id: 'staff-visual-1',
  profile_id: 'staff-visual-1',
  user_id: 'user-visual-support-lead',
  role_id: VISUAL_ROLE.id,
  is_active: true,
  last_login_at: '2026-08-31T01:00:00.000Z',
  created_at: '2026-08-30T01:00:00.000Z',
  user_phone: '+63 917 555 0182',
  user_email: 'support.lead@onservice.ph',
  user_first_name: 'Maria',
  user_last_name: 'Santos',
  role_name: VISUAL_ROLE.name,
  account_role: 'admin',
  account_is_active: true,
  active_support_cases: '3',
};

async function mockStaffDirectory(page: Page, mode: DirectoryMode): Promise<void> {
  await page.route('**/api/v1/staff**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }

    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/v1/staff/roles') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [VISUAL_ROLE] }),
      });
      return;
    }

    if (pathname !== '/api/v1/staff') {
      await route.continue();
      return;
    }

    if (mode === 'loading') {
      await new Promise<void>(() => {});
      return;
    }
    if (mode === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Staff directory unavailable.' } }),
      });
      return;
    }

    const data = mode === 'success' ? [VISUAL_STAFF] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data,
        meta: {
          total: data.length,
          summary: {
            totalProfiles: data.length,
            activeProfiles: data.length,
            inactiveProfiles: 0,
            activeAccounts: data.length,
            inactiveAccounts: 0,
            activeSupportOwners: data.length,
            totalAdminAccounts: data.length,
            unprofiledAdminAccounts: 0,
          },
        },
      }),
    });
  });
}

test.describe('StaffRolesPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockStaffDirectory(page, 'success');
        await page.goto(ROUTE);
        await expect(page.getByText('Maria Santos')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open active cases (3)' })).toBeVisible();
        await expect(page).toHaveScreenshot(`staff-roles-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        await mockStaffDirectory(page, 'loading');
        await page.goto(ROUTE);
        await expect(page.getByText('Loading staff directory...')).toBeVisible();
        await expect(page).toHaveScreenshot(`staff-roles-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        await mockStaffDirectory(page, 'empty');
        await page.goto(ROUTE);
        await expect(page.getByText('No staff accounts or directory profiles match these filters.')).toBeVisible();
        await expect(page).toHaveScreenshot(`staff-roles-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        await mockStaffDirectory(page, 'error');
        await page.goto(ROUTE);
        await expect(page.getByText('Failed to load staff members. Please try again.')).toBeVisible();
        await expect(page.getByText('Loading staff directory...')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`staff-roles-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
