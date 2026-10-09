import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { CommissionControlsPanel } from '../CommissionControlsPanel';

it('Bug OPS-239 — commission impact preview states that existing booking snapshots remain unchanged', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/financials/commission-controls') {
      return { data: { success: true, data: { items: [], total: 0 } } } as never;
    }
    if (url === '/api/v1/catalog/admin/full') {
      return { data: { success: true, data: [] } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  vi.mocked(api.post).mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        schedule: {
          scopeType: 'tier',
          tier: 'new',
          providerId: null,
          serviceCategoryId: null,
          serviceSubcategoryId: null,
          rateBasisPoints: 1400,
          effectiveFrom: '2026-09-03T02:00:00.000Z',
          reason: 'Prospective commercial review for the new tier.',
        },
        impact: {
          eligibleProviderCount: 12,
          approvedProviderCount: 9,
          currentlyAssignedPendingBookingCount: 3,
          existingSnapshotCount: 37,
          currentExactScopeRateBasisPoints: 1500,
          existingSnapshotsWillChange: false,
        },
      },
    },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommissionControlsPanel /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('Commission rate (%)'), { target: { value: '14' } });
  fireEvent.change(screen.getByLabelText('Business reason (20–1000 characters)'), {
    target: { value: 'Prospective commercial review for the new tier.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview impact' }));

  expect(await screen.findByText(/Existing snapshots that will change: 0/)).toBeVisible();
  expect(screen.getByText('37')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Schedule commission change' })).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/Type SCHEDULE COMMISSION CHANGE/), {
    target: { value: 'SCHEDULE COMMISSION CHANGE' },
  });
  expect(screen.getByRole('button', { name: 'Schedule commission change' })).toBeEnabled();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/v1/admin/financials/commission-controls/preview',
    expect.objectContaining({
      scopeType: 'tier',
      tier: 'new',
      rateBasisPoints: 1400,
    }),
  ));
});
