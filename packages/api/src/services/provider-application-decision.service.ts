import { z } from 'zod';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { extractObjectKey } from './upload.service';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function requireExpectedApplicationRevision(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw createAppError('Review the submitted application and provide its revision ID before deciding.', 400);
  return parsed.data.toLowerCase();
}

export async function applicationDecisionTransaction(run: (client: TransactionClient) => Promise<void>): Promise<void> {
  try { await db.transaction(run); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error
      && ['42P01', '42703'].includes(String(error.code))) {
      const unavailable = createAppError('Application review is temporarily unavailable. No decision was saved.', 503);
      unavailable.code = 'provider_application_schema_unavailable';
      throw unavailable;
    }
    throw error;
  }
}

function revisionConflict(): never {
  const error = createAppError('This submission is missing, has changed, or has already been decided. Reload the latest preserved submission before deciding. Do not use the current profile as a replacement.', 409);
  error.code = 'provider_application_revision_conflict';
  throw error;
}

// The caller MUST already hold the canonical provider row lock through commit.
// Future resubmission writers must hold the same lock before inserting. This
// retains the existing review lock order; it is not a global lock-order fix.
export async function assertCurrentApplicationRevision(
  client: TransactionClient, providerId: string, expectedRevisionId: string,
  currentDocuments?: {
    government_id_front_url: string | null; government_id_back_url: string | null;
    nbi_clearance_url: string | null; selfie_url: string | null;
  },
): Promise<void> {
  const result = await client.query<{
    id: string; decided: boolean; government_id_front_key: string; government_id_back_key: string;
    nbi_clearance_key: string; selfie_key: string;
  }>(`SELECT r.id, r.government_id_front_key, r.government_id_back_key, r.nbi_clearance_key, r.selfie_key,
      EXISTS (SELECT 1 FROM provider_application_decisions d WHERE d.revision_id=r.id) AS decided
    FROM provider_application_revisions r WHERE r.provider_id=$1 ORDER BY r.revision_number DESC LIMIT 1`, [providerId]);
  const revision = result.rows[0];
  if (!revision || revision.id !== expectedRevisionId || revision.decided) revisionConflict();
  // A replacement cannot be approved while recording review of the original.
  // Missing-document validation retains its precise existing 400 response.
  if (currentDocuments) {
    const pairs = [
      [currentDocuments.government_id_front_url, revision.government_id_front_key],
      [currentDocuments.government_id_back_url, revision.government_id_back_key],
      [currentDocuments.nbi_clearance_url, revision.nbi_clearance_key],
      [currentDocuments.selfie_url, revision.selfie_key],
    ];
    for (const [current, captured] of pairs) {
      if (current?.trim() && extractObjectKey(current) !== captured) revisionConflict();
    }
  }
}

export async function recordApplicationDecision(client: TransactionClient, input: {
  providerId: string; revisionId: string; adminId: string; decision: 'approved' | 'rejected';
  reason: string; checklistSummary?: string;
}): Promise<void> {
  await client.query(`INSERT INTO provider_application_decisions
    (provider_id,revision_id,decided_by,decision,reason,checklist_summary) VALUES ($1,$2,$3,$4,$5,$6)`,
  [input.providerId, input.revisionId, input.adminId, input.decision, input.reason, input.checklistSummary ?? null]);
}
