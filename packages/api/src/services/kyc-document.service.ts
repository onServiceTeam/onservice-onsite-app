// §35a — authenticated KYC document access.
//
// Government IDs, NBI clearances, and selfies are personal data (NPC RA 10173).
// They must NOT be reachable by a bare URL. This service resolves the stored
// object key for a provider's KYC document, enforces that the requester is the
// owning provider OR an admin/super_admin/dpo, and returns a server-side read
// stream (from the private KYC bucket) for the route to pipe. No public URL is
// ever exposed to a client.

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import * as uploadService from './upload.service';

export type KycDocType = 'government_id_front' | 'government_id_back' | 'nbi_clearance' | 'selfie';

const DOC_TYPE_TO_COLUMN: Record<KycDocType, string> = {
  government_id_front: 'government_id_front_url',
  government_id_back: 'government_id_back_url',
  nbi_clearance: 'nbi_clearance_url',
  selfie: 'selfie_url',
};

export function isKycDocType(v: unknown): v is KycDocType {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DOC_TYPE_TO_COLUMN, v);
}

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'dpo']);

interface ProviderKycRow {
  id: string;
  user_id: string;
  government_id_front_url: string | null;
  government_id_back_url: string | null;
  nbi_clearance_url: string | null;
  selfie_url: string | null;
}

interface KycAccessArgs {
  providerId: string;
  docType: KycDocType;
  requesterUserId: string;
  requesterRole: string;
}

/**
 * Shared authorization + resolution. Loads the provider, verifies the
 * requester is the owner or an admin/super_admin/dpo, and returns the stored
 * value (URL or key) for the requested document. Throws 404/403 as needed.
 */
async function resolveAuthorizedKycValue(args: KycAccessArgs): Promise<string> {
  const result = await db.query<ProviderKycRow>(
    `SELECT id, user_id, government_id_front_url, government_id_back_url,
            nbi_clearance_url, selfie_url
       FROM providers WHERE id = $1`,
    [args.providerId],
  );
  const provider = result.rows[0];
  if (!provider) throw createAppError('Provider not found.', 404);

  const isAdmin = ADMIN_ROLES.has(args.requesterRole);
  const isOwner = provider.user_id === args.requesterUserId;
  if (!isAdmin && !isOwner) {
    throw createAppError('You do not have access to this document.', 403);
  }

  const column = DOC_TYPE_TO_COLUMN[args.docType] as keyof ProviderKycRow;
  const stored = provider[column] as string | null;
  if (!stored) throw createAppError('Document not found.', 404);
  return stored;
}

/**
 * Authorize + resolve a provider's KYC document to a server-side read stream.
 * `providerId` is the providers.id. Access is granted only to the owning
 * provider (by users.id) or an admin/super_admin/dpo.
 */
export async function getProviderKycDocumentStream(args: KycAccessArgs): Promise<uploadService.ObjectStream> {
  const stored = await resolveAuthorizedKycValue(args);
  return uploadService.getObjectStream(stored);
}

/**
 * §35a (presigned option) — same authorization as the streaming path, but
 * returns a short-lived signed URL the client can load directly from storage.
 * Returns null when S3 isn't configured (dev), so the caller falls back to the
 * streaming proxy. Authorization is enforced here BEFORE the URL is minted.
 */
export async function getProviderKycPresignedUrl(
  args: KycAccessArgs & { expiresInSeconds?: number },
): Promise<{ url: string; expiresInSeconds: number } | null> {
  const stored = await resolveAuthorizedKycValue(args);
  const expiresInSeconds = args.expiresInSeconds ?? 120;
  const url = await uploadService.getKycPresignedUrl(stored, expiresInSeconds);
  return url ? { url, expiresInSeconds } : null;
}

/**
 * Resolve the providers.id for the authenticated provider (by users.id).
 * Used by the "my own documents" route so a provider never passes an id.
 */
export async function getProviderIdForUser(userId: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM providers WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) throw createAppError('Provider profile not found.', 404);
  return result.rows[0]!.id;
}

/**
 * Build the API proxy path for a KYC document, for use in API responses
 * INSTEAD of the raw storage URL. `scope` selects the owner-facing or
 * admin-facing route.
 */
export function kycProxyPath(scope: 'me', docType: KycDocType): string;
export function kycProxyPath(scope: 'admin', docType: KycDocType, providerId: string): string;
export function kycProxyPath(scope: 'me' | 'admin', docType: KycDocType, providerId?: string): string {
  return scope === 'me'
    ? `/api/v1/providers/me/kyc/${docType}`
    : `/api/v1/admin/providers/${providerId}/kyc/${docType}`;
}
