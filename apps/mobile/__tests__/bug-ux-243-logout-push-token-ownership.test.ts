const mockApiPost = jest.fn();
const mockClearTokens = jest.fn();
const mockClearStoredUser = jest.fn();
const mockRemovePublicItem = jest.fn();

jest.unmock('@/stores/auth.store');
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockApiPost(...args) },
  setAuthSessionExpiredHandler: jest.fn(),
  storage: { set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn().mockReturnValue('refresh-token'),
  storeTokens: jest.fn(),
  clearTokens: () => mockClearTokens(),
  getStoredUser: jest.fn(),
  storeUser: jest.fn(),
  clearStoredUser: () => mockClearStoredUser(),
}));
jest.mock('@/services/secure-storage.service', () => ({
  getPublicItem: jest.fn().mockReturnValue('ExponentPushToken[one-device]'),
  removePublicItem: (...args: unknown[]) => mockRemovePublicItem(...args),
}));
jest.mock('@/services/device-fingerprint.service', () => ({
  getDeviceFingerprint: jest.fn(),
}));

import { useAuthStore } from '@/stores/auth.store';

it('Bug UX-243 — logout detaches the public push token before clearing the account even when its server request fails', async () => {
  mockApiPost.mockImplementation(async (path: string) => {
    if (path.endsWith('/push-token/unregister')) throw new Error('offline');
    return { data: { success: true } };
  });
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      phone: '+639171234567',
      email: null,
      firstName: 'Test',
      lastName: 'User',
      role: 'customer',
      avatarUrl: null,
    },
  });

  await useAuthStore.getState().logout();

  expect(mockApiPost.mock.calls[0]).toEqual([
    '/api/v1/notifications/push-token/unregister',
    { token: 'ExponentPushToken[one-device]' },
  ]);
  expect(mockApiPost).toHaveBeenCalledWith('/api/v1/auth/logout', { refreshToken: 'refresh-token' });
  expect(mockRemovePublicItem).toHaveBeenCalledWith('pushToken');
  expect(mockClearTokens).toHaveBeenCalledTimes(1);
  expect(mockClearStoredUser).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
});
