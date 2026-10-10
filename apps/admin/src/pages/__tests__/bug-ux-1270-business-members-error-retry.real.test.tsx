import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import { MembersTab } from '../BusinessAccountDetailPage';

it('Bug UX-1270 - a failed business-account member read offers an in-place retry and recovers to the empty state', async () => {
  apiGet
    .mockRejectedValueOnce(new Error('business members source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MembersTab accountId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('business members source offline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry members' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No members on this account yet.')).toBeInTheDocument();
});
