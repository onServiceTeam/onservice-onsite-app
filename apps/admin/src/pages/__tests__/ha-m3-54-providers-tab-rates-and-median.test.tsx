// HA-M3-54 (D38 Milestone 3): /marketplace?tab=providers shows each
// provider's requests received, the share they opened and quoted, their
// median time to quote and quotes accepted, with the note that these numbers
// are for back-office follow-up only and never rank providers (E47). Source:
// GET /api/v1/admin/marketplace-health/providers.
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

it('HA-M3-54: the Providers tab shows open and quote rates, median time to quote and the follow-up-only note', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/providers`) {
      return {
        data: {
          success: true,
          data: [{
            providerId: 'provider-54',
            providerName: 'Mia Home Care',
            providerStatus: 'approved',
            isAvailable: true,
            phone: '+63 9XX XXX 7788',
            contactMasked: true,
            invites: 8,
            notified: 6,
            viewed: 6,
            responded: 2,
            viewedRate: 0.75,
            responseRate: 0.25,
            medianResponseMinutes: 8.5,
            quotesAccepted: 1,
            lastActiveAt: '2026-10-14T01:00:00.000Z',
          }],
          meta: { total: 1, page: 1, pageSize: 25, sort: 'invites', from: '2026-09-15', to: '2026-10-14' },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplacePage />, { route: '/marketplace?tab=providers' });

  const row = await screen.findByTestId('provider-row');
  const cells = within(row).getAllByRole('cell');
  expect(within(row).getByRole('link', { name: 'Mia Home Care' })).toHaveAttribute('href', '/providers/provider-54');
  expect(cells[1]!.firstChild?.textContent).toBe('8');
  expect(within(cells[1]!).getByText('6 notified')).toBeInTheDocument();
  expect(cells[2]).toHaveTextContent(/^75% \(6\)$/);
  expect(cells[3]).toHaveTextContent(/^25% \(2\)$/);
  expect(cells[4]).toHaveTextContent(/^8\.5 min$/);
  expect(cells[5]).toHaveTextContent(/^1$/);
  expect(within(row).getByRole('button', { name: 'Call provider Mia Home Care' })).toBeInTheDocument();
  expect(
    screen.getByText('For back-office follow-up only. These numbers are not used to rank providers or to decide who gets requests.'),
  ).toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(`${MARKETPLACE}/providers`, {
    params: { from: undefined, to: undefined, sort: 'invites', page: 1, pageSize: 25 },
  });
});
