import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

import { BirReportsPanel } from '../FinancialsPage';

afterEach(() => {
  vi.useRealTimers();
  apiMocks.get.mockReset();
});

it('Bug UX-1295 - BIR workpaper fallback year follows the Manila calendar at a UTC year boundary', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-31T16:30:00.000Z'));
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        totalOutputVat: 1200,
        totalVatPayable: 1200,
        monthsFinalized: 0,
        monthlyReports: [],
        quarterlyBatches: [],
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><BirReportsPanel isSuperAdmin={false} /></MemoryRouter>
    </QueryClientProvider>,
  );

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(screen.getByRole('heading', { name: 'Internal Tax Workpaper Summary (2027)' })).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/bir/overview', { params: { year: 2027 } });
});
