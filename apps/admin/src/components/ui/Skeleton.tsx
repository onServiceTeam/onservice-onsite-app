import * as React from 'react';

export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 ${className}`}
      aria-busy="true"
      aria-live="polite"
      {...props}
    />
  );
}
