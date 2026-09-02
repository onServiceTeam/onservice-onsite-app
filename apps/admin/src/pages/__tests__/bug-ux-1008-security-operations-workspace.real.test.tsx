import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import SecurityOperationsPage from '../SecurityOperationsPage';

it('Bug UX-1008 — Security Operations links settings, explains automation, and performs a reasoned unblock from the active queue', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/blocked-ips')) {
      return Promise.resolve({
        data: {
          data: [{
            id: 'block-1008',
            ipAddress: '203.0.113.108',
            reason: 'Auto-blocked: 14 failed login attempts in 1 hour',
            blockedBy: null,
            expiresAt: '2026-09-03T00:00:00.000Z',
            isActive: true,
            createdAt: '2026-09-02T00:00:00.000Z',
          }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      });
    }
    return Promise.resolve({
      data: {
        data: [{
          id: 'event-1008',
          userId: null,
          eventType: 'ip_blocked',
          ipAddress: '203.0.113.108',
          deviceFingerprint: null,
          metadata: { source: 'detectSuspiciousIps', expiresInHours: 24 },
          createdAt: '2026-09-02T00:00:00.000Z',
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });
  });
  apiMocks.post.mockResolvedValue({ data: { success: true } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SecurityOperationsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('203.0.113.108')).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole('link', { name: /Security settings/i })).toHaveAttribute(
    'href',
    '/settings?category=security',
  );
  expect(screen.getByText(/Unblocking does not erase failed-attempt evidence/i)).toBeVisible();
  expect(screen.getByText('Ip Blocked')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Review unblock' }));
  expect(screen.getByRole('dialog', { name: /Unblock 203\.0\.113\.108/i })).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'Unblock audit reason' }), {
    target: { value: 'Verified shared-office address after customer support review.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm unblock' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/admin/blocked-ips/203.0.113.108/unblock',
    { reason: 'Verified shared-office address after customer support review.' },
  ));
  expect(await screen.findByText(/five-minute worker can re-block it/i)).toBeVisible();
});
