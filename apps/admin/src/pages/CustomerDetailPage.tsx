/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 06 — Customer 360 admin page.
 *
 * 6 tabs: Profile, Bookings, Payments, Disputes, Referrals, Activity.
 * Mirrors the structure of ProviderDetailPage.tsx (Phase 05).
 */

import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { Textarea } from '@/components/ui/Textarea';
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
  lastLoginAt: string | null;
  createdAt: string;
  lifetimeBookings: number;
  lifetimeSpent: number;
  averageRatingGiven: number | null;
  totalReviewsGiven: number;
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
    providerBusinessName: string | null;
    type: string;
    status: string;
    resolutionType: string | null;
    refundAmount: number;
    createdAt: string;
  }[];
  fraudPattern: {
    disputesLast30Days: number;
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
}

interface ActivityRow {
  id: string;
  source: 'audit' | 'login' | 'admin_action';
  action: string;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const TABS = ['profile', 'bookings', 'payments', 'disputes', 'referrals', 'activity'] as const;
void TABS;
type TabId = (typeof TABS)[number];

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
  const [tab, setTab] = useState<TabId>('profile');

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab profile={profile} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="disputes">
          <DisputesTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="referrals">
          <ReferralsTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab customerId={customerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function CustomerHeader({ profile }: { profile: CustomerProfile }): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [statusReason, setStatusReason] = useState('');
  const [showStatus, setShowStatus] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (input: { action: 'suspend' | 'reactivate' | 'flag_fraud'; reason: string }) => {
      const res = await api.put<{ success: boolean; data: { isActive: boolean } }>(
        `/api/v1/admin/customers/${profile.id}/status`,
        input,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-profile', profile.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-activity', profile.id] });
      setStatusReason('');
      setShowStatus(false);
    },
  });

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
            to={`/support-tickets?userId=${encodeURIComponent(profile.id)}&userRole=customer&userName=${encodeURIComponent(profile.fullName)}`}
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

      {showStatus && isSuperAdmin && (
        <div className="mt-4 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-hover)] space-y-3">
          <p className="text-sm font-medium text-[var(--color-text)]">Status action</p>
          <Textarea
            aria-label="Status action reason"
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="Reason (min 5 characters) — recorded in admin_actions ledger"
            rows={2}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="destructive"
              disabled={statusMutation.isPending || statusReason.trim().length < 5 || !profile.isActive}
              onClick={() => {
                if (window.confirm('Suspend this customer account?')) {
                  statusMutation.mutate({ action: 'suspend', reason: statusReason });
                }
              }}
            >
              Suspend
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={statusMutation.isPending || statusReason.trim().length < 5 || profile.isActive}
              onClick={() => statusMutation.mutate({ action: 'reactivate', reason: statusReason })}
            >
              Reactivate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={statusMutation.isPending || statusReason.trim().length < 5}
              onClick={() => {
                if (window.confirm('Flag this customer for fraud review?')) {
                  statusMutation.mutate({ action: 'flag_fraud', reason: statusReason });
                }
              }}
            >
              Flag for fraud
            </Button>
            {statusMutation.isError && (
              <span role="alert" className="text-xs text-red-600 ml-2">{getErrorMessage(statusMutation.error)}</span>
            )}
          </div>
        </div>
      )}
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

function BookingsTab({ customerId }: { customerId: string }): React.ReactElement {
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

function PaymentsTab({ customerId }: { customerId: string }): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [amountPesos, setAmountPesos] = useState('');
  const [reason, setReason] = useState('');
  const parsedAmount = Number(amountPesos);
  const adjustmentCentavos = Number.isFinite(parsedAmount) && parsedAmount !== 0
    ? Math.round(parsedAmount * 100)
    : null;

  const q = useQuery({
    queryKey: ['admin-customer-payments', customerId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Payments }>(
        `/api/v1/admin/customers/${customerId}/payments`,
      );
      return res.data.data;
    },
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

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data!;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {isSuperAdmin && (
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
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Recent wallet transactions</h3>
        {data.recentTransactions.length === 0 ? (
          <EmptyState title="No wallet transactions yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Balance after</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <Badge label={t.type} variant="info" />
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

      <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Recent payment intents</h3>
        {data.recentPaymentIntents.length === 0 ? (
          <EmptyState title="No payment intents yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPaymentIntents.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--color-border)]">
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
      </Card>
    </div>
  );
}

// ─── DisputesTab ──────────────────────────────────────────────────────────

function DisputesTab({ customerId }: { customerId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-customer-disputes', customerId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DisputesResult }>(
        `/api/v1/admin/customers/${customerId}/disputes`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const data = q.data!;

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
          title="Disputes (last 30d)"
          value={data.fraudPattern.disputesLast30Days.toString()}
          icon={<AlertTriangle size={16} />}
        />
        <KpiCard
          title="Total disputes filed"
          value={data.rows.length.toString()}
          icon={<FileText size={16} />}
        />
        <KpiCard
          title="Favor-provider rate (30d)"
          value={
            data.fraudPattern.favorProviderRate === null
              ? '—'
              : `${Math.round(data.fraudPattern.favorProviderRate * 100)}%`
          }
          icon={<Flag size={16} />}
        />
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No disputes filed by this customer." />
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
                  <th className="px-3 py-2 text-right">Refund</th>
                  <th className="px-3 py-2 text-left">Filed</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-xs">
                      <p className="font-mono">{d.bookingId.slice(0, 8)}…</p>
                      <p className="text-[var(--color-text-secondary)]">
                        {d.providerBusinessName ?? '—'}
                      </p>
                    </td>
                    <td className="px-3 py-2">{d.type}</td>
                    <td className="px-3 py-2">
                      <Badge label={d.status} variant={d.status === 'resolved' ? 'success' : 'info'} />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {d.resolutionType ?? '—'}
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
    </div>
  );
}

// ─── ReferralsTab ─────────────────────────────────────────────────────────

function ReferralsTab({ customerId }: { customerId: string }): React.ReactElement {
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KpiCard
        title="Total earned from referrals"
        value={fmtCentavos(data.totalEarnedFromReferrals)}
        icon={<Coins size={16} />}
      />
      <KpiCard
        title="Friends referred"
        value={data.given.length.toString()}
        icon={<Heart size={16} />}
      />
      <KpiCard
        title="Was referred by"
        value={data.received ? data.received.referrerName : '—'}
        icon={<Flag size={16} />}
      />

      <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">My referral codes</h3>
        {data.ownCodes.length === 0 ? (
          <EmptyState title="No referral codes yet." />
        ) : (
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
        )}
      </Card>

      <Card className="p-5 md:col-span-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Referrals given</h3>
        {data.given.length === 0 ? (
          <EmptyState title="Hasn't referred anyone yet." />
        ) : (
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
                  <td className="px-3 py-2">{g.refereeName}</td>
                  <td className="px-3 py-2 text-right">{fmtCentavos(g.referrerBonus)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      label={g.referrerCredited ? 'credited' : 'pending'}
                      variant={g.referrerCredited ? 'success' : 'info'}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)]">
                    {g.qualifyingBookingId ? g.qualifyingBookingId.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {fmtDate(g.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── ActivityTab ──────────────────────────────────────────────────────────

function ActivityTab({ customerId }: { customerId: string }): React.ReactElement {
  const [limit, setLimit] = useState(50);
  const q = useQuery({
    queryKey: ['admin-customer-activity', customerId, limit],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ActivityRow[] }>(
        `/api/v1/admin/customers/${customerId}/activity`,
        { params: { limit } },
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const rows = q.data!;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
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
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No activity recorded." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Detail</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
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
                    <td className="px-3 py-2">{r.action}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {r.detail ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">{r.ipAddress ?? '—'}</td>
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
