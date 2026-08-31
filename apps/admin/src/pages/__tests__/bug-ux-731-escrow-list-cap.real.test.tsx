import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { EscrowPanel } from '../FinancialsPage';

it('Bug UX-731 — escrow oversight paginates the complete pending-release queue', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    totalInEscrowCentavos: 900000, pendingReleaseCount: 700,
    agingBuckets: [{ bucket: '168h+', count: 700, totalCentavos: 900000 }],
    pendingReleaseList: [{ bookingId: 'booking-1', customerName: 'Maria', providerName: 'Cebu Pro', amountCentavos: 100000, completedAt: '2026-08-20T00:00:00.000Z' }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><EscrowPanel /></QueryClientProvider>);

  expect(await screen.findByText('Showing 1–50 of 700')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  expect(api.get).toHaveBeenCalledWith('/api/v1/admin/financials/escrow', {
    params: { limit: 50, offset: 0 },
  });
});
