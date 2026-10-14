// HA-M2-200 (D38 Milestone 2, package P5a): a 5 MiB file uploads as three
// 2 MiB-or-less chunks, each read from the file through a FileHandle at its
// own offset. File.slice() and File.bytes() are never used: in SDK 55 both
// read the whole file into memory, which would crash a low-end phone on an
// 80 MB video.
import api from '@/services/api';
import { uploadPickedMedia } from '@/hooks/useJobMediaUploads';

// The jest map points expo-file-system at __mocks__/expo-file-system.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as {
  __setMockFile: (uri: string, bytes: Uint8Array) => void;
  __clearMockFiles: () => void;
  __fileCalls: Array<{ op: string; value?: number }>;
};

const MiB = 1024 * 1024;
const VIDEO_URI = 'file:///tmp/cache/ImagePicker/leak-video.mp4';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
});

it('HA-M2-200: a 5 MiB file uploads in 3 chunks read through file-handle offsets, never slice or bytes', async () => {
  const bytes = new Uint8Array(5 * MiB);
  bytes[0] = 11;
  bytes[2 * MiB] = 22;
  bytes[4 * MiB] = 33;
  fileSystem.__setMockFile(VIDEO_URI, bytes);

  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-1', status: 'uploading', kind: 'video', purpose: 'job_request', chunkBytes: 2 * MiB,
        totalChunks: 3, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 80 * MiB, durationMs: 30000 },
      } } };
    }
    if (url === '/api/v1/job-media/media-1/complete') {
      return { data: { success: true, data: { id: 'media-1', status: 'stored', kind: 'video' } } };
    }
    throw new Error(`unexpected POST ${url}`);
  }) as never);
  const chunks: Array<{ index: number; length: number; first: number; timeoutMs?: number; type: string }> = [];
  jest.mocked(api.put).mockImplementation((async (url: string, _body: unknown, init: { binaryBody: Uint8Array; timeoutMs?: number }) => {
    const index = Number(url.split('/').pop());
    chunks.push({
      index,
      length: init.binaryBody.length,
      first: init.binaryBody[0]!,
      timeoutMs: init.timeoutMs,
      type: Object.prototype.toString.call(init.binaryBody),
    });
    return { data: { success: true, data: { bytesReceived: (index + 1) * 2 * MiB, nextIndex: index + 1, complete: index === 2 } } };
  }) as never);

  const progress: Array<[number, number]> = [];
  const mediaId = await uploadPickedMedia(
    { kind: 'video', source: { platform: 'native', uri: VIDEO_URI }, mime: 'video/mp4', size: 5 * MiB, durationMs: 12000 },
    '0c4f4a8e-3f61-4b19-9a44-6f2f9c1d2e01',
    { purpose: 'job_request', backoffMs: [0, 0, 0, 0, 0], onProgress: (done, total) => progress.push([done, total]) },
  );

  expect(mediaId).toBe('media-1');
  expect(chunks.map(({ index, length, first }) => [index, length, first])).toEqual([
    [0, 2 * MiB, 11],
    [1, 2 * MiB, 22],
    [2, 1 * MiB, 33],
  ]);
  expect(chunks.every((chunk) => chunk.timeoutMs === 120000 && chunk.type === '[object Uint8Array]')).toBe(true);
  expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  expect(fileSystem.__fileCalls.filter((call) => call.op === 'offset').map((call) => call.value)).toEqual([0, 2 * MiB, 4 * MiB]);
  expect(fileSystem.__fileCalls.filter((call) => call.op === 'open')).toHaveLength(3);
  expect(fileSystem.__fileCalls.filter((call) => call.op === 'close')).toHaveLength(3);
  expect(fileSystem.__fileCalls.some((call) => call.op === 'slice' || call.op === 'bytes')).toBe(false);
});
