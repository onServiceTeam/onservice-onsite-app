import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const emptySummary = {
  paymentIntentsAvailable: true,
  gatewayRetriesAvailable: true,
  totalAttempts: 51,
  awaitingPaymentCount: 0,
  processingCount: 0,
  succeededCount: 51,
  failedCount: 0,
  refundedCount: 0,
  partiallyRefundedCount: 0,
  pendingGatewayRetries: 0,
  inProgressGatewayRetries: 0,
  permanentGatewayFailures: 0,
  recentIntents: [],
  gatewayRetries: [],
};

it('Bug UX-1044 — finance can find an older payment attempt by exact identifier and see its gateway references', async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({ data: { success: true, data: emptySummary } } as never)
    .mockResolvedValueOnce({ data: { success: true, data: {
      ...emptySummary,
      recentIntents: [{
        id: '14400000-0000-4000-8000-000000001044',
        bookingId: '24400000-0000-4000-8000-000000001044',
        topupId: null,
        paymongoIntentId: 'pi_ux_1044',
        paymongoPaymentId: 'pay_ux_1044',
        customerId: '34400000-0000-4000-8000-000000001044',
        customerName: 'Older Payment Customer',
        amountCentavos: 125000,
        refundedAmountCentavos: 0,
        paymentMethod: 'gcash',
        status: 'succeeded',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:01:00.000Z',
      }],
    } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=payments']}><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(await screen.findByLabelText('Find payment attempt'), { target: { value: 'pi_ux_1044' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search attempts' }));

  expect(await screen.findByText('Gateway intent pi_ux_1044')).toBeVisible();
  expect(screen.getByText('Gateway payment pay_ux_1044')).toBeVisible();
  expect(api.get).toHaveBeenLastCalledWith('/api/v1/admin/financials/payments', {
    params: { retryLimit: 25, retryOffset: 0, intentSearch: 'pi_ux_1044' },
  });
});
