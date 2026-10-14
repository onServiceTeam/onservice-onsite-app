/** @jest-environment node */
// HA-M2-512 (D38 Milestone 2, package P5a review fix, missing coverage): a
// media chunk goes to the server as raw bytes (application/octet-stream),
// byte for byte, from a phone (Uint8Array) or the website (Blob), and the
// 401 refresh-and-replay path sends the same bytes again with the new token.
// Every chunk upload depends on this; a JSON-encoded chunk is refused by the
// server (chunk_length_mismatch) for every file. Real HTTP against a local
// endpoint, using the shared harness (test-support/api-http).
import { installNativeHttp, openApiEndpoint } from '../test-support/api-http';

const mockConfig = { apiUrl: '' };
const mockCredentials = { owner: 'fixture-owner', access: 'old-access', refresh: 'old-refresh' };
jest.unmock('@/services/api');
jest.mock('@/config/platform.config', () => ({ platformConfig: { get apiUrl() { return mockConfig.apiUrl; } } }));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: () => mockCredentials.access,
  getRefreshToken: () => mockCredentials.refresh,
  getStoredUser: () => JSON.stringify({ id: mockCredentials.owner }),
  storeTokens: (access: string, refresh: string) => Object.assign(mockCredentials, { access, refresh }),
  clearTokens: jest.fn(), removeSecureItem: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: async () => 'fixture-device' }));
import api from '@/services/api';

/** 300 bytes in the ASCII range, so the harness's text capture is exact. */
function chunkBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(300);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7) % 128;
  return bytes;
}

it('HA-M2-512: chunk bytes reach the server intact as octet-stream, and a 401 replay re-sends the same bytes', async () => {
  const restore = installNativeHttp();
  const seen: Array<{ url?: string; type?: string; length?: string; auth?: string }> = [];
  let chunkAttempts = 0;
  const peer = await openApiEndpoint((response, request) => {
    seen.push({
      url: request.url,
      type: request.headers['content-type'],
      length: request.headers['content-length'],
      auth: request.headers.authorization,
    });
    if (request.url === '/api/v1/auth/refresh-token') {
      response.end(JSON.stringify({ success: true, data: { accessToken: 'new-access', refreshToken: 'new-refresh' } }));
      return;
    }
    if (request.url?.includes('/chunks/0')) {
      chunkAttempts += 1;
      if (chunkAttempts === 1) {
        response.writeHead(401);
        response.end(JSON.stringify({ success: false, error: { message: 'Token expired' } }));
        return;
      }
    }
    response.end(JSON.stringify({ success: true, data: { bytesReceived: 300, nextIndex: 1, complete: true } }));
  });
  mockConfig.apiUrl = peer.origin;
  try {
    const bytes = chunkBytes();
    const expectedText = String.fromCharCode(...Array.from(bytes));

    // Phone: a Uint8Array chunk, refused once with 401, then replayed.
    const phone = await api.put('/api/v1/job-media/media-1/chunks/0', undefined, { binaryBody: bytes });
    expect(phone.data).toEqual({ success: true, data: { bytesReceived: 300, nextIndex: 1, complete: true } });

    // Website: a Blob slice of the picked file.
    await api.put('/api/v1/job-media/media-2/chunks/1', undefined, { binaryBody: new Blob([bytes]) });

    const chunkRequests = peer.requests.filter((request) => request.url?.includes('/chunks/'));
    expect(chunkRequests.map((request) => request.url)).toEqual([
      '/api/v1/job-media/media-1/chunks/0',
      '/api/v1/job-media/media-1/chunks/0',
      '/api/v1/job-media/media-2/chunks/1',
    ]);
    expect(chunkRequests.map((request) => request.body)).toEqual([expectedText, expectedText, expectedText]);
    const chunkHeaders = seen.filter((entry) => entry.url?.includes('/chunks/'));
    expect(chunkHeaders.map((entry) => entry.type)).toEqual(['application/octet-stream', 'application/octet-stream', 'application/octet-stream']);
    expect(chunkHeaders.map((entry) => entry.length)).toEqual(['300', '300', '300']);
    // The replay carried the refreshed token.
    expect(chunkHeaders.map((entry) => entry.auth)).toEqual(['Bearer old-access', 'Bearer new-access', 'Bearer new-access']);
  } finally {
    await peer.close();
    restore();
  }
});
