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

it('Bug UX-1331 — provider activation rejects a different account and retries only on explicit action until the current provider identity is confirmed', async () => {
  useAuthStore.setState({ user: applicant, isAuthenticated: true });
  jest.mocked(refreshAuthSession).mockResolvedValue(true);
  let correctOwner = false;
  jest.mocked(api.get).mockImplementation(async path => ({ status: 200, ok: true, data: { success: true,
    data: path === '/api/v1/providers/application-status' ? { status: 'approved', rejectionReason: null }
      : { ...applicant, role: 'provider', id: correctOwner ? applicant.id : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  } }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be confirmed for this account'));
  expect(useAuthStore.getState().user).toEqual(applicant);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Go to Customer Home' })).toBeTruthy();
  view.rerender(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
  expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  correctOwner = true;
  fireEvent.click(screen.getByRole('button', { name: 'Retry provider access' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(provider-tabs)/dashboard'));
  expect(refreshAuthSession).toHaveBeenCalledTimes(2);
  expect(useAuthStore.getState().user).toEqual({ ...applicant, role: 'provider' });
  view.unmount();
  client.clear();
});
