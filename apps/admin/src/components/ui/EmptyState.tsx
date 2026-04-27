import * as React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center ${className}`}
    >
      {icon ? <div className="text-slate-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
