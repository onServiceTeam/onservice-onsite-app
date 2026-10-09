/** @jest-environment node */
import { setTimeout as delay } from 'node:timers/promises';
import { installNativeHttp, openApiEndpoint, observe } from '../test-support/api-http';

jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://unused.invalid' } }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: async () => 'synthetic-device-554' }));
import api from '@/services/api';
import { clearTokens, storeTokens } from '@/services/secure-storage';

it('Bug OPS-554 — proof-request body cancellation settles and closes stalled HTTP without relaxing redirect protection', async () => {
  const restore = installNativeHttp();
  const cases = (['anonymous', 'session-no-replay'] as const).flatMap(auth =>
    (['json', 'blob', 'blob-error'] as const).map(body => ({ auth, body })));
  try {
    const results = await Promise.all(cases.map(async ({ auth, body }) => {
      const peer = await openApiEndpoint(response => {
        response.writeHead(body === 'blob-error' ? 401 : 200); response.write('{');
      });
      const caller = new AbortController();
      const operation = api.post(`${peer.origin}/proof`, { code: '123456' }, {
        auth, signal: caller.signal, ...(body !== 'json' ? { responseType: 'blob' as const } : {}),
      });
      try {
        const outcome = await observe(operation);
        for (let attempt = 0; attempt < 100 && peer.closedResponses() === 0 && outcome !== 'observer_deadline'; attempt++) await delay(10);
        return { auth, body, outcome, closed: peer.closedResponses(), sends: peer.requests.length };
      } finally { await peer.close(); await Promise.allSettled([operation]); }
    }));
    expect(results).toEqual(cases.map(row => ({ ...row, outcome: 'AbortError', closed: 1, sends: 1 })));
    expect(clearTokens).not.toHaveBeenCalled();
    expect(storeTokens).not.toHaveBeenCalled();
  } finally { restore(); }
}, 24_000);
