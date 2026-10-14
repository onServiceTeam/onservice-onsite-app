// HA-M2-201 (D38 Milestone 2, package P5a): on weak mobile data a chunk the
// server could not take (503) is sent again, and when the server already has
// a chunk (409 chunk_out_of_order with nextIndex, for example after a lost
// answer) the upload continues from the server's nextIndex instead of
// failing or starting over.
import api, { ApiError } from '@/services/api';
import { uploadPickedMedia } from '@/hooks/useJobMediaUploads';

// The jest map points expo-file-system at __mocks__/expo-file-system.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as {
  __setMockFile: (uri: string, bytes: Uint8Array) => void;
  __clearMockFiles: () => void;
};

const MiB = 1024 * 1024;
const VIDEO_URI = 'file:///tmp/cache/ImagePicker/clip-7.mp4';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
});

it('HA-M2-201: a 503 retries the same chunk and a 409 resumes from the server nextIndex', async () => {
  fileSystem.__setMockFile(VIDEO_URI, new Uint8Array(5 * MiB));
  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-7', status: 'uploading', kind: 'video', purpose: 'job_request', chunkBytes: 2 * MiB,
        totalChunks: 3, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 80 * MiB, durationMs: 30000 },
      } } };
    }
    return { data: { success: true, data: { id: 'media-7', status: 'stored', kind: 'video' } } };
  }) as never);

  const sent: number[] = [];
  let firstChunkAttempts = 0;
  jest.mocked(api.put).mockImplementation((async (url: string) => {
    const index = Number(url.split('/').pop());
    sent.push(index);
    if (index === 0 && firstChunkAttempts++ === 0) {
      throw new ApiError(503, { success: false, error: { message: 'Service Unavailable', statusCode: 503 } }, 'HTTP 503');
    }
    if (index === 1) {
      throw new ApiError(409, {
        success: false,
        error: { message: 'Send the chunks in order.', statusCode: 409, code: 'chunk_out_of_order', nextIndex: 2 } as never,
      }, 'HTTP 409');
    }
    return { data: { success: true, data: { bytesReceived: (index + 1) * 2 * MiB, nextIndex: index + 1, complete: index === 2 } } };
  }) as never);

  const mediaId = await uploadPickedMedia(
    { kind: 'video', source: { platform: 'native', uri: VIDEO_URI }, mime: 'video/mp4', size: 5 * MiB, durationMs: 9000 },
    '7d1a2b3c-4d5e-4f60-8a71-92b3c4d5e6f7',
    { purpose: 'job_request', backoffMs: [0, 0, 0, 0, 0] },
  );

  expect(mediaId).toBe('media-7');
  expect(sent).toEqual([0, 0, 1, 2]);
});
