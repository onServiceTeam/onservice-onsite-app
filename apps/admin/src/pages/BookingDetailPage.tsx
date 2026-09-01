/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 07 — Booking 360 admin page.
 *
 * 5 tabs: Overview, Timeline, Evidence, Money, Audit.
 * Provides super-admin actions: manual escrow release, refund, reassign,
 * cancel, force-complete. Mirrors the structure of CustomerDetailPage.tsx
 * (Phase 06).
 */

import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AlertTriangle,
  Coins,
  MessageSquare,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Star,
  RefreshCw,
  Wallet,
  ImageIcon,
  Navigation,
  Receipt,
  FileText,
  Shield,
  CheckCircle2,
  Clock,
  ClipboardList,
  User,
  Info,
} from '@/components/icons';
import api, { getErrorMessage } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import { Textarea } from '@/components/ui/Textarea';
import { useConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from 'sonner';

// ─── Types (mirror packages/api/src/services/booking-admin.service.ts) ────

export interface BookingDetail {
  id: string;
  status: string;
  escrowStatus: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  pricingMode: string | null;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  conversationId: string | null;
  category: { id: string; name: string } | null;
  subcategory: { id: string; name: string } | null;
  address: { full: string; barangay: string; city: string; province: string } | null;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    avatarUrl: string | null;
    lifetimeBookings: number;
    averageRatingGiven: number | null;
  } | null;
  provider: {
    id: string;
    userId: string;
    businessName: string;
    tier: string;
    fullName: string;
    phone: string;
    avatarUrl: string | null;
    rating: number | null;
    lifetimeJobs: number;
  } | null;
  createdAt: string;
}

interface TimelineEvent {
  at: string;
  type: string;
  description: string;
  actor: { kind: 'system' | 'user' | 'admin'; id: string | null; name: string | null };
  meta?: Record<string, unknown>;
}

interface BookingProofSummary {
  booking: {
    id: string;
    status: string;
    bookingType: string;
    description: string;
    categoryName: string | null;
    subcategoryName: string | null;
    scheduledAt: string | null;
    workStartedAt: string | null;
    workCompletedAt: string | null;
    completedAt: string | null;
    confirmedAt: string | null;
    completionNotes: string | null;
  };
  scope: {
    acceptedQuote: null | {
      id: string;
      description: string;
      notes: string;
      quotedPrice: number;
      acceptedAt: string;
      lineItems: Array<{
        id: string;
        description: string;
        itemType: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        lineTotal: number;
      }>;
    };
  };
  readiness: {
    stage: string;
    readyForProviderCompletion: boolean;
    minimumTimeOnSiteMinutes: number;
    afterPhotosRequired: number;
    blockers: Array<{ code: string; message: string }>;
    qualityFlags: Array<{ code: string; message: string }>;
  };
  checklist: null | {
    id: string;
    templateVersion: number;
    shownAt: string;
    totalItems: number;
    requiredItems: number;
    completedRequiredItems: number;
    complete: boolean;
    items: Array<{
      id: string;
      sectionTitle: string | null;
      title: string;
      description: string | null;
      required: boolean;
      photoRequired: boolean;
      completed: boolean;
      completedAt: string | null;
      photoId: string | null;
      notes: string | null;
    }>;
  };
  photos: Array<{
    id: string;
    url: string;
    photoType: string;
    uploadedByUserId: string;
    uploadedByRole: 'customer' | 'provider' | 'admin' | 'unknown';
    uploaderName: string | null;
    uploadedAt: string;
    source: 'legacy' | 'canonical';
    mimeType: string | null;
    originalSizeBytes: number | null;
    storedSizeBytes: number | null;
  }>;
  photoCounts: Record<string, number>;
  signatures: {
    identityCaveat: string;
    records: Array<{
      id: string;
      signatureType: string;
      signedByUserId: string;
      signedByRole: 'customer' | 'provider' | 'admin' | 'unknown';
      signerName: string | null;
      fullNameTyped: string | null;
      signedAt: string;
      url: string;
      attribution: string;
    }>;
  };
  changeOrders: Array<{
    id: string;
    description: string;
    additionalAmount: number;
    status: string;
    photos: string[];
    customerRespondedAt: string | null;
    createdAt: string;
  }>;
  communications: {
    chatMessageCount: number;
    supportTickets: Array<{
      id: string;
      ticketNumber: string;
      subject: string;
      status: string;
      priority: string;
      createdAt: string;
    }>;
  };
  dispute: null | {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  };
  unavailable: Array<{ key: string; label: string; reason: string }>;
}

interface BookingDispute {
  id: string;
  status: string;
  tier: number;
  type: string;
  description: string;
  filedAt: string;
  filedBy: string;
  providerResponse: string | null;
  providerRespondedAt: string | null;
  resolutionType: string | null;
  refundAmount: number | null;
  resolvedAt: string | null;
}

interface BookingMoney {
  paymentIntents: Array<{
    id: string;
    gatewayIntentId: string | null;
    gatewayPaymentId: string | null;
    amount: number;
    refundedAmount: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  ledgerEntries: Array<{
    id: string;
    walletType: string;
    walletUserId: string | null;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId: string | null;
    createdAt: string;
  }>;
  salesRecords: Array<{
    id: string;
    number: string;
    grossAmount: number;
    providerReceived: number;
    platformRetained: number;
    isCancellation: boolean;
    cancelledAt: string | null;
    pdfUrl: string | null;
    issuedAt: string;
  }>;
}

interface RefundSupportCase {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
}

interface AssignableProvider {
  id: string;
  businessName: string | null;
  city: string | null;
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

function statusVariant(
  status: string | undefined | null,
): 'success' | 'danger' | 'info' | 'warning' {
  // Phase L MED-L04 fix — guard against undefined/null status; loading
  // state used to throw on .startsWith.
  if (!status) return 'info';
  if (status.startsWith('cancelled')) return 'danger';
  if (status === 'confirmed' || status === 'paid_out') return 'success';
  if (status === 'disputed') return 'warning';
  return 'info';
}

type TabId = 'overview' | 'timeline' | 'evidence' | 'quotes' | 'money' | 'audit';

// ─── Page ─────────────────────────────────────────────────────────────────

export default function BookingDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const bookingId = id ?? '';
  const [tab, setTab] = useState<TabId>('overview');

  const detailQuery = useQuery({
    queryKey: ['admin-booking-detail', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BookingDetail }>(
        `/api/v1/admin/bookings/${bookingId}`,
      );
      return res.data.data;
    },
    enabled: !!bookingId,
  });

  if (!bookingId) {
    return <ErrorState title="Invalid URL" description="Booking ID is missing." />;
  }

  if (detailQuery.isLoading) return <LoadingState />;
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        title="Failed to load booking"
        description={getErrorMessage(detailQuery.error)}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => void detailQuery.refetch()}>
              <RefreshCw size={14} /> Retry booking
            </Button>
            <Link to="/bookings">
              <Button variant="secondary" size="sm">
                <ArrowLeft size={14} /> Back to bookings
              </Button>
            </Link>
          </div>
        }
      />
    );
  }

  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/bookings"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> Back to bookings
        </Link>
      </div>

      <BookingHeader detail={detail} />

      <BookingActions
        bookingId={bookingId}
        customerId={detail.customer?.id ?? null}
        customerName={detail.customer?.fullName ?? null}
        currentProviderId={detail.provider?.id ?? null}
        bookingStatus={detail.status}
        escrowStatus={detail.escrowStatus}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <div className="overflow-x-auto pb-1" aria-label="Booking record sections">
          <TabsList className="!h-12 min-w-max">
            <TabsTrigger className="!h-10" value="overview">Overview</TabsTrigger>
            <TabsTrigger className="!h-10" value="timeline">Timeline</TabsTrigger>
            <TabsTrigger className="!h-10" value="evidence">Evidence</TabsTrigger>
            <TabsTrigger className="!h-10" value="quotes">Quotes</TabsTrigger>
            <TabsTrigger className="!h-10" value="money">Money</TabsTrigger>
            <TabsTrigger className="!h-10" value="audit">Audit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab detail={detail} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab bookingId={bookingId} />
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceTab bookingId={bookingId} />
        </TabsContent>
        <TabsContent value="quotes">
          <QuotesTab bookingId={bookingId} />
        </TabsContent>
        <TabsContent value="money">
          <MoneyTab bookingId={bookingId} detail={detail} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab bookingId={bookingId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function BookingHeader({ detail }: { detail: BookingDetail }): React.ReactElement {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              {/* Phase L MED-L04 fix — guard against undefined id so a
                   loading-state render doesn't throw on .slice. */}
              Booking #{(detail.id ?? '').slice(0, 8) || '—'}
            </h1>
            <Badge label={detail.status} variant={statusVariant(detail.status)} />
            {detail.escrowStatus && (
              <Badge label={`escrow: ${detail.escrowStatus}`} variant="info" />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--color-text-secondary)] flex-wrap">
            {detail.category && (
              <span className="inline-flex items-center gap-1">
                <FileText size={14} /> {detail.category.name}
                {detail.subcategory ? ` / ${detail.subcategory.name}` : ''}
              </span>
            )}
            {detail.pricingMode && (
              <span className="inline-flex items-center gap-1">
                <Coins size={14} /> {detail.pricingMode}
              </span>
            )}
            {detail.scheduledAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} /> {fmtDate(detail.scheduledAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 text-right">
          <p className="text-xs text-[var(--color-text-secondary)]">Total</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">
            {fmtCentavos(detail.totalAmount)}
          </p>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              to={`/communications?bookingId=${encodeURIComponent(detail.id)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-primary)]"
            >
              <MessageSquare size={14} /> {detail.conversationId ? 'Open conversation' : 'Find conversation'}
            </Link>
            <Link
              to={`/support-tickets?bookingId=${encodeURIComponent(detail.id)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-primary)]"
            >
              <MessageSquare size={14} /> Support cases
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Action panel (super-admin only) ──────────────────────────────────────

type ActionId = 'release' | 'refund' | 'reassign' | 'cancel' | 'force_complete';

function createRefundIdempotencyKey(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function BookingActions({
  bookingId,
  customerId = null,
  customerName = null,
  currentProviderId = null,
  bookingStatus = 'requested',
  escrowStatus = 'held',
}: {
  bookingId: string;
  customerId?: string | null;
  customerName?: string | null;
  currentProviderId?: string | null;
  bookingStatus?: string;
  escrowStatus?: string | null;
}): React.ReactElement | null {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [open, setOpen] = useState<ActionId | null>(null);

  const [reason, setReason] = useState('');
  const [amountPesos, setAmountPesos] = useState('');
  const [providerId, setProviderId] = useState('');
  const [providerSearch, setProviderSearch] = useState('');
  const [hoursUntilScheduled, setHoursUntilScheduled] = useState('');
  const [providerArrived, setProviderArrived] = useState(false);
  const [customerNoShow, setCustomerNoShow] = useState(false);
  const [refundSupportTicketId, setRefundSupportTicketId] = useState('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState('');

  const providersQuery = useQuery({
    queryKey: ['admin-online-providers', 'booking-reassign', providerSearch.trim()],
    queryFn: async () => {
      const search = providerSearch.trim();
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const res = await api.get<{ rows?: AssignableProvider[]; data?: AssignableProvider[] }>(
        `/api/v1/admin/providers?online=true&pageSize=100${searchParam}`,
      );
      return res.data.rows ?? res.data.data ?? [];
    },
    enabled: open === 'reassign',
  });

  const refundCasesQuery = useQuery({
    queryKey: ['admin-booking-refund-support-cases', bookingId],
    queryFn: async () => {
      const params = new URLSearchParams({ bookingId, active: '1', page: '1', limit: '100' });
      const res = await api.get<{ data: RefundSupportCase[] }>(`/api/v1/support-tickets?${params}`);
      return res.data.data;
    },
    enabled: open === 'refund',
  });

  const invalidateAll = (): void => {
    queryClient.invalidateQueries({ queryKey: ['admin-booking-detail', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-timeline', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-dispute', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-evidence', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-money', bookingId] });
    // Also refresh the bookings list so its row reflects the action when the
    // admin navigates back (was stale until a manual refetch).
    queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
  };

  const reset = (): void => {
    setReason('');
    setAmountPesos('');
    setProviderId('');
    setProviderSearch('');
    setHoursUntilScheduled('');
    setProviderArrived(false);
    setCustomerNoShow(false);
    setRefundSupportTicketId('');
    setRefundIdempotencyKey('');
    setOpen(null);
  };

  const releaseMut = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/escrow/release`, input);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Escrow released.');
      invalidateAll();
      reset();
    },
  });

  const refundMut = useMutation({
    mutationFn: async (input: {
      amount: number;
      reason: string;
      supportTicketId: string;
      idempotencyKey: string;
    }) => {
      const res = await api.post<{
        success: true;
        data: {
          customerWalletCredited: boolean;
          idempotentReplay: boolean;
          paymentProcessingQueued: boolean;
          paymentProcessingStatus: 'processed' | 'queued' | 'manual_attention';
        };
      }>(`/api/v1/admin/bookings/${bookingId}/escrow/refund`, input);
      return res.data.data;
    },
    onSuccess: (outcome) => {
      if (outcome.paymentProcessingStatus === 'manual_attention') {
        toast.error('Refund recorded, but payment processing requires manual attention. No second refund was issued.');
      } else if (outcome.idempotentReplay && outcome.paymentProcessingStatus === 'queued') {
        toast.success('This refund was already recorded and its payment processing is still queued. No second refund was issued.');
      } else if (outcome.idempotentReplay) {
        toast.success('This refund request was already recorded. No second refund was issued.');
      } else if (outcome.paymentProcessingQueued) {
        toast.success('Refund recorded. Payment processing was queued for retry.');
      } else if (outcome.customerWalletCredited) {
        toast.success('Refund recorded and returned to the customer wallet.');
      } else {
        toast.success('Refund recorded and payment refund processed.');
      }
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['admin-booking-refund-support-cases', bookingId] });
      reset();
    },
  });

  const reassignMut = useMutation({
    mutationFn: async (input: { newProviderId: string; reason: string }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/reassign`, input);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Booking reassigned.');
      invalidateAll();
      reset();
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (input: {
      reason: string;
      hoursUntilScheduled?: number;
      providerArrived?: boolean;
      customerNoShow?: boolean;
    }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/cancel`, input);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Booking cancelled.');
      invalidateAll();
      reset();
    },
  });

  const forceMut = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/force-complete`, input);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Booking force-completed.');
      invalidateAll();
      reset();
    },
  });

  if (!isSuperAdmin) return null;

  // BUG-PHASE142-01 fix — pre-fix `reasonOk = reason.trim().length >= 10`
  // was used to gate ALL five super-admin actions (release / refund /
  // reassign / cancel / force-complete). But the server's force-complete
  // validator (booking-admin.service.ts:984 → requireReason(reason, 20))
  // requires 20 chars. So an admin typing a 10-19 char reason on the
  // force-complete dialog passed the client check, hit the server, and
  // got a generic 400 with no clear message of "you need 20 chars".
  // Same pattern as BUG-PHASE77-02 (cancel was 5/10 client/server).
  // Now: separate gate for force-complete that matches the server's
  // 20-char floor.
  const reasonOk = reason.trim().length >= 10;
  const reasonOkForce = reason.trim().length >= 20;
  const assignableProviders = (providersQuery.data ?? []).filter(
    (provider) => provider.id !== currentProviderId,
  );
  const providerIdOk = assignableProviders.some((provider) => provider.id === providerId);
  const anyActionPending =
    releaseMut.isPending ||
    refundMut.isPending ||
    reassignMut.isPending ||
    cancelMut.isPending ||
    forceMut.isPending;
  const escrowActionAllowed = escrowStatus === 'held' || escrowStatus === 'partially_refunded';
  const refundAllowed = escrowStatus === 'held' || escrowStatus === 'partially_refunded';
  const reassignAllowed = !new Set([
    'provider_arrived',
    'in_progress',
    'completed_by_provider',
    'confirmed',
    'disputed',
    'resolved',
    'cancelled_by_customer',
    'cancelled_by_provider',
    'cancelled_by_admin',
    'paid_out',
    'payout_ready',
  ]).has(bookingStatus);
  const cancelAllowed = new Set([
    'requested',
    'quoted',
    'matched',
    'payment_pending',
    'paid',
    'provider_en_route',
    'provider_arrived',
    'in_progress',
    'resolved',
  ]).has(bookingStatus);
  const forceCompleteAllowed = bookingStatus === 'in_progress' || bookingStatus === 'completed_by_provider';
  const refundAmtCentavos = (() => {
    const n = parseFloat(amountPesos);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  const cancelHours = (() => {
    if (!hoursUntilScheduled) return undefined;
    const n = Number(hoursUntilScheduled);
    return Number.isFinite(n) ? n : undefined;
  })();
  const cancelInputsOk = reasonOk && cancelHours !== undefined;
  const createSupportCasePath = (() => {
    const params = new URLSearchParams({ bookingId });
    if (customerId) {
      params.set('userId', customerId);
      params.set('userName', customerName?.trim() || 'Customer account');
      params.set('userRole', 'customer');
      params.set('new', '1');
    }
    return `/support-tickets?${params.toString()}`;
  })();

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Shield size={14} className="text-[var(--color-text-secondary)]" />
        <span className="text-sm font-medium text-[var(--color-text)]">Super-admin actions</span>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Button
            size="sm"
            variant={open === 'release' ? 'default' : 'secondary'}
            disabled={anyActionPending || !escrowActionAllowed}
            title={escrowActionAllowed ? undefined : 'Available only while booking escrow remains held'}
            onClick={() => setOpen(open === 'release' ? null : 'release')}
          >
            <Wallet size={14} /> Manual release
          </Button>
          <Button
            size="sm"
            variant={open === 'refund' ? 'default' : 'secondary'}
            disabled={anyActionPending || !refundAllowed}
            title={refundAllowed ? undefined : 'Available only while booking escrow remains held'}
            onClick={() => {
              const nextOpen = open === 'refund' ? null : 'refund';
              setOpen(nextOpen);
              setRefundSupportTicketId('');
              setRefundIdempotencyKey(nextOpen === 'refund' ? createRefundIdempotencyKey() : '');
            }}
          >
            <Coins size={14} /> Refund
          </Button>
          <Button
            size="sm"
            variant={open === 'reassign' ? 'default' : 'secondary'}
            disabled={anyActionPending || !reassignAllowed}
            title={reassignAllowed ? undefined : `Reassignment is not valid in status ${bookingStatus}`}
            onClick={() => setOpen(open === 'reassign' ? null : 'reassign')}
          >
            <RefreshCw size={14} /> Reassign
          </Button>
          <Button
            size="sm"
            variant={open === 'cancel' ? 'destructive' : 'secondary'}
            disabled={anyActionPending || !cancelAllowed}
            title={cancelAllowed ? undefined : `Cancellation is not valid in status ${bookingStatus}`}
            onClick={() => setOpen(open === 'cancel' ? null : 'cancel')}
          >
            <AlertTriangle size={14} /> Cancel
          </Button>
          <Button
            size="sm"
            variant={open === 'force_complete' ? 'default' : 'secondary'}
            disabled={anyActionPending || !forceCompleteAllowed}
            title={forceCompleteAllowed ? undefined : 'Available only for in-progress or provider-completed work'}
            onClick={() => setOpen(open === 'force_complete' ? null : 'force_complete')}
          >
            Force complete
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
        Actions are limited by booking status <strong>{bookingStatus}</strong> and escrow status <strong>{escrowStatus ?? 'none'}</strong>. Completed money states use dispute or settlement workflows instead of cancellation.
      </p>

      {open && (
        <div className="mt-4 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-hover)]/50 space-y-3">
          <p className="text-sm font-medium text-[var(--color-text)]">
            {open === 'release' && 'Manual escrow release'}
            {open === 'refund' && 'Refund from escrow'}
            {open === 'reassign' && 'Reassign provider'}
            {open === 'cancel' && 'Cancel booking'}
            {open === 'force_complete' && 'Force-complete booking'}
          </p>

          {open === 'refund' && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="booking-refund-amount"
                  className="text-xs text-[var(--color-text-secondary)]"
                >
                  Refund amount (PHP)
                </label>
                <input
                  id="booking-refund-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountPesos}
                  onChange={(e) => setAmountPesos(e.target.value)}
                  placeholder="100.00"
                  disabled={anyActionPending}
                  className="min-h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                />
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  The server caps this against this booking's own remaining escrow, not the platform's shared wallet balance.
                </p>
              </div>
              <div>
                <label htmlFor="booking-refund-support-case" className="text-xs text-[var(--color-text-secondary)]">
                  Active linked support case (required)
                </label>
                <select
                  id="booking-refund-support-case"
                  value={refundSupportTicketId}
                  onChange={(event) => setRefundSupportTicketId(event.target.value)}
                  disabled={refundCasesQuery.isLoading || refundCasesQuery.isError || anyActionPending}
                  className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm"
                >
                  <option value="">
                    {refundCasesQuery.isLoading ? 'Loading support cases...' : 'Select the case authorizing this refund'}
                  </option>
                  {(refundCasesQuery.data ?? []).map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      {ticket.ticket_number} · {ticket.subject}
                    </option>
                  ))}
                </select>
                {refundCasesQuery.isError && <p role="alert" className="mt-1 text-xs text-red-600">Support cases could not be loaded. Refund is blocked.</p>}
                {!refundCasesQuery.isLoading && !refundCasesQuery.isError && (refundCasesQuery.data ?? []).length === 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    No active case is linked.{' '}
                    <Link to={createSupportCasePath} className="font-semibold underline">
                      {customerId ? 'Create a customer support case first' : 'Open the support queue'}
                    </Link>.
                  </p>
                )}
              </div>
            </div>
          )}

          {open === 'reassign' && (
            <div className="space-y-2">
              <div>
                <label
                  htmlFor="booking-reassign-provider-search"
                  className="text-xs text-[var(--color-text-secondary)]"
                >
                  Search accepting-work providers
                </label>
                <input
                  id="booking-reassign-provider-search"
                  type="search"
                  value={providerSearch}
                  onChange={(event) => {
                    setProviderSearch(event.target.value);
                    setProviderId('');
                  }}
                  placeholder="Business name, phone, or email"
                  disabled={anyActionPending}
                  className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm"
                />
              </div>
              <label
                htmlFor="booking-reassign-provider"
                className="text-xs text-[var(--color-text-secondary)]"
              >
                New accepting-work provider
              </label>
              <select
                id="booking-reassign-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                aria-label="New accepting-work provider"
                disabled={providersQuery.isLoading || providersQuery.isError}
                className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm"
              >
                <option value="">
                  {providersQuery.isLoading
                    ? 'Loading accepting-work providers...'
                    : providerSearch.trim()
                      ? 'Choose from matching accepting-work providers'
                      : 'Choose an accepting-work provider'}
                </option>
                {assignableProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.businessName ?? 'Unnamed provider'}
                    {provider.city ? ` · ${provider.city}` : ''}
                  </option>
                ))}
              </select>
              {providersQuery.isError && (
                <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-error)]">
                  <span>Accepting-work providers could not be loaded. No replacement can be selected until this feed recovers.</span>
                  <Button size="sm" variant="secondary" onClick={() => void providersQuery.refetch()}>
                    <RefreshCw size={14} /> Retry providers
                  </Button>
                </div>
              )}
              {!providersQuery.isLoading && !providersQuery.isError && assignableProviders.length === 0 && (
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  No alternative accepting-work provider is available. The currently assigned provider is excluded.
                </p>
              )}
              {!providersQuery.isError && (
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  The server rechecks account approval, accepting-work status, service capability, service radius, and double-booking conflicts when the job is scheduled.
                </p>
              )}
            </div>
          )}

          {open === 'cancel' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="booking-cancel-hours"
                  className="text-xs text-[var(--color-text-secondary)]"
                >
                  Hours until scheduled (required)
                </label>
                <input
                  id="booking-cancel-hours"
                  type="number"
                  step="0.5"
                  value={hoursUntilScheduled}
                  onChange={(e) => setHoursUntilScheduled(e.target.value)}
                  required
                  disabled={anyActionPending}
                  className="min-h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-5">
                <input
                  type="checkbox"
                  checked={providerArrived}
                  onChange={(e) => setProviderArrived(e.target.checked)}
                  disabled={anyActionPending}
                />
                Provider arrived
              </label>
              <label className="flex items-center gap-2 text-sm pt-5">
                <input
                  type="checkbox"
                  checked={customerNoShow}
                  onChange={(e) => setCustomerNoShow(e.target.checked)}
                  disabled={anyActionPending}
                />
                Customer no-show
              </label>
              <p className="sm:col-span-3 text-xs text-[var(--color-text-secondary)]">
                These three values directly affect the live refund split. Enter the schedule difference from the case record and mark arrival or no-show only when the evidence supports it.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--color-text-secondary)]">
              {open === 'force_complete'
                ? 'Reason (min 20 characters — force-complete is a heavy action; describe the customer-confirmation gap clearly)'
                : 'Reason (min 10 characters) — recorded in admin_actions ledger'}
            </label>
            <Textarea
              aria-label="Booking action reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={anyActionPending}
              placeholder={
                open === 'force_complete'
                  ? 'e.g., Customer unreachable for 4 days; provider photo evidence verified by support agent — auto-confirming.'
                  : 'Why is this action being taken?'
              }
              rows={3}
              maxLength={5000}
            />
            <p className="mt-1 text-right text-xs text-[var(--color-text-secondary)]">
              {reason.length}/5000
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {open === 'release' && (
              <Button
                size="sm"
                disabled={!reasonOk || releaseMut.isPending}
                onClick={() => {
                  void confirm({
                    title: 'Release held escrow?',
                    description: 'This moves the booking funds to the provider and platform wallets. The recorded reason will remain in the booking audit trail.',
                    confirmLabel: 'Release escrow',
                    tone: 'destructive',
                  }).then((approved) => { if (approved) releaseMut.mutate({ reason: reason.trim() }); });
                }}
              >
                Confirm release
              </Button>
            )}
            {open === 'refund' && (
              <Button
                size="sm"
                disabled={!reasonOk || refundAmtCentavos === 0 || !refundSupportTicketId || !refundIdempotencyKey || refundMut.isPending}
                onClick={() => {
                  void confirm({
                    title: `Refund ${fmtCentavos(refundAmtCentavos)}?`,
                    description: 'This debits only this booking’s remaining escrow, records the decision in the selected support case, and returns wallet-funded payments to the customer wallet. Verify the amount and evidence before continuing.',
                    confirmLabel: 'Issue refund',
                    tone: 'destructive',
                  }).then((approved) => {
                    if (approved) refundMut.mutate({
                      amount: refundAmtCentavos,
                      reason: reason.trim(),
                      supportTicketId: refundSupportTicketId,
                      idempotencyKey: refundIdempotencyKey,
                    });
                  });
                }}
              >
                Confirm refund {refundAmtCentavos > 0 && `(${fmtCentavos(refundAmtCentavos)})`}
              </Button>
            )}
            {open === 'reassign' && (
              <Button
                size="sm"
                disabled={!reasonOk || !providerIdOk || reassignMut.isPending}
                onClick={() => {
                  const providerName = (providersQuery.data ?? []).find((provider) => provider.id === providerId)?.businessName ?? 'the selected provider';
                  void confirm({
                    title: `Reassign to ${providerName}?`,
                    description: 'The booking owner, conversation access, pending offers, and any provider-team assignment must move together. Review the booking timeline after this action.',
                    confirmLabel: 'Reassign booking',
                  }).then((approved) => {
                    if (approved) reassignMut.mutate({ newProviderId: providerId, reason: reason.trim() });
                  });
                }}
              >
                Confirm reassign
              </Button>
            )}
            {open === 'cancel' && (
              <Button
                size="sm"
                variant="destructive"
                disabled={!cancelInputsOk || cancelMut.isPending}
                onClick={() => {
                  void confirm({
                    title: 'Cancel this booking?',
                    description: 'The timing, arrival, and no-show inputs above directly control the live refund calculation. Verify each one against the schedule, timeline, and evidence. The customer-facing policy editor does not currently control this calculation.',
                    confirmLabel: 'Cancel booking',
                    tone: 'destructive',
                  }).then((approved) => {
                    if (approved) cancelMut.mutate({
                        reason,
                        hoursUntilScheduled: cancelHours,
                        providerArrived: providerArrived || undefined,
                        customerNoShow: customerNoShow || undefined,
                      });
                  });
                }}
              >
                Confirm cancel
              </Button>
            )}
            {open === 'force_complete' && (
              <Button
                size="sm"
                disabled={!reasonOkForce || forceMut.isPending}
                onClick={() => {
                  void confirm({
                    title: 'Force-complete this booking?',
                    description: 'This can confirm completion and release held escrow without the normal customer step. Use only after reviewing proof, communication, and dispute context.',
                    confirmLabel: 'Force complete',
                    tone: 'destructive',
                  }).then((approved) => { if (approved) forceMut.mutate({ reason: reason.trim() }); });
                }}
              >
                Confirm force-complete
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={anyActionPending} onClick={reset}>
              Cancel
            </Button>
            {open === 'release' && releaseMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(releaseMut.error)}
              </span>
            )}
            {open === 'refund' && refundMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(refundMut.error)}
              </span>
            )}
            {open === 'reassign' && reassignMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(reassignMut.error)}
              </span>
            )}
            {open === 'cancel' && cancelMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(cancelMut.error)}
              </span>
            )}
            {open === 'force_complete' && forceMut.isError && (
              <span role="alert" className="text-xs text-red-600">
                {getErrorMessage(forceMut.error)}
              </span>
            )}
          </div>
        </div>
      )}
      {confirmationDialog}
    </Card>
  );
}

// ─── OverviewTab ──────────────────────────────────────────────────────────

export function OverviewTab({ detail }: { detail: BookingDetail }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Customer</h3>
        {detail.customer ? (
          <PartyBlock
            avatarUrl={detail.customer.avatarUrl}
            fullName={detail.customer.fullName}
            phone={detail.customer.phone}
            email={detail.customer.email}
            extraLine={
              <span className="inline-flex items-center gap-1">
                <Star size={12} /> {detail.customer.lifetimeBookings} bookings
                {detail.customer.averageRatingGiven !== null && (
                  <> · gives {detail.customer.averageRatingGiven.toFixed(2)} avg</>
                )}
              </span>
            }
            link={`/customers/${detail.customer.id}`}
          />
        ) : (
          <EmptyState title="No customer linked." />
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Provider</h3>
        {detail.provider ? (
          <PartyBlock
            avatarUrl={detail.provider.avatarUrl}
            fullName={detail.provider.businessName || detail.provider.fullName}
            phone={detail.provider.phone}
            email={null}
            extraLine={
              <span className="inline-flex items-center gap-1">
                <Star size={12} />{' '}
                {detail.provider.rating !== null ? detail.provider.rating.toFixed(2) : '—'} ·{' '}
                {detail.provider.lifetimeJobs} jobs · tier {detail.provider.tier}
              </span>
            }
            link={`/providers/${detail.provider.id}`}
          />
        ) : (
          <EmptyState title="No provider assigned." />
        )}
      </Card>

      <Card className="p-5 md:col-span-2">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <MapPin size={14} /> Service address
        </h3>
        {/* BUG-PHASE39-03 fix — pre-fix this rendered ", ," when the
            address object existed but had empty/null sub-fields (or
            when API returned an unexpected shape). Now: only render
            the lines if they actually have content. */}
        {detail.address && [detail.address.full, detail.address.barangay, detail.address.city, detail.address.province].some(Boolean) ? (
          <div className="text-sm text-[var(--color-text)]">
            {detail.address.full && <p>{detail.address.full}</p>}
            {[detail.address.barangay, detail.address.city, detail.address.province].filter(Boolean)
              .length > 0 && (
              <p className="text-[var(--color-text-secondary)] mt-0.5">
                {[detail.address.barangay, detail.address.city, detail.address.province]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
        ) : (
          <EmptyState title="No address on file." />
        )}
      </Card>
    </div>
  );
}

function PartyBlock({
  avatarUrl,
  fullName,
  phone,
  email,
  extraLine,
  link,
}: {
  avatarUrl: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  extraLine: React.ReactNode;
  link: string;
}): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div className="w-12 h-12 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center overflow-hidden shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-base font-semibold text-[var(--color-text-secondary)]">
            {fullName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <Link
          to={link}
          className="text-sm font-medium text-[var(--color-secondary)] hover:underline"
        >
          {fullName || '—'}
        </Link>
        <div className="text-xs text-[var(--color-text-secondary)] mt-1 space-y-0.5">
          {phone && (
            <p className="inline-flex items-center gap-1">
              <Phone size={12} /> {phone}
            </p>
          )}
          {email && (
            <p className="inline-flex items-center gap-1">
              <Mail size={12} /> {email}
            </p>
          )}
          <p>{extraLine}</p>
        </div>
      </div>
    </div>
  );
}

// ─── TimelineTab ──────────────────────────────────────────────────────────

export function TimelineTab({ bookingId }: { bookingId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-booking-timeline', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TimelineEvent[] }>(
        `/api/v1/admin/bookings/${bookingId}/timeline`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) {
    return (
      <ErrorState
        title="Timeline unavailable"
        description={getErrorMessage(q.error)}
        action={<Button size="sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Retry timeline</Button>}
      />
    );
  }
  const events = q.data ?? [];

  if (events.length === 0) {
    return <EmptyState title="No timeline events yet." />;
  }

  return (
    <Card className="p-5">
      <ol className="relative border-l border-[var(--color-border)] ml-2">
        {events.map((e, idx) => (
          <li key={`${e.at}-${idx}`} className="ml-4 pb-5 last:pb-0">
            <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-[var(--color-secondary)]" />
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                label={e.actor.kind}
                variant={
                  e.actor.kind === 'admin'
                    ? 'danger'
                    : e.actor.kind === 'system'
                      ? 'info'
                      : 'success'
                }
              />
              <span className="text-sm font-medium text-[var(--color-text)]">{e.type}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">{fmtDate(e.at)}</span>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{e.description}</p>
            {e.actor.name && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">by {e.actor.name}</p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─── EvidenceTab ──────────────────────────────────────────────────────────

function proofStageLabel(stage: string): string {
  return stage.replaceAll('_', ' ');
}

export function EvidenceTab({ bookingId }: { bookingId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-booking-evidence', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BookingProofSummary }>(
        `/api/v1/admin/bookings/${bookingId}/proof-summary`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) {
    return (
      <ErrorState
        title="Evidence unavailable"
        description={getErrorMessage(q.error)}
        action={<Button size="sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Retry evidence</Button>}
      />
    );
  }
  const data = q.data;
  if (!data) return <EmptyState title="No proof record." />;

  const providerAfterPhotos = data.photos.filter(
    (photo) => photo.source === 'canonical' && photo.photoType === 'after' && photo.uploadedByRole === 'provider',
  ).length;
  const checklistValue = data.checklist
    ? `${data.checklist.completedRequiredItems}/${data.checklist.requiredItems}`
    : 'Not opened';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          title="Proof stage"
          value={proofStageLabel(data.readiness.stage)}
          icon={<CheckCircle2 size={16} />}
        />
        <KpiCard title="Checklist required" value={checklistValue} icon={<ClipboardList size={16} />} />
        <KpiCard
          title="Provider after photos"
          value={`${providerAfterPhotos}/${data.readiness.afterPhotosRequired}`}
          icon={<ImageIcon size={16} />}
        />
        <KpiCard
          title="Chat messages"
          value={data.communications.chatMessageCount.toString()}
          icon={<MessageSquare size={16} />}
        />
      </div>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Completion readiness</h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Derived from the same checklist, provider-photo, status, and {data.readiness.minimumTimeOnSiteMinutes}-minute on-site rules used by provider completion.
            </p>
          </div>
          <Badge
            label={data.readiness.readyForProviderCompletion ? 'Ready to submit' : proofStageLabel(data.readiness.stage)}
            variant={data.readiness.readyForProviderCompletion ? 'success' : data.readiness.blockers.length > 0 ? 'warning' : 'info'}
          />
        </div>
        {data.readiness.blockers.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {data.readiness.blockers.map((blocker) => (
              <li key={blocker.code} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span><strong>{proofStageLabel(blocker.code)}:</strong> {blocker.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-emerald-700">No current provider-completion blockers are recorded.</p>
        )}
        {data.readiness.qualityFlags.length > 0 && (
          <ul className="mt-3 space-y-2">
            {data.readiness.qualityFlags.map((flag) => (
              <li key={flag.code} className="flex gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3 text-sm text-[var(--color-text-secondary)]">
                <Info size={16} className="mt-0.5 shrink-0" />
                <span><strong className="text-[var(--color-text)]">{proofStageLabel(flag.code)}:</strong> {flag.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <FileText size={14} /> Scope and closeout
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Requested work</dt>
              <dd className="mt-1 text-[var(--color-text)]">{data.booking.description || 'No booking description recorded.'}</dd>
            </div>
            {data.scope.acceptedQuote && (
              <div>
                <dt className="text-xs text-[var(--color-text-secondary)]">Accepted quote scope</dt>
                <dd className="mt-1 text-[var(--color-text)]">{data.scope.acceptedQuote.description || 'No quote description recorded.'}</dd>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {fmtCentavos(data.scope.acceptedQuote.quotedPrice)} · accepted {fmtDate(data.scope.acceptedQuote.acceptedAt)} · {data.scope.acceptedQuote.lineItems.length} line item(s)
                </p>
              </div>
            )}
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Provider completion notes</dt>
              <dd className="mt-1 text-[var(--color-text)]">{data.booking.completionNotes || 'No completion notes recorded.'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-[var(--color-text-secondary)]">Provider submitted</dt>
                <dd className="mt-1">{fmtDate(data.booking.completedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-secondary)]">Customer confirmed</dt>
                <dd className="mt-1">{fmtDate(data.booking.confirmedAt)}</dd>
              </div>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <ClipboardList size={14} /> Checklist execution
          </h3>
          {!data.checklist ? (
            <EmptyState title="Checklist not opened" description="No booking checklist snapshot exists yet." />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--color-text-secondary)]">
                <Badge label={data.checklist.complete ? 'complete' : 'incomplete'} variant={data.checklist.complete ? 'success' : 'warning'} />
                <span>Template v{data.checklist.templateVersion}</span>
                <span>opened {fmtDate(data.checklist.shownAt)}</span>
              </div>
              <ul className="space-y-2">
                {data.checklist.items.map((item) => (
                  <li key={item.id} className="rounded-md border border-[var(--color-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {item.sectionTitle && <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-tertiary)]">{item.sectionTitle}</p>}
                        <p className="text-sm font-medium text-[var(--color-text)]">{item.title}</p>
                      </div>
                      <Badge label={item.completed ? 'done' : item.required ? 'required' : 'optional'} variant={item.completed ? 'success' : item.required ? 'warning' : 'info'} />
                    </div>
                    <div className="mt-1 flex gap-2 flex-wrap text-xs text-[var(--color-text-secondary)]">
                      {item.photoRequired && <span>Photo required</span>}
                      {item.photoId && <span>Photo linked</span>}
                      {item.completedAt && <span>{fmtDate(item.completedAt)}</span>}
                    </div>
                    {item.notes && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Notes: {item.notes}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Categorized source evidence</h3>
          <Badge label={`${data.photos.length} photo(s)`} variant="info" />
        </div>
        {data.photos.length === 0 ? (
          <EmptyState title="No photos uploaded." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.photos.map((photo) => (
              <div key={photo.id} className="rounded-md border border-[var(--color-border)] p-2 space-y-2">
                <img src={photo.url} alt={`${photo.photoType} evidence`} className="w-full h-36 object-cover rounded" />
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge label={photo.photoType} variant="default" />
                  <Badge
                    label={photo.uploadedByRole}
                    variant={photo.uploadedByRole === 'customer' ? 'info' : photo.uploadedByRole === 'admin' ? 'danger' : photo.uploadedByRole === 'provider' ? 'success' : 'warning'}
                  />
                  {photo.source === 'legacy' && <Badge label="legacy" variant="warning" />}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {photo.uploaderName ?? `User ${photo.uploadedByUserId.slice(0, 8)}`} · {fmtDate(photo.uploadedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <User size={14} /> Signatures and acknowledgements
        </h3>
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Identity caution (E19):</strong> {data.signatures.identityCaveat}
        </div>
        {data.signatures.records.length === 0 ? (
          <div className="mt-3"><EmptyState title="No booking signatures recorded." /></div>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.signatures.records.map((signature) => (
              <li key={signature.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--color-border)] p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={signature.signatureType} variant="info" />
                    <Badge label={signature.signedByRole} variant={signature.signedByRole === 'customer' ? 'info' : signature.signedByRole === 'admin' ? 'danger' : signature.signedByRole === 'provider' ? 'success' : 'warning'} />
                  </div>
                  <p className="mt-1 text-[var(--color-text)]">{signature.signerName ?? `User ${signature.signedByUserId.slice(0, 8)}`}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">{proofStageLabel(signature.attribution)} · {fmtDate(signature.signedAt)}</p>
                </div>
                <a href={signature.url} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-[var(--color-secondary)] hover:underline">View file</a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Change evidence</h3>
          {data.changeOrders.length === 0 ? (
            <EmptyState title="No change orders recorded." />
          ) : (
            <ul className="space-y-2">
              {data.changeOrders.map((order) => (
                <li key={order.id} className="rounded-md border border-[var(--color-border)] p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge label={order.status} variant={order.status === 'paid' || order.status === 'approved' ? 'success' : order.status === 'declined' ? 'danger' : 'warning'} />
                    <strong>{fmtCentavos(order.additionalAmount)}</strong>
                  </div>
                  <p className="mt-2 text-[var(--color-text)]">{order.description}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{order.photos.length} linked photo(s) · created {fmtDate(order.createdAt)} · response {fmtDate(order.customerRespondedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Support and dispute context</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Support cases</p>
              {data.communications.supportTickets.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">No support case is linked.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.communications.supportTickets.map((ticket) => (
                    <li key={ticket.id} className="rounded-md border border-[var(--color-border)] p-2 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={ticket.status} variant={ticket.status === 'resolved' || ticket.status === 'closed' ? 'success' : 'warning'} />
                        <Link
                          to={`/support-tickets?ticketId=${encodeURIComponent(ticket.id)}&bookingId=${encodeURIComponent(bookingId)}`}
                          className="font-medium text-[var(--color-secondary)] hover:underline"
                        >
                          {ticket.ticketNumber}
                        </Link>
                        <span className="text-xs text-[var(--color-text-secondary)]">{ticket.priority}</span>
                      </div>
                      <p className="mt-1 text-[var(--color-text-secondary)]">{ticket.subject}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Dispute</p>
              {!data.dispute ? (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">No dispute is linked.</p>
              ) : (
                <div className="mt-2 rounded-md border border-[var(--color-border)] p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge label={data.dispute.status} variant={data.dispute.status === 'resolved' ? 'success' : 'warning'} />
                    <span>{data.dispute.type}</span>
                  </div>
                  <Link to={`/disputes/${data.dispute.id}`} className="mt-2 inline-flex text-xs font-semibold text-[var(--color-secondary)] hover:underline">Open dispute detail</Link>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Not captured by the current work record</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.unavailable.map((item) => (
            <div key={item.key} className="rounded-md border border-dashed border-[var(--color-border)] p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                {item.key === 'gps_check_ins' ? <Navigation size={14} /> : item.key === 'job_receipts' ? <Receipt size={14} /> : <Clock size={14} />}
                {item.label}
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{item.reason}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── MoneyTab ─────────────────────────────────────────────────────────────

export function MoneyTab({
  bookingId,
  detail,
}: {
  bookingId: string;
  detail: BookingDetail;
}): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-booking-dispute', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BookingDispute | null }>(
        `/api/v1/admin/bookings/${bookingId}/dispute`,
      );
      return res.data.data;
    },
  });
  const moneyQuery = useQuery({
    queryKey: ['admin-booking-money', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BookingMoney }>(
        `/api/v1/admin/bookings/${bookingId}/money`,
      );
      return res.data.data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          title="Service price"
          value={fmtCentavos(detail.servicePrice)}
          icon={<Coins size={16} />}
        />
        <KpiCard
          title="Service fee"
          value={fmtCentavos(detail.serviceFee)}
          icon={<Wallet size={16} />}
        />
        <KpiCard
          title="Total amount"
          value={fmtCentavos(detail.totalAmount)}
          icon={<Coins size={16} />}
        />
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <AlertTriangle size={14} /> Dispute
        </h3>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState
            title="Dispute record unavailable"
            description={getErrorMessage(q.error)}
            action={<Button size="sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Retry dispute</Button>}
          />
        ) : !q.data ? (
          <EmptyState title="No dispute filed for this booking." />
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                label={q.data.status}
                variant={q.data.status === 'resolved' ? 'success' : 'warning'}
              />
              <Badge label={`tier ${q.data.tier}`} variant="info" />
              <Badge label={q.data.type} variant="default" />
              <span className="text-xs text-[var(--color-text-secondary)]">
                filed {fmtDate(q.data.filedAt)}
              </span>
            </div>
            <p className="text-[var(--color-text)]">{q.data.description}</p>
            {q.data.resolutionType && (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Resolution: {q.data.resolutionType} ·{' '}
                {q.data.refundAmount !== null
                  ? `refund ${fmtCentavos(q.data.refundAmount)}`
                  : 'no refund'}
              </p>
            )}
            <Link
              to={`/disputes/${q.data.id}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-secondary)] hover:underline"
            >
              Open dispute detail →
            </Link>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Payment attempts</h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Gateway intent status and cumulative refunds for this booking. Client keys are never shown.
            </p>
          </div>
          <Link to="/financials?tab=reconciliation" className="text-xs font-semibold text-[var(--color-secondary)] hover:underline">
            Open reconciliation
          </Link>
        </div>
        {moneyQuery.isLoading ? (
          <LoadingState />
        ) : moneyQuery.isError ? (
          <ErrorState
            title="Payment trail unavailable"
            description={getErrorMessage(moneyQuery.error)}
            action={<Button size="sm" onClick={() => void moneyQuery.refetch()}><RefreshCw size={14} /> Retry payment trail</Button>}
          />
        ) : !moneyQuery.data || moneyQuery.data.paymentIntents.length === 0 ? (
          <div className="mt-3"><EmptyState title="No payment intent recorded." /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-[var(--color-text-secondary)]">
                <tr>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Refunded</th>
                  <th className="px-3 py-2 text-left">Gateway reference</th>
                </tr>
              </thead>
              <tbody>
                {moneyQuery.data.paymentIntents.map((payment) => (
                  <tr key={payment.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-xs">{fmtDate(payment.createdAt)}</td>
                    <td className="px-3 py-2">{payment.paymentMethod}</td>
                    <td className="px-3 py-2"><Badge label={payment.status} variant={payment.status === 'succeeded' ? 'success' : payment.status === 'failed' ? 'danger' : 'info'} /></td>
                    <td className="px-3 py-2 text-right font-medium">{fmtCentavos(payment.amount)}</td>
                    <td className="px-3 py-2 text-right">{fmtCentavos(payment.refundedAmount)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{payment.gatewayPaymentId ?? payment.gatewayIntentId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Internal wallet ledger</h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Every booking-linked debit and credit, including escrow, commission, service fee, and refunds.
        </p>
        {!moneyQuery.isLoading && !moneyQuery.isError && moneyQuery.data && (
          moneyQuery.data.ledgerEntries.length === 0 ? (
            <div className="mt-3"><EmptyState title="No booking ledger entries recorded." /></div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Wallet</th>
                    <th className="px-3 py-2 text-left">Entry</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance after</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {moneyQuery.data.ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 text-xs">{fmtDate(entry.createdAt)}</td>
                      <td className="px-3 py-2">{entry.walletType}</td>
                      <td className="px-3 py-2"><Badge label={entry.type} variant="info" /></td>
                      <td className={`px-3 py-2 text-right font-medium ${entry.amount < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtCentavos(entry.amount)}</td>
                      <td className="px-3 py-2 text-right">{fmtCentavos(entry.balanceAfter)}</td>
                      <td className="px-3 py-2 text-xs">{entry.referenceId ?? (entry.description || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Legacy sales records</h3>
        {!moneyQuery.isLoading && !moneyQuery.isError && moneyQuery.data && (
          moneyQuery.data.salesRecords.length === 0 ? (
            <div className="mt-3"><EmptyState title="No legacy sales record issued." /></div>
          ) : (
            <ul className="mt-3 space-y-2">
              {moneyQuery.data.salesRecords.map((record) => (
                <li key={record.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--color-border)] p-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-medium">{record.number}</span>
                      {record.isCancellation && <Badge label="cancellation" variant="warning" />}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      Gross {fmtCentavos(record.grossAmount)} · provider {fmtCentavos(record.providerReceived)} · platform {fmtCentavos(record.platformRetained)} · issued {fmtDate(record.issuedAt)}
                    </p>
                  </div>
                  {record.pdfUrl && <a href={record.pdfUrl} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-[var(--color-secondary)] hover:underline">Open PDF</a>}
                </li>
              ))}
            </ul>
          )
        )}
      </Card>
    </div>
  );
}

// ─── AuditTab ─────────────────────────────────────────────────────────────

function AuditTab({ bookingId }: { bookingId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-booking-timeline', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TimelineEvent[] }>(
        `/api/v1/admin/bookings/${bookingId}/timeline`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) {
    return (
      <ErrorState
        title="Admin audit unavailable"
        description={getErrorMessage(q.error)}
        action={<Button size="sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Retry audit</Button>}
      />
    );
  }
  const adminEvents = (q.data ?? []).filter((e) => e.actor.kind === 'admin');

  if (adminEvents.length === 0) {
    return <EmptyState title="No admin actions on this booking yet." />;
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Admin</th>
              <th className="px-3 py-2 text-left">Reason / detail</th>
            </tr>
          </thead>
          <tbody>
            {adminEvents.map((e, idx) => (
              <tr key={`${e.at}-${idx}`} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                  {fmtDate(e.at)}
                </td>
                <td className="px-3 py-2">
                  <Badge label={e.type} variant="danger" />
                </td>
                <td className="px-3 py-2 text-xs">{e.actor.name ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                  {e.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Quotes & change orders (D27 Phase 1 — admin visibility) ────────────────

interface AdminQuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  itemType: string;
}
interface AdminQuote {
  id: string;
  providerId: string;
  providerName: string | null;
  providerRating: number | null;
  quotedPrice: number;
  description: string;
  status: string;
  laborAmount: number;
  materialsAmount: number;
  estimatedDays: number | null;
  notes: string;
  expiresAt: string | null;
  createdAt: string;
  lineItems: AdminQuoteLineItem[];
}
interface AdminChangeOrder {
  id: string;
  providerId: string;
  description: string;
  additionalAmount: number;
  // D27 Phase 3 — itemized parts/materials breakdown (empty for lump-sum orders).
  lineItems: AdminQuoteLineItem[];
  photos: string[];
  status: string;
  createdAt: string;
}

function QuotesTab({ bookingId }: { bookingId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-booking-quotes', bookingId],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { quotes: AdminQuote[]; changeOrders: AdminChangeOrder[] };
      }>(`/api/v1/admin/bookings/${bookingId}/quotes`);
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data)
    return (
      <ErrorState
        title="Failed to load quotes"
        description={getErrorMessage(q.error)}
        action={<Button size="sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Retry quotes</Button>}
      />
    );

  const { quotes, changeOrders } = q.data;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
          Quotes ({quotes.length})
        </h3>
        {quotes.length === 0 ? (
          <EmptyState title="No quotes" description="No provider has quoted this request." />
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => (
              <div key={quote.id} className="rounded-lg border border-[var(--color-border)] p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {quote.providerName ?? 'Provider'}
                    {quote.providerRating != null ? (
                      <span className="ml-1 inline-flex items-center gap-1" aria-label={`${quote.providerRating.toFixed(2)} out of 5 stars`}>
                        <span aria-hidden="true">·</span>
                        <Star size={13} className="text-amber-500" fill="currentColor" aria-hidden="true" />
                        {quote.providerRating.toFixed(2)}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge
                      label={quote.status}
                      variant={
                        quote.status === 'accepted'
                          ? 'success'
                          : quote.status === 'declined'
                            ? 'danger'
                            : 'info'
                      }
                    />
                    <span className="text-sm font-semibold text-[var(--color-text)]">
                      {fmtCentavos(quote.quotedPrice)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-[var(--color-text-secondary)]">
                  <span>Labor {fmtCentavos(quote.laborAmount)}</span>
                  <span>Materials {fmtCentavos(quote.materialsAmount)}</span>
                  {quote.estimatedDays != null ? <span>{quote.estimatedDays} day(s)</span> : null}
                </div>
                {quote.description ? (
                  <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                    {quote.description}
                  </p>
                ) : null}
                {quote.lineItems.length > 0 && (
                  <table className="w-full mt-3 text-xs">
                    <thead>
                      <tr className="text-left text-[var(--color-text-tertiary)]">
                        <th className="py-1">Item</th>
                        <th>Type</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Unit</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.lineItems.map((li) => (
                        <tr key={li.id} className="border-t border-[var(--color-border)]">
                          <td className="py-1 text-[var(--color-text)]">{li.description}</td>
                          <td className="text-[var(--color-text-secondary)]">{li.itemType}</td>
                          <td className="text-right">
                            {li.quantity} {li.unit}
                          </td>
                          <td className="text-right">{fmtCentavos(li.unitPrice)}</td>
                          <td className="text-right text-[var(--color-text)]">
                            {fmtCentavos(li.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {quote.notes ? (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                    Notes: {quote.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
          Change orders ({changeOrders.length})
        </h3>
        {changeOrders.length === 0 ? (
          <EmptyState
            title="No change orders"
            description="No mid-job change orders on this booking."
          />
        ) : (
          <div className="space-y-3">
            {changeOrders.map((co) => (
              <div key={co.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    label={co.status}
                    variant={
                      co.status === 'paid'
                        ? 'success'
                        : co.status === 'declined' || co.status === 'expired'
                          ? 'danger'
                          : 'info'
                    }
                  />
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {fmtCentavos(co.additionalAmount)}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">{co.description}</p>
                {co.lineItems && co.lineItems.length > 0 && (
                  <table className="w-full mt-2 text-xs">
                    <thead>
                      <tr className="text-left text-[var(--color-text-tertiary)]">
                        <th className="py-1">Item</th>
                        <th>Type</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Unit</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {co.lineItems.map((li) => (
                        <tr key={li.id} className="border-t border-[var(--color-border)]">
                          <td className="py-1 text-[var(--color-text)]">{li.description}</td>
                          <td className="text-[var(--color-text-secondary)]">{li.itemType}</td>
                          <td className="text-right">
                            {li.quantity} {li.unit}
                          </td>
                          <td className="text-right">{fmtCentavos(li.unitPrice)}</td>
                          <td className="text-right text-[var(--color-text)]">
                            {fmtCentavos(li.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {co.photos.length > 0 ? (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    {co.photos.length} photo(s)
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
