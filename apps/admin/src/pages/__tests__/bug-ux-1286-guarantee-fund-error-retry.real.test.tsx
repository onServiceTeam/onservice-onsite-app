import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { GuaranteeFundPanel } from '../FinancialsPage';

it('Bug UX-1286 - unavailable guarantee-fund accounting offers recovery without implying a zero balance', async () => {
  apiGet
    .mockResolvedValueOnce({ data: { success: true, data: { available: false, message: 'guarantee wallet source offline' } } })
    .mockResolvedValueOnce({ data: { success: true, data: {
      available: true, currentBalanceCentavos: 100000, inflow30dCentavos: 10000,
      outflow30dCentavos: 5000, net30dCentavos: 5000, averageMonthlyOutflowCentavos: 20000,
      runwayMonths: 5, needsReplenishment: false,
    } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><GuaranteeFundPanel /></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Guarantee-fund accounting unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as a zero balance or a funding decision/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry guarantee fund' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Current Balance')).toBeInTheDocument();
});
