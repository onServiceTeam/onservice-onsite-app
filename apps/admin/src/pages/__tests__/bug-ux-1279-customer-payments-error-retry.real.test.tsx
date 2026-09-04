import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-1279 - a failed Customer 360 payment read offers recovery without showing a zero balance', async () => {
  apiGet.mockRejectedValueOnce(new Error('customer payments source offline')).mockResolvedValueOnce({ data: { success: true, data: {
    walletAvailable: 0, walletPending: 0, recentTransactions: [], recentPaymentIntents: [], paymentMethodCounts: {},
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><PaymentsTab customerId="customer-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Customer payment history unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat missing data as a zero balance/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer payments' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No wallet transactions yet.')).toBeInTheDocument();
});
