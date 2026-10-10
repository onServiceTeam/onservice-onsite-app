/**
 * Phase 14 Dispatch 07 — Booking photo + signature persistence service.
 *
 * Wraps the existing upload.service.ts (which handles S3 + KMS or local-FS
 * dual mode) and persists DB rows into booking_photos / booking_signatures.
 * Mobile and admin callers post multipart blobs; this service handles
 * authorization, S3 upload via upload.service, and DB row insertion.
 *
 * Closes Bug 36 + 461 + 1224 root cause: server stores S3 storage_url
 * (or local /uploads URL in dev), never `file://` URIs from the client.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as uploadService from './upload.service';

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

export type ActorRole = 'customer' | 'provider' | 'admin';

const PHOTO_TYPES = new Set<PhotoType>([
  'before', 'during', 'after', 'issue', 'checklist', 'identity', 'portfolio',
]);

const SIGNATURE_TYPES = new Set<SignatureType>([
  'ic_agreement', 'customer_acceptance', 'work_authorization', 'change_order_accept',
]);

export function isPhotoType(value: unknown): value is PhotoType {
  return typeof value === 'string' && PHOTO_TYPES.has(value as PhotoType);
}

export function isSignatureType(value: unknown): value is SignatureType {
  return typeof value === 'string' && SIGNATURE_TYPES.has(value as SignatureType);
}

interface BookingActorRow {
  id: string;
  customer_id: string;
  provider_user_id: string | null;
  staff_user_id: string | null;
  staff_status: string | null;
}

/**
 * Resolves the actor's role for a given booking. Returns 'customer' if
 * userId matches the booking's customer_id, 'provider' if it matches the
 * provider's user_id, or null if the user has no relationship to the
 * booking. Admins bypass this check at the route layer.
 *
 * D15 — an APPROVED staff member assigned to this booking (the booking's
 * performer_staff_id) acts on the provider side: they're the one on site doing
 * the work, so they may upload before/during/after/checklist photos and the
 * customer-acceptance signature exactly as the provider would. Their actions
 * are attributed to the provider (uploaded_by_role='provider') while
 * uploaded_by still records the individual staff user.
 */
async function resolveBookingRole(
  bookingId: string,
  userId: string,
): Promise<{ role: 'customer' | 'provider' } | null> {
  const result = await db.query<BookingActorRow>(
    `SELECT b.id, b.customer_id, p.user_id AS provider_user_id,
            ps.user_id AS staff_user_id, ps.status AS staff_status
     FROM bookings b
     LEFT JOIN providers p ON p.id = b.provider_id
     LEFT JOIN provider_staff ps ON ps.id = b.performer_staff_id
     WHERE b.id = $1`,
    [bookingId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.customer_id === userId) return { role: 'customer' };
  if (row.provider_user_id === userId) return { role: 'provider' };
  if (row.staff_user_id === userId && row.staff_status === 'approved') return { role: 'provider' };
  return null;
}

export interface UploadedBookingPhoto {
  id: string;
  bookingId: string;
  photoType: PhotoType;
  storageKey: string;
  storageUrl: string;
  uploadedAt: string;
}

/**
 * Upload a booking photo: stores in S3 + inserts booking_photos row.
 * Authorization: caller must be the booking's customer, the booking's
 * provider, or an admin (admin permission checked at route layer).
 */
export async function uploadBookingPhoto(args: {
  bookingId: string;
  uploadedByUserId: string;
  uploadedByRole: ActorRole;
  photoType: PhotoType;
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}): Promise<UploadedBookingPhoto> {
  if (!isPhotoType(args.photoType)) {
    throw createAppError('Invalid photoType.', 400);
  }

  // Authorization for non-admin actors.
  if (args.uploadedByRole !== 'admin') {
    const resolved = await resolveBookingRole(args.bookingId, args.uploadedByUserId);
    if (!resolved || resolved.role !== args.uploadedByRole) {
      throw createAppError('You do not have access to this booking.', 403);
    }
  }

  await uploadService.validateFile(args.originalname, args.mimetype, args.buffer.length);

  // Upload to S3 / local FS via existing helper.
  const saved = await uploadService.saveUploadedFile(
    args.buffer,
    args.originalname,
    args.mimetype,
    args.uploadedByUserId,
    `bookings/${args.bookingId}/photos/${args.photoType}`,
  );

  // MED-N132 fix — pseudo-atomic upload + INSERT with full cleanup on
  // any failure path. S3 + Postgres are different systems so true 2PC
  // isn't available; the right pattern is saga compensation: if the
  // DB INSERT fails OR throws (network blip, FK violation, statement
  // timeout), delete the S3 object so we don't leak orphaned files.
  // Pre-fix the cleanup only ran on the rowCount=0 branch; INSERT
  // throws bypassed it entirely.
  let row: { id: string; uploaded_at: Date } | undefined;
  try {
    const result = await db.query<{ id: string; uploaded_at: Date }>(
      `INSERT INTO booking_photos
         (booking_id, uploaded_by, uploaded_by_role, photo_type,
          storage_key, storage_url,
          original_size_bytes, stored_size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
       RETURNING id, uploaded_at`,
      [
        args.bookingId,
        args.uploadedByUserId,
        args.uploadedByRole,
        args.photoType,
        saved.filename,
        saved.url,
        args.buffer.length,
        args.mimetype,
      ],
    );
    row = result.rows[0];
    if (!row) {
      throw createAppError('Failed to record uploaded photo.', 500);
    }
  } catch (insertErr) {
    // Compensating action — delete the orphaned S3 object.
    await uploadService.deleteUploadedFile(saved.filename).catch((cleanupErr) => {
      logger.error('Booking photo cleanup failed after INSERT error — orphan file', {
        bookingId: args.bookingId,
        storageKey: saved.filename,
        cleanupError: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    });
    throw insertErr;
  }

  logger.info('Booking photo uploaded', {
    bookingId: args.bookingId,
    photoId: row.id,
    photoType: args.photoType,
    uploadedBy: args.uploadedByUserId,
    role: args.uploadedByRole,
    sizeBytes: args.buffer.length,
  });

  return {
    id: row.id,
    bookingId: args.bookingId,
    photoType: args.photoType,
    storageKey: saved.filename,
    storageUrl: saved.url,
    uploadedAt: row.uploaded_at.toISOString(),
  };
}

export interface BookingPhotoListItem {
  id: string;
  bookingId: string;
  photoType: PhotoType;
  storageUrl: string;
  uploadedBy: string;
  uploadedByRole: ActorRole;
  uploadedAt: string;
}

export async function listBookingPhotos(
  bookingId: string,
  filter?: { photoType?: PhotoType },
): Promise<BookingPhotoListItem[]> {
  const params: unknown[] = [bookingId];
  let where = `booking_id = $1 AND deleted_at IS NULL`;
  if (filter?.photoType) {
    params.push(filter.photoType);
    where += ` AND photo_type = $2`;
  }
  const result = await db.query<{
    id: string;
    booking_id: string;
    photo_type: PhotoType;
    storage_url: string | null;
    storage_key: string;
    uploaded_by: string;
    uploaded_by_role: ActorRole;
    uploaded_at: Date;
  }>(
    `SELECT id, booking_id, photo_type, storage_url, storage_key,
            uploaded_by, uploaded_by_role, uploaded_at
     FROM booking_photos
     WHERE ${where}
     ORDER BY uploaded_at ASC`,
    params,
  );

  return result.rows.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    photoType: r.photo_type,
    storageUrl: r.storage_url ?? r.storage_key,
    uploadedBy: r.uploaded_by,
    uploadedByRole: r.uploaded_by_role,
    uploadedAt: r.uploaded_at.toISOString(),
  }));
}

// OPS-555: callers that hold the booking lock pass their transaction client
// so the gate never waits for a second pool connection under that lock.
export async function countAfterPhotos(
  bookingId: string,
  executor: { query: typeof db.query } = db,
): Promise<number> {
  const result = await executor.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM booking_photos
     WHERE booking_id = $1
       AND photo_type = 'after'
       AND uploaded_by_role = 'provider'
       AND deleted_at IS NULL`,
    [bookingId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export interface UploadedSignature {
  id: string;
  bookingId: string | null;
  signatureType: SignatureType;
  storageKey: string;
  storageUrl: string;
  signedAt: string;
}

/**
 * Upload a signature PNG: stores in S3 + inserts booking_signatures row.
 * For ic_agreement, bookingId is null (provider signs once during onboarding).
 * For other types, bookingId is required + caller must be a booking party.
 */
export async function uploadSignature(args: {
  bookingId: string | null;
  signedByUserId: string;
  signedRole: ActorRole;
  signatureType: SignatureType;
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  fullNameTyped?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<UploadedSignature> {
  if (!isSignatureType(args.signatureType)) {
    throw createAppError('Invalid signatureType.', 400);
  }

  if (args.signatureType === 'ic_agreement') {
    if (args.bookingId !== null) {
      throw createAppError('ic_agreement signatures must not be tied to a booking.', 400);
    }
    if (args.signedRole !== 'provider') {
      throw createAppError('Only providers sign IC agreements.', 403);
    }
  } else {
    if (args.bookingId === null) {
      throw createAppError(`${args.signatureType} requires a bookingId.`, 400);
    }
    const resolved = await resolveBookingRole(args.bookingId, args.signedByUserId);
    if (!resolved || resolved.role !== args.signedRole) {
      throw createAppError('You do not have access to this booking.', 403);
    }
  }

  await uploadService.validateFile(args.originalname, args.mimetype, args.buffer.length);

  const context = args.bookingId
    ? `bookings/${args.bookingId}/signatures/${args.signatureType}`
    : `signatures/${args.signatureType}`;

  const saved = await uploadService.saveUploadedFile(
    args.buffer,
    args.originalname,
    args.mimetype,
    args.signedByUserId,
    context,
  );

  // MED-N132 fix — pseudo-atomic upload + INSERT with full cleanup on
  // any failure path (same pattern as uploadBookingPhoto). Pre-fix
  // cleanup only ran on rowCount=0; INSERT throws bypassed it.
  let row: { id: string; signed_at: Date } | undefined;
  try {
    const result = await db.query<{ id: string; signed_at: Date }>(
      `INSERT INTO booking_signatures
         (booking_id, signed_by, signed_role, signature_type,
          storage_key, storage_url,
          full_name_typed, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, signed_at`,
      [
        args.bookingId,
        args.signedByUserId,
        args.signedRole,
        args.signatureType,
        saved.filename,
        saved.url,
        args.fullNameTyped ?? null,
        args.ipAddress ?? null,
        args.userAgent ?? null,
      ],
    );
    row = result.rows[0];
    if (!row) throw createAppError('Failed to record signature.', 500);
  } catch (insertErr) {
    await uploadService.deleteUploadedFile(saved.filename).catch((cleanupErr) => {
      logger.error('Signature cleanup failed after INSERT error — orphan file', {
        bookingId: args.bookingId,
        storageKey: saved.filename,
        cleanupError: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    });
    throw insertErr;
  }

  logger.info('Signature uploaded', {
    signatureId: row.id,
    bookingId: args.bookingId,
    signatureType: args.signatureType,
    signedBy: args.signedByUserId,
    role: args.signedRole,
  });

  return {
    id: row.id,
    bookingId: args.bookingId,
    signatureType: args.signatureType,
    storageKey: saved.filename,
    storageUrl: saved.url,
    signedAt: row.signed_at.toISOString(),
  };
}
