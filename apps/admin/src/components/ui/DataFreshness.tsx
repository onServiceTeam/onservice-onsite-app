import React, { useEffect, useState } from 'react';
import { RefreshCw } from '@/components/icons';
import { Button } from './Button';

export interface DataFreshnessProps {
  label: string;
  timestamp?: number;
  isFetching?: boolean;
  onRefresh?: () => void;
}

function formatAge(timestamp: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 5) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export default function DataFreshness({
  label,
  timestamp,
  isFetching = false,
  onRefresh,
}: DataFreshnessProps): React.ReactElement {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const freshness = timestamp && timestamp > 0
    ? `Last successful update ${formatAge(timestamp, now)}`
    : 'No successful update yet';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--color-text-secondary)]">
      <span role="status" aria-live="polite">
        {label}: {freshness}.
      </span>
      {onRefresh && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label={`Refresh ${label}`}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      )}
    </div>
  );
}
