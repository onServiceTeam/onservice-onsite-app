import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn(() => Promise.resolve({
  data: {
    data: {
      available: false,
      message: 'Guarantee-fund accounting is unavailable because the platform wallet is missing.',
      currentBalanceCentavos: 0,
      inflow30dCentavos: 0,
      outflow30dCentavos: 0,
      net30dCentavos: 0,
      averageMonthlyOutflowCentavos: 0,
      runwayMonths: null,
      needsReplenishment: null,
    },
  },
})));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import { GuaranteeFundPanel } from '../FinancialsPage';

it('Bug UX-1037 — the console never renders a missing guarantee-fund wallet as a real zero balance', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GuaranteeFundPanel />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Guarantee-fund accounting unavailable')).toBeVisible();
  expect(screen.getByText(/Do not treat this as a zero balance or a funding decision/)).toBeVisible();
  expect(screen.queryByText('Current Balance')).not.toBeInTheDocument();
});
