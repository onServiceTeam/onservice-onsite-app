import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

it('Bug UX-1062 - a legacy sales-record handoff URL restores and runs the retained-record search', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    rows: [{
      id: '39800000-0000-4000-8000-000000000398',
      orNumber: 'OR-2026-09-000398',
      bookingId: '39800000-0000-4000-8000-000000003980',
      customerId: '39800000-0000-4000-8000-000000039800',
      customerName: 'Legacy Customer',
      providerId: null,
      providerName: null,
      issuedAt: '2026-09-03T04:00:00.000Z',
      grossCentavos: 125000,
      vatCentavos: 0,
      isCancellation: false,
      pdfUrl: null,
    }],
    total: 1,
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=receipts&receiptOr=OR-2026-09-000398']}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByDisplayValue('OR-2026-09-000398')).toBeVisible();
  expect(await screen.findByText('Legacy Customer')).toBeVisible();
  expect(api.get).toHaveBeenCalledWith('/api/v1/admin/financials/receipts/search', {
    params: { limit: 50, offset: 0, orNumber: 'OR-2026-09-000398' },
  });
});
