// HA-M3-50 (D38 Milestone 3): /marketplace?tab=lost lists the quote requests
// that closed without a booking, one row each: category and service, city,
// the one reason in plain words, who closed it, and the estimated value from
// the customer's budget, or "Budget not given" when there was none. Source:
// GET /api/v1/admin/marketplace-health/lost-opportunities. (The summary line,
// the per-reason counts and the tab selection have their own tests,
// HA-M3-223, HA-M3-224 and HA-M3-225.)
import React from 'react';
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import MarketplacePage from '../MarketplacePage';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

function lostRow(overrides: Record<string, unknown>) {
  return {
    bookingId: 'booking-1',
    reason: 'notified_none_viewed',
    closedBy: 'system',
    status: 'cancelled_by_admin',
    cancellationReason: null,
    categoryName: 'Plumbing',
    subcategoryName: 'Leak repair',
    barangay: 'Banilad',
    city: 'Mandaue',
    createdAt: '2026-10-10T02:00:00.000Z',
    closedAt: '2026-10-13T02:00:00.000Z',
    rounds: 1,
    invited: 4,
    viewed: 0,
    quotes: 0,
    declinedQuotes: 0,
    budgetMinCentavos: 100_000,
    budgetMaxCentavos: 200_000,
    budgetUnknown: false,
    estimatedValueCentavos: 150_000,
    ...overrides,
  };
}

it('HA-M3-50: each Lost opportunities row shows its reason, city, category and estimated value or "Budget not given"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/lost-opportunities`) {
      return {
        data: {
          success: true,
          data: [
            lostRow({ bookingId: 'booking-a' }),
            lostRow({
              bookingId: 'booking-b',
              reason: 'customer_cancelled_waiting',
              closedBy: 'customer',
              categoryName: 'Electrical',
              subcategoryName: 'Outlet repair',
              barangay: null,
              city: 'Lapu-Lapu',
              budgetMinCentavos: null,
              budgetMaxCentavos: null,
              budgetUnknown: true,
              estimatedValueCentavos: null,
            }),
          ],
          meta: {
            summary: {
              total: 2,
              byReason: { notified_none_viewed: 1, customer_cancelled_waiting: 1 },
              estimatedValueCentavos: 150_000,
              withoutBudget: 1,
            },
            total: 2,
            page: 1,
            pageSize: 25,
            from: '2026-09-15',
            to: '2026-10-14',
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplacePage />, { route: '/marketplace?tab=lost' });

  const rows = await screen.findAllByTestId('lost-row');
  expect(rows).toHaveLength(2);
  expect(within(rows[0]!).getByText('Leak repair')).toBeInTheDocument();
  expect(within(rows[0]!).getByText('Plumbing')).toBeInTheDocument();
  expect(within(rows[0]!).getByText('Banilad, Mandaue')).toBeInTheDocument();
  expect(within(rows[0]!).getByText('Providers notified, none opened it')).toBeInTheDocument();
  expect(within(rows[0]!).getByText('System')).toBeInTheDocument();
  expect(within(rows[0]!).getByText('₱1,500.00')).toBeInTheDocument();
  expect(within(rows[1]!).getByText('Customer cancelled while waiting')).toBeInTheDocument();
  expect(within(rows[1]!).getByText('Lapu-Lapu')).toBeInTheDocument();
  expect(within(rows[1]!).getByText('Budget not given')).toBeInTheDocument();
  expect(within(rows[1]!).getByRole('link', { name: /Open booking/ })).toHaveAttribute('href', '/bookings/booking-b');
});
