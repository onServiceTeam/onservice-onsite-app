import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1040 — snapshot creation stays in the accessible dialog and states the external-source boundary', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: [] } } as never);
  vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: {} } } as never);
  const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=reconciliation']}><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Create reconciliation snapshot' }));
  expect(screen.getByText(/does not query PayMongo or move money/i)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Operator-entered PayMongo balance (PHP)'), {
    target: { value: '1000.00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create snapshot' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/admin/bir/reconciliation/run', {
    paymongoBalance: 100_000,
  }));
  expect(nativeConfirm).not.toHaveBeenCalled();
  nativeConfirm.mockRestore();
});
