import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import PayoutsPage from '../PayoutsPage';

it('Bug UX-1178 — a malformed exact payout link is rejected before requesting payout data', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/payouts?payoutId=not-a-uuid']}>
        <PayoutsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Payout ID must be a complete UUID');
  expect(apiMocks.get).not.toHaveBeenCalled();
});
