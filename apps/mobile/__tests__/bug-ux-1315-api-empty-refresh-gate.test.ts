const mockGetRefreshToken = jest.fn().mockReturnValue(undefined);
const mockGetStoredUser = jest.fn().mockReturnValue(undefined);
jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://api.test' } }));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn(), getRefreshToken: () => mockGetRefreshToken(),
  getStoredUser: () => mockGetStoredUser(), storeTokens: jest.fn(), clearTokens: jest.fn(), removeSecureItem: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn().mockResolvedValue('fixture-device') }));

import { refreshAuthSession } from '@/services/api';

it('Bug UX-1315 — a refresh attempt with no token does not permanently prevent a later signed-in session from refreshing', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({
    success: true, data: { accessToken: 'new-fixture-access', refreshToken: 'new-fixture-refresh' },
  }) } as Response);
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });
  await expect(refreshAuthSession()).resolves.toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
  mockGetRefreshToken.mockReturnValue('newly-signed-in-fixture-refresh');
  mockGetStoredUser.mockReturnValue(JSON.stringify({ id: 'newly-signed-in-owner' }));
  await expect(refreshAuthSession()).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
