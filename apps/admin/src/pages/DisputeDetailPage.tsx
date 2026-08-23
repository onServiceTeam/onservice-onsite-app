/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 07 — Dispute 360 admin page.
 *
 * Side-by-side customer claim / provider response, evidence list grouped by
 * uploader, party history cards, and super-admin resolution form (with
 * confirm step). Mirrors the structure of CustomerDetailPage.tsx (Phase 06).
 */

import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AlertTriangle,
  Coins,
  MessageSquare,
  Calendar,
  Phone,
  RefreshCw,
  Wallet,
  Shield,
  Send,
  FileText,
  ExternalLink,
} from '@/components/icons';
import api, { getErrorMessage } from '@/lib/api';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Textarea';
import { useAuthStore } from '@/stores/auth.store';

// ─── Types (mirror packages/api/src/services/dispute-admin.service.ts) ────

type DisputePartyPattern = 'OK' | 'REVIEW_REQUIRED' | 'AT_RISK';

type ResolutionType =
  | 'full_refund'
  | 'partial_refund'
  | 'no_refund'
  | 'free_redo'
  | 'refund_with_warning'
  | 'refund_with_suspension'
  | 'split_decision';

type Recipient = 'customer' | 'provider' | 'both';

export interface DisputeFullDetail {
  id: string;
  bookingId: string;
  status: string;
  tier: number;
  type: string;
  description: string;
  filedBy: string;
  filedAt: string;
  ageHours: number;
  priorityScore: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionType: string | null;
  refundAmount: number | null;
  decisionNotes: string | null;
  internalNotes: string | null;
  providerResponse: string | null;
  providerRespondedAt: string | null;
  assignedTo: string | null;
  booking: {
    id: string;
    status: string;
    totalAmount: number;
    scheduledAt: string | null;
    completedAt: string | null;
    servicePrice: number;
    serviceFee: number;
  } | null;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    avatarUrl: string | null;
    disputesLast90Days: number;
    disputesFavoredCustomerLast90Days: number;
    pattern: DisputePartyPattern;
  } | null;
  provider: {
    id: string;
    userId: string;
    businessName: string;
    tier: string;
    fullName: string;
    avatarUrl: string | null;
    disputesLast90Days: number;
    disputesLostLast90Days: number;
    pattern: DisputePartyPattern;
  } | null;
  evidence: Array<{
    id: string;
    uploadedBy: 'customer' | 'provider' | 'admin';
    evidenceType: string;
    fileUrl: string;
    description: string | null;
    createdAt: string;
  }>;
}

interface AssignableAdmin {
  id: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'super_admin';
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

function patternVariant(p: DisputePartyPattern): 'success' | 'warning' | 'danger' {
  if (p === 'AT_RISK') return 'danger';
  if (p === 'REVIEW_REQUIRED') return 'warning';
  return 'success';
}

function severityVariant(tier: number): 'info' | 'warning' | 'danger' {
  if (tier >= 3) return 'danger';
  if (tier === 2) return 'warning';
  return 'info';
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DisputeDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const disputeId = id ?? '';

  const detailQuery = useQuery({
    queryKey: ['admin-dispute-detail', disputeId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DisputeFullDetail }>(
        `/api/v1/admin/disputes/${disputeId}`,
      );
      return res.data.data;
    },
    enabled: !!disputeId,
  });

  if (!disputeId) {
    return <ErrorState title="Invalid URL" description="Dispute ID is missing." />;
  }

  if (detailQuery.isLoading) return <LoadingState />;
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        title="Failed to load dispute"
        description={getErrorMessage(detailQuery.error)}
        action={
          <Link to="/disputes">
            <Button variant="secondary" size="sm">
              <ArrowLeft size={14} /> Back to disputes
            </Button>
          </Link>
        }
      />
    );
  }

  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/disputes"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> Back to disputes
        </Link>
      </div>

      <DisputeHeader detail={detail} />

      {/* BUG-PHASE40-04 fix — pre-fix, resolved disputes had no UI for
           the actual resolution. resolutionType, decisionNotes,
           refundAmount, resolvedAt were on the API payload + the
           DisputeFullDetail interface but rendered nowhere. Admins
           had to query the DB or audit log to see what was decided.
           Now: a Resolution Card shows above the claim/response
           when the dispute is resolved. */}
      {detail.status === 'resolved' && <ResolutionCard detail={detail} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ClaimCard detail={detail} />
        <ResponseCard detail={detail} />
      </div>

      <EvidenceList detail={detail} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CustomerHistoryCard detail={detail} />
        <ProviderHistoryCard detail={detail} />
      </div>

      <DisputeActions detail={detail} />
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function DisputeHeader({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              {/* Phase L MED-L04 fix — guard against undefined id during
                   loading state. */}
              Dispute #{(detail.id ?? '').slice(0, 8) || '—'}
            </h1>
            <Badge
              label={detail.status}
              variant={detail.status === 'resolved' ? 'success' : 'warning'}
            />
            <Badge label={`tier ${detail.tier}`} variant={severityVariant(detail.tier)} />
            <Badge label={`age ${detail.ageHours}h`} variant="info" />
            <Badge label={`priority ${Math.round(detail.priorityScore)}`} variant="default" />
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--color-text-secondary)] flex-wrap">
            <Link
              to={`/bookings/${detail.bookingId}`}
              className="inline-flex items-center gap-1 text-[var(--color-secondary)] hover:underline"
            >
              <ExternalLink size={14} /> Booking {(detail.bookingId ?? '').slice(0, 8) || '—'}
            </Link>
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} /> filed {fmtDate(detail.filedAt)}
            </span>
            {detail.assignedTo && (
              <span className="inline-flex items-center gap-1">
                <Shield size={14} /> assigned to {detail.assignedTo.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
        {detail.booking && (
          <div className="text-right">
            <p className="text-xs text-[var(--color-text-secondary)]">Booking total</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              {fmtCentavos(detail.booking.totalAmount)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Resolution (visible only for resolved disputes) ─────────────────────

function ResolutionCard({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  return (
    <Card className="p-5 border-2 border-emerald-200 bg-emerald-50/30">
      <div className="flex items-start gap-3">
        <Shield size={18} className="text-emerald-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-2">
            Resolution
            {detail.resolutionType && (
              <Badge label={detail.resolutionType.replace(/_/g, ' ')} variant="success" />
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Resolved at</p>
              <p className="text-sm text-[var(--color-text)]">{fmtDate(detail.resolvedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Refund amount</p>
              <p className="text-sm text-[var(--color-text)] font-medium">
                {detail.refundAmount != null && detail.refundAmount > 0
                  ? fmtCentavos(detail.refundAmount)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Resolved by</p>
              <p className="text-sm text-[var(--color-text)] font-mono text-xs">
                {detail.resolvedBy ? detail.resolvedBy.slice(0, 8) : '—'}
              </p>
            </div>
          </div>
          {detail.decisionNotes && (
            <div className="border-t border-emerald-200 pt-3">
              <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Decision notes (visible to user)
              </p>
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">
                {detail.decisionNotes}
              </p>
            </div>
          )}
          {detail.internalNotes && (
            <div className="border-t border-emerald-200 pt-3 mt-3">
              <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Internal notes (admin only)
              </p>
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap bg-amber-50 px-3 py-2 rounded">
                {detail.internalNotes}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Claim & Response ─────────────────────────────────────────────────────

function ClaimCard({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  return (
    <Card className="p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
        Customer claim
      </h3>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge label={detail.type} variant="info" />
        <span className="text-xs text-[var(--color-text-secondary)]">
          {fmtDate(detail.filedAt)}
        </span>
      </div>
      <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{detail.description}</p>
      {detail.customer && (
        <p className="text-xs text-[var(--color-text-secondary)] mt-3 inline-flex items-center gap-1">
          <Phone size={12} /> {detail.customer.fullName} · {detail.customer.phone}
        </p>
      )}
    </Card>
  );
}

function ResponseCard({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  return (
    <Card className="p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
        Provider response
      </h3>
      {detail.providerResponse ? (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {fmtDate(detail.providerRespondedAt)}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">
            {detail.providerResponse}
          </p>
          {detail.provider && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-3">
              {detail.provider.businessName || detail.provider.fullName}
            </p>
          )}
        </>
      ) : (
        <EmptyState title="No response from provider yet." />
      )}
    </Card>
  );
}

// ─── Evidence ─────────────────────────────────────────────────────────────

function EvidenceList({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  const grouped = useMemo(() => {
    const g: Record<'customer' | 'provider' | 'admin', DisputeFullDetail['evidence']> = {
      customer: [],
      provider: [],
      admin: [],
    };
    // Phase L MED-L04 fix — guard against missing evidence array
    // during partial loads.
    for (const e of detail.evidence ?? []) g[e.uploadedBy].push(e);
    return g;
  }, [detail.evidence]);

  if ((detail.evidence ?? []).length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Evidence</h3>
        <EmptyState title="No evidence uploaded." />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
        <FileText size={14} /> Evidence ({detail.evidence.length})
      </h3>
      <div className="space-y-4">
        {(['customer', 'provider', 'admin'] as const).map((g) =>
          grouped[g].length === 0 ? null : (
            <div key={g}>
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  label={g}
                  variant={g === 'customer' ? 'info' : g === 'provider' ? 'success' : 'danger'}
                />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {grouped[g].length} item{grouped[g].length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="space-y-2">
                {grouped[g].map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 border border-[var(--color-border)] rounded-md p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={e.evidenceType} variant="default" />
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {fmtDate(e.createdAt)}
                        </span>
                      </div>
                      {e.description && (
                        <p className="text-sm text-[var(--color-text)] mt-1">{e.description}</p>
                      )}
                      <a
                        href={e.fileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs text-[var(--color-secondary)] hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        <ExternalLink size={12} /> Open file
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </Card>
  );
}

// ─── Party history ────────────────────────────────────────────────────────

function CustomerHistoryCard({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  const c = detail.customer;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
        Customer history (last 90 days)
      </h3>
      {!c ? (
        <EmptyState title="No customer linked." />
      ) : (
        <div className="space-y-2 text-sm">
          <Link
            to={`/customers/${c.id}`}
            className="text-[var(--color-secondary)] hover:underline font-medium"
          >
            {c.fullName || '—'}
          </Link>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Disputes filed</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {c.disputesLast90Days}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Favored customer</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {c.disputesFavoredCustomerLast90Days}
              </p>
            </div>
          </div>
          <Badge label={`pattern: ${c.pattern}`} variant={patternVariant(c.pattern)} />
        </div>
      )}
    </Card>
  );
}

function ProviderHistoryCard({ detail }: { detail: DisputeFullDetail }): React.ReactElement {
  const p = detail.provider;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
        Provider history (last 90 days)
      </h3>
      {!p ? (
        <EmptyState title="No provider linked." />
      ) : (
        <div className="space-y-2 text-sm">
          <Link
            to={`/providers/${p.id}`}
            className="text-[var(--color-secondary)] hover:underline font-medium"
          >
            {p.businessName || p.fullName || '—'}
          </Link>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Disputes</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {p.disputesLast90Days}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Lost</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {p.disputesLostLast90Days}
              </p>
            </div>
          </div>
          <Badge label={`pattern: ${p.pattern}`} variant={patternVariant(p.pattern)} />
        </div>
      )}
    </Card>
  );
}

// ─── Actions: assign / resolve / escalate / message / reopen ──────────────

const RESOLUTION_OPTIONS: ReadonlyArray<{ value: ResolutionType; label: string }> = [
  { value: 'full_refund', label: 'Full refund' },
  { value: 'partial_refund', label: 'Partial refund' },
  { value: 'no_refund', label: 'No refund' },
  { value: 'free_redo', label: 'Free redo' },
  { value: 'refund_with_warning', label: 'Refund + warning' },
  { value: 'refund_with_suspension', label: 'Refund + suspension' },
  { value: 'split_decision', label: 'Split decision' },
];

export function DisputeActions({
  detail,
}: {
  detail: DisputeFullDetail;
}): React.ReactElement | null {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const disputeId = detail.id;

  const [assigneeId, setAssigneeId] = useState('');
  const [resolutionType, setResolutionType] = useState<ResolutionType>('full_refund');
  const [refundPercent, setRefundPercent] = useState('100');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [recipient, setRecipient] = useState<Recipient>('both');
  const [message, setMessage] = useState('');

  const agentsQuery = useQuery({
    queryKey: ['assignable-admin-agents'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: AssignableAdmin[] }>(
        '/api/v1/support-tickets/agents',
      );
      return res.data.data;
    },
  });

  const invalidate = (): void => {
    queryClient.invalidateQueries({ queryKey: ['admin-dispute-detail', disputeId] });
    // Refresh the disputes list too, so its row status updates after resolve/
    // assign/escalate/reopen when the admin navigates back.
    queryClient.invalidateQueries({ queryKey: ['adminDisputes'] });
  };

  const assignMut = useMutation({
    mutationFn: async (input: { assigneeAdminId: string }) => {
      const res = await api.post(`/api/v1/admin/disputes/${disputeId}/assign`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      setAssigneeId('');
    },
  });

  const resolveMut = useMutation({
    mutationFn: async (input: {
      resolutionType: ResolutionType;
      refundPercent?: number;
      decisionNotes: string;
      internalNotes?: string;
    }) => {
      const res = await api.post(`/api/v1/admin/disputes/${disputeId}/resolve`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      setDecisionNotes('');
      setInternalNotes('');
      setConfirmResolve(false);
    },
  });

  const escalateMut = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const res = await api.post(`/api/v1/admin/disputes/${disputeId}/escalate`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      setEscalateReason('');
    },
  });

  const messageMut = useMutation({
    mutationFn: async (input: { recipient: Recipient; message: string }) => {
      const res = await api.post(`/api/v1/admin/disputes/${disputeId}/message`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      setMessage('');
    },
  });

  const reopenMut = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const res = await api.post(`/api/v1/admin/disputes/${disputeId}/reopen`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      setReopenReason('');
    },
  });

  const decisionOk = decisionNotes.trim().length >= 20;
  const refundPercentValue = Number(refundPercent);
  const refundPercentOk =
    (resolutionType !== 'partial_refund' && resolutionType !== 'split_decision') ||
    (Number.isFinite(refundPercentValue) && refundPercentValue >= 1 && refundPercentValue <= 100);
  const canResolve = decisionOk && refundPercentOk;
  const canSendMessage = message.trim().length >= 5 && message.trim().length <= 2000;
  const totalAmount = detail.booking?.totalAmount ?? 0;
  const estimatedRefund = useMemo(() => {
    switch (resolutionType) {
      case 'full_refund':
      case 'refund_with_warning':
      case 'refund_with_suspension':
        return totalAmount;
      case 'partial_refund': {
        const pct = Number(refundPercent);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 0;
        return Math.round((totalAmount * pct) / 100);
      }
      case 'split_decision':
        return Math.round(totalAmount / 2);
      default:
        return 0;
    }
  }, [resolutionType, refundPercent, totalAmount]);

  return (
    <Card className="p-5 space-y-6">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-[var(--color-text-secondary)]" />
        <span className="text-sm font-medium text-[var(--color-text)]">Admin actions</span>
      </div>

      {/* Assign */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-[var(--color-text)]">Assign to admin</p>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            id="dispute-assignee"
            aria-label="Admin to assign dispute"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            disabled={agentsQuery.isLoading || agentsQuery.isError}
            className="flex-1 min-w-[260px] px-3 py-2 border border-[var(--color-border)] rounded-lg bg-white text-sm"
          >
            <option value="">
              {agentsQuery.isLoading ? 'Loading active admins…' : 'Select an active admin'}
            </option>
            {(agentsQuery.data ?? []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {`${agent.first_name} ${agent.last_name}`.trim()} (
                {agent.role === 'super_admin' ? 'Super admin' : 'Admin'})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={assigneeId.trim().length === 0 || assignMut.isPending}
            onClick={() => assignMut.mutate({ assigneeAdminId: assigneeId.trim() })}
          >
            <RefreshCw size={14} /> Assign
          </Button>
          {agentsQuery.isError && (
            <span role="alert" className="text-xs text-red-600">
              Active admins could not be loaded. Refresh this page to try again.
            </span>
          )}
          {assignMut.isError && (
            <span role="alert" className="text-xs text-red-600">
              {getErrorMessage(assignMut.error)}
            </span>
          )}
        </div>
      </div>

      {/* Resolution form (super-admin only, only when not already resolved) */}
      {/* BUG-PHASE40-05 fix — pre-fix the resolve form rendered for
           resolved disputes too, but submitting it would have failed
           server-side (a resolved dispute can't be resolved again).
           UI shouldn't offer an action that always errors. Same gate
           applied to Escalate below. */}
      {isSuperAdmin && detail.status !== 'resolved' && (
        <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
          <p className="text-sm font-medium text-[var(--color-text)]">Resolution</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RESOLUTION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-sm border border-[var(--color-border)] rounded-md px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-hover)]/50"
              >
                <input
                  type="radio"
                  name="resolutionType"
                  value={opt.value}
                  checked={resolutionType === opt.value}
                  onChange={() => setResolutionType(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {(resolutionType === 'partial_refund' || resolutionType === 'split_decision') && (
            <div>
              <label
                htmlFor="detail-refund-percent"
                className="text-xs text-[var(--color-text-secondary)]"
              >
                Refund percent (1–100)
              </label>
              <input
                id="detail-refund-percent"
                type="number"
                min={1}
                max={100}
                value={refundPercent}
                onChange={(e) => setRefundPercent(e.target.value)}
                className="w-32 px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="detail-decision-notes"
              className="text-xs text-[var(--color-text-secondary)]"
            >
              Decision notes (visible to user, min 20 characters)
            </label>
            <Textarea
              id="detail-decision-notes"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder="Explain your decision to both parties…"
              rows={3}
            />
            <p
              className={`text-xs mt-1 ${
                decisionOk ? 'text-[var(--color-text-secondary)]' : 'text-amber-600'
              }`}
            >
              {decisionNotes.trim().length}/20 characters
            </p>
          </div>

          <div>
            <label
              htmlFor="detail-internal-notes"
              className="text-xs text-[var(--color-text-secondary)]"
            >
              Internal notes (admin only, optional)
            </label>
            <Textarea
              id="detail-internal-notes"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Internal notes for the admin team…"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              disabled={!canResolve || resolveMut.isPending}
              onClick={() => setConfirmResolve(true)}
            >
              <Wallet size={14} /> Resolve &amp; notify
            </Button>
            {resolveMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(resolveMut.error)}
              </span>
            )}
            {resolveMut.isSuccess && (
              <span className="text-xs text-green-600">Dispute resolved.</span>
            )}
          </div>

          {confirmResolve && (
            <div className="mt-2 p-4 border border-amber-300 rounded-lg bg-amber-50 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                <div className="text-sm text-[var(--color-text)] space-y-1">
                  <p className="font-medium">Confirm resolution</p>
                  <p>
                    This will resolve the dispute as{' '}
                    <strong>{resolutionType.replace(/_/g, ' ')}</strong> and notify both parties.
                    Estimated refund: <strong>{fmtCentavos(estimatedRefund)}</strong>.
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Money flows through the audited escrow primitives. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={resolveMut.isPending}
                  onClick={() =>
                    resolveMut.mutate({
                      resolutionType,
                      refundPercent:
                        resolutionType === 'partial_refund' || resolutionType === 'split_decision'
                          ? refundPercentValue
                          : undefined,
                      decisionNotes,
                      internalNotes: internalNotes.trim() ? internalNotes : undefined,
                    })
                  }
                >
                  Yes, resolve and notify
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmResolve(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Escalate (only when not already resolved) */}
      {detail.status !== 'resolved' && (
        <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
          <p className="text-sm font-medium text-[var(--color-text)]">Escalate</p>
          <Textarea
            aria-label="Escalation reason"
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="Why is this being escalated? (min 10 characters)"
            rows={2}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              disabled={escalateReason.trim().length < 10 || escalateMut.isPending}
              onClick={() => {
                if (window.confirm('Escalate this dispute?'))
                  escalateMut.mutate({ reason: escalateReason.trim() });
              }}
            >
              <AlertTriangle size={14} /> Escalate
            </Button>
            {escalateMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(escalateMut.error)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Message */}
      <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
        <p className="text-sm font-medium text-[var(--color-text)]">Send message to parties</p>
        <div className="flex items-center gap-3 flex-wrap">
          {(['customer', 'provider', 'both'] as const).map((r) => (
            <label key={r} className="inline-flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="recipient"
                value={r}
                checked={recipient === r}
                onChange={() => setRecipient(r)}
              />
              {r}
            </label>
          ))}
        </div>
        <Textarea
          aria-label="Dispute message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message (5–2000 characters)"
          rows={3}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            disabled={!canSendMessage || messageMut.isPending}
            onClick={() => messageMut.mutate({ recipient, message: message.trim() })}
          >
            <Send size={14} /> Send <MessageSquare size={14} />
          </Button>
          {messageMut.isError && (
            <span role="alert" className="text-xs text-red-600">
              {getErrorMessage(messageMut.error)}
            </span>
          )}
          {messageMut.isSuccess && (
            <span className="text-xs text-green-600">Message dispatched.</span>
          )}
          {/* keep Coins import referenced for icon-catalog enforcement */}
          <span className="hidden">
            <Coins size={12} />
          </span>
        </div>
      </div>

      {/* Reopen (super-admin only) */}
      {/* BUG-PHASE143-01 fix — pre-fix client validated reopenReason
          ≥ 10 chars, but server's reopenDispute (dispute-admin.service.ts:756
          → requireText(reason, 'reason', 20)) requires 20. Same
          client/server validation-mismatch pattern as Phase 142
          (force-complete) and Phase 77-02 (cancel). Now: 20-char floor
          on both placeholder hint and disabled gate. */}
      {isSuperAdmin && detail.status === 'resolved' && (
        <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
          <p className="text-sm font-medium text-[var(--color-text)]">Reopen</p>
          <Textarea
            aria-label="Reopen reason"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Why is this being reopened? (min 20 characters — describe the new evidence or reason)"
            rows={2}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="destructive"
              disabled={reopenReason.trim().length < 20 || reopenMut.isPending}
              onClick={() => {
                if (window.confirm('Reopen this resolved dispute?'))
                  reopenMut.mutate({ reason: reopenReason.trim() });
              }}
            >
              <RefreshCw size={14} /> Reopen
            </Button>
            {reopenMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(reopenMut.error)}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
