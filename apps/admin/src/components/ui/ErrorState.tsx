import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className = '',
}: ErrorStateProps): React.ReactElement {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-10 text-center ${className}`}
    >
      <AlertTriangle className="h-8 w-8 text-red-600" aria-hidden="true" />
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-red-700">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
