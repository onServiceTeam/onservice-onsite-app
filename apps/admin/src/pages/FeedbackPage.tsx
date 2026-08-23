import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

interface SupportAgent {
  id: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'super_admin';
}

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'done', 'dismissed'];
const AREAS = ['customer', 'provider', 'admin'];
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

function collectScreenshots(payload: { [key: string]: JsonValue }): string[] {
  const found = new Set<string>();
  const add = (value: JsonValue | undefined): void => {
    if (typeof value === 'string' && /^(https?:\/\/|\/uploads\/feedback\/)/i.test(value)) found.add(value);
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
  const [status, setStatus] = useState<FeedbackStatus>('new');
  const [area, setArea] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('new');
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');

  const listQuery = useQuery({
    queryKey: ['admin-feedback', status, area, search, page],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: FeedbackList }>('/api/v1/admin/feedback', {
        params: { status, area: area || undefined, search: search.trim() || undefined, page, pageSize: 25 },
      });
      return response.data.data;
    },
  });

  useEffect(() => {
    const rows = listQuery.data?.submissions ?? [];
    if (!selectedId || !rows.some((row) => row.id === selectedId)) setSelectedId(rows[0]?.id ?? null);
  }, [listQuery.data, selectedId]);

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

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Select a feedback submission first.');
      const response = await api.patch<{ success: boolean; data: FeedbackRecord }>(
        `/api/v1/admin/feedback/${selectedId}/triage`,
        { status: editStatus, assignedAdminId: ownerId || null, note: note.trim() },
      );
      return response.data.data;
    },
    onSuccess: (record) => {
      queryClient.setQueryData(['admin-feedback-detail', record.id], record);
      void queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
    },
  });

  const detail = detailQuery.data;
  const ownerRequired = editStatus === 'triaged' || editStatus === 'done';
  const canSave = !!detail && note.trim().length >= 3 && (!ownerRequired || !!ownerId) && !updateMutation.isPending;
  const pageCount = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 25));

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
          <strong className="text-[var(--color-text)]">{listQuery.data?.total ?? 0}</strong> matching submission(s)
        </p>
      </div>

      <section aria-label="Tester feedback status counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setStatus(value); setPage(1); setSelectedId(null); }}
            className={`min-h-20 rounded-lg border bg-white p-4 text-left transition-colors ${
              status === value ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/15' : 'border-[var(--color-border)]'
            }`}
          >
            <span className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label(value)}</span>
            <span className="mt-1 block text-2xl font-bold text-[var(--color-text)]">{listQuery.data?.counts[value] ?? 0}</span>
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search summary, tester, or device"
            aria-label="Search tester feedback"
            className="h-11 pl-9"
          />
        </div>
        <select
          value={area}
          onChange={(event) => { setArea(event.target.value); setPage(1); setSelectedId(null); }}
          aria-label="Filter tester feedback by app area"
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
        >
          <option value="">All app areas</option>
          {AREAS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-2">
          {listQuery.isLoading && <LoadingState />}
          {listQuery.isError && <ErrorState title="Feedback queue unavailable" description={getErrorMessage(listQuery.error)} />}
          {!listQuery.isLoading && !listQuery.isError && (listQuery.data?.submissions.length ?? 0) === 0 && (
            <Card className="p-6"><EmptyState title="No feedback matches" description="Try another status, area, or search." /></Card>
          )}
          {(listQuery.data?.submissions ?? []).map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => setSelectedId(record.id)}
              className={`w-full rounded-lg border bg-white p-4 text-left transition-colors ${
                selectedId === record.id ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/15' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
              }`}
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
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <span className="text-xs text-[var(--color-text-secondary)]">Page {page} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          )}
        </div>

        <div>
          {!selectedId && <Card className="p-8"><EmptyState title="No feedback selected" description="Choose a submission to review its evidence and record a decision." /></Card>}
          {selectedId && detailQuery.isLoading && <LoadingState />}
          {selectedId && detailQuery.isError && <ErrorState title="Feedback detail unavailable" description={getErrorMessage(detailQuery.error)} />}
          {detail && <FeedbackDetail record={detail} />}

          {detail && (
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
                    disabled={agentsQuery.isLoading || agentsQuery.isError}
                    className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-normal disabled:opacity-50"
                  >
                    <option value="">{agentsQuery.isLoading ? 'Loading active admins…' : 'Unassigned'}</option>
                    {(agentsQuery.data ?? []).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.first_name} {agent.last_name} ({label(agent.role)})</option>
                    ))}
                  </select>
                </label>
              </div>
              {agentsQuery.isError && <p role="alert" className="mt-2 text-xs text-red-700">Active admin owners could not be loaded.</p>}
              <label className="mt-4 block text-sm font-medium text-[var(--color-text)]">
                Triage note *
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Record what was verified, the linked work, or why this is non-actionable. Saved to the audit log."
                  aria-label="Tester feedback triage note"
                  className="mt-1.5"
                />
              </label>
              {ownerRequired && !ownerId && <p className="mt-2 text-xs text-amber-700">Triaged and done submissions require a named owner.</p>}
              {updateMutation.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getErrorMessage(updateMutation.error)}</p>}
              {updateMutation.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Feedback triage saved.</p>}
              <div className="mt-4 flex justify-end">
                <Button disabled={!canSave} onClick={() => updateMutation.mutate()}>{updateMutation.isPending ? 'Saving…' : 'Save triage'}</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackDetail({ record }: { record: FeedbackRecord }): React.ReactElement {
  const items = Array.isArray(record.payload.items) ? record.payload.items.filter(isObject) : [];
  const ratings = nonEmptyEntries(record.payload.ratings);
  const answers = nonEmptyEntries(record.payload.answers);
  const prices = nonEmptyEntries(record.payload.prices);
  const screenshots = useMemo(() => collectScreenshots(record.payload), [record.payload]);
  const ideas = typeof record.payload.ideas === 'string' ? record.payload.ideas.trim() : '';

  return (
    <Card className="overflow-hidden">
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
          <Meta label="Privacy" value={record.contactMasked ? 'Contact and free-text PII masked' : 'Super-admin view'} />
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
