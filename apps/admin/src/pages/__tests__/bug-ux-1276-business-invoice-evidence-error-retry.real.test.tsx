import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import { InvoiceDetailPanel } from '../BusinessAccountDetailPage';

it('Bug UX-1276 - failed invoice evidence offers recovery without implying a zero balance', async () => {
  apiGet
    .mockRejectedValueOnce(new Error('invoice evidence source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: {
      invoice: { id: 'invoice-1', invoiceNumber: 'INV-1', status: 'draft', controlState: 'prepared', settlementState: 'unpaid', totalAmount: 10000 },
      items: [], balance: { adjustmentTotal: 0, paymentTotal: 0, adjustedTotal: 10000, balanceDue: 10000 },
      ledger: { adjustments: [], payments: [] },
    } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><InvoiceDetailPanel invoiceId="invoice-1" onClose={vi.fn()} /></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Invoice evidence unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat missing evidence as a zero balance/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry invoice evidence' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('INV-1')).toBeInTheDocument();
});
