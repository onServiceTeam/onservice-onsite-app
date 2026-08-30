import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, setSearchParamsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setSearchParamsMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: getMock },
  getErrorMessage: (error: unknown) => String(error),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), setSearchParamsMock],
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

import AuditLogPage from '../AuditLogPage';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const SUPPORT_ID = '22222222-2222-4222-8222-222222222222';

function result() {
  return {
    data: {
      data: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          source: 'admin_actions',
          userId: '44444444-4444-4444-8444-444444444444',
          userEmail: 's***@o***',
          userRole: 'admin',
          action: 'booking_reassigned',
          entityType: 'booking',
          entityId: BOOKING_ID,
          oldValues: null,
          newValues: { providerId: 'masked' },
          ipAddress: null,
          userAgent: null,
          reason: 'Coverage handoff',
          createdAt: '2026-08-30T12:00:00.000Z',
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          source: 'admin_actions',
          userId: '44444444-4444-4444-8444-444444444444',
          userEmail: 's***@o***',
          userRole: 'admin',
          action: 'support_ticket_status_updated',
          entityType: 'support_ticket',
          entityId: SUPPORT_ID,
          oldValues: null,
          newValues: { status: 'in_progress' },
          ipAddress: null,
          userAgent: null,
          reason: 'Customer called support',
          createdAt: '2026-08-30T11:00:00.000Z',
        },
      ],
      pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    },
  };
}

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  setSearchParamsMock.mockReset();
  getMock.mockResolvedValue(result());
});

describe('AuditLogPage operations workspace', () => {
  it('Bug UX-537 — opens canonical booking and support records from timeline rows', async () => {
    const { container } = renderPage();

    await screen.findAllByText('Booking reassigned');
    expect(container.querySelector(`a[href="/bookings/${BOOKING_ID}"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="/support-tickets?ticketId=${SUPPORT_ID}"]`)).not.toBeNull();
  });

  it('Bug UX-538 — does not query the server for each filter keystroke', async () => {
    renderPage();
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Filter audit log by action'), {
      target: { value: 'booking' },
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    fireEvent.submit(screen.getByRole('form', { name: 'Audit timeline filters' }));
    expect(setSearchParamsMock).toHaveBeenCalledTimes(1);
    const applied = setSearchParamsMock.mock.calls[0]?.[0] as URLSearchParams;
    expect(applied.get('action')).toBe('booking');
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('Bug UX-539 — renders both desktop table and narrow-screen card compositions', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Booking reassigned');

    expect(container.querySelector('table')).not.toBeNull();
    const narrowCards = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('Booking reassigned'),
    );
    expect(narrowCards.length).toBeGreaterThan(0);
  });
});
