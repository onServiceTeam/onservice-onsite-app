// BUG-PHASE177-01 — the wallet empty state distinguishes "no transactions at
// all" (shows a top-up hint) from "this filter is empty". After the A7
// migration the empty state is rendered by the shared EmptyState component.
//
// Real render test (jsdom + RTL) replacing the previous source-regex check
// (which the A7 refactor correctly broke, and which CLAUDE.md bans). The
// truly-empty hint and the has-data path are asserted on the rendered DOM.
// (The exact filter-empty wording depends on a FilterChips interaction and is
// exercised at device level.)

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';
import WalletScreen from '../app/(tabs)/wallet';

jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(WalletScreen)),
  );
  return { container };
}

beforeEach(() => {
  (getWalletBalance as jest.Mock).mockReset().mockResolvedValue({ availableBalance: 0, pendingBalance: 0 });
  (api.get as jest.Mock).mockReset();
});

describe('BUG-PHASE177-01 — wallet empty state (real render)', () => {
  it('shows the truly-empty state with the top-up hint when there are no transactions', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No transactions yet');
    });
    expect(container.textContent).toContain('Top up your wallet');
  });

  it('renders transactions (no empty state) when the wallet has history', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: [
          {
            id: 't1',
            type: 'topup',
            amount: 10000,
            balanceAfter: 10000,
            description: 'Wallet top-up',
            createdAt: '2026-06-01T08:00:00+08:00',
            referenceId: null,
            walletId: 'w1',
            bookingId: null,
          },
        ],
        pagination: { total: 1 },
      },
    });
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('Wallet top-up');
    });
    expect(container.textContent).not.toContain('No transactions yet');
  });
});
