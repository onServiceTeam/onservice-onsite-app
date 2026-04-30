/**
 * Phase 14 Dispatch 07 — mobile booking photo + signature uploads.
 *
 * Direct upload to /api/v1/uploads/booking-photo (or /booking-signature)
 * with bookingId + photoType in the multipart body. Server inserts into
 * booking_photos / booking_signatures and returns {id, storageUrl}.
 *
 * This replaces the older two-step flow (POST /api/v1/uploads to get a
 * URL, then POST /bookings/:id/photos with the URLs) for the new
 * checklist-photo + after-photo + signature paths. The legacy two-step
 * flow continues to work for back-compat — Bug 36 root-cause guard now
 * validates non-file:// URLs server-side either way.
 */

import api from './api';

export type PhotoType =
  | 'before'
  | 'during'
  | 'after'
  | 'issue'
  | 'checklist'
  | 'identity'
  | 'portfolio';

export type SignatureType =
  | 'ic_agreement'
  | 'customer_acceptance'
  | 'work_authorization'
  | 'change_order_accept';

export interface UploadedBookingPhoto {
  id: string;
  bookingId: string;
  photoType: PhotoType;
  storageKey: string;
  storageUrl: string;
  uploadedAt: string;
}

export interface UploadedSignature {
  id: string;
  bookingId: string | null;
  signatureType: SignatureType;
  storageKey: string;
  storageUrl: string;
  signedAt: string;
}

interface RNFormDataFile {
  uri: string;
  name: string;
  type: string;
}

interface RNFormDataLike {
  append(name: string, value: string | RNFormDataFile): void;
}

function inferImageMime(uri: string): string {
  const path = (uri.split('?')[0] ?? uri).toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function inferImageExtension(mimetype: string): string {
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Upload a booking photo. Mobile compresses + resizes the image (via
 * useImagePicker / expo-image-manipulator before calling this), then
 * we POST multipart to the server. Server stores in S3 + booking_photos.
 *
 * The returned storageUrl is NEVER a `file://` URI (server validates).
 */
export async function uploadBookingPhoto(args: {
  uri: string;
  bookingId: string;
  photoType: PhotoType;
}): Promise<UploadedBookingPhoto> {
  // Mobile must NEVER send a `file://` URI to a long-lived persistence
  // endpoint without converting it to a multipart blob first. The
  // server now rejects file:// values defensively (Bug 36/461 guard).
  // expo-image-picker returns `file://` URIs and FormData can wrap them
  // — that's expected; the server reads the binary, uploads to S3, and
  // stores a real HTTPS storage_url.
  const formData = new FormData();
  const rnForm: RNFormDataLike = formData;
  const mimetype = inferImageMime(args.uri);
  const ext = inferImageExtension(mimetype);
  const file: RNFormDataFile = {
    uri: args.uri,
    name: `photo.${ext}`,
    type: mimetype,
  };
  rnForm.append('photo', file);
  rnForm.append('bookingId', args.bookingId);
  rnForm.append('photoType', args.photoType);

  const response = await api.post<{ success: boolean; data: UploadedBookingPhoto }>(
    '/api/v1/uploads/booking-photo',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return response.data.data;
}

/**
 * List booking photos by type via GET /api/v1/uploads/booking-photo/:bookingId.
 * Returns photos with HTTPS storage URLs ready for <Image source={{uri}} />
 * rendering — never `file://`. Closes Bug 943 + Bug 944 + Bug 73 root cause.
 */
export async function listBookingPhotos(
  bookingId: string,
  photoType?: PhotoType,
): Promise<UploadedBookingPhoto[]> {
  const query = photoType ? `?photoType=${photoType}` : '';
  const response = await api.get<{ success: boolean; data: UploadedBookingPhoto[] }>(
    `/api/v1/uploads/booking-photo/${bookingId}${query}`,
  );
  return response.data.data;
}

/**
 * Upload a signature PNG. For ic_agreement, bookingId is null.
 *
 * The mobile signature canvas (react-native-signature-canvas) returns a
 * base64-encoded PNG via its `onOK` callback. To convert to a multipart
 * upload, write the base64 to a temp file via expo-file-system, then
 * pass the file:// URI here.
 */
export async function uploadSignature(args: {
  uri: string;
  signatureType: SignatureType;
  bookingId?: string | null;
  fullNameTyped?: string;
}): Promise<UploadedSignature> {
  const formData = new FormData();
  const rnForm: RNFormDataLike = formData;
  const file: RNFormDataFile = {
    uri: args.uri,
    name: 'signature.png',
    type: 'image/png',
  };
  rnForm.append('signature', file);
  rnForm.append('signatureType', args.signatureType);
  if (args.bookingId) {
    rnForm.append('bookingId', args.bookingId);
  }
  if (args.fullNameTyped) {
    rnForm.append('fullNameTyped', args.fullNameTyped);
  }

  const response = await api.post<{ success: boolean; data: UploadedSignature }>(
    '/api/v1/uploads/booking-signature',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return response.data.data;
}
