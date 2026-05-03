import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';
import { useAdminSocketEvent } from '@/lib/use-admin-socket';

interface Dispute {
  id: string;
  bookingId: string;
  filedBy: string;
  type: string;
  description: string;
  status: string;
  tier: number;
  assignedTo: string | null;
  resolutionType: string | null;
  refundAmount: number;
  refundPercent: number | null;
  decisionNotes: string | null;
  providerResponse: string | null;
  autoResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  customerName?: string;
  providerName?: string;
}

interface PaginatedResult {
  success: boolean;
  data: Dispute[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  open: 'warning',
  under_review: 'info',
  escalated: 'danger',
  resolved: 'success',
};

const TIER_VARIANT: Record<number, 'info' | 'warning' | 'danger'> = {
  1: 'info',
  2: 'warning',
  3: 'danger',
};

function formatType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DisputesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolutionType, setResolutionType] = useState('');
  const [refundPercent, setRefundPercent] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionType, setActionType] = useState<'resolve' | 'escalate' | null>(null);

  useAdminSocketEvent<{ id: string }>('dispute:filed', () => {
    void queryClient.invalidateQueries({ queryKey: ['adminDisputes'] });
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminDisputes', page, statusFilter, tierFilter, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (statusFilter) params.status = statusFilter;
      if (tierFilter) params.tier = tierFilter;
      if (search) params.search = search;
      const res = await api.get<PaginatedResult>('/api/v1/disputes', { params });
      return res.data;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDispute) return;
      if (actionType === 'resolve') {
        await api.put(`/api/v1/disputes/${selectedDispute.id}/resolve`, {
          resolutionType,
          refundPercent: refundPercent ? Number(refundPercent) : undefined,
          decisionNotes,
          internalNotes: internalNotes.trim() || undefined,
        });
      } else if (actionType === 'escalate') {
        await api.post(`/api/v1/disputes/${selectedDispute.id}/escalate`, {
          reason: decisionNotes,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminDisputes'] });
      closeModal();
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  function closeModal(): void {
    setSelectedDispute(null);
    setActionType(null);
    setResolutionType('');
    setRefundPercent('');
    setDecisionNotes('');
    setInternalNotes('');
    setActionError('');
  }

  function openResolve(d: Dispute): void {
    setSelectedDispute(d);
    setActionType('resolve');
  }

  function openEscalate(d: Dispute): void {
    setSelectedDispute(d);
    setActionType('escalate');
  }

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const columns: Column<Dispute>[] = [
    {
      key: 'id',
      header: 'Dispute',
      render: (r) => (
        <Link to={`/disputes/${r.id}`} className="font-mono text-xs text-[var(--color-link)] hover:underline">{r.id.slice(0, 8)}</Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => (
        <span className="text-[var(--color-text)] font-medium">{formatType(r.type)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge label={r.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[r.status] ?? 'default'} />
      ),
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (r) => (
        <Badge label={`Tier ${r.tier}`} variant={TIER_VARIANT[r.tier] ?? 'default'} />
      ),
    },
    {
      key: 'refund',
      header: 'Refund',
      render: (r) => (
        <span className="text-[var(--color-text)]">
          {r.refundAmount > 0 ? formatCurrency(r.refundAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Filed',
      render: (r) => (
        <span className="text-[var(--color-text-secondary)]">
          {new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1 flex-wrap">
          {r.status !== 'resolved' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); openResolve(r); }}
                className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
              >
                Resolve
              </button>
              {r.tier < 3 && (
                <button
                  onClick={(e) => { e.stopPropagation(); openEscalate(r); }}
                  className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
                >
                  Escalate
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Dispute Resolution</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Review and resolve customer disputes
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by dispute or booking ID..."
            aria-label="Search disputes by dispute or booking ID"
            className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter disputes by status"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          aria-label="Filter disputes by tier"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
      </div>

      {isError && <p className="text-sm text-red-600 mb-4">Failed to load disputes. Please try again.</p>}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No disputes found." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      {selectedDispute && actionType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1 capitalize">
              {actionType === 'resolve' ? 'Resolve Dispute' : 'Escalate Dispute'}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {formatType(selectedDispute.type)} — Tier {selectedDispute.tier}
            </p>

            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
              <p className="text-[var(--color-text)]">{selectedDispute.description}</p>
              {selectedDispute.providerResponse && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Provider Response:</p>
                  <p className="text-[var(--color-text)]">{selectedDispute.providerResponse}</p>
                </div>
              )}
            </div>

            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            {actionType === 'resolve' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Resolution Type</label>
                  <select
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                  >
                    <option value="">Select resolution...</option>
                    <option value="full_refund">Full Refund</option>
                    <option value="partial_refund">Partial Refund</option>
                    <option value="no_refund">No Refund</option>
                    <option value="free_redo">Free Redo</option>
                    <option value="split_decision">Split Decision</option>
                    <option value="refund_with_warning">Refund + Provider Warning</option>
                    <option value="refund_with_suspension">Refund + Provider Suspension</option>
                  </select>
                </div>

                {(resolutionType === 'partial_refund' || resolutionType === 'split_decision') && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Refund Percentage</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={refundPercent}
                      onChange={(e) => setRefundPercent(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                    />
                  </div>
                )}
              </>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                {actionType === 'resolve' ? 'Decision Notes *' : 'Escalation Reason *'}
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                rows={3}
                placeholder={actionType === 'resolve' ? 'Explain the decision reasoning (min 20 characters)...' : 'Why is this being escalated (min 10 characters)?'}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              />
            </div>

            {actionType === 'resolve' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Internal Notes (optional)</label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes visible only to admins (not shared with customer or provider)"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveMutation.mutate()}
                disabled={
                  resolveMutation.isPending ||
                  !decisionNotes.trim() ||
                  (actionType === 'resolve' && decisionNotes.trim().length < 20) ||
                  (actionType === 'escalate' && decisionNotes.trim().length < 10) ||
                  (actionType === 'resolve' && !resolutionType) ||
                  (actionType === 'resolve' && (resolutionType === 'partial_refund' || resolutionType === 'split_decision') && (!refundPercent || Number(refundPercent) < 1 || Number(refundPercent) > 100))
                }
                className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {resolveMutation.isPending ? 'Processing...' : actionType === 'resolve' ? 'Resolve' : 'Escalate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
