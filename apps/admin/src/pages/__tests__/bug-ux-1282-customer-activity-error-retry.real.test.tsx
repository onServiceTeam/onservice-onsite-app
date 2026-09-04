import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { ActivityTab } from '../CustomerDetailPage';

it('Bug UX-1282 - a failed Customer 360 activity read offers recovery without showing no history', async () => {
  apiGet.mockRejectedValueOnce(new Error('customer activity source offline')).mockResolvedValueOnce({ data: { success: true, data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ActivityTab customerId="customer-1" /></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Customer activity unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as no recorded activity/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer activity' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No activity recorded.')).toBeInTheDocument();
});
