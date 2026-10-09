/** @jest-environment node */
import { setTimeout as delay } from 'node:timers/promises';
import { installNativeHttp, openApiEndpoint } from '../test-support/api-http';

jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://unused.invalid' } }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: async () => 'synthetic-cancellation-device' }));
import api from '@/services/api';
import { clearTokens, storeTokens } from '@/services/secure-storage';

it('settles unsupported-stream transports that ignore cancellation without accepting their late result', async () => {
  const restore = installNativeHttp();
  jest.useFakeTimers();
  try {
    for (const phase of ['headers', 'text', 'blob', 'error-body']) {
      let finish!: (value: unknown) => void;
      const stalled = new Promise(resolve => { finish = resolve; });
      const response = { ok: phase !== 'error-body', status: phase === 'error-body' ? 401 : 200,
        body: null, text: jest.fn(() => stalled), blob: jest.fn(() => stalled) };
      const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
        (phase === 'headers' ? stalled : Promise.resolve(response)) as Promise<Response>);
      const caller = new AbortController();
      const pending = api.post('/proof', { code: '123456' }, { auth: 'session-no-replay', signal: caller.signal,
        ...(phase === 'blob' || phase === 'error-body' ? { responseType: 'blob' as const } : {}) });
      const checked = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await jest.advanceTimersByTimeAsync(15_001);
      await checked;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(caller.signal.aborted).toBe(false);
      // No native network-abort claim: this fixture deliberately ignores it.
      finish(phase === 'headers' ? response : phase === 'blob' ? new Blob(['late']) : '{}');
      await jest.advanceTimersByTimeAsync(0);
      if (phase === 'headers') expect(response.text).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(clearTokens).not.toHaveBeenCalled();
      expect(storeTokens).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      fetch.mockRestore();
    }
  } finally { jest.restoreAllMocks(); jest.useRealTimers(); restore(); }
});

it('cancels a late streamed response after caller departure and observes a late fetch rejection', async () => {
  const restore = installNativeHttp();
  try {
    for (const outcome of ['response', 'failure']) {
      let finish!: (value: Response) => void, fail!: (reason: Error) => void;
      const transport = new Promise<Response>((resolve, reject) => { finish = resolve; fail = reject; });
      const fetch = jest.spyOn(globalThis, 'fetch').mockReturnValue(transport);
      const caller = new AbortController();
      const pending = api.post('/proof', {}, { auth: 'anonymous', signal: caller.signal });
      const checked = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      caller.abort();
      await checked;
      const cancel = jest.fn();
      if (outcome === 'response') {
        const response = new Response(new globalThis.ReadableStream({ cancel }));
        const text = jest.spyOn(response, 'text');
        finish(response);
        await delay(0);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(text).not.toHaveBeenCalled();
      } else { fail(new Error('late synthetic failure')); await delay(0); }
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(clearTokens).not.toHaveBeenCalled();
      expect(storeTokens).not.toHaveBeenCalled();
      fetch.mockRestore();
    }
  } finally { jest.restoreAllMocks(); restore(); }
});

it('retains split UTF-8, binary bytes/type and explicit error bodies through real HTTP stream reading', async () => {
  const restore = installNativeHttp();
  const value = { success: true, data: { label: 'Cebu € 🏠' } };
  const encoded = Buffer.from(JSON.stringify(value));
  const bytes = Buffer.from([0, 255, 239, 187, 191, 13, 10, 128]);
  const peer = await openApiEndpoint((response, request) => {
    if (request.url === '/binary') {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.write(bytes.subarray(0, 3)); response.end(bytes.subarray(3));
    } else if (request.url === '/error') {
      response.writeHead(403); response.end(JSON.stringify({ success: false, error: { message: 'Denied €', code: 'fixture' } }));
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      const split = encoded.indexOf(Buffer.from('€')) + 1;
      response.write(encoded.subarray(0, split));
      const timer = setTimeout(() => response.end(encoded.subarray(split)), 30);
      response.on('close', () => clearTimeout(timer));
    }
  });
  try {
    await expect(api.get(`${peer.origin}/unicode`, { auth: 'anonymous' }))
      .resolves.toEqual({ status: 200, ok: true, data: value });
    const binary = await api.get<Blob>(`${peer.origin}/binary`, { auth: 'anonymous', responseType: 'blob' });
    expect(binary.data.type).toBe('application/octet-stream');
    expect(Buffer.from(await binary.data.arrayBuffer())).toEqual(bytes);
    for (const responseType of ['json', 'blob'] as const) {
      await expect(api.get(`${peer.origin}/error`, { auth: 'anonymous', responseType }))
        .rejects.toMatchObject({ status: 403, message: 'Denied €', body: { error: { code: 'fixture' } } });
    }
    expect(peer.requests).toHaveLength(4);
  } finally { await peer.close(); restore(); }
});
