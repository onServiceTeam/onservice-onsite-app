import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { InvoiceDetailPanel } from '../BusinessAccountDetailPage';

it('Bug UX-977 — payment evidence reduces the balance while a reversal visibly adds it back', async () => {
  get.mockResolvedValue({ data: { success: true, data: {
    invoice: {
      id: 'invoice-977', invoiceNumber: 'INV-202609-REV977', status: 'sent',
      totalAmount: 100_000, recordVersion: 5, controlState: 'controlled',
      settlementState: 'open', documentKind: 'commercial_statement', currency: 'PHP',
    },
    items: [],
    balance: { adjustmentTotal: 0, paymentTotal: 60_000, adjustedTotal: 100_000, balanceDue: 40_000 },
    ledger: { adjustments: [], payments: [
      {
        id: 'payment-977', entryType: 'payment', reversesPaymentId: null, amount: 80_000,
        currency: 'PHP', method: 'bank_transfer', effectiveAt: '2026-09-01T02:00:00.000Z',
        externalReference: 'BANK-PAY-977', evidenceReference: 'Bank line 10',
        reason: 'Reviewed original external payment.', createdAt: '2026-09-01T02:00:00.000Z',
      },
      {
        id: 'reversal-977', entryType: 'reversal', reversesPaymentId: 'payment-977', amount: 20_000,
        currency: 'PHP', method: 'bank_transfer', effectiveAt: '2026-09-02T02:00:00.000Z',
        externalReference: 'BANK-REV-977', evidenceReference: 'Bank reversal line 11',
        reason: 'Reviewed returned payment evidence.', createdAt: '2026-09-02T02:00:00.000Z',
      },
    ] },
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><InvoiceDetailPanel invoiceId="invoice-977" onClose={() => undefined} /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('−₱800.00')).toBeInTheDocument();
  expect(screen.getByText('+₱200.00')).toBeInTheDocument();
});
