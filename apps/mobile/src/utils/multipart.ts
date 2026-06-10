/**
 * Web-aware multipart file append.
 *
 * React Native's FormData accepts a `{ uri, name, type }` descriptor and the
 * native layer streams the file from disk. Browsers require a real Blob/File —
 * the descriptor would be coerced to the string "[object Object]" and the
 * server would reject the part. On web the image pickers and the signature
 * canvas hand back `blob:` / `data:` URIs, which also defeat any
 * extension-from-path sniffing.
 *
 * So: on web we fetch the URI back into a Blob (fetch supports blob: and
 * data: URIs) and append a real File; on native we append the RN descriptor
 * exactly as before. Used by upload.service and booking-photo.service.
 */
import { Platform } from 'react-native';

interface RNFormDataFile {
  uri: string;
  name: string;
  type: string;
}

interface RNFormDataLike {
  append(name: string, value: string | RNFormDataFile): void;
}

export const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Best-effort MIME from a file path/URI extension (native file:// URIs). */
export function inferMimeFromUri(uri: string, fallback = 'image/jpeg'): string {
  const path = (uri.split('?')[0] ?? uri).toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

/**
 * Append one image to `form` under `field`, handling the platform split.
 * `baseName` is the filename stem; the extension follows the resolved MIME.
 * Pass `declaredMime` when the caller already knows the type (e.g. the
 * signature canvas always produces PNG). Returns the MIME actually used.
 *
 * Client-side MIME checks here are a sanity pre-filter only — the server
 * byte-sniffs every upload (MED-N144) and is the real gate.
 */
export async function appendImageToFormData(
  form: FormData,
  field: string,
  uri: string,
  baseName: string,
  declaredMime?: string,
): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const mime =
      declaredMime ??
      (blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg');
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new Error(
        `Unsupported image type "${mime}". Allowed: JPEG, PNG, WebP.`,
      );
    }
    const ext = MIME_TO_EXT[mime] ?? 'jpg';
    form.append(field, new File([blob], `${baseName}.${ext}`, { type: mime }));
    return mime;
  }

  const mime = declaredMime ?? inferMimeFromUri(uri);
  const ext = MIME_TO_EXT[mime] ?? 'jpg';
  const file: RNFormDataFile = { uri, name: `${baseName}.${ext}`, type: mime };
  (form as unknown as RNFormDataLike).append(field, file);
  return mime;
}
