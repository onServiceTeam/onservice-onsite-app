import React, { useState } from 'react';
// D27 Phase 5 — admin oversight of the project layer (read-only).
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Badge, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Hammer } from '@/components/icons';
import { Link } from 'react-router-dom';

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

interface Milestone { id: string; title: string; status: string; amount: number | null; targetDate: string | null }
interface Selection { id: string; category: string; label: string; value: string; detail: string | null }
interface ProjectDoc { id: string; label: string; fileUrl: string; docType: string }
interface ProjectDetail extends Project {
  milestones: Milestone[];
  selections: Selection[];
  documents: ProjectDoc[];
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  planning: 'info', active: 'warning', on_hold: 'default', completed: 'success', cancelled: 'danger',
};

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
                <span className="text-sm text-[var(--color-text)]">{m.title}</span>
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['admin-projects'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Project[] }>('/api/v1/projects');
      return res.data.data;
    },
  });
  const projects = q.data ?? [];
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const linkedProviderCount = projects.filter((p) => Boolean(p.providerId)).length;

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

      {!q.isLoading && !q.isError && projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5" aria-label="Project planning summary">
          <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--color-text-secondary)]">Newest planning records loaded</p><p className="text-xl font-bold text-[var(--color-text)]">{projects.length}</p></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--color-text-secondary)]">Marked active</p><p className="text-xl font-bold text-[var(--color-text)]">{activeCount}</p></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--color-text-secondary)]">Legacy provider links</p><p className="text-xl font-bold text-[var(--color-text)]">{linkedProviderCount}</p></div>
        </div>
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
        <EmptyState icon={<Hammer size={40} />} title="No project planning records yet" description="Customer-created larger-work plans will appear here." />
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
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
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
    </div>
  );
}
