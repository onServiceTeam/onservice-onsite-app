import React, { useEffect, useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Badge, Pagination } from '@/components/ui';
import { adminConfig } from '@/config/admin.config';
import { useAdminSocketEvent } from '@/lib/use-admin-socket';

interface Booking {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  bookingType?: string;
  businessAccountId?: string | null;
  businessAccountName?: string | null;
  contractId?: string | null;
  contractType?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  status: string;
  escrowStatus: string;
  totalAmount: number;
  city: string;
  scheduledAt: string | null;
  customerName: string;
  providerName: string | null;
  categoryName: string;
  createdAt: string;
  openSupportTickets?: number;
  unassignedSupportTickets?: number;
  urgentSupportTickets?: number;
  supportOwnerNames?: string | null;
  openDisputes?: number;
  pastScheduled?: boolean;
}

interface BookingQueueSummary {
  totalBookings: number;
  activeBookings: number;
  unassignedActive: number;
  openSupportBookings: number;
  disputedBookings: number;
  pastScheduledBookings: number;
}

interface PaginatedResult {
  success: boolean;
  data: Booking[];
  summary?: BookingQueueSummary;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  requested: 'default', quoted: 'default', matched: 'info', payment_pending: 'warning', paid: 'info',
  provider_en_route: 'info', provider_arrived: 'info', in_progress: 'warning',
  completed_by_provider: 'success', confirmed: 'success', payout_ready: 'success', paid_out: 'success',
  disputed: 'danger', resolved: 'default', cancelled_by_customer: 'danger',
  cancelled_by_provider: 'danger', cancelled_by_admin: 'danger',
};

const BOOKING_VIEWS = new Set(['all', 'active', 'unassigned', 'support', 'disputed', 'past_scheduled']);
const BOOKING_SORTS = new Set(['attention', 'newest', 'scheduled', 'highest_value']);

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseView(value: string | null): string {
  return BOOKING_VIEWS.has(value ?? '') ? (value as string) : 'all';
}

function parseSort(value: string | null): string {
  return BOOKING_SORTS.has(value ?? '') ? (value as string) : 'attention';
}

function formatStatus(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatScheduled(value: string | null, fallback: string): string {
  return new Date(value ?? fallback).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  });
}

export default function BookingsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '');
  const [view, setView] = useState(() => parseView(searchParams.get('view')));
  const [sort, setSort] = useState(() => parseSort(searchParams.get('sort')));
  const businessAccountId = searchParams.get('businessAccountId') ?? '';

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setStatusFilter(searchParams.get('status') ?? '');
    setView(parseView(searchParams.get('view')));
    setSort(parseSort(searchParams.get('sort')));
  }, [searchParams]);

  const updateUrlFilters = (next: { search?: string; status?: string; view?: string; sort?: string }): void => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value && !(key === 'view' && value === 'all')) params.set(key, value);
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

  useAdminSocketEvent<{ id: string }>('booking:status_changed', () => {
    void queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminBookings', page, search, statusFilter, view, sort, businessAccountId],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page, pageSize: adminConfig.defaultPageSize, view, sort,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (businessAccountId) params.businessAccountId = businessAccountId;
      const response = await api.get<PaginatedResult>('/api/v1/admin/bookings', { params });
      return response.data;
    },
  });

  const handleSearch = (event: FormEvent): void => {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    setSearch(nextSearch);
    updateUrlFilters({ search: nextSearch });
  };

  const selectView = (nextView: string): void => {
    setView(nextView);
    setStatusFilter('');
    updateUrlFilters({ view: nextView, status: '' });
  };

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Booking Operations</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          Prioritize assignment, participant support, disputes, and past-scheduled work across the complete booking lifecycle.
        </p>
      </header>

      {businessAccountId ? (
        <section className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Business account booking scope">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Business account scope</p>
            <Link to={`/business-accounts/${businessAccountId}`} className="mt-1 block font-semibold text-sky-950 hover:underline">
              {data?.data[0]?.businessAccountName || `Business account ${businessAccountId.slice(0, 8)}`}
            </Link>
            <p className="mt-1 text-xs text-sky-900">Queue counts and rows are limited to bookings explicitly stamped with this account.</p>
          </div>
          <Link to="/bookings" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100">
            Clear business scope
          </Link>
        </section>
      ) : null}

      <section aria-label="Booking queue signals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <QueueSignal label="All bookings" value={summary?.totalBookings ?? 0} detail="Every lifecycle state" selected={view === 'all' && !statusFilter} onClick={() => selectView('all')} />
        <QueueSignal label="Active" value={summary?.activeBookings ?? 0} detail="Work not terminal" selected={view === 'active'} onClick={() => selectView('active')} />
        <QueueSignal label="Paid needs assignment" value={summary?.unassignedActive ?? 0} detail="Verified paid and unassigned" selected={view === 'unassigned'} onClick={() => selectView('unassigned')} />
        <QueueSignal label="Open support" value={summary?.openSupportBookings ?? 0} detail="Bookings with active cases" selected={view === 'support'} onClick={() => selectView('support')} />
        <QueueSignal label="Dispute review" value={summary?.disputedBookings ?? 0} detail="Open linked disputes" selected={view === 'disputed'} onClick={() => selectView('disputed')} />
        <QueueSignal label="Past scheduled" value={summary?.pastScheduledBookings ?? 0} detail="Active after start time" selected={view === 'past_scheduled'} onClick={() => selectView('past_scheduled')} />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4" aria-label="Booking queue controls">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <form onSubmit={handleSearch} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Booking, customer, provider, service, city, or party ID..."
              aria-label="Search bookings by booking, customer, provider, service, city, or party ID"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            />
            <button type="submit" className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm text-white transition-opacity hover:opacity-90">Search</button>
          </form>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={statusFilter}
              onChange={(event) => {
                const nextStatus = event.currentTarget.value;
                setStatusFilter(nextStatus);
                updateUrlFilters({ status: nextStatus });
              }}
              aria-label="Filter bookings by status"
              className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            >
              <option value="">All statuses</option>
              <option value="requested">Requested</option><option value="quoted">Quoted</option><option value="matched">Matched</option>
              <option value="payment_pending">Payment pending</option><option value="paid">Paid</option>
              <option value="provider_en_route">En route</option><option value="provider_arrived">Arrived</option><option value="in_progress">In progress</option>
              <option value="completed_by_provider">Completed by provider</option><option value="confirmed">Confirmed</option>
              <option value="payout_ready">Payout ready</option><option value="paid_out">Paid out</option>
              <option value="disputed">Disputed</option><option value="resolved">Resolved</option>
              <option value="cancelled_by_customer">Cancelled by customer</option><option value="cancelled_by_provider">Cancelled by provider</option><option value="cancelled_by_admin">Cancelled by admin</option>
            </select>
            <select
              value={sort}
              onChange={(event) => {
                const nextSort = event.currentTarget.value;
                setSort(nextSort);
                updateUrlFilters({ sort: nextSort });
              }}
              aria-label="Sort booking queue"
              className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            >
              <option value="attention">Support attention first</option><option value="scheduled">Scheduled date</option>
              <option value="newest">Newest bookings</option><option value="highest_value">Highest gross total</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
          Queue ownership follows the linked support case and its assigned agent. A booking itself does not create a second, competing owner record.
        </p>
      </section>

      <BookingRows bookings={data?.data ?? []} isLoading={isLoading} isError={isError} />
      {data && data.pagination.totalPages > 1 && <Pagination {...data.pagination} onPageChange={setPage} />}
    </div>
  );
}

function BookingRows({ bookings, isLoading, isError }: { bookings: Booking[]; isLoading: boolean; isError: boolean }): React.ReactElement {
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border border-[var(--color-border)] bg-white p-12 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-3 border-[var(--color-secondary)] border-t-transparent" aria-hidden="true" />
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">Loading booking operations...</p>
      </div>
    );
  }
  if (isError) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Failed to load bookings. Refresh the page before making an operational decision.</div>;
  }
  if (bookings.length === 0) {
    return <div className="rounded-xl border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-text-secondary)]">No bookings match this operational view.</div>;
  }

  return (
    <section aria-label="Booking operations rows" className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
      {bookings.map((booking) => {
        const openSupport = booking.openSupportTickets ?? 0;
        const unassignedSupport = booking.unassignedSupportTickets ?? 0;
        const urgentSupport = booking.urgentSupportTickets ?? 0;
        const openDisputes = booking.openDisputes ?? 0;
        return (
          <article key={booking.id} className="grid gap-4 border-b border-[var(--color-border)] p-4 last:border-b-0 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1.25fr_0.8fr]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Booking</p>
              <Link to={`/bookings/${booking.id}`} className="font-mono text-xs font-semibold text-[var(--color-primary)] hover:underline">{booking.id.slice(0, 8)}</Link>
              <p className="mt-1 font-medium text-[var(--color-text)]">{booking.categoryName}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{booking.city || 'City not recorded'}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{formatScheduled(booking.scheduledAt, booking.createdAt)} PHT</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Participants</p>
              <Link to={`/customers/${booking.customerId}`} className="block truncate font-medium text-[var(--color-secondary)] hover:underline">{booking.customerName || 'Unnamed customer'}</Link>
              {booking.providerId ? (
                <Link to={`/providers/${booking.providerId}`} className="mt-1 block truncate text-sm font-medium text-[var(--color-secondary)] hover:underline">{booking.providerName || 'Unnamed provider'}</Link>
              ) : <div className="mt-1"><Badge label="Provider unassigned" variant="warning" /></div>}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Operational state</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge label={formatStatus(booking.status)} variant={STATUS_VARIANT[booking.status] ?? 'default'} />
                <Badge label={`Escrow: ${formatStatus(booking.escrowStatus)}`} variant={escrowVariant(booking.escrowStatus)} />
                {booking.pastScheduled && <Badge label="Past scheduled time" variant="danger" />}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Support case ownership</p>
              <Link to={`/support-tickets?bookingId=${encodeURIComponent(booking.id)}`} className="font-medium text-[var(--color-secondary)] hover:underline">
                {openSupport} open support case{openSupport === 1 ? '' : 's'}
              </Link>
              {booking.supportOwnerNames ? (
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Assigned: {booking.supportOwnerNames}</p>
              ) : openSupport > 0 ? (
                <p className="mt-1 text-xs font-medium text-amber-700">No assigned support agent</p>
              ) : <p className="mt-1 text-xs text-[var(--color-text-secondary)]">No linked active case</p>}
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {urgentSupport > 0 && <span className="font-semibold text-red-700">{urgentSupport} urgent</span>}
                {unassignedSupport > 0 && <span className="font-semibold text-amber-700">{unassignedSupport} unassigned</span>}
                <span className={openDisputes > 0 ? 'font-semibold text-red-700' : 'text-[var(--color-text-secondary)]'}>{openDisputes} open dispute{openDisputes === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Gross booking total</p>
              <p className="font-semibold text-[var(--color-text)]">{formatCurrency(booking.totalAmount)}</p>
              <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">Payment and refund truth lives in Booking 360.</p>
              {booking.businessAccountId ? (
                <div className="mt-3 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-text-secondary)]">
                  <Link to={`/business-accounts/${booking.businessAccountId}`} className="font-semibold text-[var(--color-secondary)] hover:underline">
                    {booking.businessAccountName || 'Business account'}
                  </Link>
                  <p>{booking.contractId ? `${formatStatus(booking.contractType || 'contract')} pricing` : 'No linked contract'}</p>
                  <p>{booking.invoiceNumber ? `${booking.invoiceNumber} · ${formatStatus(booking.invoiceStatus || 'unknown')}` : 'Not yet included on an invoice'}</p>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function escrowVariant(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'released' || status === 'released_to_provider') return 'success';
  if (status === 'frozen' || status === 'disputed') return 'danger';
  if (status === 'refunded' || status === 'refunded_to_customer') return 'warning';
  return 'info';
}

function QueueSignal({ label, value, detail, selected, onClick }: { label: string; value: number; detail: string; selected: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-24 rounded-xl border bg-white p-4 text-left transition-colors ${selected ? 'border-[var(--color-secondary)] ring-2 ring-[var(--color-secondary)]/15' : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'}`}>
      <span className="block text-2xl font-bold text-[var(--color-text)]">{value}</span>
      <span className="mt-1 block text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">{detail}</span>
    </button>
  );
}
