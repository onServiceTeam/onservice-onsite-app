/**
 * Phase 11 — Admin Compliance Center.
 *
 * Five tabs (state-driven): NPC Compliance, BIR Calendar, Audit Log,
 * Tax Documents (stub), Regulatory Reports (stub).
 *
 * Mirrors MarketingPage.tsx layout: header + Tabs from @/components/ui.
 */

import React, { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import {
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Textarea,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import {
  Shield,
  FileText,
  Calendar,
  Download,
  Search,
} from '@/components/icons';

// ─── Types ──────────────────────────────────────────────────────────────────

type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected';
type DsrRequestType =
  | 'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection';

interface DsrRecord {
  id: string;
  userId: string;
  userEmail: string | null;
  requestType: DsrRequestType;
  status: DsrStatus;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
  handledBy: string | null;
  userMessage: string | null;
  adminNotes: string | null;
  responsePayloadUrl: string | null;
  rejectionReason: string | null;
  daysUntilDue: number;
  isOverdue: boolean;
}

interface ConsentRecord {
  id: string;
  userId: string;
  consentType: string;
  version: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

interface BirCalendarEntry {
  formNo: string;
  label: string;
  dueDate: string;
  status: 'not_yet_due' | 'due_soon' | 'overdue';
}

interface AuditEntry {
  id: string;
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
  createdAt: string;
}

interface AuditResponse {
  data: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

const STATUS_LABEL: Record<DsrStatus, string> = {
  received: 'Received',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CompliancePage(): React.ReactElement {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
          <Shield size={20} /> Compliance
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          NPC consent &amp; DSR queue, BIR filing calendar, audit log, tax documents,
          and regulatory reports.
        </p>
      </div>

      <Tabs defaultValue="npc">
        <TabsList>
          <TabsTrigger value="npc">NPC Compliance</TabsTrigger>
          <TabsTrigger value="bir">BIR Calendar</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="tax">Tax Documents</TabsTrigger>
          <TabsTrigger value="reports">Regulatory Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="npc">
          <NpcTab />
        </TabsContent>
        <TabsContent value="bir">
          <BirTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
        <TabsContent value="tax">
          <TaxTab />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── NPC tab ────────────────────────────────────────────────────────────────

function NpcTab(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<DsrStatus | 'all'>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<DsrRecord | null>(null);

  const dsrQuery = useQuery({
    queryKey: ['compliance-dsr', statusFilter, overdueOnly],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (overdueOnly) params.overdueOnly = 'true';
      const res = await api.get<{ success: boolean; data: { rows: DsrRecord[]; total: number } }>(
        '/api/v1/admin/compliance/dsr', { params },
      );
      return res.data.data;
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Subject Request Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as DsrStatus | 'all')}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
              Overdue only
            </label>
          </div>

          {dsrQuery.isLoading ? (
            <LoadingState label="Loading DSR queue..." />
          ) : dsrQuery.isError ? (
            <ErrorState
              title="Failed to load DSR queue"
              description={getErrorMessage(dsrQuery.error)}
            />
          ) : (dsrQuery.data?.rows ?? []).length === 0 ? (
            <EmptyState
              title="No data subject requests"
              description="Nothing in the queue with these filters."
              icon={<Shield size={28} className="text-slate-400" />}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg)]">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-[var(--color-text-secondary)]">ID</th>
                    <th className="text-left px-4 py-2 font-medium text-[var(--color-text-secondary)]">User</th>
                    <th className="text-left px-4 py-2 font-medium text-[var(--color-text-secondary)]">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-[var(--color-text-secondary)]">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-[var(--color-text-secondary)]">Days until due</th>
                  </tr>
                </thead>
                <tbody>
                  {(dsrQuery.data?.rows ?? []).map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg)]"
                      onClick={() => setSelected(r)}
                    >
                      <td className="px-4 py-2 font-mono text-xs">{r.id.slice(0, 8)}</td>
                      <td className="px-4 py-2">{r.userEmail ?? r.userId}</td>
                      <td className="px-4 py-2">{r.requestType}</td>
                      <td className="px-4 py-2"><Badge label={STATUS_LABEL[r.status]} /></td>
                      <td className="px-4 py-2">
                        {r.isOverdue ? (
                          <Badge variant="danger" label={`Overdue (${Math.abs(r.daysUntilDue)}d)`} />
                        ) : (
                          `${r.daysUntilDue}d`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <DsrDetailPanel
          dsr={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { void dsrQuery.refetch(); setSelected(null); }}
        />
      )}

      <ConsentSearchCard />
    </div>
  );
}

function DsrDetailPanel(props: {
  dsr: DsrRecord;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactElement {
  const { dsr, onClose, onUpdated } = props;
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState<DsrStatus>(dsr.status);
  const [adminNotes, setAdminNotes] = useState(dsr.adminNotes ?? '');
  const [rejectionReason, setRejectionReason] = useState(dsr.rejectionReason ?? '');
  const [responsePayloadUrl, setResponsePayloadUrl] = useState(dsr.responsePayloadUrl ?? '');

  const updateMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { newStatus };
      if (adminNotes) body.adminNotes = adminNotes;
      if (rejectionReason) body.rejectionReason = rejectionReason;
      if (responsePayloadUrl) body.responsePayloadUrl = responsePayloadUrl;
      const res = await api.patch<{ success: boolean; data: DsrRecord }>(
        `/api/v1/admin/compliance/dsr/${dsr.id}`, body,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['compliance-dsr'] });
      onUpdated();
    },
  });

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    updateMut.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>DSR Detail — {dsr.id.slice(0, 8)}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
          <dt className="text-[var(--color-text-secondary)]">User</dt>
          <dd>{dsr.userEmail ?? dsr.userId}</dd>
          <dt className="text-[var(--color-text-secondary)]">Type</dt>
          <dd>{dsr.requestType}</dd>
          <dt className="text-[var(--color-text-secondary)]">Received</dt>
          <dd>{fmtDateTime(dsr.receivedAt)}</dd>
          <dt className="text-[var(--color-text-secondary)]">Due</dt>
          <dd>{fmtDateTime(dsr.dueAt)}</dd>
          <dt className="text-[var(--color-text-secondary)]">User message</dt>
          <dd className="col-span-2 italic">{dsr.userMessage ?? '—'}</dd>
        </dl>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="dsr-status">New status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as DsrStatus)}>
              <SelectTrigger id="dsr-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dsr-notes">Admin notes</Label>
            <Textarea
              id="dsr-notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>
          {newStatus === 'rejected' && (
            <div>
              <Label htmlFor="dsr-rej">Rejection reason</Label>
              <Textarea
                id="dsr-rej"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
              />
            </div>
          )}
          {newStatus === 'completed' && (
            <div>
              <Label htmlFor="dsr-url">Response payload URL</Label>
              <Input
                id="dsr-url"
                value={responsePayloadUrl}
                onChange={(e) => setResponsePayloadUrl(e.target.value)}
              />
            </div>
          )}
          {updateMut.isError && (
            <p className="text-sm text-red-600">{getErrorMessage(updateMut.error)}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Saving...' : 'Save changes'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ConsentSearchCard(): React.ReactElement {
  const [userId, setUserId] = useState('');
  const [consentType, setConsentType] = useState('');
  const [version, setVersion] = useState('');
  const [applied, setApplied] = useState({ userId: '', consentType: '', version: '' });

  const consentQuery = useQuery({
    queryKey: ['compliance-consent-search', applied],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (applied.userId) params.userId = applied.userId;
      if (applied.consentType) params.consentType = applied.consentType;
      if (applied.version) params.version = applied.version;
      const res = await api.get<{ success: boolean; data: { rows: ConsentRecord[]; total: number } }>(
        '/api/v1/admin/compliance/consent', { params },
      );
      return res.data.data;
    },
    enabled: applied.userId !== '' || applied.consentType !== '' || applied.version !== '',
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setApplied({ userId, consentType, version });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consent Records Search</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <Label htmlFor="cs-user">User ID</Label>
            <Input id="cs-user" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-type">Consent type</Label>
            <Input id="cs-type" value={consentType} onChange={(e) => setConsentType(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-ver">Version</Label>
            <Input id="cs-ver" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit"><Search size={14} /> Search</Button>
          </div>
        </form>

        {consentQuery.isFetching ? (
          <LoadingState label="Searching..." />
        ) : (consentQuery.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Enter at least one filter and click Search.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg)]">
                <tr>
                  <th className="text-left px-4 py-2">User</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Version</th>
                  <th className="text-left px-4 py-2">Granted</th>
                  <th className="text-left px-4 py-2">At</th>
                  <th className="text-left px-4 py-2">Revoked</th>
                </tr>
              </thead>
              <tbody>
                {(consentQuery.data?.rows ?? []).map((c) => (
                  <tr key={c.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-2 font-mono text-xs">{c.userId.slice(0, 8)}</td>
                    <td className="px-4 py-2">{c.consentType}</td>
                    <td className="px-4 py-2">{c.version}</td>
                    <td className="px-4 py-2">{c.granted ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-2">{fmtDateTime(c.grantedAt)}</td>
                    <td className="px-4 py-2">{c.revokedAt ? fmtDateTime(c.revokedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── BIR tab ───────────────────────────────────────────────────────────────

function BirTab(): React.ReactElement {
  const [year, setYear] = useState(new Date().getFullYear());

  const calQuery = useQuery({
    queryKey: ['compliance-bir-calendar', year],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BirCalendarEntry[] }>(
        '/api/v1/admin/compliance/bir-calendar', { params: { year } },
      );
      return res.data.data;
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, BirCalendarEntry[]>();
    for (const e of calQuery.data ?? []) {
      const m = e.dueDate.slice(0, 7); // YYYY-MM
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [calQuery.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar size={18} /> BIR Filing Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <Label htmlFor="bir-year">Year</Label>
          <Input
            id="bir-year"
            type="number"
            min={2020}
            max={2050}
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || year)}
            className="w-28"
          />
        </div>

        {calQuery.isLoading ? (
          <LoadingState label="Loading calendar..." />
        ) : calQuery.isError ? (
          <ErrorState title="Failed to load BIR calendar" description={getErrorMessage(calQuery.error)} />
        ) : (
          <div className="space-y-4">
            {grouped.map(([month, items]) => (
              <div key={month} className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                <div className="bg-[var(--color-bg)] px-4 py-2 font-medium text-[var(--color-text)]">
                  {month}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((e) => (
                      <tr key={`${e.formNo}-${e.dueDate}`} className="border-t border-[var(--color-border)]">
                        <td className="px-4 py-2 font-mono w-32">{e.formNo}</td>
                        <td className="px-4 py-2">{e.label}</td>
                        <td className="px-4 py-2 w-32">{fmtDate(e.dueDate)}</td>
                        <td className="px-4 py-2 w-32">
                          {e.status === 'overdue' ? (
                            <Badge variant="danger" label="Overdue" />
                          ) : e.status === 'due_soon' ? (
                            <Badge variant="warning" label="Due soon" />
                          ) : (
                            <Badge variant="outline" label="Not yet due" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Audit tab (extends AuditLogPage UI w/ extra controls + CSV export) ───

function AuditTab(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  const pageSize = 50;

  const auditQuery = useQuery({
    queryKey: ['compliance-audit', page, actionFilter, entityTypeFilter, userIdFilter, from, to],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (actionFilter) params.action = actionFilter;
      if (entityTypeFilter) params.entityType = entityTypeFilter;
      if (userIdFilter) params.userId = userIdFilter;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get<AuditResponse>('/api/v1/admin/audit-log', { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const handleExport = async (): Promise<void> => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (actionFilter) params.action = actionFilter;
      if (entityTypeFilter) params.entityType = entityTypeFilter;
      if (userIdFilter) params.userId = userIdFilter;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get<Blob>('/api/v1/admin/compliance/audit-log/export.csv', {
        params, responseType: 'blob',
      });
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const entries = auditQuery.data?.data ?? [];
  const pagination = auditQuery.data?.pagination;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText size={18} /> Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Input
            placeholder="Action contains..."
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          />
          <Input
            placeholder="Entity type"
            value={entityTypeFilter}
            onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
          />
          <Input
            placeholder="User ID"
            value={userIdFilter}
            onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
          />
          <Button onClick={() => { void handleExport(); }} disabled={exporting}>
            <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>

        {auditQuery.isLoading && !auditQuery.data ? (
          <LoadingState label="Loading audit log..." />
        ) : auditQuery.isError ? (
          <ErrorState title="Failed to load audit log" description={getErrorMessage(auditQuery.error)} />
        ) : entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="Try adjusting filters."
            icon={<FileText size={28} className="text-slate-400" />}
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg)]">
                  <tr>
                    <th className="text-left px-4 py-2">Timestamp</th>
                    <th className="text-left px-4 py-2">User</th>
                    <th className="text-left px-4 py-2">Action</th>
                    <th className="text-left px-4 py-2">Entity</th>
                    <th className="text-left px-4 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg)]"
                      onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(entry.createdAt)}</td>
                      <td className="px-4 py-2">{entry.userEmail ?? 'System'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{entry.action}</td>
                      <td className="px-4 py-2">{entry.entityType}</td>
                      <td className="px-4 py-2 font-mono text-xs">{entry.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedEntry && (selectedEntry.oldValues || selectedEntry.newValues) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-1">Old values</p>
                  <pre className="bg-[var(--color-bg)] rounded p-3 text-xs font-mono overflow-auto max-h-64 border border-[var(--color-border)]">
                    {selectedEntry.oldValues ? JSON.stringify(selectedEntry.oldValues, null, 2) : '—'}
                  </pre>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-1">New values</p>
                  <pre className="bg-[var(--color-bg)] rounded p-3 text-xs font-mono overflow-auto max-h-64 border border-[var(--color-border)]">
                    {selectedEntry.newValues ? JSON.stringify(selectedEntry.newValues, null, 2) : '—'}
                  </pre>
                </div>
              </div>
            )}

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tax Documents tab (stub) ──────────────────────────────────────────────

function TaxTab(): React.ReactElement {
  const [year, setYear] = useState(new Date().getFullYear());
  const [type, setType] = useState('all');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText size={18} /> Tax Documents Archive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          TODO: pulls from <code>/api/v1/admin/bir/exports</code> (Phase 08). Filter by year and type.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="tax-year">Year</Label>
            <Input id="tax-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
          </div>
          <div>
            <Label htmlFor="tax-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="tax-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="or">Official Receipts</SelectItem>
                <SelectItem value="2307">Form 2307</SelectItem>
                <SelectItem value="2550m">Form 2550M</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <EmptyState
          title="Not yet wired"
          description="This view will list previously generated tax documents from the BIR exports endpoint."
          icon={<FileText size={28} className="text-slate-400" />}
        />
      </CardContent>
    </Card>
  );
}

// ─── Regulatory Reports tab (stub) ─────────────────────────────────────────

function ReportsTab(): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regulatory Reports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          One-click compliance posture reports for NPC, BIR, DTI, and SEC reviewers.
          Implementation tracked separately; this is the placeholder UI.
        </p>
        <Button onClick={() => { window.alert('Not yet implemented'); }}>
          Generate compliance posture report
        </Button>
      </CardContent>
    </Card>
  );
}
