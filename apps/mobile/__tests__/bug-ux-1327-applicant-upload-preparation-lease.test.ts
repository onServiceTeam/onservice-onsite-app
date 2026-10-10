import { Platform } from 'react-native';
import api from '@/services/api';
import { uploadImages } from '@/services/upload.service';
import { appendImageToFormData } from '@/utils/multipart';
import { deferred } from '../test-support/application-draft-fixture';

jest.mock('@/utils/multipart', () => ({ appendImageToFormData: jest.fn() }));

it('Bug UX-1327 — changing applicant session during asynchronous multipart preparation prevents the upload request', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  try {
    let current = true;
    const prepared = deferred<Awaited<ReturnType<typeof appendImageToFormData>>>();
    jest.mocked(appendImageToFormData).mockReturnValueOnce(prepared.promise);
    jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: [] }, status: 201, ok: true });
    const upload = uploadImages(['blob:private-applicant'], 'onboarding', () => current);
    expect(api.post).not.toHaveBeenCalled();
    current = false;
    prepared.resolve('photo.jpg');
    await expect(upload).rejects.toThrow('application session changed');
    expect(api.post).not.toHaveBeenCalled();
    current = true;
    jest.mocked(appendImageToFormData).mockResolvedValueOnce('photo.jpg');
    await expect(uploadImages(['blob:current-applicant'], 'onboarding', () => current)).resolves.toEqual([]);
    expect(api.post).toHaveBeenCalledWith('/api/v1/uploads', expect.any(FormData));
  } finally { Platform.OS = originalPlatform; }
});
