import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { CustomerHeader } from '../CustomerDetailPage';

it('Bug UX-442 — Customer 360 visibly identifies an existing fraud-review flag and prevents duplicate flagging', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const profile = {
    id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes',
    phone: '+63917••••567', email: null, contactMasked: true, avatarUrl: null,
    isVerified: true, isActive: true, isFlaggedFraud: true, lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', lifetimeBookings: 10, lifetimeSpent: 500000,
    activeBookings: 0, openDisputes: 0, averageRatingGiven: null, totalReviewsGiven: 0,
    addresses: [], sukiProviders: [],
  };

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CustomerHeader profile={profile} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText('fraud review')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /manage status/i }));
  expect(screen.getByRole('button', { name: 'Fraud review flagged' })).toBeDisabled();
});
