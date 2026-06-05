/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 13 Dispatch C — Data Protection Log (admin DPO surface).
 *
 * Lists data_subject_requests with filters and DPO actions:
 *   - Mark complete (response payload URL)
 *   - Request more info (info needed)
 *   - Reject (reason ≥ 20 chars, super_admin)
 *   - Escalate to NPC (NPC reference, super_admin)
 *
 * All feedback uses sonner toasts. All form inputs include aria-* attributes.
 */

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Textarea,
  Checkbox,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { Shield, AlertTriangle } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';

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

interface DsrListResponse {
  data: { rows: DsrRecord[]; total: number };
}

const STATUS_OPTIONS: Array<{ value: DsrStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

const TYPE_OPTIONS: Array<{ value: DsrRequestType | 'all'; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'access', label: 'Access' },
  { value: 'erasure', label: 'Erasure' },
  { value: 'correction', label: 'Correction' },
  { value: 'portability', label: 'Portability' },
  { value: 'restriction', label: 'Restriction' },
  { value: 'objection', label: 'Objection' },
];

const STATUS_BADGE: Record<DsrStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
  received: { label: 'Received', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

function parseStatus(value: string | null): DsrStatus | 'all' {
  return value === 'received' || value === 'in_progress' || value === 'completed' || value === 'rejected' ? value : 'all';
}

function parseType(value: string | null): DsrRequestType | 'all' {
  return value === 'access' || value === 'erasure' || value === 'correction' || value === 'portability' || value === 'restriction' || value === 'objection' ? value : 'all';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

// ─── Component ──────────────────────────────────────────────────────────────

type DialogKind = 'complete' | 'request_info' | 'reject' | 'escalate' | null;

interface DialogState {
  kind: DialogKind;
  dsr: DsrRecord | null;
}

export default function DataProtectionLogPage(): React.ReactElement {
  const queryClient = useQueryClient();
  // Audit fix (2026-06-05) — ALL four DSR actions (complete, request-info,
  // reject, escalate) are super_admin-only on the server
  // (compliance-admin.routes.ts: requireSuperAdmin on /complete, /request-info,
  // /reject, /escalate). Gate every action button on isSuperAdmin so a
  // non-super admin never sees a button that returns a guaranteed 403. (The
  // earlier comment wrongly described complete/request-info as any-admin.)
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = parseStatus(searchParams.get('status'));
  const typeFilter = parseType(searchParams.get('type'));
  const overdueOnly = searchParams.get('overdueOnly') === 'true';

  const [dialog, setDialog] = useState<DialogState>({ kind: null, dsr: null });
  const [responseUrl, setResponseUrl] = useState('');
  const [infoNeeded, setInfoNeeded] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [npcReference, setNpcReference] = useState('');
  const [erasureConfirm, setErasureConfirm] = useState('');

  function setStatusFilter(value: DsrStatus | 'all'): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (value === 'all') params.delete('status');
      else params.set('status', value);
      return params;
    });
  }

  function setTypeFilter(value: DsrRequestType | 'all'): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (value === 'all') params.delete('type');
      else params.set('type', value);
      return params;
    });
  }

  function setOverdueOnly(value: boolean): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (value) params.set('overdueOnly', 'true');
      else params.delete('overdueOnly');
      return params;
    });
  }

  const dsrQuery = useQuery({
    queryKey: ['adminDsrList', statusFilter, overdueOnly],
    queryFn: async (): Promise<{ rows: DsrRecord[]; total: number }> => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (overdueOnly) params.set('overdueOnly', 'true');
      params.set('limit', '200');
      const res = await api.get<DsrListResponse>(`/api/v1/admin/compliance/dsr?${params.toString()}`);
      return res.data.data;
    },
    staleTime: 15 * 1000,
  });

  const filteredRows = useMemo(() => {
    const rows = dsrQuery.data?.rows ?? [];
    if (typeFilter === 'all') return rows;
    return rows.filter((r) => r.requestType === typeFilter);
  }, [dsrQuery.data, typeFilter]);

  const closeDialog = (): void => {
    setDialog({ kind: null, dsr: null });
    setResponseUrl('');
    setInfoNeeded('');
    setRejectReason('');
    setNpcReference('');
    setErasureConfirm('');
  };

  const completeMutation = useMutation({
    mutationFn: async (input: { dsrId: string; responsePayloadUrl: string }) => {
      const body: { responsePayloadUrl?: string } = {};
      if (input.responsePayloadUrl.trim().length > 0) {
        body.responsePayloadUrl = input.responsePayloadUrl.trim();
      }
      await api.post(`/api/v1/admin/compliance/dsr/${input.dsrId}/complete`, body);
    },
    onSuccess: () => {
      toast.success('DSR marked complete.');
      void queryClient.invalidateQueries({ queryKey: ['adminDsrList'] });
      closeDialog();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const requestInfoMutation = useMutation({
    mutationFn: async (input: { dsrId: string; infoNeeded: string }) => {
      await api.post(`/api/v1/admin/compliance/dsr/${input.dsrId}/request-info`, {
        infoNeeded: input.infoNeeded.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Info request recorded.');
      void queryClient.invalidateQueries({ queryKey: ['adminDsrList'] });
      closeDialog();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: async (input: { dsrId: string; reason: string }) => {
      await api.post(`/api/v1/admin/compliance/dsr/${input.dsrId}/reject`, { reason: input.reason.trim() });
    },
    onSuccess: () => {
      toast.success('DSR rejected.');
      void queryClient.invalidateQueries({ queryKey: ['adminDsrList'] });
      closeDialog();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const escalateMutation = useMutation({
    mutationFn: async (input: { dsrId: string; npcReference: string }) => {
      await api.post(`/api/v1/admin/compliance/dsr/${input.dsrId}/escalate`, {
        npcReference: input.npcReference.trim(),
      });
    },
    onSuccess: () => {
      toast.success('DSR escalated to NPC.');
      void queryClient.invalidateQueries({ queryKey: ['adminDsrList'] });
      closeDialog();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isWorking = completeMutation.isPending
    || requestInfoMutation.isPending
    || rejectMutation.isPending
    || escalateMutation.isPending;

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns: Column<DsrRecord>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (r) => <span className="font-mono text-xs">{r.id.slice(-8).toUpperCase()}</span>,
    },
    {
      key: 'user',
      header: 'User',
      render: (r) => r.userEmail ?? r.userId.slice(0, 8),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => <span className="capitalize">{r.requestType}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const cfg = STATUS_BADGE[r.status];
        return <Badge label={cfg.label} variant={cfg.variant} />;
      },
    },
    {
      key: 'received',
      header: 'Received',
      render: (r) => fmtDate(r.receivedAt),
    },
    {
      key: 'due',
      header: 'Due',
      render: (r) => fmtDate(r.dueAt),
    },
    {
      key: 'days',
      header: 'Days remaining',
      render: (r) => {
        if (r.status === 'completed' || r.status === 'rejected') {
          return <span className="text-slate-400">—</span>;
        }
        const cls = r.daysUntilDue < 3 ? 'text-red-600 font-semibold' : 'text-slate-700';
        return <span className={cls}>{r.daysUntilDue}d</span>;
      },
    },
    {
      key: 'handled',
      header: 'Handled by',
      render: (r) => r.handledBy ? <span className="font-mono text-xs">{r.handledBy.slice(0, 8)}</span> : '—',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        const terminal = r.status === 'completed' || r.status === 'rejected';
        return (
          <div className="flex flex-wrap gap-1.5">
            {isSuperAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={terminal}
                  onClick={() => setDialog({ kind: 'complete', dsr: r })}
                  aria-label={`Mark request ${r.id.slice(-8)} complete`}
                >
                  Complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={terminal}
                  onClick={() => setDialog({ kind: 'request_info', dsr: r })}
                  aria-label={`Request more info for ${r.id.slice(-8)}`}
                >
                  Info
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={terminal}
                  onClick={() => setDialog({ kind: 'reject', dsr: r })}
                  aria-label={`Reject ${r.id.slice(-8)}`}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={terminal}
                  onClick={() => setDialog({ kind: 'escalate', dsr: r })}
                  aria-label={`Escalate ${r.id.slice(-8)} to NPC`}
                >
                  Escalate
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield size={22} className="text-[var(--color-secondary)]" />
            Data Protection Log
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track and respond to Data Subject Requests within the 15-day NPC SLA.
          </p>
        </div>
      </div>

      {!isSuperAdmin && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have read-only access to this page. Acting on a Data Subject Request
          (complete, request info, reject, escalate) requires super-admin access —
          contact a super administrator.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dpo-status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DsrStatus | 'all')}>
                <SelectTrigger id="dpo-status-filter" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dpo-type-filter">Request type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as DsrRequestType | 'all')}>
                <SelectTrigger id="dpo-type-filter" aria-label="Filter by request type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <Checkbox
                  checked={overdueOnly}
                  onCheckedChange={(c) => setOverdueOnly(c === true)}
                  aria-label="Show only overdue or due-soon requests"
                />
                <span className="text-sm">Overdue / due-soon only</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filteredRows}
        keyExtractor={(r) => r.id}
        isLoading={dsrQuery.isLoading}
        emptyMessage={dsrQuery.isError
          ? 'Failed to load data subject requests.'
          : 'No data subject requests match the current filters.'}
      />

      {/* ── Mark complete dialog ─────────────────────────────────────────── */}
      <Dialog
        open={dialog.kind === 'complete'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark request complete</DialogTitle>
            <DialogDescription>
              {dialog.dsr ? `Request ${dialog.dsr.id.slice(-8).toUpperCase()} (${dialog.dsr.requestType}).` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialog.dsr?.requestType === 'erasure' && (
              <>
                <div
                  id="dpo-erasure-warning"
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    This marks the DSR closed. Erasure must be manually executed against
                    backend systems &mdash; clicking Mark Complete does NOT delete the
                    customer&apos;s data.
                  </span>
                </div>
                <div>
                  <Label htmlFor="dpo-erasure-confirm">Type ERASE COMPLETE to confirm</Label>
                  <Input
                    id="dpo-erasure-confirm"
                    value={erasureConfirm}
                    onChange={(e) => setErasureConfirm(e.target.value)}
                    placeholder="ERASE COMPLETE"
                    aria-label="Type ERASE COMPLETE to confirm erasure DSR closure"
                    aria-required="true"
                    aria-describedby="dpo-erasure-warning"
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="dpo-response-url">Response payload URL (optional)</Label>
              <Input
                id="dpo-response-url"
                type="url"
                value={responseUrl}
                onChange={(e) => setResponseUrl(e.target.value)}
                placeholder="https://..."
                aria-label="Response payload URL"
                aria-describedby="dpo-response-url-help"
              />
              <p id="dpo-response-url-help" className="text-xs text-slate-500 mt-1">
                Link to the file or document delivered to the data subject (e.g., signed S3 URL).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isWorking}>Cancel</Button>
            <Button
              onClick={() => {
                if (!dialog.dsr) return;
                if (!window.confirm(`Mark DSR ${dialog.dsr.id.slice(-8).toUpperCase()} complete?`)) return;
                completeMutation.mutate({ dsrId: dialog.dsr.id, responsePayloadUrl: responseUrl });
              }}
              disabled={
                isWorking
                || (dialog.dsr?.requestType === 'erasure' && erasureConfirm !== 'ERASE COMPLETE')
              }
            >
              {completeMutation.isPending ? 'Marking…' : 'Mark complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request info dialog ──────────────────────────────────────────── */}
      <Dialog
        open={dialog.kind === 'request_info'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request more information</DialogTitle>
            <DialogDescription>
              The user will see this in their request history. Be specific about what is needed.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="dpo-info-needed">What information is needed?</Label>
            <Textarea
              id="dpo-info-needed"
              value={infoNeeded}
              onChange={(e) => setInfoNeeded(e.target.value)}
              placeholder="e.g., We need a copy of a government ID to verify identity before processing this access request."
              rows={4}
              aria-required="true"
              aria-label="Information needed from the user"
            />
            <p className="text-xs text-slate-500 mt-1">Minimum 10 characters.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isWorking}>Cancel</Button>
            <Button
              onClick={() => {
                if (!dialog.dsr) return;
                if (infoNeeded.trim().length < 10) {
                  toast.warning('Please describe what information you need (at least 10 characters).');
                  return;
                }
                if (!window.confirm(`Request more information for DSR ${dialog.dsr.id.slice(-8).toUpperCase()}?`)) return;
                requestInfoMutation.mutate({ dsrId: dialog.dsr.id, infoNeeded });
              }}
              disabled={isWorking || infoNeeded.trim().length < 10}
            >
              {requestInfoMutation.isPending ? 'Sending…' : 'Request info'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={dialog.kind === 'reject'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject data subject request</DialogTitle>
            <DialogDescription>
              Rejection is a terminal action and is logged in the audit trail. Super-admin only.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="dpo-reject-reason">Reason for rejection</Label>
            <Textarea
              id="dpo-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain the legal or factual basis for rejection."
              rows={4}
              aria-required="true"
              aria-label="Rejection reason"
              aria-describedby="dpo-reject-help"
            />
            <p id="dpo-reject-help" className="text-xs text-slate-500 mt-1">
              Minimum 20 characters. Visible to the data subject.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isWorking}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!dialog.dsr) return;
                if (rejectReason.trim().length < 20) {
                  toast.warning('Rejection reason must be at least 20 characters.');
                  return;
                }
                if (!window.confirm(`Reject DSR ${dialog.dsr.id.slice(-8).toUpperCase()}?`)) return;
                rejectMutation.mutate({ dsrId: dialog.dsr.id, reason: rejectReason });
              }}
              disabled={isWorking || rejectReason.trim().length < 20}
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Escalate to NPC dialog ───────────────────────────────────────── */}
      <Dialog
        open={dialog.kind === 'escalate'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate to NPC</DialogTitle>
            <DialogDescription>
              Record an NPC reference number. Status remains in_progress. Super-admin only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Use this when the National Privacy Commission has issued a complaint or directive
                related to this request. Logged in the audit trail.
              </span>
            </div>
            <div>
              <Label htmlFor="dpo-npc-ref">NPC reference</Label>
              <Input
                id="dpo-npc-ref"
                value={npcReference}
                onChange={(e) => setNpcReference(e.target.value)}
                placeholder="e.g., NPC-2026-04-1234"
                aria-required="true"
                aria-label="NPC reference number"
              />
              <p className="text-xs text-slate-500 mt-1">Required.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isWorking}>Cancel</Button>
            <Button
              onClick={() => {
                if (!dialog.dsr) return;
                if (npcReference.trim().length < 3) {
                  toast.warning('Enter the NPC reference number.');
                  return;
                }
                if (!window.confirm(`Escalate DSR ${dialog.dsr.id.slice(-8).toUpperCase()} to NPC?`)) return;
                escalateMutation.mutate({ dsrId: dialog.dsr.id, npcReference });
              }}
              disabled={isWorking || npcReference.trim().length < 3}
            >
              {escalateMutation.isPending ? 'Escalating…' : 'Escalate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
