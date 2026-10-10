import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ADMIN_ACTION_ID = '71690000-0000-4000-8000-000000001169';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import CustomerDetailPage from '../CustomerDetailPage';

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

it('Bug UX-1169 — leaving Customer 360 Activity clears only the stale exact admin decision', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/customers/customer-1') {
      return { data: { success: true, data: {
        id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes', phone: 'masked',
        email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: false,
        isFlaggedFraud: false, lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z',
        lifetimeBookings: 2, lifetimeSpent: 12500, activeBookings: 0, openDisputes: 0,
        averageRatingGiven: null, totalReviewsGiven: 0, addresses: [], sukiProviders: [],
      } } };
    }
    if (url === '/api/v1/admin/customers/customer-1/activity') {
      return { data: { success: true, data: [{
        id: `admin_action:${ADMIN_ACTION_ID}`, source: 'admin_action', action: 'customer_suspended',
        detail: 'Account takeover investigation', actor: { kind: 'admin', id: 'admin-1', name: 'Support Lead' },
        ipAddress: null, userAgent: null, createdAt: '2026-09-03T07:00:00.000Z',
      }] } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/customers/customer-1?tab=activity&adminActionId=${ADMIN_ACTION_ID}&supportCase=SUP-62`]}>
        <LocationProbe />
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact customer account decision')).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Profile' }), { button: 0, ctrlKey: false });

  await waitFor(() => {
    expect(screen.getByTestId('location')).toHaveTextContent('/customers/customer-1?supportCase=SUP-62');
  });
  expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('data-state', 'active');
});
