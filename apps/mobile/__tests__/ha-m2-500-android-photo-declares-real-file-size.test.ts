// HA-M2-500 (D38 Milestone 2, package P5a review fix): an Android photo
// uploads. expo-image-picker 55 re-compresses a photo picked with quality 0.8
// into a new cache file (asset.uri) but reports asset.fileSize from the
// ORIGINAL gallery file (android MediaHandler.kt: fileData?.fileSize). Before,
// the app declared that original size, the server takes a chunk only when it
// matches the declared size exactly, and every Android photo failed with
// chunk_length_mismatch forever. The app now declares the size of the file it
// actually reads.
import api, { ApiError } from '@/services/api';
import { pickedFromAsset } from '@/utils/picked-media';
import { uploadPickedMedia } from '@/hooks/useJobMediaUploads';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as {
  __setMockFile: (uri: string, bytes: Uint8Array) => void;
  __clearMockFiles: () => void;
};

const MiB = 1024 * 1024;
const COMPRESSED_URI = 'file:///data/user/0/ph.onservice.app/cache/ImagePicker/3f2a.jpeg';
const COMPRESSED_BYTES = 1_100_000;
const ORIGINAL_GALLERY_BYTES = 4_200_000;

beforeEach(() => {
  fileSystem.__clearMockFiles();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
});

it('HA-M2-500: an Android photo declares the size of the compressed file it uploads, not the gallery original', async () => {
  fileSystem.__setMockFile(COMPRESSED_URI, new Uint8Array(COMPRESSED_BYTES));

  // The server's rules (packages/api job-media.service putChunk): each chunk
  // must be exactly min(chunkBytes, declared - index * chunkBytes) long.
  let declared = 0;
  jest.mocked(api.post).mockImplementation((async (url: string, body: { totalBytes: number }) => {
    if (url === '/api/v1/job-media') {
      declared = body.totalBytes;
      return { data: { success: true, data: {
        id: 'media-android-1', status: 'uploading', kind: 'photo', purpose: 'job_request', chunkBytes: 2 * MiB,
        totalChunks: Math.ceil(declared / (2 * MiB)), bytesReceived: 0, nextIndex: 0, rejectionCode: null,
        limits: { bytes: 10 * MiB, durationMs: null },
      } } };
    }
    return { data: { success: true, data: { id: 'media-android-1', status: 'stored', kind: 'photo' } } };
  }) as never);
  const sentLengths: number[] = [];
  jest.mocked(api.put).mockImplementation((async (url: string, _body: unknown, init: { binaryBody: Uint8Array }) => {
    const index = Number(url.split('/').pop());
    const expected = Math.min(2 * MiB, declared - index * 2 * MiB);
    sentLengths.push(init.binaryBody.length);
    if (init.binaryBody.length !== expected) {
      throw new ApiError(400, {
        success: false,
        error: { message: 'This chunk is not the expected size.', statusCode: 400, code: 'chunk_length_mismatch' },
      }, 'HTTP 400');
    }
    return { data: { success: true, data: { bytesReceived: declared, nextIndex: index + 1, complete: true } } };
  }) as never);

  const result = pickedFromAsset(
    { uri: COMPRESSED_URI, width: 3000, height: 4000, type: 'image', mimeType: 'image/jpeg', fileName: 'IMG_2041.jpg', fileSize: ORIGINAL_GALLERY_BYTES },
    'photo',
    { photoMaxBytes: 10 * MiB, videoMaxSeconds: 30, videoMaxBytes: 80 * MiB },
  );
  if (!result.ok) throw new Error(result.message);
  // The size check and the list use the real file's size...
  expect(result.picked.size).toBe(COMPRESSED_BYTES);

  // ...and the upload declares the size of the file it reads even when it is
  // handed the picker's stale number.
  const mediaId = await uploadPickedMedia({ ...result.picked, size: ORIGINAL_GALLERY_BYTES }, '5b1c2d3e-4f50-4a61-8b72-93c4d5e6f708', {
    purpose: 'job_request',
    backoffMs: [0, 0, 0, 0, 0],
  });

  expect(mediaId).toBe('media-android-1');
  expect(declared).toBe(COMPRESSED_BYTES);
  expect(sentLengths).toEqual([COMPRESSED_BYTES]);
});
