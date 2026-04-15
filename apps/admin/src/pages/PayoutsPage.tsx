import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface Payout {
  id: string;
  providerId: string;
  walletId: string;
  amount: number;
  method: string;
  destinationAccount: string;
  accountName: string;
  status: string;
  paymongoTransferId: string | null;
  failureReason: string | null;
  rejectionReason: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PaginatedResult {
  success: boolean;
  data: Payout[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  pending: 'warning',
  approved: 'info',
  processing: 'info',
  completed: 'success',
  rejected: 'danger',
  failed: 'danger',
};

function formatCurrency(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function PayoutsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'complete' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [transferId, setTransferId] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminPayouts', page, statusFilter, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: 20 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.providerId = search;
      const res = await api.get<PaginatedResult>('/api/v1/payouts', { params });
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayout) return;
      if (actionType === 'approve') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/approve`);
      } else if (actionType === 'reject') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/reject`, { reason: rejectReason });
      } else if (actionType === 'complete') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/complete`, {
          paymongoTransferId: transferId || undefined,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPayouts'] });
      closeModal();
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  function closeModal() {
    setSelectedPayout(null);
    setActionType(null);
    setRejectReason('');
    setTransferId('');
    setActionError('');
  }

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const columns: Column<Payout>[] = [
    {
      key: 'id',
      header: 'Payout',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-text)]">{r.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (r) => (
        <span className="font-semibold text-[var(--color-text)]">{formatCurrency(r.amount)}</span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (r) => (
        <div>
          <span className="text-[var(--color-text)] font-medium uppercase text-xs">{r.method}</span>
          <p className="text-xs text-[var(--color-text-secondary)] truncate max-w-[140px]">{r.destinationAccount}</p>
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
      key: 'date',
      header: 'Requested',
      render: (r) => (
        <span className="text-[var(--color-text-secondary)] text-xs">
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
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedPayout(r); setActionType('approve'); }}
                className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
              >
                Approve
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedPayout(r); setActionType('reject'); }}
                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
              >
                Reject
              </button>
            </>
          )}
          {r.status === 'approved' && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedPayout(r); setActionType('complete'); }}
              className="px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
            >
              Complete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Payout Management</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Review and process provider payout requests
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Filter by provider ID..."
            className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
            Filter
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
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {isError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          Failed to load payouts. Please try refreshing the page.
        </div>
      )}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No payout requests found." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      {selectedPayout && actionType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1 capitalize">
              {actionType} Payout
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {formatCurrency(selectedPayout.amount)} via {selectedPayout.method.toUpperCase()} → {selectedPayout.destinationAccount}
              {selectedPayout.accountName && ` (${selectedPayout.accountName})`}
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            {actionType === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Rejection Reason *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this payout is being rejected..."
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            )}

            {actionType === 'complete' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">PayMongo Transfer ID (optional)</label>
                <input
                  type="text"
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  placeholder="e.g. trsf_xxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
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
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || (actionType === 'reject' && !rejectReason.trim())}
                className={`px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${
                  actionType === 'reject' ? 'bg-red-600' : actionType === 'approve' ? 'bg-emerald-600' : 'bg-[var(--color-primary)]'
                }`}
              >
                {mutation.isPending ? 'Processing...' : actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Mark Completed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
