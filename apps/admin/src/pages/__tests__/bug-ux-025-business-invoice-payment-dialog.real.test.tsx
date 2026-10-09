import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

get.mockResolvedValue({ data: { success: true, data: {
  invoice: {
    id: 'invoice-1', invoiceNumber: 'INV-2026-008', billingPeriodStart: '2026-07-01',
    billingPeriodEnd: '2026-07-31', subtotal: 100000, discountAmount: 0, taxAmount: 0,
    totalAmount: 100000, status: 'sent', dueDate: '2026-08-31', paidAt: null,
    paymentReference: null, recordVersion: 3, controlState: 'controlled',
    documentKind: 'commercial_statement', currency: 'PHP', accountTermsVersionId: 'terms-1',
    preparationPreviewId: 'preview-1', preparedAt: '2026-08-01T00:00:00.000Z',
    finalizedAt: '2026-08-01T01:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
  },
  items: [],
  balance: { adjustmentTotal: 0, paymentTotal: 0, adjustedTotal: 100000, balanceDue: 100000 },
  ledger: { adjustments: [], payments: [] },
} } });
post.mockResolvedValue({ data: { success: true } });

import { InvoiceDetailPanel } from '../BusinessAccountDetailPage';

it('Bug UX-025 — recording external payment requires amount, method, time, unique reference, evidence, and a reason', async () => {
  const promptSpy = vi.spyOn(window, 'prompt');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><InvoiceDetailPanel invoiceId="invoice-1" onClose={() => undefined} /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Record payment evidence' }));
  expect(promptSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Record external payment evidence' })).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Amount (PHP)'), { target: { value: '400' } });
  fireEvent.change(screen.getByLabelText('Unique external reference'), { target: { value: 'BANK-7712' } });
  fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'Private statement line 14' } });
  fireEvent.change(screen.getByLabelText('Operator reason'), { target: { value: 'Record the first reviewed partial bank transfer.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and append evidence' }));

  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/invoices/invoice-1/payments',
    expect.objectContaining({
      expectedVersion: 3,
      amount: 40000,
      currency: 'PHP',
      method: 'bank_transfer',
      externalReference: 'BANK-7712',
      evidenceReference: 'Private statement line 14',
      reason: 'Record the first reviewed partial bank transfer.',
    }),
  ));
  promptSpy.mockRestore();
});
