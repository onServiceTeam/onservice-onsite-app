import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { CommissionControlsPanel } from '../CommissionControlsPanel';

it('Bug OPS-273 — an empty commission rate cannot preview or schedule an accidental zero-percent agreement', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/financials/commission-controls') {
      return { data: { success: true, data: { items: [], total: 0 } } } as never;
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

  fireEvent.change(screen.getByLabelText('Business reason (20–1000 characters)'), {
    target: { value: 'Approved prospective agreement with documented commercial basis.' },
  });

  expect(screen.getByLabelText('Commission rate (%)')).toHaveValue(null);
  expect(screen.getByRole('button', { name: 'Preview impact' })).toBeDisabled();
  expect(api.post).not.toHaveBeenCalled();
});
