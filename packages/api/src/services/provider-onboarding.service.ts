/**
 * Phase 14 Dispatch 09 — Provider onboarding v1.0 service.
 * Bugs 162, 1199, 1200.
 *
 * v1.0 launch position: manual admin review. No automated liveness vendor.
 * Every application is reviewed by a human admin. Documented in
 * LAUNCH-LIMITATIONS §27.
 *
 * Three responsibilities:
 * 1. trackProgress(userId, step, data) — provider stamps progress as they
 *    move through the 10-screen onboarding flow. Data is accumulated in
 *    `data_snapshot` JSONB so the application is resumable.
 * 2. submitForReview(userId) — provider submits the application; current_step
 *    locks to 'review_pending' and admin queue receives the row.
 * 3. adminDecide(userId, adminId, decision, reason) — admin approves /
 *    rejects / sends-back. 'sent_back' unlocks editing for the provider;
 *    audit row written.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export type OnboardingStep =
  | 'role_select'
  | 'terms'
  | 'categories'
  | 'service_area'
  | 'documents'
  | 'selfie'
  | 'identity_verification'
  | 'background_check'
  | 'review_pending'
  | 'completed';

export type AdminDecision = 'approved' | 'rejected' | 'sent_back';

const VALID_STEPS = new Set<OnboardingStep>([
  'role_select', 'terms', 'categories', 'service_area',
  'documents', 'selfie', 'identity_verification',
  'background_check', 'review_pending', 'completed',
]);

interface ProgressRow {
  user_id: string;
  current_step: OnboardingStep;
  steps_completed: string[];
  data_snapshot: Record<string, unknown>;
  submitted_for_review_at: Date | null;
  admin_review_started_at: Date | null;
  admin_reviewer_id: string | null;
  admin_decision: AdminDecision | null;
  admin_decision_at: Date | null;
  admin_decision_reason: string | null;
  estimated_review_hours: number;
  created_at: Date;
  updated_at: Date;
}

export interface OnboardingProgress {
  userId: string;
  currentStep: OnboardingStep;
  stepsCompleted: string[];
  dataSnapshot: Record<string, unknown>;
  submittedForReviewAt: string | null;
  adminReviewStartedAt: string | null;
  adminReviewerId: string | null;
  adminDecision: AdminDecision | null;
  adminDecisionAt: string | null;
  adminDecisionReason: string | null;
  estimatedReviewHours: number;
  // Timeline UX (Bug 1199):
  estimatedDecisionAt: string | null;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
}

function format(row: ProgressRow): OnboardingProgress {
  // Editable while not submitted, OR if admin sent it back.
  const isEditable = row.submitted_for_review_at === null
    || row.admin_decision === 'sent_back';

  let estimatedDecisionAt: string | null = null;
  if (row.submitted_for_review_at && !row.admin_decision) {
    const ms = row.submitted_for_review_at.getTime() + row.estimated_review_hours * 3_600_000;
    estimatedDecisionAt = new Date(ms).toISOString();
  }

  return {
    userId: row.user_id,
    currentStep: row.current_step,
    stepsCompleted: row.steps_completed,
    dataSnapshot: row.data_snapshot,
    submittedForReviewAt: row.submitted_for_review_at?.toISOString() ?? null,
    adminReviewStartedAt: row.admin_review_started_at?.toISOString() ?? null,
    adminReviewerId: row.admin_reviewer_id,
    adminDecision: row.admin_decision,
    adminDecisionAt: row.admin_decision_at?.toISOString() ?? null,
    adminDecisionReason: row.admin_decision_reason,
    estimatedReviewHours: row.estimated_review_hours,
    estimatedDecisionAt,
    isEditable,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getProgress(userId: string): Promise<OnboardingProgress | null> {
  const result = await db.query<ProgressRow>(
    `SELECT * FROM provider_onboarding_progress WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ? format(result.rows[0]) : null;
}

/**
 * Stamp the provider's progress through the 10-screen flow. Resumable:
 * the snapshot accumulates so a closed-app-and-returned provider lands
 * back on their last step. Bug 1199 (timeline) + Bug 1200 (resumable).
 */
export async function trackProgress(
  userId: string,
  step: OnboardingStep,
  stepData: Record<string, unknown>,
): Promise<OnboardingProgress> {
  if (!VALID_STEPS.has(step)) {
    throw createAppError('Invalid onboarding step.', 400);
  }

  return db.transaction(async (client) => {
    const existing = await client.query<ProgressRow>(
      `SELECT * FROM provider_onboarding_progress WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );

    const row = existing.rows[0];

    // Bug 1200: cannot edit if already submitted unless admin sent it back.
    if (row && row.submitted_for_review_at && row.admin_decision !== 'sent_back') {
      throw createAppError(
        'Application is under admin review. Editing is locked until admin sends it back.',
        409,
      );
    }

    if (!row) {
      // First step — create the progress row.
      const result = await client.query<ProgressRow>(
        `INSERT INTO provider_onboarding_progress
           (user_id, current_step, steps_completed, data_snapshot)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)
         RETURNING *`,
        [
          userId,
          step,
          JSON.stringify([step]),
          JSON.stringify({ [step]: stepData }),
        ],
      );
      logger.info('Provider onboarding started', { userId, step });
      return format(result.rows[0]!);
    }

    // Update existing row.
    const stepsCompleted = Array.isArray(row.steps_completed) ? [...row.steps_completed] : [];
    if (!stepsCompleted.includes(step)) stepsCompleted.push(step);
    const dataSnapshot = { ...row.data_snapshot, [step]: stepData };

    const result = await client.query<ProgressRow>(
      `UPDATE provider_onboarding_progress
          SET current_step = $2,
              steps_completed = $3::jsonb,
              data_snapshot = $4::jsonb,
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING *`,
      [
        userId,
        step,
        JSON.stringify(stepsCompleted),
        JSON.stringify(dataSnapshot),
      ],
    );
    return format(result.rows[0]!);
  });
}

/**
 * Submit the completed application for admin review. After this:
 * - current_step locks to 'review_pending'
 * - submitted_for_review_at stamped
 * - the application appears in the admin Provider Review queue
 * Bug 1199 (timeline visibility) + Bug 162 (no silent bypass — every
 * submission has a durable record).
 */
export async function submitForReview(userId: string): Promise<OnboardingProgress> {
  return db.transaction(async (client) => {
    const existing = await client.query<ProgressRow>(
      `SELECT * FROM provider_onboarding_progress WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (existing.rows.length === 0) {
      throw createAppError('Onboarding has not been started yet.', 404);
    }
    const row = existing.rows[0]!;
    if (row.submitted_for_review_at && row.admin_decision !== 'sent_back') {
      throw createAppError('Application has already been submitted.', 409);
    }

    // Verify the required prior steps exist in steps_completed.
    const required = ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'];
    const missing = required.filter((s) => !(row.steps_completed as unknown as string[]).includes(s));
    if (missing.length > 0) {
      throw createAppError(
        `Cannot submit — missing steps: ${missing.join(', ')}.`,
        400,
      );
    }

    const updated = await client.query<ProgressRow>(
      `UPDATE provider_onboarding_progress
          SET current_step = 'review_pending',
              submitted_for_review_at = NOW(),
              admin_decision = NULL,
              admin_decision_at = NULL,
              admin_decision_reason = NULL,
              admin_reviewer_id = NULL,
              admin_review_started_at = NULL,
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING *`,
      [userId],
    );

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_application_submitted', 'provider_application', $1, $2::jsonb, $3)`,
      [
        userId,
        JSON.stringify({ stepsCompleted: row.steps_completed }),
        'Provider submitted application for review',
      ],
    );

    logger.info('Provider application submitted', { userId });
    return format(updated.rows[0]!);
  });
}

/**
 * Admin decision on a submitted application. Approves / rejects / sends-back.
 * 'sent_back' unlocks editing for the provider and clears submitted_for_review_at
 * effects so the provider can amend + resubmit.
 */
export async function adminDecide(input: {
  userId: string;          // the applicant
  adminUserId: string;
  decision: AdminDecision;
  reason: string;
}): Promise<OnboardingProgress> {
  if (input.reason.trim().length < 30) {
    throw createAppError('Decision reason must be at least 30 characters.', 400);
  }
  const validDecisions = new Set<AdminDecision>(['approved', 'rejected', 'sent_back']);
  if (!validDecisions.has(input.decision)) {
    throw createAppError('Invalid decision value.', 400);
  }

  return db.transaction(async (client) => {
    const existing = await client.query<ProgressRow>(
      `SELECT * FROM provider_onboarding_progress WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    );
    if (existing.rows.length === 0) {
      throw createAppError('Onboarding application not found.', 404);
    }
    const row = existing.rows[0]!;
    if (!row.submitted_for_review_at) {
      throw createAppError('Application has not been submitted for review yet.', 409);
    }
    if (row.admin_decision && row.admin_decision !== 'sent_back') {
      throw createAppError('Application has already been decided.', 409);
    }

    const newStep: OnboardingStep = input.decision === 'approved'
      ? 'completed'
      : input.decision === 'sent_back'
        ? row.current_step // unchanged; provider will edit + resubmit
        : 'review_pending'; // rejected stays in review_pending state visually

    const updated = await client.query<ProgressRow>(
      `UPDATE provider_onboarding_progress
          SET admin_decision = $2,
              admin_decision_at = NOW(),
              admin_decision_reason = $3,
              admin_reviewer_id = $4,
              admin_review_started_at = COALESCE(admin_review_started_at, NOW()),
              current_step = $5,
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING *`,
      [input.userId, input.decision, input.reason.trim(), input.adminUserId, newStep],
    );

    const verb: Record<AdminDecision, string> = {
      approved: 'provider_application_approved',
      rejected: 'provider_application_rejected',
      sent_back: 'provider_application_sent_back',
    };
    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, $2, 'provider_application', $3, $4::jsonb, $5, $6)`,
      [
        input.adminUserId,
        verb[input.decision],
        input.userId,
        JSON.stringify({ decision: input.decision }),
        input.reason.trim().slice(0, 500),
        input.reason.trim(),
      ],
    );

    logger.info('Provider application decided', {
      userId: input.userId,
      adminUserId: input.adminUserId,
      decision: input.decision,
    });
    return format(updated.rows[0]!);
  });
}

/**
 * Admin Provider Review queue. Returns submitted applications that have
 * not yet been decided.
 */
export async function listPendingReview(limit = 50): Promise<OnboardingProgress[]> {
  const result = await db.query<ProgressRow>(
    `SELECT * FROM provider_onboarding_progress
      WHERE submitted_for_review_at IS NOT NULL
        AND (admin_decision IS NULL OR admin_decision = 'sent_back')
      ORDER BY submitted_for_review_at ASC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map(format);
}
