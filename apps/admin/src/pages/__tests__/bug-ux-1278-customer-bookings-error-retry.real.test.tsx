import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { BookingsTab } from '../CustomerDetailPage';

it('Bug UX-1278 - a failed Customer 360 booking read offers recovery without showing no bookings', async () => {
  apiGet.mockRejectedValueOnce(new Error('customer bookings source offline')).mockResolvedValueOnce({ data: { success: true, data: { rows: [], total: 0, page: 1, pageSize: 20 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><BookingsTab customerId="customer-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Customer bookings unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as no bookings/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer bookings' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No bookings match.')).toBeInTheDocument();
});
