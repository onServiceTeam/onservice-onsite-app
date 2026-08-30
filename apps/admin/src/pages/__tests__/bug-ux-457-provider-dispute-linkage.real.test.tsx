import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { DisputesTab } from '../ProviderDetailPage';

it('Bug UX-457 — Provider 360 disputes paginate and link the dispute, booking, and customer workspaces', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: { rows: [{
    id: 'dispute-1', bookingId: 'booking-1', customerId: 'customer-1', customerName: 'Ana Reyes',
    status: 'escalated', resolutionType: null, createdAt: '2026-08-30T01:00:00.000Z',
  }], total: 25, page: 1, pageSize: 20 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><DisputesTab providerId="provider-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByLabelText('Open dispute dispute-1')).toHaveAttribute('to', '/disputes/dispute-1');
  expect(screen.getByLabelText('Open booking booking-1')).toHaveAttribute('to', '/bookings/booking-1');
  expect(screen.getByLabelText('Open customer customer-1')).toHaveAttribute('to', '/customers/customer-1');
  expect(screen.getByText(/Showing/).parentElement).toHaveTextContent('Showing 1 to 20 of 25 results');
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/providers/provider-1/disputes', { params: { page: 1, pageSize: 20 } });
});
