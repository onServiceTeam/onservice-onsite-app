import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({
    id: '12420000-ABCD-4ABC-8DEF-000000001242',
    invoiceId: '12420000-ABCD-4ABC-8DEF-000000001243',
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/business.service', () => ({
  getInvoiceDetail: jest.fn().mockResolvedValue({
    id: '12420000-abcd-4abc-8def-000000001243', invoiceNumber: 'INV-1242',
    billingPeriodStart: '2026-08-01', billingPeriodEnd: '2026-08-31', dueDate: '2026-09-30',
    currency: 'PHP', totalAmount: 100_000, status: 'sent', settlementState: 'open',
    balance: { adjustmentTotal: 0, paymentTotal: 0, adjustedTotal: 100_000, balanceDue: 100_000 },
    items: [], ledger: { adjustments: [], payments: [] },
  }),
}));

import BusinessStatementScreen from '../app/customer/business/[id]/invoices/[invoiceId]';
import { getInvoiceDetail } from '@/services/business.service';

it('Bug UX-1242 - uppercase company and statement UUIDs are canonicalized before the financial read', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessStatementScreen /></QueryClientProvider>);

  expect(await screen.findByText('INV-1242')).toBeTruthy();
  await waitFor(() => expect(getInvoiceDetail).toHaveBeenCalledWith(
    '12420000-abcd-4abc-8def-000000001242',
    '12420000-abcd-4abc-8def-000000001243',
  ));
});
