import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { KpiCard } from '@/components/ui';
import {
  AlertTriangle,
  Coins,
  ClipboardList,
  UserPlus,
  Wrench,
  Calendar,
  AlertCircle,
  Clock,
} from '@/components/icons';

interface DashboardKpis {
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

export default function DashboardPage(): React.ReactElement {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DashboardKpis }>('/api/v1/admin/dashboard');
      return res.data.data;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-secondary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-20">
        <AlertTriangle size={40} className="mx-auto mb-3 text-amber-500" />
        <p className="text-[var(--color-text-secondary)] mb-3">Failed to load dashboard data.</p>
        <button
          onClick={() => void refetch()}
          className="text-sm text-[var(--color-secondary)] font-medium hover:underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Dashboard</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Platform overview and key metrics</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Today's Revenue" value={formatCurrency(data.todayRevenue)} icon={<Coins size={20} className="text-emerald-600" />} />
        <KpiCard title="Active Bookings" value={data.activeBookings} icon={<ClipboardList size={20} className="text-blue-600" />} />
        <KpiCard title="Pending Disputes" value={data.pendingDisputes} icon={<AlertTriangle size={20} className={data.pendingDisputes > 0 ? 'text-red-600' : 'text-slate-400'} />} />
        <KpiCard title="New Signups Today" value={data.newSignupsToday} icon={<UserPlus size={20} className="text-blue-600" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Provider Approvals Queue" value={data.pendingProviderApprovals} icon={<Wrench size={20} className="text-blue-600" />} />
        <KpiCard title="Today's Bookings" value={data.todayBookings} icon={<Calendar size={20} className="text-blue-600" />} />
        <KpiCard title="Escalated Disputes" value={data.alerts.escalatedDisputes} icon={<AlertCircle size={20} className={data.alerts.escalatedDisputes > 0 ? 'text-red-600' : 'text-slate-400'} />} />
        <KpiCard title="Stale Disputes (48h+)" value={data.alerts.staleDisputes} icon={<Clock size={20} className={data.alerts.staleDisputes > 0 ? 'text-amber-600' : 'text-slate-400'} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Platform Escrow</h2>
          <p className="text-3xl font-bold text-[var(--color-text)]">
            {formatCurrency(data.platformWallets.escrow)}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">Held in escrow</p>
        </div>

        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Platform Revenue</h2>
          <p className="text-3xl font-bold text-emerald-600">
            {formatCurrency(data.platformWallets.revenue)}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">Commission + fees</p>
        </div>

        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Guarantee Fund</h2>
          <p className="text-3xl font-bold text-[var(--color-text)]">
            {formatCurrency(data.platformWallets.guaranteeFund)}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">Service guarantee balance</p>
        </div>
      </div>
    </div>
  );
}

