interface KpiCardProps {
  title: string;
  value: string | number;
  icon: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}

export default function KpiCard({ title, value, icon, change, changeType = 'neutral' }: KpiCardProps) {
  const changeColor =
    changeType === 'positive' ? 'text-emerald-600' :
    changeType === 'negative' ? 'text-red-600' :
    'text-slate-500';

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {change && (
          <span className={`text-xs font-medium ${changeColor}`}>{change}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-[var(--color-text)] tracking-tight">{value}</p>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1">{title}</p>
    </div>
  );
}
