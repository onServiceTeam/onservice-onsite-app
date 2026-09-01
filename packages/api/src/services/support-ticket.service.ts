import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import { maskPhilippinePhone, maskEmail, type ActorRole } from '../utils/pii-mask';
import * as notificationService from './notification.service';

// MED-N137 fix — role-aware PII masking for support tickets returned
// to admin queries. Pre-fix every admin role saw raw user_phone +
// user_email + user_first_name + user_last_name. Post-fix:
//   - super_admin: raw (audit the read at the route layer if surfaced
//     via a "reveal" affordance).
//   - dpo: masked phone/email but full name when a privacy workflow supplies
//     a ticket record. The support routes themselves reject DPO sessions.
//   - all other admin roles: masked phone/email + last initial only.
// First name is always preserved (needed to greet the customer in
// reply messages).
export function maskTicketForRole<
  T extends {
    user_phone?: string | null;
    user_email?: string | null;
    user_last_name?: string | null;
  },
>(ticket: T, role: ActorRole | null | undefined): T {
  // Only super_admin sees raw; null/undefined defaults to FULL masking
  // (defense in depth — never assume an unknown role is privileged).
  if (role === 'super_admin') return ticket;
  const out: T = { ...ticket };
  if (out.user_phone !== undefined) {
    out.user_phone = maskPhilippinePhone(out.user_phone) as T['user_phone'];
  }
  if (out.user_email !== undefined) {
    out.user_email = maskEmail(out.user_email) as T['user_email'];
  }
  // Last name: keep first letter only for non-super_admin/non-dpo.
  if (role !== 'dpo' && out.user_last_name) {
    out.user_last_name = (out.user_last_name.charAt(0) + '.') as T['user_last_name'];
  }
  return out;
}

const VALID_TICKET_TYPES = [
  'booking_issue',
  'payment_issue',
  'provider_no_show',
  'app_bug',
  'account_issue',
  'general_inquiry',
] as const;
const VALID_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_provider',
  'escalated',
  'resolved',
  'closed',
] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  assigned_agent_id: string | null;
  type: string;
  status: string;
  priority: string;
  subject: string;
  description: string;
  booking_id: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user_phone?: string;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_role?: string;
  provider_id?: string | null;
  provider_business_name?: string | null;
  agent_first_name?: string;
  agent_last_name?: string;
  message_count?: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  is_internal_note: boolean;
  created_at: string;
  sender_first_name?: string;
  sender_last_name?: string;
}

export interface AssignableSupportAgent {
  id: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'super_admin';
}

interface ListTicketsParams {
  page: number;
  limit: number;
  status?: string;
  type?: string;
  priority?: string;
  assignedAgentId?: string;
  search?: string;
  bookingId?: string;
  userId?: string;
  relatedCustomerId?: string;
  relatedProviderId?: string;
  unassigned?: boolean;
  active?: boolean;
}

export interface SupportQueueSummary {
  open: number;
  escalated: number;
  urgent: number;
  unassigned: number;
}

export interface SupportTicketStatusHistoryEntry {
  id: string;
  createdAt: string;
  adminName: string;
  adminRole: string | null;
  previousStatus: string | null;
  nextStatus: string | null;
  previousPriority: string | null;
  nextPriority: string | null;
  workflowNote: string;
  resolutionNotes: string | null;
  decisionSource: 'admin_status_change' | 'participant_reply' | 'admin_priority_change';
}

export async function listTickets(
  params: ListTicketsParams,
): Promise<{ tickets: SupportTicket[]; total: number }> {
  const {
    page, limit, status, type, priority, assignedAgentId, search, bookingId,
    userId, relatedCustomerId, relatedProviderId, unassigned, active,
  } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (status) {
    conditions.push(`st.status = $${idx++}`);
    values.push(status);
  }
  if (type) {
    conditions.push(`st.type = $${idx++}`);
    values.push(type);
  }
  if (priority) {
    conditions.push(`st.priority = $${idx++}`);
    values.push(priority);
  }
  if (assignedAgentId) {
    conditions.push(`st.assigned_agent_id = $${idx++}`);
    values.push(assignedAgentId);
  }
  if (unassigned) {
    conditions.push('st.assigned_agent_id IS NULL');
  }
  if (active) {
    conditions.push("st.status NOT IN ('resolved', 'closed')");
  }
  if (bookingId) {
    conditions.push(`st.booking_id = $${idx++}`);
    values.push(bookingId);
  }
  if (userId) {
    conditions.push(`st.user_id = $${idx++}`);
    values.push(userId);
  }
  if (relatedCustomerId) {
    conditions.push(`(
      st.user_id = $${idx}
      OR EXISTS (
        SELECT 1 FROM bookings linked_customer_booking
         WHERE linked_customer_booking.id = st.booking_id
           AND linked_customer_booking.customer_id = $${idx}
      )
    )`);
    values.push(relatedCustomerId);
    idx += 1;
  }
  if (relatedProviderId) {
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM providers linked_direct_provider
         WHERE linked_direct_provider.id = $${idx}
           AND linked_direct_provider.user_id = st.user_id
      )
      OR EXISTS (
        SELECT 1 FROM provider_staff linked_provider_staff
         WHERE linked_provider_staff.provider_id = $${idx}
           AND linked_provider_staff.user_id = st.user_id
      )
      OR EXISTS (
        SELECT 1 FROM bookings linked_provider_booking
         WHERE linked_provider_booking.id = st.booking_id
           AND linked_provider_booking.provider_id = $${idx}
      )
    )`);
    values.push(relatedProviderId);
    idx += 1;
  }
  if (search) {
    conditions.push(`(
      st.ticket_number ILIKE $${idx}
      OR st.subject ILIKE $${idx}
      OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${idx}
      OR COALESCE(u.phone, '') ILIKE $${idx}
      OR COALESCE(u.email, '') ILIKE $${idx}
      OR COALESCE(direct_provider.business_name, staff_provider.business_name, '') ILIKE $${idx}
    )`);
    values.push(`%${search}%`);
    idx += 1;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const joins = `
    LEFT JOIN users u ON st.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT p.id, p.business_name
        FROM providers p
       WHERE p.user_id = u.id
       ORDER BY p.id
       LIMIT 1
    ) direct_provider ON TRUE
    LEFT JOIN LATERAL (
      SELECT ps.provider_id
        FROM provider_staff ps
       WHERE ps.user_id = u.id
       ORDER BY ps.created_at DESC, ps.id
       LIMIT 1
    ) staff_account ON TRUE
    LEFT JOIN providers staff_provider ON staff_provider.id = staff_account.provider_id`;

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM support_tickets st ${joins} ${where}`,
    values,
  );

  const result = await db.query<SupportTicket>(
    `SELECT st.*,
            u.phone AS user_phone, u.email AS user_email,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            u.role AS user_role,
            COALESCE(direct_provider.id, staff_account.provider_id) AS provider_id,
            COALESCE(direct_provider.business_name, staff_provider.business_name) AS provider_business_name,
            ag.first_name AS agent_first_name, ag.last_name AS agent_last_name,
            (SELECT COUNT(*) FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS message_count
     FROM support_tickets st
     ${joins}
     LEFT JOIN users ag ON st.assigned_agent_id = ag.id
     ${where}
     ORDER BY
       CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
       st.updated_at DESC,
       st.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset],
  );

  return { tickets: result.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10) };
}

export async function getSupportQueueSummary(): Promise<SupportQueueSummary> {
  const result = await db.query<{
    open_count: string;
    escalated_count: string;
    urgent_count: string;
    unassigned_count: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'open')::text AS open_count,
            COUNT(*) FILTER (WHERE status = 'escalated')::text AS escalated_count,
            COUNT(*) FILTER (
              WHERE priority = 'urgent' AND status NOT IN ('resolved', 'closed')
            )::text AS urgent_count,
            COUNT(*) FILTER (
              WHERE assigned_agent_id IS NULL AND status NOT IN ('resolved', 'closed')
            )::text AS unassigned_count
       FROM support_tickets`,
  );
  const row = result.rows[0];
  return {
    open: Number(row?.open_count ?? 0),
    escalated: Number(row?.escalated_count ?? 0),
    urgent: Number(row?.urgent_count ?? 0),
    unassigned: Number(row?.unassigned_count ?? 0),
  };
}

export async function getTicketStatusHistory(
  ticketId: string,
): Promise<SupportTicketStatusHistoryEntry[]> {
  const result = await db.query<{
    id: string;
    created_at: Date | string;
    admin_first_name: string | null;
    admin_last_name: string | null;
    admin_role: string | null;
    previous_status: string | null;
    next_status: string | null;
    previous_priority: string | null;
    next_priority: string | null;
    action: string;
    workflow_note: string | null;
    resolution_notes: string | null;
  }>(
    `SELECT al.id, al.created_at, al.action,
            actor.first_name AS admin_first_name,
            actor.last_name AS admin_last_name,
            actor.role AS admin_role,
            al.old_values->>'status' AS previous_status,
            al.new_values->>'status' AS next_status,
            al.old_values->>'priority' AS previous_priority,
            al.new_values->>'priority' AS next_priority,
            al.new_values->>'workflowNote' AS workflow_note,
            al.new_values->>'resolutionNotes' AS resolution_notes
       FROM audit_log al
       LEFT JOIN users actor ON actor.id = al.user_id
      WHERE al.entity_type = 'support_ticket'
        AND al.entity_id = $1
        AND al.action IN (
          'support_ticket_status_updated',
          'support_ticket_status_resumed_by_reply',
          'support_ticket_priority_updated'
        )
      ORDER BY al.created_at DESC
      LIMIT 100`,
    [ticketId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    adminName: [row.admin_first_name, row.admin_last_name].filter(Boolean).join(' ').trim() || 'Unknown admin',
    adminRole: row.admin_role,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    previousPriority: row.previous_priority,
    nextPriority: row.next_priority,
    workflowNote: row.workflow_note ?? '',
    resolutionNotes: row.resolution_notes,
    decisionSource: row.action === 'support_ticket_status_resumed_by_reply'
      ? 'participant_reply'
      : row.action === 'support_ticket_priority_updated'
        ? 'admin_priority_change'
        : 'admin_status_change',
  }));
}

// Owner-scoped list — a customer/provider seeing only their OWN tickets.
// Pre-fix the app had no way to do this: the admin list at GET / is
// rbac-gated, so a user could create a ticket but never see it again. This
// powers the in-app "My support requests" inbox. message_count excludes
// internal notes (the customer must never see the admin's private count).
export async function listMyTickets(params: {
  userId: string;
  page: number;
  limit: number;
  status?: string;
}): Promise<{ tickets: SupportTicket[]; total: number }> {
  const { userId, page, limit, status } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = ['st.user_id = $1'];
  const values: unknown[] = [userId];
  let idx = 2;
  if (status) {
    conditions.push(`st.status = $${idx++}`);
    values.push(status);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM support_tickets st ${where}`,
    values,
  );

  const result = await db.query<SupportTicket>(
    `SELECT st.*,
            ag.first_name AS agent_first_name, ag.last_name AS agent_last_name,
            (SELECT COUNT(*) FROM support_ticket_messages stm
               WHERE stm.ticket_id = st.id AND stm.is_internal_note = false) AS message_count
     FROM support_tickets st
     LEFT JOIN users ag ON st.assigned_agent_id = ag.id
     ${where}
     ORDER BY st.updated_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset],
  );

  return { tickets: result.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10) };
}

export async function getTicketById(ticketId: string): Promise<SupportTicket | null> {
  const result = await db.query<SupportTicket>(
    `SELECT st.*,
            u.phone AS user_phone, u.email AS user_email,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            u.role AS user_role,
            COALESCE(direct_provider.id, staff_account.provider_id) AS provider_id,
            COALESCE(direct_provider.business_name, staff_provider.business_name) AS provider_business_name,
            ag.first_name AS agent_first_name, ag.last_name AS agent_last_name
     FROM support_tickets st
     LEFT JOIN users u ON st.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT p.id, p.business_name
         FROM providers p
        WHERE p.user_id = u.id
        ORDER BY p.id
        LIMIT 1
     ) direct_provider ON TRUE
     LEFT JOIN LATERAL (
       SELECT ps.provider_id
         FROM provider_staff ps
        WHERE ps.user_id = u.id
        ORDER BY ps.created_at DESC, ps.id
        LIMIT 1
     ) staff_account ON TRUE
     LEFT JOIN providers staff_provider ON staff_provider.id = staff_account.provider_id
     LEFT JOIN users ag ON st.assigned_agent_id = ag.id
     WHERE st.id = $1`,
    [ticketId],
  );
  return result.rows[0] ?? null;
}

export async function listAssignableAgents(): Promise<AssignableSupportAgent[]> {
  const result = await db.query<AssignableSupportAgent>(
    `SELECT id, first_name, last_name, role
       FROM users
      WHERE is_active = TRUE
        AND role IN ('admin', 'super_admin')
      ORDER BY first_name, last_name, id`,
  );
  return result.rows;
}

export async function getTicketMessages(
  ticketId: string,
  includeInternal = true,
): Promise<TicketMessage[]> {
  const internalFilter = includeInternal ? '' : ' AND stm.is_internal_note = false';
  const result = await db.query<TicketMessage>(
    `SELECT stm.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name
     FROM support_ticket_messages stm
     LEFT JOIN users u ON stm.sender_id = u.id
     WHERE stm.ticket_id = $1${internalFilter}
     ORDER BY stm.created_at ASC`,
    [ticketId],
  );
  return result.rows;
}

export async function createTicket(params: {
  userId: string;
  type: string;
  priority: string;
  subject: string;
  description: string;
  bookingId?: string;
  // MED-N135 fix — when admin creates a ticket on behalf of a user
  // (or system creates one from a webhook), capture the acting admin
  // for the audit trail. Optional for back-compat.
  createdByAdminId?: string;
}): Promise<SupportTicket> {
  if (!VALID_TICKET_TYPES.includes(params.type as (typeof VALID_TICKET_TYPES)[number])) {
    throw createAppError(`Invalid ticket type: ${params.type}`, 400);
  }
  if (!VALID_PRIORITIES.includes(params.priority as (typeof VALID_PRIORITIES)[number])) {
    throw createAppError(`Invalid priority: ${params.priority}`, 400);
  }
  if (params.subject.length > 200) {
    throw createAppError('Subject must be 200 characters or fewer.', 400);
  }
  if (params.description.length > 5000) {
    throw createAppError('Description must be 5000 characters or fewer.', 400);
  }

  const subject = params.subject.trim();
  const description = params.description.trim();
  if (subject.length < 3) {
    throw createAppError('Subject must be at least 3 characters.', 400);
  }
  if (description.length < 5) {
    throw createAppError('Description must be at least 5 characters.', 400);
  }

  // A support case is an account record. Validate the owner before consuming
  // a ticket number or entering the insert transaction. For booking-linked
  // cases, the booking must belong to that customer, provider owner, or the
  // provider staff member assigned to perform it.
  const userResult = await db.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [params.userId],
  );
  if (!userResult.rows[0]) {
    throw createAppError('Support ticket account not found.', 404);
  }

  if (params.bookingId) {
    const bookingResult = await db.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM bookings b
           LEFT JOIN providers p ON p.id = b.provider_id
           LEFT JOIN provider_staff ps ON ps.id = b.performer_staff_id
          WHERE b.id = $1
            AND (
              b.customer_id = $2
              OR p.user_id = $2
              OR ps.user_id = $2
            )
       ) AS allowed`,
      [params.bookingId, params.userId],
    );
    if (bookingResult.rows[0]?.allowed !== true) {
      throw createAppError('Booking not found for this account.', 404);
    }
  }
  const ticketNumber = await generateTicketNumber();

  // MED-N135 fix — wrap INSERT + (optional) admin_actions audit in trx.
  const ticket = await db.transaction(async (client) => {
    const result = await client.query<SupportTicket>(
      `INSERT INTO support_tickets (ticket_number, user_id, type, priority, subject, description, booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        ticketNumber,
        params.userId,
        params.type,
        params.priority,
        subject,
        description,
        params.bookingId ?? null,
      ],
    );
    if (result.rows.length === 0) throw new Error('Failed to create ticket.');
    if (params.createdByAdminId && params.createdByAdminId !== params.userId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'support_ticket', $2, $3::jsonb)`,
        [
          params.createdByAdminId,
          result.rows[0]!.id,
          JSON.stringify({
            op: 'create_on_behalf_of_user',
            ticketNumber,
            forUserId: params.userId,
            type: params.type,
            priority: params.priority,
          }),
        ],
      );
    }
    return result.rows[0]!;
  });

  logger.info('Support ticket created', { ticketId: ticket.id, ticketNumber });
  return ticket;
}

export async function addMessage(params: {
  ticketId: string;
  senderId: string;
  senderRole: string;
  message: string;
  isInternalNote?: boolean;
}): Promise<TicketMessage> {
  if (params.message.length > 5000) {
    throw createAppError('Message must be 5000 characters or fewer.', 400);
  }
  const message = params.message.trim();
  if (!message) {
    throw createAppError('Message is required.', 400);
  }

  // MED-N136 fix — INSERT message + UPDATE ticket timestamp in single
  // trx. Pre-fix the two queries were separate; if the UPDATE failed
  // after the INSERT committed, the ticket's updated_at was stale and
  // affected sort order in conversation listings + "new message"
  // notification ordering.
  const outcome = await db.transaction(async (client) => {
    const ticketResult = await client.query<{
      status: string;
      assigned_agent_id: string | null;
      user_id: string;
      ticket_number: string;
      booking_id: string | null;
    }>(
      `SELECT status, assigned_agent_id, user_id, ticket_number, booking_id
         FROM support_tickets
        WHERE id = $1
        FOR UPDATE`,
      [params.ticketId],
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) throw createAppError('Ticket not found.', 404);

    const isUserReply = params.senderRole === 'customer' || params.senderRole === 'provider';
    const isTerminal = ticket.status === 'resolved' || ticket.status === 'closed';
    if (isTerminal && (isUserReply || !params.isInternalNote)) {
      throw createAppError(
        isUserReply
          ? 'This support request is closed. Start a new request if you still need help.'
          : 'Reopen this support request before sending a participant-visible reply.',
        409,
      );
    }

    const result = await client.query<TicketMessage>(
      `INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, message, is_internal_note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        params.ticketId,
        params.senderId,
        params.senderRole,
        message,
        params.isInternalNote ?? false,
      ],
    );
    const shouldResume =
      isUserReply &&
      (ticket.status === 'waiting_on_customer' || ticket.status === 'waiting_on_provider');
    if (shouldResume) {
      const nextStatus = ticket.assigned_agent_id ? 'in_progress' : 'open';
      await client.query(
        `UPDATE support_tickets
            SET status = $2, updated_at = NOW()
          WHERE id = $1`,
        [params.ticketId, nextStatus],
      );
      await client.query(
        `INSERT INTO audit_log
           (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, 'support_ticket_status_resumed_by_reply', 'support_ticket', $2, $3::jsonb, $4::jsonb)`,
        [
          params.senderId,
          params.ticketId,
          JSON.stringify({ status: ticket.status, assignedAgentId: ticket.assigned_agent_id }),
          JSON.stringify({
            status: nextStatus,
            assignedAgentId: ticket.assigned_agent_id,
            workflowNote: `${params.senderRole} reply resumed the support case.`,
          }),
        ],
      );
    } else {
      await client.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [
        params.ticketId,
      ]);
    }
    const msg = result.rows[0];
    if (!msg) throw new Error('Failed to add message.');
    return {
      message: msg,
      participantNotification: !isUserReply && !params.isInternalNote && params.senderId !== ticket.user_id
        ? {
            userId: ticket.user_id,
            ticketNumber: ticket.ticket_number,
            bookingId: ticket.booking_id,
          }
        : null,
    };
  });

  if (outcome.participantNotification) {
    const { userId, ticketNumber, bookingId } = outcome.participantNotification;
    try {
      await notificationService.createPushNotification({
        userId,
        type: 'support_update',
        title: `Support update: ${ticketNumber}`,
        body: 'A support agent replied to your request. Open the case to read the update.',
        data: { ticketId: params.ticketId, ticketNumber, ...(bookingId ? { bookingId } : {}) },
      });
    } catch (error) {
      // The message is already durable. Keep the reply successful and leave an
      // observable operations signal if the separate notification write fails.
      logger.warn('Support reply notification failed after durable message commit', {
        ticketId: params.ticketId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return outcome.message;
}

export async function updateTicketStatus(
  ticketId: string,
  status: string,
  resolutionNotes?: string,
  audit?: { adminId: string; workflowNote: string },
): Promise<SupportTicket> {
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    throw createAppError(`Invalid ticket status: ${status}`, 400);
  }
  // BUG-PHASE154-01 fix — pre-fix resolution_notes had no server cap.
  // Same defense-in-depth pattern as Phase 152/153. resolution_notes
  // is admin-supplied at status='resolved' transition; an unbounded
  // value would persist to the TEXT column and surface in admin
  // ticket detail (and customer-facing ticket history). Cap at
  // 5000 to mirror the description cap on the same table — both
  // are TEXT and similarly free-form.
  if (resolutionNotes !== undefined && typeof resolutionNotes !== 'string') {
    throw createAppError('resolutionNotes must be a string.', 400);
  }
  if (typeof resolutionNotes === 'string' && resolutionNotes.length > 5000) {
    throw createAppError('resolutionNotes must be 5000 characters or fewer.', 400);
  }
  const normalizedResolutionNotes = resolutionNotes?.trim();
  if (
    (status === 'resolved' || status === 'closed') &&
    (normalizedResolutionNotes?.length ?? 0) < 10
  ) {
    throw createAppError('Resolution notes must be at least 10 characters.', 400);
  }
  const workflowNote = audit?.workflowNote?.trim();
  if (audit && (workflowNote?.length ?? 0) < 10) {
    throw createAppError('A workflow note of at least 10 characters is required.', 400);
  }
  if (workflowNote && workflowNote.length > 5000) {
    throw createAppError('Workflow note must be 5000 characters or fewer.', 400);
  }
  const extras: string[] = ['status = $2', 'updated_at = NOW()'];
  const values: unknown[] = [ticketId, status];
  let idx = 3;

  if (status === 'resolved') {
    extras.push('resolved_at = NOW()', 'closed_at = NULL');
  }
  if (status === 'closed') {
    extras.push(`closed_at = NOW()`);
  }
  if (status !== 'resolved' && status !== 'closed') {
    extras.push('resolved_at = NULL', 'closed_at = NULL', 'resolution_notes = NULL');
  }
  if ((status === 'resolved' || status === 'closed') && normalizedResolutionNotes) {
    extras.push(`resolution_notes = $${idx}`);
    values.push(normalizedResolutionNotes);
  }

  const persist = async (executor: Pick<typeof db, 'query'>): Promise<SupportTicket> => {
    const result = await executor.query<SupportTicket>(
      `UPDATE support_tickets SET ${extras.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    const ticket = result.rows[0];
    if (!ticket) throw createAppError('Ticket not found.', 404);
    return ticket;
  };

  const ticket = audit
    ? await db.transaction(async (client) => {
      const currentResult = await client.query<{
        status: string;
        assigned_agent_id: string | null;
        resolution_notes: string | null;
        user_role: string;
      }>(
        `SELECT st.status, st.assigned_agent_id, st.resolution_notes, u.role AS user_role
           FROM support_tickets st
           JOIN users u ON u.id = st.user_id
          WHERE st.id = $1
          FOR UPDATE`,
        [ticketId],
      );
      const current = currentResult.rows[0];
      if (!current) throw createAppError('Ticket not found.', 404);
      if (current.status === status) throw createAppError('Ticket already has that status.', 409);
      const providerOwned = current.user_role === 'provider' || current.user_role === 'provider_staff';
      if (status === 'waiting_on_customer' && current.user_role !== 'customer') {
        throw createAppError('Only a customer-owned case can wait on a customer reply.', 400);
      }
      if (status === 'waiting_on_provider' && !providerOwned) {
        throw createAppError('Only a provider-owned case can wait on a provider reply.', 400);
      }

      const updated = await persist(client);
      await client.query(
        `INSERT INTO audit_log
           (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, 'support_ticket_status_updated', 'support_ticket', $2, $3::jsonb, $4::jsonb)`,
        [
          audit.adminId,
          ticketId,
          JSON.stringify({
            status: current.status,
            assignedAgentId: current.assigned_agent_id,
            resolutionNotes: current.resolution_notes,
          }),
          JSON.stringify({
            status,
            assignedAgentId: updated.assigned_agent_id,
            resolutionNotes: updated.resolution_notes,
            workflowNote,
          }),
        ],
      );
      return updated;
    })
    : await persist(db);
  logger.info('Support ticket status updated', { ticketId, status });
  return ticket;
}

export async function updateTicketPriority(
  ticketId: string,
  priority: string,
  audit: { adminId: string; workflowNote: string },
): Promise<SupportTicket> {
  if (!VALID_PRIORITIES.includes(priority as (typeof VALID_PRIORITIES)[number])) {
    throw createAppError(`Invalid ticket priority: ${priority}`, 400);
  }
  const workflowNote = audit.workflowNote.trim();
  if (workflowNote.length < 10 || workflowNote.length > 5000) {
    throw createAppError('Priority workflow note must be 10 to 5000 characters.', 400);
  }

  const ticket = await db.transaction(async (client) => {
    const currentResult = await client.query<{ priority: string; status: string }>(
      `SELECT priority, status
         FROM support_tickets
        WHERE id = $1
        FOR UPDATE`,
      [ticketId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Ticket not found.', 404);
    if (current.status === 'resolved' || current.status === 'closed') {
      throw createAppError('Reopen this support request before changing its priority.', 409);
    }
    if (current.priority === priority) {
      throw createAppError('Ticket already has that priority.', 409);
    }

    const updated = await client.query<SupportTicket>(
      `UPDATE support_tickets
          SET priority = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [ticketId, priority],
    );
    const row = updated.rows[0];
    if (!row) throw createAppError('Ticket not found.', 404);

    await client.query(
      `INSERT INTO audit_log
         (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'support_ticket_priority_updated', 'support_ticket', $2, $3::jsonb, $4::jsonb)`,
      [
        audit.adminId,
        ticketId,
        JSON.stringify({ priority: current.priority }),
        JSON.stringify({ priority, workflowNote }),
      ],
    );
    return row;
  });
  logger.info('Support ticket priority updated', { ticketId, priority, adminId: audit.adminId });
  return ticket;
}

export async function assignTicket(
  ticketId: string,
  agentId: string,
  assignedByAdminId: string,
): Promise<SupportTicket> {
  return db.transaction(async (client) => {
    const currentResult = await client.query<{
      assigned_agent_id: string | null;
      status: string;
    }>(
      `SELECT assigned_agent_id, status
         FROM support_tickets
        WHERE id = $1
        FOR UPDATE`,
      [ticketId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Ticket not found.', 404);
    if (current.status === 'resolved' || current.status === 'closed') {
      throw createAppError('Reopen this support request before changing its owner.', 409);
    }
    if (current.assigned_agent_id === agentId) {
      throw createAppError('This support request is already assigned to that agent.', 409);
    }

    const agent = await client.query<{ id: string }>(
      `SELECT id FROM users
        WHERE id = $1
          AND is_active = TRUE
          AND role IN ('admin', 'super_admin')`,
      [agentId],
    );
    if (!agent.rows[0]) {
      throw createAppError('Selected support agent is not active or assignable.', 400);
    }

    const result = await client.query<SupportTicket>(
      `UPDATE support_tickets SET assigned_agent_id = $2,
         status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [ticketId, agentId],
    );
    const ticket = result.rows[0];
    if (!ticket) throw createAppError('Ticket not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'config_changed', 'support_ticket', $2, $3::jsonb)`,
      [
        assignedByAdminId,
        ticketId,
        JSON.stringify({
          op: 'support_ticket_assigned',
          previousAgentId: current.assigned_agent_id,
          assignedAgentId: agentId,
          previousStatus: current.status,
          nextStatus: current.status === 'open' ? 'in_progress' : current.status,
        }),
      ],
    );

    logger.info('Support ticket assigned', { ticketId, agentId, assignedByAdminId });
    return ticket;
  });
}

async function generateTicketNumber(): Promise<string> {
  const result = await db.query<{ nextval: string }>(`SELECT nextval('support_ticket_seq')`);
  const row = result.rows[0];
  if (!row) throw new Error('Failed to generate ticket number.');
  return `TKT-${row.nextval}`;
}
