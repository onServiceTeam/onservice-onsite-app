import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
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

export default function BusinessAccountsPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
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
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/admin/business-accounts/${id}/suspend`, { reason: 'Admin action' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminBusinessAccounts'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

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
          <span className="block font-semibold text-sm text-[var(--color-text)]">{r.companyName}</span>
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
              onClick={() => approveMutation.mutate(r.id)}
              disabled={approveMutation.isPending}
              className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {r.status === 'active' && (
            <button
              onClick={() => suspendMutation.mutate(r.id)}
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
          <input
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
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {isError && <p className="text-sm text-red-600 mb-4">Failed to load business accounts. Please try again.</p>}
      {actionError && <p className="text-sm text-red-600 mb-4">{actionError}</p>}

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
    </div>
  );
}
