import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet, post: vi.fn() }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import RecurringPage from '../RecurringPage';

const seriesId = '91091091-0910-4910-8910-910910910910';
const sourceBookingId = '91091091-0910-4910-8910-910910910911';
const generatedBookingId = '91091091-0910-4910-8910-910910910912';

it('Bug UX-910 — Admin recurring support workspace links the customer, provider, source, generated booking, and support records while stating held boundaries', async () => {
  const series = {
    id: seriesId, customerId: 'customer-910', providerId: 'provider-910', categoryId: 'category-910',
    originalBookingId: sourceBookingId, frequency: 'weekly', preferredDayName: 'Tuesday', preferredTime: '09:00',
    city: 'Cebu City', province: 'Cebu', totalAmount: 55000, status: 'active', nextBookingDate: '2026-09-08',
    totalInstances: 1, createdAt: '2026-08-01', customerName: 'Maria Santos', providerName: 'Cebu Clean Co',
    categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', failedInstances: 1, openSupportTickets: 2,
  };
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/recurring') return { data: {
      success: true, data: [series],
      summary: { matchingSeries: 1, activeSeries: 1, seriesWithFailedInstances: 1, openSupportTickets: 2 },
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } };
    if (url === `/api/v1/admin/recurring/${seriesId}`) return { data: { success: true, data: {
      ...series, subcategoryId: 'subcategory-910', address: '1 Test Street', barangay: 'Lahug',
      servicePrice: 50000, serviceFee: 5000, lastBookingDate: '2026-09-01', skippedInstances: 0,
      generatedInstances: 1, cancellationReason: null, cancelledAt: null, originalBookingStatus: 'confirmed',
      originalBookingTotal: 54000, operationalPaymentMode: 'manual_per_booking',
      providerAssignmentState: 'legacy_provider_link', legacyAutoChargePreference: false,
    } } };
    if (url === `/api/v1/admin/recurring/${seriesId}/instances`) return { data: {
      success: true, data: [{
        id: 'instance-910', scheduledDate: '2026-09-01', status: 'created', bookingStatus: 'requested',
        bookingId: generatedBookingId, failureReason: null, bookingTotalAmount: 55000,
        bookingScheduledAt: '2026-09-01T01:00:00Z', bookingProviderId: 'provider-910',
        bookingProviderName: 'Cebu Clean Co', openSupportTickets: 2,
      }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } };
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><RecurringPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Review support workspace' }));

  expect(await screen.findByLabelText('Recurring booking support workspace')).toBeVisible();
  expect(screen.getByText('Manual payment boundary')).toBeVisible();
  expect(screen.getByText('Provider assignment hold')).toBeVisible();
  expect(screen.getAllByRole('link', { name: 'Open source booking' })[0]).toHaveAttribute('href', `/bookings/${sourceBookingId}`);
  expect(screen.getByRole('link', { name: 'Open booking' })).toHaveAttribute('href', `/bookings/${generatedBookingId}`);
  expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', `/support-tickets?bookingId=${generatedBookingId}`);
  expect(screen.getAllByRole('link', { name: 'Cebu Clean Co' })[0]).toHaveAttribute('href', '/providers/provider-910');
});
