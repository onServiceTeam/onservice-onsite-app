import React, { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading,
  isError,
  errorMessage = 'Failed to load data. Please try again.',
  emptyMessage = 'No results found.',
  onRowClick,
}: DataTableProps<T>): React.ReactElement {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-[var(--color-border)] bg-white p-12 text-center"
      >
        <div
          className="mx-auto h-6 w-6 animate-spin rounded-full border-3 border-[var(--color-secondary)] border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--color-text-secondary)] mt-3">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-slate-50/70">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3 ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Phase L MED-L04 fix — guard against undefined `data` so
                 a partial/loading parent doesn't throw on .length. */}
            {isError ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-sm text-[var(--color-error)]">
                  <span role="alert">{errorMessage}</span>
                </td>
              </tr>
            ) : (data ?? []).length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-sm text-[var(--color-text-secondary)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              (data ?? []).map((row) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-[var(--color-border)] last:border-0 ${
                    onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-sm ${col.className ?? ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
