import * as React from 'react';

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({
  label = 'Loading…',
  className = '',
}: LoadingStateProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center gap-3 p-10 text-slate-500 ${className}`}
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
        aria-hidden="true"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
