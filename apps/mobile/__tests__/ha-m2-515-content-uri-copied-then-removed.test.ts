// HA-M2-515 (D38 Milestone 2, package P5a review fix, missing coverage): a
// phone file given as a content:// address (Android's document providers)
// is copied once into the app cache, because a FileHandle needs a real file
// path; the chunks are read from that copy at their offsets, and the copy is
// deleted when the upload ends.
import api from '@/services/api';
import { uploadPickedMedia } from '@/hooks/useJobMediaUploads';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as {
  __setMockFile: (uri: string, bytes: Uint8Array) => void;
  __clearMockFiles: () => void;
  __fileCalls: Array<{ op: string; uri?: string; to?: string; value?: number }>;
};

const MiB = 1024 * 1024;
const CONTENT_URI = 'content://com.android.providers.media.documents/document/video%3A1042';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
});

it('HA-M2-515: a content:// file is copied to the cache, read from the copy, and the copy is deleted afterwards', async () => {
  const bytes = new Uint8Array(3 * MiB);
  bytes[2 * MiB] = 77;
  fileSystem.__setMockFile(CONTENT_URI, bytes);

  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-content-1', status: 'uploading', kind: 'video', purpose: 'job_request', chunkBytes: 2 * MiB,
        totalChunks: 2, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 80 * MiB, durationMs: 30000 },
      } } };
    }
    return { data: { success: true, data: { id: 'media-content-1', status: 'stored', kind: 'video' } } };
  }) as never);
  const firstBytes: number[] = [];
  jest.mocked(api.put).mockImplementation((async (url: string, _body: unknown, init: { binaryBody: Uint8Array }) => {
    const index = Number(url.split('/').pop());
    firstBytes.push(init.binaryBody[0]!);
    return { data: { success: true, data: { bytesReceived: Math.min(3 * MiB, (index + 1) * 2 * MiB), nextIndex: index + 1, complete: index === 1 } } };
  }) as never);

  const mediaId = await uploadPickedMedia(
    { kind: 'video', source: { platform: 'native', uri: CONTENT_URI }, mime: 'video/mp4', size: 3 * MiB, durationMs: 15000 },
    '1d2c3b4a-5f6e-4d7c-8b9a-0f1e2d3c4b5a',
    { purpose: 'job_request', backoffMs: [0, 0, 0, 0, 0] },
  );

  expect(mediaId).toBe('media-content-1');
  expect(firstBytes).toEqual([0, 77]);
  const copy = fileSystem.__fileCalls.find((call) => call.op === 'copy');
  expect(copy?.uri).toBe(CONTENT_URI);
  expect(copy?.to).toMatch(/^file:\/\/\/tmp\/cache\/job-media-/);
  const opened = fileSystem.__fileCalls.filter((call) => call.op === 'open').map((call) => call.uri);
  expect(opened).toEqual([copy!.to, copy!.to]);
  expect(fileSystem.__fileCalls.filter((call) => call.op === 'delete').map((call) => call.uri)).toEqual([copy!.to]);
  // The copy is removed only after the last chunk was read.
  const ops = fileSystem.__fileCalls.map((call) => call.op);
  expect(ops.lastIndexOf('readBytes')).toBeLessThan(ops.indexOf('delete'));
});
