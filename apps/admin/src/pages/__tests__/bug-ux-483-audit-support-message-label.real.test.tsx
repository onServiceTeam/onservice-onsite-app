import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: 'action-1',
            source: 'admin_actions',
            userId: 'admin-1',
            userEmail: 'support@onservice.ph',
            userRole: 'admin',
            action: 'admin_message_sent',
            entityType: 'booking',
            entityId: 'booking-1',
            oldValues: null,
            newValues: { recipients: ['customer', 'provider'] },
            ipAddress: null,
            userAgent: null,
            reason: 'Provider and customer need the same arrival update.',
            createdAt: '2026-08-30T12:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      },
    }),
  },
}));

import AuditLogPage from '../AuditLogPage';

describe('AuditLogPage support-message terminology', () => {
  it('Bug UX-483 — labels participant support messages without claiming they are customer-only', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLogPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Booking support message sent')).toBeInTheDocument();
    expect(screen.queryByText('Admin message sent to customer')).not.toBeInTheDocument();
  });
});
