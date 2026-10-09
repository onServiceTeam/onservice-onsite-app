import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-738 — reconciliation accepts a PHP balance and sends exact integer centavos', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: [] } } as never);
  vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/financials?tab=reconciliation']}><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  await screen.findByText('No reconciliation snapshots yet');
  fireEvent.click(screen.getByRole('button', { name: 'Create reconciliation snapshot' }));
  fireEvent.change(screen.getByLabelText('Operator-entered PayMongo balance (PHP)'), { target: { value: '12345.67' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create snapshot' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/admin/bir/reconciliation/run', {
    paymongoBalance: 1_234_567,
  }));
});
