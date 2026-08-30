import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import NbiStatusBanner from '@/components/provider/NbiStatusBanner';

it('Bug UX-601 — the mandatory NBI banner reads the production API envelope and surfaces an expired clearance', async () => {
  jest.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { status: 'expired', expiresAt: '2020-01-01T00:00:00.000Z' },
    },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NbiStatusBanner />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText(/NBI clearance expired/i)).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/api/v1/providers/me/nbi-status');
});
