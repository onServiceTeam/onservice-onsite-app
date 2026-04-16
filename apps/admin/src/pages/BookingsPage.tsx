import React, { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface Booking {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  status: string;
  escrowStatus: string;
  totalAmount: number;
  city: string;
  scheduledAt: string | null;
  customerName: string;
  providerName: string | null;
  categoryName: string;
  createdAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: Booking[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  requested: 'default',
  quoted: 'default',
  matched: 'info',
  payment_pending: 'warning',
  paid: 'info',
  provider_en_route: 'info',
  provider_arrived: 'info',
  in_progress: 'warning',
  completed_by_provider: 'success',
  confirmed: 'success',
  payout_ready: 'success',
  paid_out: 'success',
  disputed: 'danger',
  resolved: 'default',
  cancelled_by_customer: 'danger',
  cancelled_by_provider: 'danger',
  cancelled_by_admin: 'danger',
};

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrency(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function BookingsPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminBookings', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/bookings', { params });
      return res.data;
    },
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const columns: Column<Booking>[] = [
    {
      key: 'id',
      header: 'Booking ID',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-text)]">{r.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      render: (r) => (
        <span className="text-[var(--color-text)] font-medium">{r.categoryName}</span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => <span className="text-[var(--color-text)]">{r.customerName}</span>,
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (r) => (
        <span className="text-[var(--color-text)]">{r.providerName ?? '(unassigned)'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge label={formatStatus(r.status)} variant={STATUS_VARIANT[r.status] ?? 'default'} />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (r) => (
        <span className="text-[var(--color-text)] font-medium">{formatCurrency(r.totalAmount)}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (r) => (
        <span className="text-[var(--color-text-secondary)]">
          {r.scheduledAt ? new Date(r.scheduledAt).toLocaleDateString('en-PH') : new Date(r.createdAt).toLocaleDateString('en-PH')}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Booking Management</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Monitor and manage all platform bookings
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by booking ID or city..."
            className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Statuses</option>
          <option value="requested">Requested</option>
          <option value="quoted">Quoted</option>
          <option value="matched">Matched</option>
          <option value="payment_pending">Payment Pending</option>
          <option value="paid">Paid</option>
          <option value="provider_en_route">En Route</option>
          <option value="provider_arrived">Arrived</option>
          <option value="in_progress">In Progress</option>
          <option value="completed_by_provider">Completed</option>
          <option value="confirmed">Confirmed</option>
          <option value="payout_ready">Payout Ready</option>
          <option value="paid_out">Paid Out</option>
          <option value="disputed">Disputed</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled_by_customer">Cancelled (Customer)</option>
          <option value="cancelled_by_provider">Cancelled (Provider)</option>
          <option value="cancelled_by_admin">Cancelled (Admin)</option>
        </select>
      </div>

      {isError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          Failed to load bookings. Please try refreshing the page.
        </div>
      )}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No bookings found." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}
    </div>
  );
}
