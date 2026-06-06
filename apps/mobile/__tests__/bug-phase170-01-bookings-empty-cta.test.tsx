// BUG-PHASE170-01 — the bookings empty state (filter "all") must offer a
// "Browse Services" CTA so a new customer with zero bookings has a path
// forward. After the A7 migration the empty state is rendered by the shared
// EmptyState component (actionLabel/onAction).
//
// This is a REAL render test (jsdom + RTL): it drives the bookings list to its
// empty state via a mocked API and asserts the actionable CTA renders as a
// button — replacing the previous source-regex check (which the A7 refactor
// correctly broke, and which CLAUDE.md bans anyway).

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import BookingsScreen from '../app/(tabs)/bookings';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(BookingsScreen)),
  );
  return { container };
}

beforeEach(() => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({
    data: { data: [], meta: { page: 1, pageSize: 15, total: 0, totalPages: 0 } },
  });
});

describe('BUG-PHASE170-01 — bookings empty state CTA (real render)', () => {
  it('shows the "No bookings yet" empty state with a Browse Services button on the all filter', async () => {
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No bookings yet');
    });
    // The CTA is an actual interactive button (EmptyState action), not plain text.
    const buttons = Array.from(container.querySelectorAll('button'));
    const cta = buttons.find((b) => (b.textContent ?? '').includes('Browse Services'));
    expect(cta).toBeTruthy();
  });
});
