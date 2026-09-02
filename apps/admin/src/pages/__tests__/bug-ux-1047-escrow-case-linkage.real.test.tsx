import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { EscrowPanel } from '../FinancialsPage';

it('Bug UX-1047 — an escrow release opens its exact customer and provider cases', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: {
    available: true,
    message: null,
    totalInEscrowCentavos: 300000,
    pendingReleaseCount: 1,
    agingBuckets: [{ bucket: '0-24h', count: 1, totalCentavos: 300000 }],
    pendingReleaseList: [{
      bookingId: '14700000-0000-4000-8000-000000001047',
      customerId: '24700000-0000-4000-8000-000000001047',
      customerName: 'Escrow Customer',
      providerId: '34700000-0000-4000-8000-000000001047',
      providerName: 'Escrow Provider',
      amountCentavos: 300000,
      completedAt: '2026-09-03T00:00:00.000Z',
    }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><EscrowPanel /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Open customer 24700000-0000-4000-8000-000000001047' })).toHaveAttribute(
    'href', '/customers/24700000-0000-4000-8000-000000001047',
  );
  expect(screen.getByRole('link', { name: 'Open provider 34700000-0000-4000-8000-000000001047' })).toHaveAttribute(
    'href', '/providers/34700000-0000-4000-8000-000000001047',
  );
});
