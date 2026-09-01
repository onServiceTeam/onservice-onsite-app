import React, { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { AlertTriangle, Repeat, Ticket } from '@/components/icons';
import {
  Badge, Button, EmptyState, ErrorState, LoadingState, Pagination,
} from '@/components/ui';

interface RecurringBooking {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  originalBookingId: string | null;
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
  providerName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  failedInstances: number;
  openSupportTickets: number;
}

interface RecurringSummary {
  matchingSeries: number;
  activeSeries: number;
  seriesWithFailedInstances: number;
  openSupportTickets: number;
}

interface PaginatedResult {
  success: boolean;
  data: RecurringBooking[];
  summary: RecurringSummary;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface RecurringDetail extends RecurringBooking {
  subcategoryId: string | null;
  address: string;
  barangay: string;
  servicePrice: number;
  serviceFee: number;
  lastBookingDate: string | null;
  skippedInstances: number;
  generatedInstances: number;
  cancellationReason: string | null;
  cancelledAt: string | null;
  originalBookingStatus: string | null;
  originalBookingTotal: number | null;
  operationalPaymentMode: 'manual_per_booking';
  providerAssignmentState: 'legacy_provider_link' | 'unassigned';
  legacyAutoChargePreference: boolean;
}

interface RecurringInstance {
  id: string;
  scheduledDate: string;
  status: string;
  bookingStatus: string | null;
  bookingId: string | null;
  failureReason: string | null;
  bookingTotalAmount: number | null;
  bookingScheduledAt: string | null;
  bookingProviderId: string | null;
  bookingProviderName: string | null;
  openSupportTickets: number;
}

interface InstanceResult {
  success: boolean;
  data: RecurringInstance[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success', paused: 'warning', cancelled: 'danger',
  completed: 'success', failed: 'danger', skipped: 'warning', created: 'default',
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly', bi_weekly: 'Every two weeks', monthly: 'Monthly',
};

const STATUS_OPTIONS = new Set(['active', 'paused', 'cancelled']);

function formatStatus(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
  });
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatus(value: string | null): string {
  return value && STATUS_OPTIONS.has(value) ? value : '';
}

function customerSupportPath(detail: Pick<RecurringDetail, 'customerId' | 'customerName'>): string {
  const params = new URLSearchParams({
    relatedCustomerId: detail.customerId,
    userRole: 'customer',
    userName: detail.customerName ?? 'Customer',
  });
  return `/support-tickets?${params.toString()}`;
}

export function RecurringDetailPanel({ seriesId }: { seriesId: string }): React.ReactElement {
  const [historyPage, setHistoryPage] = useState(1);
  useEffect(() => setHistoryPage(1), [seriesId]);

  const detailQuery = useQuery({
    queryKey: ['adminRecurringDetail', seriesId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: RecurringDetail }>(`/api/v1/admin/recurring/${seriesId}`);
      return response.data.data;
    },
  });
  const historyQuery = useQuery({
    queryKey: ['adminRecurringInstances', seriesId, historyPage],
    queryFn: async () => {
      const response = await api.get<InstanceResult>(`/api/v1/admin/recurring/${seriesId}/instances`, {
        params: { page: historyPage, pageSize: 20 },
      });
      return response.data;
    },
  });

  if (detailQuery.isLoading) return <LoadingState label="Loading recurring support record…" />;
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        title="Recurring support record unavailable"
        description={getErrorMessage(detailQuery.error)}
        action={<Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>Retry</Button>}
      />
    );
  }

  const detail = detailQuery.data;
  const instances = historyQuery.data?.data ?? [];
  const pagination = historyQuery.data?.pagination;

  return (
    <div className="space-y-5 p-4 sm:p-5" aria-label="Recurring booking support workspace">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Generated bookings" value={detail.generatedInstances} />
        <Metric label="Failed schedules" value={detail.failedInstances} attention={detail.failedInstances > 0} />
        <Metric label="Skipped visits" value={detail.skippedInstances} />
        <Metric label="Open support cases" value={detail.openSupportTickets} attention={detail.openSupportTickets > 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-4" aria-label="Recurring series contract">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Series contract</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Detail label="Service" value={detail.subcategoryName ?? detail.categoryName ?? 'Not recorded'} />
            <Detail label="Schedule" value={`${FREQUENCY_LABELS[detail.frequency] ?? detail.frequency}, ${detail.preferredDayName} at ${detail.preferredTime}`} />
            <Detail label="Service price" value={formatCurrency(detail.servicePrice)} />
            <Detail label="Service fee" value={formatCurrency(detail.serviceFee)} />
            <Detail label="Scheduled total per visit" value={formatCurrency(detail.totalAmount)} />
            <Detail label="Next booking" value={detail.status === 'active' ? formatDate(detail.nextBookingDate) : 'No future booking while inactive'} />
            <Detail label="Last generated visit" value={formatDate(detail.lastBookingDate)} />
            <Detail label="Location" value={[detail.address, detail.barangay, detail.city, detail.province].filter(Boolean).join(', ')} />
          </dl>
          {detail.cancellationReason ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">Cancelled {formatDate(detail.cancelledAt)}</p>
              <p className="mt-1">{detail.cancellationReason}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-white p-4" aria-label="Recurring linkage and controls">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">People, source, and support</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">Customer</p>
              <Link className="font-semibold text-[var(--color-secondary)] hover:underline" to={`/customers/${detail.customerId}`}>{detail.customerName ?? 'Open customer record'}</Link>
              <Link className="ml-3 text-xs font-semibold text-[var(--color-secondary)] hover:underline" to={customerSupportPath(detail)}>Customer support cases</Link>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">Series provider link</p>
              {detail.providerId ? (
                <Link className="font-semibold text-[var(--color-secondary)] hover:underline" to={`/providers/${detail.providerId}`}>{detail.providerName ?? 'Open provider record'}</Link>
              ) : <p>No provider link</p>}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">Original booking</p>
              {detail.originalBookingId ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <Link className="font-semibold text-[var(--color-secondary)] hover:underline" to={`/bookings/${detail.originalBookingId}`}>Open source booking</Link>
                  <Link className="text-xs font-semibold text-[var(--color-secondary)] hover:underline" to={`/support-tickets?bookingId=${encodeURIComponent(detail.originalBookingId)}`}>Source support cases</Link>
                </div>
              ) : <p>No source booking recorded</p>}
              <p className="text-xs text-[var(--color-text-secondary)]">Status {detail.originalBookingStatus ? formatStatus(detail.originalBookingStatus) : 'not recorded'}{detail.originalBookingTotal != null ? ` · ${formatCurrency(detail.originalBookingTotal)}` : ''}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">Manual payment boundary</p>
          <p className="mt-1 text-xs">Each generated booking must be reviewed and paid separately. Automatic charging is disabled under E20{detail.legacyAutoChargePreference ? ', although this legacy row still carries an old preference for audit and cleanup' : ''}.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Provider assignment hold</p>
          <p className="mt-1 text-xs">A listed provider is a legacy series link, not evidence of per-visit acceptance or current eligibility. D29/E41 must be resolved before Admin promises preferred-provider acceptance or changes matching.</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white" aria-label="Generated recurring booking history">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Generated booking history</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">Every row links to the commercial booking record where payment, provider activity, evidence, disputes, refunds, and support are controlled.</p>
        </div>
        {historyQuery.isLoading ? <LoadingState label="Loading generated bookings…" /> : null}
        {historyQuery.isError ? (
          <ErrorState
            title="Generated booking history unavailable"
            description={getErrorMessage(historyQuery.error)}
            action={<Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>Retry</Button>}
          />
        ) : null}
        {!historyQuery.isLoading && !historyQuery.isError && instances.length === 0 ? (
          <EmptyState icon={<Repeat size={36} />} title="No generated bookings yet" description="The series has not produced a booking record. Skipped and failed schedule attempts will also appear here." />
        ) : null}
        {!historyQuery.isLoading && !historyQuery.isError && instances.map((instance) => (
          <article key={instance.id} className="grid gap-3 border-b border-[var(--color-border)] p-4 last:border-b-0 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">Scheduled visit</p>
              <p className="font-semibold text-[var(--color-text)]">{formatDate(instance.scheduledDate)}</p>
              {instance.failureReason ? <p className="mt-1 text-xs text-red-700">{instance.failureReason}</p> : null}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">Outcome</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge label={formatStatus(instance.status)} variant={STATUS_VARIANT[instance.status] ?? 'default'} />
                {instance.bookingStatus ? <Badge label={formatStatus(instance.bookingStatus)} variant="default" /> : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">Provider and support</p>
              {instance.bookingProviderId ? <Link className="font-semibold text-[var(--color-secondary)] hover:underline" to={`/providers/${instance.bookingProviderId}`}>{instance.bookingProviderName ?? 'Open provider'}</Link> : <p className="text-sm">No provider on booking</p>}
              <p className={`text-xs ${instance.openSupportTickets > 0 ? 'font-semibold text-red-700' : 'text-[var(--color-text-secondary)]'}`}>{instance.openSupportTickets} open support case{instance.openSupportTickets === 1 ? '' : 's'}</p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {instance.bookingId ? (
                <>
                  <Link className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-slate-50" to={`/bookings/${instance.bookingId}`}>Open booking</Link>
                  <Link className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-slate-50" to={`/support-tickets?bookingId=${encodeURIComponent(instance.bookingId)}`}>Support</Link>
                </>
              ) : <span className="text-xs text-[var(--color-text-secondary)]">No booking record</span>}
            </div>
          </article>
        ))}
        {pagination && pagination.totalPages > 1 ? (
          <div className="border-t border-[var(--color-border)] p-3">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setHistoryPage} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }): React.ReactElement {
  return (
    <div className={`rounded-lg border bg-white px-4 py-3 ${attention ? 'border-red-300' : 'border-[var(--color-border)]'}`}>
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className={`text-xl font-bold ${attention ? 'text-red-700' : 'text-[var(--color-text)]'}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }): React.ReactElement {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</dt><dd className="mt-0.5 text-sm font-medium text-[var(--color-text)]">{value}</dd></div>;
}

export default function RecurringPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseStatus(searchParams.get('status'));
  const search = searchParams.get('search')?.trim() ?? '';
  const selectedId = searchParams.get('seriesId')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [searchError, setSearchError] = useState('');
  const [actionError, setActionError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<RecurringBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => setSearchInput(search), [search]);

  const listQuery = useQuery({
    queryKey: ['adminRecurring', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await api.get<PaginatedResult>('/api/v1/admin/recurring', { params });
      return response.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/api/v1/admin/recurring/${id}/cancel`, { reason: reason.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminRecurring'] });
      void queryClient.invalidateQueries({ queryKey: ['adminRecurringDetail'] });
      setActionError('');
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const updateParams = (updates: Record<string, string>): void => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const handleSearch = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length === 1) {
      setSearchError('Enter at least 2 characters, or clear the search.');
      return;
    }
    setSearchError('');
    updateParams({ search: trimmed, page: '' });
  };

  const submitCancel = (): void => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (reason.length < 10) {
      setActionError('Cancellation reason must be at least 10 characters.');
      return;
    }
    cancelMutation.mutate({ id: cancelTarget.id, reason });
  };

  const bookings = listQuery.data?.data ?? [];
  const selectedInPage = bookings.some((booking) => booking.id === selectedId);
  const listSummary = listQuery.data?.summary ?? {
    matchingSeries: listQuery.data?.pagination?.total ?? bookings.length,
    activeSeries: bookings.filter((booking) => booking.status === 'active').length,
    seriesWithFailedInstances: bookings.filter((booking) => booking.failedInstances > 0).length,
    openSupportTickets: bookings.reduce((total, booking) => total + (booking.openSupportTickets ?? 0), 0),
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Recurring Booking Operations</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">Inspect schedule health, source and generated bookings, customer/provider context, support ownership, and future-series cancellation.</p>
      </div>

      <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-semibold">Commercial source of truth</p>
        <p className="mt-1 text-xs">Each generated booking owns its payment, provider activity, evidence, dispute, refund, and support history. Series changes affect future generation only. Existing bookings remain unchanged.</p>
      </div>

      <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-white p-4" aria-label="Recurring booking queue controls">
        <div className="flex flex-col gap-3 lg:flex-row">
          <form onSubmit={handleSearch} className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="recurring-search"
                type="search"
                value={searchInput}
                onChange={(event) => { setSearchInput(event.currentTarget.value); setSearchError(''); }}
                minLength={2}
                maxLength={100}
                placeholder="Customer, city, or province"
                aria-label="Search recurring bookings by customer or location"
                aria-describedby={searchError ? 'recurring-search-error' : undefined}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              />
              <Button type="submit">Search</Button>
            </div>
            {searchError ? <p id="recurring-search-error" role="alert" className="mt-2 text-xs text-red-700">{searchError}</p> : null}
          </form>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => updateParams({ status: event.currentTarget.value, page: '' })}
              aria-label="Filter recurring bookings by status"
              className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {search || statusFilter ? <Button variant="outline" onClick={() => updateParams({ search: '', status: '', page: '' })}>Clear filters</Button> : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Filters apply to the full server queue. The selected series remains in the URL for an exact support handoff.</p>
      </section>

      {listQuery.data ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Recurring booking operations summary">
          <Metric label="Matching series" value={listSummary.matchingSeries} />
          <Metric label="Active series" value={listSummary.activeSeries} />
          <Metric label="Series with failed schedules" value={listSummary.seriesWithFailedInstances} attention={listSummary.seriesWithFailedInstances > 0} />
          <Metric label="Open linked support cases" value={listSummary.openSupportTickets} attention={listSummary.openSupportTickets > 0} />
        </div>
      ) : null}

      {selectedId && !selectedInPage ? (
        <section className="mb-5 overflow-hidden rounded-xl border border-sky-300 bg-white" aria-label="Exact linked recurring booking">
          <div className="flex flex-col justify-between gap-3 bg-sky-50 px-4 py-3 sm:flex-row sm:items-center">
            <div><p className="text-sm font-semibold text-sky-950">Exact linked recurring series</p><p className="text-xs text-sky-900">This record is outside the current result page. The support workspace applies to the exact series in the URL.</p></div>
            <Button variant="outline" size="sm" onClick={() => updateParams({ seriesId: '' })}>Close linked series</Button>
          </div>
          <RecurringDetailPanel seriesId={selectedId} />
        </section>
      ) : null}

      {actionError ? <p role="alert" className="mb-4 text-sm text-red-700">{actionError}</p> : null}
      {listQuery.isLoading ? <LoadingState label="Loading recurring booking operations…" /> : null}
      {listQuery.isError ? <ErrorState title="Recurring booking queue unavailable" description={getErrorMessage(listQuery.error)} action={<Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>Retry</Button>} /> : null}
      {!listQuery.isLoading && !listQuery.isError && bookings.length === 0 ? <EmptyState icon={<Repeat size={40} />} title="No recurring series match" description={search || statusFilter ? 'Clear or change the filters to inspect other schedules.' : 'Customer recurring schedules will appear here.'} /> : null}

      {!listQuery.isLoading && !listQuery.isError && bookings.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white" aria-label="Recurring booking operations queue">
          {bookings.map((booking) => (
            <article key={booking.id} className="border-b border-[var(--color-border)] last:border-b-0">
              <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_0.8fr]">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Series and customer</p>
                  <p className="font-semibold text-[var(--color-text)]">{booking.subcategoryName ?? booking.categoryName ?? 'Service not recorded'}</p>
                  <Link className="block truncate text-sm font-medium text-[var(--color-secondary)] hover:underline" to={`/customers/${booking.customerId}`}>{booking.customerName ?? 'Open customer'}</Link>
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-text-secondary)]">{booking.id}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Schedule</p>
                  <p className="text-sm font-medium text-[var(--color-text)]">{FREQUENCY_LABELS[booking.frequency] ?? booking.frequency}, {booking.preferredDayName} at {booking.preferredTime}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Next {booking.status === 'active' ? formatDate(booking.nextBookingDate) : 'inactive'} · {booking.city}, {booking.province}</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrency(booking.totalAmount)} per generated visit</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Provider and booking linkage</p>
                  {booking.providerId ? <Link className="block truncate text-sm font-medium text-[var(--color-secondary)] hover:underline" to={`/providers/${booking.providerId}`}>{booking.providerName ?? 'Open legacy provider link'}</Link> : <p className="text-sm">No provider link</p>}
                  {booking.originalBookingId ? <Link className="mt-1 block text-xs font-semibold text-[var(--color-secondary)] hover:underline" to={`/bookings/${booking.originalBookingId}`}>Open source booking</Link> : <p className="mt-1 text-xs text-[var(--color-text-secondary)]">No source booking</p>}
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{booking.totalInstances} generated instance{booking.totalInstances === 1 ? '' : 's'}</p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2"><Badge label={formatStatus(booking.status)} variant={STATUS_VARIANT[booking.status] ?? 'default'} /></div>
                  <p className={`mt-2 text-xs ${booking.failedInstances > 0 ? 'font-semibold text-red-700' : 'text-[var(--color-text-secondary)]'}`}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{booking.failedInstances} failed schedule{booking.failedInstances === 1 ? '' : 's'}</p>
                  <p className={`mt-1 text-xs ${booking.openSupportTickets > 0 ? 'font-semibold text-red-700' : 'text-[var(--color-text-secondary)]'}`}><Ticket className="mr-1 inline h-3.5 w-3.5" />{booking.openSupportTickets} open support case{booking.openSupportTickets === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] px-4 py-2">
                <Button variant="ghost" size="sm" aria-expanded={selectedId === booking.id} onClick={() => updateParams({ seriesId: selectedId === booking.id ? '' : booking.id })}>{selectedId === booking.id ? 'Hide support workspace' : 'Review support workspace'}</Button>
                {booking.status !== 'cancelled' ? <Button variant="ghost" size="sm" className="text-red-700" onClick={() => { setCancelTarget(booking); setCancelReason(''); setActionError(''); }}>Cancel future series</Button> : null}
              </div>
              {selectedId === booking.id ? <RecurringDetailPanel seriesId={booking.id} /> : null}
            </article>
          ))}
        </section>
      ) : null}

      {listQuery.data && listQuery.data.pagination.totalPages > 1 ? <div className="mt-4"><Pagination page={listQuery.data.pagination.page} totalPages={listQuery.data.pagination.totalPages} total={listQuery.data.pagination.total} pageSize={listQuery.data.pagination.pageSize} onPageChange={(nextPage) => updateParams({ page: nextPage <= 1 ? '' : String(nextPage) })} /></div> : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-recurring-title" className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-white p-6">
            <h3 id="cancel-recurring-title" className="text-lg font-semibold text-[var(--color-text)]">Cancel future recurring series</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{cancelTarget.customerName ?? 'Unknown customer'} · {FREQUENCY_LABELS[cancelTarget.frequency] ?? cancelTarget.frequency}</p>
            <p className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">This stops future generation only. Existing bookings, payments, refunds, disputes, support cases, and provider work records remain unchanged.</p>
            <label htmlFor="recurring-cancel-reason" className="block text-sm font-medium text-[var(--color-text)]">Operator reason *</label>
            <textarea id="recurring-cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.currentTarget.value)} rows={3} minLength={10} maxLength={500} placeholder="Explain the support or operational decision (10–500 characters)" className="mt-1.5 w-full resize-none rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]" />
            <p className="mt-1 text-right text-xs text-[var(--color-text-secondary)]">{cancelReason.length}/500</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(''); setActionError(''); }} disabled={cancelMutation.isPending}>Keep series</Button>
              <Button variant="destructive" onClick={submitCancel} disabled={cancelMutation.isPending || cancelReason.trim().length < 10}>{cancelMutation.isPending ? 'Cancelling…' : 'Confirm cancellation'}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
