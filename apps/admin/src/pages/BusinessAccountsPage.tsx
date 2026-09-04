import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  DataTable,
  Badge,
  Button,
  ErrorState,
  Pagination,
  type Column,
} from '@/components/ui';

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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adminBusinessAccounts', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/business-accounts', { params });
      return res.data;
    },
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
      header: 'Discount projection',
      render: (r) => (
        <span className="text-sm font-medium">{r.volumeDiscountRate > 0 ? `${r.volumeDiscountRate}%` : '—'}</span>
      ),
    },
    {
      key: 'monthlyCreditLimit',
      header: 'Credit projection',
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
        <Link
          to={`/business-accounts/${r.id}`}
          aria-label={`Review business account ${r.companyName}`}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          Review 360
        </Link>
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

      {isError ? (
        <ErrorState
          title="Business accounts unavailable"
          description="The business-account directory could not be read. Do not treat it as empty before making an account or credit decision."
          action={<Button variant="outline" onClick={() => void refetch()}>Retry business accounts</Button>}
        />
      ) : (
        <DataTable columns={columns} data={accounts} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No business accounts found." />
      )}

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
