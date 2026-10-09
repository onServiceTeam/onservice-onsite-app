/** @jest-environment node */
import { type ServerResponse } from 'node:http';
import { installNativeHttp, openApiEndpoint, waitForPeer } from '../test-support/api-http';

const mockConfig = { apiUrl: '' };
const mockCredentials = { owner: 'fixture-owner', access: 'fixture-access', refresh: 'fixture-refresh' };
const mockStoreTokens = jest.fn((access: string, refresh: string) => Object.assign(mockCredentials, { access, refresh }));
const mockClearTokens = jest.fn(), mockRemoveItem = jest.fn(), mockExpired = jest.fn();
jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { get apiUrl() { return mockConfig.apiUrl; } } }));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: () => mockCredentials.access,
  getRefreshToken: () => mockCredentials.refresh,
  getStoredUser: () => mockCredentials.owner ? JSON.stringify({ id: mockCredentials.owner }) : undefined,
  storeTokens: (...args: [string, string]) => mockStoreTokens(...args),
  clearTokens: () => mockClearTokens(), removeSecureItem: () => mockRemoveItem(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: async () => 'fixture-device' }));
import api, { setAuthSessionExpiredHandler } from '@/services/api';

beforeEach(() => {
  Object.assign(mockCredentials, { owner: 'fixture-owner', access: 'fixture-access', refresh: 'fixture-refresh' });
  jest.clearAllMocks();
  setAuthSessionExpiredHandler(mockExpired);
});

it('explicit anonymous and session-no-replay requests never refresh, replay or mutate credentials after a complete 401', async () => {
  const restore = installNativeHttp();
  const results = [];
  try {
    for (const auth of ['anonymous', 'session-no-replay'] as const) {
      Object.assign(mockCredentials, { access: 'fixture-access', refresh: 'fixture-refresh' });
      const headers: (string | undefined)[] = [];
      const peer = await openApiEndpoint((response, request) => {
        headers.push(request.headers.authorization);
        if (request.url?.endsWith('/refresh-token')) {
          response.end(JSON.stringify({ success: true, data: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' } }));
        } else if (headers.length === 1) {
          response.writeHead(401); response.end(JSON.stringify({ success: false, error: { message: 'Fixture unauthorized' } }));
        } else response.end(JSON.stringify({ success: true, data: { unexpectedReplay: true } }));
      });
      mockConfig.apiUrl = peer.origin;
      try {
        // The policy is new functionality. This red is a contract-before-code
        // test, not a claim that a formerly supported option regressed.
        const options = { auth, headers: { 'X-Fixture': 'one-proof' } };
        const result = await api.post('/api/v1/auth/email/fixture/confirm', { code: '123456' }, options)
          .then(() => 'fulfilled', (error: { status?: number }) => error.status);
        results.push({ auth, result, requests: peer.requests.map(row => row.url), headers,
          credentials: { ...mockCredentials } });
      } finally { await peer.close(); }
    }
    expect(results).toEqual(['anonymous', 'session-no-replay'].map(auth => ({
      auth, result: 401, requests: ['/api/v1/auth/email/fixture/confirm'],
      headers: [auth === 'anonymous' ? undefined : 'Bearer fixture-access'],
      credentials: { owner: 'fixture-owner', access: 'fixture-access', refresh: 'fixture-refresh' },
    })));
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
    expect(mockExpired).not.toHaveBeenCalled();
  } finally { restore(); }
});

it('anonymous requests remove caller-supplied credentials, retain receipt/error contracts and never follow a proof redirect', async () => {
  const restore = installNativeHttp();
  const nativeFetch = globalThis.fetch;
  const dispatched = jest.spyOn(globalThis, 'fetch'); // Call-through to real HTTP.
  const observed: { authorization?: string; cookie?: string }[] = [];
  let status = 202;
  const target = await openApiEndpoint(response => response.end('{}'));
  const peer = await openApiEndpoint((response, request) => {
    observed.push({ authorization: request.headers.authorization, cookie: request.headers.cookie });
    response.writeHead(status, status === 307 ? { Location: `${target.origin}/unexpected` } : {});
    response.end(JSON.stringify(status === 202
      ? { success: true, data: { id: 'fixture-receipt', status: 'received', retryAfterSeconds: 60 } }
      : { success: false, error: { message: 'Fixture failure' } }));
  });
  mockConfig.apiUrl = peer.origin;
  try {
    const options = { auth: 'anonymous' as const, credentials: 'include' as const,
      headers: { Authorization: 'Bearer caller-token', Cookie: 'fixture=cookie' }, _bearerOverride: 'override-token' };
    await expect(api.post('/api/v1/auth/email/requests', { email: 'fixture@example.invalid' }, options))
      .resolves.toMatchObject({ status: 202, data: { data: { id: 'fixture-receipt', status: 'received' } } });
    for (status of [400, 401, 403, 428, 429, 503]) {
      await expect(api.post('/api/v1/auth/email/requests', {}, options)).rejects.toMatchObject({ status });
    }
    status = 307;
    await expect(api.post('/api/v1/auth/email/requests', { code: '123456' }, options)).rejects.toBeDefined();
    expect(target.requests).toHaveLength(0);
    expect(peer.requests).toHaveLength(8);
    expect(observed).toEqual(Array.from({ length: 8 }, () => ({ authorization: undefined, cookie: undefined })));
    for (const [, init] of dispatched.mock.calls) {
      expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' });
      expect(init).not.toHaveProperty('auth');
    }
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
  } finally {
    dispatched.mockRestore(); globalThis.fetch = nativeFetch;
    await peer.close(); await target.close(); restore();
  }
});

it('no-replay responses belong to the initiating login, including a new login for the same account', async () => {
  const restore = installNativeHttp();
  try {
    for (const auth of ['anonymous', 'session-no-replay'] as const) {
      for (const change of ['owner', 'same-owner-login']) {
        Object.assign(mockCredentials, { owner: 'fixture-owner', access: 'fixture-access', refresh: 'fixture-refresh' });
        let response: ServerResponse | undefined;
        const peer = await openApiEndpoint(reply => { response = reply; });
        mockConfig.apiUrl = peer.origin;
        const options = { auth, headers: { 'X-Fixture': 'ownership' } };
        const pending = api.post('/api/v1/auth/email/fixture/confirm', { code: '123456' }, options);
        try {
          await waitForPeer(() => response !== undefined);
          if (change === 'owner') mockCredentials.owner = 'new-owner';
          mockCredentials.refresh = 'new-login-refresh';
          response!.end(JSON.stringify({ success: true, data: { accessToken: 'late-proof-credentials' } }));
          await expect(pending).rejects.toMatchObject({ status: 409, body: { error: { code: 'account_changed' } } });
          expect(peer.requests).toHaveLength(1);
        } finally { await peer.close(); await Promise.allSettled([pending]); }
      }
    }
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
  } finally { restore(); }
});

it('ordinary session requests retain their existing authenticated refresh and one replay', async () => {
  const restore = installNativeHttp();
  const authorizations: (string | undefined)[] = [];
  const peer = await openApiEndpoint((response, request) => {
    authorizations.push(request.headers.authorization);
    if (request.url?.endsWith('/refresh-token')) {
      response.end(JSON.stringify({ success: true, data: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' } }));
    } else if (request.headers.authorization !== 'Bearer rotated-access') {
      response.writeHead(401); response.end('{}');
    } else response.end(JSON.stringify({ success: true, data: { retained: true } }));
  });
  mockConfig.apiUrl = peer.origin;
  try {
    await expect(api.get('/api/v1/bookings')).resolves.toMatchObject({ data: { data: { retained: true } } });
    expect(peer.requests.map(row => row.url)).toEqual(['/api/v1/bookings', '/api/v1/auth/refresh-token', '/api/v1/bookings']);
    expect(authorizations).toEqual(['Bearer fixture-access', undefined, 'Bearer rotated-access']);
    expect(mockStoreTokens).toHaveBeenCalledWith('rotated-access', 'rotated-refresh');
    expect(mockClearTokens).not.toHaveBeenCalled();
  } finally { await peer.close(); restore(); }
});

it('both no-replay modes reject every redirect before reaching another peer', async () => {
  const restore = installNativeHttp();
  let status = 301;
  const target = await openApiEndpoint(response => response.end('{}'));
  const peer = await openApiEndpoint(response => {
    response.writeHead(status, { Location: `${target.origin}/redirected-proof` }); response.end();
  });
  mockConfig.apiUrl = peer.origin;
  try {
    for (const auth of ['anonymous', 'session-no-replay'] as const) {
      for (status of [301, 302, 303, 307, 308]) {
        await expect(api.post('/proof', { code: '123456' }, { auth })).rejects.toBeDefined();
      }
    }
    expect(peer.requests).toHaveLength(10);
    expect(target.requests).toHaveLength(0);
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
  } finally { await peer.close(); await target.close(); restore(); }
});

it('cancelled or broken proof responses never retry or clear the existing login', async () => {
  const restore = installNativeHttp();
  try {
    for (const auth of ['anonymous', 'session-no-replay'] as const) {
      for (const failure of ['pre-abort', 'abort', 'broken-body']) {
        const caller = new AbortController();
        const peer = await openApiEndpoint(response => {
          response.writeHead(401); response.write('{');
          if (failure === 'broken-body') {
            const timer = setTimeout(() => response.destroy(), 30);
            response.on('close', () => clearTimeout(timer));
          }
        });
        mockConfig.apiUrl = peer.origin;
        if (failure === 'pre-abort') caller.abort();
        const pending = api.post('/proof', { code: '123456' }, { auth, signal: caller.signal });
        const checked = expect(pending).rejects.toMatchObject({ name: failure === 'broken-body' ? 'TypeError' : 'AbortError' });
        try {
          if (failure === 'abort') { await waitForPeer(() => peer.requests.length === 1); caller.abort(); }
          await checked;
          expect(peer.requests).toHaveLength(failure === 'pre-abort' ? 0 : 1);
        } finally { await peer.close(); await Promise.allSettled([pending]); }
      }
    }
    expect(mockCredentials).toEqual({ owner: 'fixture-owner', access: 'fixture-access', refresh: 'fixture-refresh' });
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
    expect(mockExpired).not.toHaveBeenCalled();
  } finally { restore(); }
});

it('session-no-replay selects the current bearer and invalid modes fail before dispatch', async () => {
  const restore = installNativeHttp();
  const peer = await openApiEndpoint((response, request) => {
    response.end(JSON.stringify({ success: true, data: {
      authorization: request.headers.authorization, cookie: request.headers.cookie,
      marker: request.headers['x-fixture'],
    } }));
  });
  mockConfig.apiUrl = peer.origin;
  try {
    await expect(api.post('/proof', {}, { auth: 'session-no-replay', _bearerOverride: 'not-current',
      headers: { Authorization: 'Bearer not-current', Cookie: 'not=current', 'X-Fixture': 'retained' } }))
      .resolves.toEqual({ status: 200, ok: true, data: { success: true,
        data: { authorization: 'Bearer fixture-access', marker: 'retained' } } });
    const result = await api.get('/proof', { auth: 'session-no-replay' });
    expect(result.data.data).not.toHaveProperty('cookie');
    // Malformed runtime input cannot silently select ordinary refresh behavior.
    await expect(api.post('/proof', {}, { auth: 'misspelled' as 'anonymous' })).rejects.toThrow('Invalid request authentication mode');
    expect(peer.requests).toHaveLength(2);
  } finally { await peer.close(); restore(); }
});
