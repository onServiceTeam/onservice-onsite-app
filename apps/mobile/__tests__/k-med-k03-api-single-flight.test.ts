// Phase K MED-K03 - concurrent mobile refresh requests share one refresh.
//
// This is a transport-level behavior test. Five mocked HTTP responses model
// two expired requests, one successful token rotation, and two replays. The
// assertion is that only one refresh request is sent and both callers recover.

const mockFetch = jest.fn();
const mockStoreTokens = jest.fn();

jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({
  platformConfig: { apiUrl: 'https://api.test' },
}));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn().mockReturnValue('expired-access'),
  getRefreshToken: jest.fn().mockReturnValue('refresh-1'),
  storeTokens: (...args: unknown[]) => mockStoreTokens(...args),
  clearTokens: jest.fn(),
  removeSecureItem: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({
  getDeviceFingerprint: jest.fn().mockResolvedValue('device-1'),
}));

import api from '@/services/api';

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, configurable: true });
  mockFetch
    .mockResolvedValueOnce(response(401, { success: false, error: { message: 'expired' } }))
    .mockResolvedValueOnce(response(401, { success: false, error: { message: 'expired' } }))
    .mockResolvedValueOnce(response(200, {
      success: true,
      data: { accessToken: 'access-2', refreshToken: 'refresh-2' },
    }))
    .mockResolvedValueOnce(response(200, { success: true, data: { id: 'booking-1' } }))
    .mockResolvedValueOnce(response(200, { success: true, data: { id: 'booking-2' } }));
});

it('MED-K03 - two concurrent 401 responses trigger one refresh and both requests replay', async () => {
  const results = await Promise.all([
    api.get('/api/v1/bookings/booking-1'),
    api.get('/api/v1/bookings/booking-2'),
  ]);

  expect(results).toHaveLength(2);
  expect(results[0]?.data).toEqual({ success: true, data: { id: 'booking-1' } });
  expect(results[1]?.data).toEqual({ success: true, data: { id: 'booking-2' } });
  expect(mockFetch).toHaveBeenCalledTimes(5);

  const refreshCalls = mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/auth/refresh-token'));
  expect(refreshCalls).toHaveLength(1);
  expect(JSON.parse((refreshCalls[0]![1] as RequestInit).body as string)).toEqual({
    refreshToken: 'refresh-1',
    deviceFingerprint: 'device-1',
  });
  expect(mockStoreTokens).toHaveBeenCalledWith('access-2', 'refresh-2');
});
