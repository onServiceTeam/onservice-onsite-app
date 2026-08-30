import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { CustomerHeader } from '../CustomerDetailPage';

it('Bug UX-439 — customer suspension requires a reason and exposes the exact session, booking, wallet, and dispute boundary', async () => {
  apiMocks.put.mockResolvedValueOnce({ data: { success: true, data: { isActive: false } } });
  const confirmSpy = vi.spyOn(window, 'confirm');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const profile = {
    id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes',
    phone: '+63917••••567', email: 'a•••@example.com', contactMasked: true, avatarUrl: null,
    isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', lifetimeBookings: 10, lifetimeSpent: 500000,
    activeBookings: 3, openDisputes: 2, averageRatingGiven: 4.5, totalReviewsGiven: 8,
    addresses: [], sukiProviders: [],
  };

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CustomerHeader profile={profile} /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: /manage status/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(screen.getByText(/revokes stored refresh sessions/i)).toBeTruthy();
  expect(screen.getByText(/does not cancel 3 active bookings, move wallet funds, or resolve 2 open disputes/i)).toBeTruthy();
  expect(screen.getByText(/audit reason stays internal/i)).toBeTruthy();
  const submit = screen.getByRole('button', { name: 'Suspend customer' });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Suspension reason' }), {
    target: { value: 'Support case OS-521 confirms an account takeover.' },
  });
  fireEvent.click(submit);

  await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith(
    '/api/v1/admin/customers/customer-1/status',
    {
      action: 'suspend',
      reason: 'Support case OS-521 confirms an account takeover.',
    },
  ));
  confirmSpy.mockRestore();
});
