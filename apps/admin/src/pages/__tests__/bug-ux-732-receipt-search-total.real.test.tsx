import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { ReceiptsPanel } from '../FinancialsPage';

it('Bug UX-732 — legacy sales-record search exposes the true total instead of silently truncating at the row limit', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    rows: [{ id: 'receipt-1', orNumber: 'OR-001', customerName: 'Maria Santos', providerName: null,
      issuedAt: '2026-08-30T00:00:00.000Z', grossCentavos: 100000, vatCentavos: 12000,
      isCancellation: false, pdfUrl: null }],
    total: 250,
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><ReceiptsPanel /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('OR Number'), { target: { value: 'OR-' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  expect(await screen.findByText(/Showing 1–50 of 250 retained records/)).toBeVisible();
  expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
});
