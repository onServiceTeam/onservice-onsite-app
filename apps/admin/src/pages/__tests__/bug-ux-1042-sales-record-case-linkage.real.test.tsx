import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

it('Bug UX-1042 — a retained sales record opens its exact booking, customer, and provider cases', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: {
    rows: [{
      id: '14200000-0000-4000-8000-000000001042',
      orNumber: 'OR-1042',
      bookingId: '24200000-0000-4000-8000-000000001042',
      customerId: '34200000-0000-4000-8000-000000001042',
      customerName: 'Customer Receipt 1042',
      providerId: '44200000-0000-4000-8000-000000001042',
      providerName: 'Provider Receipt 1042',
      issuedAt: '2026-09-03T00:00:00.000Z',
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
      <MemoryRouter initialEntries={['/financials?tab=receipts']}><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('OR Number'), { target: { value: 'OR-1042' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  expect(await screen.findByRole('link', { name: 'Open Booking 360' })).toHaveAttribute(
    'href', '/bookings/24200000-0000-4000-8000-000000001042',
  );
  expect(screen.getByRole('link', { name: 'Customer Receipt 1042' })).toHaveAttribute(
    'href', '/customers/34200000-0000-4000-8000-000000001042',
  );
  expect(screen.getByRole('link', { name: 'Provider Receipt 1042' })).toHaveAttribute(
    'href', '/providers/44200000-0000-4000-8000-000000001042',
  );
});
