// HA-M3-72 (D38 Milestone 3): the two alerts that are not about a running
// wait say why in words: a "needs back-office review" alert names the
// engine's reason (details.reason), and a "closed with no quote" alert says
// who closed the request (details.closedBy). Neither shows a wait time.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import {
  MARKETPLACE, alert, alertsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-72: needs-review and closed-with-no-quote alerts state the reason and who closed the request', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) {
      return alertsResponse([
        alert({
          id: 'alert-review',
          kind: 'request_needs_ops',
          thresholdMinutes: null,
          currentWaitMinutes: null,
          details: { reason: 'max_rounds', declinedRounds: 3 },
        }),
        alert({
          id: 'alert-unfilled',
          bookingId: 'booking-2',
          kind: 'request_unfilled',
          thresholdMinutes: null,
          currentWaitMinutes: null,
          details: { closedBy: 'customer', waitMinutes: 18 },
        }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  fireEvent.click(within(banner).getByRole('button', { name: 'Show alerts' }));
  const [review, unfilled] = within(banner).getAllByTestId('marketplace-alert');
  expect(within(review!).getByText('Needs back-office review: the customer declined quotes in every round')).toBeInTheDocument();
  expect(within(unfilled!).getByText('Closed with no quote: the customer cancelled')).toBeInTheDocument();
  expect(within(banner).queryByText(/Waiting \d+/)).not.toBeInTheDocument();
});
