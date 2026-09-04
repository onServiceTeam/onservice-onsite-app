/**
 * Phase 07 — Dispute admin service.
 *
 * This service WRAPS `dispute.service.ts` (which is the sacred mover of
 * money via `escrow.service.ts` for resolution refunds) and adds an
 * `admin_actions` audit row for every admin-initiated mutation. No money
 * math is performed here — every centavo flows through the audited
 * dispute/escrow primitives.
 *
 * Sacred-file note: `adminResolveDispute` delegates to
 * `dispute.service.ts.resolveDispute`, which already touches escrow and
 * issues notifications. We intentionally re-record an `admin_actions` row
 * scoped to the admin operator (in addition to whatever audit rows the
 * underlying service writes) so the admin Dispute Detail page has a
 * consistent paper trail. Super-admin gating is enforced at the route
 * layer; this service only validates inputs and preconditions.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as disputeService from './dispute.service';
import * as escrowService from './escrow.service';
import * as gatewayRetryService from './gateway-retry.service';
import * as notificationService from './notification.service';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type DisputePartyPattern = 'OK' | 'REVIEW_REQUIRED' | 'AT_RISK';

export interface DisputeFullDetail {
  id: string;
  bookingId: string;
  status: string;
  tier: number;
  type: string;
  description: string;
  filedBy: string;
  filedAt: string;
  ageHours: number;
  priorityScore: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionType: string | null;
  refundAmount: number | null;
  decisionNotes: string | null;
  internalNotes: string | null;
  providerResponse: string | null;
  providerRespondedAt: string | null;
  assignedTo: string | null;
  booking: {
    id: string;
    status: string;
    totalAmount: number;
    scheduledAt: string | null;
    completedAt: string | null;
    servicePrice: number;
    serviceFee: number;
  } | null;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    avatarUrl: string | null;
    disputesLast90Days: number;
    disputesFavoredCustomerLast90Days: number;
    pattern: DisputePartyPattern;
  } | null;
  provider: {
    id: string;
    userId: string;
    businessName: string;
    tier: string;
    fullName: string;
    avatarUrl: string | null;
    disputesLast90Days: number;
    disputesLostLast90Days: number;
    pattern: DisputePartyPattern;
  } | null;
  evidence: Array<{
    id: string;
    uploadedBy: 'customer' | 'provider' | 'admin';
    evidenceType: string;
    fileUrl: string;
    description: string | null;
    createdAt: string;
  }>;
}

export interface AssignResult {
  disputeId: string;
  assignedTo: string;
  adminActionId: string;
}

export interface AdminResolveInput {
  resolutionType:
    | 'full_refund'
    | 'partial_refund'
    | 'no_refund'
    | 'free_redo'
    | 'refund_with_warning'
    | 'refund_with_suspension'
    | 'split_decision';
  refundPercent?: number;
  decisionNotes: string;
  internalNotes?: string;
}

export interface AdminResolveResult {
  disputeId: string;
  resolutionType: string;
  refundAmount: number;
  adminActionId: string;
}

export interface EscalateResult {
  disputeId: string;
  newTier: number;
  adminActionId: string;
}

export interface MessageResult {
  disputeId: string;
  recipient: 'customer' | 'provider' | 'both';
  adminActionId: string;
  deliveredTo: Array<'customer' | 'provider'>;
  notificationIds: string[];
}

export interface ReopenResult {
  disputeId: string;
  previousStatus: string;
  adminActionId: string;
}

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

const FAVORED_CUSTOMER_RESOLUTIONS = new Set<string>([
  'full_refund',
  'partial_refund',
  'refund_with_warning',
  'refund_with_suspension',
]);

function customerPattern(
  totalDisputes: number,
  favoredCustomer: number,
): DisputePartyPattern {
  if (totalDisputes >= 3 && favoredCustomer / totalDisputes >= 0.5) {
    return 'AT_RISK';
  }
  if (totalDisputes >= 2) return 'REVIEW_REQUIRED';
  return 'OK';
}

function providerPattern(
  totalDisputes: number,
  lost: number,
): DisputePartyPattern {
  if (totalDisputes >= 5 && lost / totalDisputes >= 0.5) {
    return 'AT_RISK';
  }
  if (totalDisputes >= 3) return 'REVIEW_REQUIRED';
  return 'OK';
}

// BUG-PHASE191-01 fix — pre-fix requireText had a min check but no
// max. Used by adminResolveDispute (decisionNotes), sendDisputeMessage
// (message), adminEscalateDispute (reason). All flow into TEXT
// columns (admin_actions.full_notes, dispute_messages.message,
// disputes.escalation_reason) that are unbounded by Postgres. Same
// defense-in-depth pattern as Phase 168 (requireReason). Cap at 5000
// to match the booking-admin requireReason cap.
const REQUIRE_TEXT_MAX = 5000;
function requireText(value: string, field: string, minLength: number): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw createAppError(`${field} is required.`, 400);
  if (trimmed.length < minLength) {
    throw createAppError(
      `${field} must be at least ${minLength} characters.`,
      400,
    );
  }
  if (trimmed.length > REQUIRE_TEXT_MAX) {
    throw createAppError(
      `${field} must be ≤ ${REQUIRE_TEXT_MAX} characters.`,
      400,
    );
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────
// 1) Full dispute detail
// ─────────────────────────────────────────────────────────────────

interface DisputeDetailRow {
  id: string;
  booking_id: string;
  status: string;
  tier: number;
  type: string;
  description: string;
  filed_by: string;
  created_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution_type: string | null;
  refund_amount: string | null;
  decision_notes: string | null;
  internal_notes: string | null;
  provider_response: string | null;
  provider_responded_at: Date | null;
  assigned_to: string | null;
  booking_status: string | null;
  total_amount: string | null;
  scheduled_at: Date | null;
  completed_at: Date | null;
  service_price: string | null;
  service_fee: string | null;
  customer_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_phone: string | null;
  customer_avatar: string | null;
  provider_id: string | null;
  provider_user_id: string | null;
  provider_business_name: string | null;
  provider_tier: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
  provider_avatar: string | null;
}

interface PartyStatsRow {
  total: string;
  matched: string;
}

interface EvidenceDetailRow {
  id: string;
  uploaded_by: string;
  evidence_type: string;
  file_url: string;
  description: string | null;
  created_at: Date;
}

export async function getDisputeFullDetail(
  disputeId: string,
): Promise<DisputeFullDetail> {
  const detailResult = await db.query<DisputeDetailRow>(
    `SELECT d.id, d.booking_id, d.status, d.tier, d.type, d.description,
            d.filed_by, d.created_at,
            d.resolved_at, d.resolved_by, d.resolution_type, d.refund_amount,
            d.decision_notes, d.internal_notes,
            d.provider_response, d.provider_responded_at, d.assigned_to,
            b.status        AS booking_status,
            b.total_amount  AS total_amount,
            b.scheduled_at  AS scheduled_at,
            b.completed_at  AS completed_at,
            b.service_price AS service_price,
            b.service_fee   AS service_fee,
            cu.id           AS customer_id,
            cu.first_name   AS customer_first_name,
            cu.last_name    AS customer_last_name,
            cu.phone        AS customer_phone,
            cu.avatar_url   AS customer_avatar,
            p.id            AS provider_id,
            p.user_id       AS provider_user_id,
            p.business_name AS provider_business_name,
            p.tier          AS provider_tier,
            pu.first_name   AS provider_first_name,
            pu.last_name    AS provider_last_name,
            pu.avatar_url   AS provider_avatar
       FROM disputes d
       LEFT JOIN bookings b   ON b.id = d.booking_id
       LEFT JOIN users cu     ON cu.id = b.customer_id
       LEFT JOIN providers p  ON p.id = b.provider_id
       LEFT JOIN users pu     ON pu.id = p.user_id
      WHERE d.id = $1`,
    [disputeId],
  );
  const d = detailResult.rows[0];
  if (!d) throw createAppError('Dispute not found.', 404);

  const filedAtMs = d.created_at.getTime();
  const ageHours = Math.round((Date.now() - filedAtMs) / (1000 * 60 * 60));
  const totalAmountValue = d.total_amount !== null ? Number(d.total_amount) : 0;
  const priorityScore = totalAmountValue * Math.max(ageHours, 0);

  const customerId = d.customer_id;
  const providerId = d.provider_id;

  const [customerStatsResult, providerStatsResult, evidenceResult] =
    await Promise.all([
      customerId
        ? db.query<PartyStatsRow>(
            `SELECT
               COUNT(*)::text AS total,
               COUNT(*) FILTER (
                 WHERE d.status = 'resolved'
                   AND d.resolution_type = ANY($2::text[])
               )::text AS matched
               FROM disputes d
               JOIN bookings b ON b.id = d.booking_id
              WHERE b.customer_id = $1
                AND d.created_at >= NOW() - INTERVAL '90 days'`,
            [customerId, Array.from(FAVORED_CUSTOMER_RESOLUTIONS)],
          )
        : Promise.resolve({ rows: [] as PartyStatsRow[] }),
      providerId
        ? db.query<PartyStatsRow>(
            `SELECT
               COUNT(*)::text AS total,
               COUNT(*) FILTER (
                 WHERE d.status = 'resolved'
                   AND d.resolution_type = ANY($2::text[])
               )::text AS matched
               FROM disputes d
               JOIN bookings b ON b.id = d.booking_id
              WHERE b.provider_id = $1
                AND d.created_at >= NOW() - INTERVAL '90 days'`,
            [providerId, Array.from(FAVORED_CUSTOMER_RESOLUTIONS)],
          )
        : Promise.resolve({ rows: [] as PartyStatsRow[] }),
      db.query<EvidenceDetailRow>(
        `SELECT id, uploaded_by, evidence_type, file_url, description, created_at
           FROM dispute_evidence
          WHERE dispute_id = $1
          ORDER BY created_at ASC`,
        [disputeId],
      ),
    ]);

  let customer: DisputeFullDetail['customer'] = null;
  if (customerId) {
    const stats = customerStatsResult.rows[0];
    const total = Number(stats?.total ?? 0);
    const matched = Number(stats?.matched ?? 0);
    customer = {
      id: customerId,
      fullName: `${d.customer_first_name ?? ''} ${d.customer_last_name ?? ''}`.trim(),
      phone: d.customer_phone ?? '',
      avatarUrl: d.customer_avatar,
      disputesLast90Days: total,
      disputesFavoredCustomerLast90Days: matched,
      pattern: customerPattern(total, matched),
    };
  }

  let provider: DisputeFullDetail['provider'] = null;
  if (providerId && d.provider_user_id) {
    const stats = providerStatsResult.rows[0];
    const total = Number(stats?.total ?? 0);
    const lost = Number(stats?.matched ?? 0);
    provider = {
      id: providerId,
      userId: d.provider_user_id,
      businessName: d.provider_business_name ?? '',
      tier: d.provider_tier ?? 'new',
      fullName: `${d.provider_first_name ?? ''} ${d.provider_last_name ?? ''}`.trim(),
      avatarUrl: d.provider_avatar,
      disputesLast90Days: total,
      disputesLostLast90Days: lost,
      pattern: providerPattern(total, lost),
    };
  }

  const evidence = evidenceResult.rows.map((e) => {
    let uploadedBy: 'customer' | 'provider' | 'admin' = 'admin';
    if (customerId && e.uploaded_by === customerId) uploadedBy = 'customer';
    else if (d.provider_user_id && e.uploaded_by === d.provider_user_id) {
      uploadedBy = 'provider';
    }
    return {
      id: e.id,
      uploadedBy,
      evidenceType: e.evidence_type,
      fileUrl: e.file_url,
      description: e.description,
      createdAt: e.created_at.toISOString(),
    };
  });

  return {
    id: d.id,
    bookingId: d.booking_id,
    status: d.status,
    tier: d.tier,
    type: d.type,
    description: d.description,
    filedBy: d.filed_by,
    filedAt: d.created_at.toISOString(),
    ageHours,
    priorityScore,
    resolvedAt: d.resolved_at ? d.resolved_at.toISOString() : null,
    resolvedBy: d.resolved_by,
    resolutionType: d.resolution_type,
    refundAmount: d.refund_amount !== null ? Number(d.refund_amount) : null,
    decisionNotes: d.decision_notes,
    internalNotes: d.internal_notes,
    providerResponse: d.provider_response,
    providerRespondedAt: d.provider_responded_at
      ? d.provider_responded_at.toISOString()
      : null,
    assignedTo: d.assigned_to,
    booking: d.booking_status
      ? {
          id: d.booking_id,
          status: d.booking_status,
          totalAmount: totalAmountValue,
          scheduledAt: d.scheduled_at ? d.scheduled_at.toISOString() : null,
          completedAt: d.completed_at ? d.completed_at.toISOString() : null,
          servicePrice: d.service_price !== null ? Number(d.service_price) : 0,
          serviceFee: d.service_fee !== null ? Number(d.service_fee) : 0,
        }
      : null,
    customer,
    provider,
    evidence,
  };
}

// ─────────────────────────────────────────────────────────────────
// 2) Assign dispute
// ─────────────────────────────────────────────────────────────────

export async function adminAssignDispute(
  disputeId: string,
  assigneeAdminId: string,
  adminUserId: string,
): Promise<AssignResult> {
  if (!assigneeAdminId || !assigneeAdminId.trim()) {
    throw createAppError('assigneeAdminId is required.', 400);
  }

  // dispute.service owns the state mutation and its canonical audit row in one
  // transaction. Reuse that row instead of writing a second, out-of-transaction
  // `dispute_assigned` action from this admin wrapper.
  const assigned = await disputeService.assignDispute(disputeId, adminUserId, assigneeAdminId);
  const adminActionId = assigned.adminActionId;
  if (!adminActionId) {
    throw createAppError('Dispute assignment did not return its audit record.', 500);
  }

  logger.info('Dispute assigned by admin', {
    disputeId,
    assigneeAdminId,
    adminUserId,
    adminActionId,
  });

  return { disputeId, assignedTo: assigneeAdminId, adminActionId };
}

// ─────────────────────────────────────────────────────────────────
// 3) Resolve dispute (SACRED — super-admin only at route layer)
// ─────────────────────────────────────────────────────────────────

export async function adminResolveDispute(
  disputeId: string,
  input: AdminResolveInput,
  adminUserId: string,
): Promise<AdminResolveResult> {
  const decisionNotes = requireText(input.decisionNotes, 'decisionNotes', 20);
  disputeService.assertDisputeResolutionAvailable(input.resolutionType);

  if (input.resolutionType === 'partial_refund' || input.resolutionType === 'split_decision') {
    const pct = input.refundPercent;
    if (
      pct === undefined ||
      !Number.isFinite(pct) ||
      pct < 0 ||
      pct > 100
    ) {
      throw createAppError(
        'refundPercent must be between 0 and 100 for partial_refund or split_decision.',
        400,
      );
    }
    if (input.resolutionType === 'partial_refund' && pct === 0) {
      throw createAppError('refundPercent must be greater than 0 for partial_refund.', 400);
    }
  }

  // Phase 14 Dispatch 06 — Bug 83. Pre-D06 this called
  // disputeService.resolveDispute (transactional internally) THEN inserted
  // admin_actions in a SEPARATE top-level db.query. If the audit insert
  // failed after dispute state was already committed, the dispute changed
  // status without the admin-level audit trail. Now: ONE outer transaction
  // wraps disputeService.resolveDisputeInTransaction (the trx-aware helper)
  // + the admin_actions INSERT. Post-commit escrow refund/release calls
  // mirror the legacy resolveDispute pattern (gateway-tolerant).
  const resolution = await db.transaction(async (client) => {
    const helper = await disputeService.resolveDisputeInTransaction(
      client,
      disputeId,
      adminUserId,
      {
        resolutionType: input.resolutionType,
        refundPercent: input.refundPercent,
        decisionNotes,
        internalNotes: input.internalNotes,
      },
    );

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'dispute_resolved', 'dispute', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        disputeId,
        JSON.stringify({
          resolutionType: input.resolutionType,
          refundPercent: input.refundPercent ?? null,
          refundAmount: helper.refundAmount,
          bookingId: helper.bookingId,
        }),
        decisionNotes.slice(0, 500),
        decisionNotes,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record dispute resolve admin action.', 500);
    }

    return {
      adminActionId,
      refundAmount: helper.refundAmount,
      bookingId: helper.bookingId,
      providerId: helper.providerId,
      bookingTotalAmount: helper.bookingTotalAmount,
      pushRequests: helper.pushRequests,
    };
  });

  logger.info('Dispute resolved by admin', {
    disputeId,
    adminUserId,
    adminActionId: resolution.adminActionId,
    resolutionType: input.resolutionType,
    refundAmount: resolution.refundAmount,
  });

  const pushRequests = resolution.pushRequests ?? [];
  const pushResults = await Promise.allSettled(
    pushRequests.map((request) => notificationService.deliverStoredNotificationPush(request)),
  );
  if (pushResults.some((result) => result.status === 'rejected')) {
    logger.warn('Dispute decision push failed after durable inbox delivery', {
      disputeId,
      notificationIds: pushRequests.map((request) => request.notificationId),
    });
  }

  // Post-commit: gateway escrow refund/release. Errors are logged but do
  // not roll back the durable dispute resolution + audit row.
  // gate-c-allowed: post-commit-gateway-refund
  if (resolution.refundAmount > 0) {
    let refundSucceeded = false;
    try {
      await escrowService.refundFromEscrow(
        resolution.bookingId,
        resolution.refundAmount,
        `Admin dispute resolution: ${input.resolutionType}`,
      );
      refundSucceeded = true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to process admin dispute refund (post-commit)', {
        disputeId, refundAmount: resolution.refundAmount, error: errMsg,
      });
      // MED-N28 fix: enqueue for the gateway-retry worker so the
      // refund actually happens eventually instead of relying on
      // manual ops triage of logs. Best-effort enqueue (does NOT
      // throw — durable dispute state is already committed).
      await gatewayRetryService.enqueueRetry({
        actionType: 'refund_from_escrow',
        bookingId: resolution.bookingId,
        disputeId,
        amountCentavos: resolution.refundAmount,
        description: `Admin dispute resolution: ${input.resolutionType}`,
        initialError: errMsg,
      });
    }

    const remainingAmount = resolution.bookingTotalAmount - resolution.refundAmount;
    if (refundSucceeded && remainingAmount > 0 && resolution.providerId) {
      try {
        await escrowService.releasePartialEscrow(resolution.bookingId, remainingAmount);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to release remaining escrow after partial refund (post-commit)', {
          disputeId, remainingAmount, error: errMsg,
        });
        await gatewayRetryService.enqueueRetry({
          actionType: 'release_partial_escrow',
          bookingId: resolution.bookingId,
          disputeId,
          amountCentavos: remainingAmount,
          description: `Partial release after refund (${input.resolutionType})`,
          initialError: errMsg,
        });
      }
    }
  }

  const shouldReleaseToProvider =
    input.resolutionType === 'no_refund' ||
    (resolution.refundAmount === 0 && input.resolutionType !== 'free_redo');
  if (shouldReleaseToProvider && resolution.providerId) {
    try {
      await escrowService.releaseEscrow(resolution.bookingId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to release escrow after dispute resolution (post-commit)', {
        disputeId, resolutionType: input.resolutionType, error: errMsg,
      });
      await gatewayRetryService.enqueueRetry({
        actionType: 'release_escrow',
        bookingId: resolution.bookingId,
        disputeId,
        description: `Release after dispute (${input.resolutionType})`,
        initialError: errMsg,
      });
    }
  }

  return {
    disputeId,
    resolutionType: input.resolutionType,
    refundAmount: resolution.refundAmount,
    adminActionId: resolution.adminActionId,
  };
}

// ─────────────────────────────────────────────────────────────────
// 4) Escalate dispute
// ─────────────────────────────────────────────────────────────────

export async function adminEscalateDispute(
  disputeId: string,
  reason: string,
  adminUserId: string,
): Promise<EscalateResult> {
  const trimmedReason = requireText(reason, 'reason', 10);

  const escalated = await disputeService.escalateDispute(
    disputeId,
    adminUserId,
    trimmedReason,
  );
  const newTier = escalated.tier;
  const adminActionId = escalated.adminActionId;
  if (!adminActionId) {
    throw createAppError('Dispute escalation did not return its audit record.', 500);
  }

  logger.info('Dispute escalated by admin', {
    disputeId,
    adminUserId,
    adminActionId,
    newTier,
  });

  return { disputeId, newTier, adminActionId };
}

// ─────────────────────────────────────────────────────────────────
// 5) Send dispute update to participant notification inboxes
// ─────────────────────────────────────────────────────────────────

export async function sendDisputeMessage(
  disputeId: string,
  recipient: 'customer' | 'provider' | 'both',
  message: string,
  adminUserId: string,
): Promise<MessageResult> {
  const trimmedMessage = (message ?? '').trim();
  if (trimmedMessage.length < 5 || trimmedMessage.length > 2000) {
    throw createAppError(
      'message must be between 5 and 2000 characters.',
      400,
    );
  }

  const outcome = await db.transaction(async (client) => {
    const disputeResult = await client.query<{
      id: string;
      booking_id: string;
      customer_id: string | null;
      provider_user_id: string | null;
    }>(
      `SELECT d.id, d.booking_id,
              b.customer_id        AS customer_id,
              p.user_id            AS provider_user_id
         FROM disputes d
         JOIN bookings b   ON b.id = d.booking_id
         LEFT JOIN providers p ON p.id = b.provider_id
        WHERE d.id = $1`,
      [disputeId],
    );
    if (disputeResult.rows.length === 0) {
      throw createAppError('Dispute not found.', 404);
    }
    const dispute = disputeResult.rows[0]!;

    const targets: Array<{ audience: 'customer' | 'provider'; userId: string }> = [];
    if (recipient === 'customer' || recipient === 'both') {
      if (!dispute.customer_id) {
        throw createAppError('This dispute has no customer notification target.', 409);
      }
      targets.push({ audience: 'customer', userId: dispute.customer_id });
    }
    if (recipient === 'provider' || recipient === 'both') {
      if (!dispute.provider_user_id) {
        if (recipient === 'provider') {
          throw createAppError('This dispute has no assigned provider to notify.', 409);
        }
      } else {
        targets.push({ audience: 'provider', userId: dispute.provider_user_id });
      }
    }

    const title = 'Message from onService dispute support';
    const notificationRows: Array<{
      id: string;
      audience: 'customer' | 'provider';
      userId: string;
    }> = [];
    for (const target of targets) {
      const data = {
        type: 'dispute_update',
        notificationType: 'dispute_update',
        disputeId,
        bookingId: dispute.booking_id,
        source: 'admin_dispute_message',
      };
      const notificationResult = await client.query<{ id: string }>(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'dispute_update', $2, $3, $4::jsonb)
         RETURNING id`,
        [target.userId, title, trimmedMessage, JSON.stringify(data)],
      );
      const notificationId = notificationResult.rows[0]?.id;
      if (!notificationId) {
        throw createAppError('Failed to record dispute participant notification.', 500);
      }
      notificationRows.push({ ...target, id: notificationId });
    }

    const reason = trimmedMessage.length > 500
      ? trimmedMessage.slice(0, 500)
      : trimmedMessage;

    // Phase 14 Dispatch 06 — Bug 85. Store the full message body in the
    // new admin_actions.full_notes column (migration 075) so disputes can
    // be reconstructed verbatim for compliance audit. The legacy `reason`
    // column stays as a 500-char-truncated summary for back-compat with
    // existing UI listings.
    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'dispute_message_sent', 'dispute', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        disputeId,
        JSON.stringify({
          recipient,
          deliveredTo: notificationRows.map((row) => row.audience),
          notificationIds: notificationRows.map((row) => row.id),
          messageLength: trimmedMessage.length,
        }),
        reason,
        trimmedMessage,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError(
        'Failed to record dispute message admin action.',
        500,
      );
    }

    logger.info('Dispute message recorded by admin', {
      disputeId,
      recipient,
      messageLength: trimmedMessage.length,
      adminUserId,
      adminActionId,
    });

    return {
      result: {
        disputeId,
        recipient,
        adminActionId,
        deliveredTo: notificationRows.map((row) => row.audience),
        notificationIds: notificationRows.map((row) => row.id),
      } satisfies MessageResult,
      pushRequests: notificationRows.map((row) => ({
        notificationId: row.id,
        userId: row.userId,
        type: 'dispute_update' as const,
        title,
        body: trimmedMessage.slice(0, 200),
        data: {
          disputeId,
          bookingId: dispute.booking_id,
          source: 'admin_dispute_message',
        },
      })),
    };
  });

  const pushResults = await Promise.allSettled(
    outcome.pushRequests.map((request) =>
      notificationService.deliverStoredNotificationPush(request),
    ),
  );
  if (pushResults.some((result) => result.status === 'rejected')) {
    logger.warn('Dispute participant push failed after durable inbox delivery', {
      disputeId,
      notificationIds: outcome.result.notificationIds,
    });
  }

  return outcome.result;
}

// ─────────────────────────────────────────────────────────────────
// 6) Reopen resolved dispute (super-admin only at route layer)
// ─────────────────────────────────────────────────────────────────

export async function reopenDispute(
  disputeId: string,
  reason: string,
  adminUserId: string,
): Promise<ReopenResult> {
  const trimmedReason = requireText(reason, 'reason', 20);
  logger.warn('Blocked unsafe dispute reopen attempt under E51', {
    disputeId,
    adminUserId,
    reasonLength: trimmedReason.length,
  });
  throw createAppError(
    'Reopening a settled dispute is temporarily unavailable. Open a linked support case for new evidence or a supplemental review.',
    409,
  );
}
