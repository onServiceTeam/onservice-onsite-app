// Visual baseline coverage for the owned tester-feedback workspace.
// Captures populated, loading, empty, and error states at the tablet and desktop
// widths used by the admin baseline gate.

import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/feedback';
const FEEDBACK_ID = '11111111-1111-1111-1111-111111111111';

const record = {
  id: FEEDBACK_ID,
  createdAt: '2026-06-30T08:00:00.000Z',
  updatedAt: '2026-06-30T08:00:00.000Z',
  testerName: 'Customer tester',
  testerContact: 'c•••@example.com',
  contactMasked: true,
  piiMasked: true,
  role: 'customer',
  device: 'Desktop Chrome',
  areas: ['customer', 'admin'],
  nps: 4,
  summary: 'Payment redirect left the customer stuck after wallet top-up.',
  itemCount: 1,
  payload: {
    items: [{
      area: 'customer',
      type: 'bug',
      severity: 'major',
      what: 'Wallet top-up did not return to the app.',
      where: 'Customer wallet',
      repro: 'Choose QR and complete payment.',
      expected: 'Return to the wallet with a clear status.',
      screenshots: [],
    }],
    ratings: {
      'customer:payment_method_felt_safe': 2,
      'customer:easy_to_get_help_or_cancel': 2,
    },
    answers: {
      'customer:if_something_went_wrong': 'I could not find help from the payment result.',
      'customer:one_feature_wish': 'Show the payment status and next step.',
    },
    prices: { 'cleaning:pricey': 1000 },
    ideas: 'Explain payment method status and recovery.',
    screenshots: [],
  },
  status: 'new',
  assignedAdminId: null,
  assignedAdminName: null,
  triageNote: null,
};

function fulfill(route: Route, body: unknown, status = 200): void {
  void route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockAgents(page: Page): Promise<void> {
  await page.route('**/api/v1/support-tickets/agents', (route) => {
    fulfill(route, { success: true, data: [{ id: 'agent-1', first_name: 'Ana', last_name: 'Reyes', role: 'admin' }] });
  });
}

async function mockPopulated(page: Page): Promise<void> {
  await mockAgents(page);
  await page.route('**/api/v1/admin/feedback?**', (route) => {
    fulfill(route, {
      success: true,
      data: {
        submissions: [{ ...record, payload: {} }],
        total: 1,
        page: 1,
        pageSize: 25,
        counts: { new: 10, triaged: 0, done: 0, dismissed: 0 },
      },
    });
  });
  await page.route(`**/api/v1/admin/feedback/${FEEDBACK_ID}`, (route) => {
    fulfill(route, { success: true, data: record });
  });
  await page.route(`**/api/v1/admin/feedback/${FEEDBACK_ID}/history`, (route) => {
    fulfill(route, { success: true, data: { entries: [] } });
  });
}

test.describe('FeedbackPage', () => {
  test('Bug UX-042 — scrolls the active lower-sidebar workspace into view', async ({ page }) => {
    await mockPopulated(page);
    await page.goto(ROUTE);
    await expect(page.getByRole('link', { name: 'Tester Feedback' })).toBeInViewport();
  });

  test('Bug UX-871 — Tester Feedback stays within an 820-pixel tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await mockPopulated(page);
    await page.goto(ROUTE);
    await expect(page.getByText('Choose QR and complete payment.')).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(0);
  });

  test('Bug UX-873 — Tester Feedback keeps evidence readable at a 1024-pixel viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await mockPopulated(page);
    await page.goto(ROUTE);
    const detail = page.getByLabel('Original tester submission');
    await expect(detail).toBeVisible();
    const box = await detail.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(600);
  });

  for (const width of [820, 1024, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockPopulated(page);
        await page.goto(ROUTE);
        await expect(page.getByText('Choose QR and complete payment.')).toBeVisible();
        await expect(page).toHaveScreenshot(`feedback-default-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('loading state', async ({ page }) => {
        await mockAgents(page);
        await page.route('**/api/v1/admin/feedback?**', (route) => { void route; });
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`feedback-loading-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('empty state', async ({ page }) => {
        await mockAgents(page);
        await page.route('**/api/v1/admin/feedback?**', (route) => {
          fulfill(route, {
            success: true,
            data: {
              submissions: [], total: 0, page: 1, pageSize: 25,
              counts: { new: 0, triaged: 0, done: 0, dismissed: 0 },
            },
          });
        });
        await page.goto(ROUTE);
        await expect(page.getByText('No feedback matches')).toBeVisible();
        await expect(page).toHaveScreenshot(`feedback-empty-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });

      test('error state', async ({ page }) => {
        await mockAgents(page);
        await page.route('**/api/v1/admin/feedback?**', (route) => {
          fulfill(route, { error: { message: 'server_error' } }, 500);
        });
        await page.goto(ROUTE);
        await expect(page.getByText('Feedback queue unavailable')).toBeVisible();
        await expect(page.getByText('No feedback selected')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`feedback-error-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });
    });
  }
});
