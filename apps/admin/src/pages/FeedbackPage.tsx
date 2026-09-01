import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Search } from '@/components/icons';
import api, { getErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

type FeedbackStatus = 'new' | 'triaged' | 'done' | 'dismissed';
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface FeedbackRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  testerName: string | null;
  testerContact: string | null;
  contactMasked: boolean;
  piiMasked: boolean;
  role: string | null;
  device: string | null;
  areas: string[];
  nps: number | null;
  summary: string | null;
  itemCount: number;
  payload: { [key: string]: JsonValue };
  status: FeedbackStatus;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  triageNote: string | null;
}

interface FeedbackList {
  submissions: FeedbackRecord[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<FeedbackStatus, number>;
}

interface FeedbackHistoryEntry {
  id: string;
  createdAt: string;
  adminName: string;
  adminRole: string | null;
  previousStatus: FeedbackStatus | null;
  nextStatus: FeedbackStatus;
  previousOwnerName: string | null;
  nextOwnerName: string | null;
  note: string;
}

interface SupportAgent {
  id: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'super_admin';
}

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'done', 'dismissed'];
const AREAS = ['customer', 'provider', 'admin'];
const PAGE_SIZE = 25;
const STATUS_VARIANTS: Record<FeedbackStatus, 'danger' | 'warning' | 'success' | 'outline'> = {
  new: 'danger',
  triaged: 'warning',
  done: 'success',
  dismissed: 'outline',
};

function label(value: string): string {
  return value
    .replace(/^[^:]+:/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyEntries(value: JsonValue | undefined): [string, JsonValue][] {
  if (!isObject(value)) return [];
  return Object.entries(value).filter(([, entry]) => {
    if (entry === null || entry === '') return false;
    if (Array.isArray(entry)) return entry.length > 0;
    return true;
  });
}

function displayValue(value: JsonValue): string {
  if (Array.isArray(value)) return value.map((entry) => displayValue(entry)).filter(Boolean).join(', ');
  if (isObject(value)) return Object.entries(value).map(([key, entry]) => `${label(key)}: ${displayValue(entry)}`).join(' · ');
  if (value === null) return '';
  return String(value);
}

function protectedScreenshotUrl(recordId: string, value: JsonValue | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(
    /^(?:https?:\/\/(?:[a-z0-9-]+\.)*onservice(?:\.com)?\.ph)?\/uploads\/feedback\/([A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp))$/i,
  );
  if (!match?.[1]) return null;
  return `/api/v1/admin/feedback/${encodeURIComponent(recordId)}/screenshots/${encodeURIComponent(match[1])}`;
}

function parseStatus(value: string | null): FeedbackStatus {
  return STATUSES.includes(value as FeedbackStatus) ? value as FeedbackStatus : 'new';
}

function parseArea(value: string | null): string {
  return value && AREAS.includes(value) ? value : '';
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseSearch(value: string | null): string {
  const parsed = (value ?? '').trim();
  return parsed.length <= 100 ? parsed : '';
}

function parseFeedbackId(value: string | null): string | null {
  const parsed = (value ?? '').trim();
  return /^[A-Za-z0-9-]{1,100}$/.test(parsed) ? parsed : null;
}

function collectScreenshots(recordId: string, payload: { [key: string]: JsonValue }): string[] {
  const found = new Set<string>();
  const add = (value: JsonValue | undefined): void => {
    const protectedUrl = protectedScreenshotUrl(recordId, value);
    if (protectedUrl) found.add(protectedUrl);
    if (Array.isArray(value)) value.forEach(add);
  };
  add(payload.screenshots);
  if (Array.isArray(payload.items)) {
    payload.items.forEach((item) => {
      if (!isObject(item)) return;
      add(item.screenshot);
      add(item.screenshots);
    });
  }
  return [...found];
}

export default function FeedbackPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get('status'));
  const area = parseArea(searchParams.get('area'));
  const search = parseSearch(searchParams.get('search'));
  const page = parsePage(searchParams.get('page'));
  const selectedId = parseFeedbackId(searchParams.get('feedbackId'));
  const [searchDraft, setSearchDraft] = useState(search);
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('new');
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');

  const listQuery = useQuery({
    queryKey: ['admin-feedback', status, area, search, page],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: FeedbackList }>('/api/v1/admin/feedback', {
        params: { status, area: area || undefined, search: search || undefined, page, pageSize: PAGE_SIZE },
      });
      return response.data.data;
    },
  });
  const listRows = listQuery.isError ? [] : (listQuery.data?.submissions ?? []);

  useEffect(() => {
    if (!listQuery.isSuccess) return;
    const rows = listQuery.data.submissions;
    const firstId = rows[0]?.id;
    if (selectedId || !firstId) return;
    setSearchParams((current) => {
      if (parseFeedbackId(current.get('feedbackId'))) return current;
      const next = new URLSearchParams(current);
      next.set('feedbackId', firstId);
      return next;
    }, { replace: true });
  }, [listQuery.data, listQuery.isSuccess, selectedId, setSearchParams]);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const detailQuery = useQuery({
    queryKey: ['admin-feedback-detail', selectedId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: FeedbackRecord }>(`/api/v1/admin/feedback/${selectedId}`);
      return response.data.data;
    },
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    setEditStatus(detailQuery.data.status);
    setOwnerId(detailQuery.data.assignedAdminId ?? '');
    setNote(detailQuery.data.triageNote ?? '');
  }, [detailQuery.data]);

  const agentsQuery = useQuery({
    queryKey: ['assignable-admin-agents'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: SupportAgent[] }>('/api/v1/support-tickets/agents');
      return response.data.data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['admin-feedback-history', selectedId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: { entries: FeedbackHistoryEntry[] } }>(
        `/api/v1/admin/feedback/${selectedId}/history`,
      );
      return response.data.data.entries;
    },
    enabled: !!selectedId,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !detailQuery.data) throw new Error('Select a loaded feedback submission first.');
      const response = await api.patch<{ success: boolean; data: FeedbackRecord }>(
        `/api/v1/admin/feedback/${selectedId}/triage`,
        {
          status: editStatus,
          assignedAdminId: ownerId || null,
          note: note.trim(),
          expectedUpdatedAt: detailQuery.data.updatedAt,
        },
      );
      return response.data.data;
    },
    onSuccess: (record) => {
      queryClient.setQueryData(['admin-feedback-detail', record.id], record);
      void queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-feedback-history', record.id] });
    },
  });
  const resetUpdateMutation = updateMutation.reset;
  const selectFeedback = (feedbackId: string): void => {
    resetUpdateMutation();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('feedbackId', feedbackId);
      return next;
    }, { replace: true });
  };
  const updateQueueUrl = (changes: {
    status?: FeedbackStatus;
    area?: string;
    search?: string;
    page?: number;
  }): void => {
    resetUpdateMutation();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (changes.status !== undefined) {
        if (changes.status === 'new') next.delete('status');
        else next.set('status', changes.status);
      }
      if (changes.area !== undefined) {
        if (changes.area) next.set('area', changes.area);
        else next.delete('area');
      }
      if (changes.search !== undefined) {
        const normalized = changes.search.trim();
        if (normalized) next.set('search', normalized);
        else next.delete('search');
      }
      if (changes.page !== undefined) {
        if (changes.page <= 1) next.delete('page');
        else next.set('page', String(changes.page));
      }
      next.delete('feedbackId');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (!listQuery.isError) return;
    resetUpdateMutation();
  }, [listQuery.isError, resetUpdateMutation]);

  const detail = detailQuery.data;
  const selectionAvailable = listQuery.isSuccess && !!selectedId;
  const selectionInCurrentPage = !!selectedId && listRows.some((record) => record.id === selectedId);
  const detailAvailable = selectionAvailable && detailQuery.isSuccess && !detailQuery.isError && !!detail;
  const updateConflict = updateMutation.error instanceof Error
    && 'status' in updateMutation.error
    && updateMutation.error.status === 409;
  const ownerRequired = editStatus === 'triaged' || editStatus === 'done';
  const hasChanges = !!detail && (
    editStatus !== detail.status
    || ownerId !== (detail.assignedAdminId ?? '')
    || note.trim() !== (detail.triageNote ?? '')
  );
  const canSave = !!detail
    && detailAvailable
    && hasChanges
    && note.trim().length >= 10
    && note.trim().length <= 2_000
    && (!ownerRequired || !!ownerId)
    && agentsQuery.isSuccess
    && historyQuery.isSuccess
    && !updateMutation.isPending;
  const pageCount = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE));
  const totalLabel = listQuery.isError
    ? 'Unavailable'
    : listQuery.isLoading
      ? 'Loading…'
      : String(listQuery.data?.total ?? 0);
  const statusCountLabel = (value: FeedbackStatus): string => {
    if (listQuery.isError) return 'Unavailable';
    if (listQuery.isLoading) return 'Loading…';
    return String(listQuery.data?.counts[value] ?? 0);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Product operations</p>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-[var(--color-text)]">
            <MessageSquare size={24} /> Tester Feedback
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
            Turn customer, provider, and admin testing into owned work. Preserve the original evidence, name an owner,
            and record why a report was completed or dismissed.
          </p>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          <strong className="text-[var(--color-text)]">{totalLabel}</strong> matching submission(s)
        </p>
      </div>

      <p id="feedback-count-scope" className="text-xs text-[var(--color-text-secondary)]">
        Status counts follow the active app-area and search filters. Select a card to change the status queue.
      </p>
      <section aria-label="Tester feedback status counts" aria-describedby="feedback-count-scope" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => updateQueueUrl({ status: value, page: 1 })}
            disabled={updateMutation.isPending}
            aria-pressed={status === value}
            className={`min-h-20 rounded-lg border bg-white p-4 text-left transition-colors ${
              status === value ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/15' : 'border-[var(--color-border)]'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label(value)}</span>
            <span className="mt-1 block text-lg font-bold text-[var(--color-text)] sm:text-2xl">{statusCountLabel(value)}</span>
          </button>
        ))}
      </section>

      <form
        role="search"
        className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 md:flex-row md:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          updateQueueUrl({ search: searchDraft, page: 1 });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search summary, tester, or device"
            aria-label="Search tester feedback"
            maxLength={100}
            disabled={updateMutation.isPending}
            className="h-11 pl-9"
          />
        </div>
        <select
          value={area}
          onChange={(event) => updateQueueUrl({ area: event.target.value, page: 1 })}
          aria-label="Filter tester feedback by app area"
          disabled={updateMutation.isPending}
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">All app areas</option>
          {AREAS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <Button type="submit" disabled={updateMutation.isPending}>Search</Button>
        {(search || searchDraft) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => updateQueueUrl({ search: '', page: 1 })}
            disabled={updateMutation.isPending}
          >
            Clear
          </Button>
        )}
      </form>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className={`space-y-2 ${listRows.length === 0 && !selectedId ? 'xl:col-span-2' : ''}`}>
          {listQuery.isLoading && <LoadingState />}
          {listQuery.isError && (
            <ErrorState
              title="Feedback queue unavailable"
              description={getErrorMessage(listQuery.error)}
              action={<Button variant="outline" onClick={() => void listQuery.refetch()}>Retry queue</Button>}
            />
          )}
          {!listQuery.isLoading && !listQuery.isError && (listQuery.data?.submissions.length ?? 0) === 0 && (
            <Card className="p-6"><EmptyState title="No feedback matches" description="Try another status, area, or search." /></Card>
          )}
          {listRows.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => selectFeedback(record.id)}
              disabled={updateMutation.isPending}
              className={`w-full rounded-lg border bg-white p-4 text-left transition-colors ${
                selectedId === record.id ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/15' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">{record.testerName || 'Anonymous tester'}</span>
                <Badge label={label(record.status)} variant={STATUS_VARIANTS[record.status]} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-secondary)]">{record.summary || 'No summary supplied'}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {record.areas.map((value) => <Badge key={value} label={label(value)} variant="info" />)}
                <Badge label={`${record.itemCount} issue(s)`} variant="outline" />
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">{fmtDate(record.createdAt)} · {record.assignedAdminName || 'Unassigned'}</p>
            </button>
          ))}
          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || updateMutation.isPending} onClick={() => updateQueueUrl({ page: page - 1 })}>Previous</Button>
              <span className="text-xs text-[var(--color-text-secondary)]">Page {page} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount || updateMutation.isPending} onClick={() => updateQueueUrl({ page: page + 1 })}>Next</Button>
            </div>
          )}
        </div>

        <div>
          {!selectedId && listQuery.isSuccess && listRows.length > 0 && (
            <Card className="p-8"><EmptyState title="No feedback selected" description="Choose a submission to review its evidence and record a decision." /></Card>
          )}
          {selectionAvailable && detailQuery.isLoading && <LoadingState />}
          {selectionAvailable && detailQuery.isError && (
            <ErrorState
              title="Feedback detail unavailable"
              description={getErrorMessage(detailQuery.error)}
              action={<Button variant="outline" onClick={() => void detailQuery.refetch()}>Retry detail</Button>}
            />
          )}
          {detailAvailable && !selectionInCurrentPage && (
            <div role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              This exact submission was opened from a saved link. It is outside the current queue page or filters, so
              the list may not highlight it. The evidence and decision controls below apply to the linked record.
            </div>
          )}
          {detailAvailable && <FeedbackDetail record={detail} />}

          {detailAvailable && (
            <FeedbackHistory
              entries={historyQuery.data ?? []}
              isLoading={historyQuery.isLoading}
              error={historyQuery.isError ? getErrorMessage(historyQuery.error) : null}
              isRetrying={historyQuery.isFetching}
              onRetry={() => void historyQuery.refetch()}
            />
          )}

          {detailAvailable && (
            <Card className="mt-4 p-5">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Ownership and decision</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">Triage this submission</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-[var(--color-text)]">
                  Status
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as FeedbackStatus)}
                    aria-label="Tester feedback status"
                    disabled={updateMutation.isPending}
                    className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-normal"
                  >
                    {STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-[var(--color-text)]">
                  Case owner {ownerRequired ? '*' : ''}
                  <select
                    value={ownerId}
                    onChange={(event) => setOwnerId(event.target.value)}
                    aria-label="Tester feedback owner"
                    disabled={agentsQuery.isLoading || agentsQuery.isError || updateMutation.isPending}
                    className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-normal disabled:opacity-50"
                  >
                    <option value="">{agentsQuery.isLoading ? 'Loading active admins…' : 'Unassigned'}</option>
                    {(agentsQuery.data ?? []).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.first_name} {agent.last_name} ({label(agent.role)})</option>
                    ))}
                  </select>
                </label>
              </div>
              {agentsQuery.isError && (
                <div role="alert" className="mt-3 flex flex-col items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center">
                  <p className="text-xs text-red-700">Active admin owners could not be loaded. Triage is unavailable until this source recovers.</p>
                  <Button variant="outline" size="sm" onClick={() => void agentsQuery.refetch()} disabled={agentsQuery.isFetching}>Retry owners</Button>
                </div>
              )}
              <label className="mt-4 block text-sm font-medium text-[var(--color-text)]">
                Decision and evidence note *
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  disabled={updateMutation.isPending}
                  placeholder="Record what was verified, the linked screen or work item, closure evidence, or why this is non-actionable. Saved to the audit history."
                  aria-label="Tester feedback triage note"
                  className="mt-1.5"
                />
              </label>
              <div className="mt-2 flex flex-col justify-between gap-1 text-xs sm:flex-row">
                <p className="text-[var(--color-text-secondary)]">
                  {editStatus === 'done' && 'Done means the current behavior and closure evidence were verified.'}
                  {editStatus === 'dismissed' && 'Dismissed requires a clear spam, duplicate, or non-actionable reason.'}
                  {editStatus === 'triaged' && 'Triaged means a named owner accepted the next action.'}
                  {editStatus === 'new' && 'New returns the submission to the unowned review queue.'}
                </p>
                <span className={note.trim().length < 10 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>
                  {note.trim().length}/10 minimum
                </span>
              </div>
              {ownerRequired && !ownerId && <p className="mt-2 text-xs text-amber-700">Triaged and done submissions require a named owner.</p>}
              {historyQuery.isLoading && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Verifying prior decisions before changes can be saved…</p>}
              {historyQuery.isError && <p className="mt-2 text-xs text-red-700">Triage is unavailable until decision history recovers.</p>}
              {updateMutation.isError && (
                <div role="alert" className="mt-3 flex flex-col items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center">
                  <p className="text-sm text-red-700">{getErrorMessage(updateMutation.error)}</p>
                  {updateConflict && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        resetUpdateMutation();
                        void Promise.all([listQuery.refetch(), detailQuery.refetch(), historyQuery.refetch()]);
                      }}
                    >
                      Reload latest feedback
                    </Button>
                  )}
                </div>
              )}
              {updateMutation.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Feedback triage saved.</p>}
              <div className="mt-4 flex justify-end">
                <Button disabled={!canSave} onClick={() => updateMutation.mutate()}>
                  {updateMutation.isPending ? 'Saving…' : hasChanges ? 'Save triage' : 'No changes to save'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackHistory({
  entries,
  isLoading,
  error,
  isRetrying,
  onRetry,
}: {
  entries: FeedbackHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  isRetrying: boolean;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <Card className="mt-4 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Append-only audit history</p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">Ownership and decisions</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Earlier notes remain visible here when the current triage state changes.
      </p>
      {isLoading && <div className="mt-4"><LoadingState /></div>}
      {error && (
        <div role="alert" className="mt-4 flex flex-col items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>Retry history</Button>
        </div>
      )}
      {!isLoading && !error && entries.length === 0 && (
        <p className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text-secondary)]">
          No triage decision has been recorded yet.
        </p>
      )}
      {!error && entries.length > 0 && (
        <ol className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-[var(--color-border)] p-4">
              <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {entry.previousStatus ? label(entry.previousStatus) : 'No prior state'} → {label(entry.nextStatus)}
                </p>
                <time className="text-xs text-[var(--color-text-tertiary)]">{fmtDate(entry.createdAt)}</time>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {entry.adminName}{entry.adminRole ? ` (${label(entry.adminRole)})` : ''} · owner {entry.previousOwnerName || 'Unassigned'} → {entry.nextOwnerName || 'Unassigned'}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">{entry.note || 'No note captured.'}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function FeedbackDetail({ record }: { record: FeedbackRecord }): React.ReactElement {
  const items = Array.isArray(record.payload.items) ? record.payload.items.filter(isObject) : [];
  const ratings = nonEmptyEntries(record.payload.ratings);
  const answers = nonEmptyEntries(record.payload.answers);
  const prices = nonEmptyEntries(record.payload.prices);
  const screenshots = useMemo(() => collectScreenshots(record.id, record.payload), [record.id, record.payload]);
  const ideas = typeof record.payload.ideas === 'string' ? record.payload.ideas.trim() : '';

  return (
    <Card aria-label="Original tester submission" className="overflow-hidden">
      <div className="border-b border-[var(--color-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Original tester submission</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--color-text)]">{record.testerName || 'Anonymous tester'}</h2>
          </div>
          <Badge label={label(record.status)} variant={STATUS_VARIANTS[record.status]} />
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">{record.summary || 'No summary supplied.'}</p>
        <dl className="mt-4 grid gap-3 rounded-md bg-[var(--color-bg)] p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Meta label="Role" value={record.role ? label(record.role) : 'Not supplied'} />
          <Meta label="Device" value={record.device || 'Not supplied'} />
          <Meta label="Submitted" value={fmtDate(record.createdAt)} />
          <Meta label="NPS" value={record.nps === null ? 'Not supplied' : `${record.nps}/10`} />
          <Meta label="Contact" value={record.testerContact || 'Not supplied'} />
          <Meta label="Privacy" value={record.piiMasked ? 'Phone and email masked in contact, feedback, and decision notes' : 'Super-admin raw PII view'} />
          <Meta label="Areas" value={record.areas.map(label).join(', ') || 'Not supplied'} />
          <Meta label="Owner" value={record.assignedAdminName || 'Unassigned'} />
        </dl>
      </div>

      <div className="space-y-6 p-5">
        {items.length > 0 && (
          <EvidenceSection title={`Logged issues (${items.length})`}>
            <div className="space-y-3">
              {items.map((item, index) => (
                <article key={`${record.id}-item-${index}`} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {typeof item.area === 'string' && <Badge label={label(item.area)} variant="info" />}
                    {typeof item.type === 'string' && <Badge label={label(item.type)} variant="outline" />}
                    {typeof item.severity === 'string' && <Badge label={label(item.severity)} variant="warning" />}
                  </div>
                  {['what', 'where', 'repro', 'expected'].map((key) => {
                    const value = item[key];
                    if (typeof value !== 'string' || !value.trim()) return null;
                    return <p key={key} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]"><strong className="text-[var(--color-text)]">{label(key)}:</strong> {value}</p>;
                  })}
                </article>
              ))}
            </div>
          </EvidenceSection>
        )}

        {ratings.length > 0 && (
          <EvidenceSection title="Ratings">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ratings.map(([key, value]) => <Meta key={key} label={label(key)} value={displayValue(value)} boxed />)}
            </div>
          </EvidenceSection>
        )}

        {answers.length > 0 && (
          <EvidenceSection title="Questionnaire answers">
            <dl className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
              {answers.map(([key, value]) => (
                <div key={key} className="p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label(key)}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">{displayValue(value)}</dd>
                </div>
              ))}
            </dl>
          </EvidenceSection>
        )}

        {(prices.length > 0 || ideas) && (
          <EvidenceSection title="Pricing and product ideas">
            {prices.length > 0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{prices.map(([key, value]) => <Meta key={key} label={label(key)} value={displayValue(value)} boxed />)}</div>}
            {ideas && <p className="mt-3 whitespace-pre-wrap rounded-lg border border-[var(--color-border)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">{ideas}</p>}
          </EvidenceSection>
        )}

        {screenshots.length > 0 && (
          <EvidenceSection title={`Screenshots (${screenshots.length})`}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {screenshots.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <img src={url} alt={`Tester evidence ${index + 1}`} className="h-40 w-full object-cover" loading="lazy" />
                  <span className="block px-3 py-2 text-xs font-medium text-[var(--color-secondary)] group-hover:underline">Open full screenshot</span>
                </a>
              ))}
            </div>
          </EvidenceSection>
        )}
      </div>
    </Card>
  );
}

function EvidenceSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return <section><h3 className="mb-3 text-base font-semibold text-[var(--color-text)]">{title}</h3>{children}</section>;
}

function Meta({ label: title, value, boxed = false }: { label: string; value: string; boxed?: boolean }): React.ReactElement {
  return (
    <div className={boxed ? 'rounded-md border border-[var(--color-border)] bg-white p-3' : ''}>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
