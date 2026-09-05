jest.unmock('@/stores/auth.store');
jest.mock('@/services/secure-storage', () => ({ getAccessToken: jest.fn(), getRefreshToken: jest.fn(), getStoredUser: jest.fn(),
  storeTokens: jest.fn(), storeUser: jest.fn(), clearTokens: jest.fn(), clearStoredUser: jest.fn() }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn() }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn() }, ApiError: class extends Error {},
  storage: { set: jest.fn(), delete: jest.fn() }, refreshAuthSession: jest.fn(), setAuthSessionExpiredHandler: jest.fn() }));
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { applicant } from '../test-support/application-draft-fixture';
import Review from '../app/provider-onboarding/review-pending';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }), Redirect: () => null }));

it('Bug UX-1331 — approval cannot promote from account data or retry sign-out without explicit action', async () => {
  const originalLogout = useAuthStore.getState().logout;
  const logout = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(undefined);
  useAuthStore.setState({ user: applicant, isAuthenticated: true, logout });
  jest.mocked(api.get).mockImplementation(async path => ({ status: 200, ok: true, data: { success: true,
    data: path === '/api/v1/providers/application-status' ? { status: 'approved', rejectionReason: null }
      : { ...applicant, role: 'provider', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  } }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
  try {
    const signIn = await screen.findByRole('button', { name: 'Sign in again' });
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(signIn);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not finish signing out'));
    view.rerender(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
    expect(logout).toHaveBeenCalledTimes(1);
    fireEvent.click(signIn);
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(2));
    expect(logout).toHaveBeenLastCalledWith('sign-in-required');
    expect(refreshAuthSession).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalledWith('/api/v1/auth/me');
    expect(useAuthStore.getState().user).toEqual(applicant);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Go to Customer Home' })).toBeNull();
  } finally {
    view.unmount(); client.clear(); useAuthStore.setState({ logout: originalLogout });
  }
});
