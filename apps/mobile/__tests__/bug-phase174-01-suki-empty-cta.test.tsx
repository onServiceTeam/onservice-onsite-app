// BUG-PHASE174-01 — the Suki Pros empty state must offer a "Browse Services"
// CTA (the loyalty feature requires repeat bookings with the same provider).
// After the A7 migration the empty state is the shared EmptyState
// (actionLabel/onAction). Real render test replacing the prior source-regex.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/suki.service', () => ({
  getMemberships: jest.fn(),
  getTiers: jest.fn(),
  redeemPoints: jest.fn(),
}));

import SukiProsScreen from '../app/customer/suki-pros';
import { getMemberships, getTiers } from '@/services/suki.service';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(SukiProsScreen)),
  );
  return { container };
}

beforeEach(() => {
  (getMemberships as jest.Mock).mockReset().mockResolvedValue([]);
  (getTiers as jest.Mock).mockReset().mockResolvedValue([]);
});

describe('BUG-PHASE174-01 — suki-pros empty CTA (real render)', () => {
  it('shows the empty state with a Browse Services button when there are no memberships', async () => {
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No Suki Relationships Yet');
    });
    const cta = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Browse Services'),
    );
    expect(cta).toBeTruthy();
  });
});
