import { randomUUID } from 'crypto';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';

// Provider staff / team members — D23. Phase-1 foundation: the approval state
// machine + CRUD. The state machine is pure and unit-tested; the DB functions
// build on it. App wiring (admin tab, mobile, staff auth) lands in later phases.

export type StaffStatus =
  | 'invited'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'deactivated';

export type StaffAdminDecision = 'approved' | 'rejected' | 'sent_back';

export interface ProviderStaffRow {
  id: string;
  provider_id: string;
  user_id: string | null;
  role_title: string | null;
  status: StaffStatus;
  invited_by: string | null;
  invite_phone: string | null;
  invite_email: string | null;
  invite_token: string | null;
  invite_expires_at: Date | null;
  submitted_for_review_at: Date | null;
  admin_reviewer_id: string | null;
  admin_decision: StaffAdminDecision | null;
  admin_decision_at: Date | null;
  admin_decision_reason: string | null;
  rating: string;
  total_jobs: number;
  total_reviews: number;
  created_at: Date;
  updated_at: Date;
  // Joined from users when the member has accepted (LEFT JOIN in list queries).
  user_full_name?: string | null;
}

// ── Pure state machine (unit-tested) ─────────────────────────────────────────

// Allowed status transitions. The provider owner drives invited→pending_review
// (via the member accepting + submitting); back-office drives the review
// decisions and suspend/reactivate.
export const STAFF_STATUS_TRANSITIONS: Record<StaffStatus, StaffStatus[]> = {
  invited: ['pending_review', 'deactivated'],
  pending_review: ['approved', 'rejected', 'invited', 'deactivated'], // 'invited' = sent back; provider may also cancel
  approved: ['suspended', 'deactivated'],
  rejected: ['pending_review', 'deactivated'], // can re-apply
  suspended: ['approved', 'deactivated'],
  deactivated: [],
};

export function canTransitionStaffStatus(from: StaffStatus, to: StaffStatus): boolean {
  return STAFF_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Map a back-office review decision to the resulting status.
export function statusForDecision(decision: StaffAdminDecision): StaffStatus {
  switch (decision) {
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'sent_back': return 'invited'; // back to the member to re-submit
  }
}

// Only approved members may be assigned jobs / counted as active workers.
export function isAssignable(status: StaffStatus): boolean {
  return status === 'approved';
}

export function formatProviderStaff(s: ProviderStaffRow): Record<string, unknown> {
  return {
    id: s.id,
    providerId: s.provider_id,
    userId: s.user_id,
    userName: s.user_full_name ?? null,
    roleTitle: s.role_title,
    status: s.status,
    invitedBy: s.invited_by,
    invitePhone: s.invite_phone,
    inviteEmail: s.invite_email,
    submittedForReviewAt: s.submitted_for_review_at,
    adminReviewerId: s.admin_reviewer_id,
    adminDecision: s.admin_decision,
    adminDecisionAt: s.admin_decision_at,
    adminDecisionReason: s.admin_decision_reason,
    rating: Number(s.rating),
    totalJobs: s.total_jobs,
    totalReviews: s.total_reviews,
    isAssignable: isAssignable(s.status),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

// ── DB operations ────────────────────────────────────────────────────────────

export async function listStaffByProvider(providerId: string): Promise<ProviderStaffRow[]> {
  const res = await db.query<ProviderStaffRow>(
    `SELECT ps.*, u.full_name AS user_full_name
     FROM provider_staff ps
     LEFT JOIN users u ON u.id = ps.user_id
     WHERE ps.provider_id = $1
     ORDER BY ps.created_at DESC`,
    [providerId],
  );
  return res.rows;
}

export async function getStaffById(staffId: string): Promise<ProviderStaffRow | null> {
  const res = await db.query<ProviderStaffRow>(
    `SELECT * FROM provider_staff WHERE id = $1`,
    [staffId],
  );
  return res.rows[0] ?? null;
}

// Admin list: each member's DTO plus the live per-member performance breakdown
// (computed from real bookings/reviews, not the advisory cached columns).
export async function listStaffWithPerformance(
  providerId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await listStaffByProvider(providerId);
  return Promise.all(
    rows.map(async (r) => ({
      ...formatProviderStaff(r),
      performance: await getStaffPerformance(r.id),
    })),
  );
}

// Provider owner invites a team member (no user account yet).
export async function inviteStaff(params: {
  providerId: string;
  invitedByUserId: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  inviteToken: string;
  inviteExpiresAt: Date;
}): Promise<ProviderStaffRow> {
  if (!params.phone && !params.email) {
    throw createAppError('A phone or email is required to invite a team member.', 400);
  }
  const res = await db.query<ProviderStaffRow>(
    `INSERT INTO provider_staff
       (provider_id, invited_by, role_title, invite_phone, invite_email, invite_token, invite_expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'invited')
     RETURNING *`,
    [
      params.providerId, params.invitedByUserId, params.roleTitle ?? null,
      params.phone ?? null, params.email ?? null, params.inviteToken, params.inviteExpiresAt,
    ],
  );
  return res.rows[0]!;
}

// Provider-facing invite — generates the token + 7-day expiry, then inserts.
export async function createStaffInvite(params: {
  providerId: string;
  invitedByUserId: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
}): Promise<ProviderStaffRow> {
  return inviteStaff({
    ...params,
    inviteToken: randomUUID(),
    inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

// Provider removes a team member (or cancels a pending invite). Validated
// against the state machine; no admin_actions row (this is a provider action,
// not a back-office one).
export async function deactivateStaff(staffId: string): Promise<ProviderStaffRow> {
  const row = await getStaffById(staffId);
  if (!row) throw createAppError('Staff member not found.', 404);
  if (!canTransitionStaffStatus(row.status, 'deactivated')) {
    throw createAppError(`Cannot remove a staff member that is ${row.status}.`, 409);
  }
  const res = await db.query<ProviderStaffRow>(
    `UPDATE provider_staff SET status = 'deactivated', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [staffId],
  );
  return res.rows[0]!;
}

// Provider sends a member to onService back-office for approval
// (invited/rejected → pending_review). Stamps submitted_for_review_at so the
// admin review queue is ordered.
export async function submitStaffForReview(staffId: string): Promise<ProviderStaffRow> {
  const row = await getStaffById(staffId);
  if (!row) throw createAppError('Staff member not found.', 404);
  if (!canTransitionStaffStatus(row.status, 'pending_review')) {
    throw createAppError(`Cannot submit a member that is ${row.status} for review.`, 409);
  }
  const res = await db.query<ProviderStaffRow>(
    `UPDATE provider_staff
       SET status = 'pending_review', submitted_for_review_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [staffId],
  );
  return res.rows[0]!;
}

// Assign (or, with staffId = null, unassign) an approved team member as the
// performer of a booking. Validates that both the booking and the staff member
// belong to the provider and that the member is assignable. Returns the staff
// row (or null when unassigning).
export async function assignStaffToBooking(params: {
  bookingId: string;
  providerId: string;
  staffId: string | null;
}): Promise<ProviderStaffRow | null> {
  return db.transaction(async (client) => {
    const booking = await client.query<{ provider_id: string | null }>(
      `SELECT provider_id FROM bookings WHERE id = $1 FOR UPDATE`,
      [params.bookingId],
    );
    if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
    if (booking.rows[0]!.provider_id !== params.providerId) {
      throw createAppError('This booking is not assigned to your account.', 403);
    }

    if (params.staffId === null) {
      await client.query(
        `UPDATE bookings SET performer_staff_id = NULL WHERE id = $1`,
        [params.bookingId],
      );
      return null;
    }

    const staff = await client.query<ProviderStaffRow>(
      `SELECT * FROM provider_staff WHERE id = $1`,
      [params.staffId],
    );
    const row = staff.rows[0];
    if (!row || row.provider_id !== params.providerId) {
      throw createAppError('Team member not found.', 404);
    }
    if (!isAssignable(row.status)) {
      throw createAppError('Only approved team members can be assigned to jobs.', 409);
    }
    await client.query(
      `UPDATE bookings SET performer_staff_id = $1 WHERE id = $2`,
      [params.staffId, params.bookingId],
    );
    return row;
  });
}

// Back-office decision on a staff member. Validates the transition, then writes
// the new status + an admin_actions audit row in one transaction.
export async function reviewStaff(params: {
  staffId: string;
  adminId: string;
  decision: StaffAdminDecision;
  reason?: string;
}): Promise<ProviderStaffRow> {
  return db.transaction(async (client) => {
    const current = await client.query<ProviderStaffRow>(
      `SELECT * FROM provider_staff WHERE id = $1 FOR UPDATE`,
      [params.staffId],
    );
    const row = current.rows[0];
    if (!row) throw createAppError('Staff member not found.', 404);

    const nextStatus = statusForDecision(params.decision);
    if (!canTransitionStaffStatus(row.status, nextStatus)) {
      throw createAppError(`Cannot ${params.decision} a staff member that is ${row.status}.`, 409);
    }
    if (params.decision === 'rejected' && !params.reason) {
      throw createAppError('A reason is required when rejecting a staff member.', 400);
    }

    const updated = await client.query<ProviderStaffRow>(
      `UPDATE provider_staff
         SET status = $1, admin_decision = $2, admin_reviewer_id = $3,
             admin_decision_at = NOW(), admin_decision_reason = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [nextStatus, params.decision, params.adminId, params.reason ?? null, params.staffId],
    );

    const actionType =
      params.decision === 'approved' ? 'provider_staff_approved'
      : params.decision === 'rejected' ? 'provider_staff_rejected'
      : 'provider_staff_sent_back';
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, $2, 'provider_staff', $3, $4::jsonb)`,
      [params.adminId, actionType, params.staffId, JSON.stringify({ reason: params.reason ?? null })],
    );

    return updated.rows[0]!;
  });
}

// Suspend or reactivate an approved/suspended member (back-office control).
export async function setStaffSuspension(params: {
  staffId: string;
  adminId: string;
  suspend: boolean;
  reason?: string;
}): Promise<ProviderStaffRow> {
  return db.transaction(async (client) => {
    const current = await client.query<ProviderStaffRow>(
      `SELECT * FROM provider_staff WHERE id = $1 FOR UPDATE`,
      [params.staffId],
    );
    const row = current.rows[0];
    if (!row) throw createAppError('Staff member not found.', 404);

    const nextStatus: StaffStatus = params.suspend ? 'suspended' : 'approved';
    if (!canTransitionStaffStatus(row.status, nextStatus)) {
      throw createAppError(`Cannot ${params.suspend ? 'suspend' : 'reactivate'} a staff member that is ${row.status}.`, 409);
    }

    const updated = await client.query<ProviderStaffRow>(
      `UPDATE provider_staff SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [nextStatus, params.staffId],
    );
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, $2, 'provider_staff', $3, $4::jsonb)`,
      [
        params.adminId,
        params.suspend ? 'provider_staff_suspended' : 'provider_staff_reactivated',
        params.staffId,
        JSON.stringify({ reason: params.reason ?? null }),
      ],
    );
    return updated.rows[0]!;
  });
}

// Per-member performance breakdown (advisory). The provider's headline rating
// already includes these jobs via reviews.provider_id; this is the drill-down.
export async function getStaffPerformance(staffId: string): Promise<{
  totalJobs: number;
  totalReviews: number;
  averageRating: number;
}> {
  const res = await db.query<{ total_jobs: string; total_reviews: string; avg_rating: string | null }>(
    `SELECT
       COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') AS total_jobs,
       COUNT(r.id) AS total_reviews,
       AVG(r.rating) AS avg_rating
     FROM provider_staff ps
     LEFT JOIN bookings b ON b.performer_staff_id = ps.id
     LEFT JOIN reviews r ON r.performer_staff_id = ps.id AND r.is_visible = TRUE
     WHERE ps.id = $1`,
    [staffId],
  );
  const row = res.rows[0];
  return {
    totalJobs: Number(row?.total_jobs ?? 0),
    totalReviews: Number(row?.total_reviews ?? 0),
    averageRating: row?.avg_rating ? Number(Number(row.avg_rating).toFixed(2)) : 0,
  };
}
