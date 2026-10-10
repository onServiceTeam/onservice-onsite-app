import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn(() => Promise.resolve({
  data: {
    data: {
      available: false,
      message: 'Escrow accounting is unavailable because the platform wallet is missing.',
      totalInEscrowCentavos: 0,
      pendingReleaseCount: 0,
      agingBuckets: [],
      pendingReleaseList: [],
    },
  },
})));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import { EscrowPanel } from '../FinancialsPage';

it('Bug UX-1046 — the console never renders a missing escrow wallet as a real zero balance', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EscrowPanel />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Escrow accounting unavailable')).toBeVisible();
  expect(screen.getByText(/Do not treat this as a zero balance or a release decision/)).toBeVisible();
  expect(screen.queryByText('Total in Escrow')).not.toBeInTheDocument();
});
