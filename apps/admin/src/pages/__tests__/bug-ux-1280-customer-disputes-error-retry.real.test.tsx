import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { DisputesTab } from '../CustomerDetailPage';

it('Bug UX-1280 - a failed Customer 360 dispute read offers recovery without showing a clear fraud review', async () => {
  apiGet.mockRejectedValueOnce(new Error('customer disputes source offline')).mockResolvedValueOnce({ data: { success: true, data: {
    rows: [], total: 0, page: 1, pageSize: 20,
    fraudPattern: { disputesInWindow: 0, windowDays: 30, favorProviderRate: null, flagged: false, reason: null },
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><DisputesTab customerId="customer-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Customer disputes unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as no disputes or a clear review/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer disputes' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No disputes linked to this customer’s bookings.')).toBeInTheDocument();
});
