import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface BusinessAccount {
  id: string;
  companyName: string;
  businessType: string;
  city: string;
  province: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  paymentTerms: string;
  volumeDiscountRate: number;
  monthlyCreditLimit: number;
  ownerName: string | null;
  managerName: string | null;
  createdAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: BusinessAccount[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'danger',
  closed: 'default',
};

const TYPE_LABELS: Record<string, string> = {
  office: 'Office',
  condo_management: 'Condo Mgmt',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  retail: 'Retail',
  school: 'School',
  hospital: 'Hospital',
  other: 'Other',
};

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_OPTIONS = new Set(['pending', 'active', 'suspended', 'closed']);

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatus(value: string | null): string {
  return value && STATUS_OPTIONS.has(value) ? value : '';
}

export default function BusinessAccountsPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseStatus(searchParams.get('status'));
  const search = searchParams.get('search')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [actionError, setActionError] = useState('');
  // BUG-PHASE41-03 fix — pre-fix the suspend POST sent a hardcoded
  // "Admin action" reason. Suspending a business account is serious
  // (cuts off scheduled bookings, cuts off credit-line invoicing) so
  // the reason needs to be captured for audit + recipient
  // notification. Now: confirm modal with required reason.
  const [suspendTarget, setSuspendTarget] = useState<BusinessAccount | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminBusinessAccounts', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/business-accounts', { params });
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/admin/business-accounts/${id}/approve`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminBusinessAccounts'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/api/v1/admin/business-accounts/${id}/suspend`, { reason: reason.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminBusinessAccounts'] });
      setActionError('');
      setSuspendTarget(null);
      setSuspendReason('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      return params;
    });
  };

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
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

  function approveAccount(account: BusinessAccount): void {
    if (!window.confirm(`Approve business account "${account.companyName}"?`)) return;
    approveMutation.mutate(account.id);
  }

  function openSuspend(account: BusinessAccount): void {
    setSuspendTarget(account);
    setSuspendReason('');
    setActionError('');
  }

  function submitSuspend(): void {
    if (!suspendTarget) return;
    const reason = suspendReason.trim();
    if (reason.length < 10) {
      setActionError('Suspension reason must be at least 10 characters.');
      return;
    }
    if (!window.confirm(`Suspend business account "${suspendTarget.companyName}"?`)) return;
    suspendMutation.mutate({ id: suspendTarget.id, reason });
  }

  const columns: Column<BusinessAccount>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-text)]">{r.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      render: (r) => (
        <div>
          <Link
            to={`/business-accounts/${r.id}`}
            className="block font-semibold text-sm text-[var(--color-secondary)] hover:underline"
          >
            {r.companyName}
          </Link>
          <span className="text-xs text-[var(--color-text-secondary)]">{TYPE_LABELS[r.businessType] ?? r.businessType}</span>
        </div>
      ),
    },
    {
      key: 'ownerName',
      header: 'Owner',
      render: (r) => <span className="text-sm text-[var(--color-text)]">{r.ownerName ?? '—'}</span>,
    },
    {
      key: 'city',
      header: 'Location',
      render: (r) => <span className="text-sm">{r.city}, {r.province}</span>,
    },
    {
      key: 'volumeDiscountRate',
      header: 'Discount',
      render: (r) => (
        <span className="text-sm font-medium">{r.volumeDiscountRate > 0 ? `${r.volumeDiscountRate}%` : '—'}</span>
      ),
    },
    {
      key: 'monthlyCreditLimit',
      header: 'Credit Limit',
      render: (r) => (
        <span className="text-sm">{r.monthlyCreditLimit > 0 ? formatCurrency(r.monthlyCreditLimit) : '—'}</span>
      ),
    },
    {
      key: 'managerName',
      header: 'Acct Mgr',
      render: (r) => <span className="text-sm text-[var(--color-text)]">{r.managerName ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? 'default'} label={formatStatus(r.status)} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex gap-2">
          {r.status === 'pending' && (
            <button
              type="button"
              aria-label={`Approve business account ${r.companyName}`}
              onClick={() => approveAccount(r)}
              disabled={approveMutation.isPending}
              className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {r.status === 'active' && (
            <button
              type="button"
              aria-label={`Suspend business account ${r.companyName}`}
              onClick={() => openSuspend(r)}
              disabled={suspendMutation.isPending}
              className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50"
            >
              Suspend
            </button>
          )}
        </div>
      ),
    },
  ];

  const accounts = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Business Accounts</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <label htmlFor="business-account-search" className="sr-only">Search company, city, or contact</label>
          <input
            id="business-account-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search company, city, or contact..."
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
          >
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter business accounts by status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {isError && <p role="alert" className="text-sm text-red-600 mb-4">Failed to load business accounts. Please try again.</p>}
      {actionError && <p role="alert" className="text-sm text-red-600 mb-4">{actionError}</p>}

      <DataTable columns={columns} data={accounts} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No business accounts found." />

      {pagination && pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
        />
      )}

      {suspendTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-business-title"
            className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6"
          >
            <h3 id="suspend-business-title" className="text-lg font-semibold text-[var(--color-text)] mb-1">Suspend business account</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {suspendTarget.companyName} ({TYPE_LABELS[suspendTarget.businessType] ?? suspendTarget.businessType})
            </p>
            <label htmlFor="business-suspend-reason" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Suspension reason *</label>
            <textarea
              id="business-suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              placeholder="Explain why (min 10 characters) — recorded in audit log"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSuspend}
                disabled={suspendMutation.isPending || suspendReason.trim().length < 10}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {suspendMutation.isPending ? 'Suspending...' : 'Confirm suspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
