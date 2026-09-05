jest.unmock('@/stores/auth.store');
jest.mock('@/services/secure-storage', () => ({ getAccessToken: jest.fn(), getRefreshToken: jest.fn().mockReturnValue('synthetic-old-refresh'), getStoredUser: jest.fn(),
  storeTokens: jest.fn(), storeUser: jest.fn(), clearTokens: jest.fn(), clearStoredUser: jest.fn() }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn() }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() },
  ApiError: class extends Error {}, storage: { set: jest.fn(), delete: jest.fn() },
  refreshAuthSession: jest.fn(), setAuthSessionExpiredHandler: jest.fn() }));
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';
import { clearTokens } from '@/services/secure-storage';
import { useAuthStore } from '@/stores/auth.store';
import { applicant, deferred } from '../test-support/application-draft-fixture';
import Review from '../app/provider-onboarding/review-pending';
import Background from '../app/provider-onboarding/background-check-status';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }), Redirect: () => null }));
it('Bug UX-1330 — a delayed approval sign-out cannot clear, promote or navigate a different account or a fresh login by the same owner', async () => {
  for (const [Screen, next] of [[Review, { ...applicant, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }], [Background, { ...applicant, firstName: 'New login' }]] as const) {
    useAuthStore.setState({ user: applicant, isAuthenticated: true, sessionExpired: false });
    const ending = deferred<never>();
    jest.mocked(api.post).mockReturnValueOnce(ending.promise);
    jest.mocked(api.get).mockResolvedValue({ status: 200, ok: true, data: { success: true, data: { status: 'approved', rejectionReason: null } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }));
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/logout', { refreshToken: 'synthetic-old-refresh' });
    jest.mocked(api.post).mockResolvedValueOnce({ status: 200, ok: true, data: { success: true, data: {
      accessToken: 'synthetic-new-access', refreshToken: 'synthetic-new-refresh', user: next,
    } } });
    await act(async () => useAuthStore.getState().verifyOtp(next.phone, '123456'));
    await act(async () => ending.reject(new Error('Old connection failed')));
    expect(useAuthStore.getState()).toMatchObject({ user: next, isAuthenticated: true, sessionExpired: false });
    expect(clearTokens).not.toHaveBeenCalled();
    expect(refreshAuthSession).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalledWith('/api/v1/auth/me');
    expect(mockReplace).not.toHaveBeenCalled();
    view.unmount();
    client.clear();
  }
});
