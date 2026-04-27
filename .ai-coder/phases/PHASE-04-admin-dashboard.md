# PHASE 04 — ADMIN DASHBOARD

**Goal:** Rebuild the admin dashboard from a 107-line emoji-card grid into a real operational command center with charts, alert feed, quick actions, per-city tiles, and real-time refresh.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/04-admin-dashboard`
**Estimated time:** 6 hours
**Dependencies:** Phase 03 complete and merged
**Risk:** Low — replaces one page, doesn't touch business logic

---

## Step 1 — Pre-flight

```bash
git checkout main && git pull
git checkout -b phase/04-admin-dashboard
bash .ai-coder/checkpoints/verify-phase.sh PHASE-04-preflight
```

## Step 2 — Backend: extend dashboard endpoint

The current endpoint `/api/v1/admin/dashboard` returns the basic KPIs. Extend it to return everything the new dashboard needs.

Edit `packages/api/src/services/admin-analytics.service.ts`. Add these functions:

```ts
export async function getDashboardKpis(dateRange: 'today'|'7d'|'30d'|'90d'|'ytd'): Promise<DashboardKpis>
export async function getRevenueTrend(days: number): Promise<Array<{date: string; gmv: number; revenue: number}>>
export async function getBookingVolumeByCategory(days: number): Promise<Array<{category: string; count: number}>>
export async function getCustomerAcquisitionFunnel(days: number): Promise<{registered: number; firstBooking: number; repeatBooking: number}>
export async function getOperationalAlerts(): Promise<Alert[]>
export async function getCitiesPerformance(): Promise<CityPerformance[]>
```

Each function returns shape that matches the chart's expected props.

`getOperationalAlerts()` returns alerts of these types:
- Provider with 3+ consecutive 1-star ratings
- Dispute open >48 hours
- PayMongo webhook failures in last hour
- Provider NBI expiring within 7 days
- Customer with 5+ disputes in 7 days
- City with <5 active providers
- Guarantee fund balance below 30% of monthly claims

Each alert has: id, type, severity (info|warning|danger), title, description, action_url, created_at.

Add corresponding routes to `admin.routes.ts`:
- `GET /api/v1/admin/dashboard/kpis?range=today`
- `GET /api/v1/admin/dashboard/revenue-trend?days=30`
- `GET /api/v1/admin/dashboard/booking-volume?days=7`
- `GET /api/v1/admin/dashboard/acquisition-funnel?days=30`
- `GET /api/v1/admin/dashboard/alerts`
- `GET /api/v1/admin/dashboard/cities`

All require admin auth.

## Step 3 — Build the new DashboardPage

Replace `apps/admin/src/pages/DashboardPage.tsx` (currently 107 lines) with a real dashboard.

**Layout:**

```
┌───────────────────────────────────────────────────────────────────────┐
│ Dashboard                                  [Range: ▾]  [↻ Refresh]     │
│ Platform overview · Auto-refresh 60s · Last: 2:34 PM                  │
├───────────────────────────────────────────────────────────────────────┤
│ KPI ROW (8 cards in 4-col grid, lucide icons)                         │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                          │
│ │₱42,580 │ │127     │ │3       │ │24      │                          │
│ │Revenue │ │Active  │ │Disputes│ │Signups │                          │
│ │↑12%    │ │bookings│ │badge!  │ │today   │                          │
│ └────────┘ └────────┘ └────────┘ └────────┘                          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                          │
│ │5       │ │342     │ │1       │ │2       │                          │
│ │Pending │ │Today's │ │Escala- │ │Stale   │                          │
│ │approvls│ │bookings│ │ted     │ │48h+    │                          │
│ └────────┘ └────────┘ └────────┘ └────────┘                          │
├───────────────────────────────────────────────────────────────────────┤
│ CHART ROW (3 charts side by side, recharts)                          │
│ ┌─────────────────┐ ┌────────────────┐ ┌────────────────────┐        │
│ │ Revenue Trend   │ │ Booking Volume │ │ Acquisition Funnel │        │
│ │ (line, 30d)     │ │ (bar, 7d, by   │ │ (funnel)           │        │
│ │ GMV vs Revenue  │ │  category)     │ │                    │        │
│ └─────────────────┘ └────────────────┘ └────────────────────┘        │
├───────────────────────────────────────────────────────────────────────┤
│ ALERT FEED (left 2/3)              │ QUICK ACTIONS (right 1/3)        │
│ • Provider X 3 1-stars (action)    │ ▢ Approve Pending (5)            │
│ • Dispute #123 open 48h            │ ▢ Review Disputes (3)            │
│ • Webhook failure detected         │ ▢ Generate Daily Report          │
│ • NBI expiring for X (7d)          │ ▢ View Audit Log                 │
│ • [more...]                        │                                  │
├───────────────────────────────────────────────────────────────────────┤
│ WALLETS ROW (3 cards)                                                 │
│ Platform Escrow │ Platform Revenue │ Guarantee Fund                   │
│ ₱825,400        │ ₱41,200          │ ₱158,600 (4.2 mo runway)         │
├───────────────────────────────────────────────────────────────────────┤
│ CITIES ROW (one tile per active service_area)                        │
│ Boracay │ Kalibo (planned) │ Iloilo (planned) │                              │
│ Active  │ Active │ Recruiting         │                              │
│ 12 prov │ 47 prov│ 0 prov             │                              │
│ 8 today │ 23 tdy │ 0 today            │                              │
└───────────────────────────────────────────────────────────────────────┘
```

**Implementation contract:**

```tsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Coins, ClipboardList, AlertTriangle, UserPlus, Wrench, Calendar,
  AlertCircle, Clock, TrendingUp, Users, MapPin, RefreshCw, ChevronRight,
} from '@/components/icons';
import { KpiCard } from '@/components/ui/KpiCard';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Link } from 'react-router-dom';

type DateRange = 'today' | '7d' | '30d' | '90d' | 'ytd';

export default function DashboardPage(): React.ReactElement {
  const [range, setRange] = useState<DateRange>('today');

  const kpis = useQuery({
    queryKey: ['dashboard-kpis', range],
    queryFn: async () => (await api.get(`/api/v1/admin/dashboard/kpis?range=${range}`)).data.data,
    refetchInterval: 60_000,
  });

  const revenueTrend = useQuery({
    queryKey: ['dashboard-revenue-trend'],
    queryFn: async () => (await api.get('/api/v1/admin/dashboard/revenue-trend?days=30')).data.data,
    refetchInterval: 60_000,
  });

  const bookingVolume = useQuery({
    queryKey: ['dashboard-booking-volume'],
    queryFn: async () => (await api.get('/api/v1/admin/dashboard/booking-volume?days=7')).data.data,
    refetchInterval: 60_000,
  });

  const funnel = useQuery({
    queryKey: ['dashboard-funnel'],
    queryFn: async () => (await api.get('/api/v1/admin/dashboard/acquisition-funnel?days=30')).data.data,
    refetchInterval: 300_000,
  });

  const alerts = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: async () => (await api.get('/api/v1/admin/dashboard/alerts')).data.data,
    refetchInterval: 30_000,
  });

  const cities = useQuery({
    queryKey: ['dashboard-cities'],
    queryFn: async () => (await api.get('/api/v1/admin/dashboard/cities')).data.data,
    refetchInterval: 60_000,
  });

  // Loading and error states use the standard LoadingState / ErrorState components.
  // Return early with appropriate component if any critical query is in error.

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Platform overview · Auto-refresh 60s · Last: {new Date().toLocaleTimeString('en-PH')}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { kpis.refetch(); revenueTrend.refetch(); bookingVolume.refetch(); }}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Revenue" value={formatCurrency(kpis.data?.revenue ?? 0)}
                 icon={<Coins className="text-green-600" size={20} />}
                 trend={kpis.data?.revenueTrend} />
        <KpiCard title="Active Bookings" value={kpis.data?.activeBookings ?? 0}
                 icon={<ClipboardList className="text-blue-600" size={20} />} />
        <KpiCard title="Pending Disputes" value={kpis.data?.pendingDisputes ?? 0}
                 icon={<AlertTriangle className={(kpis.data?.pendingDisputes ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'} size={20} />} />
        <KpiCard title="New Signups" value={kpis.data?.newSignups ?? 0}
                 icon={<UserPlus className="text-blue-600" size={20} />} />
        <KpiCard title="Provider Approvals" value={kpis.data?.pendingApprovals ?? 0}
                 icon={<Wrench className="text-blue-600" size={20} />} />
        <KpiCard title="Today's Bookings" value={kpis.data?.todayBookings ?? 0}
                 icon={<Calendar className="text-blue-600" size={20} />} />
        <KpiCard title="Escalated Disputes" value={kpis.data?.escalatedDisputes ?? 0}
                 icon={<AlertCircle className={(kpis.data?.escalatedDisputes ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'} size={20} />} />
        <KpiCard title="Stale (48h+)" value={kpis.data?.staleDisputes ?? 0}
                 icon={<Clock className={(kpis.data?.staleDisputes ?? 0) > 0 ? 'text-amber-600' : 'text-gray-400'} size={20} />} />
      </div>

      {/* Chart Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Revenue Trend (30d)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={revenueTrend.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" tickFormatter={(d) => new Date(d).getDate().toString()} />
                <YAxis tickFormatter={(v) => `₱${(v / 100000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="gmv" name="GMV" stroke="#0F62FE" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="revenue" name="Platform Revenue" stroke="#24A148" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Booking Volume (7d)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={bookingVolume.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0F62FE" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Acquisition Funnel (30d)</CardTitle></CardHeader>
          <CardContent>
            {funnel.data && (
              <div className="space-y-3 py-4">
                <FunnelStep label="Registered" value={funnel.data.registered} percent={100} />
                <FunnelStep label="First Booking" value={funnel.data.firstBooking}
                            percent={(funnel.data.firstBooking / funnel.data.registered) * 100} />
                <FunnelStep label="Repeat Booking" value={funnel.data.repeatBooking}
                            percent={(funnel.data.repeatBooking / funnel.data.registered) * 100} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alert Feed + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Operational Alerts</CardTitle></CardHeader>
          <CardContent>
            {(alerts.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No alerts. All systems healthy.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {(alerts.data ?? []).map((alert: any) => (
                  <li key={alert.id} className="py-3 flex items-start gap-3">
                    <AlertCircle className={
                      alert.severity === 'danger' ? 'text-red-600' :
                      alert.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'
                    } size={18} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-xs text-gray-500">{alert.description}</p>
                    </div>
                    {alert.action_url && (
                      <Link to={alert.action_url}>
                        <Button variant="ghost" size="sm">View <ChevronRight size={14} /></Button>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Link to="/providers?status=pending">
              <Button variant="outline" className="w-full justify-between">
                Approve Pending Providers ({kpis.data?.pendingApprovals ?? 0})
                <ChevronRight size={14} />
              </Button>
            </Link>
            <Link to="/disputes?status=open">
              <Button variant="outline" className="w-full justify-between">
                Review Disputes ({kpis.data?.pendingDisputes ?? 0})
                <ChevronRight size={14} />
              </Button>
            </Link>
            <Link to="/financials/reports">
              <Button variant="outline" className="w-full justify-between">
                Generate Daily Report
                <ChevronRight size={14} />
              </Button>
            </Link>
            <Link to="/audit-log">
              <Button variant="outline" className="w-full justify-between">
                View Audit Log
                <ChevronRight size={14} />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Wallets Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <WalletCard title="Platform Escrow" amount={kpis.data?.escrowBalance ?? 0}
                    description="Held in escrow" />
        <WalletCard title="Platform Revenue" amount={kpis.data?.platformRevenue ?? 0}
                    description="Commission + fees" valueColor="text-emerald-600" />
        <WalletCard title="Guarantee Fund" amount={kpis.data?.guaranteeFund ?? 0}
                    description={`${kpis.data?.guaranteeFundRunwayMonths ?? 0} months runway`}
                    warning={(kpis.data?.guaranteeFundRunwayMonths ?? 0) < 3} />
      </div>

      {/* Cities Row */}
      <Card>
        <CardHeader><CardTitle>Cities</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(cities.data ?? []).map((city: any) => (
              <Link key={city.id} to={`/service-areas/${city.id}`}>
                <Card className="hover:border-blue-400 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{city.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{city.status}</p>
                      </div>
                      <MapPin size={16} className="text-gray-400" />
                    </div>
                    <div className="mt-3 flex justify-between text-sm">
                      <span><strong>{city.activeProviders}</strong> providers</span>
                      <span><strong>{city.todayBookings}</strong> today</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelStep({ label, value, percent }: { label: string; value: number; percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span><strong>{value}</strong> ({percent.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function WalletCard({ title, amount, description, valueColor = 'text-gray-900', warning = false }: any) {
  return (
    <Card className={warning ? 'border-amber-400' : ''}>
      <CardContent className="p-5">
        <p className="text-sm text-gray-500">{title}</p>
        <p className={`text-3xl font-bold mt-2 ${valueColor}`}>{formatCurrency(amount)}</p>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
        {warning && <p className="text-xs text-amber-600 mt-1">⚠ Replenishment recommended</p>}
      </CardContent>
    </Card>
  );
}
```

(The `⚠` above is a content character in a warning string, NOT an icon — it's allowed per the constitution Article 4.6.)

## Step 4 — Verify

```bash
bash .ai-coder/checkpoints/verify-phase.sh PHASE-04
```

Visual check:
- Dashboard loads without errors
- All 8 KPI cards show real data (not zeros if there's data)
- All 3 charts render with data
- Alert feed shows real alerts (or empty state)
- Quick action buttons link to correct pages
- 3 wallet cards show real money
- Cities tiles show one per active service_area

## Step 5 — Commit and report

Standard format. STOP.
