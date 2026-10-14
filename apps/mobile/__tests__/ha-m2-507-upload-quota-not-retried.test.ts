// HA-M2-507 (D38 Milestone 2, package P5a review fix): when the server says
// the account has too many uploads open (429 job_media_quota), the upload
// stops at once with plain copy. It frees up only when other uploads finish
// or are removed, so retrying it five times over about 31 seconds (the rule
// for a temporary 429) only kept the customer waiting and spent requests
// against the API's limit of 100 per user per 15 minutes.
import api, { ApiError } from '@/services/api';
import { MediaUploadError, uploadPickedMedia } from '@/hooks/useJobMediaUploads';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as {
  __setMockFile: (uri: string, bytes: Uint8Array) => void;
  __clearMockFiles: () => void;
};

const PHOTO = 'file:///tmp/cache/ImagePicker/roof-leak.jpg';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  fileSystem.__setMockFile(PHOTO, new Uint8Array(900));
  jest.mocked(api.post).mockReset();
});

it('HA-M2-507: a job_media_quota refusal fails at once with plain copy instead of retrying', async () => {
  jest.mocked(api.post).mockRejectedValue(new ApiError(429, {
    success: false,
    error: { message: 'Too many uploads in progress.', statusCode: 429, code: 'job_media_quota' },
  }, 'HTTP 429'));

  const upload = uploadPickedMedia(
    { kind: 'photo', source: { platform: 'native', uri: PHOTO }, mime: 'image/jpeg', size: 900 },
    '0f1e2d3c-4b5a-4968-8776-655443322110',
    { purpose: 'job_request', backoffMs: [0, 0, 0, 0, 0] },
  );

  await expect(upload).rejects.toBeInstanceOf(MediaUploadError);
  await expect(upload).rejects.toThrow('You have too many uploads in progress. Finish or remove some, then try again.');
  expect(jest.mocked(api.post)).toHaveBeenCalledTimes(1);
});
