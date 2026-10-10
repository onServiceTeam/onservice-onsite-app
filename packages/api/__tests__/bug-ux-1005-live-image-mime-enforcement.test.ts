const mockGetSetting = jest.fn();

jest.mock('../src/services/settings.service', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { validateFile } from '../src/services/upload.service';

it('Bug UX-1005 — new image validation enforces the current MIME selection without changing stored files', async () => {
  mockGetSetting.mockResolvedValueOnce('image/jpeg');
  await expect(validateFile('screen.png', 'image/png', 1024)).rejects.toMatchObject({
    statusCode: 400,
    message: expect.stringMatching(/image\/png.*not allowed/i),
  });

  mockGetSetting.mockResolvedValueOnce('image/jpeg,image/png');
  await expect(validateFile('screen.png', 'image/png', 1024)).resolves.toBeUndefined();
  expect(mockGetSetting).toHaveBeenCalledWith('allowed_image_mime_types');
});
