import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface RecurringBooking {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  frequency: string;
  preferredDayName: string;
  preferredTime: string;
  city: string;
  province: string;
  totalAmount: number;
  status: string;
  nextBookingDate: string;
  totalInstances: number;
  createdAt: string;
  customerName: string | null;
  categoryName: string | null;
}

interface PaginatedResult {
  success: boolean;
  data: RecurringBooking[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  paused: 'warning',
  cancelled: 'danger',
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  bi_weekly: 'Bi-Weekly',
  monthly: 'Monthly',
};

function formatCurrency(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RecurringPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['adminRecurring', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/recurring', { params });
      return res.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/admin/recurring/${id}/cancel`, { reason: 'Admin cancellation' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminRecurring'] });
    },
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const columns: Column<RecurringBooking>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-text)]">{r.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (r) => (
        <span className="text-sm text-[var(--color-text)]">{r.customerName ?? '—'}</span>
      ),
    },
    {
      key: 'categoryName',
      header: 'Service',
      render: (r) => (
        <span className="text-sm text-[var(--color-text)]">{r.categoryName ?? '—'}</span>
      ),
    },
    {
      key: 'frequency',
      header: 'Frequency',
      render: (r) => (
        <span className="text-sm">
          {FREQUENCY_LABELS[r.frequency] ?? r.frequency} &mdash; {r.preferredDayName}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Amount',
      render: (r) => <span className="font-semibold">{formatCurrency(r.totalAmount)}</span>,
    },
    {
      key: 'city',
      header: 'Location',
      render: (r) => <span className="text-sm">{r.city}, {r.province}</span>,
    },
    {
      key: 'nextBookingDate',
      header: 'Next Booking',
      render: (r) => (
        <span className="text-sm">
          {r.status === 'active' && r.nextBookingDate
            ? new Date(r.nextBookingDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—'}
        </span>
      ),
    },
    {
      key: 'totalInstances',
      header: 'Instances',
      render: (r) => <span className="text-sm">{r.totalInstances}</span>,
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
      render: (r) =>
        r.status === 'active' ? (
          <button
            onClick={() => cancelMutation.mutate(r.id)}
            disabled={cancelMutation.isPending}
            className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null,
    },
  ];

  const bookings = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Recurring Bookings</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by customer or location..."
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
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <DataTable columns={columns} data={bookings} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No recurring bookings found." />

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
