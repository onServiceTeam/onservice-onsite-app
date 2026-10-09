import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { SERIES_ID, apiGet } = vi.hoisted(() => ({
  SERIES_ID: '10781078-1078-4078-8078-107810781078',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import AuditLogPage from '../AuditLogPage';
import RecurringPage from '../RecurringPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current recurring audit handoff">{location.search}</output>;
}

it('Bug UX-1078 - a recurring cancellation audit event reopens the exact series support workspace', async () => {
  const series = {
    id: SERIES_ID,
    customerId: 'customer-1078',
    providerId: null,
    categoryId: 'category-1078',
    subcategoryId: 'subcategory-1078',
    originalBookingId: null,
    frequency: 'weekly',
    preferredDayName: 'Tuesday',
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    servicePrice: 50000,
    serviceFee: 5000,
    totalAmount: 55000,
    status: 'cancelled',
    nextBookingDate: '2026-09-08',
    lastBookingDate: null,
    totalInstances: 0,
    skippedInstances: 0,
    failedInstances: 0,
    generatedInstances: 0,
    openSupportTickets: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    cancelledAt: '2026-09-03T00:00:00.000Z',
    cancellationReason: 'Customer requested the future schedule be stopped.',
    customerName: 'Maria Santos',
    providerName: null,
    categoryName: 'Cleaning',
    subcategoryName: 'Home Cleaning',
    originalBookingStatus: null,
    originalBookingTotal: null,
    operationalPaymentMode: 'manual_per_booking',
    providerAssignmentState: 'unassigned',
    legacyAutoChargePreference: false,
  };

  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return Promise.resolve({ data: {
        data: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1078',
          source: 'admin_actions',
          userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1078',
          userEmail: 'o***@o***',
          userRole: 'admin',
          action: 'recurring_booking_cancelled',
          entityType: 'recurring_booking',
          entityId: SERIES_ID,
          oldValues: null,
          newValues: { frequency: 'weekly' },
          ipAddress: null,
          userAgent: null,
          reason: series.cancellationReason,
          createdAt: series.cancelledAt,
        }],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      } });
    }
    if (url === '/api/v1/admin/recurring') {
      return Promise.resolve({ data: {
        success: true,
        data: [],
        summary: { matchingSeries: 0, activeSeries: 0, seriesWithFailedInstances: 0, openSupportTickets: 0 },
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      } });
    }
    if (url === `/api/v1/admin/recurring/${SERIES_ID}`) {
      return Promise.resolve({ data: { success: true, data: series } });
    }
    if (url === `/api/v1/admin/recurring/${SERIES_ID}/instances`) {
      return Promise.resolve({ data: {
        success: true,
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const handoffRender = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <LocationEvidence />
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Recurring booking cancelled')).length).toBeGreaterThan(0);
  const destination = `/recurring?seriesId=${SERIES_ID}`;
  const destinationLink = handoffRender.container.querySelector(`a[href="${destination}"]`);
  expect(destinationLink).not.toBeNull();
  fireEvent.click(destinationLink!);

  expect(await screen.findByLabelText('Exact linked recurring booking')).toBeVisible();
  expect(await screen.findByLabelText('Recurring booking support workspace')).toBeVisible();
  expect(screen.getByText(series.cancellationReason)).toBeVisible();
  expect(screen.getByLabelText('Current recurring audit handoff')).toHaveTextContent(`?seriesId=${SERIES_ID}`);
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/admin/recurring/${SERIES_ID}`);
});
