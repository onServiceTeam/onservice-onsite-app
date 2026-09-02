import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1041 — discrepancy acknowledgement states its limited effect and does not use a native prompt', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: [{
    id: '14100000-0000-4000-8000-000000001041',
    snapshotDate: '2026-09-03',
    paymongoBalance: 1_000_000,
    expectedTotal: 900_000,
    discrepancy: 100_000,
    discrepancyAlertSent: true,
  }] } } as never);
  vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: {} } } as never);
  const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=reconciliation']}><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /Acknowledge discrepancy for/ }));
  expect(screen.getByText(/does not resolve the discrepancy or change any balance/i)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Acknowledgement Note (5–1000 chars)'), {
    target: { value: 'Compared the external statement and opened a finance incident.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge alert' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/v1/admin/bir/reconciliation/14100000-0000-4000-8000-000000001041/acknowledge',
    { note: 'Compared the external statement and opened a finance incident.' },
  ));
  expect(nativeConfirm).not.toHaveBeenCalled();
  nativeConfirm.mockRestore();
});
