import React, { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

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

const TIER_BADGE: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  new: 'default',
  verified: 'info',
  pro: 'success',
  elite: 'warning',
};

export default function ProvidersPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'tier';
    provider: Provider;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionTier, setActionTier] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminProviders', page, search, statusFilter, tierFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (tierFilter) params.tier = tierFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/providers', { params });
      return res.data;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!actionModal) return;
      const { type, provider } = actionModal;
      if (type === 'approve') {
        await api.put(`/api/v1/admin/providers/${provider.id}/approve`);
      } else if (type === 'reject') {
        await api.put(`/api/v1/admin/providers/${provider.id}/reject`, { reason: actionReason });
      } else if (type === 'suspend') {
        await api.put(`/api/v1/admin/providers/${provider.id}/suspend`, { reason: actionReason });
      } else if (type === 'reactivate') {
        await api.put(`/api/v1/admin/providers/${provider.id}/reactivate`);
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
    },
    onError: (err) => {
      setActionError(getErrorMessage(err));
    },
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const columns: Column<Provider>[] = [
    {
      key: 'name',
      header: 'Provider',
      render: (r) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">
            {r.fullName?.trim() || r.businessName || '(no name)'}
          </p>
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
        <span className="text-[var(--color-text)]">
          {r.rating != null ? `${r.rating.toFixed(1)} ★` : '—'}
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
          {new Date(r.createdAt).toLocaleDateString()}
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
            placeholder="Search by name or phone..."
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
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Tiers</option>
          <option value="new">New</option>
          <option value="verified">Verified</option>
          <option value="pro">Pro</option>
          <option value="elite">Elite</option>
        </select>
      </div>

      {isError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          Failed to load providers. Please try refreshing the page.
        </div>
      )}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No providers found." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1 capitalize">
              {actionModal.type} Provider
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {actionModal.provider.fullName?.trim() || actionModal.provider.businessName}
              {' — '}
              {actionModal.provider.phone}
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            {(actionModal.type === 'reject' || actionModal.type === 'suspend' || actionModal.type === 'tier') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Reason</label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Provide a reason..."
                  rows={3}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            )}

            {actionModal.type === 'tier' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">New Tier</label>
                <select
                  value={actionTier}
                  onChange={(e) => setActionTier(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                >
                  <option value="new">New</option>
                  <option value="verified">Verified</option>
                  <option value="pro">Pro</option>
                  <option value="elite">Elite</option>
                </select>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setActionModal(null); setActionReason(''); setActionError(''); }}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => actionMutation.mutate()}
                disabled={actionMutation.isPending || ((actionModal.type === 'suspend' || actionModal.type === 'reject' || actionModal.type === 'tier') && actionReason.trim().length < 10)}
                className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
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
