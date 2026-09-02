import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import { BusinessBookingsTab } from '../BusinessAccountDetailPage';

it('Bug UX-665 — Business 360 links commercial work to customer, provider, support, contract, invoice, and Booking 360', async () => {
  apiGet.mockResolvedValue({ data: {
    success: true,
    data: [{
      id: 'booking-12345678', customerId: 'customer-1', customerName: 'Ana Reyes', providerId: 'provider-1', providerName: 'Cebu Clean',
      categoryName: 'Post-construction cleanup', status: 'in_progress', escrowStatus: 'held', totalAmount: 125000,
      scheduledAt: '2026-08-30T01:00:00.000Z', createdAt: '2026-08-29T01:00:00.000Z', contractId: 'contract-1', contractType: 'recurring',
      invoiceId: 'invoice-1', invoiceNumber: 'INV-202608-ABC123', invoiceStatus: 'sent', openSupportTickets: 1, openDisputes: 1,
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><BusinessBookingsTab accountId="11111111-1111-4111-8111-111111111111" accountName="Cebu Build Co" ownerUserId="owner-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('link', { name: 'booking-' })).toHaveAttribute('href', '/bookings/booking-12345678');
  expect(screen.getByRole('link', { name: 'Ana Reyes' })).toHaveAttribute('href', '/customers/customer-1');
  expect(screen.getByRole('link', { name: 'Cebu Clean' })).toHaveAttribute('href', '/providers/provider-1');
  expect(screen.getByRole('link', { name: '1 open support case' })).toHaveAttribute('href', '/support-tickets?bookingId=booking-12345678');
  expect(screen.getByText('INV-202608-ABC123 · Sent')).toBeInTheDocument();
});
