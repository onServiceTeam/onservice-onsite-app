import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CERT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

it('Bug UX-1145 — leaving Provider 360 certifications clears only the stale exact credential target', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
    id: 'provider-1', userId: 'provider-user-1', businessName: 'Cebu Cleaners', description: '',
    tier: 'verified', status: 'approved', averageRating: 4.8, totalReviews: 10,
    totalJobsCompleted: 30, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
    city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    user: { id: 'provider-user-1', fullName: 'Ramil Santos', phone: 'masked', email: null,
      contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
    documents: {}, categories: [], services: [], serviceAreas: [], certifications: [{
      id: CERT_ID, name: 'Electrical Installation NC II', issuingBody: 'TESDA',
      certificateNumber: null, issuedDate: null, expiryDate: null, isVerified: false,
      verifiedAt: null, hasDocument: true, documentUrl: '/private/certificate',
      createdAt: '2025-01-01T00:00:00.000Z',
    }], portfolio: [],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/providers/provider-1?tab=certifications&certificationId=${CERT_ID}&supportCase=SUP-42`]}>
        <LocationProbe />
        <Routes>
          <Route path="/providers/:id" element={<ProviderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact certification evidence')).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Profile' }), { button: 0, ctrlKey: false });

  await waitFor(() => {
    expect(screen.getByTestId('location')).toHaveTextContent('/providers/provider-1?supportCase=SUP-42');
  });
  expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('data-state', 'active');
});
