import api from './api';
import { platformConfig } from '../config/platform.config';

/** React Native FormData file descriptor — RN accepts this instead of Blob */
interface RNFormDataFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * RN's FormData typings expect Blob | string for the value, but the runtime
 * (Hermes / JSC) accepts a `{ uri, name, type }` descriptor. We declare a
 * narrowed FormData-like surface so the descriptor satisfies append() without
 * a double cast.
 */
interface RNFormDataLike {
  append(name: string, value: string | RNFormDataFile): void;
}

export interface UploadedFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadImages(
  uris: string[],
  context: 'job-request' | 'change-order' | 'dispute' | 'chat' | 'review' | 'onboarding' | 'general',
): Promise<UploadedFile[]> {
  if (uris.length === 0) return [];
  if (uris.length > platformConfig.maxImagesPerBooking) {
    throw new Error(`Too many images. Maximum: ${platformConfig.maxImagesPerBooking}`);
  }

  const formData = new FormData();
  const rnForm: RNFormDataLike = formData;
  rnForm.append('context', context);

  // Phase K MED-K14 audit context — the `type` field is derived from
  // the file extension, which is client-controlled and trivially
  // spoofable. We treat the client-supplied MIME as ADVISORY only.
  // The backend (packages/api/src/services/upload.service +
  // MED-N144 fix) byte-sniffs the actual file content via
  // file-type / image-magic-bytes detection and rejects mismatched
  // declarations at /api/v1/uploads. Allowed MIME list is admin-
  // tunable via platform_settings.allowed_image_mime_types
  // (mig 110). So even if a client sends type='image/jpeg' for a
  // .exe payload, the server will return 400 before any storage
  // write. Client-side extension whitelist below is just a sanity
  // pre-filter to save the round-trip.
  const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
  for (const uri of uris) {
    const pathPart = uri.split('?')[0] ?? uri;
    const ext = pathPart.split('.').pop()?.toLowerCase() ?? 'jpg';
    if (!ALLOWED_EXTS.has(ext)) {
      throw new Error(`Unsupported image type ".${ext}". Allowed: ${Array.from(ALLOWED_EXTS).join(', ')}.`);
    }
    const safeExt = ext;
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const type = mimeMap[safeExt] ?? 'image/jpeg';

    const file: RNFormDataFile = {
      uri,
      name: `photo.${safeExt}`,
      type,
    };
    rnForm.append('files', file);
  }

  const res = await api.post<{ success: boolean; data: UploadedFile[] }>(
    '/api/v1/uploads',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return res.data.data;
}
