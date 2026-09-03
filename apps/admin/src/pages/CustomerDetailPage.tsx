/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 06 — Customer 360 admin page.
 *
 * 6 tabs: Profile, Bookings, Payments, Disputes, Referrals, Activity.
 * Mirrors the structure of ProviderDetailPage.tsx (Phase 05).
 */

import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  Mail,
  Eye,
  MapPin,
  Calendar,
  Star,
  AlertTriangle,
  FileText,
  MessageSquare,
  RefreshCw,
  Coins,
  Wallet,
  CreditCard,
  Flag,
  Heart,
  Clock,
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
import Pagination from '@/components/ui/Pagination';
import { useReasonDialog } from '@/components/ui/ReasonDialog';
import { useAuthStore } from '@/stores/auth.store';

// silence unused-import warnings for icons used contextually below
void FileText;
void MessageSquare;
void RefreshCw;
void Calendar;

// ─── Types ───────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  // D25 — true when the API masked phone/email for this admin role. Drives the
  // "Reveal contact" affordance in the header.
  contactMasked: boolean;
  avatarUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  isFlaggedFraud: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  lifetimeBookings: number;
  lifetimeSpent: number;
  activeBookings: number;
  openDisputes: number;
  averageRatingGiven: number | null;
  totalReviewsGiven: number;
  activeRefreshSessions?: number;
  openSupportCases?: number;
  urgentSupportCases?: number;
  unassignedSupportCases?: number;
  supportOwnerNames?: string[];
  addresses: {
    id: string;
    label: string;
    fullAddress: string;
    barangay: string;
    city: string;
    province: string;
    isDefault: boolean;
  }[];
  sukiProviders: {
    membershipId: string;
    providerId: string;
    providerBusinessName: string;
    tier: string;
    totalBookings: number;
    totalSpent: number;
    pointsBalance: number;
    lastBookingAt: string | null;
  }[];
}

interface BookingsResult {
  rows: {
    id: string;
    providerId: string | null;
    providerBusinessName: string | null;
    categoryName: string;
    status: string;
    totalAmount: number;
    scheduledAt: string;
    completedAt: string | null;
    ratingGiven: number | null;
    hasDispute: boolean;
  }[];
  total: number;
  page: number;
  pageSize: number;
}

interface Payments {
  walletAvailable: number;
  walletPending: number;
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string;
    bookingId: string | null;
    createdAt: string;
  }[];
  recentPaymentIntents: {
    id: string;
    bookingId: string;
    providerId: string | null;
    paymentMethod: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
  paymentMethodCounts: Record<string, number>;
}

interface DisputesResult {
  rows: {
    id: string;
    bookingId: string;
    providerId: string | null;
    providerBusinessName: string | null;
    type: string;
    status: string;
    resolutionType: string | null;
    refundAmount: number;
    filedById?: string;
    filedByRole?: string;
    filedByName?: string;
    createdAt: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
  fraudPattern: {
    disputesInWindow: number;
    windowDays: number;
    favorProviderRate: number | null;
    flagged: boolean;
    reason: string | null;
  };
}

interface ReferralsResult {
  ownCodes: {
    id: string;
    code: string;
    type: string;
    usesCount: number;
    maxUses: number | null;
    referrerBonus: number;
    refereeBonus: number;
    isActive: boolean;
    expiresAt: string | null;
  }[];
  given: {
    id: string;
    refereeId: string;
    refereeName: string;
    refereeBonus: number;
    referrerBonus: number;
    referrerCredited: boolean;
    qualifyingBookingId: string | null;
    createdAt: string;
  }[];
  received: {
    id: string;
    referrerId: string;
    referrerName: string;
    refereeBonus: number;
    refereeCredited: boolean;
    createdAt: string;
  } | null;
  totalEarnedFromReferrals: number;
  totalReferrals: number;
  creditedReferrals: number;
  pendingReferrals: number;
}

interface ActivityRow {
  id: string;
  source: 'audit' | 'login' | 'admin_action';
  action: string;
  detail: string | null;
  actor?: {
    kind: 'customer' | 'admin' | 'system';
    id: string | null;
    name: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const TABS = ['profile', 'bookings', 'payments', 'disputes', 'referrals', 'activity'] as const;
type TabId = (typeof TABS)[number];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCustomerTab(value: string | null): TabId {
  return TABS.includes(value as TabId) ? value as TabId : 'profile';
}

function fmtCentavos(centavos: number): string {
  const pesos = centavos / 100;
  return `₱${pesos.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const customerId = id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseCustomerTab(searchParams.get('tab'));
  const transactionIdFilter = searchParams.get('transactionId')?.trim() ?? '';
  const adminActionIdFilter = searchParams.get('adminActionId')?.trim() ?? '';

  const selectTab = (tab: TabId): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'profile') next.delete('tab');
      else next.set('tab', tab);
      if (tab !== 'payments') next.delete('transactionId');
      if (tab !== 'activity') next.delete('adminActionId');
      return next;
    });
  };

  const clearTransactionFilter = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('transactionId');
      return next;
    });
  };

  const clearAdminActionFilter = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('adminActionId');
      return next;
    });
  };

  const profileQuery = useQuery({
    queryKey: ['admin-customer-profile', customerId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CustomerProfile }>(
        `/api/v1/admin/customers/${customerId}`,
      );
      return res.data.data;
    },
    enabled: !!customerId,
  });

  if (!customerId) {
    return <ErrorState title="Invalid URL" description="Customer ID is missing." />;
  }

  if (profileQuery.isLoading) return <LoadingState />;
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <ErrorState title="Failed to load customer" description={getErrorMessage(profileQuery.error)}
        action={
          <Link to="/customers">
            <Button variant="secondary" size="sm">
              <ArrowLeft size={14} /> Back to customers
            </Button>
          </Link>
        }
      />
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/customers"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> Back to customers
        </Link>
      </div>

      <CustomerHeader profile={profile} />

      <Tabs value={activeTab} onValueChange={(v) => selectTab(v as TabId)}>
        <TabsList className="flex h-auto min-h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
          <TabsTrigger className="min-h-11 shrink-0" value="profile">Profile</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="bookings">Bookings</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="payments">Payments</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="disputes">Disputes</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="referrals">Referrals</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab profile={profile} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab
            customerId={customerId}
            exactTransactionId={transactionIdFilter}
            onClearExactTransaction={clearTransactionFilter}
          />
        </TabsContent>
        <TabsContent value="disputes">
          <DisputesTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="referrals">
          <ReferralsTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab
            customerId={customerId}
            exactAdminActionId={adminActionIdFilter}
            onClearExactAdminAction={clearAdminActionFilter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

export function CustomerHeader({ profile }: { profile: CustomerProfile }): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [showStatus, setShowStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState('');
  const { requestReason, reasonDialog } = useReasonDialog();

  const statusMutation = useMutation({
    mutationFn: async (input: { action: 'suspend' | 'reactivate' | 'flag_fraud'; reason: string }) => {
      const res = await api.put<{ success: boolean; data: { isActive: boolean } }>(
        `/api/v1/admin/customers/${profile.id}/status`,
        input,
      );
      return res.data.data;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-profile', profile.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-activity', profile.id] });
      setShowStatus(false);
      setStatusSuccess(
        input.action === 'suspend'
          ? 'Customer suspended. Every existing access and refresh credential is now invalid.'
          : input.action === 'reactivate'
            ? 'Customer reactivated. They must sign in again.'
            : 'Customer added to the internal fraud-review queue.',
      );
    },
  });

  async function requestStatusAction(
    action: 'suspend' | 'reactivate' | 'flag_fraud',
  ): Promise<void> {
    setStatusSuccess('');
    const reason = await requestReason({
      title:
        action === 'suspend'
          ? `Suspend ${profile.fullName}?`
          : action === 'reactivate'
            ? `Reactivate ${profile.fullName}?`
            : `Flag ${profile.fullName} for fraud review?`,
      description:
        action === 'suspend'
          ? `Suspension immediately invalidates every issued access and refresh credential. It does not cancel ${profile.activeBookings} active booking${profile.activeBookings === 1 ? '' : 's'}, move wallet funds, or resolve ${profile.openDisputes} open dispute${profile.openDisputes === 1 ? '' : 's'}; support must manage those records separately. The audit reason stays internal; the customer receives a generic account-status notice.`
          : action === 'reactivate'
            ? 'Reactivation restores sign-in but does not clear a fraud-review flag, alter bookings, or move money. Suspended sessions were revoked, so the customer must sign in again. The audit reason stays internal; the customer receives a generic account-status notice.'
            : 'This adds an internal fraud-review marker only. It does not suspend the customer, cancel bookings, move money, decide a dispute, or notify the customer.',
      confirmLabel:
        action === 'suspend'
          ? 'Suspend customer'
          : action === 'reactivate'
            ? 'Reactivate customer'
            : 'Flag for review',
      reasonLabel:
        action === 'suspend'
          ? 'Suspension reason'
          : action === 'reactivate'
            ? 'Reactivation reason'
            : 'Fraud-review reason',
      placeholder:
        action === 'flag_fraud'
          ? 'Record the observable pattern, linked cases, and evidence to review.'
          : 'Record the support case, evidence, and decision basis.',
      minLength: 10,
      maxLength: 1000,
      tone: action === 'suspend' ? 'destructive' : 'default',
    });
    if (reason) statusMutation.mutate({ action, reason });
  }

  // D25 — reveal raw contact. The reveal is audit-logged server-side; we keep
  // the raw values in local state only (never re-cached in the query).
  const [revealed, setRevealed] = useState<{ phone: string; email: string | null } | null>(null);
  const revealMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; data: { phone: string; email: string | null } }>(
        `/api/v1/admin/customers/${profile.id}/reveal-contact`,
        {},
      );
      return res.data.data;
    },
    onSuccess: (data) => setRevealed(data),
  });
  const shownPhone = revealed?.phone ?? profile.phone;
  const shownEmail = revealed ? revealed.email : profile.email;

  const revokeSessionsMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await api.post<{
        success: boolean;
        data: { revokedRefreshSessions: number; sessionVersion: number };
      }>(`/api/v1/admin/customers/${profile.id}/revoke-sessions`, { reason });
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-profile', profile.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-activity', profile.id] });
      setStatusSuccess(
        `Forced sign-out completed. ${data.revokedRefreshSessions} remembered sign-in${data.revokedRefreshSessions === 1 ? '' : 's'} removed and every older credential invalidated.`,
      );
    },
  });

  async function requestSessionRevocation(): Promise<void> {
    setStatusSuccess('');
    const reason = await requestReason({
      title: `Force ${profile.fullName} to sign in again?`,
      description: 'This immediately invalidates every current access and refresh credential on all devices. It does not suspend the account or change any booking, dispute, payment, or wallet record.',
      confirmLabel: 'Force sign-out',
      reasonLabel: 'Security or support reason',
      placeholder: 'Record the support case, security concern, or customer request.',
      minLength: 10,
      maxLength: 1000,
      tone: 'destructive',
    });
    if (reason) revokeSessionsMutation.mutate(reason);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="w-16 h-16 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center overflow-hidden">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.fullName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-[var(--color-text-secondary)]">
              {/* Phase L MED-L04 fix — fall back to '?' when firstName is
                   missing during loading state. */}
              {(profile.firstName ?? '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{profile.fullName}</h1>
            <Badge label={profile.isActive ? 'active' : 'suspended'} variant={profile.isActive ? 'success' : 'danger'} />
            {profile.isFlaggedFraud && <Badge label="fraud review" variant="warning" />}
            {profile.isVerified && <Badge label="verified" variant="info" />}
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--color-text-secondary)] flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Phone size={14} /> {shownPhone}
            </span>
            {shownEmail && (
              <span className="inline-flex items-center gap-1">
                <Mail size={14} /> {shownEmail}
              </span>
            )}
            {/* D25 — masked contact + audit-logged reveal. Once revealed the
                 button disappears and a note explains the lookup was logged. */}
            {profile.contactMasked && !revealed && (
              <button
                type="button"
                onClick={() => revealMutation.mutate()}
                disabled={revealMutation.isPending}
                className="inline-flex items-center gap-1 text-[var(--color-secondary)] hover:underline disabled:opacity-50"
              >
                <Eye size={14} /> {revealMutation.isPending ? 'Revealing…' : 'Reveal contact'}
              </button>
            )}
            {revealed && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
                shown to you only · this lookup was logged
              </span>
            )}
            {revealMutation.isError && (
              <span role="alert" className="text-xs text-[var(--color-danger)]">
                {getErrorMessage(revealMutation.error)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} /> joined {new Date(profile.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
            </span>
            {/* BUG-PHASE39-05 fix — lastLoginAt was on the API payload
                 and the CustomerProfile interface but never rendered in
                 the header. Admins benefit from seeing recency at a
                 glance (dormant accounts vs. churn risk vs. compromised
                 inactive accounts). */}
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} /> last login{' '}
              {profile.lastLoginAt
                ? new Date(profile.lastLoginAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })
                : 'never'}
            </span>
            {profile.averageRatingGiven != null && (
              <span className="inline-flex items-center gap-1">
                {/* Phase L MED-L04 fix — averageRatingGiven was checked for
                     `!== null` but not for undefined; loose != null catches
                     both. */}
                <Star size={14} /> gives {profile.averageRatingGiven.toFixed(2)} avg
                ({profile.totalReviewsGiven ?? 0})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/support-tickets?new=1&userId=${encodeURIComponent(profile.id)}&userRole=customer&userName=${encodeURIComponent(profile.fullName)}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
          >
            <MessageSquare size={14} /> Create support case
          </Link>
          <Link
            to={`/support-tickets?relatedCustomerId=${encodeURIComponent(profile.id)}&userRole=customer&userName=${encodeURIComponent(profile.fullName)}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-primary)]"
          >
            View support history
          </Link>
          {isSuperAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setShowStatus((s) => !s)}>
              <Flag size={14} /> Manage status
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Open support</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{profile.openSupportCases ?? 0}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {profile.urgentSupportCases ?? 0} urgent · {profile.unassignedSupportCases ?? 0} unassigned
          </p>
        </div>
        <div className="sm:col-span-1 xl:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Support ownership</p>
          <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
            {(profile.supportOwnerNames ?? []).length > 0
              ? (profile.supportOwnerNames ?? []).join(', ')
              : (profile.openSupportCases ?? 0) > 0
                ? 'No owner assigned'
                : 'No open support cases'}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">Owners across this customer’s open cases</p>
        </div>
        <div className="flex items-start justify-between gap-3 sm:col-span-2 xl:col-span-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Remembered sign-ins</p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{profile.activeRefreshSessions ?? 0}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">All registered devices</p>
          </div>
          {isSuperAdmin && (
            <Button
              variant="destructive"
              size="sm"
              disabled={revokeSessionsMutation.isPending}
              onClick={() => void requestSessionRevocation()}
            >
              Force sign-out
            </Button>
          )}
        </div>
      </div>

      {revokeSessionsMutation.isError && (
        <p role="alert" className="mt-3 text-xs text-[var(--color-danger)]">
          {getErrorMessage(revokeSessionsMutation.error)}
        </p>
      )}

      {showStatus && isSuperAdmin && (
        <div className="mt-4 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-hover)] space-y-3">
          <p className="text-sm font-medium text-[var(--color-text)]">Status action</p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Every decision requires a reason and is written to the customer activity record. Account actions do not cancel bookings, move money, or resolve disputes.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="destructive"
              disabled={statusMutation.isPending || !profile.isActive}
              onClick={() => void requestStatusAction('suspend')}
            >
              Suspend
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={statusMutation.isPending || profile.isActive}
              onClick={() => void requestStatusAction('reactivate')}
            >
              Reactivate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={statusMutation.isPending || profile.isFlaggedFraud}
              onClick={() => void requestStatusAction('flag_fraud')}
            >
              {profile.isFlaggedFraud ? 'Fraud review flagged' : 'Flag for fraud review'}
            </Button>
            {statusMutation.isError && (
              <span role="alert" className="text-xs text-red-600 ml-2">{getErrorMessage(statusMutation.error)}</span>
            )}
          </div>
        </div>
      )}
      {statusSuccess && <p role="status" className="mt-3 text-sm text-[var(--color-success)]">{statusSuccess}</p>}
      {reasonDialog}
    </Card>
  );
}

// ─── ProfileTab ───────────────────────────────────────────────────────────

function ProfileTab({ profile }: { profile: CustomerProfile }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Phase L MED-L04 fix — coalesce missing aggregate counts so the
           KPI cards render '0' instead of throwing on .toString. */}
      <KpiCard title="Lifetime bookings" value={(profile.lifetimeBookings ?? 0).toString()} icon={<FileText size={16} />} />
      <KpiCard title="Lifetime spent" value={fmtCentavos(profile.lifetimeSpent ?? 0)} icon={<Coins size={16} />} />
      <KpiCard
        title="Avg rating given"
        value={profile.averageRatingGiven != null ? profile.averageRatingGiven.toFixed(2) : '—'}
        icon={<Star size={16} />}
      />

      <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Addresses</h3>
        {/* Phase L MED-L04 fix — guard against missing addresses array. */}
        {(profile.addresses ?? []).length === 0 ? (
          <EmptyState title="No saved addresses." />
        ) : (
          <div className="space-y-2">
            {(profile.addresses ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 border border-[var(--color-border)] rounded-md"
              >
                <MapPin size={16} className="mt-0.5 text-[var(--color-text-secondary)]" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)]">{a.label}</span>
                    {a.isDefault && <Badge label="default" variant="info" />}
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{a.fullAddress}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {a.barangay}, {a.city}, {a.province}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Heart size={14} /> Suki providers
        </h3>
        {(profile.sukiProviders ?? []).length === 0 ? (
          <EmptyState title="No suki relationships yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Tier</th>
                  <th className="px-3 py-2 text-right">Bookings</th>
                  <th className="px-3 py-2 text-right">Total spent</th>
                  <th className="px-3 py-2 text-right">Points</th>
                  <th className="px-3 py-2 text-left">Last booking</th>
                </tr>
              </thead>
              <tbody>
                {(profile.sukiProviders ?? []).map((s) => (
                  <tr key={s.membershipId} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <Link
                        to={`/providers/${s.providerId}`}
                        className="text-[var(--color-secondary)] hover:underline"
                      >
                        {s.providerBusinessName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Badge label={s.tier} variant={s.tier === 'super_suki' ? 'success' : 'info'} />
                    </td>
                    <td className="px-3 py-2 text-right">{s.totalBookings}</td>
                    <td className="px-3 py-2 text-right">{fmtCentavos(s.totalSpent)}</td>
                    <td className="px-3 py-2 text-right">{s.pointsBalance}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(s.lastBookingAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── BookingsTab ──────────────────────────────────────────────────────────

export function BookingsTab({ customerId }: { customerId: string }): React.ReactElement {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const pageSize = 20;

  const q = useQuery({
    queryKey: ['admin-customer-bookings', customerId, page, status],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (status) params.status = status;
      const res = await api.get<{ success: boolean; data: BookingsResult }>(
        `/api/v1/admin/customers/${customerId}/bookings`,
        { params },
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data!;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="Filter customer bookings by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white"
        >
          {/* BUG-PHASE39-06 fix — pre-fix this list was missing many
               status values that the booking pipeline produces:
               quoted, matched, payment_pending, provider_en_route,
               provider_arrived, completed_by_provider, payout_ready,
               paid_out, resolved, cancelled_by_provider,
               cancelled_by_admin. Admins couldn't filter to those.
               Now mirrors the comprehensive list on BookingsPage. */}
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="quoted">Quoted</option>
          <option value="matched">Matched</option>
          <option value="payment_pending">Payment pending</option>
          <option value="paid">Paid</option>
          <option value="provider_en_route">En route</option>
          <option value="provider_arrived">Arrived</option>
          <option value="in_progress">In progress</option>
          <option value="completed_by_provider">Completed by provider</option>
          <option value="confirmed">Confirmed</option>
          <option value="payout_ready">Payout ready</option>
          <option value="paid_out">Paid out</option>
          <option value="disputed">Disputed</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled_by_customer">Cancelled (customer)</option>
          <option value="cancelled_by_provider">Cancelled (provider)</option>
          <option value="cancelled_by_admin">Cancelled (admin)</option>
        </select>
        <span className="text-xs text-[var(--color-text-secondary)]">{data.total} total</span>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No bookings match." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Booking</th>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Scheduled</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <Link
                        to={`/bookings/${r.id}`}
                        aria-label={`Open booking ${r.id}`}
                        className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
                      >
                        {r.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {r.providerBusinessName ? (
                        <Link
                          to={`/providers/${r.providerId}`}
                          className="text-[var(--color-secondary)] hover:underline"
                        >
                          {r.providerBusinessName}
                        </Link>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.categoryName}</td>
                    <td className="px-3 py-2">
                      <Badge label={r.status} variant={r.status.startsWith('cancelled') ? 'danger' : 'info'} />
                      {r.hasDispute && (
                        <span className="ml-1 inline-flex items-center text-xs text-[var(--color-warning)]">
                          <AlertTriangle size={12} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtCentavos(r.totalAmount)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(r.scheduledAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.ratingGiven !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star size={12} /> {r.ratingGiven}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))}
        onPageChange={setPage}
      />
    </div>
  );
}

// ─── PaymentsTab ──────────────────────────────────────────────────────────

export function PaymentsTab({
  customerId,
  exactTransactionId = '',
  onClearExactTransaction,
}: {
  customerId: string;
  exactTransactionId?: string;
  onClearExactTransaction?: () => void;
}): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [amountPesos, setAmountPesos] = useState('');
  const [reason, setReason] = useState('');
  const rawTransactionId = exactTransactionId.trim();
  const hasExactTransaction = rawTransactionId.length > 0;
  const hasValidExactTransaction = UUID_REGEX.test(rawTransactionId);
  const requestedTransactionId = hasValidExactTransaction
    ? rawTransactionId.toLowerCase()
    : rawTransactionId;
  const parsedAmount = Number(amountPesos);
  const adjustmentCentavos = Number.isFinite(parsedAmount) && parsedAmount !== 0
    ? Math.round(parsedAmount * 100)
    : null;

  const q = useQuery({
    queryKey: ['admin-customer-payments', customerId, requestedTransactionId],
    queryFn: async () => {
      const path = `/api/v1/admin/customers/${customerId}/payments`;
      const res = hasExactTransaction
        ? await api.get<{ success: boolean; data: Payments }>(
            path,
            { params: { transactionId: requestedTransactionId } },
          )
        : await api.get<{ success: boolean; data: Payments }>(path);
      return res.data.data;
    },
    enabled: !hasExactTransaction || hasValidExactTransaction,
  });

  const credit = useMutation({
    mutationFn: async (input: { amount: number; reason: string }) => {
      const res = await api.post<{ success: boolean; data: { newAvailableBalance: number; transactionId: string } }>(
        `/api/v1/admin/customers/${customerId}/credit`,
        input,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-payments', customerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-profile', customerId] });
      setAmountPesos('');
      setReason('');
    },
  });

  if (hasExactTransaction && !hasValidExactTransaction) {
    return (
      <ErrorState
        title="Invalid wallet transaction link"
        description="Wallet transaction ID must be a complete UUID. No payment records were requested."
        action={onClearExactTransaction ? (
          <Button variant="secondary" size="sm" onClick={onClearExactTransaction}>
            Clear transaction selection
          </Button>
        ) : undefined}
      />
    );
  }
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data!;
  const exactTransaction = hasExactTransaction
    ? data.recentTransactions.find((transaction) => transaction.id === requestedTransactionId) ?? null
    : null;
  const visibleTransactions = hasExactTransaction
    ? exactTransaction ? [exactTransaction] : []
    : data.recentTransactions;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {hasExactTransaction && exactTransaction && (
        <Card className="border-2 border-[var(--color-secondary)] bg-[var(--color-secondary)]/5 p-4 md:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Exact customer wallet transaction</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                This row is scoped by both the customer account and transaction ID retained by the audit decision.
              </p>
            </div>
            {onClearExactTransaction && (
              <Button variant="secondary" size="sm" onClick={onClearExactTransaction}>
                Show recent payment history
              </Button>
            )}
          </div>
        </Card>
      )}
      {hasExactTransaction && !exactTransaction && (
        <Card className="border-2 border-[var(--color-warning)] bg-[var(--color-warning)]/5 p-4 md:col-span-3" role="alert">
          <p className="text-sm font-semibold text-[var(--color-text)]">Wallet transaction is not in this customer ledger</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            The requested transaction was deleted, never belonged to this customer, or is unavailable. No substitute transaction is shown; return to the Audit Log for the durable decision record.
          </p>
          {onClearExactTransaction && (
            <Button className="mt-3" variant="secondary" size="sm" onClick={onClearExactTransaction}>
              Show recent payment history
            </Button>
          )}
        </Card>
      )}
      <KpiCard
        title="Wallet available"
        value={fmtCentavos(data.walletAvailable)}
        icon={<Wallet size={16} />}
      />
      <KpiCard
        title="Wallet pending"
        value={fmtCentavos(data.walletPending)}
        icon={<Coins size={16} />}
      />
      <KpiCard
        title="Payment methods used"
        value={Object.keys(data.paymentMethodCounts).length.toString()}
        icon={<CreditCard size={16} />}
      />

      {isSuperAdmin && !hasExactTransaction && (
        <Card className="p-5 md:col-span-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Adjust customer wallet</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Positive amount credits the customer wallet; negative debits. Logged to{' '}
            <code>admin_actions</code> + paired <code>wallet_transactions</code> ledger row inside a
            transaction (money conservation enforced).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label htmlFor="customer-wallet-adjust-amount" className="text-xs text-[var(--color-text-secondary)]">Amount (PHP)</label>
              <input
                id="customer-wallet-adjust-amount"
                type="number"
                step="0.01"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                placeholder="100.00"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="customer-wallet-adjust-reason" className="text-xs text-[var(--color-text-secondary)]">Reason (min 5 chars)</label>
              <input
                id="customer-wallet-adjust-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Goodwill credit for delayed booking #..."
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              disabled={
                credit.isPending ||
                reason.trim().length < 5 ||
                adjustmentCentavos === null
              }
              onClick={() =>
                adjustmentCentavos !== null
                  ? credit.mutate({ amount: adjustmentCentavos, reason })
                  : undefined
              }
            >
              Submit wallet adjustment
            </Button>
            {credit.isError && (
              <span role="alert" className="text-xs text-red-600">{getErrorMessage(credit.error)}</span>
            )}
            {credit.isSuccess && (
              <span className="text-xs text-green-600">
                New balance: {fmtCentavos(credit.data.newAvailableBalance)}
              </span>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
          {hasExactTransaction ? 'Wallet transaction evidence' : 'Recent wallet transactions'}
        </h3>
        {visibleTransactions.length === 0 ? (
          !hasExactTransaction ? <EmptyState title="No wallet transactions yet." /> : null
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Booking</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Balance after</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map((t) => (
                  <tr
                    key={t.id}
                    aria-current={hasExactTransaction ? 'true' : undefined}
                    className={hasExactTransaction
                      ? 'border-t border-[var(--color-secondary)] bg-[var(--color-secondary)]/5'
                      : 'border-t border-[var(--color-border)]'}
                  >
                    <td className="px-3 py-2">
                      <Badge label={t.type} variant="info" />
                    </td>
                    <td className="px-3 py-2">
                      {t.bookingId ? (
                        <Link
                          to={`/bookings/${t.bookingId}`}
                          aria-label={`Open booking ${t.bookingId}`}
                          className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
                        >
                          {t.bookingId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${t.amount < 0 ? 'text-red-600' : 'text-green-700'}`}
                    >
                      {fmtCentavos(t.amount)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtCentavos(t.balanceAfter)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {t.description}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!hasExactTransaction && <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Recent payment intents</h3>
        {data.recentPaymentIntents.length === 0 ? (
          <EmptyState title="No payment intents yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Attempt</th>
                  <th className="px-3 py-2 text-left">Booking</th>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPaymentIntents.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <Link
                        to={`/financials?tab=payments&paymentAttemptId=${encodeURIComponent(p.id)}`}
                        aria-label={`Open payment attempt ${p.id}`}
                        className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
                      >
                        {p.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/bookings/${p.bookingId}`}
                        aria-label={`Open booking ${p.bookingId}`}
                        className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
                      >
                        {p.bookingId.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {p.providerId ? (
                        <Link
                          to={`/providers/${p.providerId}`}
                          aria-label={`Open provider ${p.providerId}`}
                          className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
                        >
                          {p.providerId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{p.paymentMethod}</td>
                    <td className="px-3 py-2">
                      <Badge
                        label={p.status}
                        variant={p.status === 'succeeded' ? 'success' : p.status === 'failed' ? 'danger' : 'info'}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{fmtCentavos(p.amount)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>}
    </div>
  );
}

// ─── DisputesTab ──────────────────────────────────────────────────────────

export function DisputesTab({ customerId }: { customerId: string }): React.ReactElement {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin-customer-disputes', customerId, page],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DisputesResult }>(
        `/api/v1/admin/customers/${customerId}/disputes?page=${page}&pageSize=20`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data!;
  const fraudWindowDays = data.fraudPattern.windowDays ?? 30;
  const disputesInWindow = data.fraudPattern.disputesInWindow ?? 0;

  return (
    <div className="space-y-4">
      {data.fraudPattern.flagged && (
        <Card className="p-4 border-2 border-[var(--color-warning)] bg-[var(--color-warning)]/5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-[var(--color-warning)] mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Possible fraud pattern</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                {data.fraudPattern.reason}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          title={`Disputes (last ${fraudWindowDays}d)`}
          value={disputesInWindow.toString()}
          icon={<AlertTriangle size={16} />}
        />
        <KpiCard
          title="Linked disputes"
          value={(data.total ?? data.rows.length).toString()}
          icon={<FileText size={16} />}
        />
        <KpiCard
          title={`No-refund rate (${fraudWindowDays}d)`}
          value={
            data.fraudPattern.favorProviderRate === null
              ? '—'
              : `${Math.round(data.fraudPattern.favorProviderRate * 100)}%`
          }
          icon={<Flag size={16} />}
        />
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No disputes linked to this customer’s bookings." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Booking / Provider</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Resolution</th>
                  <th className="px-3 py-2 text-left">Filed by</th>
                  <th className="px-3 py-2 text-right">Refund</th>
                  <th className="px-3 py-2 text-left">Filed</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-xs">
                      <Link
                        to={`/disputes/${d.id}`}
                        aria-label={`Open dispute ${d.id}`}
                        className="block text-[var(--color-secondary)] hover:underline"
                      >
                        Dispute {d.id.slice(0, 8)}…
                      </Link>
                      <Link
                        to={`/bookings/${d.bookingId}`}
                        aria-label={`Open booking ${d.bookingId}`}
                        className="block font-mono text-[var(--color-secondary)] hover:underline"
                      >
                        Booking {d.bookingId.slice(0, 8)}…
                      </Link>
                      {d.providerId ? (
                        <Link
                          to={`/providers/${d.providerId}`}
                          aria-label={`Open provider ${d.providerId}`}
                          className="block text-[var(--color-secondary)] hover:underline"
                        >
                          {d.providerBusinessName ?? 'Open provider'}
                        </Link>
                      ) : (
                        <span className="block text-[var(--color-text-secondary)]">No provider assigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{d.type}</td>
                    <td className="px-3 py-2">
                      <Badge label={d.status} variant={d.status === 'resolved' ? 'success' : 'info'} />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {d.resolutionType ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="block font-medium text-[var(--color-text)]">{d.filedByName ?? 'Unknown user'}</span>
                      <span className="capitalize text-[var(--color-text-secondary)]">{d.filedByRole ?? 'unknown role'}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{fmtCentavos(d.refundAmount)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(d.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {(data.total ?? 0) > (data.pageSize ?? 20) && (
        <Pagination
          page={data.page ?? page}
          totalPages={Math.ceil((data.total ?? 0) / (data.pageSize ?? 20))}
          total={data.total ?? 0}
          pageSize={data.pageSize ?? 20}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

// ─── ReferralsTab ─────────────────────────────────────────────────────────

export function ReferralsTab({ customerId }: { customerId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-customer-referrals', customerId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ReferralsResult }>(
        `/api/v1/admin/customers/${customerId}/referrals`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data!;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard
        title="Total earned from referrals"
        value={fmtCentavos(data.totalEarnedFromReferrals)}
        icon={<Coins size={16} />}
      />
      <KpiCard
        title="Friends referred"
        value={data.totalReferrals.toString()}
        icon={<Heart size={16} />}
      />
      <KpiCard
        title="Pending first completed booking"
        value={data.pendingReferrals.toString()}
        icon={<Clock size={16} />}
      />
      <KpiCard
        title="Was referred by"
        value={data.received ? data.received.referrerName : '—'}
        icon={<Flag size={16} />}
      />

      {data.received && (
        <Card className="p-4 md:col-span-2 xl:col-span-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Referral origin:{' '}
            <Link
              to={`/customers/${data.received.referrerId}`}
              aria-label={`Open referring customer ${data.received.referrerId}`}
              className="font-medium text-[var(--color-secondary)] hover:underline"
            >
              {data.received.referrerName}
            </Link>
            {' · '}{data.received.refereeCredited ? 'customer bonus credited' : 'customer bonus pending'}
            {' · '}{fmtDate(data.received.createdAt)}
          </p>
        </Card>
      )}

      <Card className="p-5 md:col-span-2 xl:col-span-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">My referral codes</h3>
        {data.ownCodes.length === 0 ? (
          <EmptyState title="No referral codes yet." />
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Uses</th>
                <th className="px-3 py-2 text-right">Bonus (each)</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Expires</th>
              </tr>
            </thead>
            <tbody>
              {data.ownCodes.map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-mono">{c.code}</td>
                  <td className="px-3 py-2">{c.type}</td>
                  <td className="px-3 py-2 text-right">
                    {c.usesCount}
                    {c.maxUses !== null ? ` / ${c.maxUses}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCentavos(c.referrerBonus)}</td>
                  <td className="px-3 py-2">
                    <Badge label={c.isActive ? 'active' : 'inactive'} variant={c.isActive ? 'success' : 'danger'} />
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {fmtDate(c.expiresAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {data.totalReferrals > data.given.length && (
        <p className="md:col-span-2 xl:col-span-4 text-xs text-[var(--color-text-secondary)]">
          Showing the latest {data.given.length} of {data.totalReferrals} referral records. Totals above use the complete referral ledger.
        </p>
      )}

      <Card className="p-5 md:col-span-2 xl:col-span-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Referrals given</h3>
        {data.given.length === 0 ? (
          <EmptyState title="Hasn't referred anyone yet." />
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Friend</th>
                <th className="px-3 py-2 text-right">Bonus</th>
                <th className="px-3 py-2 text-left">Credited</th>
                <th className="px-3 py-2 text-left">Qualifying booking</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.given.map((g) => (
                <tr key={g.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    <Link
                      to={`/customers/${g.refereeId}`}
                      aria-label={`Open referred customer ${g.refereeId}`}
                      className="text-[var(--color-secondary)] hover:underline"
                    >
                      {g.refereeName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCentavos(g.referrerBonus)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      label={g.referrerCredited ? 'credited' : 'pending'}
                      variant={g.referrerCredited ? 'success' : 'info'}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)]">
                    {g.qualifyingBookingId ? (
                      <Link
                        to={`/bookings/${g.qualifyingBookingId}`}
                        aria-label={`Open qualifying booking ${g.qualifyingBookingId}`}
                        className="text-[var(--color-secondary)] hover:underline"
                      >
                        {g.qualifyingBookingId.slice(0, 8)}…
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {fmtDate(g.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── ActivityTab ──────────────────────────────────────────────────────────

export function ActivityTab({
  customerId,
  exactAdminActionId = '',
  onClearExactAdminAction,
}: {
  customerId: string;
  exactAdminActionId?: string;
  onClearExactAdminAction?: () => void;
}): React.ReactElement {
  const [limit, setLimit] = useState(50);
  const requestedAdminActionId = exactAdminActionId.trim();
  const hasExactAdminAction = requestedAdminActionId.length > 0;
  const hasValidExactAdminAction = UUID_REGEX.test(requestedAdminActionId);
  const q = useQuery({
    queryKey: ['admin-customer-activity', customerId, limit, requestedAdminActionId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ActivityRow[] }>(
        `/api/v1/admin/customers/${customerId}/activity`,
        {
          params: hasExactAdminAction
            ? { limit: 1, adminActionId: requestedAdminActionId }
            : { limit },
        },
      );
      return res.data.data;
    },
    enabled: !hasExactAdminAction || hasValidExactAdminAction,
  });

  if (hasExactAdminAction && !hasValidExactAdminAction) {
    return (
      <ErrorState
        title="Invalid customer activity link"
        description="Admin action ID must be a complete UUID. No activity records were requested."
        action={onClearExactAdminAction ? (
          <Button variant="secondary" size="sm" onClick={onClearExactAdminAction}>
            Clear activity selection
          </Button>
        ) : undefined}
      />
    );
  }
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const rows = q.data!;
  const exactActivity = hasExactAdminAction
    ? rows.find((row) => row.id === `admin_action:${requestedAdminActionId}`) ?? null
    : null;
  const visibleRows = hasExactAdminAction ? exactActivity ? [exactActivity] : [] : rows;

  return (
    <div className="space-y-3">
      {hasExactAdminAction && exactActivity && (
        <Card className="border-2 border-[var(--color-secondary)] bg-[var(--color-secondary)]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Exact customer account decision</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                This activity row is scoped by both the customer account and admin-action ID retained by the Audit Log.
              </p>
            </div>
            {onClearExactAdminAction && (
              <Button variant="secondary" size="sm" onClick={onClearExactAdminAction}>
                Show recent customer activity
              </Button>
            )}
          </div>
        </Card>
      )}
      {hasExactAdminAction && !exactActivity && (
        <Card className="border-2 border-[var(--color-warning)] bg-[var(--color-warning)]/5 p-4" role="alert">
          <p className="text-sm font-semibold text-[var(--color-text)]">Admin decision is not in this customer activity file</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            The requested decision never belonged to this customer or is unavailable. No substitute activity is shown; return to the Audit Log for the durable event record.
          </p>
          {onClearExactAdminAction && (
            <Button className="mt-3" variant="secondary" size="sm" onClick={onClearExactAdminAction}>
              Show recent customer activity
            </Button>
          )}
        </Card>
      )}
      {!hasExactAdminAction && <div className="flex items-center gap-2">
        <select
          aria-label="Activity row limit"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white"
        >
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
        </select>
      </div>}
      {visibleRows.length === 0 ? (
        !hasExactAdminAction ? <EmptyState title="No activity recorded." /> : null
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Detail</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">Device / client</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr
                    key={r.id}
                    aria-current={hasExactAdminAction ? 'true' : undefined}
                    className={hasExactAdminAction
                      ? 'border-t border-[var(--color-secondary)] bg-[var(--color-secondary)]/5'
                      : 'border-t border-[var(--color-border)]'}
                  >
                    <td className="px-3 py-2">
                      <Badge
                        label={r.source}
                        variant={
                          r.source === 'admin_action'
                            ? 'danger'
                            : r.source === 'login'
                              ? 'info'
                              : 'success'
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p className="font-medium text-[var(--color-text)]">
                        {r.actor?.name ?? (r.actor?.kind === 'system' ? 'System' : 'Unknown user')}
                      </p>
                      <p className="text-[var(--color-text-secondary)]">
                        {r.actor?.kind ?? 'unknown'}{r.actor?.id ? ` · ${r.actor.id.slice(0, 8)}…` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2">{r.action}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {r.detail ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">{r.ipAddress ?? '—'}</td>
                    <td className="max-w-xs px-3 py-2 text-xs text-[var(--color-text-secondary)] break-words">
                      {r.userAgent ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
