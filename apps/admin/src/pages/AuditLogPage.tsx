import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { adminConfig } from '@/config/admin.config';
import { ClipboardList } from '@/components/icons';

interface AuditEntry {
  id: string;
  /**
   * Backend now UNIONs audit_log + admin_actions. `source` discriminates
   * the two streams so the UI can label them. Older API responses don't
   * include this field; the UI defaults to 'audit_log'.
   */
  source?: 'audit_log' | 'admin_actions';
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** admin_actions rows carry a reason text; audit_log rows return null. */
  reason?: string | null;
  createdAt: string;
}

const SOURCE_BADGE: Record<NonNullable<AuditEntry['source']>, { label: string; cls: string }> = {
  audit_log:    { label: 'request',  cls: 'bg-slate-100 text-slate-700' },
  admin_actions:{ label: 'admin op', cls: 'bg-amber-100 text-amber-800' },
};

// Friendly labels for the new admin_actions verbs that have landed since
// Phase 14. Anything not listed falls back to the raw action string.
const ACTION_LABELS: Record<string, string> = {
  staff_added: 'Staff member added',
  staff_removed: 'Staff member removed',
  staff_role_changed: 'Staff role changed',
  staff_role_promoted_dpo: 'Promoted to DPO',
  staff_role_demoted_from_dpo: 'Demoted from DPO',
  config_changed: 'Configuration changed',
  service_area_created: 'Service area created',
  service_area_updated: 'Service area updated',
  service_area_deleted: 'Service area deleted',
  promotion_created: 'Promotion created',
  promotion_updated: 'Promotion updated',
  promotion_deleted: 'Promotion deleted',
  notification_template_updated: 'Notification template updated',
  notification_template_deleted: 'Notification template deleted',
  consent_version_published: 'Consent version published',
  customer_flagged_fraud: 'Customer flagged for fraud',
  legacy_password_rotation_flagged: 'Bulk password rotation flagged',
  admin_password_rotated: 'Admin password rotated',
  dsr_status_changed: 'DSR status changed',
  dsr_more_info_requested: 'DSR — more info requested',
  dsr_rejected: 'DSR rejected',
  dsr_escalated_to_npc: 'DSR escalated to NPC',
  dsr_assigned: 'DSR assigned',
  admin_message_sent: 'Booking support message sent',
};

interface AuditResponse {
  data: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  });
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  super_admin: 'bg-red-100 text-red-700',
  customer: 'bg-blue-100 text-blue-700',
  provider: 'bg-green-100 text-green-700',
};

type SourceFilter = 'all' | 'audit_log' | 'admin_actions';

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseSource(value: string | null): SourceFilter {
  return value === 'audit_log' || value === 'admin_actions' ? value : 'all';
}

export default function AuditLogPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const actionFilter = searchParams.get('action')?.trim() ?? '';
  const entityTypeFilter = searchParams.get('entityType')?.trim() ?? '';
  // 'all' | 'audit_log' | 'admin_actions' — narrows the unioned response.
  const sourceFilter = parseSource(searchParams.get('source'));
  // BUG-PHASE42-02 fix — pre-fix there was no way to bound an audit
  // query by date. Compliance audits ("show me all entries from
  // 2026-04-01 to 2026-04-30") had to be done by paginating to the
  // right time slice manually. The API supports `from` and `to`
  // params; the UI now exposes them.
  const fromDate = searchParams.get('from') ?? '';
  const toDate = searchParams.get('to') ?? '';
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const pageSize = adminConfig.defaultPageSize;
  const dateError = fromDate && toDate && fromDate > toDate ? 'From date must be before or equal to To date.' : '';

  function updateFilter(key: string, value: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      const trimmed = value.trim();
      if (trimmed) params.set(key, trimmed);
      else params.delete(key);
      return params;
    });
    setSelectedEntry(null);
  }

  function setSourceFilter(value: SourceFilter): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (value === 'all') params.delete('source');
      else params.set('source', value);
      return params;
    });
    setSelectedEntry(null);
  }

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
  }

  function clearFilters(): void {
    setSearchParams(new URLSearchParams());
    setSelectedEntry(null);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-log', page, actionFilter, entityTypeFilter, sourceFilter, fromDate, toDate],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (actionFilter) params.action = actionFilter;
      if (entityTypeFilter) params.entityType = entityTypeFilter;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const res = await api.get<AuditResponse>('/api/v1/admin/audit-log', { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
    enabled: !dateError,
  });

  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Audit Log</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Track all system actions for compliance and security monitoring.
          </p>
        </div>
        {pagination && (
          <span className="text-sm text-[var(--color-text-secondary)]">
            {pagination.total.toLocaleString()} total entries
          </span>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Filter by action (e.g. POST, staff_added)"
          value={actionFilter}
          onChange={(e) => updateFilter('action', e.target.value)}
          aria-label="Filter audit log by action"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-60"
        />
        <input
          type="text"
          placeholder="Filter by entity type"
          value={entityTypeFilter}
          onChange={(e) => updateFilter('entityType', e.target.value)}
          aria-label="Filter audit log by entity type"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-60"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          aria-label="Filter audit log by source stream"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="all">All sources</option>
          <option value="audit_log">Request log</option>
          <option value="admin_actions">Admin operations</option>
        </select>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[var(--color-text-secondary)]" htmlFor="audit-from">From</label>
          <input
            id="audit-from"
            type="date"
            value={fromDate}
            onChange={(e) => updateFilter('from', e.target.value)}
            aria-label="Filter audit log from date"
            className="px-2 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <label className="text-xs text-[var(--color-text-secondary)]" htmlFor="audit-to">To</label>
          <input
            id="audit-to"
            type="date"
            value={toDate}
            onChange={(e) => updateFilter('to', e.target.value)}
            aria-label="Filter audit log to date"
            className="px-2 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        {(actionFilter || entityTypeFilter || sourceFilter !== 'all' || fromDate || toDate) && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-[var(--color-primary)] hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {dateError && <p role="alert" className="text-sm text-red-600">{dateError}</p>}

      {isLoading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
        </div>
      ) : isError ? (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load audit log</p>
          <p className="text-sm text-red-600 mt-1">Check your connection and try again.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-12 text-center">
          <ClipboardList size={40} className="mx-auto mb-3 text-slate-400" />
          <p className="font-medium text-[var(--color-text)]">No audit entries found</p>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {/* BUG-PHASE108-01 fix — pre-fix this checked only
                actionFilter || entityTypeFilter, so when a compliance
                officer narrowed by date or source and got zero hits,
                the message claimed "Audit entries will appear as
                system actions occur" — implying NO entries exist
                anywhere in the system, the opposite of the reality.
                Now checks the full filter set, matching the same
                condition used to show the Clear Filters button above. */}
            {(actionFilter || entityTypeFilter || sourceFilter !== 'all' || fromDate || toDate)
              ? 'Try adjusting your filters.'
              : 'Audit entries will appear as system actions occur.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]">User</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]">Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]">IP</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    tabIndex={0}
                    className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
                    onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedEntry(selectedEntry?.id === entry.id ? null : entry);
                      }
                    }}
                  >
                    <td className="px-4 py-3 text-[var(--color-text)] whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--color-text)]">{entry.userEmail ?? 'System'}</span>
                        {entry.userRole && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[entry.userRole] ?? 'bg-gray-100 text-gray-600'}`}>
                            {entry.userRole}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      <div className="flex items-center gap-2">
                        {entry.source && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${SOURCE_BADGE[entry.source].cls}`}
                            title={`Source: ${entry.source}`}
                          >
                            {SOURCE_BADGE[entry.source].label}
                          </span>
                        )}
                        <span className="font-mono text-xs">
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--color-text-secondary)]">{entry.entityType}</span>
                      {entry.entityId && (
                        <span className="text-xs text-[var(--color-text-secondary)] ml-1 font-mono">
                          {entry.entityId.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] font-mono text-xs">{entry.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {selectedEntry?.id === entry.id ? '▲' : '▼'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedEntry && (
            <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-6">
              <h3 className="font-semibold text-[var(--color-text)] mb-3">Entry Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--color-text-secondary)]">Entry ID:</span>
                  <p className="font-mono text-[var(--color-text)]">{selectedEntry.id}</p>
                </div>
                <div>
                  <span className="text-[var(--color-text-secondary)]">User ID:</span>
                  <p className="font-mono text-[var(--color-text)]">{selectedEntry.userId ?? 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[var(--color-text-secondary)]">User Agent:</span>
                  <p className="text-[var(--color-text)] text-xs break-all">{selectedEntry.userAgent ?? 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[var(--color-text-secondary)]">Full Action:</span>
                  <p className="font-mono text-[var(--color-text)]">{selectedEntry.action}</p>
                </div>
              </div>
              {selectedEntry.reason && (
                <div className="mt-4">
                  <span className="text-[var(--color-text-secondary)] text-sm">Reason:</span>
                  <p className="mt-1 text-[var(--color-text)] text-sm bg-amber-50 border border-amber-200 rounded p-3">
                    {selectedEntry.reason}
                  </p>
                </div>
              )}
              {(selectedEntry.oldValues || selectedEntry.newValues) && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {selectedEntry.oldValues && (
                    <div>
                      <span className="text-[var(--color-text-secondary)] text-sm">Old Values:</span>
                      <pre className="mt-1 bg-[var(--color-bg)] rounded p-3 text-xs font-mono overflow-auto max-h-40">
                        {JSON.stringify(selectedEntry.oldValues, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedEntry.newValues && (
                    <div>
                      <span className="text-[var(--color-text-secondary)] text-sm">New Values:</span>
                      <pre className="mt-1 bg-[var(--color-bg)] rounded p-3 text-xs font-mono overflow-auto max-h-40">
                        {JSON.stringify(selectedEntry.newValues, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm disabled:opacity-40 hover:bg-[var(--color-bg)] transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm disabled:opacity-40 hover:bg-[var(--color-bg)] transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
