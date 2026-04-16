import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';

const VALID_TICKET_TYPES = ['booking_issue', 'payment_issue', 'provider_no_show', 'app_bug', 'account_issue', 'general_inquiry'] as const;
const VALID_STATUSES = ['open', 'in_progress', 'waiting_on_customer', 'waiting_on_provider', 'escalated', 'resolved', 'closed'] as const;
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
  user_first_name?: string;
  user_last_name?: string;
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

interface ListTicketsParams {
  page: number;
  limit: number;
  status?: string;
  type?: string;
  priority?: string;
  assignedAgentId?: string;
}

export async function listTickets(
  params: ListTicketsParams,
): Promise<{ tickets: SupportTicket[]; total: number }> {
  const { page, limit, status, type, priority, assignedAgentId } = params;
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM support_tickets st ${where}`,
    values,
  );

  const result = await db.query<SupportTicket>(
    `SELECT st.*,
            u.phone AS user_phone, u.first_name AS user_first_name, u.last_name AS user_last_name,
            ag.first_name AS agent_first_name, ag.last_name AS agent_last_name,
            (SELECT COUNT(*) FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS message_count
     FROM support_tickets st
     LEFT JOIN users u ON st.user_id = u.id
     LEFT JOIN users ag ON st.assigned_agent_id = ag.id
     ${where}
     ORDER BY
       CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
       st.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset],
  );

  return { tickets: result.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10) };
}

export async function getTicketById(ticketId: string): Promise<SupportTicket | null> {
  const result = await db.query<SupportTicket>(
    `SELECT st.*,
            u.phone AS user_phone, u.first_name AS user_first_name, u.last_name AS user_last_name,
            ag.first_name AS agent_first_name, ag.last_name AS agent_last_name
     FROM support_tickets st
     LEFT JOIN users u ON st.user_id = u.id
     LEFT JOIN users ag ON st.assigned_agent_id = ag.id
     WHERE st.id = $1`,
    [ticketId],
  );
  return result.rows[0] ?? null;
}

export async function getTicketMessages(ticketId: string, includeInternal = true): Promise<TicketMessage[]> {
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
}): Promise<SupportTicket> {
  if (!VALID_TICKET_TYPES.includes(params.type as typeof VALID_TICKET_TYPES[number])) {
    throw createAppError(`Invalid ticket type: ${params.type}`, 400);
  }
  if (!VALID_PRIORITIES.includes(params.priority as typeof VALID_PRIORITIES[number])) {
    throw createAppError(`Invalid priority: ${params.priority}`, 400);
  }
  if (params.subject.length > 200) {
    throw createAppError('Subject must be 200 characters or fewer.', 400);
  }
  if (params.description.length > 5000) {
    throw createAppError('Description must be 5000 characters or fewer.', 400);
  }
  const ticketNumber = await generateTicketNumber();
  const result = await db.query<SupportTicket>(
    `INSERT INTO support_tickets (ticket_number, user_id, type, priority, subject, description, booking_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [ticketNumber, params.userId, params.type, params.priority, params.subject, params.description, params.bookingId ?? null],
  );
  logger.info('Support ticket created', { ticketId: result.rows[0]?.id, ticketNumber });
  const ticket = result.rows[0];
  if (!ticket) throw new Error('Failed to create ticket.');
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
  const result = await db.query<TicketMessage>(
    `INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, message, is_internal_note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.ticketId, params.senderId, params.senderRole, params.message, params.isInternalNote ?? false],
  );

  await db.query(
    `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
    [params.ticketId],
  );

  const msg = result.rows[0];
  if (!msg) throw new Error('Failed to add message.');
  return msg;
}

export async function updateTicketStatus(
  ticketId: string,
  status: string,
  resolutionNotes?: string,
): Promise<SupportTicket> {
  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    throw createAppError(`Invalid ticket status: ${status}`, 400);
  }
  const extras: string[] = ['status = $2', 'updated_at = NOW()'];
  const values: unknown[] = [ticketId, status];
  let idx = 3;

  if (status === 'resolved') {
    extras.push(`resolved_at = NOW()`);
    if (resolutionNotes) {
      extras.push(`resolution_notes = $${idx}`);
      values.push(resolutionNotes);
    }
  }
  if (status === 'closed') {
    extras.push(`closed_at = NOW()`);
  }

  const result = await db.query<SupportTicket>(
    `UPDATE support_tickets SET ${extras.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  logger.info('Support ticket status updated', { ticketId, status });
  const ticket = result.rows[0];
  if (!ticket) throw new Error('Ticket not found.');
  return ticket;
}

export async function assignTicket(
  ticketId: string,
  agentId: string,
): Promise<SupportTicket> {
  const result = await db.query<SupportTicket>(
    `UPDATE support_tickets SET assigned_agent_id = $2,
       status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [ticketId, agentId],
  );
  logger.info('Support ticket assigned', { ticketId, agentId });
  const ticket = result.rows[0];
  if (!ticket) throw new Error('Ticket not found.');
  return ticket;
}

async function generateTicketNumber(): Promise<string> {
  const result = await db.query<{ nextval: string }>(
    `SELECT nextval('support_ticket_seq')`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to generate ticket number.');
  return `TKT-${row.nextval}`;
}
