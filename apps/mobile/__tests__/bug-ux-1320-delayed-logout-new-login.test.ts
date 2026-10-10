jest.unmock('@/stores/auth.store');
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn(), getRefreshToken: jest.fn(), getStoredUser: jest.fn(),
  storeTokens: jest.fn(), storeUser: jest.fn(), clearTokens: jest.fn(), clearStoredUser: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  __esModule: true, default: { post: jest.fn() },
  ApiError: class extends Error {}, setAuthSessionExpiredHandler: jest.fn(),
  storage: { set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn().mockResolvedValue(undefined) }));
import api from '@/services/api';
import { clearTokens, clearStoredUser, getRefreshToken } from '@/services/secure-storage';
import { useAuthStore } from '@/stores/auth.store';
import { applicant, deferred } from '../test-support/application-draft-fixture';

it('Bug UX-1320 — a delayed logout cannot clear a newer login but still clears its own session after profile updates', async () => {
  useAuthStore.setState({ user: applicant, isAuthenticated: true });
  jest.mocked(getRefreshToken).mockReturnValue('refresh-one');
  const firstLogout = deferred<never>();
  jest.mocked(api.post).mockReturnValueOnce(firstLogout.promise);
  const loggingOut = useAuthStore.getState().logout();
  jest.mocked(api.post).mockResolvedValueOnce({ data: { success: true, data: {
    accessToken: 'new-access', refreshToken: 'new-refresh', user: applicant,
  } }, status: 200, ok: true });
  await useAuthStore.getState().verifyOtp(applicant.phone, '123456');
  firstLogout.reject(new Error('Old connection failed'));
  await loggingOut;
  expect(clearTokens).not.toHaveBeenCalled();
  expect(clearStoredUser).not.toHaveBeenCalled();
  expect(useAuthStore.getState()).toMatchObject({ user: applicant, isAuthenticated: true });

  const ownLogout = deferred<never>();
  jest.mocked(api.post).mockReturnValueOnce(ownLogout.promise);
  const currentLogout = useAuthStore.getState().logout();
  useAuthStore.getState().setUser({ ...applicant, firstName: 'Updated profile' });
  ownLogout.reject(new Error('Offline'));
  await currentLogout;
  expect(clearTokens).toHaveBeenCalledTimes(1);
  expect(clearStoredUser).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
});
