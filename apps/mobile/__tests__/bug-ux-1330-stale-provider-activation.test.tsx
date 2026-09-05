jest.unmock('@/stores/auth.store');
jest.mock('@/services/secure-storage', () => ({ getAccessToken: jest.fn(), getRefreshToken: jest.fn(), getStoredUser: jest.fn(),
  storeTokens: jest.fn(), storeUser: jest.fn(), clearTokens: jest.fn(), clearStoredUser: jest.fn() }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn() }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() },
  ApiError: class extends Error {}, storage: { set: jest.fn(), delete: jest.fn() },
  refreshAuthSession: jest.fn(), setAuthSessionExpiredHandler: jest.fn() }));
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { applicant, deferred } from '../test-support/application-draft-fixture';
import Review from '../app/provider-onboarding/review-pending';
import Background from '../app/provider-onboarding/background-check-status';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }), Redirect: () => null }));
const statusResponse = (status: string) => ({ status: 200, ok: true, data: { success: true, data: { status, rejectionReason: null } } });

it('Bug UX-1330 — changing account or signing in again prevents a delayed approval refresh from promoting the new session', async () => {
  useAuthStore.setState({ user: applicant, isAuthenticated: true });
  const refresh = deferred<boolean>();
  jest.mocked(refreshAuthSession).mockReturnValueOnce(refresh.promise);
  jest.mocked(api.get).mockImplementation(async path => {
    if (path === '/api/v1/providers/application-status') return statusResponse(useAuthStore.getState().user?.id === applicant.id ? 'approved' : 'pending') as never;
    throw new Error('An obsolete refresh must not request account data');
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let view = render(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
  await waitFor(() => expect(refreshAuthSession).toHaveBeenCalledTimes(1));
  const second = { ...applicant, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
  await act(async () => useAuthStore.getState().setUser(second));
  expect(await screen.findByText('Application submitted')).toBeTruthy();
  await act(async () => refresh.resolve(true));
  expect(api.get).not.toHaveBeenCalledWith('/api/v1/auth/me');
  expect(useAuthStore.getState().user).toEqual(second);
  expect(mockReplace).not.toHaveBeenCalled();
  view.unmount();
  client.clear();

  useAuthStore.getState().setUser(applicant);
  const account = deferred<{ status: number; ok: boolean; data: unknown }>();
  jest.mocked(refreshAuthSession).mockResolvedValue(true);
  let oldSession = true;
  jest.mocked(api.get).mockImplementation(async path => path === '/api/v1/providers/application-status'
    ? statusResponse(oldSession ? 'approved' : 'pending') as never : account.promise as never);
  view = render(<QueryClientProvider client={client}><Background /></QueryClientProvider>);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/auth/me'));
  const newLogin = { ...applicant, firstName: 'New login' };
  jest.mocked(api.post).mockResolvedValueOnce({ status: 200, ok: true, data: { success: true, data: {
    accessToken: 'synthetic-new-access', refreshToken: 'synthetic-new-refresh', user: newLogin,
  } } });
  oldSession = false;
  await act(async () => useAuthStore.getState().verifyOtp(applicant.phone, '123456'));
  expect(await screen.findByText('Application submitted')).toBeTruthy();
  await act(async () => account.resolve({ status: 200, ok: true, data: { success: true, data: { ...applicant, role: 'provider' } } }));
  expect(useAuthStore.getState().user).toEqual(newLogin);
  expect(mockReplace).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
