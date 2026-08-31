import api from './api';
import type { ApiResponse } from './api';

// In-app support tickets. The backend (packages/api support-ticket.routes)
// already had create + message + admin endpoints; the owner-scoped GET /mine
// and GET /mine/:id were added so the customer/provider app can show a real
// two-way support thread instead of bouncing the user to a dead mailto link.

export type SupportTicketType =
  | 'booking_issue'
  | 'payment_issue'
  | 'provider_no_show'
  | 'app_bug'
  | 'account_issue'
  | 'general_inquiry';

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'waiting_on_provider'
  | 'escalated'
  | 'resolved'
  | 'closed';

export interface SupportTicket {
  id: string;
  ticket_number: string;
  type: SupportTicketType;
  status: SupportTicketStatus;
  priority: string;
  subject: string;
  description: string;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
  message_count?: string;
  agent_first_name?: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
  sender_first_name?: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportTicketMessage[];
}

export interface CreateTicketPayload {
  type: SupportTicketType;
  subject: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  bookingId?: string;
}

export async function listMyTickets(): Promise<SupportTicket[]> {
  const res = await api.get<ApiResponse<SupportTicket[]>>('/api/v1/support-tickets/mine');
  return res.data.data;
}

export async function getMyTicket(id: string): Promise<SupportTicketDetail> {
  const res = await api.get<ApiResponse<SupportTicketDetail>>(`/api/v1/support-tickets/mine/${id}`);
  return res.data.data;
}

export async function createTicket(payload: CreateTicketPayload): Promise<SupportTicket> {
  const res = await api.post<ApiResponse<SupportTicket>>('/api/v1/support-tickets', payload);
  return res.data.data;
}

export async function addTicketMessage(id: string, message: string): Promise<SupportTicketMessage> {
  const res = await api.post<ApiResponse<SupportTicketMessage>>(
    `/api/v1/support-tickets/${id}/messages`,
    { message },
  );
  return res.data.data;
}

export const SUPPORT_TYPE_LABELS: Record<SupportTicketType, string> = {
  booking_issue: 'Booking issue',
  payment_issue: 'Payment issue',
  provider_no_show: 'Provider no-show',
  app_bug: 'App problem',
  account_issue: 'Account issue',
  general_inquiry: 'General question',
};

// Plain-English status labels for the customer/provider thread header.
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_customer: 'Waiting on you',
  waiting_on_provider: 'Waiting on provider',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function getSupportStatusLabel(status: SupportTicketStatus, viewerRole?: string): string {
  if (status === 'waiting_on_customer') {
    return viewerRole === 'customer' ? 'Waiting on you' : 'Waiting on customer';
  }
  if (status === 'waiting_on_provider') {
    return viewerRole === 'provider' || viewerRole === 'provider_staff'
      ? 'Waiting on you'
      : 'Waiting on provider';
  }
  return SUPPORT_STATUS_LABELS[status] ?? status;
}

// A ticket the user can still reply to (resolved/closed are read-only).
export function isTicketOpen(status: SupportTicketStatus): boolean {
  return status !== 'resolved' && status !== 'closed';
}
