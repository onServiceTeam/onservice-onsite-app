import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { InvoiceDetailPanel } from '../BusinessAccountDetailPage';

it('Bug UX-982 — operator-entered payment time is explicitly interpreted as Philippine time', async () => {
  get.mockResolvedValue({ data: { success: true, data: {
    invoice: {
      id: 'invoice-982', invoiceNumber: 'INV-982', status: 'sent', totalAmount: 100_000,
      recordVersion: 3, controlState: 'controlled', settlementState: 'open',
      documentKind: 'commercial_statement', currency: 'PHP', finalizedAt: '2026-09-01T00:00:00.000Z',
    },
    items: [],
    balance: { adjustmentTotal: 0, paymentTotal: 0, adjustedTotal: 100_000, balanceDue: 100_000 },
    ledger: { adjustments: [], payments: [] },
  } } });
  post.mockResolvedValue({ data: { success: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><InvoiceDetailPanel invoiceId="invoice-982" onClose={() => undefined} /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Record payment evidence' }));
  fireEvent.change(screen.getByLabelText('Amount (PHP)'), { target: { value: '400' } });
  fireEvent.change(screen.getByLabelText('Effective date and time (Philippine time, UTC+8)'), { target: { value: '2026-09-02T10:30' } });
  fireEvent.change(screen.getByLabelText('Unique external reference'), { target: { value: 'BANK-982' } });
  fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'Bank line 982' } });
  fireEvent.change(screen.getByLabelText('Operator reason'), { target: { value: 'Record reviewed Philippine-time payment evidence.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and append evidence' }));

  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/invoices/invoice-982/payments',
    expect.objectContaining({ effectiveAt: '2026-09-02T02:30:00.000Z' }),
  ));
});
