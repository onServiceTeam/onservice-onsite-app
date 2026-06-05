import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAdminSocketEvent } from '@/lib/use-admin-socket';
import {
  KpiCard,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  ChartContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ChartTooltip,
  ChartLegend,
  CHART_COLORS,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import {
  Coins,
  ClipboardList,
  AlertTriangle,
  UserPlus,
  Wrench,
  Calendar,
  AlertCircle,
  Clock,
  MapPin,
  RefreshCw,
  ChevronRight,
  BarChart3,
} from '@/components/icons';

type DateRange = 'today' | '7d' | '30d' | '90d' | 'ytd';

interface DashboardKpis {
  revenue: number;
  revenueTrendPct: number;
  activeBookings: number;
  pendingDisputes: number;
  newSignups: number;
  pendingApprovals: number;
  todayBookings: number;
  escalatedDisputes: number;
  staleDisputes: number;
  escrowBalance: number;
  platformRevenue: number;
  guaranteeFund: number;
  guaranteeFundRunwayMonths: number;
}

interface RevenueTrendPoint { date: string; gmv: number; revenue: number }
interface BookingVolumePoint { category: string; count: number }
interface AcquisitionFunnel { registered: number; firstBooking: number; repeatBooking: number }
interface OperationalAlert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
  action_url: string | null;
  created_at: string;
}
interface CityPerformance {
  id: string;
  name: string;
  status: string;
  activeProviders: number;
  todayBookings: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await api.get<{ success: boolean; data: T }>(url);
  return res.data.data;
}

export default function DashboardPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRange>('today');

  useAdminSocketEvent<{ id: string }>('alert:new', () => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard-alerts'] });
  });

  const kpis = useQuery({
    queryKey: ['dashboard-kpis', range],
    queryFn: () => fetchJson<DashboardKpis>(`/api/v1/admin/dashboard/kpis?range=${range}`),
    refetchInterval: 60_000,
  });

  const revenueTrend = useQuery({
    queryKey: ['dashboard-revenue-trend'],
    queryFn: () => fetchJson<RevenueTrendPoint[]>('/api/v1/admin/dashboard/revenue-trend?days=30'),
    refetchInterval: 60_000,
  });

  const bookingVolume = useQuery({
    queryKey: ['dashboard-booking-volume'],
    queryFn: () => fetchJson<BookingVolumePoint[]>('/api/v1/admin/dashboard/booking-volume?days=7'),
    refetchInterval: 60_000,
  });

  const funnel = useQuery({
    queryKey: ['dashboard-funnel'],
    queryFn: () => fetchJson<AcquisitionFunnel>('/api/v1/admin/dashboard/acquisition-funnel?days=30'),
    refetchInterval: 300_000,
  });

  const alerts = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => fetchJson<OperationalAlert[]>('/api/v1/admin/dashboard/alerts'),
    refetchInterval: 30_000,
  });

  // Phase 11: prepend overdue/near-due DSRs as alert rows (compliance dashboard wiring).
  const dsrAlerts = useQuery({
    queryKey: ['dashboard-dsr-alerts'],
    queryFn: async () => {
      try {
        return await fetchJson<Array<{
          id: string;
          requestType: string;
          userEmail: string | null;
          dueAt: string;
          daysUntilDue: number;
          isOverdue: boolean;
        }>>('/api/v1/admin/compliance/dsr-alerts');
      } catch {
        return [];
      }
    },
    refetchInterval: 60_000,
  });

  const mergedAlerts: OperationalAlert[] = React.useMemo(() => {
    const dsrData = Array.isArray(dsrAlerts.data) ? dsrAlerts.data : [];
    const alertData = Array.isArray(alerts.data) ? alerts.data : [];
    const dsrRows: OperationalAlert[] = dsrData.map((d) => ({
      id: `dsr-${d.id}`,
      type: 'dsr_due',
      severity: d.isOverdue ? 'danger' : 'warning',
      title: `DSR ${d.requestType} ${d.isOverdue ? 'OVERDUE' : 'due soon'}`,
      description: `${d.userEmail ?? 'user'} — due ${new Date(d.dueAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })} (${d.daysUntilDue}d)`,
      action_url: '/compliance',
      created_at: new Date().toISOString(),
    }));
    return [...dsrRows, ...alertData];
  }, [dsrAlerts.data, alerts.data]);

  const cities = useQuery({
    queryKey: ['dashboard-cities'],
    queryFn: () => fetchJson<CityPerformance[]>('/api/v1/admin/dashboard/cities'),
    refetchInterval: 60_000,
  });

  const refreshAll = (): void => {
    void kpis.refetch();
    void revenueTrend.refetch();
    void bookingVolume.refetch();
    void funnel.refetch();
    void alerts.refetch();
    void dsrAlerts.refetch();
    void cities.refetch();
  };

  if (kpis.isLoading) {
    return <LoadingState label="Loading dashboard..." />;
  }
  if (kpis.isError || !kpis.data) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        description="Could not reach the analytics service."
        action={
          <Button variant="outline" size="sm" onClick={() => void kpis.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const k = kpis.data;
  const refreshedAt = new Date().toLocaleTimeString('en-PH');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Platform overview · Auto-refresh 60s · Last: {refreshedAt}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white"
            aria-label="Date range"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Revenue"
          value={formatCurrency(k.revenue)}
          icon={<Coins size={20} className="text-emerald-600" />}
          trendPct={k.revenueTrendPct}
        />
        <KpiCard
          title="Active Bookings"
          value={k.activeBookings}
          icon={<ClipboardList size={20} className="text-blue-600" />}
        />
        <KpiCard
          title="Pending Disputes"
          value={k.pendingDisputes}
          icon={<AlertTriangle size={20} className={k.pendingDisputes > 0 ? 'text-red-600' : 'text-slate-400'} />}
        />
        <KpiCard
          title="New Signups"
          value={k.newSignups}
          icon={<UserPlus size={20} className="text-blue-600" />}
        />
        <KpiCard
          title="Provider Approvals"
          value={k.pendingApprovals}
          icon={<Wrench size={20} className="text-blue-600" />}
        />
        <KpiCard
          title="Today's Bookings"
          value={k.todayBookings}
          icon={<Calendar size={20} className="text-blue-600" />}
        />
        <KpiCard
          title="Escalated Disputes"
          value={k.escalatedDisputes}
          icon={<AlertCircle size={20} className={k.escalatedDisputes > 0 ? 'text-red-600' : 'text-slate-400'} />}
        />
        <KpiCard
          title="Stale (48h+)"
          value={k.staleDisputes}
          icon={<Clock size={20} className={k.staleDisputes > 0 ? 'text-amber-600' : 'text-slate-400'} />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {/* BUG-PHASE38-01 fix — pre-fix this rendered an empty
                240px rectangle when the API returned no data points
                (fresh launch, low traffic, mocked dev env). Looked
                like the chart was broken. Post-fix: explicit empty
                state with friendly text. */}
            {(revenueTrend.data ?? []).length === 0 ? (
              <div className="h-[240px] flex flex-col items-center justify-center text-center">
                <BarChart3 size={28} className="text-slate-400 mb-2" />
                <p className="text-sm text-[var(--color-text-secondary)]">No revenue data yet</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">Data will appear once bookings start completing.</p>
              </div>
            ) : (
              <ChartContainer height={240}>
                <LineChart data={revenueTrend.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).getDate().toString()} />
                  <YAxis tickFormatter={(v: number) => `₱${(v / 100000).toFixed(0)}K`} />
                  <ChartTooltip formatter={(v) => formatCurrency(Number(v))} />
                  <ChartLegend />
                  <Line type="monotone" dataKey="gmv" name="GMV" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="revenue" name="Platform Revenue" stroke={CHART_COLORS.success} strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking Volume (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            {/* BUG-PHASE38-01 fix — same empty-state guard as Revenue Trend. */}
            {(bookingVolume.data ?? []).length === 0 ? (
              <div className="h-[240px] flex flex-col items-center justify-center text-center">
                <ClipboardList size={28} className="text-slate-400 mb-2" />
                <p className="text-sm text-[var(--color-text-secondary)]">No bookings yet</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">Volume by category will appear here.</p>
              </div>
            ) : (
              <ChartContainer height={240}>
                <BarChart data={bookingVolume.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="category" />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Bar dataKey="count" fill={CHART_COLORS.secondary} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acquisition Funnel (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {funnel.data ? (
              <div className="space-y-3 py-4">
                <FunnelStep label="Registered" value={funnel.data.registered} percent={100} />
                <FunnelStep
                  label="First Booking"
                  value={funnel.data.firstBooking}
                  percent={funnel.data.registered > 0 ? (funnel.data.firstBooking / funnel.data.registered) * 100 : 0}
                />
                <FunnelStep
                  label="Repeat Booking"
                  value={funnel.data.repeatBooking}
                  percent={funnel.data.registered > 0 ? (funnel.data.repeatBooking / funnel.data.registered) * 100 : 0}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">Loading funnel...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Operational Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {mergedAlerts.length === 0 ? (
              <EmptyState
                title="No alerts"
                description="All systems healthy. Nothing requires intervention right now."
                icon={<AlertCircle size={28} className="text-slate-400" />}
              />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {mergedAlerts.map((alert) => (
                  <li key={alert.id} className="py-3 flex items-start gap-3">
                    <AlertCircle
                      className={
                        alert.severity === 'danger' ? 'text-red-600' :
                        alert.severity === 'warning' ? 'text-amber-600' :
                        'text-blue-600'
                      }
                      size={18}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)]">{alert.title}</p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{alert.description}</p>
                    </div>
                    {alert.action_url && (
                      <Link to={alert.action_url}>
                        <Button variant="ghost" size="sm">
                          View <ChevronRight size={14} />
                        </Button>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/providers?status=pending" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span>Approve Pending Providers ({k.pendingApprovals})</span>
                <ChevronRight size={14} />
              </Button>
            </Link>
            <Link to="/disputes?status=open" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span>Review Disputes ({k.pendingDisputes})</span>
                <ChevronRight size={14} />
              </Button>
            </Link>
            <Link to="/financials" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span>Review Financial Reports</span>
                <ChevronRight size={14} />
              </Button>
            </Link>
            <Link to="/audit-log" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span>View Audit Log</span>
                <ChevronRight size={14} />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Wallets Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <WalletCard
          title="Platform Escrow"
          amount={k.escrowBalance}
          description="Held in escrow"
        />
        <WalletCard
          title="Platform Revenue"
          amount={k.platformRevenue}
          description="Commission + fees"
          valueColor="text-emerald-600"
        />
        {/* BUG-PHASE38-02 fix — pre-fix this triggered the
            "Replenishment recommended" warning even when the fund was
            simply unconfigured (amount=0, runway=0). The warning made
            sense for an UNDER-funded production deployment but was
            noise on a fresh install. Now: warning only fires when the
            fund is non-zero AND runway < 3 months. */}
        <WalletCard
          title="Guarantee Fund"
          amount={k.guaranteeFund}
          description={
            k.guaranteeFund > 0
              ? `${k.guaranteeFundRunwayMonths} months runway`
              : 'Not yet funded'
          }
          warning={k.guaranteeFund > 0 && k.guaranteeFundRunwayMonths < 3}
        />
      </div>

      {/* Cities Row */}
      <Card>
        <CardHeader>
          <CardTitle>Cities</CardTitle>
        </CardHeader>
        <CardContent>
          {(cities.data ?? []).length === 0 ? (
            <EmptyState
              title="No service areas"
              description="No service areas have been configured yet."
              icon={<MapPin size={28} className="text-slate-400" />}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(cities.data ?? []).map((city) => (
                <Link key={city.id} to="/service-areas" className="block">
                  <Card className="hover:border-[var(--color-secondary)] transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-[var(--color-text)]">{city.name}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] capitalize">{city.status.replace(/_/g, ' ')}</p>
                        </div>
                        <MapPin size={16} className="text-slate-400" />
                      </div>
                      <div className="mt-3 flex justify-between text-sm text-[var(--color-text)]">
                        <span><strong>{city.activeProviders}</strong> providers</span>
                        <span><strong>{city.todayBookings}</strong> today</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelStep({ label, value, percent }: { label: string; value: number; percent: number }): React.ReactElement {
  const safePct = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex justify-between text-sm mb-1 text-[var(--color-text)]">
        <span>{label}</span>
        <span><strong>{value}</strong> ({safePct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-secondary)] transition-all" style={{ width: `${safePct}%` }} />
      </div>
    </div>
  );
}

interface WalletCardProps {
  title: string;
  amount: number;
  description: string;
  valueColor?: string;
  warning?: boolean;
}

function WalletCard({ title, amount, description, valueColor = 'text-[var(--color-text)]', warning = false }: WalletCardProps): React.ReactElement {
  return (
    <Card className={warning ? 'border-amber-400' : ''}>
      <CardContent className="p-5">
        <p className="text-sm text-[var(--color-text-secondary)]">{title}</p>
        <p className={`text-3xl font-bold mt-2 ${valueColor}`}>{formatCurrency(amount)}</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">{description}</p>
        {warning && (
          <p className="text-xs text-amber-600 mt-1">Replenishment recommended</p>
        )}
      </CardContent>
    </Card>
  );
}
