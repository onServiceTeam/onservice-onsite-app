import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

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

it('Bug UX-1158 — Customer 360 restores its requested workspace and preserves support context when operators change tabs', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/payments')) {
      return { data: { success: true, data: {
        walletAvailable: 12500,
        walletPending: 0,
        recentTransactions: [],
        recentPaymentIntents: [],
        paymentMethodCounts: {},
      } } };
    }
    if (url.endsWith('/customers/customer-1')) {
      return { data: { success: true, data: {
        id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes', phone: 'masked',
        email: null, contactMasked: true, avatarUrl: null, isVerified: true, isActive: true,
        isFlaggedFraud: false, lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z',
        lifetimeBookings: 2, lifetimeSpent: 12500, activeBookings: 0, openDisputes: 0,
        averageRatingGiven: null, totalReviewsGiven: 0, addresses: [], sukiProviders: [],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/customers/customer-1?tab=payments&supportCase=SUP-55']}>
        <LocationProbe />
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const payments = await screen.findByRole('tab', { name: 'Payments' });
  await waitFor(() => expect(payments).toHaveAttribute('data-state', 'active'));
  expect(screen.getByText('Wallet available')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/customers/customer-1/payments');

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Profile' }), { button: 0, ctrlKey: false });
  await waitFor(() => {
    expect(screen.getByTestId('location')).toHaveTextContent('/customers/customer-1?supportCase=SUP-55');
  });
  expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('data-state', 'active');
});
