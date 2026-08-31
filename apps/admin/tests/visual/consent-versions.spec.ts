import { expect, test, waitForVisualSettled } from './_fixtures';

const ROUTE = '/consent-versions';
const CONSENT_ENDPOINT = /\/api\/v1\/admin\/compliance\/consent-versions$/;
const EMPTY_BUNDLE = {
  allowedConsentTypes: [
    'privacy_policy', 'terms_of_service', 'marketing_consent', 'ic_agreement',
    'cookie_policy', 'data_processing', 'biometric_consent',
  ],
  summaries: [],
  published: [],
};

test.describe('ConsentVersionsPage', () => {
  for (const width of [820, 1024, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('current evidence', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByRole('heading', { name: 'Consent Versions' })).toBeVisible();
        const currentEvidence = width < 1024
          ? page.locator('section[aria-label="Current consent version cards"]').getByText('privacy_policy')
          : page.getByRole('table').getByText('privacy_policy');
        await expect(currentEvidence).toBeVisible();
        await expect(page.getByText(/Publishing does not certify legal compliance/i)).toBeVisible();
        await expect(page).toHaveScreenshot(`consent-versions-default-${width}.png`, { fullPage: true });
      });

      test('published audit trail', async ({ page }) => {
        await page.goto(ROUTE);
        await page.getByRole('tab', { name: 'Audit trail' }).click();
        const publishEvidence = width < 1024
          ? page.locator('section[aria-label="Published consent version cards"]').getByText(/Clarified provider verification/i)
          : page.getByRole('table').getByText(/Clarified provider verification/i);
        await expect(publishEvidence).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`consent-versions-history-${width}.png`, { fullPage: true });
      });

      test('publish dialog', async ({ page }) => {
        await page.goto(ROUTE);
        await page.getByRole('button', { name: 'Publish a new consent version' }).click();
        await expect(page.getByRole('dialog')).toContainText('Creates an audited platform version');
        await expect(page.getByRole('button', { name: 'Publish version' })).toBeDisabled();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`consent-versions-publish-${width}.png`, { fullPage: true });
      });

      test('loading state', async ({ page }) => {
        await page.route(CONSENT_ENDPOINT, () => {});
        await page.goto(ROUTE);
        await expect(page.getByText('Loading consent evidence…')).toBeVisible();
        await expect(page).toHaveScreenshot(`consent-versions-loading-${width}.png`, { fullPage: true });
      });

      test('empty state', async ({ page }) => {
        await page.route(CONSENT_ENDPOINT, (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: EMPTY_BUNDLE }),
        }));
        await page.goto(ROUTE);
        await expect(page.getByText('No consent records yet')).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`consent-versions-empty-${width}.png`, { fullPage: true });
      });

      test('error state', async ({ page }) => {
        await page.route(CONSENT_ENDPOINT, (route) => route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Consent evidence source unavailable.' } }),
        }));
        await page.goto(ROUTE);
        await expect(page.getByText('Consent evidence unavailable')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry consent evidence' })).toBeVisible();
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`consent-versions-error-${width}.png`, { fullPage: true });
      });
    });
  }
});
