import { Platform } from 'react-native';
import api from './api';
import { platformConfig } from '../config/platform.config';
import { appendImageToFormData } from '../utils/multipart';

export interface UploadedFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadImages(
  uris: string[],
  context: 'job-request' | 'change-order' | 'dispute' | 'chat' | 'review' | 'onboarding' | 'portfolio' | 'general',
): Promise<UploadedFile[]> {
  if (uris.length === 0) return [];
  if (uris.length > platformConfig.maxImagesPerBooking) {
    throw new Error(`Too many images. Maximum: ${platformConfig.maxImagesPerBooking}`);
  }

  const formData = new FormData();
  formData.append('context', context);

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
  // write. Client-side checks here are just a sanity pre-filter to
  // save the round-trip.
  //
  // Web pickers return blob:/data: URIs (no usable extension), so the
  // extension pre-filter only applies to native file:// URIs; on web
  // appendImageToFormData validates the Blob's MIME instead.
  const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
  for (const uri of uris) {
    if (Platform.OS !== 'web') {
      const pathPart = uri.split('?')[0] ?? uri;
      const ext = pathPart.split('.').pop()?.toLowerCase() ?? 'jpg';
      if (!ALLOWED_EXTS.has(ext)) {
        throw new Error(`Unsupported image type ".${ext}". Allowed: ${Array.from(ALLOWED_EXTS).join(', ')}.`);
      }
    }
    await appendImageToFormData(formData, 'files', uri, 'photo');
  }

  const res = await api.post<{ success: boolean; data: UploadedFile[] }>(
    '/api/v1/uploads',
    formData,
  );

  return res.data.data;
}
