const mockClearTokens = jest.fn();
const mockRemoveSecureItem = jest.fn();

jest.unmock('@/services/api');
jest.unmock('@/stores/auth.store');
jest.mock('@/config/platform.config', () => ({
  platformConfig: { apiUrl: 'https://api.test' },
}));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn().mockReturnValue('expired-access'),
  getRefreshToken: jest.fn().mockReturnValue('expired-refresh'),
  storeTokens: jest.fn(),
  clearTokens: () => mockClearTokens(),
  removeSecureItem: (...args: unknown[]) => mockRemoveSecureItem(...args),
  getStoredUser: jest.fn(),
  storeUser: jest.fn(),
  clearStoredUser: jest.fn(),
}));
jest.mock('@/services/push-token.service', () => ({
  unregisterStoredPushToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/device-fingerprint.service', () => ({
  getDeviceFingerprint: jest.fn(),
}));

import api from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

it('Bug UX-246 — a terminal refresh failure immediately signs the live app state out', async () => {
  const unauthorized = (): Response => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ success: false, error: { message: 'Unauthorized' } }),
  } as Response);
  const mockFetch = jest.fn()
    .mockResolvedValueOnce(unauthorized())
    .mockResolvedValueOnce(unauthorized());
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, configurable: true });
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: 'customer-1',
      phone: '+639171234567',
      email: null,
      firstName: 'Test',
      lastName: 'User',
      role: 'customer',
      avatarUrl: null,
    },
  });

  await expect(api.get('/api/v1/bookings')).rejects.toThrow();

  expect(mockClearTokens).toHaveBeenCalledTimes(1);
  expect(mockRemoveSecureItem).toHaveBeenCalledWith('user');
  expect(useAuthStore.getState()).toMatchObject({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
});
