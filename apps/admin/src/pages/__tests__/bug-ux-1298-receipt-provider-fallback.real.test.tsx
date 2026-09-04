import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { ReceiptsPanel } from '../FinancialsPage';

it('Bug UX-1298 - legacy receipt rows show a safe placeholder when the provider name is null', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    rows: [{ id: 'receipt-1298', orNumber: 'OR-1298', customerName: 'Maria Santos', providerName: null,
      issuedAt: '2026-08-30T00:00:00.000Z', grossCentavos: 100000, vatCentavos: 12000,
      isCancellation: false, pdfUrl: null }],
    total: 1,
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><ReceiptsPanel /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('OR Number'), { target: { value: 'OR-1298' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  const row = (await screen.findByText('OR-1298')).closest('tr');
  expect(row).not.toBeNull();
  const providerCell = row!.querySelectorAll('td')[2];
  expect(providerCell).toHaveTextContent('—');
  expect(providerCell).not.toHaveTextContent('null');
});
