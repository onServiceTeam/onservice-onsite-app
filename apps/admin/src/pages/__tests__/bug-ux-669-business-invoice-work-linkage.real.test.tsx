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
    invoice: { id: 'invoice-1', invoiceNumber: 'INV-202608-ABC123', status: 'paid', paymentReference: 'BANK-7712' },
    items: [{
      id: 'item-1', bookingId: 'booking-12345678', contractId: 'contract-1', description: 'Monthly cleanup', serviceDate: '2026-08-10',
      quantity: 1, unitPrice: 100000, discountAmount: 5000, amount: 95000, bookingStatus: 'confirmed', customerId: 'customer-1',
      customerName: 'Ana Reyes', providerId: 'provider-1', providerName: 'Cebu Clean', serviceName: 'Post-construction cleanup',
    }],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><InvoiceDetailPanel invoiceId="invoice-1" onClose={() => undefined} /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('BANK-7712')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open booking booking-' })).toHaveAttribute('href', '/bookings/booking-12345678');
  expect(screen.getByRole('link', { name: 'Ana Reyes' })).toHaveAttribute('href', '/customers/customer-1');
  expect(screen.getByRole('link', { name: 'Cebu Clean' })).toHaveAttribute('href', '/providers/provider-1');
});
