import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  /**
   * Optional numeric trend percentage (e.g. 12 for +12%, -3 for -3%).
   * When provided, renders a colored badge in the top-right of the card.
   */
  trendPct?: number;
}

export default function KpiCard({ title, value, icon, change, changeType = 'neutral', trendPct }: KpiCardProps): React.ReactElement {
  const changeColor =
    changeType === 'positive' ? 'text-emerald-600' :
    changeType === 'negative' ? 'text-red-600' :
    'text-slate-500';

  const trendLabel = typeof trendPct === 'number'
    ? `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(1)}%`
    : null;
  const trendColor = typeof trendPct === 'number'
    ? (trendPct > 0 ? 'text-emerald-600' : trendPct < 0 ? 'text-red-600' : 'text-slate-500')
    : 'text-slate-500';

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#E6EEF1] text-[var(--color-primary)]">{icon}</span>
        {change && (
          <span className={`text-xs font-medium ${changeColor}`}>{change}</span>
        )}
        {!change && trendLabel && (
          <span className={`text-xs font-medium ${trendColor}`}>{trendLabel}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-[var(--color-text)] tracking-tight">{value}</p>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1">{title}</p>
    </div>
  );
}
