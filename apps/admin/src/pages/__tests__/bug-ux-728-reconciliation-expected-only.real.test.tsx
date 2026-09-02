import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-728 — expected-only snapshots are not displayed as zero-balance successful reconciliations', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: [{
    id: 'snapshot-1', snapshotDate: '2026-08-31', paymongoBalance: null,
    expectedTotal: 150000, discrepancy: 0, discrepancyAlertSent: false,
  }] } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/financials?tab=reconciliation']}><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Not supplied')).toBeVisible();
  expect(screen.getByText('Not compared')).toBeVisible();
  expect(screen.getByText('EXPECTED ONLY')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Create reconciliation snapshot' }));
  expect(screen.getByRole('button', { name: 'Create snapshot' })).toBeDisabled();
  expect(screen.getByText(/balance is required/i)).toBeVisible();
});
