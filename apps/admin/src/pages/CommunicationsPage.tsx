import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

// ─── Types (mirror messaging-admin.service.ts) ──────────────────────────────

interface ConversationSummary {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  providerId: string;
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
  customerName: string;
  providerName: string;
  isActive: boolean;
  messages: AdminMessage[];
}

type TabId = 'all' | 'flagged' | 'reported' | 'queue';

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CommunicationsPage(): React.ReactElement {
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ['admin-comms-stats'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: { openFlagged: number; openReported: number } }>(
        '/api/v1/admin/conversations/stats',
      );
      return res.data.data;
    },
  });

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

      {/* Stats */}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {([
          ['all', 'All conversations'],
          ['flagged', 'Flagged'],
          ['reported', 'Reported'],
          ['queue', 'Review queue'],
        ] as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); setSelectedId(null); }}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
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
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or booking id"
                className="pl-8"
              />
            </div>
          )}
          {tab === 'queue' ? (
            <QueueList onSelect={setSelectedId} selectedId={selectedId} />
          ) : (
            <ConversationList
              filter={tab}
              search={search}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          )}
        </div>

        {/* Right: thread */}
        <div>
          {selectedId ? (
            <ConversationThread conversationId={selectedId} />
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
  filter, search, onSelect, selectedId,
}: {
  filter: 'all' | 'flagged' | 'reported';
  search: string;
  onSelect: (id: string) => void;
  selectedId: string | null;
}): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-comms-conversations', filter, search],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; conversations: ConversationSummary[]; total: number }>(
        '/api/v1/admin/conversations',
        { params: { filter, search: search || undefined, pageSize: 50 } },
      );
      return res.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState title="Failed to load" description={getErrorMessage(q.error)} />;
  if (!q.data || q.data.conversations.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="No conversations" description="Nothing matches this view yet." />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-secondary)]">{q.data.total} conversation(s)</p>
      {q.data.conversations.map((c) => (
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
            {c.messageCount} message(s) · {fmtTime(c.lastMessageAt)}
          </p>
        </button>
      ))}
    </div>
  );
}

// ─── Review queue ────────────────────────────────────────────────────────────

function QueueList({
  onSelect, selectedId,
}: { onSelect: (id: string) => void; selectedId: string | null }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-comms-queue'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; messages: AdminMessage[]; total: number }>(
        '/api/v1/admin/conversations/queue',
        { params: { scope: 'all', pageSize: 50 } },
      );
      return res.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState title="Failed to load" description={getErrorMessage(q.error)} />;
  if (!q.data || q.data.messages.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="Queue is clear" description="No flagged or reported messages are awaiting review." />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-secondary)]">{q.data.total} message(s) awaiting review</p>
      {q.data.messages.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m.conversationId)}
          className={`w-full text-left rounded-lg border p-3 transition-colors ${
            selectedId === m.conversationId
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
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{fmtTime(m.createdAt)} · open thread</p>
        </button>
      ))}
    </div>
  );
}

// ─── Conversation thread + moderation actions ────────────────────────────────

function ConversationThread({ conversationId }: { conversationId: string }): React.ReactElement {
  const queryClient = useQueryClient();
  const [redactingId, setRedactingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['admin-comms-thread', conversationId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Thread }>(
        `/api/v1/admin/conversations/${conversationId}`,
      );
      return res.data.data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-comms-thread', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['admin-comms-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-comms-queue'] });
    queryClient.invalidateQueries({ queryKey: ['admin-comms-conversations'] });
  };

  const redactMutation = useMutation({
    mutationFn: async (vars: { messageId: string; reason: string }) => {
      await api.post(`/api/v1/admin/conversations/messages/${vars.messageId}/redact`, { reason: vars.reason });
    },
    onSuccess: () => { setRedactingId(null); setReason(''); invalidate(); },
  });

  const reviewMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await api.post(`/api/v1/admin/conversations/messages/${messageId}/review`);
    },
    onSuccess: invalidate,
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState title="Failed to load thread" description={getErrorMessage(q.error)} />;

  const thread = q.data;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {thread.customerName} &harr; {thread.providerName}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)]">Booking {thread.bookingId.slice(0, 8)} · {thread.messages.length} message(s)</p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
        {thread.messages.map((m) => {
          const needsReview = (m.isFlagged || !!m.reportedAt) && !m.flagReviewedAt;
          return (
            <div key={m.id} className="rounded-lg border border-[var(--color-border)] p-3">
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
                      onClick={() => { setRedactingId(redactingId === m.id ? null : m.id); setReason(''); }}
                    >
                      <EyeOff size={13} /> Redact
                    </Button>
                  )}
                  {needsReview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => reviewMutation.mutate(m.id)}
                      disabled={reviewMutation.isPending}
                    >
                      <CheckCircle2 size={13} /> Mark reviewed
                    </Button>
                  )}
                </div>
              )}

              {redactingId === m.id && (
                <div className="mt-2 space-y-2">
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
