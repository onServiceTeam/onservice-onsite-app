import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import CustomerDetailPage from '../CustomerDetailPage';

it('Bug UX-1159 — Customer 360 rejects an unknown workspace without loading unrelated customer records', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/customers/customer-1')) {
      return { data: { success: true, data: {
        id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes', phone: 'masked',
        email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true,
        isFlaggedFraud: false, lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z',
        lifetimeBookings: 0, lifetimeSpent: 0, activeBookings: 0, openDisputes: 0,
        averageRatingGiven: null, totalReviewsGiven: 0, addresses: [], sukiProviders: [],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/customers/customer-1?tab=unknown-workspace']}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const profile = await screen.findByRole('tab', { name: 'Profile' });
  await waitFor(() => expect(profile).toHaveAttribute('data-state', 'active'));
  expect(screen.getByText('Lifetime bookings')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledTimes(1);
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/customers/customer-1');
});
