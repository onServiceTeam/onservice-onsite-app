import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { CustomerHeader } from '../CustomerDetailPage';

it('Bug UX-748 — Customer 360 exposes support ownership and device access, then performs an explained all-device sign-out', async () => {
  apiMocks.post.mockResolvedValueOnce({
    data: { success: true, data: { revokedRefreshSessions: 3, sessionVersion: 8 } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const profile = {
    id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes',
    phone: '+63917••••567', email: 'a•••@example.com', contactMasked: true, avatarUrl: null,
    isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', lifetimeBookings: 10, lifetimeSpent: 500000,
    activeBookings: 1, openDisputes: 1, averageRatingGiven: 4.5, totalReviewsGiven: 8,
    activeRefreshSessions: 3, openSupportCases: 2, urgentSupportCases: 1,
    unassignedSupportCases: 1, supportOwnerNames: ['Mia Support'], addresses: [], sukiProviders: [],
  };

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CustomerHeader profile={profile} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText('Mia Support')).toBeVisible();
  expect(screen.getByText('1 urgent · 1 unassigned')).toBeVisible();
  expect(screen.getByText('View support history')).toHaveAttribute(
    'to',
    '/support-tickets?relatedCustomerId=customer-1&userRole=customer&userName=Ana%20Reyes',
  );
  expect(screen.getByText('All registered devices').previousElementSibling).toHaveTextContent('3');
  fireEvent.click(screen.getByRole('button', { name: 'Force sign-out' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Security or support reason' }), {
    target: { value: 'Customer lost the tablet used for the last service booking.' },
  });
  const confirms = screen.getAllByRole('button', { name: 'Force sign-out' });
  fireEvent.click(confirms[confirms.length - 1]!);

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/admin/customers/customer-1/revoke-sessions',
    { reason: 'Customer lost the tablet used for the last service booking.' },
  ));
  expect(await screen.findByText(/3 remembered sign-ins removed/i)).toBeVisible();
});
