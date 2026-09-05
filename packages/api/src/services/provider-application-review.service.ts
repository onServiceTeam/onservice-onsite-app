import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import * as adminService from './admin.service';

/**
 * E74: review the applications actually submitted by POST /providers/apply.
 * The onboarding-progress table is a legacy draft record, not an activation
 * authority. Do not copy its decision over a provider's marketplace status.
 * This projection needs no backfill and includes pre-existing pending rows.
 */
interface ApplicationRow {
  id: string;
  user_id: string;
  business_name: string;
  status: 'pending';
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProviderApplicationReviewSummary {
  providerId: string;
  userId: string;
  businessName: string;
  status: 'pending';
  submittedForReviewAt: string | null;
  submissionTimeMissing: boolean;
  createdAt: string;
  updatedAt: string;
  reviewPath: string;
}

export async function listPendingReview(limit = 50): Promise<ProviderApplicationReviewSummary[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 200))
    : 50;
  const result = await db.query<ApplicationRow>(
    `SELECT p.id, p.user_id, p.business_name, p.status,
            p.applied_at, p.created_at, p.updated_at
       FROM providers p
      WHERE p.status = 'pending'
      ORDER BY COALESCE(p.applied_at, p.created_at) ASC, p.id ASC
      LIMIT $1`,
    [boundedLimit],
  );
  return result.rows.map((row) => ({
    providerId: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    status: row.status,
    submittedForReviewAt: row.applied_at?.toISOString() ?? null,
    submissionTimeMissing: row.applied_at === null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewPath: `/providers/${row.id}`,
  }));
}

export async function decideApplication(input: {
  userId: string;
  adminUserId: string;
  decision: 'approved' | 'rejected' | 'sent_back';
  reason: string;
  checklistConfirmed?: unknown;
  checklistSummary?: unknown;
}): Promise<{ providerId: string; userId: string; status: 'approved' | 'rejected' }> {
  if (input.decision === 'sent_back') {
    const held = createAppError(
      'Returning an application for edits is not available yet. Review the application in Provider 360; do not reject it merely to request corrections.',
      409,
    );
    held.code = 'provider_application_resubmission_required';
    throw held;
  }
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw createAppError('Invalid provider application decision.', 400);
  }
  const reason = input.reason.trim();
  // Preserve the existing rejection contract. Approval validates the complete
  // rationale and vetting checklist in the canonical decision service below.
  if (input.decision === 'rejected' && (reason.length < 10 || reason.length > 1000)) {
    throw createAppError('Rejection reason must be between 10 and 1000 characters.', 400);
  }

  const result = await db.query<{ id: string }>(
    'SELECT id FROM providers WHERE user_id = $1',
    [input.userId],
  );
  const provider = result.rows[0];
  if (!provider) throw createAppError('Provider application not found.', 404);

  // No second state machine: these functions atomically change provider status,
  // user role, decision audit and participant inbox. Their pending-state guard
  // is authoritative even if another operator decides after the lookup above.
  if (input.decision === 'approved') {
    await adminService.approveProvider(provider.id, input.adminUserId, {
      reason,
      checklistConfirmed: input.checklistConfirmed,
      checklistSummary: input.checklistSummary,
    });
  } else {
    await adminService.rejectProvider(provider.id, input.adminUserId, reason);
  }
  return { providerId: provider.id, userId: input.userId, status: input.decision };
}
