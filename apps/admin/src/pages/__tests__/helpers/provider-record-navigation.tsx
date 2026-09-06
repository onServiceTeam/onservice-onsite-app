import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ProviderDetailPage, { type ProviderProfile } from '../../ProviderDetailPage';

export const firstProviderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const secondProviderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const financials = { totalEarned: 0, totalCommissionPaid: 0, walletAvailable: 0,
  walletPending: 0, monthlyEarnings: [], recentPayouts: [] };

function profile(id: string, name: string, suffix: string): ProviderProfile {
  return {
    id, userId: `user-${id}`, businessName: `Synthetic ${name} Services`, description: '',
    tier: 'new', status: 'approved', averageRating: 0, totalReviews: 0,
    totalJobsCompleted: 0, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
    city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    user: { id: `user-${id}`, fullName: `Synthetic ${name}`, phone: `+63917****${suffix}`,
      email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
    documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
      avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
    categories: [], declaredCategories: [], services: [], serviceAreas: [], certifications: [], portfolio: [],
  };
}

export function mountProviderRecords(tab = 'profile') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } } });
  const first = profile(firstProviderId, 'Alpha', '111');
  const second = profile(secondProviderId, 'Beta', '222');
  for (const item of [first, second]) {
    client.setQueryData(['admin-provider-profile', item.id], item);
    client.setQueryData(['admin-provider-financials', item.id], financials);
    client.setQueryData(['admin-provider-notes', item.id], []);
  }
  const router = createMemoryRouter([{ path: '/providers/:id', element: <ProviderDetailPage /> }], {
    initialEntries: [`/providers/${first.id}?tab=${tab}`],
  });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { client, router, first, second, close: () => { view.unmount(); router.dispose(); client.clear(); } };
}
