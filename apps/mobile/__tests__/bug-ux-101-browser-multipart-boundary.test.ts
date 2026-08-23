import { Platform } from 'react-native';
import api from '@/services/api';
import { uploadImages } from '@/services/upload.service';

describe('browser multipart upload headers', () => {
  const originalFetch = global.fetch;
  const originalPlatform = Platform.OS;

  afterEach(() => {
    global.fetch = originalFetch;
    Platform.OS = originalPlatform;
    jest.clearAllMocks();
  });

  it('Bug UX-101 — browser image upload omits a manual Content-Type so fetch can add the multipart boundary', async () => {
    Platform.OS = 'web';
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    global.fetch = jest.fn().mockResolvedValue({ blob: async () => pngBlob }) as typeof fetch;
    const post = api.post as jest.MockedFunction<typeof api.post>;
    post.mockResolvedValue({
      data: {
        success: true,
        data: [{
          id: 'upload-1',
          url: 'https://app.onservice.ph/uploads/onboarding/provider-1/cert.png',
          filename: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 4,
        }],
      },
      status: 200,
      ok: true,
    });

    await uploadImages(['blob:https://app.onservice.ph/cert-photo'], 'onboarding');

    expect(post).toHaveBeenCalledTimes(1);
    const call = post.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/uploads');
    expect(call[1]).toBeInstanceOf(FormData);
    expect(call[2]).toBeUndefined();
  });
});
