// Visual baseline coverage for the admin trust-and-safety workspace.
// Captures a populated review case plus loading, empty, and error states
// at the three desktop widths used by the admin baseline gate.

import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/communications';
const CONVERSATION_ID = '11111111-1111-1111-1111-111111111111';
const MESSAGE_ID = '22222222-2222-2222-2222-222222222222';
const BOOKING_ID = '44444444-4444-4444-4444-444444444444';

const reportedMessage = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: '55555555-5555-5555-5555-555555555555',
  senderName: 'Maria Santos',
  senderRole: 'customer',
  content: 'The provider asked me to pay outside onService.',
  messageType: 'text',
  imageUrl: null,
  isRead: true,
  isFlagged: true,
  flagReviewedAt: null,
  reportedAt: '2026-08-23T08:00:00.000Z',
  reportReason: 'scam_or_off_platform',
  redactedAt: null,
  redactionReason: null,
  createdAt: '2026-08-23T07:55:00.000Z',
  bookingId: BOOKING_ID,
};

function fulfill(route: Route, body: unknown): void {
  void route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockPopulatedWorkspace(page: Page): Promise<void> {
  await page.route('**/api/v1/admin/conversations/stats', (route) => {
    fulfill(route, { success: true, data: { openFlagged: 1, openReported: 1 } });
  });
  await page.route('**/api/v1/admin/conversations/queue?**', (route) => {
    fulfill(route, { success: true, messages: [reportedMessage], total: 1 });
  });
  await page.route(`**/api/v1/admin/conversations/${CONVERSATION_ID}`, (route) => {
    fulfill(route, {
      success: true,
      data: {
        id: CONVERSATION_ID,
        bookingId: BOOKING_ID,
        customerId: '55555555-5555-5555-5555-555555555555',
        customerName: 'Maria Santos',
        providerId: '66666666-6666-6666-6666-666666666666',
        providerName: 'Roberto Villanueva',
        isActive: true,
        messages: [reportedMessage],
      },
    });
  });
}

test.describe('CommunicationsPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockPopulatedWorkspace(page);
        await page.goto(ROUTE);
        await page.getByText('The provider asked me to pay outside onService.').click();
        await expect(page.getByText('Review rationale')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`communications-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        await page.route('**/api/v1/admin/conversations/stats', (route) => {
          void route;
        });
        await page.route('**/api/v1/admin/conversations/queue?**', (route) => {
          void route;
        });
        await page.goto(ROUTE);
        await expect(page.getByText('Loading…')).toBeVisible();
        await expect(page).toHaveScreenshot(`communications-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('empty state', async ({ page }) => {
        await page.route('**/api/v1/admin/conversations/stats', (route) => {
          fulfill(route, { success: true, data: { openFlagged: 0, openReported: 0 } });
        });
        await page.route('**/api/v1/admin/conversations/queue?**', (route) => {
          fulfill(route, { success: true, messages: [], total: 0 });
        });
        await page.goto(ROUTE);
        await expect(page.getByText('Queue is clear')).toBeVisible();
        await expect(page).toHaveScreenshot(`communications-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('error state', async ({ page }) => {
        await page.route('**/api/v1/admin/conversations/stats', (route) => {
          fulfill(route, { success: true, data: { openFlagged: 0, openReported: 0 } });
        });
        await page.route('**/api/v1/admin/conversations/queue?**', (route) => {
          void route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'server_error' } }),
          });
        });
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Failed to load', { timeout: 15_000 });
        await expect(page.getByText('Loading…')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`communications-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
