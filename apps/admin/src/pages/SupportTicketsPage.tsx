import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
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
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_role?: string;
  provider_id?: string | null;
  provider_business_name?: string | null;
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

interface SupportAgent {
  id: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'super_admin';
}

const TICKET_TYPES = [
  'booking_issue',
  'payment_issue',
  'provider_no_show',
  'app_bug',
  'account_issue',
  'general_inquiry',
];

const STATUSES = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_provider',
  'escalated',
  'resolved',
  'closed',
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

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseOption(value: string | null, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : '';
}

function isProviderTicket(ticket: Ticket): boolean {
  return ticket.user_role === 'provider' || ticket.user_role === 'provider_staff';
}

function ticketPersonaLabel(ticket: Ticket): string {
  if (ticket.user_role === 'provider_staff') return 'Provider staff';
  if (ticket.user_role === 'provider') return 'Provider';
  return 'Customer';
}

function ticketAccountPath(ticket: Ticket): string | null {
  if (isProviderTicket(ticket)) {
    return ticket.provider_id ? `/providers/${ticket.provider_id}` : null;
  }
  return `/customers/${ticket.user_id}`;
}

function ticketUserName(ticket: Ticket): string {
  const personName = `${ticket.user_first_name ?? ''} ${ticket.user_last_name ?? ''}`.trim();
  if (ticket.provider_business_name) {
    return personName
      ? `${ticket.provider_business_name} · ${personName}`
      : ticket.provider_business_name;
  }
  return personName || ticket.user_phone || 'Unknown account';
}

export default function SupportTicketsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseOption(searchParams.get('status'), STATUSES);
  const typeFilter = parseOption(searchParams.get('type'), TICKET_TYPES);
  const priorityFilter = parseOption(searchParams.get('priority'), PRIORITIES);
  const searchFilter = (searchParams.get('search') ?? '').trim();
  const bookingFilter = searchParams.get('bookingId') ?? '';
  const userFilter = searchParams.get('userId') ?? '';
  const [selectedOverride, setSelectedOverride] = useState('');
  const selectedId = searchParams.get('ticketId') ?? selectedOverride;
  const createRequested = searchParams.get('new') === '1' && !!userFilter;
  const newUserName = searchParams.get('userName') ?? 'Selected account';
  const newUserRole = searchParams.get('userRole') ?? 'customer';
  const [searchDraft, setSearchDraft] = useState(searchFilter);
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
  const [newTicketType, setNewTicketType] = useState(
    parseOption(searchParams.get('type'), TICKET_TYPES) || 'general_inquiry',
  );
  const [newTicketPriority, setNewTicketPriority] = useState('medium');
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketDescription, setNewTicketDescription] = useState('');
  const limit = adminConfig.defaultPageSize;

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
  }

  function setFilter(key: 'status' | 'type' | 'priority', value: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (value) params.set(key, value);
      else params.delete(key);
      return params;
    });
  }

  function handleSelectTicket(ticket: Ticket): void {
    setSelectedOverride(ticket.id);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('ticketId', ticket.id);
      params.delete('new');
      return params;
    });
    setReplyMessage('');
    setIsInternalNote(false);
    setError('');
    setAssignAgentId('');
  }

  function handleBack(): void {
    setSelectedOverride('');
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('ticketId');
      params.delete('new');
      return params;
    });
    setReplyMessage('');
    setIsInternalNote(false);
    setError('');
    setAssignAgentId('');
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'adminSupportTickets',
      page,
      statusFilter,
      typeFilter,
      priorityFilter,
      searchFilter,
      bookingFilter,
      userFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (searchFilter) params.set('search', searchFilter);
      if (bookingFilter) params.set('bookingId', bookingFilter);
      if (userFilter) params.set('userId', userFilter);
      const res = await api.get(`/api/v1/support-tickets?${params}`);
      return res.data as { data: Ticket[]; meta: { total: number } };
    },
  });

  const agentsQuery = useQuery({
    queryKey: ['adminSupportAgents'],
    queryFn: async () => {
      const res = await api.get('/api/v1/support-tickets/agents');
      return res.data.data as SupportAgent[];
    },
  });

  const detailQuery = useQuery({
    queryKey: ['adminSupportTicket', selectedId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/support-tickets/${selectedId}`);
      return res.data.data as Ticket;
    },
    enabled: !!selectedId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      resolutionNotes,
    }: {
      id: string;
      status: string;
      resolutionNotes?: string;
    }) => {
      await api.patch(`/api/v1/support-tickets/${id}/status`, {
        status,
        ...(resolutionNotes ? { resolutionNotes: resolutionNotes.trim() } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTickets'] });
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTicket'] });
      setError('');
      // Close the confirm dialog ONLY after the status update actually
      // succeeds — so a failure keeps the dialog open with the error visible.
      setPendingStatus(null);
      setResolutionNotes('');
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

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/support-tickets/admin', {
        userId: userFilter,
        type: newTicketType,
        priority: newTicketPriority,
        subject: newTicketSubject.trim(),
        description: newTicketDescription.trim(),
        ...(bookingFilter ? { bookingId: bookingFilter } : {}),
      });
      return res.data.data as Ticket;
    },
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ['adminSupportTickets'] });
      setError('');
      setSelectedOverride(ticket.id);
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.delete('new');
        params.set('ticketId', ticket.id);
        return params;
      });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const handleReply = (e: FormEvent): void => {
    e.preventDefault();
    if (!selectedId || !replyMessage.trim()) return;
    replyMutation.mutate({
      ticketId: selectedId,
      message: replyMessage.trim(),
      isInternalNote,
    });
  };

  const columns: Column<Ticket>[] = [
    {
      key: 'ticket_number',
      header: '#',
      render: (r) => <span className="font-mono text-sm">{r.ticket_number}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (r) => (
        <Badge
          variant={PRIORITY_VARIANTS[r.priority] ?? 'outline'}
          label={formatLabel(r.priority)}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={STATUS_VARIANTS[r.status] ?? 'outline'} label={formatLabel(r.status)} />
      ),
    },
    { key: 'type', header: 'Type', render: (r) => formatLabel(r.type) },
    {
      key: 'subject',
      header: 'Subject',
      render: (r) => <span className="font-medium">{r.subject}</span>,
    },
    {
      key: 'user',
      header: 'User',
      render: (r) => {
        const accountPath = ticketAccountPath(r);
        return (
        <div>
          {accountPath ? (
            <Link className="block font-medium text-[var(--color-primary)] hover:underline" to={accountPath}>
              {ticketUserName(r)}
            </Link>
          ) : (
            <span className="block font-medium text-[var(--color-text)]">{ticketUserName(r)}</span>
          )}
          <span className="text-xs text-[var(--color-text-tertiary)]">{ticketPersonaLabel(r)}</span>
        </div>
        );
      },
    },
    {
      key: 'owner',
      header: 'Case owner',
      render: (r) =>
        r.agent_first_name
          ? `${r.agent_first_name} ${r.agent_last_name ?? ''}`.trim()
          : <span className="font-medium text-orange-700">Unassigned</span>,
    },
    {
      key: 'messages',
      header: 'Msgs',
      render: (r) => <span className="text-center">{r.message_count ?? 0}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      render: (r) =>
        new Date(r.created_at).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          type="button"
          className="text-sm text-[var(--color-primary)] hover:underline"
          onClick={() => handleSelectTicket(r)}
        >
          View
        </button>
      ),
    },
  ];

  const visibleTickets = data?.data ?? [];
  const openOnPage = visibleTickets.filter((ticket) => ticket.status === 'open').length;
  const escalatedOnPage = visibleTickets.filter((ticket) => ticket.status === 'escalated').length;
  const urgentOnPage = visibleTickets.filter((ticket) => ticket.priority === 'urgent').length;
  const unassignedOnPage = visibleTickets.filter((ticket) => !ticket.assigned_agent_id).length;

  if (createRequested) {
    const accountKind = newUserRole === 'provider_staff'
      ? 'provider staff account'
      : `${newUserRole} account`;
    const canSubmit =
      newTicketSubject.trim().length >= 3 &&
      newTicketDescription.trim().length >= 5 &&
      !createTicketMutation.isPending;

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <button
          type="button"
          className="min-h-11 text-sm font-semibold text-[var(--color-primary)] hover:underline"
          onClick={handleBack}
        >
          ← Back to support queue
        </button>

        <form
          className="space-y-5 rounded-lg border border-[var(--color-border)] bg-white p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) createTicketMutation.mutate();
          }}
        >
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
              Agent-created case
            </p>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Create support request</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Open this case for <strong>{newUserName}</strong> ({accountKind}). The case is owned
              by their account, and your admin identity is recorded in the audit trail.
            </p>
            {bookingFilter && (
              <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Linked booking: <span className="font-mono">{bookingFilter}</span>
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[var(--color-text)]">
              Case type
              <select
                aria-label="New support case type"
                value={newTicketType}
                onChange={(event) => setNewTicketType(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"
              >
                {TICKET_TYPES.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[var(--color-text)]">
              Priority
              <select
                aria-label="New support case priority"
                value={newTicketPriority}
                onChange={(event) => setNewTicketPriority(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"
              >
                {PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-[var(--color-text)]">
            Subject
            <input
              aria-label="New support case subject"
              value={newTicketSubject}
              onChange={(event) => setNewTicketSubject(event.target.value)}
              minLength={3}
              maxLength={200}
              className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal"
              placeholder="What does this account need help with?"
            />
          </label>

          <label className="block text-sm font-semibold text-[var(--color-text)]">
            Original report
            <textarea
              aria-label="New support case description"
              value={newTicketDescription}
              onChange={(event) => setNewTicketDescription(event.target.value)}
              minLength={5}
              maxLength={5000}
              rows={7}
              className="mt-1.5 w-full rounded-md border border-[var(--color-border)] p-3 font-normal"
              placeholder="Record what the user reported, the channel they used, and the help they requested."
            />
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleBack} className="min-h-11 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} className="min-h-11 rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">
              {createTicketMutation.isPending ? 'Creating…' : 'Create case'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (selectedId) {
    const fallbackTicket = visibleTickets.find((candidate) => candidate.id === selectedId);
    const ticket = detailQuery.data ?? fallbackTicket;
    if (!ticket) {
      return (
        <div className="space-y-4">
          <button type="button" className="min-h-11 text-sm font-semibold text-[var(--color-primary)] hover:underline" onClick={handleBack}>
            ← Back to support queue
          </button>
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-text-secondary)]">
            {detailQuery.isError ? 'Failed to load ticket details.' : 'Loading support case…'}
          </div>
        </div>
      );
    }
    const isDetailLoading = detailQuery.isLoading;
    const statusNeedsResolution = pendingStatus === 'resolved' || pendingStatus === 'closed';
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="min-h-11 text-sm font-semibold text-[var(--color-primary)] hover:underline"
          onClick={handleBack}
        >
          ← Back to support queue
        </button>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2"
          >
            {error}
          </p>
        )}
        {detailQuery.isError && (
          <p
            role="alert"
            className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2"
          >
            Failed to load ticket details.
          </p>
        )}

        <div className="rounded-lg border border-[var(--color-border)] bg-white p-5 sm:p-6">
          <div className="mb-5 flex flex-col items-start justify-between gap-4 xl:flex-row">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                Support case workspace
              </p>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">
                {ticket.ticket_number}: {ticket.subject}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  variant={PRIORITY_VARIANTS[ticket.priority] ?? 'outline'}
                  label={formatLabel(ticket.priority)}
                />
                <Badge
                  variant={STATUS_VARIANTS[ticket.status] ?? 'outline'}
                  label={formatLabel(ticket.status)}
                />
                <Badge variant="info" label={formatLabel(ticket.type)} />
              </div>
            </div>
            <div className="flex gap-2">
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <select
                  className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-semibold disabled:opacity-50"
                  value=""
                  aria-label="Change support ticket status"
                  disabled={updateStatusMutation.isPending}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (!target) return;
                    setPendingStatus(target);
                    setResolutionNotes('');
                  }}
                >
                  <option value="">
                    {updateStatusMutation.isPending ? 'Updating...' : 'Change Status'}
                  </option>
                  {STATUSES.filter((s) => s !== ticket.status).map((s) => (
                    <option key={s} value={s}>
                      {formatLabel(s)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="mb-4 grid gap-3 rounded-md bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-secondary)] md:grid-cols-2 xl:grid-cols-4">
            <p>
              <strong className="block text-xs uppercase tracking-wide">{ticketPersonaLabel(ticket)}</strong>{' '}
              {ticketAccountPath(ticket) ? (
                <Link
                  className="font-semibold text-[var(--color-primary)] hover:underline"
                  to={ticketAccountPath(ticket)!}
                >
                  {ticketUserName(ticket)}
                </Link>
              ) : (
                <span className="font-semibold text-[var(--color-text)]">{ticketUserName(ticket)}</span>
              )}
              <br />
              {ticket.user_phone ?? ticket.user_email ?? 'Contact masked'}
            </p>
            <p>
              <strong>Created:</strong>{' '}
              {new Date(ticket.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
            </p>
            <p>
              <strong>Assigned to:</strong>{' '}
              {ticket.agent_first_name
                ? `${ticket.agent_first_name} ${ticket.agent_last_name ?? ''}`.trim()
                : 'Unassigned'}
            </p>
            {ticket.booking_id ? (
              <p>
                <strong className="block text-xs uppercase tracking-wide">Related booking</strong>{' '}
                <Link
                  className="font-mono font-semibold text-[var(--color-primary)] hover:underline"
                  to={`/bookings/${ticket.booking_id}`}
                >
                  {ticket.booking_id}
                </Link>
              </p>
            ) : (
              <p>
                <strong className="block text-xs uppercase tracking-wide">Related booking</strong>{' '}
                None linked
              </p>
            )}
            {ticket.resolution_notes && (
              <p className="md:col-span-2 xl:col-span-4">
                <strong>Recorded resolution:</strong> {ticket.resolution_notes}
              </p>
            )}
          </div>

          {/* Assign agent by name. Raw UUID entry was not usable by support staff. */}
          {ticket.status !== 'closed' && (
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <label
                htmlFor="ticket-agent-id"
                className="min-w-56 flex-1 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]"
              >
                Case owner
                <select
                  id="ticket-agent-id"
                  className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--color-text)]"
                  aria-label="Support agent to assign"
                  value={assignAgentId}
                  onChange={(e) => setAssignAgentId(e.target.value)}
                  disabled={agentsQuery.isLoading || agentsQuery.isError}
                >
                  <option value="">
                    {agentsQuery.isLoading ? 'Loading agents...' : 'Choose an active agent'}
                  </option>
                  {(agentsQuery.data ?? []).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.first_name} {agent.last_name} ({formatLabel(agent.role)})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="min-h-11 rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!assignAgentId.trim() || assignMutation.isPending}
                onClick={() => assignMutation.mutate({ id: ticket.id, agentId: assignAgentId })}
              >
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
              {agentsQuery.isError && (
                <p role="alert" className="w-full text-xs text-red-700">
                  Active support agents could not be loaded.
                </p>
              )}
            </div>
          )}

          <div className="border-t border-[var(--color-border)] pt-4">
            <h2 className="mb-2 text-sm font-bold text-[var(--color-text)]">
              {ticketPersonaLabel(ticket)}’s original report
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">
              {ticket.description}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Conversation timeline
              </p>
              <h2 className="text-lg font-semibold">Messages and internal notes</h2>
            </div>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {ticket.messages?.length ?? 0} entries
            </span>
          </div>
          {isDetailLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-3 border-[var(--color-primary)] border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
              {(ticket.messages ?? []).map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${msg.is_internal_note ? 'bg-yellow-50 border border-yellow-200' : 'bg-[var(--color-surface-hover)]'}`}
                >
                  <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
                    <span className="font-medium">
                      {msg.sender_first_name ?? ''} {msg.sender_last_name ?? ''} (
                      {formatLabel(msg.sender_role)})
                      {msg.is_internal_note && (
                        <span className="ml-2 text-yellow-600">[Internal Note]</span>
                      )}
                    </span>
                    <span>
                      {new Date(msg.created_at).toLocaleString('en-PH', {
                        timeZone: 'Asia/Manila',
                      })}
                    </span>
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
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="ticket-resolution-title"
                className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6"
              >
                <h3
                  id="ticket-resolution-title"
                  className="text-lg font-semibold text-[var(--color-text)] mb-1"
                >
                  Change status to {formatLabel(pendingStatus)}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                  {ticket.ticket_number}: {ticket.subject}
                </p>
                {statusNeedsResolution ? (
                  <>
                    <label
                      htmlFor="ticket-resolution-notes"
                      className="block text-sm font-medium text-[var(--color-text)] mb-1.5"
                    >
                      Resolution notes *
                    </label>
                    <textarea
                      id="ticket-resolution-notes"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      rows={4}
                      maxLength={5000}
                      placeholder="Explain the outcome in at least 10 characters. This remains in the case record."
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </>
                ) : (
                  <p className="rounded-md bg-[var(--color-bg)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                    Confirm this workflow change. No customer message will be sent by this action
                    alone.
                  </p>
                )}
                {error && updateStatusMutation.isError && (
                  <p role="alert" className="mt-3 text-sm text-red-600">
                    {error}
                  </p>
                )}
                <div className="flex gap-2 justify-end mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingStatus(null);
                      setResolutionNotes('');
                    }}
                    className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingStatus) {
                        const notes = resolutionNotes.trim();
                        // Dialog stays open until the mutation succeeds (closed in
                        // onSuccess) so a failure is shown here, not in the background.
                        updateStatusMutation.mutate({
                          id: ticket.id,
                          status: pendingStatus,
                          resolutionNotes: notes,
                        });
                      }
                    }}
                    disabled={
                      updateStatusMutation.isPending ||
                      (statusNeedsResolution && resolutionNotes.trim().length < 10)
                    }
                    className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {updateStatusMutation.isPending
                      ? 'Updating...'
                      : `Confirm ${formatLabel(pendingStatus)}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <form onSubmit={handleReply} className="border-t border-[var(--color-border)] pt-4">
              <label htmlFor="ticket-reply-message" className="sr-only">
                Reply message
              </label>
              <textarea
                id="ticket-reply-message"
                className="w-full border border-[var(--color-border)] rounded-lg p-3 text-sm resize-none"
                rows={3}
                maxLength={5000}
                placeholder="Type a reply..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                aria-label="Reply message"
              />
              <p
                aria-live="polite"
                className={`mt-1 text-right text-xs ${replyMessage.length > 4500 ? 'font-semibold text-orange-700' : 'text-[var(--color-text-tertiary)]'}`}
              >
                {replyMessage.length} / 5000 characters
              </p>
              <div className="flex items-center justify-between mt-2">
                <label
                  htmlFor="ticket-internal-note"
                  className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
                >
                  <input
                    id="ticket-internal-note"
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                  />
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
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
            Support operations
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)]">
            Support Queue
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
            Triage customer and provider requests, connect each case to its booking and account,
            assign an owner, and keep public replies separate from internal notes.
          </p>
        </div>
        <div className="text-sm text-[var(--color-text-secondary)]">
          <strong className="text-[var(--color-text)]">{data?.meta?.total ?? 0}</strong> matching
          cases
        </div>
      </div>

      {(bookingFilter || userFilter) && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 md:flex-row md:items-center">
          <div>
            <strong className="block">Linked-case view</strong>
            {userFilter && <span>Account: {newUserName}</span>}
            {userFilter && bookingFilter && <span> · </span>}
            {bookingFilter && <span>Booking: <span className="font-mono">{bookingFilter}</span></span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {userFilter && (
              <button
                type="button"
                className="min-h-11 rounded-md bg-[var(--color-primary)] px-4 font-semibold text-white"
                onClick={() => setSearchParams((current) => {
                  const params = new URLSearchParams(current);
                  params.set('new', '1');
                  params.delete('ticketId');
                  return params;
                })}
              >
                Create case for account
              </button>
            )}
            <button
              type="button"
              className="min-h-11 rounded-md border border-blue-300 bg-white px-4 font-semibold"
              onClick={() => setSearchParams((current) => {
                const params = new URLSearchParams(current);
                params.delete('userId');
                params.delete('userName');
                params.delete('userRole');
                params.delete('bookingId');
                params.delete('new');
                params.delete('page');
                return params;
              })}
            >
              Clear linked view
            </button>
          </div>
        </div>
      )}

      <section
        aria-label="Current page support signals"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: 'Open',
            count: openOnPage,
            tone: 'text-[var(--color-primary)]',
            filter: ['status', 'open'] as const,
          },
          {
            label: 'Escalated',
            count: escalatedOnPage,
            tone: 'text-red-700',
            filter: ['status', 'escalated'] as const,
          },
          {
            label: 'Urgent',
            count: urgentOnPage,
            tone: 'text-orange-700',
            filter: ['priority', 'urgent'] as const,
          },
          {
            label: 'Unassigned',
            count: unassignedOnPage,
            tone: 'text-[var(--color-text)]',
            filter: null,
          },
        ].map((signal) => (
          <button
            key={signal.label}
            type="button"
            onClick={() => signal.filter && setFilter(signal.filter[0], signal.filter[1])}
            disabled={!signal.filter}
            className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-left disabled:cursor-default"
          >
            <span className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {signal.label} on this page
            </span>
            <span className={`mt-1 block text-2xl font-bold ${signal.tone}`}>{signal.count}</span>
          </button>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Queue filters
        </span>
        <form
          role="search"
          className="flex min-w-64 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchParams((current) => {
              const params = new URLSearchParams(current);
              params.delete('page');
              const value = searchDraft.trim();
              if (value) params.set('search', value);
              else params.delete('search');
              return params;
            });
          }}
        >
          <label htmlFor="support-ticket-search" className="sr-only">Search support cases</label>
          <input
            id="support-ticket-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Ticket, subject, name, phone, email, provider"
            className="h-11 min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-3 text-sm"
          />
          <button type="submit" className="min-h-11 rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white">
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Filter support tickets by status"
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatLabel(s)}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setFilter('type', e.target.value)}
          aria-label="Filter support tickets by type"
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        >
          <option value="">All Types</option>
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {formatLabel(t)}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setFilter('priority', e.target.value)}
          aria-label="Filter support tickets by priority"
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {formatLabel(p)}
            </option>
          ))}
        </select>
      </div>

      {isError && (
        <p role="alert" className="text-red-600 text-sm">
          Failed to load tickets.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
        <DataTable
          columns={columns}
          data={visibleTickets}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No support tickets match these filters."
        />
      </div>

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
