import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as escrowService from './escrow.service';
import * as socketService from './socket.service';

interface DisputeRow {
  id: string;
  booking_id: string;
  filed_by: string;
  type: string;
  description: string;
  status: string;
  tier: number;
  assigned_to: string | null;
  resolution_type: string | null;
  refund_amount: string;
  refund_percent: string | null;
  decision_notes: string | null;
  internal_notes: string | null;
  provider_response: string | null;
  provider_responded_at: Date | null;
  auto_resolved: boolean;
  resolved_at: Date | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface EvidenceRow {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  evidence_type: string;
  file_url: string;
  description: string | null;
  created_at: Date;
}

interface BookingContextRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  status: string;
  escrow_status: string;
  total_amount: string;
  scheduled_at: Date | null;
  completed_at: Date | null;
  confirmed_at: Date | null;
}

interface ProviderLookupRow {
  user_id: string;
}

interface CountRow { count: string }

type DisputeType = 'no_show' | 'incomplete' | 'substandard' | 'damage' | 'theft' | 'overcharge' | 'other';
type ResolutionType = 'full_refund' | 'partial_refund' | 'no_refund' | 'free_redo'
  | 'refund_with_warning' | 'refund_with_suspension' | 'split_decision';

import { platformConfig } from '../config/platform.config';

const DISPUTE_WINDOW_HOURS = platformConfig.escrowDisputeWindowHours;

export async function fileDispute(
  bookingId: string,
  filedBy: string,
  data: {
    type: DisputeType;
    description: string;
    evidenceUrls?: Array<{ url: string; type: 'photo' | 'video' | 'document'; description?: string }>;
  },
): Promise<DisputeRow> {
  const booking = await db.query<BookingContextRow>(
    `SELECT id, customer_id, provider_id, status, escrow_status, total_amount, scheduled_at, completed_at, confirmed_at
     FROM bookings WHERE id = $1`,
    [bookingId],
  );
  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (bk.customer_id !== filedBy) {
    throw createAppError('Only the booking customer can file a dispute.', 403);
  }

  if (bk.status !== 'completed_by_provider' && bk.status !== 'confirmed') {
    throw createAppError('Disputes can only be filed after the provider marks the job as complete.', 409);
  }

  if (bk.completed_at) {
    const hoursSinceCompletion = (Date.now() - new Date(bk.completed_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCompletion > DISPUTE_WINDOW_HOURS) {
      throw createAppError(`Disputes must be filed within ${DISPUTE_WINDOW_HOURS} hours of completion.`, 409);
    }
  }

  const existing = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM disputes WHERE booking_id = $1 AND status != 'resolved'`,
    [bookingId],
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    throw createAppError('An active dispute already exists for this booking.', 409);
  }

  if ((data.type === 'damage' || data.type === 'theft') &&
      (!data.evidenceUrls || data.evidenceUrls.length === 0)) {
    logger.warn('Dispute filed without evidence for damage/theft claim — evidence strongly recommended', {
      bookingId, type: data.type, filedBy,
    });
  }

  const dispute = await db.transaction(async (client) => {
    const result = await client.query<DisputeRow>(
      `INSERT INTO disputes (booking_id, filed_by, type, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [bookingId, filedBy, data.type, data.description],
    );
    const d = result.rows[0]!;

    if (data.evidenceUrls && data.evidenceUrls.length > 0) {
      for (const ev of data.evidenceUrls.slice(0, 10)) {
        await client.query(
          `INSERT INTO dispute_evidence (dispute_id, uploaded_by, evidence_type, file_url, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [d.id, filedBy, ev.type, ev.url, ev.description ?? null],
        );
      }
    }

    await client.query(
      `UPDATE bookings SET status = 'disputed', escrow_status = 'held', updated_at = NOW() WHERE id = $1`,
      [bookingId],
    );

    logger.info('Dispute filed', { disputeId: d.id, bookingId, type: data.type });

    const autoResult = await attemptAutoResolution(client, d, bk);
    if (autoResult) {
      const resolved = await client.query<DisputeRow>(
        `SELECT * FROM disputes WHERE id = $1`,
        [d.id],
      );
      return resolved.rows[0]!;
    }

    if (bk.provider_id) {
      const provider = await client.query<ProviderLookupRow>(
        `SELECT user_id FROM providers WHERE id = $1`,
        [bk.provider_id],
      );
      if (provider.rows[0]) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'dispute_update', 'Dispute Filed', $2, $3)`,
          [
            provider.rows[0].user_id,
            'A customer has filed a dispute for one of your completed jobs. You have 48 hours to respond.',
            JSON.stringify({ disputeId: d.id, bookingId, disputeType: data.type }),
          ],
        );
      }
    }

    return d;
  });

  // MED-N19 fix: post-commit refund block REMOVED.
  // refundFromEscrowInTransaction is now called inside attemptAutoResolution
  // so the refund is atomic with the dispute resolution + booking
  // status flip. If the refund fails, the whole transaction rolls
  // back instead of leaving the dispute marked 'resolved' with no
  // money moved.

  try {
    socketService.emitAdminEvent(socketService.ADMIN_EVENTS.DISPUTE_FILED, {
      id: dispute.id,
      bookingId,
      status: dispute.status,
    });
  } catch (e) {
    logger.warn('Admin socket emit failed', {
      event: 'dispute:filed',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return dispute;
}

async function attemptAutoResolution(
  client: { query: <R extends import('pg').QueryResultRow>(text: string, params?: unknown[]) => Promise<import('pg').QueryResult<R>> },
  dispute: DisputeRow,
  booking: BookingContextRow,
): Promise<boolean> {
  if (dispute.type === 'no_show') {
    interface BookingTimingRow { scheduled_at: Date; completed_at: Date | null }
    const timingResult = await client.query<BookingTimingRow>(
      `SELECT scheduled_at, completed_at FROM bookings WHERE id = $1`,
      [booking.id],
    );

    if (timingResult.rows[0]) {
      const row = timingResult.rows[0];
      if (row.completed_at && row.scheduled_at) {
        const scheduledMs = new Date(row.scheduled_at).getTime();
        const completedMs = new Date(row.completed_at).getTime();
        const minutesBetween = (completedMs - scheduledMs) / (1000 * 60);

        if (minutesBetween < 5) {
          const totalAmount = Number(booking.total_amount);
          await client.query(
            `UPDATE disputes SET
               status = 'resolved', resolution_type = 'full_refund',
               refund_amount = $1, refund_percent = 100.00,
               decision_notes = 'Auto-resolved: provider marked job complete within minutes of scheduled time — likely no-show',
               auto_resolved = TRUE, resolved_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [totalAmount, dispute.id],
          );

          await client.query(
            `UPDATE bookings SET status = 'resolved', escrow_status = 'refunded', updated_at = NOW() WHERE id = $1`,
            [booking.id],
          );

          // MED-N19 fix: refund must run INSIDE the same transaction
          // that flips dispute=resolved + booking.escrow_status=refunded.
          // Pre-fix the refund was attempted post-commit; if it failed,
          // the dispute was durably resolved and the customer never got
          // their money back. Now: refundFromEscrowInTransaction reuses
          // the same pg client, so any failure rolls back the whole
          // auto-resolution.
          await escrowService.refundFromEscrowInTransaction(
            client as unknown as Parameters<typeof escrowService.refundFromEscrowInTransaction>[0],
            booking.id,
            totalAmount,
            'Auto-resolved dispute refund',
          );

          logger.info('Dispute auto-resolved (no-show — suspicious timing)', { disputeId: dispute.id, bookingId: booking.id });
          return true;
        }
      }
    }
  }

  return false;
}

export async function addProviderResponse(
  disputeId: string,
  providerUserId: string,
  response: string,
  action: 'accept' | 'contest' | 'partial_offer',
  partialOfferAmount?: number,
): Promise<DisputeRow> {
  const dispute = await db.query<DisputeRow>(
    `SELECT * FROM disputes WHERE id = $1`,
    [disputeId],
  );
  if (dispute.rows.length === 0) throw createAppError('Dispute not found.', 404);
  const d = dispute.rows[0]!;

  if (d.status !== 'open') {
    throw createAppError('Can only respond to open disputes.', 409);
  }

  if (d.provider_response) {
    throw createAppError('You have already responded to this dispute.', 409);
  }

  const booking = await db.query<BookingContextRow>(
    `SELECT id, customer_id, provider_id, status, escrow_status, total_amount, scheduled_at, completed_at, confirmed_at
     FROM bookings WHERE id = $1`,
    [d.booking_id],
  );
  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (bk.provider_id) {
    const provider = await db.query<ProviderLookupRow>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    if (!provider.rows[0] || provider.rows[0].user_id !== providerUserId) {
      throw createAppError('You are not the provider for this booking.', 403);
    }
  }

  const result = await db.transaction(async (client) => {
    if (action === 'accept') {
      const totalAmount = Number(bk.total_amount);
      await client.query(
        `UPDATE disputes SET
           status = 'resolved', resolution_type = 'full_refund',
           refund_amount = $1, refund_percent = 100.00,
           provider_response = $2, provider_responded_at = NOW(),
           decision_notes = 'Provider accepted the dispute claim',
           auto_resolved = FALSE, resolved_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [totalAmount, response, disputeId],
      );

      await client.query(
        `UPDATE bookings SET status = 'resolved', escrow_status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [bk.id],
      );

      logger.info('Dispute resolved — provider accepted', { disputeId });
    } else if (action === 'contest') {
      await client.query(
        `UPDATE disputes SET
           status = 'under_review', tier = 2,
           provider_response = $1, provider_responded_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [response, disputeId],
      );
      logger.info('Dispute escalated to Tier 2 — provider contested', { disputeId });
    } else if (action === 'partial_offer') {
      if (!partialOfferAmount || partialOfferAmount <= 0) {
        throw createAppError('Partial offer amount must be positive.', 400);
      }
      await client.query(
        `UPDATE disputes SET
           provider_response = $1, provider_responded_at = NOW(),
           refund_amount = $2, updated_at = NOW()
         WHERE id = $3`,
        [response, partialOfferAmount, disputeId],
      );
      logger.info('Provider offered partial refund', { disputeId, partialOfferAmount });
    }

    const updated = await client.query<DisputeRow>(
      `SELECT * FROM disputes WHERE id = $1`,
      [disputeId],
    );
    return updated.rows[0]!;
  });

  if (action === 'accept') {
    try {
      const totalAmount = Number(bk.total_amount);
      await escrowService.refundFromEscrow(d.booking_id, totalAmount, 'Provider accepted dispute — full refund');
    } catch (err) {
      logger.error('Failed to process dispute refund after provider accept', { disputeId, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  return result;
}

export async function acceptPartialOffer(disputeId: string, customerId: string): Promise<DisputeRow> {
  const dispute = await db.query<DisputeRow>(
    `SELECT * FROM disputes WHERE id = $1`,
    [disputeId],
  );
  if (dispute.rows.length === 0) throw createAppError('Dispute not found.', 404);
  const d = dispute.rows[0]!;

  if (d.filed_by !== customerId) {
    throw createAppError('Only the dispute filer can accept a partial offer.', 403);
  }

  if (d.status !== 'open' || !d.refund_amount || Number(d.refund_amount) <= 0) {
    throw createAppError('No partial offer to accept.', 409);
  }

  const booking = await db.query<BookingContextRow>(
    `SELECT id, customer_id, provider_id, status, escrow_status, total_amount, scheduled_at, completed_at, confirmed_at
     FROM bookings WHERE id = $1`,
    [d.booking_id],
  );
  if (booking.rows.length === 0) throw createAppError('Associated booking not found.', 404);
  const bk = booking.rows[0]!;
  const totalAmount = Number(bk.total_amount);
  const refundAmount = Number(d.refund_amount);
  const refundPercent = totalAmount > 0 ? Math.round((refundAmount / totalAmount) * 10000) / 100 : 0;

  const result = await db.query<DisputeRow>(
    `UPDATE disputes SET
       status = 'resolved', resolution_type = 'partial_refund',
       refund_percent = $1,
       decision_notes = 'Customer accepted provider partial offer',
       auto_resolved = FALSE, resolved_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [refundPercent, disputeId],
  );

  const escrowStatus = refundAmount >= totalAmount ? 'refunded' : 'partially_refunded';
  await db.query(
    `UPDATE bookings SET status = 'resolved', escrow_status = $1, updated_at = NOW() WHERE id = $2`,
    [escrowStatus, d.booking_id],
  );

  if (result.rows.length === 0) throw createAppError('Failed to update dispute — concurrent modification.', 409);

  logger.info('Dispute resolved — partial offer accepted', { disputeId, refundAmount, refundPercent });

  if (refundAmount > 0) {
    let refundSucceeded = false;
    try {
      await escrowService.refundFromEscrow(d.booking_id, refundAmount, 'Partial offer accepted — dispute refund');
      refundSucceeded = true;
    } catch (err) {
      logger.error('Failed to process partial offer refund', { disputeId, refundAmount, error: err instanceof Error ? err.message : 'Unknown' });
    }

    const remainingAmount = totalAmount - refundAmount;
    if (refundSucceeded && remainingAmount > 0 && bk.provider_id) {
      try {
        await escrowService.releasePartialEscrow(d.booking_id, remainingAmount);
      } catch (err) {
        logger.error('Failed to release remaining escrow after partial offer acceptance', { disputeId, remainingAmount, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }
  }

  return result.rows[0]!;
}

/**
 * Phase 14 Dispatch 06 — Bug 83.
 * Trx-aware helper for dispute resolution writes (UPDATE disputes + UPDATE
 * bookings + UPDATE providers if suspension + INSERT notifications).
 * Caller owns the outer transaction AND the admin_actions audit row.
 *
 * Returns the resolved dispute + refund amount so the caller can run the
 * post-commit escrow refund/release calls (which target an external
 * gateway and tolerate eventual consistency per the documented pattern).
 */
type PgClient = { query: typeof db.query };

export async function resolveDisputeInTransaction(
  client: PgClient,
  disputeId: string,
  adminId: string,
  data: {
    resolutionType: ResolutionType;
    refundPercent?: number;
    decisionNotes: string;
    internalNotes?: string;
  },
): Promise<{ dispute: DisputeRow; refundAmount: number; refundPercent: number; bookingId: string; bookingTotalAmount: number; providerId: string | null }> {
  const dispute = await client.query<DisputeRow>(
    `SELECT * FROM disputes WHERE id = $1 FOR UPDATE`,
    [disputeId],
  );
  if (dispute.rows.length === 0) throw createAppError('Dispute not found.', 404);
  const d = dispute.rows[0]!;

  if (d.status === 'resolved') {
    throw createAppError('This dispute is already resolved.', 409);
  }

  const booking = await client.query<BookingContextRow>(
    `SELECT id, customer_id, provider_id, status, escrow_status, total_amount, scheduled_at, completed_at, confirmed_at
     FROM bookings WHERE id = $1`,
    [d.booking_id],
  );
  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;
  const totalAmount = Number(bk.total_amount);

  let refundAmount = 0;
  let refundPercent = 0;

  if (data.resolutionType === 'full_refund' || data.resolutionType === 'refund_with_warning' || data.resolutionType === 'refund_with_suspension') {
    refundAmount = totalAmount;
    refundPercent = 100;
  } else if (data.resolutionType === 'partial_refund' || data.resolutionType === 'split_decision') {
    if (data.refundPercent == null || data.refundPercent < 0 || data.refundPercent > 100) {
      throw createAppError('Refund percent must be between 0 and 100.', 400);
    }
    refundPercent = data.refundPercent;
    refundAmount = Math.round(totalAmount * (refundPercent / 100));
  }

  await client.query(
    `UPDATE disputes SET
       status = 'resolved', resolution_type = $1,
       refund_amount = $2, refund_percent = $3,
       decision_notes = $4, internal_notes = $5,
       resolved_at = NOW(), resolved_by = $6, updated_at = NOW()
     WHERE id = $7`,
    [data.resolutionType, refundAmount, refundPercent, data.decisionNotes, data.internalNotes ?? null, adminId, disputeId],
  );

  if (refundAmount > 0) {
    const escrowStatus = refundAmount >= totalAmount ? 'refunded' : 'partially_refunded';
    await client.query(
      `UPDATE bookings SET status = 'resolved', escrow_status = $1, updated_at = NOW() WHERE id = $2`,
      [escrowStatus, d.booking_id],
    );
  } else {
    await client.query(
      `UPDATE bookings SET status = 'resolved', updated_at = NOW() WHERE id = $1`,
      [d.booking_id],
    );
  }

  if (data.resolutionType === 'refund_with_suspension' && bk.provider_id) {
    await client.query(
      `UPDATE providers SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
      [bk.provider_id],
    );
  }

  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'dispute_update', 'Dispute Resolved', $2, $3)`,
    [
      bk.customer_id,
      `Your dispute has been resolved: ${formatResolutionType(data.resolutionType)}.`,
      JSON.stringify({ disputeId, bookingId: d.booking_id, resolution: data.resolutionType }),
    ],
  );

  if (bk.provider_id) {
    const provider = await client.query<ProviderLookupRow>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    if (provider.rows[0]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'dispute_update', 'Dispute Resolved', $2, $3)`,
        [
          provider.rows[0].user_id,
          `A dispute for your booking has been resolved: ${formatResolutionType(data.resolutionType)}.`,
          JSON.stringify({ disputeId, bookingId: d.booking_id, resolution: data.resolutionType }),
        ],
      );
    }
  }

  const updated = await client.query<DisputeRow>(
    `SELECT * FROM disputes WHERE id = $1`,
    [disputeId],
  );

  return {
    dispute: updated.rows[0]!,
    refundAmount,
    refundPercent,
    bookingId: d.booking_id,
    bookingTotalAmount: totalAmount,
    providerId: bk.provider_id,
  };
}

export async function resolveDispute(
  disputeId: string,
  adminId: string,
  data: {
    resolutionType: ResolutionType;
    refundPercent?: number;
    decisionNotes: string;
    internalNotes?: string;
  },
): Promise<DisputeRow> {
  const result = await db.transaction(async (client) => {
    const helper = await resolveDisputeInTransaction(client, disputeId, adminId, data);
    // Legacy callers expect this audit row; trx-aware admin path inserts
    // its own audit row and does NOT call this wrapper.
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'dispute_resolved', 'dispute', $2, $3, $4)`,
      [adminId, disputeId,
       JSON.stringify({ resolutionType: data.resolutionType, refundAmount: helper.refundAmount, refundPercent: helper.refundPercent, bookingId: helper.bookingId }),
       data.decisionNotes],
    );
    return helper;
  });

  const refundAmount = result.refundAmount;
  const totalAmount = result.bookingTotalAmount;
  const bookingId = result.bookingId;

  logger.info('Dispute resolved by admin', { disputeId, adminId, resolutionType: data.resolutionType });
  const resolved = result.dispute;

  if (refundAmount > 0) {
    let refundSucceeded = false;
    try {
      await escrowService.refundFromEscrow(bookingId, refundAmount, `Admin dispute resolution: ${data.resolutionType}`);
      refundSucceeded = true;
    } catch (err) {
      logger.error('Failed to process admin dispute refund', { disputeId, refundAmount, error: err instanceof Error ? err.message : 'Unknown' });
    }

    const remainingAmount = totalAmount - refundAmount;
    if (refundSucceeded && remainingAmount > 0 && result.providerId) {
      try {
        await escrowService.releasePartialEscrow(bookingId, remainingAmount);
      } catch (err) {
        logger.error('Failed to release remaining escrow after partial refund', { disputeId, remainingAmount, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }
  }

  const shouldReleaseToProvider = data.resolutionType === 'no_refund'
    || (refundAmount === 0 && data.resolutionType !== 'free_redo');
  if (shouldReleaseToProvider && result.providerId) {
    try {
      const { releaseEscrow } = await import('./escrow.service');
      await releaseEscrow(bookingId);
    } catch (err) {
      logger.error('Failed to release escrow after dispute resolution', { disputeId, resolutionType: data.resolutionType, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  return resolved;
}

export async function escalateDispute(disputeId: string, adminId: string, reason: string): Promise<DisputeRow> {
  // Phase 14 Dispatch 06 — Bug 84. Pre-D06 the disputes UPDATE and the
  // admin_actions INSERT ran as two separate top-level db.query calls
  // (no transaction). If the audit insert failed, the dispute status had
  // already escalated without an audit trail. Now: ONE transaction wraps
  // both writes with FOR UPDATE locking on the read.
  return db.transaction(async (client) => {
    const dispute = await client.query<DisputeRow>(
      `SELECT * FROM disputes WHERE id = $1 FOR UPDATE`,
      [disputeId],
    );
    if (dispute.rows.length === 0) throw createAppError('Dispute not found.', 404);
    const d = dispute.rows[0]!;

    if (d.status === 'resolved') throw createAppError('Cannot escalate a resolved dispute.', 409);
    if (d.tier >= 3) throw createAppError('Dispute is already at the highest tier.', 409);

    const newTier = d.tier + 1;
    const result = await client.query<DisputeRow>(
      `UPDATE disputes SET tier = $1, status = 'escalated', updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newTier, disputeId],
    );

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'dispute_escalated', 'dispute', $2, $3, $4, $5)`,
      [adminId, disputeId,
       JSON.stringify({ previousTier: d.tier, newTier }),
       reason.slice(0, 500),
       reason],
    );

    if (result.rows.length === 0) throw createAppError('Failed to escalate dispute — concurrent modification.', 409);
    logger.info('Dispute escalated', { disputeId, fromTier: d.tier, toTier: newTier });
    return result.rows[0]!;
  });
}

export async function assignDispute(disputeId: string, adminId: string, assigneeId: string): Promise<DisputeRow> {
  // Phase 14 Dispatch 06 — gate-promotion fix. Pre-D06 the dispute UPDATE
  // and admin_actions INSERT ran as two separate top-level db.query
  // calls. Now: ONE transaction wraps both writes so audit failure
  // rolls back the assignment (consistent with Bug 84's escalateDispute
  // fix).
  return db.transaction(async (client) => {
    const result = await client.query<DisputeRow>(
      `UPDATE disputes SET assigned_to = $1, status = 'under_review', updated_at = NOW()
       WHERE id = $2 AND status != 'resolved' RETURNING *`,
      [assigneeId, disputeId],
    );
    if (result.rows.length === 0) throw createAppError('Dispute not found or already resolved.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'dispute_assigned', 'dispute', $2, $3)`,
      [adminId, disputeId, JSON.stringify({ assignedTo: assigneeId })],
    );

    logger.info('Dispute assigned', { disputeId, assigneeId });
    return result.rows[0]!;
  });
}

export async function getDisputeById(disputeId: string): Promise<DisputeRow> {
  const result = await db.query<DisputeRow>(
    `SELECT * FROM disputes WHERE id = $1`,
    [disputeId],
  );
  if (result.rows.length === 0) throw createAppError('Dispute not found.', 404);
  return result.rows[0]!;
}

export async function getDisputeEvidence(disputeId: string): Promise<EvidenceRow[]> {
  const result = await db.query<EvidenceRow>(
    `SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at ASC`,
    [disputeId],
  );
  return result.rows;
}

export async function listDisputes(
  filters: { status?: string; tier?: number; search?: string; page: number; pageSize: number },
): Promise<{ disputes: DisputeRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`d.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.tier != null) {
    conditions.push(`d.tier = $${paramIdx++}`);
    params.push(filters.tier);
  }
  if (filters.search) {
    conditions.push(`(d.id::text ILIKE $${paramIdx} OR d.booking_id::text ILIKE $${paramIdx} OR d.description ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM disputes d ${whereClause}`,
    params,
  );

  const total = Number(countResult.rows[0]?.count ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;

  const dataResult = await db.query<DisputeRow>(
    `SELECT d.* FROM disputes d ${whereClause}
     ORDER BY
       CASE d.status
         WHEN 'escalated' THEN 1
         WHEN 'open' THEN 2
         WHEN 'under_review' THEN 3
         ELSE 4
       END,
       d.created_at ASC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { disputes: dataResult.rows, total };
}

export async function listUserDisputes(
  userId: string,
  filters: { status?: string; page: number; pageSize: number },
): Promise<{ disputes: DisputeRow[]; total: number }> {
  const conditions: string[] = [`d.filed_by = $1`];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (filters.status) {
    conditions.push(`d.status = $${paramIdx++}`);
    params.push(filters.status);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM disputes d ${whereClause}`,
    params,
  );

  const total = Number(countResult.rows[0]?.count ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;

  const dataResult = await db.query<DisputeRow>(
    `SELECT d.* FROM disputes d ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { disputes: dataResult.rows, total };
}

export async function getDisputesByBooking(bookingId: string): Promise<DisputeRow[]> {
  const result = await db.query<DisputeRow>(
    `SELECT * FROM disputes WHERE booking_id = $1 ORDER BY created_at DESC`,
    [bookingId],
  );
  return result.rows;
}

export async function autoEscalateStaleDisputes(): Promise<number> {
  const result = await db.query<DisputeRow>(
    `UPDATE disputes SET
       tier = LEAST(tier + 1, 3),
       status = CASE
         WHEN tier = 1 THEN 'under_review'
         WHEN tier >= 2 THEN 'escalated'
         ELSE status
       END,
       updated_at = NOW()
     WHERE status = 'open'
       AND provider_response IS NULL
       AND created_at < NOW() - INTERVAL '48 hours'
     RETURNING id`,
    [],
  );

  if (result.rows.length > 0) {
    logger.info('Auto-escalated stale disputes', { count: result.rows.length });
  }

  return result.rows.length;
}

function formatResolutionType(type: string): string {
  const labels: Record<string, string> = {
    full_refund: 'Full refund issued',
    partial_refund: 'Partial refund issued',
    no_refund: 'No refund — claim denied',
    free_redo: 'Free service redo offered',
    refund_with_warning: 'Refund issued, provider warned',
    refund_with_suspension: 'Refund issued, provider suspended',
    split_decision: 'Split decision — partial refund and compensation',
  };
  return labels[type] ?? type;
}

export function formatDispute(d: DisputeRow): Record<string, unknown> {
  return {
    id: d.id,
    bookingId: d.booking_id,
    filedBy: d.filed_by,
    type: d.type,
    description: d.description,
    status: d.status,
    tier: d.tier,
    assignedTo: d.assigned_to,
    resolutionType: d.resolution_type,
    refundAmount: Number(d.refund_amount),
    refundPercent: d.refund_percent ? Number(d.refund_percent) : null,
    decisionNotes: d.decision_notes,
    providerResponse: d.provider_response,
    providerRespondedAt: d.provider_responded_at,
    autoResolved: d.auto_resolved,
    resolvedAt: d.resolved_at,
    resolvedBy: d.resolved_by,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

export function formatEvidence(e: EvidenceRow): Record<string, unknown> {
  return {
    id: e.id,
    disputeId: e.dispute_id,
    uploadedBy: e.uploaded_by,
    evidenceType: e.evidence_type,
    fileUrl: e.file_url,
    description: e.description,
    createdAt: e.created_at,
  };
}
