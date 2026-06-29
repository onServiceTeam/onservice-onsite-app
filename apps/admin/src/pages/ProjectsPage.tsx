import React, { useState, Fragment } from 'react';
// D27 Phase 5 — admin oversight of the project layer (read-only).
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Badge } from '@/components/ui';
import { Hammer } from '@/components/icons';

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

  if (q.isLoading) return <p className="text-xs text-[var(--color-text-secondary)] px-5 py-3">Loading project…</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-xs text-red-600 px-5 py-3">{getErrorMessage(q.error)}</p>;

  const p = q.data;
  return (
    <div className="px-5 py-3 bg-slate-50/60 space-y-3">
      <div>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Milestones ({p.milestones.length})</span>
        {p.milestones.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">None</p>
        ) : (
          <div className="mt-1 space-y-1">
            {p.milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-white rounded-md px-3 py-1.5 border border-[var(--color-border)]">
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
          <div className="mt-1 grid grid-cols-2 gap-1">
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
              <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-white rounded-md px-3 py-1.5 border border-[var(--color-border)] hover:bg-slate-50">
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Projects</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Multi-stage jobs with milestones, choices, and documents</p>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-[var(--color-secondary)] border-t-transparent rounded-full" />
        </div>
      ) : q.isError ? (
        <p className="text-sm text-red-600 py-10 text-center">{getErrorMessage(q.error)}</p>
      ) : (q.data ?? []).length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          <Hammer size={40} className="mx-auto mb-3 text-slate-400" />
          <p>No projects yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/70 text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                <th className="text-left px-5 py-2 font-semibold">Project</th>
                <th className="text-left px-4 py-2 font-semibold">City</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-right px-5 py-2 font-semibold">Est. total</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((p) => (
                <Fragment key={p.id}>
                  <tr
                    className="border-t border-[var(--color-border)] cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  >
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-[var(--color-text)]">{p.title}</p>
                      <p className="text-xs text-[var(--color-text-secondary)] line-clamp-1">{p.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{p.city ?? '—'}</td>
                    <td className="px-4 py-3"><Badge label={p.status} variant={STATUS_VARIANT[p.status] ?? 'default'} /></td>
                    <td className="px-5 py-3 text-right text-sm text-[var(--color-text)]">{p.estimatedTotal != null ? formatCurrency(p.estimatedTotal) : '—'}</td>
                  </tr>
                  {expanded === p.id && (
                    <tr>
                      <td colSpan={4} className="p-0"><ProjectDetailPanel projectId={p.id} /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
