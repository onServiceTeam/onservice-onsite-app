import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.unmock('react-router-dom');
vi.unmock('@/stores/auth.store');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: (error: Error) => error.message }));
// Only the post-login landing content is reduced. App routes, login form,
// real auth store, Header logout and Customer 360 all execute unchanged.
vi.mock('@/pages/DashboardPage', () => ({
  default: () => <Link to="/customers/cccccccc-cccc-4ccc-8ccc-cccccccccccc">Open fixture customer</Link>,
}));
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

it('Bug UX-1365 — normal logout and a different admin login cannot inherit a super-admin customer contact cache', async () => {
  const superAdmin: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    firstName: 'Synthetic', lastName: 'Supervisor', role: 'super_admin',
    email: 'supervisor@example.invalid', phone: '', avatarUrl: null };
  const ordinaryAdmin: AdminUser = { ...superAdmin, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    lastName: 'Operator', role: 'admin', email: 'operator@example.invalid' };
  let activeAdmin = superAdmin;
  let profileReads = 0;
  const profile = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', firstName: 'Synthetic',
    lastName: 'Customer', fullName: 'Synthetic Customer Record', phone: '+639199998888',
    email: 'private.customer@example.invalid', contactMasked: false, avatarUrl: null,
    isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00Z', lifetimeBookings: 0, lifetimeSpent: 0,
    activeBookings: 0, openDisputes: 0, averageRatingGiven: null, totalReviewsGiven: 0,
    addresses: [], sukiProviders: [] };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/me') return { data: { success: true, data: activeAdmin } };
    if (url === `/api/v1/admin/customers/${profile.id}`) {
      profileReads += 1;
      return { data: { success: true, data: activeAdmin.role === 'super_admin' ? profile : {
        ...profile, phone: '+63919****888', email: null, contactMasked: true,
      } } };
    }
    throw new Error(`Unexpected synthetic GET: ${url}`);
  });
  apiMocks.post.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/logout') {
      document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
      return { data: { success: true, data: {} } };
    }
    if (url === '/api/v1/auth/admin/login') {
      activeAdmin = ordinaryAdmin;
      document.cookie = 'admin_csrf=synthetic-ordinary-session; Path=/';
      return { data: { success: true, data: { user: ordinaryAdmin, mustRotatePassword: false } } };
    }
    throw new Error(`Unexpected synthetic POST: ${url}`);
  });
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=synthetic-supervisor-session; Path=/';
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } });
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [`/customers/${profile.id}`] });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  try {
    expect(await screen.findByText('+639199998888')).toBeVisible();
    expect(profileReads).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ordinaryAdmin.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-test-only-not-a-credential' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Open fixture customer' }));
    expect(await screen.findByRole('heading', { name: profile.fullName })).toBeVisible();
    expect(useAuthStore.getState().user?.id).toBe(ordinaryAdmin.id);
    await waitFor(() => expect(screen.queryByText('+639199998888')).toBeNull());
    expect(screen.queryByText('private.customer@example.invalid')).toBeNull();
    expect(screen.getByText('+63919****888')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reveal contact' })).toBeEnabled();
    expect(profileReads).toBe(2);
    expect(apiMocks.put).not.toHaveBeenCalled();
    expect(apiMocks.post.mock.calls.map(([url]) => url)).toEqual(['/api/v1/auth/admin/logout', '/api/v1/auth/admin/login']);
  } finally {
    view.unmount(); router.dispose(); client.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  }
});
