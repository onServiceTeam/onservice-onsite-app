import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockAuthState: { user: { id: string } | null } = { user: { id: 'customer-1' } };
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

import { AccountQueryCacheGate } from '@/components/AccountQueryCacheGate';

it('Bug UX-245 — changing accounts clears prior-user React Query data before the new workspace uses it', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['bookings'], [{ id: 'customer-1-booking' }]);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AccountQueryCacheGate />
    </QueryClientProvider>,
  );
  expect(queryClient.getQueryData(['bookings'])).toBeDefined();

  mockAuthState.user = { id: 'provider-2' };
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <AccountQueryCacheGate />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
});
