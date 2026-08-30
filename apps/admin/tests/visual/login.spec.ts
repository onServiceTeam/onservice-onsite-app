// Phase 14 Remediation #4 — visual baseline spec for LoginPage
// Page: apps/admin/src/pages/LoginPage.tsx
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/login.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/login';

async function submitCredentials(page: Page): Promise<void> {
  await page.getByLabel('Email').fill('admin@onservice.test');
  await page.getByLabel('Password').fill('Visual-password-123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('LoginPage', () => {
  test.use({ authenticated: false });

  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`login-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('submitting state', async ({ page }) => {
        await page.route('**/api/v1/auth/admin/login', (route) => {
          void route;
        });
        await page.goto(ROUTE);
        await submitCredentials(page);
        await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
        await expect(page).toHaveScreenshot(`login-submitting-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('invalid credentials state', async ({ page }) => {
        await page.route('**/api/v1/auth/admin/login', (route) => {
          route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Invalid email or password.' } }),
          });
        });
        await page.goto(ROUTE);
        await submitCredentials(page);
        await expect(page.getByRole('alert')).toContainText('Invalid email or password.');
        await expect(page).toHaveScreenshot(`login-invalid-credentials-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('two-factor challenge', async ({ page }) => {
        await page.route('**/api/v1/auth/admin/login', (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { requires2FA: true, preAuthToken: 'visual-preauth-token' },
            }),
          });
        });
        await page.goto(ROUTE);
        await submitCredentials(page);
        await expect(page.getByRole('heading', { name: 'Verify it’s you' })).toBeVisible();
        await expect(page.getByLabel('Verification code')).toBeFocused();
        await expect(page).toHaveScreenshot(`login-two-factor-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('required two-factor enrollment', async ({ page }) => {
        await page.route('**/api/v1/auth/admin/login', (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { requires2FASetup: true, preAuthToken: 'visual-preauth-token' },
            }),
          });
        });
        await page.route('**/api/v1/auth/admin/2fa/setup', (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                secret: 'JBSWY3DPEHPK3PXP',
                uri: 'otpauth://totp/onService:visual-admin?secret=JBSWY3DPEHPK3PXP&issuer=onService',
              },
            }),
          });
        });
        await page.goto(ROUTE);
        await submitCredentials(page);
        await expect(page.getByRole('heading', { name: 'Secure your admin account' })).toBeVisible();
        await expect(page.getByAltText('Two-factor authentication QR code')).toBeVisible();
        await expect(page).toHaveScreenshot(`login-two-factor-enrollment-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
