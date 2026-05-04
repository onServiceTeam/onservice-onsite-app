import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface Ticket {
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
  message_count?: number;
  messages?: TicketMessage[];
}

interface TicketMessage {
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

const TICKET_TYPES = [
  'booking_issue', 'payment_issue', 'provider_no_show',
  'app_bug', 'account_issue', 'general_inquiry',
];

const STATUSES = [
  'open', 'in_progress', 'waiting_on_customer', 'waiting_on_provider',
  'escalated', 'resolved', 'closed',
];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'outline'> = {
  open: 'info',
  in_progress: 'warning',
  waiting_on_customer: 'outline',
  waiting_on_provider: 'outline',
  escalated: 'danger',
  resolved: 'success',
  closed: 'outline',
};

const PRIORITY_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'outline'> = {
  low: 'outline',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SupportTicketsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [error, setError] = useState('');
  const [assignAgentId, setAssignAgentId] = useState('');
  // BUG-PHASE43-01 fix — pre-fix the status-change select fired the
  // mutation immediately, with no resolutionNotes. Transitioning a
  // ticket to 'resolved' or 'closed' without a note leaves an empty
  // audit trail and provides nothing useful for trend analysis or
  // recipient comms. Now: when target status is resolved/closed,
  // open a confirm dialog asking for resolution notes.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const limit = adminConfig.defaultPageSize;

  function handleSelectTicket(ticket: Ticket): void {
    setSelected(ticket);
    setReplyMessage('');
    setIsInternalNote(false);
    setError('');
    setAssignAgentId('');
  }

  function handleBack(): void {
    setSelected(null);
    setReplyMessage('');
    setIsInternalNote(false);
    setError('');
    setAssignAgentId('');
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminSupportTickets', page, statusFilter, typeFilter, priorityFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      const res = await api.get(`/api/v1/support-tickets?${params}`);
      return res.data as { data: Ticket[]; meta: { total: number } };
    },
  });

  const detailQuery = useQuery({
    queryKey: ['adminSupportTicket', selected?.id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/support-tickets/${selected!.id}`);
      return res.data.data as Ticket;
    },
    enabled: !!selected,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, resolutionNotes }: { id: string; status: string; resolutionNotes?: string }) => {
      await api.patch(`/api/v1/support-tickets/${id}/status`, { status, resolutionNotes });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTickets'] });
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTicket'] });
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const replyMutation = useMutation({
    mutationFn: async (params: { ticketId: string; message: string; isInternalNote: boolean }) => {
      await api.post(`/api/v1/support-tickets/${params.ticketId}/messages`, {
        message: params.message,
        isInternalNote: params.isInternalNote,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTicket'] });
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTickets'] });
      setReplyMessage('');
      setIsInternalNote(false);
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, agentId }: { id: string; agentId: string }) => {
      await api.patch(`/api/v1/support-tickets/${id}/assign`, { agentId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTickets'] });
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTicket'] });
      setAssignAgentId('');
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const handleReply = (e: FormEvent): void => {
    e.preventDefault();
    if (!selected || !replyMessage.trim()) return;
    replyMutation.mutate({
      ticketId: selected.id,
      message: replyMessage.trim(),
      isInternalNote,
    });
  };

  const columns: Column<Ticket>[] = [
    { key: 'ticket_number', header: '#', render: (r) => <span className="font-mono text-sm">{r.ticket_number}</span> },
    {
      key: 'priority',
      header: 'Priority',
      render: (r) => <Badge variant={PRIORITY_VARIANTS[r.priority] ?? 'outline'} label={formatLabel(r.priority)} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={STATUS_VARIANTS[r.status] ?? 'outline'} label={formatLabel(r.status)} />,
    },
    { key: 'type', header: 'Type', render: (r) => formatLabel(r.type) },
    { key: 'subject', header: 'Subject', render: (r) => <span className="font-medium">{r.subject}</span> },
    {
      key: 'user',
      header: 'User',
      render: (r) => r.user_first_name ? `${r.user_first_name} ${r.user_last_name ?? ''}`.trim() : r.user_phone ?? '—',
    },
    {
      key: 'messages',
      header: 'Msgs',
      render: (r) => <span className="text-center">{r.message_count ?? 0}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      render: (r) => new Date(r.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          className="text-sm text-[var(--color-primary)] hover:underline"
          onClick={() => handleSelectTicket(r)}
        >
          View
        </button>
      ),
    },
  ];

  if (selected) {
    const ticket = detailQuery.data ?? selected;
    const isDetailLoading = detailQuery.isLoading;
    return (
      <div className="space-y-4">
        <button className="text-sm text-[var(--color-primary)] hover:underline" onClick={handleBack}>
          ← Back to Tickets
        </button>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
        {detailQuery.isError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">Failed to load ticket details.</p>}

        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)]">{ticket.ticket_number}: {ticket.subject}</h2>
              <div className="flex gap-2 mt-2">
                <Badge variant={PRIORITY_VARIANTS[ticket.priority] ?? 'outline'} label={formatLabel(ticket.priority)} />
                <Badge variant={STATUS_VARIANTS[ticket.status] ?? 'outline'} label={formatLabel(ticket.status)} />
                <Badge variant="info" label={formatLabel(ticket.type)} />
              </div>
            </div>
            <div className="flex gap-2">
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <select
                  className="text-sm border border-[var(--color-border)] rounded px-2 py-1 disabled:opacity-50"
                  value=""
                  disabled={updateStatusMutation.isPending}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (!target) return;
                    // For resolved/closed transitions, capture
                    // resolution notes via the confirm dialog (BUG-
                    // PHASE43-01). For other transitions, fire the
                    // mutation directly.
                    if (target === 'resolved' || target === 'closed') {
                      setPendingStatus(target);
                      setResolutionNotes('');
                    } else {
                      updateStatusMutation.mutate({ id: ticket.id, status: target });
                    }
                  }}
                >
                  <option value="">{updateStatusMutation.isPending ? 'Updating...' : 'Change Status'}</option>
                  {STATUSES.filter((s) => s !== ticket.status).map((s) => (
                    <option key={s} value={s}>{formatLabel(s)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="text-sm text-[var(--color-text-secondary)] mb-4 space-y-1">
            <p><strong>User:</strong> {ticket.user_first_name ?? ''} {ticket.user_last_name ?? ''} ({ticket.user_phone ?? '—'})</p>
            <p><strong>Created:</strong> {new Date(ticket.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
            <p><strong>Assigned to:</strong> {ticket.agent_first_name ? `${ticket.agent_first_name} ${ticket.agent_last_name ?? ''}`.trim() : 'Unassigned'}</p>
            {ticket.booking_id && <p><strong>Booking:</strong> {ticket.booking_id}</p>}
            {ticket.resolution_notes && <p className="mt-2"><strong>Resolution:</strong> {ticket.resolution_notes}</p>}
          </div>

          {/* Assign agent */}
          {ticket.status !== 'closed' && (
            <div className="flex gap-2 items-center mb-4">
              <input
                className="border border-[var(--color-border)] rounded px-2 py-1 text-sm flex-1"
                placeholder="Agent user ID to assign"
                value={assignAgentId}
                onChange={(e) => setAssignAgentId(e.target.value)}
              />
              <button
                className="px-3 py-1 bg-[var(--color-primary)] text-white text-sm rounded disabled:opacity-50"
                disabled={!assignAgentId.trim() || assignMutation.isPending}
                onClick={() => assignMutation.mutate({ id: ticket.id, agentId: assignAgentId.trim() })}
              >
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          )}

          <div className="border-t border-[var(--color-border)] pt-4">
            <p className="text-sm text-[var(--color-text-secondary)] mb-2">{ticket.description}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
          <h3 className="text-lg font-semibold mb-4">Messages</h3>
          {isDetailLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-3 border-[var(--color-primary)] border-t-transparent rounded-full" />
            </div>
          ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
            {(ticket.messages ?? []).map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg ${msg.is_internal_note ? 'bg-yellow-50 border border-yellow-200' : 'bg-[var(--color-bg-secondary)]'}`}
              >
                <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
                  <span className="font-medium">
                    {msg.sender_first_name ?? ''} {msg.sender_last_name ?? ''} ({formatLabel(msg.sender_role)})
                    {msg.is_internal_note && <span className="ml-2 text-yellow-600">[Internal Note]</span>}
                  </span>
                  <span>{new Date(msg.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span>
                </div>
                <p className="text-sm">{msg.message}</p>
              </div>
            ))}
            {(ticket.messages ?? []).length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)]">No messages yet.</p>
            )}
          </div>
          )}

          {pendingStatus && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">
                  Mark ticket as {formatLabel(pendingStatus)}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                  {ticket.ticket_number}: {ticket.subject}
                </p>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                  Resolution notes *
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                  placeholder="Explain how this ticket was resolved (min 10 characters) — recorded in audit trail."
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <div className="flex gap-2 justify-end mt-4">
                  <button
                    onClick={() => { setPendingStatus(null); setResolutionNotes(''); }}
                    className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (pendingStatus) {
                        updateStatusMutation.mutate({ id: ticket.id, status: pendingStatus, resolutionNotes });
                        setPendingStatus(null);
                      }
                    }}
                    disabled={updateStatusMutation.isPending || resolutionNotes.trim().length < 10}
                    className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {updateStatusMutation.isPending ? 'Updating...' : `Mark as ${formatLabel(pendingStatus)}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {ticket.status !== 'closed' && (
            <form onSubmit={handleReply} className="border-t border-[var(--color-border)] pt-4">
              <textarea
                className="w-full border border-[var(--color-border)] rounded-lg p-3 text-sm resize-none"
                rows={3}
                maxLength={5000}
                placeholder="Type a reply..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                  <input type="checkbox" checked={isInternalNote} onChange={(e) => setIsInternalNote(e.target.checked)} />
                  Internal note (not visible to user)
                </label>
                <button
                  type="submit"
                  disabled={!replyMessage.trim() || replyMutation.isPending}
                  className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Support Tickets</h1>

      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-2"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-2"
        >
          <option value="">All Types</option>
          {TICKET_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-2"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{formatLabel(p)}</option>)}
        </select>
      </div>

      {isError && <p className="text-red-600 text-sm">Failed to load tickets.</p>}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No support tickets found." />

      {data && (
        <Pagination
          page={page}
          totalPages={Math.ceil((data.meta?.total ?? 0) / limit)}
          total={data.meta?.total ?? 0}
          pageSize={limit}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
