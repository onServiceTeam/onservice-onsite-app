import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { extractObjectKey } from './upload.service';
import { providerApplicationDraftFieldsSchema, saveProviderApplicationDraftSchema,
  deleteProviderApplicationDraftSchema, type ProviderApplicationDraftFields } from '../validators/provider-application-draft.validators';

// Engineering default for unsubmitted drafts, not a legal retention claim.
// Submitted evidence, stored objects and backups follow separate E21 rules.
export const PROVIDER_APPLICATION_DRAFT_DAYS = 30;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
interface DraftRow {
  revision: string; application_fields: unknown; created_at: Date;
  saved_at: Date; expires_at: Date; expired: boolean;
}
export interface ProviderApplicationDraft {
  revision: string; fields: ProviderApplicationDraftFields;
  createdAt: string; savedAt: string; expiresAt: string;
}

function conflict(message: string, code: string): Error {
  const error = createAppError(message, 409);
  error.code = code;
  return error;
}

async function lockApplicant(client: Transaction, userId: string): Promise<void> {
  // Same owner-first order as initial submission. Locking a stable owner row
  // serializes first saves, replacement, deletion and eventual submission.
  const owner = (await client.query<{ role: string; is_active: boolean; is_flagged_fraud: boolean }>(
    'SELECT role,is_active,is_flagged_fraud FROM users WHERE id=$1 FOR UPDATE', [userId],
  )).rows[0];
  if (!owner || owner.role !== 'customer' || !owner.is_active || owner.is_flagged_fraud) {
    throw createAppError('Application drafts are available only to active customer accounts without a fraud restriction.', 403);
  }
  const existing = await client.query('SELECT id FROM providers WHERE user_id=$1', [userId]);
  if (existing.rows.length > 0) {
    throw conflict('An application already exists. Check its review status before making changes.', 'provider_application_already_submitted');
  }
}

async function lockedDraft(client: Transaction, userId: string): Promise<DraftRow | undefined> {
  return (await client.query<DraftRow>(
    `SELECT revision,application_fields,created_at,saved_at,expires_at,expires_at <= NOW() AS expired
       FROM provider_application_drafts WHERE user_id=$1 FOR UPDATE`, [userId],
  )).rows[0];
}

function formatDraft(row: DraftRow): ProviderApplicationDraft {
  return { revision: row.revision, fields: providerApplicationDraftFieldsSchema.parse(row.application_fields),
    createdAt: row.created_at.toISOString(), savedAt: row.saved_at.toISOString(), expiresAt: row.expires_at.toISOString() };
}

/** Caller MUST hold the same owner lock used by initial submission. */
export async function validateDraftForSubmission(
  client: Transaction, userId: string, expectedRevision: string | undefined, submittedFields: unknown,
): Promise<string | null> {
  let draft: DraftRow | undefined;
  try { draft = await lockedDraft(client, userId); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error
      && ['42P01', '42703'].includes(String(error.code))) {
      const unavailable = createAppError('Provider applications are temporarily unavailable. Your application was not submitted. Please try again later.', 503);
      unavailable.code = 'provider_application_schema_unavailable';
      throw unavailable;
    }
    throw error;
  }
  if (!draft || draft.expired) {
    if (expectedRevision !== undefined) {
      throw conflict('The draft expired or was removed. Reload and save your application before submitting.', 'provider_application_draft_conflict');
    }
    // Older clients remain compatible only when no active draft exists.
    return draft?.revision ?? null;
  }
  const submitted = providerApplicationDraftFieldsSchema.safeParse(submittedFields);
  const saved = providerApplicationDraftFieldsSchema.safeParse(draft.application_fields);
  if (expectedRevision !== draft.revision || !submitted.success || !saved.success
    || !isDeepStrictEqual(submitted.data, saved.data)) {
    throw conflict('The saved application changed. Reload and save the details you want to submit before trying again.', 'provider_application_draft_conflict');
  }
  return draft.revision;
}

export async function getApplicationDraft(userId: string): Promise<ProviderApplicationDraft | null> {
  return db.transaction(async client => {
    await lockApplicant(client, userId);
    const row = await lockedDraft(client, userId);
    return row && !row.expired ? formatDraft(row) : null;
  });
}

export async function saveApplicationDraft(userId: string, input: unknown): Promise<ProviderApplicationDraft> {
  const parsed = saveProviderApplicationDraftSchema.safeParse(input);
  if (!parsed.success) throw createAppError('The draft contains an invalid or unsupported field. Review the application details.', 400);
  const { expectedRevision, fields } = parsed.data;
  for (const field of ['governmentIdFrontUrl', 'governmentIdBackUrl', 'nbiClearanceUrl', 'selfieUrl'] as const) {
    const value = fields[field];
    if (value === null) continue;
    const key = extractObjectKey(value);
    if (!key || !key.startsWith(`onboarding/${userId.toLowerCase()}/`)) {
      throw createAppError('Application documents must be private onboarding uploads owned by this account.', 400);
    }
    fields[field] = key;
  }
  // Bound the encoded payload as well as individual text fields (including
  // multibyte characters). Do not put validation values into logs/errors.
  const encoded = JSON.stringify(fields);
  if (Buffer.byteLength(encoded, 'utf8') > 16000) throw createAppError('The draft is too large. Shorten the application details.', 400);
  return db.transaction(async client => {
    await lockApplicant(client, userId);
    const existing = await lockedDraft(client, userId);
    const currentRevision = existing && !existing.expired ? existing.revision : null;
    if (expectedRevision !== currentRevision) {
      throw conflict('The draft changed or expired. Reload it before saving so newer work is not overwritten.', 'provider_application_draft_conflict');
    }
    const revision = randomUUID();
    const result = await client.query<DraftRow>(
      `INSERT INTO provider_application_drafts (user_id,revision,application_fields,expires_at)
       VALUES ($1,$2,$3::jsonb,NOW()+$4::int*INTERVAL '1 day')
       ON CONFLICT (user_id) DO UPDATE SET
         revision=EXCLUDED.revision, application_fields=EXCLUDED.application_fields,
         created_at=CASE WHEN provider_application_drafts.expires_at <= NOW() THEN NOW() ELSE provider_application_drafts.created_at END,
         saved_at=NOW(), expires_at=EXCLUDED.expires_at
       RETURNING revision,application_fields,created_at,saved_at,expires_at,FALSE AS expired`,
      [userId, revision, encoded, PROVIDER_APPLICATION_DRAFT_DAYS],
    );
    return formatDraft(result.rows[0]!);
  });
}

export async function deleteApplicationDraft(userId: string, input: unknown): Promise<void> {
  const parsed = deleteProviderApplicationDraftSchema.safeParse(input);
  if (!parsed.success) throw createAppError('The current draft revision is required to discard this draft.', 400);
  await db.transaction(async client => {
    await lockApplicant(client, userId);
    const existing = await lockedDraft(client, userId);
    if (!existing) return; // Already removed, without touching any other record.
    if (existing.revision !== parsed.data.expectedRevision) {
      throw conflict('The draft changed. Reload it before discarding newer work.', 'provider_application_draft_conflict');
    }
    await client.query('DELETE FROM provider_application_drafts WHERE user_id=$1 AND revision=$2', [userId, existing.revision]);
  });
}

/** Bounded row expiry, not object/backup erasure. The scheduler uses one 100-row attempt. */
export async function purgeExpiredApplicationDrafts(limit = 100): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw createAppError('Draft cleanup limit must be between 1 and 500.', 400);
  const result = await db.query(
    `DELETE FROM provider_application_drafts WHERE user_id IN (
       SELECT user_id FROM provider_application_drafts WHERE expires_at <= NOW()
       ORDER BY expires_at,user_id LIMIT $1 FOR UPDATE SKIP LOCKED
     ) RETURNING user_id`, [limit],
  );
  return result.rowCount ?? 0;
}
