import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquare, Flag, AlertTriangle, Search, EyeOff, CheckCircle2 } from '@/components/icons';
import api, { getErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';

// ─── Types (mirror messaging-admin.service.ts) ──────────────────────────────

interface ConversationSummary {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  providerId: string;
  providerProfileId: string | null;
  providerName: string;
  isActive: boolean;
  messageCount: number;
  flaggedOpen: number;
  reportedOpen: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  messageType: string;
  imageUrl: string | null;
  isRead: boolean;
  isFlagged: boolean;
  flagReviewedAt: string | null;
  reportedAt: string | null;
  reportReason: string | null;
  redactedAt: string | null;
  redactionReason: string | null;
  createdAt: string;
  bookingId?: string;
}

interface Thread {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  providerId: string;
  providerProfileId: string | null;
  providerName: string;
  isActive: boolean;
  messages: AdminMessage[];
}

type TabId = 'all' | 'flagged' | 'reported' | 'queue';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CommunicationsPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const bookingFilter = (searchParams.get('bookingId') ?? '').trim();
  const rawConversationId = (searchParams.get('conversationId') ?? '').trim();
  const rawMessageId = (searchParams.get('messageId') ?? '').trim();
  const requestedConversationId = UUID_REGEX.test(rawConversationId) ? rawConversationId.toLowerCase() : '';
  const requestedMessageId = UUID_REGEX.test(rawMessageId) ? rawMessageId.toLowerCase() : '';
  const communicationParamError = rawConversationId && !requestedConversationId
    ? 'The conversation ID must be a complete UUID.'
    : rawMessageId && !requestedMessageId
      ? 'The message ID must be a complete UUID.'
      : requestedMessageId && !requestedConversationId
        ? 'A message evidence link must include its conversation ID.'
        : '';
  const [tab, setTab] = useState<TabId>(() => (
    bookingFilter || requestedConversationId ? 'all' : 'queue'
  ));
  const [search, setSearch] = useState(() => bookingFilter);
  const [searchDraft, setSearchDraft] = useState(() => bookingFilter);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(() => (
    communicationParamError ? null : requestedConversationId || null
  ));
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(() => (
    communicationParamError ? null : requestedMessageId || null
  ));
  const previousBookingFilter = useRef(bookingFilter);

  const statsQuery = useQuery({
    queryKey: ['admin-comms-stats'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: { openFlagged: number; openReported: number } }>(
        '/api/v1/admin/conversations/stats',
      );
      return res.data.data;
    },
  });

  useEffect(() => {
    if (!bookingFilter) return;
    setTab('all');
    setSearch(bookingFilter);
    setSearchDraft(bookingFilter);
    setPage(1);
    if (previousBookingFilter.current !== bookingFilter) {
      setSelectedId(null);
      setSelectedMessageId(null);
    }
    previousBookingFilter.current = bookingFilter;
  }, [bookingFilter]);

  useEffect(() => {
    if (communicationParamError) {
      setSelectedId(null);
      setSelectedMessageId(null);
      return;
    }
    if (requestedConversationId) {
      setTab('all');
      setSelectedId(requestedConversationId);
      setSelectedMessageId(requestedMessageId || null);
    }
  }, [communicationParamError, requestedConversationId, requestedMessageId]);

  function clearCommunicationSelection(): void {
    const next = new URLSearchParams(searchParams);
    next.delete('conversationId');
    next.delete('messageId');
    setSearchParams(next, { replace: true });
    setSelectedId(null);
    setSelectedMessageId(null);
  }

  function selectCommunication(conversationId: string, messageId: string | null): void {
    if (rawConversationId || rawMessageId) {
      const next = new URLSearchParams(searchParams);
      next.delete('conversationId');
      next.delete('messageId');
      setSearchParams(next, { replace: true });
    }
    setSelectedId(conversationId);
    setSelectedMessageId(messageId);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
          <MessageSquare size={20} /> Communications
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Read customer and provider chats, review flagged or reported messages, and remove abusive content.
          Opening a thread and every moderation action is recorded in the audit log.
        </p>
      </div>

      {bookingFilter && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="font-semibold text-[var(--color-text)]">Booking conversation</span>
            <span className="mt-1 block break-all font-mono text-xs text-[var(--color-text-secondary)] sm:ml-2 sm:mt-0 sm:inline">{bookingFilter}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/bookings/${bookingFilter}`} className="font-semibold text-[var(--color-secondary)] hover:underline">
              Booking 360
            </Link>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('bookingId');
                next.delete('conversationId');
                next.delete('messageId');
                setSearchParams(next, { replace: true });
                setSearch('');
                setSearchDraft('');
                setSelectedId(null);
              }}
            >
              Clear booking filter
            </Button>
          </div>
        </div>
      )}

      {communicationParamError ? (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Conversation evidence link unavailable</p>
          <p className="mt-1">{communicationParamError}</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={clearCommunicationSelection}>
            Remove evidence selection
          </Button>
        </div>
      ) : requestedConversationId ? (
        <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">Selected audit evidence</span>{' '}
            <span className="font-mono text-xs">{requestedMessageId || requestedConversationId}</span>
          </p>
          <Button type="button" size="sm" variant="outline" onClick={clearCommunicationSelection}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {/* Stats */}
      {statsQuery.isError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <span>Moderation queue counts could not be loaded. The queue below remains available.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void statsQuery.refetch()}>Retry counts</Button>
        </div>
      ) : statsQuery.isLoading ? (
        <p role="status" className="text-sm text-[var(--color-text-secondary)]">Loading moderation queue counts…</p>
      ) : (
        <div className="flex gap-3 flex-wrap">
          <StatChip
            label="Flagged, awaiting review"
            value={statsQuery.data?.openFlagged ?? 0}
            tone="warning"
            icon={<Flag size={14} />}
          />
          <StatChip
            label="Reported by users, awaiting review"
            value={statsQuery.data?.openReported ?? 0}
            tone="danger"
            icon={<AlertTriangle size={14} />}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {([
          ['queue', 'Review queue'],
          ['all', 'All conversations'],
          ['flagged', 'Flagged'],
          ['reported', 'Reported'],
        ] as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { clearCommunicationSelection(); setTab(id); setPage(1); }}
            className={`min-h-11 shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-[var(--color-secondary)] text-[var(--color-text)] font-medium'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4">
        {/* Left: list */}
        <div className="space-y-3">
          {tab !== 'queue' && (
            <form
              role="search"
              className="flex gap-2"
              onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); setPage(1); clearCommunicationSelection(); }}
            >
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search by name or booking id"
                  aria-label="Search customer and provider conversations"
                  className="pl-8"
                />
              </div>
              <Button type="submit" size="sm">Search</Button>
              {(search || searchDraft) && (
                <Button type="button" size="sm" variant="outline" onClick={() => { setSearch(''); setSearchDraft(''); setPage(1); clearCommunicationSelection(); }}>
                  Clear
                </Button>
              )}
            </form>
          )}
          {tab === 'queue' ? (
            <QueueList
              onSelect={(conversationId, messageId) => {
                selectCommunication(conversationId, messageId);
              }}
              selectedId={selectedId}
              selectedMessageId={selectedMessageId}
              page={page}
              onPageChange={(nextPage) => { setPage(nextPage); clearCommunicationSelection(); }}
            />
          ) : (
            <ConversationList
              filter={tab}
              search={search}
              autoSelectBookingId={bookingFilter || undefined}
              page={page}
              onPageChange={(nextPage) => { setPage(nextPage); clearCommunicationSelection(); }}
              onSelect={(conversationId) => {
                selectCommunication(conversationId, null);
              }}
              selectedId={selectedId}
            />
          )}
        </div>

        {/* Right: thread */}
        <div>
          {selectedId ? (
            <ConversationThread
              conversationId={selectedId}
              focusMessageId={selectedMessageId}
              expectedBookingId={requestedConversationId ? bookingFilter || null : null}
            />
          ) : (
            <Card className="p-8">
              <EmptyState
                title="No conversation selected"
                description="Pick a conversation on the left to read the thread and moderate messages."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label, value, tone, icon,
}: { label: string; value: number; tone: 'warning' | 'danger'; icon: React.ReactNode }): React.ReactElement {
  const color = tone === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <span style={{ color }}>{icon}</span>
      <span className="text-lg font-semibold text-[var(--color-text)]">{value}</span>
      <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
    </div>
  );
}

// ─── Conversation list ───────────────────────────────────────────────────────

function ConversationList({
  filter, search, autoSelectBookingId, page, onPageChange, onSelect, selectedId,
}: {
  filter: 'all' | 'flagged' | 'reported';
  search: string;
  autoSelectBookingId?: string;
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-comms-conversations', filter, search, page],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; conversations: ConversationSummary[]; total: number }>(
        '/api/v1/admin/conversations',
        { params: { filter, search: search || undefined, page, pageSize: 25 } },
      );
      return res.data;
    },
  });

  const conversations = q.data?.conversations ?? [];
  useEffect(() => {
    if (!autoSelectBookingId || selectedId) return;
    const exact = conversations.find((conversation) => conversation.bookingId === autoSelectBookingId);
    if (exact) onSelect(exact.id);
  }, [autoSelectBookingId, conversations, onSelect, selectedId]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return (
    <ErrorState
      title="Failed to load conversations"
      description={getErrorMessage(q.error)}
      action={<Button type="button" variant="outline" onClick={() => void q.refetch()}>Try again</Button>}
    />
  );

  if (conversations.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="No conversations" description="Nothing matches this view yet." />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-secondary)]">{q.data?.total ?? 0} conversation(s)</p>
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={`w-full text-left rounded-lg border p-3 transition-colors ${
            selectedId === c.id
              ? 'border-[var(--color-secondary)] bg-[var(--color-surface-hover)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--color-text)] truncate">
              {c.customerName} &harr; {c.providerName}
            </span>
            <div className="flex gap-1 shrink-0">
              {c.flaggedOpen > 0 && <Badge label={`${c.flaggedOpen} flagged`} variant="warning" />}
              {c.reportedOpen > 0 && <Badge label={`${c.reportedOpen} reported`} variant="danger" />}
            </div>
          </div>
          {c.lastMessagePreview && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 truncate">{c.lastMessagePreview}</p>
          )}
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
            Booking {c.bookingId.slice(0, 8)} · {c.messageCount} message(s) · {fmtTime(c.lastMessageAt)}
          </p>
        </button>
      ))}
      {(q.data?.total ?? 0) > 25 && (
        <Pagination
          page={page}
          totalPages={Math.ceil((q.data?.total ?? 0) / 25)}
          total={q.data?.total ?? 0}
          pageSize={25}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

// ─── Review queue ────────────────────────────────────────────────────────────

function QueueList({
  onSelect, selectedId, selectedMessageId, page, onPageChange,
}: {
  onSelect: (conversationId: string, messageId: string) => void;
  selectedId: string | null;
  selectedMessageId: string | null;
  page: number;
  onPageChange: (page: number) => void;
}): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-comms-queue', page],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; messages: AdminMessage[]; total: number }>(
        '/api/v1/admin/conversations/queue',
        { params: { scope: 'all', page, pageSize: 25 } },
      );
      return res.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return (
    <ErrorState
      title="Failed to load moderation queue"
      description={getErrorMessage(q.error)}
      action={<Button type="button" variant="outline" onClick={() => void q.refetch()}>Try again</Button>}
    />
  );
  const messages = q.data?.messages ?? [];
  if (messages.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="Queue is clear" description="No flagged or reported messages are awaiting review." />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-secondary)]">{q.data?.total ?? 0} message(s) awaiting review</p>
      {messages.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m.conversationId, m.id)}
          className={`w-full text-left rounded-lg border p-3 transition-colors ${
            selectedId === m.conversationId && selectedMessageId === m.id
              ? 'border-[var(--color-secondary)] bg-[var(--color-surface-hover)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {m.reportedAt ? <Badge label="reported" variant="danger" /> : <Badge label="flagged" variant="warning" />}
            <span className="text-xs text-[var(--color-text-secondary)]">{m.senderName} ({m.senderRole})</span>
          </div>
          <p className="text-sm text-[var(--color-text)] mt-1 line-clamp-2">{m.content}</p>
          {m.reportReason && (
            <p className="text-[11px] text-[var(--color-danger)] mt-1">Reason: {m.reportReason}</p>
          )}
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
            Booking {m.bookingId?.slice(0, 8) ?? 'unknown'} · {fmtTime(m.createdAt)} · open reported message
          </p>
        </button>
      ))}
      {(q.data?.total ?? 0) > 25 && (
        <Pagination
          page={page}
          totalPages={Math.ceil((q.data?.total ?? 0) / 25)}
          total={q.data?.total ?? 0}
          pageSize={25}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

// ─── Conversation thread + moderation actions ────────────────────────────────

function ConversationThread({
  conversationId,
  focusMessageId,
  expectedBookingId,
}: {
  conversationId: string;
  focusMessageId: string | null;
  expectedBookingId: string | null;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [redactingId, setRedactingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [notice, setNotice] = useState('');

  const q = useQuery({
    queryKey: ['admin-comms-thread', conversationId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Thread }>(
        `/api/v1/admin/conversations/${conversationId}`,
      );
      return res.data.data;
    },
  });

  const invalidate = (): void => {
    queryClient.invalidateQueries({ queryKey: ['admin-comms-thread', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['admin-comms-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-comms-queue'] });
    queryClient.invalidateQueries({ queryKey: ['admin-comms-conversations'] });
  };

  const redactMutation = useMutation({
    mutationFn: async (vars: { messageId: string; reason: string }) => {
      await api.post(`/api/v1/admin/conversations/messages/${vars.messageId}/redact`, { reason: vars.reason });
    },
    onSuccess: () => {
      setRedactingId(null);
      setReason('');
      setNotice('Message hidden from the customer and provider. The original remains in the audited moderation record.');
      invalidate();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (vars: { messageId: string; reviewNote: string }) => {
      await api.post(`/api/v1/admin/conversations/messages/${vars.messageId}/review`, {
        reviewNote: vars.reviewNote,
      });
    },
    onSuccess: () => {
      setReviewingId(null);
      setReviewNote('');
      setNotice('Report marked reviewed without hiding the message. The rationale remains in the audit record.');
      invalidate();
    },
  });

  useEffect(() => {
    setNotice('');
    setRedactingId(null);
    setReviewingId(null);
  }, [conversationId]);

  useEffect(() => {
    if (!q.data || !focusMessageId) return;
    document.getElementById(`moderation-message-${focusMessageId}`)?.scrollIntoView?.({ block: 'center' });
  }, [focusMessageId, q.data]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return (
    <ErrorState
      title="Failed to load thread"
      description={getErrorMessage(q.error)}
      action={<Button type="button" variant="outline" onClick={() => void q.refetch()}>Try again</Button>}
    />
  );

  const thread = q.data;
  if (thread.id !== conversationId) {
    return (
      <ErrorState
        title="Conversation evidence mismatch"
        description="The returned conversation does not match the selected audit record. No conversation content is shown."
      />
    );
  }
  if (expectedBookingId && thread.bookingId !== expectedBookingId) {
    return (
      <ErrorState
        title="Conversation evidence mismatch"
        description="The selected conversation does not belong to the booking recorded in this link. No conversation content is shown."
      />
    );
  }
  if (focusMessageId && !thread.messages.some((message) => message.id === focusMessageId)) {
    return (
      <ErrorState
        title="Message evidence unavailable"
        description="The selected message is not present in the retained conversation. No different message has been substituted."
      />
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <Link className="text-[var(--color-secondary)] hover:underline" to={`/customers/${thread.customerId}`}>
            {thread.customerName}
          </Link>
          <span className="text-[var(--color-text-tertiary)]">&harr;</span>
          {thread.providerProfileId ? (
            <Link className="text-[var(--color-secondary)] hover:underline" to={`/providers/${thread.providerProfileId}`}>
              {thread.providerName}
            </Link>
          ) : (
            <span title="Provider profile is missing">{thread.providerName}</span>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          <Link className="font-medium text-[var(--color-secondary)] hover:underline" to={`/bookings/${thread.bookingId}`}>
            Booking {thread.bookingId.slice(0, 8)}
          </Link>
          {' · '}{thread.messages.length} message(s){' · '}{thread.isActive ? 'conversation open' : 'conversation closed'}
        </p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
        {notice && (
          <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
        {thread.messages.map((m) => {
          const needsReview = (m.isFlagged || !!m.reportedAt) && !m.flagReviewedAt;
          return (
            <div
              key={m.id}
              id={`moderation-message-${m.id}`}
              className={`rounded-lg border p-3 ${
                focusMessageId === m.id
                  ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/20'
                  : 'border-[var(--color-border)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-text)]">
                  {m.senderName}{' '}
                  <span className="text-[var(--color-text-tertiary)] font-normal">({m.senderRole})</span>
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">{fmtTime(m.createdAt)}</span>
              </div>

              <p className={`text-sm mt-1 ${m.redactedAt ? 'italic text-[var(--color-text-tertiary)]' : 'text-[var(--color-text)]'}`}>
                {m.messageType === 'image' && !m.redactedAt ? '[photo] ' : ''}{m.content}
              </p>
              {m.imageUrl && !m.redactedAt && (
                <a href={m.imageUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-secondary)] hover:underline">
                  view attached photo
                </a>
              )}

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {m.isFlagged && !m.reportedAt && <Badge label="auto-flagged" variant="warning" />}
                {m.reportedAt && <Badge label="user-reported" variant="danger" />}
                {m.flagReviewedAt && <Badge label="reviewed" variant="success" />}
                {m.redactedAt && <Badge label="redacted" variant="default" />}
              </div>
              {m.reportReason && (
                <p className="text-[11px] text-[var(--color-danger)] mt-1">Report reason: {m.reportReason}</p>
              )}
              {m.redactionReason && (
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">Redaction reason: {m.redactionReason}</p>
              )}

              {/* Moderation actions */}
              {(needsReview || !m.redactedAt) && (
                <div className="flex items-center gap-2 mt-2">
                  {!m.redactedAt && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRedactingId(redactingId === m.id ? null : m.id);
                        setReason('');
                        setReviewingId(null);
                        setReviewNote('');
                        setNotice('');
                      }}
                    >
                      <EyeOff size={13} /> Redact
                    </Button>
                  )}
                  {needsReview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReviewingId(reviewingId === m.id ? null : m.id);
                        setReviewNote('');
                        setRedactingId(null);
                        setReason('');
                        setNotice('');
                      }}
                      disabled={reviewMutation.isPending}
                    >
                      <CheckCircle2 size={13} /> Mark reviewed
                    </Button>
                  )}
                </div>
              )}

              {redactingId === m.id && (
                <div className="mt-2 space-y-2">
                  <p className="rounded-md bg-[var(--color-bg)] p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                    Redaction hides this message and photo from both participants. The original content, reason, administrator, and time remain available for audited review.
                  </p>
                  <Textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this message being removed? (min 3 characters, saved to the audit log)"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={reason.trim().length < 3 || redactMutation.isPending}
                      onClick={() => redactMutation.mutate({ messageId: m.id, reason: reason.trim() })}
                    >
                      Confirm redaction
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setRedactingId(null); setReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                  {redactMutation.isError && (
                    <p role="alert" className="text-xs text-[var(--color-danger)]">
                      {getErrorMessage(redactMutation.error)}
                    </p>
                  )}
                </div>
              )}

              {reviewingId === m.id && (
                <div className="mt-2 space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3">
                  <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                    Mark reviewed clears this item from the queue without hiding it from either participant.
                  </p>
                  <label htmlFor={`review-note-${m.id}`} className="text-xs font-medium text-[var(--color-text)]">
                    Review rationale
                  </label>
                  <Textarea
                    id={`review-note-${m.id}`}
                    rows={2}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Record why no redaction is needed or how this report was handled. Saved to the audit log."
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={reviewNote.trim().length < 3 || reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ messageId: m.id, reviewNote: reviewNote.trim() })}
                    >
                      Confirm reviewed
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setReviewingId(null); setReviewNote(''); }}>
                      Cancel
                    </Button>
                  </div>
                  {reviewMutation.isError && (
                    <p role="alert" className="text-xs text-[var(--color-danger)]">
                      {getErrorMessage(reviewMutation.error)}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
