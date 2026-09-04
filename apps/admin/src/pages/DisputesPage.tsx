import React, { useEffect, useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { DataFreshness, DataTable, Badge, Button, ErrorState, Pagination, type Column } from '@/components/ui';
import { useAdminSocketEvent } from '@/lib/use-admin-socket';
import { useAuthStore } from '@/stores/auth.store';

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
  // Phase 200 fix — resolve/escalate are super_admin-only on the server
  // (dispute.routes.ts rbacMiddleware('super_admin')). Pre-fix the buttons
  // rendered for every admin, so a regular admin hit a guaranteed 403. The
  // detail page already gates on isSuperAdmin; match that here.
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [tierFilter, setTierFilter] = useState(() => searchParams.get('tier') ?? '');
  const [viewFilter, setViewFilter] = useState(() => {
    const value = searchParams.get('view');
    return value === 'active' || value === 'stale' ? value : '';
  });
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');

  useAdminSocketEvent<{ id: string }>('dispute:filed', () => {
    void queryClient.invalidateQueries({ queryKey: ['adminDisputes'] });
  });
  useAdminSocketEvent<{ id: string }>('dispute:updated', () => {
    void queryClient.invalidateQueries({ queryKey: ['adminDisputes'] });
  });

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setStatusFilter(searchParams.get('status') ?? '');
    setTierFilter(searchParams.get('tier') ?? '');
    const nextView = searchParams.get('view');
    setViewFilter(nextView === 'active' || nextView === 'stale' ? nextView : '');
    setPage(1);
  }, [searchParams]);

  const updateUrlFilters = (next: { search?: string; status?: string; tier?: string; view?: string }): void => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  };

  const { data, isLoading, isError, refetch, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['adminDisputes', page, statusFilter, tierFilter, viewFilter, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (statusFilter) params.status = statusFilter;
      if (tierFilter) params.tier = tierFilter;
      if (viewFilter) params.view = viewFilter;
      if (search) params.search = search;
      const res = await api.get<PaginatedResult>('/api/v1/disputes', { params });
      return res.data;
    },
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    const nextSearch = searchInput.trim();
    setSearch(nextSearch);
    setPage(1);
    updateUrlFilters({ search: nextSearch });
  };

  const columns: Column<Dispute>[] = [
    {
      key: 'id',
      header: 'Dispute',
      render: (r) => (
        <Link to={`/disputes/${r.id}`} className="font-mono text-xs text-[var(--color-primary)] hover:underline">{r.id.slice(0, 8)}</Link>
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
      key: 'parties',
      header: 'Parties',
      // BUG-PHASE40-03 fix — pre-fix the list showed only dispute id
      // and type. Admin had no idea who the dispute was between
      // without clicking through. customerName/providerName are on
      // the API payload (when the join populates them) and were
      // declared as optional on the Dispute interface — now visible
      // at a glance.
      render: (r) => (
        <div className="text-xs">
          <p className="text-[var(--color-text)]">{r.customerName ?? '—'}</p>
          <p className="text-[var(--color-text-secondary)]">vs. {r.providerName ?? '(unassigned)'}</p>
          <Link
            to={`/bookings/${r.bookingId}`}
            className="font-mono text-[10px] text-[var(--color-primary)] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            BK {r.bookingId.slice(0, 8)}
          </Link>
        </div>
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
      header: 'Approved refund',
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
        <Link
          to={`/disputes/${r.id}`}
          aria-label={`Review dispute ${r.id} in Dispute 360`}
          className="inline-flex px-2 py-1 text-xs font-medium text-[var(--color-primary)] bg-slate-50 hover:bg-slate-100 rounded-md transition-colors"
        >
          Review 360
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Dispute Resolution</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Review customer disputes and open the full case workspace for decisions
        </p>
        {!isSuperAdmin && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
            You have read-only access. Open Dispute 360 to review the complete case; decisions require a super-admin account.
          </p>
        )}
        <div className="mt-3">
          <DataFreshness
            label="Dispute queue"
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => { void refetch(); }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex w-full gap-2 sm:w-auto">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by dispute or booking ID..."
            aria-label="Search disputes by dispute or booking ID"
            className="h-11 min-w-0 flex-1 px-3 border border-[var(--color-border)] rounded-lg text-sm sm:w-72 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button type="submit" className="h-11 px-4 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
            Search
          </button>
        </form>
        <select
          value={viewFilter}
          onChange={(e) => {
            setViewFilter(e.target.value);
            setStatusFilter('');
            setPage(1);
            updateUrlFilters({ view: e.target.value, status: '' });
          }}
          aria-label="Filter disputes by operational view"
          className="h-11 px-3 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All dispute records</option>
          <option value="active">Active queue</option>
          <option value="stale">Open 48h+ attention</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setViewFilter('');
            setPage(1);
            updateUrlFilters({ status: e.target.value, view: '' });
          }}
          aria-label="Filter disputes by status"
          className="h-11 px-3 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); updateUrlFilters({ tier: e.target.value }); }}
          aria-label="Filter disputes by tier"
          className="h-11 px-3 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
      </div>

      {isError ? (
        <ErrorState
          title="Dispute queue unavailable"
          description="The dispute queue could not be read. Do not treat this as an empty queue."
          action={<Button variant="outline" onClick={() => void refetch()}>Retry disputes</Button>}
        />
      ) : (
        <>
          <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No disputes found." />

          {data && data.pagination.totalPages > 1 && (
            <Pagination {...data.pagination} onPageChange={setPage} />
          )}
        </>
      )}

    </div>
  );
}
