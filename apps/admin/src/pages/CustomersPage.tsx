import React, { useEffect, useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';
import { adminConfig } from '@/config/admin.config';

interface Customer {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  isActive?: boolean;
  isFlaggedFraud?: boolean;
  contactMasked?: boolean;
  totalBookings: number;
  totalSpent: number;
  activeBookings?: number;
  totalDisputes: number;
  openDisputes?: number;
  openSupportTickets?: number;
  createdAt: string;
}

interface CustomerQueueSummary {
  totalCustomers: number;
  activeAccounts: number;
  inactiveAccounts: number;
  fraudFlagged: number;
}

interface PaginatedResult {
  success: boolean;
  data: Customer[];
  summary?: CustomerQueueSummary;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function customerName(customer: Customer): string {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed customer';
}

const CUSTOMER_SORTS = new Set(['attention', 'newest', 'active_work', 'completed_value']);

function parseCustomerSort(value: string | null): string {
  return CUSTOMER_SORTS.has(value ?? '') ? (value as string) : 'attention';
}

export default function CustomersPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '');
  const [sort, setSort] = useState(() => parseCustomerSort(searchParams.get('sort')));

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setStatusFilter(searchParams.get('status') ?? '');
    setSort(parseCustomerSort(searchParams.get('sort')));
  }, [searchParams]);

  const updateUrlFilters = (next: { search?: string; status?: string; sort?: string }): void => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    setSearchParams(params.toString(), { replace: true });
  };

  const setPage = (nextPage: number): void => {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) params.delete('page');
    else params.set('page', String(nextPage));
    setSearchParams(params.toString(), { replace: true });
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminCustomers', page, search, statusFilter, sort],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      params.sort = sort;
      const res = await api.get<PaginatedResult>('/api/v1/admin/customers', { params });
      return res.data;
    },
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    const nextSearch = searchInput.trim();
    setSearch(nextSearch);
    updateUrlFilters({ search: nextSearch });
  };

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (r) => (
        <div>
          <Link
            to={`/customers/${r.id}`}
            className="font-medium text-[var(--color-secondary)] hover:underline"
          >
            {customerName(r)}
          </Link>
          <p className="text-xs text-[var(--color-text-secondary)]">{r.phone}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">{r.email ?? 'No email'}</p>
          {r.contactMasked && (
            <p className="mt-1 text-[11px] font-medium text-amber-700">Contact masked</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Account state',
      render: (r) => {
        const isActive = r.isActive ?? r.status === 'active';
        const isFlaggedFraud = r.isFlaggedFraud ?? r.status === 'flag_fraud';
        return (
          <div className="flex flex-wrap gap-1.5">
            <Badge label={isActive ? 'Active' : 'Inactive'} variant={isActive ? 'success' : 'danger'} />
            {isFlaggedFraud && <Badge label="Fraud review" variant="warning" />}
          </div>
        );
      },
    },
    {
      key: 'bookings',
      header: 'Booking activity',
      render: (r) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">{r.activeBookings ?? 0} active</p>
          <p className="text-xs text-[var(--color-text-secondary)]">{r.totalBookings} total</p>
          <Link
            to={`/bookings?search=${encodeURIComponent(r.id)}`}
            className="mt-1 inline-block text-xs font-semibold text-[var(--color-secondary)] hover:underline"
          >
            View bookings
          </Link>
        </div>
      ),
    },
    {
      key: 'support',
      header: 'Open work',
      render: (r) => {
        const openSupportTickets = r.openSupportTickets ?? 0;
        const openDisputes = r.openDisputes ?? 0;
        return (
          <div>
            <Link
              to={`/support-tickets?userId=${encodeURIComponent(r.id)}&userName=${encodeURIComponent(customerName(r))}&userRole=customer`}
              className="font-medium text-[var(--color-secondary)] hover:underline"
            >
              {openSupportTickets} support case{openSupportTickets === 1 ? '' : 's'}
            </Link>
            <p className={openDisputes > 0 ? 'text-xs font-medium text-red-700' : 'text-xs text-[var(--color-text-secondary)]'}>
              {openDisputes} open / {r.totalDisputes} total disputes
            </p>
          </div>
        );
      },
    },
    {
      key: 'spent',
      header: 'Completed value',
      render: (r) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">
            {r.totalSpent > 0 ? formatCurrency(r.totalSpent) : 'None'}
          </p>
          <p className="max-w-44 text-[11px] text-[var(--color-text-secondary)]">
            Gross completed booking value. Check Customer 360 for refunds and payment history.
          </p>
        </div>
      ),
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
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Customer Management</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Find customer accounts, current service work, support cases, disputes, and completed booking value.
        </p>
      </div>

      <section aria-label="Customer account signals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QueueSignal label="All customers" value={data?.summary?.totalCustomers ?? 0} detail="Every customer account" selected={!statusFilter} onClick={() => updateUrlFilters({ status: '' })} />
        <QueueSignal label="Active accounts" value={data?.summary?.activeAccounts ?? 0} detail="Account access enabled" selected={statusFilter === 'active'} onClick={() => updateUrlFilters({ status: 'active' })} />
        <QueueSignal label="Inactive accounts" value={data?.summary?.inactiveAccounts ?? 0} detail="Includes support suspensions" selected={statusFilter === 'inactive'} onClick={() => updateUrlFilters({ status: 'inactive' })} />
        <QueueSignal label="Fraud review" value={data?.summary?.fraudFlagged ?? 0} detail="Can overlap account state" selected={statusFilter === 'flag_fraud'} onClick={() => updateUrlFilters({ status: 'flag_fraud' })} />
      </section>

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <form onSubmit={handleSearch} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, phone, email, or customer ID..."
              aria-label="Search customers by name, phone, email, or customer ID"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            />
            <button type="submit" className="min-h-11 px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
              Search
            </button>
          </form>
          <select
            value={statusFilter}
            onChange={(e) => {
              const nextStatus = e.currentTarget.value;
              setStatusFilter(nextStatus);
              updateUrlFilters({ status: nextStatus });
            }}
            aria-label="Filter customers by status"
            className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive (includes suspended)</option>
            <option value="flag_fraud">Fraud review</option>
          </select>
          <select
            value={sort}
            onChange={(e) => {
              const nextSort = e.currentTarget.value;
              setSort(nextSort);
              updateUrlFilters({ sort: nextSort });
            }}
            aria-label="Sort customer queue"
            className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          >
            <option value="attention">Support attention first</option>
            <option value="active_work">Most active bookings</option>
            <option value="completed_value">Highest completed value</option>
            <option value="newest">Newest accounts</option>
          </select>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
          Ordinary admins see masked contact details. Open Customer 360 and use the audited reveal only when support work requires the exact contact.
        </p>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} isError={isError} errorMessage="Failed to load customers. Please try again." emptyMessage="No customers match this view." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}
    </div>
  );
}

function QueueSignal({
  label,
  value,
  detail,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-24 rounded-xl border bg-white p-4 text-left transition-colors ${
        selected
          ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/15'
          : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
      }`}
    >
      <span className="block text-2xl font-bold text-[var(--color-text)]">{value}</span>
      <span className="mt-1 block text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">{detail}</span>
    </button>
  );
}
