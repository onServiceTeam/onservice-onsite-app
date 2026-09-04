import React, { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { Badge, Button, DataTable, ErrorState, Pagination, type Column } from '@/components/ui';
import { VettingChecklist, buildChecklistSummary, type VettingState } from '@/components/VettingChecklist';
import { Star } from '@/components/icons';

interface Provider {
  id: string;
  userId: string;
  businessName: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  tier: string;
  rating: number;
  totalReviews: number;
  totalJobs: number;
  serviceRadiusKm: number;
  isAvailable: boolean;
  city: string | null;
  province: string | null;
  createdAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: Provider[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  suspended: 'danger',
  deactivated: 'danger',
};

// Bug 1323 fix (Phase 14 D02 Part 3): founding-batch tier added.
const TIER_BADGE: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  founding: 'warning',
  new: 'default',
  verified: 'info',
  pro: 'success',
  elite: 'warning',
};

export default function ProvidersPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [tierFilter, setTierFilter] = useState(() => searchParams.get('tier') ?? '');
  const serviceAreaFilter = searchParams.get('serviceAreaId')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '');

  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'tier';
    provider: Provider;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionTier, setActionTier] = useState('');
  const [actionError, setActionError] = useState('');
  // Vetting checklist state for the approve flow (rationale + all-items-ticked).
  const [vetting, setVetting] = useState<VettingState>({ isComplete: false, rationale: '' });

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setStatusFilter(searchParams.get('status') ?? '');
    setTierFilter(searchParams.get('tier') ?? '');
    setPage(1);
  }, [searchParams]);

  const updateUrlFilters = (next: { search?: string; status?: string; tier?: string }): void => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adminProviders', page, search, statusFilter, tierFilter, serviceAreaFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (tierFilter) params.tier = tierFilter;
      if (serviceAreaFilter) params.serviceAreaId = serviceAreaFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/providers', { params });
      return res.data;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!actionModal) return;
      const { type, provider } = actionModal;
      if (type === 'approve') {
        await api.put(`/api/v1/admin/providers/${provider.id}/approve`, {
          reason: vetting.rationale,
          checklistConfirmed: true,
          checklistSummary: buildChecklistSummary(),
        });
      } else if (type === 'reject') {
        await api.put(`/api/v1/admin/providers/${provider.id}/reject`, { reason: actionReason });
      } else if (type === 'suspend') {
        await api.put(`/api/v1/admin/providers/${provider.id}/suspend`, { reason: actionReason });
      } else if (type === 'reactivate') {
        await api.put(`/api/v1/admin/providers/${provider.id}/reactivate`, { reason: actionReason });
      } else if (type === 'tier') {
        await api.put(`/api/v1/admin/providers/${provider.id}/tier`, { tier: actionTier, reason: actionReason });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminProviders'] });
      setActionModal(null);
      setActionReason('');
      setActionTier('');
      setActionError('');
      setVetting({ isComplete: false, rationale: '' });
    },
    onError: (err) => {
      setActionError(getErrorMessage(err));
    },
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    updateUrlFilters({ search: searchInput.trim() });
  };

  const columns: Column<Provider>[] = [
    {
      key: 'name',
      header: 'Provider',
      render: (r) => (
        <div>
          <Link
            to={`/providers/${r.id}`}
            className="font-medium text-[var(--color-text)] hover:text-[var(--color-secondary)] hover:underline"
          >
            {r.fullName?.trim() || r.businessName || '(no name)'}
          </Link>
          <p className="text-xs text-[var(--color-text-secondary)]">{r.phone}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge label={r.status} variant={STATUS_BADGE[r.status] ?? 'default'} />,
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (r) => <Badge label={r.tier} variant={TIER_BADGE[r.tier] ?? 'default'} />,
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-[var(--color-text)]">
          {r.rating != null ? <>{r.rating.toFixed(1)} <Star size={13} className="text-amber-500" fill="currentColor" aria-hidden="true" /></> : '—'}
        </span>
      ),
    },
    {
      key: 'jobs',
      header: 'Jobs',
      render: (r) => <span className="text-[var(--color-text)]">{r.totalJobs}</span>,
    },
    {
      key: 'joined',
      header: 'Joined',
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
          {r.status === 'pending' && (
            <>
              <ActionBtn label="Approve" color="emerald" onClick={() => setActionModal({ type: 'approve', provider: r })} />
              <ActionBtn label="Reject" color="red" onClick={() => setActionModal({ type: 'reject', provider: r })} />
            </>
          )}
          {r.status === 'approved' && (
            <ActionBtn label="Suspend" color="red" onClick={() => setActionModal({ type: 'suspend', provider: r })} />
          )}
          {r.status === 'suspended' && (
            <ActionBtn label="Reactivate" color="sky" onClick={() => setActionModal({ type: 'reactivate', provider: r })} />
          )}
          <ActionBtn label="Tier" color="amber" onClick={() => {
            setActionTier(r.tier);
            setActionModal({ type: 'tier', provider: r });
          }} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Provider Management</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Manage, approve, and configure service providers
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, business, phone, email, or ID"
            aria-label="Search providers by name, business, phone, email, or ID"
            className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); updateUrlFilters({ status: e.target.value }); }}
          aria-label="Filter providers by status"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); updateUrlFilters({ tier: e.target.value }); }}
          aria-label="Filter providers by tier"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          {/* BUG-PHASE38-03 fix — pre-fix this list was missing
              "founding" even though TIER_BADGE handles it (Phase 14
              D02 Part 3). Founding-batch providers couldn't be
              filtered. */}
          <option value="">All Tiers</option>
          <option value="founding">Founding</option>
          <option value="new">New</option>
          <option value="verified">Verified</option>
          <option value="pro">Pro</option>
          <option value="elite">Elite</option>
        </select>
      </div>

      {serviceAreaFilter && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <div>
            <p className="font-semibold">Service Area provider view</p>
            <p className="mt-0.5">Showing providers assigned to the selected market. Status and tier filters still apply.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/service-areas" className="inline-flex min-h-11 items-center rounded-lg border border-sky-300 bg-white px-3 py-2 font-medium">Back to Service Areas</Link>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('serviceAreaId');
                setSearchParams(params, { replace: true });
              }}
              className="min-h-11 rounded-lg bg-[var(--color-primary)] px-3 py-2 font-medium text-white"
            >
              Clear market filter
            </button>
          </div>
        </div>
      )}

      {isError && (
        <ErrorState
          title="Provider directory unavailable"
          description="The provider directory could not be read. Do not make approval, suspension, or tier decisions from an unavailable queue."
          action={<Button variant="outline" onClick={() => void refetch()}>Retry providers</Button>}
        />
      )}

      {!isError && (
        <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No providers found." />
      )}

      {!isError && data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-action-title"
            className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6"
          >
            <h3 id="provider-action-title" className="text-lg font-semibold text-[var(--color-text)] mb-1 capitalize">
              {actionModal.type} Provider
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {actionModal.provider.fullName?.trim() || actionModal.provider.businessName}
              {' — '}
              {actionModal.provider.phone}
            </p>

            {actionModal.type === 'reactivate' && (
              <p className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text-secondary)]">
                Reactivation restores future discovery, matching, and job acceptance. It does not clear review holds on bookings that were active when the provider was suspended.
              </p>
            )}

            {actionModal.type === 'suspend' && (
              <p className="mb-4 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-text-secondary)]">
                Suspension removes the provider from future matching and flags in-progress work for admin review before escrow can be released.
              </p>
            )}

            {actionError && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            {(actionModal.type === 'reject' || actionModal.type === 'suspend' || actionModal.type === 'reactivate' || actionModal.type === 'tier') && (
              <div className="mb-4">
                <label htmlFor="provider-action-reason" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Reason</label>
                <textarea
                  id="provider-action-reason"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Provide a reason..."
                  rows={3}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  At least 10 characters required. Saved to the audit record; account-status reasons are sent to the provider.
                </p>
              </div>
            )}

            {actionModal.type === 'approve' && (
              <div className="mb-4">
                <VettingChecklist onChange={setVetting} />
              </div>
            )}

            {actionModal.type === 'tier' && (
              <div className="mb-4">
                <label htmlFor="provider-action-tier" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">New Tier</label>
                <select
                  id="provider-action-tier"
                  value={actionTier}
                  onChange={(e) => setActionTier(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                >
                  {/* BUG-PHASE38-03 fix — same as filter above. */}
                  <option value="founding">Founding</option>
                  <option value="new">New</option>
                  <option value="verified">Verified</option>
                  <option value="pro">Pro</option>
                  <option value="elite">Elite</option>
                </select>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setActionModal(null); setActionReason(''); setActionError(''); setVetting({ isComplete: false, rationale: '' }); }}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => actionMutation.mutate()}
                disabled={
                  actionMutation.isPending ||
                  ((actionModal.type === 'suspend' || actionModal.type === 'reactivate' || actionModal.type === 'reject' || actionModal.type === 'tier') && actionReason.trim().length < 10) ||
                  (actionModal.type === 'approve' && !vetting.isComplete)
                }
                className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
              >
                {actionMutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_COLORS: Record<string, string> = {
  emerald: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
  red: 'text-red-700 bg-red-50 hover:bg-red-100',
  sky: 'text-sky-700 bg-sky-50 hover:bg-sky-100',
  amber: 'text-amber-700 bg-amber-50 hover:bg-amber-100',
};

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${ACTION_COLORS[color] ?? ''}`}
    >
      {label}
    </button>
  );
}
