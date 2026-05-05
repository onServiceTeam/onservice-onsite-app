import React, { useMemo, useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  KpiCard,
  Label,
  LoadingState,
  Textarea,
} from '@/components/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers + types
// ─────────────────────────────────────────────────────────────────────────────

type TabKey =
  | 'overview'
  | 'escrow'
  | 'payouts'
  | 'guarantee'
  | 'reconciliation'
  | 'bir'
  | 'receipts';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'escrow', label: 'Escrow' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'guarantee', label: 'Guarantee Fund' },
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'bir', label: 'BIR Reports' },
  { key: 'receipts', label: 'Receipts' },
];

// BUG-PHASE112-01 fix — pre-fix these helpers used
// toISOString().slice(0, 10), which is the UTC date. For an admin in
// Manila opening this page at 00:30 Manila Thursday (= 16:30 UTC
// Wednesday), the default `to` was Wednesday — Thursday's data was
// off-screen until the operator manually pulled the date one day
// forward. Same Manila-tz fix as Phases 105, 109, 111. We extract
// Manila day directly via toLocaleDateString('en-CA', tz: Asia/Manila),
// which produces the same YYYY-MM-DD shape used by the date input.
function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ageHours(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  return `${Math.max(0, Math.floor(ms / 3_600_000))}h`;
}

function MonthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable mini horizontal bar chart
// ─────────────────────────────────────────────────────────────────────────────

interface BreakdownRow {
  label: string;
  revenue: number;
  bookings: number;
}

function HorizontalBars({
  title,
  rows,
  loading,
  error,
  emptyText,
}: {
  title: string;
  rows: BreakdownRow[];
  loading: boolean;
  error: unknown;
  emptyText: string;
}): React.ReactElement {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{title}</h3>
      {loading ? (
        <div className="text-sm text-[var(--color-text-secondary)] py-6 text-center">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 py-6 text-center">{getErrorMessage(error)}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-[var(--color-text-secondary)] py-6 text-center">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const pct = (row.revenue / max) * 100;
            return (
              <div key={row.label} className="text-xs">
                <div className="flex justify-between text-[var(--color-text)] mb-1">
                  <span className="truncate pr-2 font-medium">{row.label}</span>
                  <span className="tabular-nums text-[var(--color-text-secondary)]">
                    {formatCurrency(row.revenue)} · {row.bookings}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded">
                  <div
                    className="h-2 bg-emerald-500 rounded"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Overview
// ─────────────────────────────────────────────────────────────────────────────

interface OverviewData {
  gmv: number;
  revenue: number;
  refunds: number;
  netRevenue: number;
  bookingsCompleted: number;
  averageTicket: number;
}

interface BreakdownItem {
  label?: string;
  category?: string;
  city?: string;
  tier?: string;
  paymentMethod?: string;
  revenue: number;
  bookings: number;
}

function normalizeBreakdown(items: BreakdownItem[] | undefined, key: keyof BreakdownItem): BreakdownRow[] {
  if (!items) return [];
  return items.map((it) => ({
    label: String(it[key] ?? it.label ?? '—'),
    revenue: Number(it.revenue ?? 0),
    bookings: Number(it.bookings ?? 0),
  }));
}

function OverviewPanel(): React.ReactElement {
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());

  const overviewQ = useQuery({
    queryKey: ['fin-overview', from, to],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<OverviewData>>(
        '/api/v1/admin/financials/overview',
        { params: { from, to } },
      );
      return res.data.data;
    },
  });

  const byCategoryQ = useQuery({
    queryKey: ['fin-by-category', from, to],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<BreakdownItem[]>>(
        '/api/v1/admin/financials/revenue/by-category',
        { params: { from, to } },
      );
      return res.data.data;
    },
  });

  const byCityQ = useQuery({
    queryKey: ['fin-by-city', from, to],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<BreakdownItem[]>>(
        '/api/v1/admin/financials/revenue/by-city',
        { params: { from, to, limit: 10 } },
      );
      return res.data.data;
    },
  });

  const byTierQ = useQuery({
    queryKey: ['fin-by-tier', from, to],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<BreakdownItem[]>>(
        '/api/v1/admin/financials/revenue/by-tier',
        { params: { from, to } },
      );
      return res.data.data;
    },
  });

  // MED-N11 / PROGRESS.md follow-up — by-payment endpoint returns a
  // structured `{rows, degraded, message}` shape so the UI can show
  // a "schema not migrated" banner instead of silently rendering
  // "all unknown" rows.
  const byPaymentQ = useQuery({
    queryKey: ['fin-by-payment', from, to],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<{
        rows: BreakdownItem[];
        degraded: boolean;
        message: string | null;
      }>>(
        '/api/v1/admin/financials/revenue/by-payment',
        { params: { from, to } },
      );
      return res.data.data;
    },
  });

  const o = overviewQ.data;

  return (
    <div>
      {/* Date range */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl p-4 mb-6 flex items-end gap-3 flex-wrap">
        <div>
          <Label htmlFor="overview-from">From</Label>
          <Input
            id="overview-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-40"
          />
        </div>
        <div>
          <Label htmlFor="overview-to">To</Label>
          <Input
            id="overview-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-40"
          />
        </div>
      </div>

      {overviewQ.isError && (
        <div className="mb-4">
          <ErrorState description={getErrorMessage(overviewQ.error)} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {overviewQ.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[var(--color-border)] bg-white p-5 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-3" />
                <div className="h-7 bg-slate-200 rounded w-1/2" />
              </div>
            ))
          : (
            <>
              <KpiCard title="GMV" value={formatCurrency(o?.gmv ?? 0)} icon={null} />
              <KpiCard title="Revenue" value={formatCurrency(o?.revenue ?? 0)} icon={null} />
              <KpiCard title="Refunds" value={formatCurrency(o?.refunds ?? 0)} icon={null} />
              <KpiCard title="Net Revenue" value={formatCurrency(o?.netRevenue ?? 0)} icon={null} />
              <KpiCard title="Bookings Completed" value={String(o?.bookingsCompleted ?? 0)} icon={null} />
              <KpiCard title="Average Ticket" value={formatCurrency(o?.averageTicket ?? 0)} icon={null} />
            </>
          )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBars
          title="Revenue by Category"
          rows={normalizeBreakdown(byCategoryQ.data, 'category')}
          loading={byCategoryQ.isLoading}
          error={byCategoryQ.isError ? byCategoryQ.error : null}
          emptyText="No category revenue in this range."
        />
        <HorizontalBars
          title="Revenue by City (Top 10)"
          rows={normalizeBreakdown(byCityQ.data, 'city')}
          loading={byCityQ.isLoading}
          error={byCityQ.isError ? byCityQ.error : null}
          emptyText="No city revenue in this range."
        />
        <HorizontalBars
          title="Revenue by Tier"
          rows={normalizeBreakdown(byTierQ.data, 'tier')}
          loading={byTierQ.isLoading}
          error={byTierQ.isError ? byTierQ.error : null}
          emptyText="No tier revenue in this range."
        />
        <div>
          {byPaymentQ.data?.degraded && byPaymentQ.data.message && (
            <div
              className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              role="status"
              aria-live="polite"
            >
              <span className="font-semibold">Heads up:</span> {byPaymentQ.data.message}
            </div>
          )}
          <HorizontalBars
            title="Revenue by Payment Method"
            rows={normalizeBreakdown(byPaymentQ.data?.rows ?? [], 'paymentMethod')}
            loading={byPaymentQ.isLoading}
            error={byPaymentQ.isError ? byPaymentQ.error : null}
            emptyText={
              byPaymentQ.data?.degraded
                ? 'Payment-method tracking unavailable.'
                : 'No payment-method revenue in this range.'
            }
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Escrow
// ─────────────────────────────────────────────────────────────────────────────

interface EscrowAging {
  bucket: string;
  count: number;
  total: number;
}

interface EscrowPending {
  bookingId: string;
  customerName: string;
  providerName: string;
  amount: number;
  completedAt: string | null;
}

interface EscrowData {
  totalInEscrow: number;
  aging: EscrowAging[];
  pendingReleaseList: EscrowPending[];
}

const AGING_BUCKETS: { key: string; label: string }[] = [
  { key: '0-24h', label: '0 – 24h' },
  { key: '24-48h', label: '24 – 48h' },
  { key: '48-168h', label: '48 – 168h' },
  { key: '168h+', label: '168h+' },
];

function EscrowPanel(): React.ReactElement {
  const q = useQuery({
    queryKey: ['fin-escrow'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<EscrowData>>('/api/v1/admin/financials/escrow');
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data;
  if (!data) return <EmptyState title="No escrow data" description="Nothing to display." />;

  const agingByKey = new Map(data.aging.map((a) => [a.bucket, a]));

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard title="Total in Escrow" value={formatCurrency(data.totalInEscrow)} icon={null} />
        {AGING_BUCKETS.map((b) => {
          const row = agingByKey.get(b.key);
          return (
            <div
              key={b.key}
              className="bg-white rounded-xl border border-[var(--color-border)] p-5"
            >
              <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">{b.label}</p>
              <p className="text-2xl font-bold text-[var(--color-text)] mt-1">
                {formatCurrency(row?.total ?? 0)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">{row?.count ?? 0} bookings</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-[var(--color-border)] rounded-xl p-5">
        <h2 className="text-base font-semibold text-[var(--color-text)] mb-4">Pending Release</h2>
        {data.pendingReleaseList.length === 0 ? (
          <EmptyState title="No pending releases" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Booking</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Customer</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Provider</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Amount</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Completed</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Age</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingReleaseList.map((row) => (
                  <tr key={row.bookingId} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <Link
                        to={`/bookings/${row.bookingId}`}
                        className="text-blue-600 hover:underline font-mono text-xs"
                      >
                        {row.bookingId.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{row.customerName}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{row.providerName}</td>
                    <td className="py-2 px-3 text-right font-medium text-[var(--color-text)]">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="py-2 px-3 text-[var(--color-text-secondary)] text-xs">
                      {formatDateTime(row.completedAt)}
                    </td>
                    <td className="py-2 px-3 text-right text-[var(--color-text-secondary)]">
                      {ageHours(row.completedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Payouts
// ─────────────────────────────────────────────────────────────────────────────

interface PayoutFailed {
  id: string;
  providerName: string;
  amount: number;
  failedAt: string;
  failureReason: string | null;
}

interface PayoutsData {
  pendingCount: number;
  pendingTotal: number;
  todayCompletedCount: number;
  todayCompletedTotal: number;
  failedCount: number;
  upcomingScheduled: number;
  recentFailed: PayoutFailed[];
}

function PayoutsPanel(): React.ReactElement {
  const q = useQuery({
    queryKey: ['fin-payouts'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<PayoutsData>>('/api/v1/admin/financials/payouts');
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const d = q.data;
  if (!d) return <EmptyState title="No payouts data" />;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiCard title="Pending (count)" value={String(d.pendingCount)} icon={null} />
        <KpiCard title="Pending (total)" value={formatCurrency(d.pendingTotal)} icon={null} />
        <KpiCard title="Today Completed (count)" value={String(d.todayCompletedCount)} icon={null} />
        <KpiCard title="Today Completed (total)" value={formatCurrency(d.todayCompletedTotal)} icon={null} />
        <KpiCard title="Failed" value={String(d.failedCount)} icon={null} />
        <KpiCard title="Upcoming Scheduled" value={String(d.upcomingScheduled)} icon={null} />
      </div>

      <div className="bg-white border border-[var(--color-border)] rounded-xl p-5">
        <h2 className="text-base font-semibold text-[var(--color-text)] mb-4">Recent Failed Payouts</h2>
        {d.recentFailed.length === 0 ? (
          <EmptyState title="No recent failures" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Payout ID</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Provider</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Amount</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Failed At</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Reason</th>
                </tr>
              </thead>
              <tbody>
                {d.recentFailed.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-xs text-[var(--color-text)]">{row.id.slice(0, 10)}…</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{row.providerName}</td>
                    <td className="py-2 px-3 text-right font-medium text-[var(--color-text)]">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="py-2 px-3 text-[var(--color-text-secondary)] text-xs">
                      {formatDateTime(row.failedAt)}
                    </td>
                    <td className="py-2 px-3 text-red-700 text-xs">{row.failureReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4: Guarantee Fund
// ─────────────────────────────────────────────────────────────────────────────

interface GuaranteeFundData {
  currentBalance: number;
  inflow30d: number;
  outflow30d: number;
  net30d: number;
  avgMonthlyOutflow: number;
  runwayMonths: number | null;
  needsReplenishment: boolean;
}

function formatRunway(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (!Number.isFinite(v)) return 'Infinity';
  return `${v.toFixed(1)} mo`;
}

function GuaranteeFundPanel(): React.ReactElement {
  const q = useQuery({
    queryKey: ['fin-guarantee'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<GuaranteeFundData>>('/api/v1/admin/financials/guarantee-fund');
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const d = q.data;
  if (!d) return <EmptyState title="No guarantee-fund data" />;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiCard title="Current Balance" value={formatCurrency(d.currentBalance)} icon={null} />
        <KpiCard title="30d Inflow" value={formatCurrency(d.inflow30d)} icon={null} />
        <KpiCard title="30d Outflow" value={formatCurrency(d.outflow30d)} icon={null} />
        <KpiCard title="Net (30d)" value={formatCurrency(d.net30d)} icon={null} />
        <KpiCard title="Avg Monthly Outflow" value={formatCurrency(d.avgMonthlyOutflow)} icon={null} />
        <KpiCard title="Runway" value={formatRunway(d.runwayMonths)} icon={null} />
      </div>

      <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Replenishment Status</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Auto-evaluated from runway and outflow trends.
          </p>
        </div>
        {d.needsReplenishment ? (
          <Badge label="REPLENISH" variant="danger" />
        ) : (
          <Badge label="OK" variant="success" />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 5: Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

interface ReconciliationRow {
  id: string;
  snapshotDate: string;
  paymongoBalance: number;
  expectedTotal: number;
  discrepancy: number;
  alertSent: boolean;
}

function ReconciliationPanel({ isSuperAdmin }: { isSuperAdmin: boolean }): React.ReactElement {
  const qc = useQueryClient();
  const [showRun, setShowRun] = useState(false);
  const [ackTarget, setAckTarget] = useState<ReconciliationRow | null>(null);

  const q = useQuery({
    queryKey: ['fin-reconciliation', 30],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ReconciliationRow[]>>(
        '/api/v1/admin/bir/reconciliation/recent',
        { params: { limit: 30 } },
      );
      return res.data.data;
    },
  });

  const [runBalance, setRunBalance] = useState('');
  const [runNotes, setRunNotes] = useState('');

  const runMut = useMutation({
    mutationFn: async (payload: { paymongoBalance?: number; notes?: string }) => {
      const res = await api.post<ApiEnvelope<unknown>>(
        '/api/v1/admin/bir/reconciliation/run',
        payload,
      );
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Reconciliation triggered.');
      setShowRun(false);
      setRunBalance('');
      setRunNotes('');
      qc.invalidateQueries({ queryKey: ['fin-reconciliation', 30] });
    },
    onError: (err) => {
      toast.error(`Failed: ${getErrorMessage(err)}`);
    },
  });

  const [ackNote, setAckNote] = useState('');
  const ackMut = useMutation({
    mutationFn: async (payload: { id: string; note: string }) => {
      const res = await api.post<ApiEnvelope<unknown>>(
        `/api/v1/admin/bir/reconciliation/${payload.id}/acknowledge`,
        { note: payload.note },
      );
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Acknowledged.');
      setAckTarget(null);
      setAckNote('');
      qc.invalidateQueries({ queryKey: ['fin-reconciliation', 30] });
    },
    onError: (err) => {
      toast.error(`Failed: ${getErrorMessage(err)}`);
    },
  });

  const submitRun = (): void => {
    const payload: { paymongoBalance?: number; notes?: string } = {};
    if (runBalance.trim() !== '') {
      const n = Number(runBalance);
      if (!Number.isFinite(n)) {
        toast.warning('PayMongo balance must be a number (centavos).');
        return;
      }
      payload.paymongoBalance = n;
    }
    if (runNotes.trim() !== '') payload.notes = runNotes.trim();
    runMut.mutate(payload);
  };

  const submitAck = (): void => {
    if (!ackTarget) return;
    const note = ackNote.trim();
    if (note.length < 5 || note.length > 1000) {
      toast.warning('Note must be 5–1000 characters.');
      return;
    }
    ackMut.mutate({ id: ackTarget.id, note });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Recent Reconciliations</h2>
        {isSuperAdmin && (
          <Button onClick={() => setShowRun(true)}>Run Reconciliation Now</Button>
        )}
      </div>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState description={getErrorMessage(q.error)} />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState title="No reconciliation snapshots yet" />
      ) : (
        <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Snapshot Date</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">PayMongo Balance</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Expected Total</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Discrepancy</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Alert</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                  <td className="py-2 px-3 text-[var(--color-text)]">{formatDate(row.snapshotDate)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(row.paymongoBalance)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(row.expectedTotal)}</td>
                  <td className={`py-2 px-3 text-right font-semibold ${row.discrepancy === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(row.discrepancy)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {row.alertSent ? (
                      <Badge label="ALERT" variant="danger" />
                    ) : (
                      <Badge label="OK" variant="success" />
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.alertSent && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setAckTarget(row);
                          setAckNote('');
                        }}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Run dialog */}
      <Dialog open={showRun} onOpenChange={setShowRun}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Reconciliation</DialogTitle>
            <DialogDescription>
              Trigger a new reconciliation snapshot. Both fields are optional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="run-balance">PayMongo Balance (centavos)</Label>
              <Input
                id="run-balance"
                value={runBalance}
                onChange={(e) => setRunBalance(e.target.value)}
                placeholder="e.g. 12345678"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="run-notes">Notes</Label>
              <Textarea
                id="run-notes"
                value={runNotes}
                onChange={(e) => setRunNotes(e.target.value)}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRun(false)} disabled={runMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitRun} disabled={runMut.isPending}>
              {runMut.isPending ? 'Running…' : 'Run Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledge dialog */}
      <Dialog open={ackTarget !== null} onOpenChange={(open) => !open && setAckTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Discrepancy</DialogTitle>
            <DialogDescription>
              Snapshot {ackTarget ? formatDate(ackTarget.snapshotDate) : ''} — discrepancy{' '}
              {ackTarget ? formatCurrency(ackTarget.discrepancy) : ''}.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="ack-note">Acknowledgement Note (5–1000 chars)</Label>
            <Textarea
              id="ack-note"
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              placeholder="Explain investigation / resolution…"
              rows={5}
            />
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{ackNote.length} / 1000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckTarget(null)} disabled={ackMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitAck} disabled={ackMut.isPending}>
              {ackMut.isPending ? 'Submitting…' : 'Acknowledge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 6: BIR Reports
// ─────────────────────────────────────────────────────────────────────────────

interface BirMonthlyReport {
  month: number;
  outputVat: number;
  vatPayable: number;
  finalized: boolean;
  pdfUrl: string | null;
}

interface BirQuarterlyBatch {
  quarter: number;
  batchCount: number;
  totalWithheld: number;
}

interface BirOverviewData {
  year: number;
  totalOutputVat: number;
  totalVatPayable: number;
  monthsFinalized: number;
  monthlyReports: BirMonthlyReport[];
  quarterlyBatches: BirQuarterlyBatch[];
}

interface Q2307Item {
  providerId: string;
  providerName: string;
  amount: number;
}

function BirReportsPanel({ isSuperAdmin }: { isSuperAdmin: boolean }): React.ReactElement {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [expandedQuarter, setExpandedQuarter] = useState<number | null>(null);

  const overviewQ = useQuery({
    queryKey: ['bir-overview', year],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<BirOverviewData>>(
        '/api/v1/admin/bir/overview',
        { params: { year } },
      );
      return res.data.data;
    },
  });

  const generateMonthMut = useMutation({
    mutationFn: async (payload: { year: number; month: number }) => {
      const res = await api.post<ApiEnvelope<unknown>>(
        `/api/v1/admin/bir/vat/reports/${payload.year}/${payload.month}/generate`,
        {},
      );
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Monthly report generated.');
      qc.invalidateQueries({ queryKey: ['bir-overview', year] });
    },
    onError: (err) => toast.error(`Failed: ${getErrorMessage(err)}`),
  });

  const finalizeMonthMut = useMutation({
    mutationFn: async (payload: { year: number; month: number }) => {
      const res = await api.post<ApiEnvelope<unknown>>(
        `/api/v1/admin/bir/vat/reports/${payload.year}/${payload.month}/finalize`,
        {},
      );
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Monthly report finalized.');
      qc.invalidateQueries({ queryKey: ['bir-overview', year] });
    },
    onError: (err) => toast.error(`Failed: ${getErrorMessage(err)}`),
  });

  const generateQuarterMut = useMutation({
    mutationFn: async (payload: { year: number; quarter: number }) => {
      const res = await api.post<ApiEnvelope<unknown>>(
        `/api/v1/admin/bir/2307/quarter/${payload.year}/${payload.quarter}/generate`,
        {},
      );
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Quarterly batch generated.');
      qc.invalidateQueries({ queryKey: ['bir-overview', year] });
    },
    onError: (err) => toast.error(`Failed: ${getErrorMessage(err)}`),
  });

  const q2307ListQ = useQuery({
    queryKey: ['bir-2307-list', year, expandedQuarter],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Q2307Item[]>>(
        `/api/v1/admin/bir/2307/quarter/${year}/${expandedQuarter}/list`,
      );
      return res.data.data;
    },
    enabled: expandedQuarter !== null,
  });

  const yearOptions = [currentYear - 2, currentYear - 1, currentYear];

  if (overviewQ.isLoading) return <LoadingState />;
  if (overviewQ.isError) return <ErrorState description={getErrorMessage(overviewQ.error)} />;
  const d = overviewQ.data;
  if (!d) return <EmptyState title="No BIR data" />;

  return (
    <div>
      <div className="bg-white border border-[var(--color-border)] rounded-xl p-4 mb-6 flex items-end gap-3">
        <div>
          <Label htmlFor="bir-year">Year</Label>
          <select
            id="bir-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 h-9 px-3 border border-slate-300 rounded-md text-sm bg-white"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Annual summary */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Annual Summary ({d.year})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Total Output VAT</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-1">{formatCurrency(d.totalOutputVat)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Total VAT Payable</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-1">{formatCurrency(d.totalVatPayable)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Months Finalized</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-1">{d.monthsFinalized} / 12</p>
          </div>
        </div>
      </div>

      {/* Monthly reports */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 mb-6 overflow-x-auto">
        <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Monthly VAT Reports</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Month</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Output VAT</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">VAT Payable</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {d.monthlyReports.map((m) => (
              <tr key={m.month} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                <td className="py-2 px-3 text-[var(--color-text)]">{MonthName(m.month)}</td>
                <td className="py-2 px-3 text-right">{formatCurrency(m.outputVat)}</td>
                <td className="py-2 px-3 text-right">{formatCurrency(m.vatPayable)}</td>
                <td className="py-2 px-3 text-center">
                  {m.finalized ? (
                    <Badge label="FINALIZED" variant="success" />
                  ) : (
                    <Badge label="DRAFT" variant="warning" />
                  )}
                </td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    {isSuperAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateMonthMut.mutate({ year: d.year, month: m.month })}
                        disabled={generateMonthMut.isPending}
                      >
                        Generate
                      </Button>
                    )}
                    {isSuperAdmin && !m.finalized && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => finalizeMonthMut.mutate({ year: d.year, month: m.month })}
                        disabled={finalizeMonthMut.isPending}
                      >
                        Finalize
                      </Button>
                    )}
                    {m.pdfUrl && (
                      <a
                        href={m.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Download PDF
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quarterly 2307 batches */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl p-5">
        <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Quarterly 2307 Batches</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Quarter</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Batch Count</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Total Withheld</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {d.quarterlyBatches.map((qb) => (
                <tr key={qb.quarter} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                  <td className="py-2 px-3 text-[var(--color-text)]">Q{qb.quarter}</td>
                  <td className="py-2 px-3 text-right">{qb.batchCount}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(qb.totalWithheld)}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateQuarterMut.mutate({ year: d.year, quarter: qb.quarter })}
                        disabled={generateQuarterMut.isPending}
                      >
                        Generate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedQuarter((prev) => (prev === qb.quarter ? null : qb.quarter))
                        }
                      >
                        {expandedQuarter === qb.quarter ? 'Hide list' : 'View list'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {expandedQuarter !== null && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">
              Q2307 Batch List for Q{expandedQuarter} {d.year}
            </h3>
            {q2307ListQ.isLoading ? (
              <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
            ) : q2307ListQ.isError ? (
              <p className="text-sm text-red-600">{getErrorMessage(q2307ListQ.error)}</p>
            ) : !q2307ListQ.data || q2307ListQ.data.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No providers in this batch.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Provider</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Withheld</th>
                  </tr>
                </thead>
                <tbody>
                  {q2307ListQ.data.map((it) => (
                    <tr key={it.providerId} className="border-b border-[var(--color-border)]">
                      <td className="py-2 px-3 text-[var(--color-text)]">{it.providerName}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 7: Receipts
// ─────────────────────────────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  orNumber: string;
  customerName: string;
  providerName: string;
  issuedAt: string;
  gross: number;
  vat: number;
  isCancellation: boolean;
  pdfUrl: string | null;
}

interface ReceiptSearchParams {
  orNumber: string;
  customerName: string;
  providerName: string;
  from: string;
  to: string;
  limit: number;
}

function ReceiptsPanel(): React.ReactElement {
  const [draft, setDraft] = useState<ReceiptSearchParams>({
    orNumber: '',
    customerName: '',
    providerName: '',
    from: '',
    to: '',
    limit: 50,
  });
  const [submitted, setSubmitted] = useState<ReceiptSearchParams | null>(null);

  const q = useQuery({
    queryKey: ['fin-receipts', submitted],
    queryFn: async () => {
      if (!submitted) return [];
      const params: Record<string, string | number> = { limit: submitted.limit };
      if (submitted.orNumber) params.orNumber = submitted.orNumber;
      if (submitted.customerName) params.customerName = submitted.customerName;
      if (submitted.providerName) params.providerName = submitted.providerName;
      if (submitted.from) params.from = submitted.from;
      if (submitted.to) params.to = submitted.to;
      const res = await api.get<ApiEnvelope<ReceiptRow[]>>(
        '/api/v1/admin/financials/receipts/search',
        { params },
      );
      return res.data.data;
    },
    enabled: submitted !== null,
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setSubmitted({ ...draft });
  };

  return (
    <div>
      <form
        onSubmit={onSubmit}
        className="bg-white border border-[var(--color-border)] rounded-xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      >
        <div className="lg:col-span-1">
          <Label htmlFor="r-or">OR Number</Label>
          <Input
            id="r-or"
            value={draft.orNumber}
            onChange={(e) => setDraft({ ...draft, orNumber: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="lg:col-span-1">
          <Label htmlFor="r-customer">Customer</Label>
          <Input
            id="r-customer"
            value={draft.customerName}
            onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="lg:col-span-1">
          <Label htmlFor="r-provider">Provider</Label>
          <Input
            id="r-provider"
            value={draft.providerName}
            onChange={(e) => setDraft({ ...draft, providerName: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="lg:col-span-1">
          <Label htmlFor="r-from">From</Label>
          <Input
            id="r-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="lg:col-span-1">
          <Label htmlFor="r-to">To</Label>
          <Input
            id="r-to"
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="lg:col-span-1">
          <Label htmlFor="r-limit">Limit</Label>
          <Input
            id="r-limit"
            type="number"
            min={1}
            max={500}
            value={draft.limit}
            onChange={(e) => setDraft({ ...draft, limit: Number(e.target.value) || 50 })}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
          <Button type="submit">Search</Button>
        </div>
      </form>

      {submitted === null ? (
        <EmptyState
          title="Search receipts"
          description="Enter at least one filter and click Search to look up receipts."
        />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState description={getErrorMessage(q.error)} />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState title="No receipts match your search" />
      ) : (
        <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">OR #</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Customer</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Provider</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Issued</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Gross</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">VAT</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Type</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">PDF</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono text-xs">
                    {row.pdfUrl ? (
                      <a
                        href={row.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {row.orNumber}
                      </a>
                    ) : (
                      <span className="text-[var(--color-text)]">{row.orNumber}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-[var(--color-text)]">{row.customerName}</td>
                  <td className="py-2 px-3 text-[var(--color-text)]">{row.providerName}</td>
                  <td className="py-2 px-3 text-[var(--color-text-secondary)] text-xs">
                    {formatDateTime(row.issuedAt)}
                  </td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(row.gross)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(row.vat)}</td>
                  <td className="py-2 px-3 text-center">
                    {row.isCancellation ? (
                      <Badge label="CANCELLATION" variant="danger" />
                    ) : (
                      <Badge label="OFFICIAL" variant="success" />
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.pdfUrl ? (
                      <a
                        href={row.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page shell
// ─────────────────────────────────────────────────────────────────────────────

export default function FinancialsPage(): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('overview');
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = useMemo(() => role === 'super_admin', [role]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Financials</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Revenue, escrow, payouts, BIR reports and reconciliation.
        </p>
      </div>

      {/* Segmented control */}
      <div
        role="tablist"
        aria-label="Financials sections"
        className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 mb-6"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewPanel />}
      {tab === 'escrow' && <EscrowPanel />}
      {tab === 'payouts' && <PayoutsPanel />}
      {tab === 'guarantee' && <GuaranteeFundPanel />}
      {tab === 'reconciliation' && <ReconciliationPanel isSuperAdmin={isSuperAdmin} />}
      {tab === 'bir' && <BirReportsPanel isSuperAdmin={isSuperAdmin} />}
      {tab === 'receipts' && <ReceiptsPanel />}
    </div>
  );
}
