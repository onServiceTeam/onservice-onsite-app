import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({
    id: '97400000-abcd-4abc-8def-000000000974',
    invoiceId: '97400000-abcd-4abc-8def-000000000975',
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/business.service', () => ({
  getInvoiceDetail: jest.fn().mockResolvedValue({
    id: '97400000-abcd-4abc-8def-000000000975', invoiceNumber: 'INV-202609-TEST', billingPeriodStart: '2026-08-01',
    billingPeriodEnd: '2026-08-31', dueDate: '2026-09-30', currency: 'PHP',
    totalAmount: 100_000, status: 'paid', settlementState: 'credit_due',
    balance: { adjustmentTotal: -30_000, paymentTotal: 80_000, adjustedTotal: 70_000, balanceDue: -10_000 },
    items: [{
      id: 'item-1', bookingId: 'booking-1', description: 'Monthly site cleaning',
      serviceDate: '2026-08-20', quantity: 1, unitPrice: 100_000, discountAmount: 0, amount: 100_000,
    }],
    ledger: {
      adjustments: [{ id: 'adjustment-1', adjustmentType: 'credit', amount: 30_000, currency: 'PHP', createdAt: '2026-09-02T01:00:00.000Z' }],
      payments: [{
        id: 'payment-1', entryType: 'payment', reversesPaymentId: null, amount: 80_000,
        currency: 'PHP', method: 'bank_transfer', effectiveAt: '2026-09-02T02:00:00.000Z',
        externalReference: 'BANK-974', createdAt: '2026-09-02T02:01:00.000Z',
      }],
    },
  }),
}));

import BusinessStatementScreen from '../app/customer/business/[id]/invoices/[invoiceId]';

it('Bug UX-974 — customer statement detail distinguishes credit due, linked work, and operator-recorded external evidence', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessStatementScreen /></QueryClientProvider>);

  expect(await screen.findByText('INV-202609-TEST')).toBeTruthy();
  expect(screen.getByText('Credit owed to company')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open booking for Monthly site cleaning' })).toBeTruthy();
  expect(screen.getByText('External payment evidence')).toBeTruthy();
  expect(screen.getByText(/not a claim of live bank or PayMongo verification/i)).toBeTruthy();
});
