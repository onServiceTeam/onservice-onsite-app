/** @jest-environment node */
import { setTimeout as delay } from 'node:timers/promises';
import { installNativeHttp, openApiEndpoint, observe, waitForPeer } from '../test-support/api-http';
jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://unused.invalid' } }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
import api from '@/services/api';

it('Bug OPS-553 — a caller signal cannot disable the API deadline and cancellation still closes its request', async () => {
  const restore = installNativeHttp();
  try {
    const results = await Promise.all(['headers', 'body'].map(async phase => {
      const peer = await openApiEndpoint(response => {
        if (phase === 'body') { response.writeHead(200); response.write('{'); }
      });
      const caller = new AbortController();
      const attached = jest.spyOn(caller.signal, 'addEventListener');
      const detached = jest.spyOn(caller.signal, 'removeEventListener');
      const pending = api.post(`${peer.origin}/request`, { fixture: true }, { signal: caller.signal });
      try {
        const outcome = await observe(pending);
        for (let attempt = 0; attempt < 100 && peer.closedResponses() === 0; attempt++) await delay(10);
        expect(attached).toHaveBeenCalledTimes(1);
        expect(detached).toHaveBeenCalledWith('abort', attached.mock.calls[0]![1]);
        return { phase, outcome, closed: peer.closedResponses(), sends: peer.requests.length, callerAborted: caller.signal.aborted };
      } finally { await peer.close(); await Promise.allSettled([pending]); }
    }));
    expect(results).toEqual(['headers', 'body'].map(phase =>
      ({ phase, outcome: 'AbortError', closed: 1, sends: 1, callerAborted: false })));

    for (const phase of ['before', 'headers', 'body']) {
      const peer = await openApiEndpoint(response => {
        if (phase === 'body') { response.writeHead(200); response.write('{'); }
      });
      const caller = new AbortController();
      if (phase === 'before') caller.abort();
      const pending = api.post(`${peer.origin}/request`, {}, { signal: caller.signal });
      const outcome = observe(pending, 1_500);
      try {
        if (phase !== 'before') { await waitForPeer(() => peer.requests.length === 1); caller.abort(); }
        expect(await outcome).toBe('AbortError');
        if (phase !== 'before') await waitForPeer(() => peer.closedResponses() === 1);
        expect(peer.requests).toHaveLength(phase === 'before' ? 0 : 1);
      } finally { await peer.close(); await Promise.allSettled([pending]); }
    }
  } finally { restore(); }
}, 30_000);

it('preserves completed JSON/blob/error/form contracts and detaches caller cancellation after settlement', async () => {
  const restore = installNativeHttp();
  const seenHeaders: { contentType?: string; marker?: string }[] = [];
  const peer = await openApiEndpoint((response, request) => {
    seenHeaders.push({ contentType: request.headers['content-type'], marker: request.headers['x-fixture'] as string | undefined });
    if (request.url?.startsWith('/empty')) { response.writeHead(204); response.end(); }
    else if (request.url?.startsWith('/blob')) { response.writeHead(200); response.end('fixture bytes'); }
    else if (request.url?.startsWith('/error')) {
      response.writeHead(403); response.end(JSON.stringify({ success: false, error: { message: 'Fixture denied', code: 'fixture_denied' } }));
    } else { response.writeHead(201); response.end(JSON.stringify({ success: true, data: { retained: true } })); }
  });
  try {
    for (const path of ['/json', '/empty', '/blob', '/error']) {
      const caller = new AbortController();
      const attached = jest.spyOn(caller.signal, 'addEventListener');
      const detached = jest.spyOn(caller.signal, 'removeEventListener');
      const pending = api.get(`${peer.origin}${path}`, {
        signal: caller.signal, params: { q: 'a & b', absent: undefined },
        ...(path === '/blob' || path === '/error' ? { responseType: 'blob' as const } : {}),
      });
      if (path === '/error') await expect(pending).rejects.toMatchObject({ status: 403, message: 'Fixture denied', body: { error: { code: 'fixture_denied' } } });
      else {
        const result = await pending;
        if (path === '/blob') expect(await (result.data as Blob).text()).toBe('fixture bytes');
        else expect(result).toEqual({ data: path === '/empty' ? null : { success: true, data: { retained: true } }, status: path === '/empty' ? 204 : 201, ok: true });
        caller.abort();
        await expect(pending).resolves.toBe(result);
      }
      expect(attached).toHaveBeenCalledTimes(1);
      expect(detached).toHaveBeenCalledWith('abort', attached.mock.calls[0]![1]);
    }
    const form = new FormData();
    form.set('fixture', 'retained');
    await api.post(`${peer.origin}/form`, form, { headers: { 'X-Fixture': 'preserved' } });
    expect(seenHeaders.at(-1)).toMatchObject({ contentType: expect.stringMatching(/^multipart\/form-data; boundary=/), marker: 'preserved' });
    expect(peer.requests.at(-1)?.body).toContain('name="fixture"\r\n\r\nretained');
    expect(peer.requests).toHaveLength(5);
    expect(peer.requests[0]?.url).toBe('/json?q=a+%26+b');
  } finally { await peer.close(); restore(); }
});
