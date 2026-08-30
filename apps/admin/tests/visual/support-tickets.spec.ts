import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';

const ROUTE = '/support-tickets';

const VISUAL_TICKET = {
  id: 'ticket-visual-1',
  ticket_number: 'SUP-0001',
  user_id: 'customer-visual-1',
  assigned_agent_id: null,
  type: 'booking_issue',
  status: 'open',
  priority: 'high',
  subject: 'Visual booking support case',
  description: 'The customer needs help coordinating the assigned provider.',
  booking_id: 'booking-visual-1',
  resolution_notes: null,
  resolved_at: null,
  closed_at: null,
  created_at: '2026-08-31T01:00:00.000Z',
  updated_at: '2026-08-31T01:00:00.000Z',
  user_phone: '+639171111111',
  user_email: 'customer@onservice.test',
  user_first_name: 'Visual',
  user_last_name: 'Customer',
  user_role: 'customer',
  message_count: 2,
};

type ListMode = 'success' | 'empty' | 'error' | 'loading';

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockSupportApi(page: Page, mode: ListMode): Promise<void> {
  await page.route('**/api/v1/support-tickets**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/summary')) {
      await fulfillJson(route, {
        success: true,
        data: mode === 'success'
          ? { open: 1, escalated: 0, urgent: 0, unassigned: 1 }
          : { open: 0, escalated: 0, urgent: 0, unassigned: 0 },
      });
      return;
    }
    if (pathname.endsWith('/agents')) {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }
    if (pathname !== '/api/v1/support-tickets') {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }
    if (mode === 'loading') {
      await new Promise<void>(() => {});
      return;
    }
    if (mode === 'error') {
      await fulfillJson(route, { error: { message: 'Support queue unavailable.' } }, 500);
      return;
    }

    const tickets = mode === 'success' ? [VISUAL_TICKET] : [];
    await fulfillJson(route, { data: tickets, meta: { total: tickets.length } });
  });
}

test.describe('SupportTicketsPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockSupportApi(page, 'success');
        await page.goto(ROUTE);
        await expect(page.getByText('Visual booking support case')).toBeVisible();
        await expect(page).toHaveScreenshot(`support-tickets-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        await mockSupportApi(page, 'loading');
        await page.goto(ROUTE);
        await expect(page.getByText('Loading...')).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`support-tickets-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        await mockSupportApi(page, 'empty');
        await page.goto(ROUTE);
        await expect(page.getByText('No support tickets match these filters.')).toBeVisible();
        await expect(page).toHaveScreenshot(`support-tickets-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        await mockSupportApi(page, 'error');
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Failed to load tickets.');
        await expect(page.getByText('Loading...')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`support-tickets-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
