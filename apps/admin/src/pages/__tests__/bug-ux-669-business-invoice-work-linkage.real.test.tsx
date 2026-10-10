import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import { InvoiceDetailPanel } from '../BusinessAccountDetailPage';

it('Bug UX-669 — invoice detail exposes its external reference and canonical booking, customer, and provider exits', async () => {
  apiGet.mockResolvedValue({ data: { success: true, data: {
    invoice: {
      id: 'invoice-1', invoiceNumber: 'INV-202608-ABC123', status: 'paid', paymentReference: 'BANK-7712',
      totalAmount: 95000, recordVersion: 4, controlState: 'controlled', documentKind: 'commercial_statement',
      currency: 'PHP', accountTermsVersionId: 'terms-1', preparationPreviewId: 'preview-1',
    },
    items: [{
      id: 'item-1', bookingId: 'booking-12345678', contractId: 'contract-1', description: 'Monthly cleanup', serviceDate: '2026-08-10',
      quantity: 1, unitPrice: 100000, discountAmount: 5000, amount: 95000, bookingStatus: 'confirmed', customerId: 'customer-1',
      customerName: 'Ana Reyes', providerId: 'provider-1', providerName: 'Cebu Clean', serviceName: 'Post-construction cleanup',
    }],
    balance: { adjustmentTotal: 0, paymentTotal: 95000, adjustedTotal: 95000, balanceDue: 0 },
    ledger: {
      adjustments: [],
      payments: [{
        id: 'payment-1', entryType: 'payment', reversesPaymentId: null, amount: 95000, currency: 'PHP',
        method: 'bank_transfer', effectiveAt: '2026-08-20T02:00:00.000Z', externalReference: 'BANK-7712',
        evidenceReference: 'Private statement line 9', reason: 'Reviewed external settlement evidence.',
        classification: 'operator_recorded_external_evidence_not_gateway_verified', createdAt: '2026-08-20T02:00:00.000Z',
      }],
    },
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><InvoiceDetailPanel invoiceId="invoice-1" onClose={() => undefined} /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('BANK-7712')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open booking booking-' })).toHaveAttribute('href', '/bookings/booking-12345678');
  expect(screen.getByRole('link', { name: 'Ana Reyes' })).toHaveAttribute('href', '/customers/customer-1');
  expect(screen.getByRole('link', { name: 'Cebu Clean' })).toHaveAttribute('href', '/providers/provider-1');
});
