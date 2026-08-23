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
import { useAuthStore } from '@/stores/auth.store';

// ─── Types (mirror packages/api/src/services/booking-admin.service.ts) ────

interface BookingDetail {
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

interface BookingEvidence {
  photos: Array<{
    id: string;
    url: string;
    uploadedBy: 'customer' | 'provider';
    uploadedAt: string;
    caption: string | null;
  }>;
  chatMessageCount: number;
  gpsCheckIns: Array<{ at: string; lat: number; lng: number; eventType: string }>;
  receipts: Array<{ id: string; url: string; createdAt: string }>;
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
          <Link to="/bookings">
            <Button variant="secondary" size="sm">
              <ArrowLeft size={14} /> Back to bookings
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
          to="/bookings"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> Back to bookings
        </Link>
      </div>

      <BookingHeader detail={detail} />

      <BookingActions bookingId={bookingId} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="money">Money</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

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
          <Link
            to={`/support-tickets?bookingId=${encodeURIComponent(detail.id)}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-primary)]"
          >
            <MessageSquare size={14} /> Support cases
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ─── Action panel (super-admin only) ──────────────────────────────────────

type ActionId = 'release' | 'refund' | 'reassign' | 'cancel' | 'force_complete';

export function BookingActions({ bookingId }: { bookingId: string }): React.ReactElement | null {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<ActionId | null>(null);

  const [reason, setReason] = useState('');
  const [amountPesos, setAmountPesos] = useState('');
  const [providerId, setProviderId] = useState('');
  const [hoursUntilScheduled, setHoursUntilScheduled] = useState('');
  const [providerArrived, setProviderArrived] = useState(false);
  const [customerNoShow, setCustomerNoShow] = useState(false);

  const providersQuery = useQuery({
    queryKey: ['admin-online-providers', 'booking-reassign'],
    queryFn: async () => {
      const res = await api.get<{ rows?: AssignableProvider[]; data?: AssignableProvider[] }>(
        '/api/v1/admin/providers?online=true&pageSize=100',
      );
      return res.data.rows ?? res.data.data ?? [];
    },
    enabled: open === 'reassign',
  });

  const invalidateAll = (): void => {
    queryClient.invalidateQueries({ queryKey: ['admin-booking-detail', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-timeline', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-dispute', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-evidence', bookingId] });
    // Also refresh the bookings list so its row reflects the action when the
    // admin navigates back (was stale until a manual refetch).
    queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
  };

  const reset = (): void => {
    setReason('');
    setAmountPesos('');
    setProviderId('');
    setHoursUntilScheduled('');
    setProviderArrived(false);
    setCustomerNoShow(false);
    setOpen(null);
  };

  const releaseMut = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/escrow/release`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidateAll();
      reset();
    },
  });

  const refundMut = useMutation({
    mutationFn: async (input: { amount: number; reason: string }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/escrow/refund`, input);
      return res.data;
    },
    onSuccess: () => {
      invalidateAll();
      reset();
    },
  });

  const reassignMut = useMutation({
    mutationFn: async (input: { newProviderId: string; reason: string }) => {
      const res = await api.post(`/api/v1/admin/bookings/${bookingId}/reassign`, input);
      return res.data;
    },
    onSuccess: () => {
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
  const providerIdOk = (providersQuery.data ?? []).some((provider) => provider.id === providerId);
  const refundAmtCentavos = (() => {
    const n = parseFloat(amountPesos);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  const cancelHours = (() => {
    if (!hoursUntilScheduled) return undefined;
    const n = Number(hoursUntilScheduled);
    return Number.isFinite(n) ? n : undefined;
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
            onClick={() => setOpen(open === 'release' ? null : 'release')}
          >
            <Wallet size={14} /> Manual release
          </Button>
          <Button
            size="sm"
            variant={open === 'refund' ? 'default' : 'secondary'}
            onClick={() => setOpen(open === 'refund' ? null : 'refund')}
          >
            <Coins size={14} /> Refund
          </Button>
          <Button
            size="sm"
            variant={open === 'reassign' ? 'default' : 'secondary'}
            onClick={() => setOpen(open === 'reassign' ? null : 'reassign')}
          >
            <RefreshCw size={14} /> Reassign
          </Button>
          <Button
            size="sm"
            variant={open === 'cancel' ? 'destructive' : 'secondary'}
            onClick={() => setOpen(open === 'cancel' ? null : 'cancel')}
          >
            <AlertTriangle size={14} /> Cancel
          </Button>
          <Button
            size="sm"
            variant={open === 'force_complete' ? 'default' : 'secondary'}
            onClick={() => setOpen(open === 'force_complete' ? null : 'force_complete')}
          >
            Force complete
          </Button>
        </div>
      </div>

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
                step="0.01"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                placeholder="100.00"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
              />
            </div>
          )}

          {open === 'reassign' && (
            <div>
              <label
                htmlFor="booking-reassign-provider"
                className="text-xs text-[var(--color-text-secondary)]"
              >
                New online provider
              </label>
              <select
                id="booking-reassign-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                aria-label="New online provider"
                disabled={providersQuery.isLoading || providersQuery.isError}
                className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm"
              >
                <option value="">
                  {providersQuery.isLoading
                    ? 'Loading online providers...'
                    : 'Choose an online provider'}
                </option>
                {(providersQuery.data ?? []).map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.businessName ?? 'Unnamed provider'}
                    {provider.city ? ` · ${provider.city}` : ''}
                  </option>
                ))}
              </select>
              {providersQuery.isError && (
                <p role="alert" className="mt-1 text-xs text-[var(--color-error)]">
                  Online providers could not be loaded. Use Dispatch to retry.
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
                  Hours until scheduled (optional)
                </label>
                <input
                  id="booking-cancel-hours"
                  type="number"
                  step="0.5"
                  value={hoursUntilScheduled}
                  onChange={(e) => setHoursUntilScheduled(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-5">
                <input
                  type="checkbox"
                  checked={providerArrived}
                  onChange={(e) => setProviderArrived(e.target.checked)}
                />
                Provider arrived
              </label>
              <label className="flex items-center gap-2 text-sm pt-5">
                <input
                  type="checkbox"
                  checked={customerNoShow}
                  onChange={(e) => setCustomerNoShow(e.target.checked)}
                />
                Customer no-show
              </label>
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
              placeholder={
                open === 'force_complete'
                  ? 'e.g., Customer unreachable for 4 days; provider photo evidence verified by support agent — auto-confirming.'
                  : 'Why is this action being taken?'
              }
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {open === 'release' && (
              <Button
                size="sm"
                disabled={!reasonOk || releaseMut.isPending}
                onClick={() => {
                  if (window.confirm('Manually release escrow for this booking?'))
                    releaseMut.mutate({ reason });
                }}
              >
                Confirm release
              </Button>
            )}
            {open === 'refund' && (
              <Button
                size="sm"
                disabled={!reasonOk || refundAmtCentavos === 0 || refundMut.isPending}
                onClick={() =>
                  window.confirm(`Refund ${fmtCentavos(refundAmtCentavos)} from escrow?`)
                    ? refundMut.mutate({ amount: refundAmtCentavos, reason })
                    : undefined
                }
              >
                Confirm refund {refundAmtCentavos > 0 && `(${fmtCentavos(refundAmtCentavos)})`}
              </Button>
            )}
            {open === 'reassign' && (
              <Button
                size="sm"
                disabled={!reasonOk || !providerIdOk || reassignMut.isPending}
                onClick={() => reassignMut.mutate({ newProviderId: providerId, reason })}
              >
                Confirm reassign
              </Button>
            )}
            {open === 'cancel' && (
              <Button
                size="sm"
                variant="destructive"
                disabled={!reasonOk || cancelMut.isPending}
                onClick={() =>
                  window.confirm('Cancel this booking?')
                    ? cancelMut.mutate({
                        reason,
                        hoursUntilScheduled: cancelHours,
                        providerArrived: providerArrived || undefined,
                        customerNoShow: customerNoShow || undefined,
                      })
                    : undefined
                }
              >
                Confirm cancel
              </Button>
            )}
            {open === 'force_complete' && (
              <Button
                size="sm"
                disabled={!reasonOkForce || forceMut.isPending}
                onClick={() => {
                  if (window.confirm('Force-complete this booking?')) forceMut.mutate({ reason });
                }}
              >
                Confirm force-complete
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={reset}>
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
    </Card>
  );
}

// ─── OverviewTab ──────────────────────────────────────────────────────────

function OverviewTab({ detail }: { detail: BookingDetail }): React.ReactElement {
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
        {detail.address && (detail.address.full || detail.address.city) ? (
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

function TimelineTab({ bookingId }: { bookingId: string }): React.ReactElement {
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
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
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

function EvidenceTab({ bookingId }: { bookingId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-booking-evidence', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BookingEvidence }>(
        `/api/v1/admin/bookings/${bookingId}/evidence`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data;
  if (!data) return <EmptyState title="No evidence." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          title="Photos"
          value={data.photos.length.toString()}
          icon={<ImageIcon size={16} />}
        />
        <KpiCard
          title="Chat messages"
          value={data.chatMessageCount.toString()}
          icon={<MessageSquare size={16} />}
        />
        <KpiCard
          title="GPS check-ins"
          value={data.gpsCheckIns.length.toString()}
          icon={<Navigation size={16} />}
        />
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Photos</h3>
        {data.photos.length === 0 ? (
          <EmptyState title="No photos uploaded." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.photos.map((p) => (
              <div key={p.id} className="space-y-1">
                <img
                  src={p.url}
                  alt={p.caption ?? 'evidence'}
                  className="w-full h-32 object-cover rounded-md border border-[var(--color-border)]"
                />
                <div className="flex items-center justify-between text-xs">
                  <Badge
                    label={p.uploadedBy}
                    variant={p.uploadedBy === 'customer' ? 'info' : 'success'}
                  />
                  <span className="text-[var(--color-text-secondary)]">
                    {fmtDate(p.uploadedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">GPS check-ins</h3>
        {data.gpsCheckIns.length === 0 ? (
          <EmptyState title="No GPS check-ins recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-right">Latitude</th>
                  <th className="px-3 py-2 text-right">Longitude</th>
                </tr>
              </thead>
              <tbody>
                {data.gpsCheckIns.map((g, idx) => (
                  <tr key={`${g.at}-${idx}`} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(g.at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge label={g.eventType} variant="info" />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{g.lat.toFixed(6)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{g.lng.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Receipt size={14} /> Receipts
        </h3>
        {data.receipts.length === 0 ? (
          <EmptyState title="No receipts attached." />
        ) : (
          <ul className="space-y-2">
            {data.receipts.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between text-sm border border-[var(--color-border)] rounded-md px-3 py-2"
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[var(--color-secondary)] hover:underline font-mono text-xs"
                >
                  {r.id.slice(0, 8)}…
                </a>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {fmtDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── MoneyTab ─────────────────────────────────────────────────────────────

function MoneyTab({
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
          <ErrorState description={getErrorMessage(q.error)} />
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
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
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
    return <ErrorState title="Failed to load quotes" description={getErrorMessage(q.error)} />;

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
