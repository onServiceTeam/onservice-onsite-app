const mockGetDeviceFingerprint = jest.fn().mockResolvedValue('device-fingerprint-998');
const mockStoreTokens = jest.fn();

jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({
  platformConfig: { apiUrl: 'https://api.test' },
}));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn().mockReturnValue('expired-access'),
  getRefreshToken: jest.fn().mockReturnValue('expired-refresh'),
  storeTokens: (...args: unknown[]) => mockStoreTokens(...args),
  clearTokens: jest.fn(),
  removeSecureItem: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({
  getDeviceFingerprint: () => mockGetDeviceFingerprint(),
}));

import { refreshAuthSession } from '@/services/api';

it('Bug UX-998 — automatic session refresh sends the fingerprint bound at sign-in', async () => {
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      success: true,
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    }),
  } as Response);
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, configurable: true });

  await expect(refreshAuthSession()).resolves.toBe(true);

  expect(mockGetDeviceFingerprint).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('https://api.test/api/v1/auth/refresh-token');
  expect(JSON.parse(init.body as string)).toEqual({
    refreshToken: 'expired-refresh',
    deviceFingerprint: 'device-fingerprint-998',
  });
  expect(mockStoreTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
});
