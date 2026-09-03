import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { DataTable, Badge, Button, ErrorState, Pagination, type Column } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';

interface Payout {
  id: string;
  providerId: string;
  walletId: string;
  amount: number;
  method: string;
  destinationAccount: string;
  accountName: string | null;
  status: string;
  paymongoTransferId: string | null;
  failureReason: string | null;
  rejectionReason: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  requiresAmlReview: boolean;
  amlThresholdAtRequest: number | null;
  // BUG-PHASE41-01 — populated by API list via LEFT JOIN providers.
  providerBusinessName: string | null;
}

interface PaginatedResult {
  success: boolean;
  data: Payout[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  pending: 'warning',
  aml_review_pending: 'danger',
  approved: 'info',
  processing: 'info',
  completed: 'success',
  rejected: 'danger',
  failed: 'danger',
};

const STATUS_OPTIONS = new Set(['aml_review_pending', 'pending', 'approved', 'processing', 'completed', 'rejected', 'failed']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatus(value: string | null): string {
  return value && STATUS_OPTIONS.has(value) ? value : '';
}

function payoutStatusLabel(status: string): string {
  if (status === 'aml_review_pending') return 'internal large payout review';
  return status.replace(/_/g, ' ');
}

export default function PayoutsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  // Phase 200 fix — approve/reject/complete are super_admin-only on the
  // server (payout.routes.ts requireSuperAdmin). Pre-fix the buttons
  // rendered for every admin, so a regular admin filled the modal and got
  // a guaranteed 403. Gate the controls on the role the API actually
  // requires; non-super admins get a read-only view.
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseStatus(searchParams.get('status'));
  const payoutId = searchParams.get('payoutId')?.trim() ?? '';
  const hasExactPayout = payoutId.length > 0;
  const exactPayoutMalformed = hasExactPayout && !UUID_REGEX.test(payoutId);
  const providerIdFilter = searchParams.get('providerId')?.trim() ?? '';
  const directorySearch = searchParams.get('search')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(directorySearch);
  const [filterError, setFilterError] = useState('');

  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [actionType, setActionType] = useState<'clearAml' | 'approve' | 'reject' | 'complete' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [transferId, setTransferId] = useState('');
  const [actionError, setActionError] = useState('');

  const payoutsQuery = useQuery({
    queryKey: ['adminPayouts', page, statusFilter, providerIdFilter, directorySearch, payoutId],
    queryFn: async () => {
      const params: Record<string, string | number> = hasExactPayout
        ? { page: 1, pageSize: adminConfig.defaultPageSize, payoutId }
        : { page, pageSize: adminConfig.defaultPageSize };
      if (!hasExactPayout && statusFilter) params.status = statusFilter;
      if (!hasExactPayout && providerIdFilter) params.providerId = providerIdFilter;
      if (!hasExactPayout && directorySearch) params.search = directorySearch;
      const res = await api.get<PaginatedResult>('/api/v1/payouts', { params });
      return res.data;
    },
    enabled: !exactPayoutMalformed,
  });
  const { data, isLoading, isError } = payoutsQuery;
  const visiblePayouts = hasExactPayout
    ? (data?.data ?? []).filter((payout) => payout.id === payoutId)
    : data?.data ?? [];
  const exactPayoutMissing = hasExactPayout
    && !exactPayoutMalformed
    && !isLoading
    && !isError
    && Boolean(data)
    && visiblePayouts.length === 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayout) return;
      if (actionType === 'clearAml') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/clear-aml-review`, { reason: actionReason.trim() });
      } else if (actionType === 'approve') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/approve`, { reason: actionReason.trim() });
      } else if (actionType === 'reject') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/reject`, { reason: rejectReason.trim() });
      } else if (actionType === 'complete') {
        await api.put(`/api/v1/payouts/${selectedPayout.id}/complete`, {
          paymongoTransferId: transferId.trim() || undefined,
          reason: actionReason.trim(),
        });
      }
    },
    onSuccess: () => {
      const label = actionType === 'clearAml'
        ? 'Internal review hold cleared. The payout still requires approval.'
        : actionType === 'approve'
          ? 'Payout approved and queued for the manual transfer step.'
          : actionType === 'reject'
            ? 'Payout rejected and its reservation returned.'
            : 'Payout recorded as sent.';
      toast.success(label);
      void queryClient.invalidateQueries({ queryKey: ['adminPayouts'] });
      closeModal();
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  function closeModal(): void {
    setSelectedPayout(null);
    setActionType(null);
    setRejectReason('');
    setActionReason('');
    setTransferId('');
    setActionError('');
  }

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
  }

  function clearExactPayout(): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('payoutId');
      params.delete('page');
      return params;
    });
  }

  function setStatusFilter(nextStatus: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (nextStatus) params.set('status', nextStatus);
      else params.delete('status');
      return params;
    });
  }

  function openAction(payout: Payout, nextActionType: 'clearAml' | 'approve' | 'reject' | 'complete'): void {
    setSelectedPayout(payout);
    setActionType(nextActionType);
    setRejectReason('');
    setActionReason('');
    setTransferId('');
    setActionError('');
  }

  function submitAction(): void {
    if (!selectedPayout || !actionType) return;
    if (actionType === 'reject' && rejectReason.trim().length < 10) {
      setActionError('Rejection reason must be at least 10 characters.');
      return;
    }
    if ((actionType === 'clearAml' || actionType === 'approve' || actionType === 'complete') && actionReason.trim().length < 10) {
      setActionError('Audit reason must be at least 10 characters.');
      return;
    }
    mutation.mutate();
  }

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length === 1 || trimmed.length > 100) {
      setFilterError('Provider search must be empty or 2 to 100 characters.');
      return;
    }
    setFilterError('');
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      params.delete('payoutId');
      params.delete('providerId');
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      return params;
    });
  };

  const columns: Column<Payout>[] = [
    {
      key: 'id',
      header: 'Payout',
      // BUG-PHASE41-01 fix — pre-fix admins saw only "PA-12345678"
      // with no indication of WHO the payout was for. providerId is
      // a UUID (opaque). Now: clickable provider link with business
      // name + short payout id below for reference.
      render: (r) => (
        <div>
          <Link
            to={`/providers/${r.providerId}`}
            className="text-sm text-[var(--color-primary)] hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {r.providerBusinessName ?? '(unnamed provider)'}
          </Link>
          <p className="font-mono text-[10px] text-[var(--color-text-secondary)]">PA {r.id.slice(0, 8)}</p>
        </div>
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
      // BUG-PHASE41-01 fix — pre-fix the failureReason / rejectionReason
      // were on the API payload but invisible. Operationally critical
      // when triaging failed payouts at scale — admin had to click
      // each row to see why. Now visible inline below the badge.
      render: (r) => (
        <div>
          <Badge label={payoutStatusLabel(r.status)} variant={STATUS_VARIANT[r.status] ?? 'default'} />
          {r.status === 'failed' && r.failureReason && (
            <p className="text-[10px] text-red-600 mt-0.5 max-w-[180px] line-clamp-2" title={r.failureReason}>
              {r.failureReason}
            </p>
          )}
          {r.status === 'rejected' && r.rejectionReason && (
            <p className="text-[10px] text-red-600 mt-0.5 max-w-[180px] line-clamp-2" title={r.rejectionReason}>
              {r.rejectionReason}
            </p>
          )}
          {r.status === 'aml_review_pending' && (
            <p className="text-[10px] text-amber-800 mt-0.5 max-w-[180px] line-clamp-2">
              Internal review hold
              {r.amlThresholdAtRequest !== null && ` at ${formatCurrency(r.amlThresholdAtRequest)}`}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Requested',
      render: (r) => (
        <span className="text-[var(--color-text-secondary)] text-xs">
          {new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        if (!isSuperAdmin) {
          return <span className="text-xs text-[var(--color-text-tertiary)]">—</span>;
        }
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {r.status === 'aml_review_pending' && (
              <>
                <button
                  type="button"
                  aria-label={`Clear internal review hold for payout ${r.id}`}
                  onClick={(e) => { e.stopPropagation(); openAction(r, 'clearAml'); }}
                  className="min-h-11 px-2 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors"
                >
                  Clear hold
                </button>
                <button
                  type="button"
                  aria-label={`Reject internal-review-held payout ${r.id}`}
                  onClick={(e) => { e.stopPropagation(); openAction(r, 'reject'); }}
                  className="min-h-11 px-2 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
                >
                  Reject
                </button>
              </>
            )}
            {r.status === 'pending' && (
              <>
                <button
                  type="button"
                  aria-label={`Approve payout ${r.id}`}
                  onClick={(e) => { e.stopPropagation(); openAction(r, 'approve'); }}
                  className="min-h-11 px-2 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                >
                  Approve
                </button>
                <button
                  type="button"
                  aria-label={`Reject payout ${r.id}`}
                  onClick={(e) => { e.stopPropagation(); openAction(r, 'reject'); }}
                  className="min-h-11 px-2 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                >
                  Reject
                </button>
              </>
            )}
            {r.status === 'approved' && (
              <button
                type="button"
                aria-label={`Record payout ${r.id} as sent`}
                onClick={(e) => { e.stopPropagation(); openAction(r, 'complete'); }}
                className="min-h-11 px-2 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
              >
                Record sent
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Payout Management</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Review and process provider payout requests
        </p>
        {!isSuperAdmin && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
            You have read-only access. Approving, rejecting, and completing payouts requires a super-admin account.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {hasExactPayout && !exactPayoutMalformed && (
          <div className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-primary)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)]">
            <span>Exact payout <strong>{payoutId.slice(0, 8).toUpperCase()}</strong></span>
            <button
              type="button"
              className="min-h-9 rounded px-2 font-semibold text-[var(--color-primary)] hover:bg-white"
              onClick={clearExactPayout}
            >
              Clear
            </button>
          </div>
        )}
        {!hasExactPayout && <form onSubmit={handleSearch} className="flex gap-2">
          <label htmlFor="payout-provider-filter" className="sr-only">Search providers by name or ID</label>
          <input
            id="payout-provider-filter"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search provider name or ID..."
            className="min-h-11 px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm w-72 max-w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button type="submit" className="min-h-11 px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
            Search
          </button>
        </form>}
        {!hasExactPayout && <select
          aria-label="Filter payouts by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-11 px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Statuses</option>
          <option value="aml_review_pending">Internal Large Payout Review</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>}
      </div>

      {filterError && <p role="alert" className="mb-4 text-sm text-red-600">{filterError}</p>}

      {exactPayoutMalformed && (
        <ErrorState
          className="mb-4"
          title="Invalid payout link"
          description="Payout ID must be a complete UUID. No payout records were requested."
          action={<Button variant="outline" className="min-h-11" onClick={clearExactPayout}>Clear payout selection</Button>}
        />
      )}

      {exactPayoutMissing && (
        <ErrorState
          className="mb-4"
          title="Payout record not found"
          description="The requested payout is unavailable. No substitute payout is shown; return to the Audit Log or Provider 360 for the durable source context."
          action={<Button variant="outline" className="min-h-11" onClick={clearExactPayout}>Show payout queue</Button>}
        />
      )}

      {isError && (
        <ErrorState
          className="mb-4"
          title="Payout queue unavailable"
          description="The provider withdrawal queue could not be loaded. Do not treat it as empty."
          action={<Button variant="outline" className="min-h-11" onClick={() => { void payoutsQuery.refetch(); }}>Retry payout queue</Button>}
        />
      )}

      {!isError && !exactPayoutMalformed && !exactPayoutMissing && (
        <DataTable
          columns={columns}
          data={visiblePayouts}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No payout requests found."
        />
      )}

      {!hasExactPayout && data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      {selectedPayout && actionType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payout-action-title"
            className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-lg p-6"
          >
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">
              <span id="payout-action-title">
              {actionType === 'clearAml'
                ? 'Clear Internal Review Hold'
                : actionType === 'complete'
                  ? 'Record Payout as Sent'
                  : `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} Payout`}
              </span>
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {formatCurrency(selectedPayout.amount)} via {selectedPayout.method.toUpperCase()} → {selectedPayout.destinationAccount}
              {selectedPayout.accountName && ` (${selectedPayout.accountName})`}
            </p>

            {actionType === 'clearAml' && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This only clears the internal review hold. It moves the request to Pending, where Finance must still approve or reject it. It does not send money and does not state that a legal report was filed or required.
                {selectedPayout.amlThresholdAtRequest !== null && (
                  <span className="block mt-1 font-medium">
                    Threshold captured when requested: {formatCurrency(selectedPayout.amlThresholdAtRequest)}
                  </span>
                )}
              </div>
            )}

            {actionType === 'approve' && (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                This records approval and queues the manual transfer step. It does not send money. Finance must send and verify the external transfer before recording the payout as sent.
              </div>
            )}

            {actionType === 'reject' && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                Rejecting returns the full reserved amount to the provider&apos;s available wallet and notifies the provider. It does not send money externally.
              </div>
            )}

            {actionType === 'complete' && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Only continue after the external transfer has been sent and verified outside onService. This records the payout as sent, removes the wallet reservation, and notifies the provider. It does not initiate or send the transfer.
              </div>
            )}

            {actionError && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            {actionType === 'reject' && (
              <div className="mb-4">
                <label htmlFor="payout-reject-reason" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Rejection Reason *</label>
                <textarea
                  id="payout-reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Explain why this payout is being rejected (min 10 characters)..."
                  className="min-h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            )}

            {actionType === 'complete' && (
              <div className="mb-4">
                <label htmlFor="payout-transfer-id" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">External Transfer Reference (optional, max 100 chars)</label>
                <input
                  id="payout-transfer-id"
                  type="text"
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  maxLength={100}
                  placeholder="Bank, wallet, or gateway reference"
                  className="min-h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            )}

            {(actionType === 'clearAml' || actionType === 'approve' || actionType === 'complete') && (
              <div className="mb-4">
                <label htmlFor="payout-action-reason" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                  Audit Reason *
                </label>
                <textarea
                  id="payout-action-reason"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={actionType === 'clearAml'
                    ? 'Record why the internal review hold can be cleared (min 10 characters)...'
                    : actionType === 'approve'
                      ? 'Record what was checked before approval (min 10 characters)...'
                      : 'Record how and when the external transfer was sent (min 10 characters)...'}
                  className="min-h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={mutation.isPending}
                className="min-h-11 px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAction}
                disabled={mutation.isPending
                  || (actionType === 'reject' && rejectReason.trim().length < 10)
                  || ((actionType === 'clearAml' || actionType === 'approve' || actionType === 'complete') && actionReason.trim().length < 10)}
                className={`min-h-11 px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${
                  actionType === 'reject' ? 'bg-red-600' : actionType === 'approve' ? 'bg-emerald-600' : 'bg-[var(--color-primary)]'
                }`}
              >
                {mutation.isPending ? 'Processing...' : actionType === 'clearAml' ? 'Confirm Hold Cleared' : actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Record as Sent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
