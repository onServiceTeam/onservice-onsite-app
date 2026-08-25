import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
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

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_OPTIONS = new Set(['active', 'paused', 'cancelled']);

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatus(value: string | null): string {
  return value && STATUS_OPTIONS.has(value) ? value : '';
}

export default function RecurringPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseStatus(searchParams.get('status'));
  const search = searchParams.get('search')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [actionError, setActionError] = useState('');
  // BUG-PHASE41-02 fix — pre-fix the cancel POST sent a hardcoded
  // reason ("Admin cancellation"). The reason ends up in the audit
  // ledger and on customer-facing notifications, so a hardcoded
  // string defeats the purpose. Now: a confirm modal captures the
  // real reason from the admin (min 10 chars).
  const [cancelTarget, setCancelTarget] = useState<RecurringBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminRecurring', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/recurring', { params });
      return res.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/api/v1/admin/recurring/${id}/cancel`, { reason: reason.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminRecurring'] });
      setActionError('');
      setCancelTarget(null);
      setCancelReason('');
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

  function openCancel(target: RecurringBooking): void {
    setCancelTarget(target);
    setCancelReason('');
    setActionError('');
  }

  function submitCancel(): void {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (reason.length < 10) {
      setActionError('Cancellation reason must be at least 10 characters.');
      return;
    }
    cancelMutation.mutate({ id: cancelTarget.id, reason });
  }

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
            ? new Date(r.nextBookingDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
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
        r.status !== 'cancelled' ? (
          <button
            type="button"
            aria-label={`Cancel recurring booking ${r.id}`}
            onClick={() => openCancel(r)}
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
            id="recurring-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by customer or location..."
            aria-label="Search recurring bookings by customer or location"
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
          aria-label="Filter recurring bookings by status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isError && <p role="alert" className="text-sm text-red-600 mb-4">Failed to load recurring bookings. Please try again.</p>}
      {actionError && <p role="alert" className="text-sm text-red-600 mb-4">{actionError}</p>}

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

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-recurring-title"
            className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6"
          >
            <h3 id="cancel-recurring-title" className="text-lg font-semibold text-[var(--color-text)] mb-1">Cancel recurring booking</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {cancelTarget.customerName ?? '(unknown customer)'} — {FREQUENCY_LABELS[cancelTarget.frequency] ?? cancelTarget.frequency}
            </p>
            <p className="mb-4 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-sm text-[var(--color-text)]">
              This stops future bookings in the series. Existing bookings remain unchanged. The
              reason is recorded in the audit log and sent to the customer.
            </p>
            <label htmlFor="recurring-cancel-reason" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Cancellation reason *</label>
            <textarea
              id="recurring-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Explain why (min 10 characters) — recorded in audit log + sent to customer"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCancel}
                disabled={cancelMutation.isPending || cancelReason.trim().length < 10}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
