import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { CommissionControlsPanel } from '../CommissionControlsPanel';

it('Bug OPS-274 — closing a cancellation clears its reason and typed money-action confirmation', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/financials/commission-controls') {
      return { data: { success: true, data: { items: [{
        id: '00000000-0000-4000-8000-000000000274', scopeType: 'tier', tier: 'new',
        providerId: null, providerName: null, providerTier: null, serviceCategoryId: null,
        categoryName: null, serviceSubcategoryId: null, subcategoryName: null,
        rateBasisPoints: 1400, ratePercent: 14, effectiveFrom: '2026-09-10T02:00:00.000Z',
        reason: 'Scheduled commercial agreement update.', source: 'admin_schedule',
        createdByName: 'Super Admin', approvedByName: 'Super Admin',
        createdAt: '2026-09-01T00:00:00.000Z', cancellation: null,
        snapshotUsageCount: 0, lifecycleStatus: 'scheduled',
      }], total: 1 } } } as never;
    }
    if (url === '/api/v1/catalog/admin/full') {
      return { data: { success: true, data: [] } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommissionControlsPanel /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel future version' }));
  fireEvent.change(screen.getByLabelText('Reason (20–1000 characters)'), {
    target: { value: 'The signed commercial agreement was withdrawn before activation.' },
  });
  fireEvent.change(screen.getByLabelText(/Type CANCEL COMMISSION CHANGE/), {
    target: { value: 'CANCEL COMMISSION CHANGE' },
  });
  expect(screen.getByRole('button', { name: 'Cancel future version' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'Keep schedule' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel future version' }));

  expect(screen.getByLabelText('Reason (20–1000 characters)')).toHaveValue('');
  expect(screen.getByLabelText(/Type CANCEL COMMISSION CHANGE/)).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Cancel future version' })).toBeDisabled();
});
