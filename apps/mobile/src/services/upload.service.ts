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

  for (const uri of uris) {
    const pathPart = uri.split('?')[0] ?? uri;
    const ext = pathPart.split('.').pop()?.toLowerCase() ?? 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
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
