import { expect, test, waitForVisualSettled } from './_fixtures';

const ROUTE = '/compliance';

test.describe('CompliancePage', () => {
  for (const width of [820, 1024, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('truthful control center', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByRole('heading', { name: 'Compliance Control Center' })).toBeVisible();
        await expect(page.getByText('This screen does not file with an agency or certify legal compliance.')).toBeVisible();
        await expect(page.getByText('External checkout')).toBeVisible();
        await expect(page.getByText('Privacy deadline and breach contract')).toBeVisible();
        await expect(page).toHaveScreenshot(`compliance-default-${width}.png`, { fullPage: true });
      });
    });
  }
});
