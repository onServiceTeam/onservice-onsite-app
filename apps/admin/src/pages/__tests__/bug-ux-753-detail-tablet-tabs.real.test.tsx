import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import CustomerDetailPage from '../CustomerDetailPage';
import ProviderDetailPage from '../ProviderDetailPage';

it('Bug UX-753 — Customer and Provider 360 render every tab in one horizontally scrollable tablet navigation rail', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('/customers/')) return { data: { success: true, data: {
      id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes', phone: 'masked',
      email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true,
      isFlaggedFraud: false, lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z',
      lifetimeBookings: 0, lifetimeSpent: 0, activeBookings: 0, openDisputes: 0,
      averageRatingGiven: null, totalReviewsGiven: 0, addresses: [], sukiProviders: [],
    } } };
    return { data: { success: true, data: {
      id: 'provider-1', userId: 'provider-user-1', businessName: 'Cebu Cleaners', description: '',
      tier: 'verified', status: 'approved', averageRating: 4.8, totalReviews: 10,
      totalJobsCompleted: 30, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
      city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      user: { id: 'provider-user-1', fullName: 'Ramil Santos', phone: 'masked', email: null,
        contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
      documents: {}, categories: [], services: [], serviceAreas: [], certifications: [], portfolio: [],
    } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/customers/customer-1', '/providers/provider-1']} initialIndex={0}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
      <MemoryRouter initialEntries={['/providers/provider-1']}>
        <Routes>
          <Route path="/providers/:id" element={<ProviderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getAllByRole('tablist')).toHaveLength(2));
  const tabLists = screen.getAllByRole('tablist');
  expect(tabLists).toHaveLength(2);
  for (const tabList of tabLists) {
    expect(tabList).toHaveClass('overflow-x-auto', 'h-auto');
  }
  expect(screen.getAllByRole('tab')).toHaveLength(15);
  expect(screen.getByRole('tab', { name: 'Referrals' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Notes' })).toBeVisible();
});
