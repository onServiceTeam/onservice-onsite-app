import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { KpiCard, Badge } from '@/components/ui';

interface RevenueRow {
  date: string;
  totalCommission: number;
  totalServiceFees: number;
  totalRefunds: number;
  bookingCount: number;
}

interface KpiData {
  todayRevenue: number;
  activeBookings: number;
  pendingDisputes: number;
  newSignupsToday: number;
  pendingProviderApprovals: number;
  todayBookings: number;
  platformWallets: {
    escrow: number;
    revenue: number;
    guaranteeFund: number;
  };
  alerts: {
    escalatedDisputes: number;
    staleDisputes: number;
  };
}

function formatCurrency(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function RevenueChart({ data, period }: { data: RevenueRow[]; period: string }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-text-secondary)]">
        No revenue data for this period.
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map(r => r.totalCommission + r.totalServiceFees), 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 min-w-[500px] h-48 px-2">
        {data.map((row) => {
          const commission = row.totalCommission;
          const fees = row.totalServiceFees;
          const label = period === 'daily'
            ? new Date(row.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
            : period === 'weekly'
            ? `W${new Date(row.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
            : new Date(row.date).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });

          return (
            <div key={row.date} className="flex flex-col items-center flex-1 min-w-[32px]">
              <div className="relative w-full flex flex-col justify-end" style={{ height: '160px' }}>
                <div
                  className="w-full bg-emerald-500 rounded-t-sm transition-all hover:bg-emerald-400"
                  style={{ height: `${(commission / maxRevenue) * 160}px` }}
                  title={`Commission: ${formatCurrency(commission)}`}
                />
                <div
                  className="w-full bg-sky-500 rounded-t-sm transition-all hover:bg-sky-400"
                  style={{ height: `${(fees / maxRevenue) * 160}px` }}
                  title={`Service Fees: ${formatCurrency(fees)}`}
                />
              </div>
              <span className="text-[9px] text-[var(--color-text-secondary)] mt-1 whitespace-nowrap">
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 justify-center text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded-sm" /> Commission</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-sky-500 rounded-sm" /> Service Fees</span>
      </div>
    </div>
  );
}

export default function FinancialsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [days, setDays] = useState(30);

  const { data: kpis } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: KpiData }>('/api/v1/admin/dashboard');
      return res.data.data;
    },
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['adminRevenue', period, days],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RevenueRow[] }>(
        '/api/v1/admin/financials/revenue',
        { params: { period, days } },
      );
      return res.data.data;
    },
  });

  const totalRevenue = (revenueData ?? []).reduce((s, r) => s + r.totalCommission + r.totalServiceFees, 0);
  const totalRefunds = (revenueData ?? []).reduce((s, r) => s + r.totalRefunds, 0);
  const totalBookings = (revenueData ?? []).reduce((s, r) => s + r.bookingCount, 0);
  const netRevenue = totalRevenue - totalRefunds;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Financial Dashboard</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Revenue, platform balances, and financial reports
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Platform Revenue"
          value={formatCurrency(kpis?.platformWallets?.revenue ?? 0)}
          icon="💰"
        />
        <KpiCard
          title="Escrow Held"
          value={formatCurrency(kpis?.platformWallets?.escrow ?? 0)}
          icon="🔒"
        />
        <KpiCard
          title="Guarantee Fund"
          value={formatCurrency(kpis?.platformWallets?.guaranteeFund ?? 0)}
          icon="🛡️"
        />
        <KpiCard
          title="Today's Revenue"
          value={formatCurrency(kpis?.todayRevenue ?? 0)}
          icon="📈"
        />
      </div>

      <div className="bg-white border border-[var(--color-border)] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Revenue Report</h2>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}
              className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last year</option>
            </select>
          </div>
        </div>

        {revenueLoading ? (
          <div className="text-center py-12 text-[var(--color-text-secondary)]">Loading...</div>
        ) : (
          <RevenueChart data={revenueData ?? []} period={period} />
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[var(--color-border)]">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Gross Revenue</p>
            <p className="text-lg font-bold text-[var(--color-text)]">{formatCurrency(totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Refunds</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totalRefunds)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Net Revenue</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(netRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Bookings</p>
            <p className="text-lg font-bold text-[var(--color-text)]">{totalBookings}</p>
          </div>
        </div>
      </div>

      {(revenueData ?? []).length > 0 && (
        <div className="bg-white border border-[var(--color-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Revenue Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-3 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Commission</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Service Fees</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Refunds</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Net</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {revenueData?.map((row) => {
                  const net = row.totalCommission + row.totalServiceFees - row.totalRefunds;
                  return (
                    <tr key={row.date} className="border-b border-[var(--color-border)] hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-[var(--color-text)]">
                        {new Date(row.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">{formatCurrency(row.totalCommission)}</td>
                      <td className="py-2.5 px-3 text-right text-sky-600 font-medium">{formatCurrency(row.totalServiceFees)}</td>
                      <td className="py-2.5 px-3 text-right text-red-600">{row.totalRefunds > 0 ? `-${formatCurrency(row.totalRefunds)}` : '—'}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[var(--color-text)]">{formatCurrency(net)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge label={String(row.bookingCount)} variant="info" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
