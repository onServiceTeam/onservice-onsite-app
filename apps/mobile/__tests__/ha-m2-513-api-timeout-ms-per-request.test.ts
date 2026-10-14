/** @jest-environment node */
// HA-M2-513 (D38 Milestone 2, package P5a review fix, missing coverage): a
// request can carry its own deadline (timeoutMs). Chunk uploads use a long
// one (2 minutes on weak mobile data), and a short deadline really aborts the
// request, while requests without one keep the default 15 s deadline instead
// of the short one. Real HTTP against a local endpoint.
import { setTimeout as delay } from 'node:timers/promises';
import { installNativeHttp, openApiEndpoint, observe } from '../test-support/api-http';

const mockConfig = { apiUrl: '' };
jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { get apiUrl() { return mockConfig.apiUrl; } } }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
import api, { DEFAULT_TIMEOUT_MS } from '@/services/api';

it('HA-M2-513: timeoutMs aborts a slow request at its own deadline, and the default deadline stays 15 s', async () => {
  const restore = installNativeHttp();
  const peer = await openApiEndpoint((response) => {
    // Answers after 800 ms.
    void delay(800).then(() => {
      if (!response.writableEnded && !response.destroyed) response.end(JSON.stringify({ success: true, data: { ok: true } }));
    });
  });
  mockConfig.apiUrl = peer.origin;
  try {
    const started = Date.now();
    const short = await observe(api.post('/api/v1/job-media/media-1/complete', undefined, { timeoutMs: 300 }), 5_000);
    const elapsed = Date.now() - started;
    expect(short).toBe('AbortError');
    expect(elapsed).toBeLessThan(750);

    // Without timeoutMs the same slow answer arrives (default deadline).
    const normal = await api.get('/api/v1/job-media/media-1');
    expect(normal.data).toEqual({ success: true, data: { ok: true } });
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
  } finally {
    await peer.close();
    restore();
  }
}, 20_000);
