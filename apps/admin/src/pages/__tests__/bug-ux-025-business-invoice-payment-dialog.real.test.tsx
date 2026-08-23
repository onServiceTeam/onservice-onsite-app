import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

get.mockResolvedValue({
  data: {
    data: [{
      id: 'invoice-1', invoiceNumber: 'INV-2026-008', billingPeriodStart: '2026-07-01',
      billingPeriodEnd: '2026-07-31', subtotal: 100000, discountAmount: 0, taxAmount: 12000,
      totalAmount: 112000, status: 'sent', dueDate: '2026-08-31', paidAt: null,
      paymentReference: null, createdAt: '2026-08-01T00:00:00.000Z',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  },
});
post.mockResolvedValue({ data: { success: true } });

import { InvoicesTab } from '../BusinessAccountDetailPage';

it('Bug UX-025 — marking a business invoice paid captures the reference in an auditable dialog', async () => {
  const promptSpy = vi.spyOn(window, 'prompt');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><InvoicesTab accountId="business-1" /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Mark invoice INV-2026-008 paid' }));
  expect(promptSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Mark invoice paid' })).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: '  OR-7712  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm paid' }));

  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/invoices/invoice-1/mark-paid',
    { paymentReference: 'OR-7712' },
  ));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mark invoice paid' })).toBeNull());
  promptSpy.mockRestore();
});
