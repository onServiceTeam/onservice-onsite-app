// HA-M3-71 (D38 Milestone 3): the banner's alerts live in the operator-owned
// query cache (AdminSessionQueries). When another admin signs in on the same
// browser, the previous admin's alerts disappear at once and are never shown
// to the new operator while their own check is still loading. Uses the real
// auth store.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.unmock('@/stores/auth.store');
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import AdminSessionQueries from '@/components/AdminSessionQueries';
import MarketplaceAlertBanner from '@/components/MarketplaceAlertBanner';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';
import { MARKETPLACE, alert, alertsResponse } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const firstAdmin: AdminUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000071', role: 'admin', firstName: 'First', lastName: 'Operator',
  email: null, phone: '', avatarUrl: null,
};
const secondAdmin: AdminUser = { ...firstAdmin, id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000071', firstName: 'Second' };

afterEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
});

it("HA-M3-71: after another admin signs in, the previous admin's alerts are not shown while the new check loads", async () => {
  let releaseSecond!: (value: unknown) => void;
  const secondCheck = new Promise((resolve) => {
    releaseSecond = resolve;
  });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/alerts`) throw new Error(`Unexpected GET ${url}`);
    if (useAuthStore.getState().user?.id === firstAdmin.id) return alertsResponse([alert({ id: 'alert-first' })]);
    return secondCheck;
  });
  useAuthStore.setState({ user: firstAdmin, isAuthenticated: true, isLoading: false, mustRotatePassword: false });

  render(
    <AdminSessionQueries>
      <MemoryRouter><MarketplaceAlertBanner /></MemoryRouter>
    </AdminSessionQueries>,
  );
  expect(await screen.findByText('1 quote request alert open')).toBeInTheDocument();

  act(() => {
    useAuthStore.setState({ user: secondAdmin, isAuthenticated: true, isLoading: false, mustRotatePassword: false });
  });

  expect(screen.queryByText('1 quote request alert open')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledTimes(2);

  await act(async () => {
    releaseSecond(alertsResponse([alert({ id: 'alert-second-1' }), alert({ id: 'alert-second-2', bookingId: 'booking-2' })]));
    await secondCheck;
  });
  expect(await screen.findByText('2 quote request alerts open')).toBeInTheDocument();
});
