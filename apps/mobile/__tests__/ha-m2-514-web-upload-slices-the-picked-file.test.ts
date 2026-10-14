// HA-M2-514 (D38 Milestone 2, package P5a review fix, missing coverage;
// critique L13): on the website a 5 MiB file uploads as three slices of the
// picked file itself (Blob.slice), each at most 2 MiB and holding the right
// bytes, and fetch(blob:) is never used. The live site's connect-src policy
// is 'self', so fetching a blob: address is refused, and it would load the
// whole video into memory.
import { Platform } from 'react-native';
import api from '@/services/api';
import { uploadPickedMedia } from '@/hooks/useJobMediaUploads';

const MiB = 1024 * 1024;
const platform = Platform as { OS: string };
const originalOS = platform.OS;
const originalFetch = globalThis.fetch;

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
});
afterEach(() => {
  platform.OS = originalOS;
  globalThis.fetch = originalFetch;
});

it('HA-M2-514: a web upload sends 2 MiB slices of the picked file and never fetches the blob: address', async () => {
  platform.OS = 'web';
  const fetchSpy = jest.fn(() => Promise.reject(new Error('fetch must not be used for media bytes')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  const bytes = new Uint8Array(5 * MiB);
  bytes[0] = 41;
  bytes[2 * MiB] = 42;
  bytes[4 * MiB] = 43;
  bytes[5 * MiB - 1] = 44;
  const picked = new Blob([bytes], { type: 'video/mp4' });

  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-web-1', status: 'uploading', kind: 'video', purpose: 'job_request', chunkBytes: 2 * MiB,
        totalChunks: 3, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 80 * MiB, durationMs: 30000 },
      } } };
    }
    return { data: { success: true, data: { id: 'media-web-1', status: 'stored', kind: 'video' } } };
  }) as never);
  const received: Array<{ index: number; isBlob: boolean; size: number; first: number; last: number }> = [];
  jest.mocked(api.put).mockImplementation((async (url: string, _body: unknown, init: { binaryBody: Blob }) => {
    const index = Number(url.split('/').pop());
    const content = await readBlob(init.binaryBody);
    received.push({
      index,
      isBlob: init.binaryBody instanceof Blob,
      size: init.binaryBody.size,
      first: content[0]!,
      last: content[content.length - 1]!,
    });
    return { data: { success: true, data: { bytesReceived: (index + 1) * 2 * MiB, nextIndex: index + 1, complete: index === 2 } } };
  }) as never);

  const mediaId = await uploadPickedMedia(
    { kind: 'video', source: { platform: 'web', blob: picked }, mime: 'video/mp4', size: picked.size, durationMs: 9000, previewUri: 'blob:https://app.onservice.ph/4c2a' },
    '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
    { purpose: 'job_request', backoffMs: [0, 0, 0, 0, 0] },
  );

  expect(mediaId).toBe('media-web-1');
  expect(received).toEqual([
    { index: 0, isBlob: true, size: 2 * MiB, first: 41, last: 0 },
    { index: 1, isBlob: true, size: 2 * MiB, first: 42, last: 0 },
    { index: 2, isBlob: true, size: 1 * MiB, first: 43, last: 44 },
  ]);
  expect(fetchSpy).not.toHaveBeenCalled();
});
