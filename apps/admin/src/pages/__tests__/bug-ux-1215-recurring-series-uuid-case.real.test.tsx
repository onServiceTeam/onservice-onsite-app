import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import RecurringPage from '../RecurringPage';

it('Bug UX-1215 - an uppercase recurring series link loads the canonical support record', async () => {
  const seriesId = '12150000-abcd-4abc-8def-000000001215';
  const series = {
    id: seriesId,
    customerId: 'customer-1215',
    providerId: null,
    categoryId: 'category-1215',
    subcategoryId: null,
    originalBookingId: null,
    frequency: 'weekly',
    preferredDayName: 'Monday',
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    servicePrice: 50000,
    serviceFee: 5000,
    totalAmount: 55000,
    status: 'active',
    nextBookingDate: '2026-09-07',
    lastBookingDate: null,
    totalInstances: 0,
    skippedInstances: 0,
    failedInstances: 0,
    generatedInstances: 0,
    openSupportTickets: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    cancellationReason: null,
    cancelledAt: null,
    customerName: 'Maria Santos',
    providerName: null,
    categoryName: 'Cleaning',
    subcategoryName: null,
    originalBookingStatus: null,
    originalBookingTotal: null,
    operationalPaymentMode: 'manual_per_booking',
    providerAssignmentState: 'unassigned',
    legacyAutoChargePreference: false,
  };
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/recurring') {
      return Promise.resolve({ data: {
        success: true,
        data: [],
        summary: { matchingSeries: 0, activeSeries: 0, seriesWithFailedInstances: 0, openSupportTickets: 0 },
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      } });
    }
    if (url === `/api/v1/admin/recurring/${seriesId}`) {
      return Promise.resolve({ data: { success: true, data: series } });
    }
    if (url === `/api/v1/admin/recurring/${seriesId}/instances`) {
      return Promise.resolve({ data: {
        success: true,
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/recurring?seriesId=${seriesId.toUpperCase()}`]}>
        <RecurringPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Recurring booking support workspace')).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/admin/recurring/${seriesId}`);
  expect(apiGet).toHaveBeenCalledWith(
    `/api/v1/admin/recurring/${seriesId}/instances`,
    { params: { page: 1, pageSize: 20 } },
  );
  expect(apiGet.mock.calls.some(([url]) => String(url).includes(seriesId.toUpperCase()))).toBe(false);
});
