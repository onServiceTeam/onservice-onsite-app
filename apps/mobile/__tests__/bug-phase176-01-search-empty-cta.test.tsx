// BUG-PHASE176-01 — the search no-results state must offer a real "Browse
// Categories" CTA. After the A7 migration it's the shared EmptyState
// (actionLabel/onAction). Real render test: type a query that returns no
// results and assert the EmptyState + CTA render. Replaces the prior
// source-regex check.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import SearchScreen from '../app/customer/search';

beforeEach(() => {
  (api.get as jest.Mock)
    .mockReset()
    .mockResolvedValue({ data: { success: true, data: { services: [], providers: [] } } });
});

describe('BUG-PHASE176-01 — search no-results CTA (real render)', () => {
  it('shows the no-results EmptyState with a Browse Categories button', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      React.createElement(QueryClientProvider, { client }, React.createElement(SearchScreen)),
    );

    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    // Type a query (>= 2 chars) that the mocked API returns no results for.
    fireEvent.change(input!, { target: { value: 'zzzznotaservice' } });

    await waitFor(
      () => {
        expect(container.textContent).toContain('No results for');
      },
      { timeout: 3000 },
    );

    const cta = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Browse Categories'),
    );
    expect(cta).toBeTruthy();
  });
});
