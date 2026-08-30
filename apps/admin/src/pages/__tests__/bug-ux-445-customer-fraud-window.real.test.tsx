import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { DisputesTab } from '../CustomerDetailPage';

it('Bug UX-445 — Customer 360 labels fraud metrics with the configured analysis window and no-refund meaning', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    rows: [],
    fraudPattern: {
      disputesInWindow: 4, windowDays: 14, favorProviderRate: 0.5,
      flagged: false, reason: null,
    },
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DisputesTab customerId="customer-1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Disputes (last 14d)')).toBeVisible();
  expect(screen.getByText('No-refund rate (14d)')).toBeVisible();
  expect(screen.getByText('50%')).toBeVisible();
});
