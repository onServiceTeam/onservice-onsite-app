import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1084 — official receipt audit events open the exact Booking 360 receipt evidence workspace', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: '11111111-1111-4111-8111-111111111111', source: 'admin_actions', userId: 'admin-1',
    userEmail: 'ad***@example.com', userRole: 'super_admin', targetBookingId: BOOKING_ID,
    action: 'or_cancelled', entityType: 'official_receipt',
    entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', oldValues: null,
    newValues: { originalOrNumber: 'OR-2026-09-000001' }, ipAddress: null,
    userAgent: null, reason: 'Duplicate receipt', createdAt: '2026-09-03T09:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findAllByText('Official receipt cancelled')).toHaveLength(2);
  expect(screen.getByRole('link', { name: /Open Booking 360 receipt evidence/ })).toHaveAttribute(
    'to', `/bookings/${BOOKING_ID}`,
  );
});
