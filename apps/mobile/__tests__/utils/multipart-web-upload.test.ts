// Web-compat audit (2026-06-10) — uploads from a browser.
//
// Pre-fix, all three mobile upload paths appended an RN `{uri, name, type}`
// descriptor to FormData. Browsers coerce that object to "[object Object]",
// so no photo/signature upload could ever succeed on app.onservice.ph; and
// the blob:/data: URIs that web pickers return failed the extension
// whitelist before the request was even built. appendImageToFormData now
// branches per platform: real File on web, RN descriptor on native.

import { Platform } from 'react-native';
import { appendImageToFormData, inferMimeFromUri } from '@/utils/multipart';

const realFetch = global.fetch;

afterEach(() => {
  Platform.OS = 'ios';
  global.fetch = realFetch;
});

describe('appendImageToFormData — web', () => {
  beforeEach(() => {
    Platform.OS = 'web';
  });

  it('fetches a blob: URI back into a real File and appends it', async () => {
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(pngBlob) }) as unknown as typeof fetch;

    const form = new FormData();
    const mime = await appendImageToFormData(form, 'photo', 'blob:https://app.onservice.ph/abc-123', 'photo');

    expect(global.fetch).toHaveBeenCalledWith('blob:https://app.onservice.ph/abc-123');
    expect(mime).toBe('image/png');
    const appended = form.get('photo');
    expect(appended).toBeInstanceOf(File);
    expect((appended as File).name).toBe('photo.png');
    expect((appended as File).type).toBe('image/png');
  });

  it('falls back to image/jpeg when the blob has no usable type', async () => {
    const untyped = new Blob([new Uint8Array([1, 2, 3])]);
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(untyped) }) as unknown as typeof fetch;

    const form = new FormData();
    const mime = await appendImageToFormData(form, 'files', 'data:application/octet-stream;base64,AQID', 'photo');

    expect(mime).toBe('image/jpeg');
    expect((form.get('files') as File).name).toBe('photo.jpg');
  });

  it('honors a declared MIME (signature canvas always produces PNG)', async () => {
    const pngBlob = new Blob([new Uint8Array([0x89])], { type: 'image/png' });
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(pngBlob) }) as unknown as typeof fetch;

    const form = new FormData();
    await appendImageToFormData(form, 'signature', 'data:image/png;base64,iVBO', 'signature', 'image/png');

    expect((form.get('signature') as File).name).toBe('signature.png');
    expect((form.get('signature') as File).type).toBe('image/png');
  });

  it('rejects non-image blobs with a clear error', async () => {
    const evil = new Blob(['MZ'], { type: 'application/x-msdownload' });
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(evil) }) as unknown as typeof fetch;

    const form = new FormData();
    await expect(
      appendImageToFormData(form, 'files', 'blob:https://x/1', 'photo', 'application/x-msdownload'),
    ).rejects.toThrow(/Unsupported image type/);
  });
});

describe('appendImageToFormData — native', () => {
  it('appends the RN {uri, name, type} descriptor without fetching', async () => {
    Platform.OS = 'ios';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const form = new FormData();
    const captured: Array<{ field: string; value: unknown }> = [];
    // jsdom FormData stringifies non-Blob values, so capture the raw
    // append to assert the descriptor shape the RN runtime receives.
    form.append = ((field: string, value: unknown) => {
      captured.push({ field, value });
    }) as typeof form.append;

    const mime = await appendImageToFormData(form, 'photo', 'file:///tmp/IMG_001.webp', 'photo');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mime).toBe('image/webp');
    expect(captured).toEqual([
      { field: 'photo', value: { uri: 'file:///tmp/IMG_001.webp', name: 'photo.webp', type: 'image/webp' } },
    ]);
  });
});

describe('inferMimeFromUri', () => {
  it('maps known extensions and falls back to image/jpeg', () => {
    expect(inferMimeFromUri('file:///a/b.png')).toBe('image/png');
    expect(inferMimeFromUri('file:///a/b.webp?cache=1')).toBe('image/webp');
    expect(inferMimeFromUri('file:///a/b.JPG')).toBe('image/jpeg');
    expect(inferMimeFromUri('blob:https://x/uuid')).toBe('image/jpeg');
  });
});
