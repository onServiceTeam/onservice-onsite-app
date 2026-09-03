import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { LegacyFinancialReviewPanel } from '../LegacyFinancialReviewPanel';

it('Bug OPS-267 — legacy review requires reproducible fee inputs, cited evidence, and explicit confirmation before approval', async () => {
  const booking = {
    bookingId: '00000000-0000-4000-8000-000000000267', status: 'paid', escrowStatus: 'held',
    customerId: 'customer-1', customerName: 'Maria Customer', providerId: 'provider-1',
    providerName: 'Provider One', currentProviderTier: 'verified', categoryName: 'Plumbing',
    serviceName: 'Sink repair', servicePriceCentavos: 100000, serviceFeeCentavos: 10000,
    totalAmountCentavos: 110000, paymentMethod: 'gcash', bookingPaymentIntentId: 'pi-booking',
    scheduledAt: '2026-08-02T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T01:00:00.000Z',
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/financials/legacy-reviews') {
      return { data: { success: true, data: { items: [booking], total: 1 } } } as never;
    }
    if (url.endsWith(booking.bookingId)) {
      return { data: { success: true, data: {
        booking,
        paymentIntents: [{ id: 'intent-1', amount: 110000, status: 'succeeded', paymongo_intent_id: 'pi-original', created_at: '2026-08-01T00:10:00.000Z' }],
        walletTransactions: [{ id: 'wallet-1', amount: 110000, type: 'escrow_hold', reference_id: 'pi-original', created_at: '2026-08-01T00:11:00.000Z' }],
        quotes: [],
      } } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: { id: 'terms-1' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><LegacyFinancialReviewPanel /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Review evidence' }));
  expect(await screen.findByText(/Current tier is verified; this is not proof/)).toBeVisible();
  expect(screen.getAllByText('pi-original').length).toBeGreaterThan(0);
  const approve = screen.getByRole('button', { name: 'Complete reviewed terms' });
  expect(approve).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Historical provider tier'), { target: { value: 'new' } });
  fireEvent.change(screen.getByLabelText('Historical commission (%)'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Service fee rate (%)'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Service fee minimum (PHP)'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Service fee maximum (PHP)'), { target: { value: '500' } });
  fireEvent.change(screen.getByLabelText('Guarantee fund rate (%)'), { target: { value: '1.5' } });
  for (const label of [
    'Over 24 hours refund (%)', '2 to 24 hours refund (%)', '1 to 2 hours refund (%)',
    '30 to 60 minutes refund (%)', 'Under 30 minutes refund (%)',
    'Provider arrived refund (%)', 'Customer no-show refund (%)',
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: '50' } });
  }
  fireEvent.change(screen.getByLabelText('Evidence references, one per line'), {
    target: { value: 'payment-intent: pi-original\nprovider agreement: archive-267' },
  });
  fireEvent.change(screen.getByLabelText('Review note (30 to 2000 characters)'), {
    target: { value: 'Verified against the original payment and signed provider agreement archive.' },
  });
  fireEvent.change(screen.getByLabelText(/Type REVIEW LEGACY FINANCIAL TERMS/), {
    target: { value: 'REVIEW LEGACY FINANCIAL TERMS' },
  });

  expect(screen.getByText(/Fee reproduced: ₱100.00/)).toBeVisible();
  expect(approve).toBeEnabled();
  fireEvent.click(approve);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/api/v1/admin/financials/legacy-reviews/${booking.bookingId}/complete`,
    expect.objectContaining({
      providerTier: 'new', commissionRateBasisPoints: 1200,
      serviceFeeRateBasisPoints: 1000, serviceFeeMaxCentavos: 50000,
      evidenceReferences: ['payment-intent: pi-original', 'provider agreement: archive-267'],
      confirmation: 'REVIEW LEGACY FINANCIAL TERMS',
    }),
  ));
}, 15_000);
