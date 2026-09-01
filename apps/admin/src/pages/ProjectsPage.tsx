import React, { useEffect, useState, type FormEvent } from 'react';
// D27 Phase 5 — admin oversight of the project layer (read-only).
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Pagination } from '@/components/ui';
import { Hammer } from '@/components/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { adminConfig } from '@/config/admin.config';

interface Project {
  id: string;
  customerId: string;
  providerId: string | null;
  title: string;
  description: string;
  city: string | null;
  status: string;
  estimatedTotal: number | null;
  createdAt: string;
  customerName?: string;
  providerName?: string | null;
}

interface Milestone { id: string; title: string; description: string; status: string; amount: number | null; targetDate: string | null }
interface Selection { id: string; category: string; label: string; value: string; detail: string | null }
interface ProjectDoc { id: string; label: string; fileUrl: string; docType: string }
interface ProjectDetail extends Project {
  milestones: Milestone[];
  selections: Selection[];
  documents: ProjectDoc[];
}

interface AdminProjectListResponse {
  success: boolean;
  data: Project[];
  summary: { totalProjects: number; activeProjects: number; legacyProviderLinks: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  planning: 'info', active: 'warning', on_hold: 'default', completed: 'success', cancelled: 'danger',
};

function projectIdFromSearch(searchParams: URLSearchParams): string | null {
  const projectId = searchParams.get('projectId')?.trim() ?? '';
  return /^[A-Za-z0-9-]{1,100}$/.test(projectId) ? projectId : null;
}

function pageFromSearch(searchParams: URLSearchParams): number {
  const page = Number(searchParams.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function statusFromSearch(searchParams: URLSearchParams): string {
  const status = searchParams.get('status') ?? '';
  return ['planning', 'active', 'on_hold', 'completed', 'cancelled'].includes(status) ? status : '';
}

function appliedSearchFromSearch(searchParams: URLSearchParams): string {
  const search = searchParams.get('search')?.trim() ?? '';
  return search.length >= 2 && search.length <= 100 ? search : '';
}

function ProjectDetailPanel({ projectId }: { projectId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-project', projectId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ProjectDetail }>(`/api/v1/projects/${projectId}`);
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState label="Loading project planning details…" className="py-6" />;
  if (q.isError || !q.data) return <ErrorState title="Project details unavailable" description={getErrorMessage(q.error)} className="m-4" />;

  const p = q.data;
  return (
    <div className="space-y-4 border-t border-[var(--color-border)] bg-slate-50/60 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Selected planning record</p>
          <p className="font-semibold text-[var(--color-text)]">{p.title}</p>
          <p className="line-clamp-2 text-xs text-[var(--color-text-secondary)]">{p.description || 'No planning description provided.'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-2 text-xs font-semibold">
          <Link className="text-[var(--color-secondary)] hover:underline" to={`/customers/${p.customerId}`}>{p.customerName || 'Open Customer 360'}</Link>
          <Link className="text-[var(--color-secondary)] hover:underline" to={`/support-tickets?userId=${encodeURIComponent(p.customerId)}`}>Open customer support cases</Link>
          {p.providerId ? <Link className="text-[var(--color-secondary)] hover:underline" to={`/providers/${p.providerId}`}>{p.providerName || 'Open legacy provider'}</Link> : null}
        </div>
      </div>
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        Planning record only. This project is not a booking, provider assignment, quote, escrow, or payment record.
      </div>
      <div>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Milestones ({p.milestones.length})</span>
        {p.milestones.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">None</p>
        ) : (
          <div className="mt-1 space-y-1">
            {p.milestones.map((m) => (
              <div key={m.id} className="flex min-h-11 flex-col justify-between gap-2 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)]">{m.title}</p>
                  {m.description ? <p className="text-xs text-[var(--color-text-secondary)]">{m.description}</p> : null}
                  {m.targetDate ? <p className="text-[11px] text-[var(--color-text-secondary)]">Target date: {m.targetDate}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {m.amount != null ? <span className="text-xs text-[var(--color-text-secondary)]">{formatCurrency(m.amount)}</span> : null}
                  <Badge label={m.status} variant={m.status === 'completed' ? 'success' : m.status === 'in_progress' ? 'warning' : 'default'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Choices &amp; materials ({p.selections.length})</span>
        {p.selections.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">None</p>
        ) : (
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {p.selections.map((s) => (
              <div key={s.id} className="bg-white rounded-md px-3 py-1.5 border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-secondary)]">{s.category} · {s.label}</p>
                <p className="text-sm text-[var(--color-text)]">{s.value}{s.detail ? ` (${s.detail})` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Documents ({p.documents.length})</span>
        {p.documents.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">None</p>
        ) : (
          <div className="mt-1 space-y-1">
            {p.documents.map((d) => (
              <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 hover:bg-slate-50">
                <span className="text-sm text-sky-700">{d.label}</span>
                <span className="text-xs text-[var(--color-text-tertiary)]">{d.docType}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const expanded = projectIdFromSearch(searchParams);
  const page = pageFromSearch(searchParams);
  const status = statusFromSearch(searchParams);
  const appliedSearch = appliedSearchFromSearch(searchParams);
  const [searchDraft, setSearchDraft] = useState(() => appliedSearch);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    setSearchDraft(appliedSearch);
    setSearchError('');
  }, [appliedSearch]);

  const q = useQuery({
    queryKey: ['admin-projects', page, status, appliedSearch],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        pageSize: adminConfig.defaultPageSize,
      };
      if (status) params.status = status;
      if (appliedSearch) params.search = appliedSearch;
      const res = await api.get<AdminProjectListResponse>('/api/v1/admin/projects', { params });
      return res.data;
    },
  });
  const projects = q.data?.data ?? [];
  const expandedInLoadedList = !!expanded && projects.some((project) => project.id === expanded);

  const selectProject = (projectId: string | null): void => {
    const next = new URLSearchParams(searchParams);
    if (projectId) next.set('projectId', projectId);
    else next.delete('projectId');
    setSearchParams(next);
  };

  const updateFilters = (updates: { search?: string; status?: string }): void => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const setPage = (nextPage: number): void => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next, { replace: true });
  };

  const submitSearch = (event: FormEvent): void => {
    event.preventDefault();
    const nextSearch = searchDraft.trim();
    if (nextSearch.length === 1) {
      setSearchError('Enter at least 2 characters, or clear the search.');
      return;
    }
    setSearchError('');
    updateFilters({ search: nextSearch });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Projects</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Customer planning records. Hiring, bookings, quotes, and money are managed in their own operational areas.</p>
      </div>

      <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-semibold">Planning-only boundary</p>
        <p className="mt-1 text-xs">Projects cannot currently invite or assign a provider, create a booking, move money, or open project-scoped support. A provider shown below is a legacy link. Use Customer 360 and the booking/support workspaces for operational action.</p>
      </div>

      <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-white p-4" aria-label="Project planning queue controls">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <form className="min-w-0 flex-1" onSubmit={submitSearch}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => {
                  setSearchDraft(event.currentTarget.value);
                  if (searchError) setSearchError('');
                }}
                minLength={2}
                maxLength={100}
                aria-label="Search project planning records"
                aria-describedby={searchError ? 'project-search-error' : undefined}
                placeholder="Project ID, title, customer, provider, or city"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              />
              <Button type="submit">Search</Button>
            </div>
            {searchError ? <p id="project-search-error" role="alert" className="mt-2 text-xs text-red-700">{searchError}</p> : null}
          </form>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={status}
              onChange={(event) => updateFilters({ status: event.currentTarget.value })}
              aria-label="Filter project planning records by status"
              className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            >
              <option value="">All statuses</option>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {(appliedSearch || status) ? (
              <Button variant="outline" onClick={() => updateFilters({ search: '', status: '' })}>Clear filters</Button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Search and status apply to the complete planning-record index. Selection remains in the URL for a reproducible support handoff.</p>
      </section>

      {!q.isLoading && !q.isError && q.data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5" aria-label="Project planning summary">
          <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--color-text-secondary)]">Matching planning records</p><p className="text-xl font-bold text-[var(--color-text)]">{q.data.summary.totalProjects}</p></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--color-text-secondary)]">Marked active in this result</p><p className="text-xl font-bold text-[var(--color-text)]">{q.data.summary.activeProjects}</p></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--color-text-secondary)]">Legacy provider links in this result</p><p className="text-xl font-bold text-[var(--color-text)]">{q.data.summary.legacyProviderLinks}</p></div>
        </div>
      ) : null}

      {!q.isLoading && !q.isError && expanded && !expandedInLoadedList ? (
        <section className="mb-5 overflow-hidden rounded-xl border border-sky-300 bg-white" aria-label="Linked project planning record">
          <div className="flex flex-col justify-between gap-3 bg-sky-50 px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-sky-950">Exact linked project</p>
              <p className="text-xs text-sky-900">This record is outside the current result page. Actions and links in this panel apply to the exact project in the URL.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => selectProject(null)}>Close linked project</Button>
          </div>
          <ProjectDetailPanel projectId={expanded} />
        </section>
      ) : null}

      {q.isLoading ? (
        <LoadingState label="Loading customer planning records…" />
      ) : q.isError ? (
        <ErrorState
          title="Projects unavailable"
          description={getErrorMessage(q.error)}
          action={<Button variant="outline" size="sm" onClick={() => void q.refetch()}>Retry</Button>}
        />
      ) : projects.length === 0 ? (
        <EmptyState icon={<Hammer size={40} />} title="No project planning records match" description={appliedSearch || status ? 'Clear or change the filters to inspect other customer plans.' : 'Customer-created larger-work plans will appear here.'} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white" aria-label="Customer project planning records">
          {projects.map((p) => (
            <article key={p.id} className="border-b border-[var(--color-border)] last:border-b-0">
              <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_0.8fr]">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Project plan</p>
                  <p className="font-semibold text-[var(--color-text)]">{p.title}</p>
                  <p className="line-clamp-2 text-xs text-[var(--color-text-secondary)]">{p.description || 'No planning description provided.'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Customer and support</p>
                  <Link className="block truncate text-sm font-medium text-[var(--color-secondary)] hover:underline" to={`/customers/${p.customerId}`}>{p.customerName || 'Open customer'}</Link>
                  <Link className="mt-1 block text-xs font-semibold text-[var(--color-secondary)] hover:underline" to={`/support-tickets?userId=${encodeURIComponent(p.customerId)}`}>Open customer support cases</Link>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Planning context</p>
                  <p className="text-sm text-[var(--color-text)]">{p.city ?? 'City not recorded'}</p>
                  {p.providerId ? <Link className="mt-1 block truncate text-sm font-medium text-[var(--color-secondary)] hover:underline" to={`/providers/${p.providerId}`}>{p.providerName || 'Open legacy provider'}</Link> : <p className="mt-1 text-xs text-[var(--color-text-secondary)]">No provider link</p>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Badge label={p.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[p.status] ?? 'default'} /></div>
                  <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{p.estimatedTotal != null ? formatCurrency(p.estimatedTotal) : 'No estimate'}</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">Advisory only, not a charge</p>
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] px-4 py-2">
                <button
                  type="button"
                  aria-expanded={expanded === p.id}
                  aria-controls={`project-detail-${p.id}`}
                  onClick={() => selectProject(expanded === p.id ? null : p.id)}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--color-primary)] hover:bg-slate-50"
                >
                  {expanded === p.id ? 'Hide planning details' : 'Review milestones, choices, and documents'}
                </button>
              </div>
              {expanded === p.id ? <div id={`project-detail-${p.id}`}><ProjectDetailPanel projectId={p.id} /></div> : null}
            </article>
          ))}
        </section>
      )}
      {q.data && q.data.pagination.totalPages > 1 ? (
        <Pagination {...q.data.pagination} onPageChange={setPage} />
      ) : null}
    </div>
  );
}
