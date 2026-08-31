import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { ProviderHeader, type ProviderProfile } from '../ProviderDetailPage';

it('Bug UX-749 — Provider 360 combines support ownership, area review, account access, and explained suspension in one workspace', async () => {
  apiMocks.put.mockResolvedValueOnce({ data: { success: true } });
  const profile = {
    id: 'provider-1', userId: 'provider-user-1', businessName: 'Cebu Cleaners', description: '',
    tier: 'verified', status: 'approved', averageRating: 4.8, totalReviews: 10,
    totalJobsCompleted: 30, serviceRadiusKm: 20, yearsExperience: 5, vettingAnswers: null,
    city: 'Cebu City', province: 'Cebu', latitude: 10.3, longitude: 123.9,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    activeRefreshSessions: 2, openSupportCases: 3, urgentSupportCases: 1,
    unassignedSupportCases: 0, supportOwnerNames: ['Mia Support'], pendingServiceAreaChanges: 1,
    user: { id: 'provider-user-1', fullName: 'Ramil Santos', phone: '+63917••••111',
      email: 'r•••@example.com', contactMasked: true, avatarUrl: null, isVerified: true,
      isActive: true, lastLoginAt: '2026-08-30T00:00:00.000Z' },
    documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
      avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
    categories: [], services: [], serviceAreas: [], certifications: [], portfolio: [],
  } satisfies ProviderProfile;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProviderHeader profile={profile} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText('Mia Support')).toBeVisible();
  expect(screen.getByText('1 urgent · 0 unassigned')).toBeVisible();
  expect(screen.getByText('View support history')).toHaveAttribute(
    'to',
    '/support-tickets?relatedProviderId=provider-1&userRole=provider&userName=Cebu%20Cleaners',
  );
  expect(screen.getByText('Review provider requests')).toHaveAttribute('to', '/service-areas?providerId=provider-1');
  fireEvent.click(screen.getByRole('button', { name: 'Suspend provider' }));
  expect(screen.getByText(/immediately invalidates every provider access and refresh credential/i)).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'Suspension reason' }), {
    target: { value: 'Support case OS-749 confirms a compromised provider account.' },
  });
  const confirms = screen.getAllByRole('button', { name: 'Suspend provider' });
  fireEvent.click(confirms[confirms.length - 1]!);

  await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/suspend',
    { reason: 'Support case OS-749 confirms a compromised provider account.' },
  ));
});
