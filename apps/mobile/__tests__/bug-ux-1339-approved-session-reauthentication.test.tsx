jest.unmock('@/services/api');
jest.unmock('@/stores/auth.store');
const mockCredentials: { user?: string; access?: string; refresh?: string } = {};
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://api.test' } }));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: () => mockCredentials.access, getRefreshToken: () => mockCredentials.refresh,
  getStoredUser: () => mockCredentials.user,
  storeTokens: (access: string, refresh: string) => Object.assign(mockCredentials, { access, refresh }),
  storeUser: (user: string) => { mockCredentials.user = user; },
  clearTokens: () => { delete mockCredentials.access; delete mockCredentials.refresh; },
  clearStoredUser: () => { delete mockCredentials.user; },
  removeSecureItem: (key: string) => { if (key === 'user') delete mockCredentials.user; },
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn().mockResolvedValue('synthetic-device') }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  Redirect: () => null, Link: ({ children }: { children: React.ReactNode }) => children }));
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { applicant } from '../test-support/application-draft-fixture';
import Review from '../app/provider-onboarding/review-pending';
import Login from '../app/auth/login';

function response(status: number, body: unknown): Response {
  return { status, ok: status === 200, text: async () => JSON.stringify(body) } as Response;
}

it('Bug UX-1339 — rejected pre-approval credentials explain fresh sign-in without claiming approval and a verified new login clears that notice', async () => {
  Object.assign(mockCredentials, { user: JSON.stringify(applicant), access: 'old-customer-access', refresh: 'old-customer-refresh' });
  useAuthStore.setState({ user: applicant, isAuthenticated: true, isLoading: false });
  const fetchMock = jest.fn().mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/providers/application-status')) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer old-customer-access');
      return response(401, { success: false, error: { code: 'session_revoked', message: 'Please sign in again.' } });
    }
    if (url.endsWith('/auth/refresh-token')) {
      expect(JSON.parse(init.body as string).refreshToken).toBe('old-customer-refresh');
      return response(401, { success: false, error: { message: 'This session has been revoked. Please sign in again.' } });
    }
    if (url.endsWith('/auth/verify-otp')) return response(200, { success: true, data: {
      user: { ...applicant, role: 'provider' }, accessToken: 'fresh-provider-access', refreshToken: 'fresh-provider-refresh', isNewUser: false,
    } });
    throw new Error(`Unexpected request ${url}`);
  });
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function SessionBoundary() { return useAuthStore(state => state.isAuthenticated) ? <Review /> : <Login />; }
  const view = render(<QueryClientProvider client={client}><SessionBoundary /></QueryClientProvider>);
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('Sign in again to confirm your current account access.');
  expect(screen.queryByText('Application approved')).toBeNull();
  expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, sessionExpired: true });
  expect(mockCredentials).toEqual({});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => useAuthStore.getState().verifyOtp(applicant.phone, '123456'));
  await waitFor(() => expect(useAuthStore.getState().user?.role).toBe('provider'));
  expect(useAuthStore.getState().sessionExpired).toBe(false);
  expect(mockCredentials.access).toBe('fresh-provider-access');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  view.unmount();
  client.clear();
});
