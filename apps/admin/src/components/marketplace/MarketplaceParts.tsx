/**
 * D38 Milestone 3: small pieces shared by the Marketplace tabs: the Manila
 * date range fields, a tab-level error with retry, and the pager.
 */
import React from 'react';
import { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { ChevronLeft, ChevronRight, RefreshCw } from '@/components/icons';

export interface DateRangeValue {
  from: string;
  to: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Only complete dates go to the server; an empty field means "use the default". */
export function rangeParams(range: DateRangeValue): { from?: string; to?: string } {
  return {
    from: DATE_PATTERN.test(range.from) ? range.from : undefined,
    to: DATE_PATTERN.test(range.to) ? range.to : undefined,
  };
}

function formatDay(day: string): string {
  if (!DATE_PATTERN.test(day)) return day;
  const parsed = new Date(`${day}T12:00:00+08:00`);
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
}

export function DateRangeFields({
  value,
  onChange,
  resolved,
  idPrefix,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** The range the server actually used (meta.from / meta.to). */
  resolved: { from: string | null; to: string | null } | null;
  idPrefix: string;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={`${idPrefix}-from`}>
        From (Manila date)
        <input
          id={`${idPrefix}-from`}
          type="date"
          value={value.from}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor={`${idPrefix}-to`}>
        To (Manila date)
        <input
          id={`${idPrefix}-to`}
          type="date"
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
          className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
        />
      </label>
      {value.from || value.to ? (
        <Button variant="ghost" size="sm" onClick={() => onChange({ from: '', to: '' })}>
          Last 30 days
        </Button>
      ) : null}
      {resolved?.from && resolved.to ? (
        <p className="pb-3 text-xs text-[var(--color-text-tertiary)]">
          Showing {formatDay(resolved.from)} to {formatDay(resolved.to)}
        </p>
      ) : null}
    </div>
  );
}

export function TabError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <ErrorState
      title={title}
      description={getErrorMessage(error)}
      action={(
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </Button>
      )}
    />
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
}): React.ReactElement | null {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page <= 1) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 pt-3 text-sm">
      <span className="text-[var(--color-text-secondary)]">
        Page {page} of {pages} ({total} total)
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} /> Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  );
}
