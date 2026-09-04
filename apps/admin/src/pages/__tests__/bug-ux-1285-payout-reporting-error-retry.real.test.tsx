import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { PayoutsPanel } from '../FinancialsPage';

it('Bug UX-1285 - unavailable payout reporting offers recovery without implying an empty provider withdrawal queue', async () => {
  apiGet
    .mockResolvedValueOnce({ data: { success: true, data: { available: false, message: 'payout source offline' } } })
    .mockResolvedValueOnce({ data: { success: true, data: {
      available: true, pendingCount: 0, pendingTotalCentavos: 0, internalReviewCount: 0,
      awaitingApprovalCount: 0, approvedAwaitingTransferCount: 0, processingCount: 0,
      todayCompletedCount: 0, todayCompletedCentavos: 0, failedCount: 0, recentFailed: [],
    } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><PayoutsPanel /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Payout reporting unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat the provider withdrawal queue as empty/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry payout summary' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Manual withdrawals only')).toBeInTheDocument();
});
