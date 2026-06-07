// BUG-PHASE173-01 — the recurring-bookings empty state must offer a "Browse
// Services" CTA so a customer with none has a path forward. After the A7
// migration the empty state is the shared EmptyState (actionLabel/onAction).
//
// Real render test (jsdom + RTL) replacing the prior source-regex check.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import RecurringListScreen from '../app/customer/recurring/index';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(RecurringListScreen)),
  );
  return { container };
}

beforeEach(() => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({
    data: { success: true, data: [], pagination: { total: 0 } },
  });
});

describe('BUG-PHASE173-01 — recurring empty state CTA (real render)', () => {
  it('shows the empty state with a Browse Services button when there are no recurring bookings', async () => {
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No recurring bookings');
    });
    const cta = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Browse Services'),
    );
    expect(cta).toBeTruthy();
  });
});
