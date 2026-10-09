import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { MoneyTab } from '../BookingDetailPage';

const detail = {
  id: 'sample-id', status: 'paid', escrowStatus: 'held', scheduledAt: '2026-08-31T01:00:00.000Z',
  completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
  pricingMode: 'fixed_price', servicePrice: 100000, serviceFee: 25000, totalAmount: 125000,
  conversationId: 'conversation-1', category: { id: 'category-1', name: 'Cleaning' }, subcategory: null,
  address: { full: '1 Osmeña Boulevard', barangay: 'Capitol Site', city: 'Cebu City', province: 'Cebu' },
  customer: null, provider: null, businessContext: null, createdAt: '2026-08-30T01:00:00.000Z',
};

it('Bug UX-476 — Booking 360 renders payment attempts, wallet movements, and legacy sales records in one money workspace', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/dispute')) return { data: { success: true, data: null } };
    if (url.endsWith('/money')) return { data: { success: true, data: {
      paymentIntents: [{
        id: 'intent-1', gatewayIntentId: 'pi_safe', gatewayPaymentId: 'pay_safe', amount: 125000,
        refundedAmount: 25000, paymentMethod: 'gcash', status: 'partially_refunded',
        createdAt: '2026-08-30T01:00:00.000Z', updatedAt: '2026-08-30T02:00:00.000Z',
      }],
      ledgerEntries: [{
        id: 'ledger-1', walletType: 'provider', walletUserId: 'provider-user-1', type: 'escrow_release',
        amount: 100000, balanceAfter: 140000, description: 'Booking release', referenceId: 'release-1',
        createdAt: '2026-08-30T03:00:00.000Z',
      }],
      salesRecords: [{
        id: 'receipt-1', number: 'OR-2026-08-000001', grossAmount: 125000, providerReceived: 100000,
        platformRetained: 25000, isCancellation: false, cancelledAt: null, pdfUrl: null,
        issuedAt: '2026-08-30T04:00:00.000Z',
      }],
    } } };
    return { data: { success: true, data: detail } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MoneyTab bookingId="sample-id" detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('pay_safe')).toBeVisible();
  expect(screen.getByText('release-1')).toBeVisible();
  expect(screen.getByText('OR-2026-08-000001')).toBeVisible();
  expect(screen.getByText('Open reconciliation')).toHaveAttribute('to', '/financials?tab=reconciliation');
  expect(screen.getByText(/Client keys are never shown/i)).toBeVisible();
});
