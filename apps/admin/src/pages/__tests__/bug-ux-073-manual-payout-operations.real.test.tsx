import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { PayoutsPanel } from '../FinancialsPage';

it('Bug UX-073 — admin financials identify manual payout operations without a fake schedule KPI', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        pendingCount: 2,
        pendingTotalCentavos: 150_000,
        todayCompletedCount: 1,
        todayCompletedCentavos: 50_000,
        failedCount: 0,
        recentFailed: [],
      },
    },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PayoutsPanel />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Manual withdrawals only')).toBeTruthy();
  expect(screen.getByText(/authorized staff review each request/i)).toBeTruthy();
  expect(screen.queryByText('Upcoming Scheduled')).toBeNull();
  expect(screen.getByText('Pending (count)')).toBeTruthy();
});
