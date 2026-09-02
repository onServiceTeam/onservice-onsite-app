import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui';
import { AlertTriangle, ArrowRight, Shield } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';

type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected';
type DsrRequestType =
  | 'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection';

interface DsrRecord {
  id: string;
  userId: string;
  userEmail: string | null;
  userRole: string | null;
  providerProfileId: string | null;
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

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: DsrStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

const TYPE_OPTIONS: Array<{ value: DsrRequestType | 'all'; label: string }> = [
  { value: 'all', label: 'All request types' },
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

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not recorded';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function targetLabel(record: DsrRecord): string {
  if (record.status === 'completed' || record.status === 'rejected') return 'Closed';
  if (record.daysUntilDue < 0) return `${Math.abs(record.daysUntilDue)}d past internal target`;
  if (record.daysUntilDue === 0) return 'Internal target today';
  return `${record.daysUntilDue}d to internal target`;
}

export function isSecureResponseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > 2000) return false;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}

function subjectRoute(record: DsrRecord): string | null {
  if (record.userRole === 'customer') return `/customers/${record.userId}`;
  if ((record.userRole === 'provider' || record.userRole === 'provider_staff') && record.providerProfileId) {
    return `/providers/${record.providerProfileId}`;
  }
  return null;
}

function subjectRouteLabel(record: DsrRecord): string {
  return record.userRole === 'provider_staff'
    ? 'Open employing provider 360 record'
    : 'Open subject 360 record';
}

type DialogKind = 'review' | 'start_review' | 'complete' | 'request_info' | 'reject' | 'escalate' | null;

export default function DataProtectionLogPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const canManagePrivacy = useAuthStore(
    (state) => state.user?.role === 'super_admin' || state.user?.role === 'dpo',
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = parseStatus(searchParams.get('status'));
  const typeFilter = parseType(searchParams.get('type'));
  const overdueOnly = searchParams.get('overdueOnly') === 'true';
  const page = parsePage(searchParams.get('page'));

  const [dialogKind, setDialogKind] = useState<DialogKind>(null);
  const [selected, setSelected] = useState<DsrRecord | null>(null);
  const [responseUrl, setResponseUrl] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [infoNeeded, setInfoNeeded] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [npcReference, setNpcReference] = useState('');
  const [erasureConfirm, setErasureConfirm] = useState('');

  function updateFilters(updates: Record<string, string | null>): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(updates)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  }

  const dsrQuery = useQuery({
    queryKey: ['adminDsrList', statusFilter, typeFilter, overdueOnly, page],
    queryFn: async (): Promise<{ rows: DsrRecord[]; total: number }> => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('requestType', typeFilter);
      if (overdueOnly) params.set('overdueOnly', 'true');
      const response = await api.get<DsrListResponse>(`/api/v1/admin/compliance/dsr?${params.toString()}`);
      return response.data.data;
    },
    enabled: canManagePrivacy,
    staleTime: 15_000,
  });

  const total = dsrQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (dsrQuery.isSuccess && page > totalPages) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('page', String(totalPages));
        return next;
      });
    }
  }, [dsrQuery.isSuccess, page, setSearchParams, totalPages]);

  function closeDialogs(): void {
    setDialogKind(null);
    setSelected(null);
    setResponseUrl('');
    setReviewNote('');
    setInfoNeeded('');
    setRejectReason('');
    setNpcReference('');
    setErasureConfirm('');
  }

  function openDialog(kind: Exclude<DialogKind, null>, record: DsrRecord): void {
    setSelected(record);
    setDialogKind(kind);
  }

  function refreshPrivacyWork(): void {
    void queryClient.invalidateQueries({ queryKey: ['adminDsrList'] });
    void queryClient.invalidateQueries({ queryKey: ['privacyDsrAlerts'] });
  }

  const startReviewMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await api.post(`/api/v1/admin/compliance/dsr/${selected.id}/start-review`, { reviewNote: reviewNote.trim() });
    },
    onSuccess: () => { toast.success('Data request claimed and review started.'); refreshPrivacyWork(); closeDialogs(); },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const body: { responsePayloadUrl?: string } = {};
      if (responseUrl.trim()) body.responsePayloadUrl = responseUrl.trim();
      await api.post(`/api/v1/admin/compliance/dsr/${selected.id}/complete`, body);
    },
    onSuccess: () => { toast.success('Data request marked complete.'); refreshPrivacyWork(); closeDialogs(); },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const requestInfoMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await api.post(`/api/v1/admin/compliance/dsr/${selected.id}/request-info`, { infoNeeded: infoNeeded.trim() });
    },
    onSuccess: () => { toast.success('Information request recorded and notification queued.'); refreshPrivacyWork(); closeDialogs(); },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await api.post(`/api/v1/admin/compliance/dsr/${selected.id}/reject`, { reason: rejectReason.trim() });
    },
    onSuccess: () => { toast.success('Data request rejected.'); refreshPrivacyWork(); closeDialogs(); },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const escalateMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await api.post(`/api/v1/admin/compliance/dsr/${selected.id}/escalate`, { npcReference: npcReference.trim() });
    },
    onSuccess: () => { toast.success('NPC case reference recorded.'); refreshPrivacyWork(); closeDialogs(); },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const isWorking = startReviewMutation.isPending || completeMutation.isPending || requestInfoMutation.isPending || rejectMutation.isPending || escalateMutation.isPending;
  const selectedTerminal = selected?.status === 'completed' || selected?.status === 'rejected';
  const selectedSubjectRoute = selected ? subjectRoute(selected) : null;
  const responseUrlValid = isSecureResponseUrl(responseUrl);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[var(--color-primary)] px-5 py-6 text-white shadow-sm sm:px-7 lg:px-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80"><Shield size={18} /> Privacy case operations</div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Data Subject Requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
            Review the subject’s request, current internal target, case evidence, response delivery, and audited outcome.
          </p>
        </div>
      </section>

      <section role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <p><strong>E40 legal boundary.</strong> The stored due date is onService’s current internal 15-day response target. Do not describe it as an NPC-mandated completion deadline. Breach notification classification remains outside this screen pending counsel approval.</p>
      </section>

      {!canManagePrivacy && (
        <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          This workspace is restricted to the appointed Data Protection Officer and the super-admin fallback.
        </section>
      )}

      {canManagePrivacy && <Card>
        <CardHeader><CardTitle className="text-base">Case filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="dpo-status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={(value) => updateFilters({ status: value === 'all' ? null : value, page: null })}>
                <SelectTrigger id="dpo-status-filter" className="min-h-11" aria-label="Filter data requests by status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dpo-type-filter">Request type</Label>
              <Select value={typeFilter} onValueChange={(value) => updateFilters({ type: value === 'all' ? null : value, page: null })}>
                <SelectTrigger id="dpo-type-filter" className="min-h-11" aria-label="Filter data requests by type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex min-h-11 items-center gap-3 self-end rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
              <Checkbox
                checked={overdueOnly}
                onCheckedChange={(checked) => updateFilters({ overdueOnly: checked === true ? 'true' : null, page: null })}
                aria-label="Show only requests past the internal target"
              />
              Past internal target only
            </label>
          </div>
          {dsrQuery.isSuccess && (
            <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{total.toLocaleString('en-PH')} request{total === 1 ? '' : 's'} match the current server-side filters.</p>
          )}
        </CardContent>
      </Card>}

      {!canManagePrivacy ? null : dsrQuery.isLoading ? (
        <LoadingState label="Loading privacy cases…" />
      ) : dsrQuery.isError ? (
        <ErrorState
          title="Privacy cases unavailable"
          description={getErrorMessage(dsrQuery.error)}
          action={<Button variant="outline" onClick={() => void dsrQuery.refetch()}>Retry privacy queue</Button>}
        />
      ) : (dsrQuery.data?.rows?.length ?? 0) === 0 ? (
        <EmptyState title="No matching data requests" description="Change the filters or confirm the queue source is available." icon={<Shield size={28} className="text-slate-400" />} />
      ) : (
        <section aria-label="Data subject request cases" className="space-y-3">
          {dsrQuery.data?.rows?.map((record) => {
            const status = STATUS_BADGE[record.status];
            return (
              <article key={record.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[var(--color-primary)]">{record.id.slice(-8).toUpperCase()}</span>
                      <Badge label={status.label} variant={status.variant} />
                    </div>
                    <p className="mt-2 truncate font-semibold text-[var(--color-text)]">{record.userEmail ?? record.userId}</p>
                    <p className="mt-1 text-xs capitalize text-[var(--color-text-secondary)]">{record.userRole?.replace(/_/g, ' ') ?? 'Role unavailable'} · {record.requestType}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Received</p>
                    <p className="mt-1 text-sm text-[var(--color-text)]">{formatDateTime(record.receivedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Response target</p>
                    <p className={`mt-1 text-sm font-medium ${record.isOverdue ? 'text-red-700' : 'text-[var(--color-text)]'}`}>{targetLabel(record)}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{formatDateTime(record.dueAt)}</p>
                  </div>
                  <Button className="min-h-11" variant="outline" onClick={() => openDialog('review', record)} aria-label={`Review data request ${record.id.slice(-8)}`}>
                    Review case <ArrowRight size={15} />
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {canManagePrivacy && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={(nextPage) => updateFilters({ page: nextPage === 1 ? null : String(nextPage) })} />
      )}

      <Dialog open={dialogKind === 'review'} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Privacy case {selected?.id.slice(-8).toUpperCase()}</DialogTitle>
            <DialogDescription>Review the complete stored case before choosing an outcome.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <dl className="grid gap-3 rounded-lg border border-[var(--color-border)] p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Subject</dt><dd className="mt-1 break-all">{selected.userEmail ?? selected.userId}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Role</dt><dd className="mt-1 capitalize">{selected.userRole?.replace(/_/g, ' ') ?? 'Unavailable'}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Request</dt><dd className="mt-1 capitalize">{selected.requestType}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Status</dt><dd className="mt-1">{STATUS_BADGE[selected.status].label}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Received</dt><dd className="mt-1">{formatDateTime(selected.receivedAt)}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Internal target</dt><dd className="mt-1">{formatDateTime(selected.dueAt)} · {targetLabel(selected)}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Completed</dt><dd className="mt-1">{formatDateTime(selected.completedAt)}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Handler ID</dt><dd className="mt-1 break-all">{selected.handledBy ?? 'Unassigned'}</dd></div>
              </dl>
              {selectedSubjectRoute && (
                <Link to={selectedSubjectRoute} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">{subjectRouteLabel(selected)} <ArrowRight size={15} /></Link>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <CaseText title="Subject message" value={selected.userMessage} empty="No message supplied." />
                <CaseText title="Internal case notes" value={selected.adminNotes} empty="No internal notes recorded." />
                <CaseText title="Rejection reason" value={selected.rejectionReason} empty="Not rejected." />
                <CaseText title="Response delivery URL" value={selected.responsePayloadUrl} empty="No delivery URL recorded." />
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap sm:justify-between">
            <Button variant="outline" onClick={closeDialogs}>Close</Button>
            {!selectedTerminal && selected && (
              <div className="flex flex-wrap gap-2">
                {selected.status === 'received' && <Button variant="outline" onClick={() => setDialogKind('start_review')}>Start review</Button>}
                <Button variant="outline" onClick={() => setDialogKind('request_info')}>Request info</Button>
                <Button variant="outline" onClick={() => setDialogKind('escalate')}>Record NPC case</Button>
                <Button variant="destructive" onClick={() => setDialogKind('reject')}>Reject</Button>
                {selected.status === 'in_progress' && <Button onClick={() => setDialogKind('complete')}>Complete</Button>}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogKind === 'start_review'} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start case review</DialogTitle><DialogDescription>Claim this received request and record the first internal review step. This does not notify the subject.</DialogDescription></DialogHeader>
          <div><Label htmlFor="review-note">Initial review note</Label><Textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={5} maxLength={5000} /><p className="mt-1 text-xs text-[var(--color-text-secondary)]">10 to 5,000 characters. State what was checked and the next case step; do not copy unnecessary personal data.</p></div>
          <DialogFooter><Button variant="outline" onClick={closeDialogs} disabled={isWorking}>Cancel</Button><Button disabled={isWorking || reviewNote.trim().length < 10} onClick={() => { if (selected && window.confirm(`Start review for data request ${selected.id.slice(-8).toUpperCase()}?`)) startReviewMutation.mutate(); }}>{startReviewMutation.isPending ? 'Starting…' : 'Start review'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogKind === 'complete'} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete data request</DialogTitle><DialogDescription>This closes the privacy case. Record secure response delivery when one exists.</DialogDescription></DialogHeader>
          {selected?.requestType === 'erasure' && (
            <div className="space-y-3">
              <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={18} className="shrink-0" />Closing this record does not itself erase backend data. Verify the separate account-deletion/anonymization work first.</div>
              <div><Label htmlFor="erasure-confirm">Type ERASE COMPLETE to confirm</Label><Input id="erasure-confirm" value={erasureConfirm} onChange={(event) => setErasureConfirm(event.target.value)} maxLength={14} /></div>
            </div>
          )}
          <div><Label htmlFor="response-url">Secure response URL (optional)</Label><Input id="response-url" type="url" value={responseUrl} onChange={(event) => setResponseUrl(event.target.value)} placeholder="https://…" maxLength={2000} /><p className="mt-1 text-xs text-[var(--color-text-secondary)]">HTTPS only. Use a subject-authorized delivery location and verify its access window.</p>{!responseUrlValid && <p role="alert" className="mt-1 text-xs text-red-700">Enter a complete, valid HTTPS response URL.</p>}</div>
          <DialogFooter><Button variant="outline" onClick={closeDialogs} disabled={isWorking}>Cancel</Button><Button disabled={isWorking || !responseUrlValid || (selected?.requestType === 'erasure' && erasureConfirm !== 'ERASE COMPLETE')} onClick={() => { if (selected && window.confirm(`Complete data request ${selected.id.slice(-8).toUpperCase()}?`)) completeMutation.mutate(); }}>{completeMutation.isPending ? 'Completing…' : 'Complete request'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogKind === 'request_info'} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request more information</DialogTitle><DialogDescription>The subject receives an in-app notification. The exact request is retained in the internal case notes and audit evidence.</DialogDescription></DialogHeader>
          <div><Label htmlFor="info-needed">Information needed</Label><Textarea id="info-needed" value={infoNeeded} onChange={(event) => setInfoNeeded(event.target.value)} rows={5} maxLength={5000} /><p className="mt-1 text-xs text-[var(--color-text-secondary)]">10 to 5,000 characters. Do not request information that is unnecessary for identity or case handling.</p></div>
          <DialogFooter><Button variant="outline" onClick={closeDialogs} disabled={isWorking}>Cancel</Button><Button disabled={isWorking || infoNeeded.trim().length < 10} onClick={() => { if (selected && window.confirm(`Request more information for ${selected.id.slice(-8).toUpperCase()}?`)) requestInfoMutation.mutate(); }}>{requestInfoMutation.isPending ? 'Recording…' : 'Record and notify'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogKind === 'reject'} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject data request</DialogTitle><DialogDescription>Rejection is terminal. Record the case-specific factual and approved legal basis.</DialogDescription></DialogHeader>
          <div><Label htmlFor="reject-reason">Rejection reason</Label><Textarea id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={5} maxLength={5000} /><p className="mt-1 text-xs text-[var(--color-text-secondary)]">30 to 5,000 characters. The reason is available through the subject’s request record.</p></div>
          <DialogFooter><Button variant="outline" onClick={closeDialogs} disabled={isWorking}>Cancel</Button><Button variant="destructive" disabled={isWorking || rejectReason.trim().length < 30} onClick={() => { if (selected && window.confirm(`Reject data request ${selected.id.slice(-8).toUpperCase()}?`)) rejectMutation.mutate(); }}>{rejectMutation.isPending ? 'Rejecting…' : 'Reject request'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogKind === 'escalate'} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record an NPC case reference</DialogTitle><DialogDescription>Use this only after the National Privacy Commission has issued a real reference for this request. It does not file or submit anything.</DialogDescription></DialogHeader>
          <div><Label htmlFor="npc-reference">NPC reference</Label><Input id="npc-reference" value={npcReference} onChange={(event) => setNpcReference(event.target.value)} placeholder="Enter the exact reference issued by NPC" maxLength={100} /><p className="mt-1 text-xs text-[var(--color-text-secondary)]">3 to 100 characters. Preserve spacing, prefixes, and punctuation exactly as issued.</p></div>
          <DialogFooter><Button variant="outline" onClick={closeDialogs} disabled={isWorking}>Cancel</Button><Button disabled={isWorking || npcReference.trim().length < 3} onClick={() => { if (selected && window.confirm(`Record NPC reference for ${selected.id.slice(-8).toUpperCase()}?`)) escalateMutation.mutate(); }}>{escalateMutation.isPending ? 'Recording…' : 'Record reference'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaseText({ title, value, empty }: { title: string; value: string | null; empty: string }): React.ReactElement {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text)]">{value?.trim() || empty}</p>
    </section>
  );
}
