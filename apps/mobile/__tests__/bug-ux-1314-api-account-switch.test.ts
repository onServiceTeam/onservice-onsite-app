const mockCredentials: { owner: string | null; access?: string; refresh?: string } = { owner: 'owner-a', access: 'access-a', refresh: 'refresh-a' };
const mockStoreTokens = jest.fn((access: string, refresh: string) => Object.assign(mockCredentials, { access, refresh }));
const mockClearTokens = jest.fn();
jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://api.test' } }));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: () => mockCredentials.access,
  getRefreshToken: () => mockCredentials.refresh,
  getStoredUser: () => mockCredentials.owner ? JSON.stringify({ id: mockCredentials.owner }) : undefined,
  storeTokens: (...args: [string, string]) => mockStoreTokens(...args),
  clearTokens: () => mockClearTokens(), removeSecureItem: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn().mockResolvedValue('fixture-device') }));

import api from '@/services/api';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function response(status: number, data: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) } as Response;
}
const unauthorized = (): Response => response(401, { success: false, error: { message: 'Expired fixture token' } });
const rotated = (owner: string): Response => response(200, { success: true, data: { accessToken: `new-access-${owner}`, refreshToken: `new-refresh-${owner}` } });

it('Bug UX-1314 — late responses and refresh replays stay with their initiating account and cannot replace or clear a newer session', async () => {
  const changed = { status: 409, body: { error: { code: 'account_changed' } } };
  const pendingResponse = deferred<Response>();
  const fetchMock = jest.fn().mockReturnValueOnce(pendingResponse.promise)
    .mockResolvedValueOnce(rotated('b')).mockResolvedValue(response(200, { success: true, data: {} }));
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });
  const oldWrite = api.put('/api/v1/providers/application-draft', { fields: { governmentIdNumber: 'OWNER-A-FIXTURE' } });
  Object.assign(mockCredentials, { owner: 'owner-b', access: 'access-b', refresh: 'refresh-b' });
  pendingResponse.resolve(unauthorized());
  await expect(oldWrite).rejects.toMatchObject(changed);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockStoreTokens).not.toHaveBeenCalled();
  expect(mockClearTokens).not.toHaveBeenCalled();

  // Even an already-successful old response must not reach the new screen.
  Object.assign(mockCredentials, { owner: 'owner-a', access: 'access-a', refresh: 'refresh-a' });
  const lateRead = deferred<Response>();
  fetchMock.mockReset().mockReturnValue(lateRead.promise);
  const oldRead = api.get('/api/v1/providers/application-draft');
  Object.assign(mockCredentials, { owner: 'owner-b', access: 'access-b', refresh: 'refresh-b' });
  lateRead.resolve(response(200, { success: true, data: { privateFixture: 'owner-a' } }));
  await expect(oldRead).rejects.toMatchObject(changed);

  // Account B must not join account A's in-flight refresh. A's late rotation
  // must neither overwrite B's tokens nor clear B when A's request fails.
  Object.assign(mockCredentials, { owner: 'owner-a', access: 'access-a', refresh: 'refresh-a' });
  const refreshA = deferred<Response>();
  const refreshB = deferred<Response>();
  const startedA = deferred<void>();
  const startedB = deferred<void>();
  fetchMock.mockReset().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh-token')) {
      const body = JSON.parse(init.body as string) as { refreshToken: string };
      if (body.refreshToken === 'refresh-a') { startedA.resolve(); return refreshA.promise; }
      if (body.refreshToken === 'refresh-b') { startedB.resolve(); return refreshB.promise; }
      throw new Error('Unexpected fixture refresh');
    }
    return Promise.resolve(new Headers(init.headers).get('Authorization') === 'Bearer new-access-b'
      ? response(200, { success: true, data: { owner: 'b' } }) : unauthorized());
  });
  const requestA = api.get('/api/v1/bookings').catch(error => error);
  await startedA.promise;
  Object.assign(mockCredentials, { owner: 'owner-b', access: 'access-b', refresh: 'refresh-b' });
  const requestB = api.get('/api/v1/bookings');
  await startedB.promise;
  refreshA.resolve(rotated('a'));
  expect(await requestA).toMatchObject(changed);
  expect(mockCredentials).toEqual({ owner: 'owner-b', access: 'access-b', refresh: 'refresh-b' });
  refreshB.resolve(rotated('b'));
  await expect(requestB).resolves.toMatchObject({ data: { data: { owner: 'b' } } });
  expect(mockStoreTokens.mock.calls).toEqual([['new-access-b', 'new-refresh-b']]);
  expect(mockClearTokens).not.toHaveBeenCalled();

  // Logging out during rotation cannot resurrect the signed-out tokens.
  Object.assign(mockCredentials, { owner: 'owner-a', access: 'access-a', refresh: 'refresh-a' });
  const loggedOutRefresh = deferred<Response>();
  const startedLogout = deferred<void>();
  fetchMock.mockReset().mockImplementation((url: string) => {
    if (url.endsWith('/auth/refresh-token')) { startedLogout.resolve(); return loggedOutRefresh.promise; }
    return Promise.resolve(unauthorized());
  });
  const signingOut = api.get('/api/v1/bookings').catch(error => error);
  await startedLogout.promise;
  Object.assign(mockCredentials, { owner: null, access: undefined, refresh: undefined });
  loggedOutRefresh.resolve(rotated('a'));
  expect(await signingOut).toMatchObject(changed);
  expect(mockCredentials.access).toBeUndefined();
  expect(mockStoreTokens).toHaveBeenCalledTimes(1);

  // A fresh login for the SAME user must also survive an older failed rotation.
  Object.assign(mockCredentials, { owner: 'owner-a', access: 'old-login-access-a', refresh: 'old-login-refresh-a' });
  const oldLoginRefresh = deferred<Response>();
  const newLoginRefresh = deferred<Response>();
  const startedOldLogin = deferred<void>();
  const startedNewLogin = deferred<void>();
  fetchMock.mockReset().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh-token')) {
      const body = JSON.parse(init.body as string) as { refreshToken: string };
      if (body.refreshToken === 'old-login-refresh-a') { startedOldLogin.resolve(); return oldLoginRefresh.promise; }
      if (body.refreshToken === 'fresh-login-refresh-a') { startedNewLogin.resolve(); return newLoginRefresh.promise; }
      throw new Error('Unexpected same-owner fixture rotation');
    }
    return Promise.resolve(new Headers(init.headers).get('Authorization') === 'Bearer new-access-a2'
      ? response(200, { success: true, data: { session: 'a2' } }) : unauthorized());
  });
  const oldLogin = api.get('/api/v1/bookings').catch(error => error);
  await startedOldLogin.promise;
  Object.assign(mockCredentials, { access: 'fresh-login-access-a', refresh: 'fresh-login-refresh-a' });
  const newLogin = api.get('/api/v1/bookings');
  await startedNewLogin.promise;
  oldLoginRefresh.resolve(rotated('a'));
  expect(await oldLogin).toMatchObject(changed);
  expect(mockCredentials).toEqual({ owner: 'owner-a', access: 'fresh-login-access-a', refresh: 'fresh-login-refresh-a' });
  expect(mockClearTokens).not.toHaveBeenCalled();
  expect(mockStoreTokens).toHaveBeenCalledTimes(1);
  newLoginRefresh.resolve(rotated('a2'));
  await expect(newLogin).resolves.toMatchObject({ data: { data: { session: 'a2' } } });
  expect(mockStoreTokens.mock.calls).toEqual([['new-access-b', 'new-refresh-b'], ['new-access-a2', 'new-refresh-a2']]);
  expect(mockClearTokens).not.toHaveBeenCalled();
});
