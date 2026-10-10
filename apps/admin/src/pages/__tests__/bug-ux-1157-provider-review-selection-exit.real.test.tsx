import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REVIEW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import ProviderDetailPage from '../ProviderDetailPage';

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

it('Bug UX-1157 — leaving Provider 360 reviews clears only the stale exact review target', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/providers/provider-1/profile') {
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
    }
    if (url === '/api/v1/admin/providers/provider-1/reviews') {
      return { data: { success: true, data: { rows: [{
        id: REVIEW_ID, bookingId: 'booking-1', reviewerId: 'customer-1', reviewerName: 'Ana Reyes',
        rating: 5, comment: 'Exact review evidence', isVisible: true, isFlagged: false,
        privateNote: null, adminResponse: null, imageUrls: [], createdAt: '2026-09-01T00:00:00.000Z',
      }], total: 1, page: 1, pageSize: 1 } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/providers/provider-1?tab=reviews&reviewId=${REVIEW_ID}&supportCase=SUP-42`]}>
        <LocationProbe />
        <Routes>
          <Route path="/providers/:id" element={<ProviderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact provider review evidence')).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Profile' }), { button: 0, ctrlKey: false });

  await waitFor(() => {
    expect(screen.getByTestId('location')).toHaveTextContent('/providers/provider-1?supportCase=SUP-42');
  });
  expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('data-state', 'active');
});
