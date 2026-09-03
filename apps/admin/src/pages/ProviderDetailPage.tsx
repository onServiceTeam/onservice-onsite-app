import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Star,
  AlertTriangle,
  FileText,
  MessageSquare,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Coins,
} from '@/components/icons';
import api, { getErrorMessage } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import Badge from '@/components/ui/Badge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import Pagination from '@/components/ui/Pagination';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { useReasonDialog } from '@/components/ui/ReasonDialog';
import { VettingChecklist, buildChecklistSummary, type VettingState } from '@/components/VettingChecklist';
import { useAuthStore } from '@/stores/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ProviderProfile {
  id: string;
  userId: string;
  businessName: string;
  description: string;
  tier: string;
  status: string;
  averageRating: number;
  totalReviews: number;
  totalJobsCompleted: number;
  serviceRadiusKm: number;
  yearsExperience: number | null;
  vettingAnswers: {
    mainSkills?: string;
    hasOwnTools?: boolean;
    businessType?: string;
    yearStarted?: string;
    teamSize?: string;
    fullAddress?: string;
    website?: string;
    facebook?: string;
    socialOther?: string;
    credentials?: string;
    registrations?: string;
    resumeUrl?: string;
    references?: Array<{ name: string; contact: string; relation?: string }>;
  } | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
  activeRefreshSessions?: number;
  openSupportCases?: number;
  urgentSupportCases?: number;
  unassignedSupportCases?: number;
  supportOwnerNames?: string[];
  pendingServiceAreaChanges?: number;
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    // D25 — true when the API masked phone/email for this admin role.
    contactMasked: boolean;
    avatarUrl: string | null;
    isVerified: boolean;
    isActive: boolean;
    lastLoginAt: string | null;
  };
  documents: {
    nbiClearanceUrl: string | null;
    nbiExpiryDate: string | null;
    nbiExpiryNotified: boolean;
    avatarUrl: string | null;
    governmentIdUrl: string | null;
    governmentIdBackUrl: string | null;
    selfieUrl: string | null;
  };
  categories: { id: string; name: string; basePrice: number | null }[];
  services?: Array<{
    id: string;
    name: string;
    categoryName: string;
    pricingType: string;
    basePrice: number | null;
    hourlyRate: number | null;
    unitLabel: string | null;
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
  }>;
  serviceAreas: { id: string; name: string; isPrimary: boolean }[];
  certifications: ProviderCertification[];
  portfolio: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    customerConsentConfirmedAt: string | null;
    createdAt: string;
  }>;
}

export interface ProviderCertification {
  id: string;
  name: string;
  issuingBody: string;
  certificateNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  hasDocument: boolean;
  documentUrl: string | null;
  createdAt: string;
}

interface JobsResult {
  rows: {
    id: string;
    customerId: string;
    customerName: string;
    categoryName: string;
    status: string;
    totalAmount: number;
    serviceFee: number;
    scheduledAt: string;
    completedAt: string | null;
    rating: number | null;
    hasDispute: boolean;
    disputeId: string | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
}

interface Financials {
  totalEarned: number;
  totalCommissionPaid: number;
  walletAvailable: number;
  walletPending: number;
  monthlyEarnings: { month: string; amount: number }[];
  recentPayouts: {
    id: string;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }[];
}

interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  isVisible: boolean;
  isFlagged: boolean;
  privateNote: string | null;
  adminResponse: string | null;
  imageUrls: string[];
  createdAt: string;
}

interface Dispute {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  status: string;
  resolutionType: string | null;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  source: 'audit' | 'login' | 'admin_action';
  action: string;
  detail: string | null;
  actor: {
    kind: 'provider' | 'provider_staff' | 'customer' | 'admin' | 'system';
    id: string | null;
    name: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Note {
  id: string;
  providerId: string;
  authorId: string;
  authorName: string;
  category: 'general' | 'quality' | 'financial' | 'legal';
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const TABS = ['profile', 'certifications', 'jobs', 'financials', 'reviews', 'staff', 'disputes', 'activity', 'notes'] as const;
type TabId = (typeof TABS)[number];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseProviderTab(value: string | null): TabId {
  return TABS.includes(value as TabId) ? value as TabId : 'profile';
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatPHP(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(centavos / 100);
}

function providerServicePriceLabel(service: NonNullable<ProviderProfile['services']>[number]): string {
  if (service.pricingType === 'fixed' && service.basePrice !== null) {
    return formatPHP(service.basePrice);
  }
  if (service.pricingType === 'hourly' && service.hourlyRate !== null) {
    return `${formatPHP(service.hourlyRate)}/hour`;
  }
  if (service.pricingType === 'per_unit' && service.unitPrice !== null) {
    return `${formatPHP(service.unitPrice)}/${service.unitLabel || 'unit'}`;
  }
  if (service.pricingType === 'range' && service.minPrice !== null && service.maxPrice !== null) {
    return `${formatPHP(service.minPrice)}–${formatPHP(service.maxPrice)}`;
  }
  return 'Quote after assessment';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  approved: 'success',
  pending: 'warning',
  suspended: 'danger',
  deactivated: 'danger',
};

// Bug 1323 fix (Phase 14 D02 Part 3): founding-batch tier added.
const TIER_BADGE: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  founding: 'warning',
  new: 'default',
  verified: 'info',
  pro: 'success',
  elite: 'warning',
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ProviderDetailPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseProviderTab(searchParams.get('tab'));
  const certificationIdFilter = searchParams.get('certificationId')?.trim() ?? '';
  const staffIdFilter = searchParams.get('staffId')?.trim() ?? '';
  const noteIdFilter = searchParams.get('noteId')?.trim() ?? '';
  const reviewIdFilter = searchParams.get('reviewId')?.trim() ?? '';
  const adminActionIdFilter = searchParams.get('adminActionId')?.trim() ?? '';

  const selectTab = (tab: TabId): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'profile') next.delete('tab');
      else next.set('tab', tab);
      if (tab !== 'certifications') next.delete('certificationId');
      if (tab !== 'staff') next.delete('staffId');
      if (tab !== 'notes') next.delete('noteId');
      if (tab !== 'reviews') next.delete('reviewId');
      if (tab !== 'activity') next.delete('adminActionId');
      return next;
    });
  };

  const clearCertificationFilter = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('certificationId');
      return next;
    });
  };

  const clearStaffFilter = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('staffId');
      return next;
    });
  };

  const clearNoteFilter = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('noteId');
      return next;
    });
  };

  const clearReviewFilter = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('reviewId');
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

  const profile = useQuery({
    queryKey: ['admin-provider-profile', id],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: ProviderProfile }>(
        `/api/v1/admin/providers/${id}/profile`,
      );
      return res.data.data;
    },
    enabled: Boolean(id),
  });

  if (profile.isLoading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading provider…" />
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="p-6">
        <ErrorState
          description={getErrorMessage(profile.error) || 'Failed to load provider.'}
          action={<Button size="sm" variant="outline" onClick={() => void profile.refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const p = profile.data;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Link
        to="/providers"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-secondary)] hover:underline"
      >
        <ArrowLeft size={14} /> Back to Providers
      </Link>

      <ProviderHeader profile={p} />

      <Tabs value={activeTab} onValueChange={(v) => selectTab(v as TabId)}>
        <TabsList className="flex h-auto min-h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
          <TabsTrigger className="min-h-11 shrink-0" value="profile">Profile</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="certifications">Certifications</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="jobs">Jobs</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="financials">Financials</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="reviews">Reviews</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="staff">Staff</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="disputes">Disputes</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="activity">Activity</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab profile={p} />
        </TabsContent>
        <TabsContent value="certifications">
          <CertificationsTab
            providerId={id}
            certifications={p.certifications ?? []}
            exactCertificationId={certificationIdFilter}
            onClearExactCertification={clearCertificationFilter}
          />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab providerId={id} />
        </TabsContent>
        <TabsContent value="financials">
          <FinancialsTab providerId={id} />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewsTab
            providerId={id}
            exactReviewId={reviewIdFilter}
            onClearExactReview={clearReviewFilter}
          />
        </TabsContent>
        <TabsContent value="staff">
          <StaffTab
            providerId={id}
            exactStaffId={staffIdFilter}
            onClearExactStaff={clearStaffFilter}
          />
        </TabsContent>
        <TabsContent value="disputes">
          <DisputesTab providerId={id} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab
            providerId={id}
            exactAdminActionId={adminActionIdFilter}
            onClearExactAdminAction={clearAdminActionFilter}
          />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab
            providerId={id}
            exactNoteId={noteIdFilter}
            onClearExactNote={clearNoteFilter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

export function ProviderHeader({ profile }: { profile: ProviderProfile }): React.ReactElement {
  // Phase L MED-L04 fix — guard against partial/missing user object
  // during initial render. Pre-fix profile.user.avatarUrl threw when
  // the user sub-object was still undefined from the API.
  const user = profile.user ?? { avatarUrl: null, fullName: '' };

  // D25 — reveal raw contact. Audit-logged server-side; raw values kept in
  // local state only (never re-cached in the query result).
  const contactMasked = ('contactMasked' in user) && (user as { contactMasked?: boolean }).contactMasked === true;
  const [revealed, setRevealed] = useState<{ phone: string; email: string | null } | null>(null);
  const revealMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; data: { phone: string; email: string | null } }>(
        `/api/v1/admin/providers/${profile.id}/reveal-contact`,
        {},
      );
      return res.data.data;
    },
    onSuccess: (data) => setRevealed(data),
  });
  const shownPhone = revealed?.phone ?? (('phone' in user ? (user as { phone?: string }).phone : '') || '—');
  const shownEmail = revealed ? revealed.email : (('email' in user) ? (user as { email?: string }).email : null);
  const role = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const { requestReason, reasonDialog } = useReasonDialog();
  const [actionSuccess, setActionSuccess] = useState('');

  const statusMutation = useMutation({
    mutationFn: async ({ action, reason }: {
      action: 'reject' | 'suspend' | 'reactivate';
      reason: string;
    }) => {
      await api.put(`/api/v1/admin/providers/${profile.id}/${action}`, { reason });
      return action;
    },
    onSuccess: (action) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-profile', profile.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-activity', profile.id] });
      setActionSuccess(
        action === 'suspend'
          ? 'Provider suspended. Every existing access and refresh credential is now invalid.'
          : action === 'reactivate'
            ? 'Provider reactivated. They must sign in again.'
            : 'Provider application rejected and the decision was sent to the applicant.',
      );
    },
  });

  async function requestStatusAction(action: 'reject' | 'suspend' | 'reactivate'): Promise<void> {
    setActionSuccess('');
    const providerLabel = profile.businessName || user.fullName || 'this provider';
    const reason = await requestReason({
      title:
        action === 'suspend'
          ? `Suspend ${providerLabel}?`
          : action === 'reactivate'
            ? `Reactivate ${providerLabel}?`
            : `Reject ${providerLabel}?`,
      description:
        action === 'suspend'
          ? 'Suspension immediately invalidates every provider access and refresh credential. In-flight jobs are held for admin review; this action does not cancel a job, refund a customer, resolve a dispute, or release escrow. The provider receives the reason.'
          : action === 'reactivate'
            ? 'Reactivation restores provider workspace access but does not clear held jobs, change payments, or resolve disputes. The provider must sign in again and receives the reason.'
            : 'Rejection closes this pending application and keeps the person’s customer account. It does not delete submitted records. The applicant receives the reason.',
      confirmLabel:
        action === 'suspend' ? 'Suspend provider' : action === 'reactivate' ? 'Reactivate provider' : 'Reject application',
      reasonLabel: action === 'reactivate' ? 'Reactivation reason' : action === 'suspend' ? 'Suspension reason' : 'Rejection reason',
      placeholder: 'Record the support case, evidence, checks completed, and decision basis.',
      minLength: 10,
      maxLength: 1000,
      tone: action === 'reactivate' ? 'default' : 'destructive',
    });
    if (reason) statusMutation.mutate({ action, reason });
  }

  const revokeSessionsMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await api.post<{
        success: boolean;
        data: { revokedRefreshSessions: number; sessionVersion: number };
      }>(`/api/v1/admin/providers/${profile.id}/revoke-sessions`, { reason });
      return res.data.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-profile', profile.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-activity', profile.id] });
      setActionSuccess(
        `Forced sign-out completed. ${data.revokedRefreshSessions} remembered sign-in${data.revokedRefreshSessions === 1 ? '' : 's'} removed and every older credential invalidated.`,
      );
    },
  });

  async function requestSessionRevocation(): Promise<void> {
    setActionSuccess('');
    const reason = await requestReason({
      title: `Force ${profile.businessName || user.fullName || 'this provider'} to sign in again?`,
      description: 'This immediately invalidates every current access and refresh credential on all devices. It does not suspend the provider, hold a job, change a payment, or resolve a dispute.',
      confirmLabel: 'Force sign-out',
      reasonLabel: 'Security or support reason',
      placeholder: 'Record the support case, security concern, or provider request.',
      minLength: 10,
      maxLength: 1000,
      tone: 'destructive',
    });
    if (reason) revokeSessionsMutation.mutate(reason);
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-slate-500 text-xl font-semibold flex-shrink-0">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            (user.fullName || '?').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--color-text)] truncate">
              {profile.businessName || user.fullName || '—'}
            </h1>
            <Badge label={profile.status} variant={STATUS_BADGE[profile.status] ?? 'default'} />
            <Badge label={profile.tier} variant={TIER_BADGE[profile.tier] ?? 'default'} />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{user.fullName || '—'}</p>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)] mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              {/* Phase L MED-L04 fix — coalesce missing rating/review counts. */}
              <Star size={12} /> {(profile.averageRating ?? 0).toFixed(2)} ({profile.totalReviews ?? 0} reviews)
            </span>
            <span>{profile.totalJobsCompleted ?? 0} jobs completed</span>
            <span className="inline-flex items-center gap-1">
              <Phone size={12} /> {shownPhone}
            </span>
            {shownEmail && (
              <span className="inline-flex items-center gap-1">
                <Mail size={12} /> {shownEmail}
              </span>
            )}
            {/* D25 — masked contact + audit-logged reveal. */}
            {contactMasked && !revealed && (
              <button
                type="button"
                onClick={() => revealMutation.mutate()}
                disabled={revealMutation.isPending}
                className="inline-flex items-center gap-1 text-[var(--color-secondary)] hover:underline disabled:opacity-50"
              >
                <Eye size={12} /> {revealMutation.isPending ? 'Revealing…' : 'Reveal contact'}
              </button>
            )}
            {revealed && (
              <span className="inline-flex items-center gap-1 text-[var(--color-text-tertiary)]">
                shown to you only · logged
              </span>
            )}
            {revealMutation.isError && (
              <span role="alert" className="text-[var(--color-danger)]">
                {getErrorMessage(revealMutation.error)}
              </span>
            )}
            {profile.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {profile.city}
                {profile.province ? `, ${profile.province}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
        <Link
          to={`/support-tickets?new=1&userId=${encodeURIComponent(profile.userId)}&userRole=provider&userName=${encodeURIComponent(profile.businessName || user.fullName || 'Provider')}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
        >
          <MessageSquare size={14} /> Create support case
        </Link>
        <Link
          to={`/support-tickets?relatedProviderId=${encodeURIComponent(profile.id)}&userRole=provider&userName=${encodeURIComponent(profile.businessName || user.fullName || 'Provider')}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-primary)]"
        >
          View support history
        </Link>
        {profile.status === 'approved' && (
          <Button
            variant="destructive"
            size="sm"
            disabled={statusMutation.isPending}
            onClick={() => void requestStatusAction('suspend')}
          >
            Suspend provider
          </Button>
        )}
        {profile.status === 'suspended' && (
          <Button
            variant="secondary"
            size="sm"
            disabled={statusMutation.isPending}
            onClick={() => void requestStatusAction('reactivate')}
          >
            Reactivate provider
          </Button>
        )}
        {profile.status === 'pending' && (
          <Button
            variant="destructive"
            size="sm"
            disabled={statusMutation.isPending}
            onClick={() => void requestStatusAction('reject')}
          >
            Reject application
          </Button>
        )}
      </div>

      <div className="grid gap-3 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Open support</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{profile.openSupportCases ?? 0}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {profile.urgentSupportCases ?? 0} urgent · {profile.unassignedSupportCases ?? 0} unassigned
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Support ownership</p>
          <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
            {(profile.supportOwnerNames ?? []).length > 0
              ? (profile.supportOwnerNames ?? []).join(', ')
              : (profile.openSupportCases ?? 0) > 0
                ? 'No owner assigned'
                : 'No open support cases'}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">Across this provider’s open cases</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Area-change queue</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{profile.pendingServiceAreaChanges ?? 0}</p>
          <Link
            to={`/service-areas?providerId=${encodeURIComponent(profile.id)}`}
            className="text-xs font-medium text-[var(--color-secondary)] hover:underline"
          >
            Review provider requests
          </Link>
        </div>
        <div className="flex items-start justify-between gap-3">
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

      {(statusMutation.isError || revokeSessionsMutation.isError) && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {getErrorMessage(statusMutation.error ?? revokeSessionsMutation.error)}
        </p>
      )}
      {actionSuccess && <p role="status" className="text-sm text-[var(--color-success)]">{actionSuccess}</p>}

      {profile.status === 'pending' && <ApprovalPanel profile={profile} />}
      {profile.status === 'rejected' && (
        <p className="border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-text-secondary)]">
          This application is closed. Keep support history and internal notes here; rejected applications cannot be reopened from this screen.
        </p>
      )}
      {reasonDialog}
    </Card>
  );
}

// ─── Approval panel (vetting checklist gate) ────────────────────────────────
//
// For pending providers the admin reviews the documents on the Profile tab,
// then confirms the vetting rubric here. The Approve button stays disabled
// until every checklist item is ticked AND the rationale is filled. On
// approve the rationale + one-line checklist summary are committed in the same
// server transaction as the status change and approval notification.

export function ApprovalPanel({ profile }: { profile: ProviderProfile }): React.ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vetting, setVetting] = useState<VettingState>({ isComplete: false, rationale: '' });
  const [error, setError] = useState('');

  const approve = useMutation({
    mutationFn: async () => {
      await api.put(`/api/v1/admin/providers/${profile.id}/approve`, {
        reason: vetting.rationale,
        checklistConfirmed: true,
        checklistSummary: buildChecklistSummary(),
      });
    },
    onSuccess: () => {
      setError('');
      setOpen(false);
      setVetting({ isComplete: false, rationale: '' });
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-profile', profile.id] });
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (!open) {
    return (
      <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-text-secondary)]">
          This provider is pending. Review the documents below, then run the vetting checklist to approve.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>Review &amp; approve</Button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <VettingChecklist onChange={setVetting} />
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setOpen(false); setError(''); setVetting({ isComplete: false, rationale: '' }); }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => approve.mutate()}
          disabled={approve.isPending || !vetting.isComplete}
        >
          {approve.isPending ? 'Approving…' : 'Approve provider'}
        </Button>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

export function ProfileTab({ profile }: { profile: ProviderProfile }): React.ReactElement {
  // Phase L MED-L04 fix — guard the documents sub-object so the
  // verification card renders even if the API hasn't sent it yet.
  const docs = profile.documents ?? {
    nbiClearanceUrl: null,
    nbiExpiryDate: null,
    nbiExpiryNotified: false,
    avatarUrl: null,
    governmentIdUrl: null,
    governmentIdBackUrl: null,
    selfieUrl: null,
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Verification Documents</h3>
        <DocLine label="NBI Clearance" url={docs.nbiClearanceUrl}
          extra={docs.nbiExpiryDate ? `expires ${formatDateOnly(docs.nbiExpiryDate)}` : null} />
        {/* Phase 200 — "Not available" caption only when the URL is absent. */}
        <DocLine label="Government ID (front)" url={docs.governmentIdUrl}
          extra={docs.governmentIdUrl ? null : 'Not available in this record'} />
        <DocLine label="Government ID (back)" url={docs.governmentIdBackUrl}
          extra={docs.governmentIdBackUrl ? null : 'Not available in this record'} />
        <DocLine label="Selfie" url={docs.selfieUrl}
          extra={docs.selfieUrl ? null : 'Not available in this record'} />
        {/* Phase 200 — avatar lives on the user object, not documents. */}
        <DocLine label="Avatar" url={profile.user?.avatarUrl ?? null} extra={null} />
      </Card>

      <Card className="p-4 md:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Customer-facing portfolio</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              This is the exact work-photo set customers can see on the provider profile.
            </p>
          </div>
          <Badge label={`${(profile.portfolio ?? []).length} published`} variant="info" />
        </div>
        {(profile.portfolio ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">No published portfolio photos.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(profile.portfolio ?? []).map((item) => (
              <figure key={item.id} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                <img
                  src={item.imageUrl}
                  alt={item.caption || 'Provider portfolio work'}
                  className="aspect-square w-full object-cover bg-[var(--color-background)]"
                />
                <figcaption className="p-3 space-y-1">
                  <p className="text-sm text-[var(--color-text)]">{item.caption || 'No caption'}</p>
                  <p className={item.customerConsentConfirmedAt
                    ? 'text-xs font-medium text-[var(--color-success)]'
                    : 'text-xs font-medium text-[var(--color-error)]'}>
                    {item.customerConsentConfirmedAt
                      ? `Consent confirmed ${formatDate(item.customerConsentConfirmedAt)}`
                      : 'Legacy item: no consent record'}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Provider services</h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Customer prices below come from the admin catalog, which is also used at booking.
          </p>
        </div>
        {(profile.services ?? []).length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No active services on file.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {(profile.services ?? []).map((service) => (
              <li key={service.id} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--color-text)]">{service.name}</span>
                  <span className="block text-xs text-[var(--color-text-secondary)]">{service.categoryName}</span>
                </span>
                <span className="shrink-0 text-right text-xs font-medium text-[var(--color-text-secondary)]">
                  {providerServicePriceLabel(service)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Service Areas</h3>
          <Link
            to={`/service-areas?providerId=${encodeURIComponent(profile.id)}`}
            className="text-xs font-medium text-[var(--color-secondary)] hover:underline"
          >
            Open service-area operations
          </Link>
        </div>
        {(profile.pendingServiceAreaChanges ?? 0) > 0 && (
          <p className="mb-3 rounded-lg bg-[var(--color-warning)]/10 px-3 py-2 text-xs font-medium text-[var(--color-text)]">
            {profile.pendingServiceAreaChanges} pending change request{profile.pendingServiceAreaChanges === 1 ? '' : 's'} needs review.
          </p>
        )}
        {(profile.serviceAreas ?? []).length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No service areas configured.</p>
        ) : (
          <ul className="space-y-1">
            {(profile.serviceAreas ?? []).map((a) => (
              <li key={a.id} className="text-sm text-[var(--color-text)] flex justify-between gap-3">
                <Link to={`/service-areas?search=${encodeURIComponent(a.name)}`} className="hover:underline">{a.name}</Link>
                {a.isPrimary && <Badge label="primary" variant="info" />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Account</h3>
        {/* Phase L MED-L04 fix — guard the user sub-object so the Account
             card renders even before the profile.user payload arrives. */}
        <DefRow k="User ID" v={profile.userId ?? '—'} />
        <DefRow k="Verified" v={(profile.user as { isVerified?: boolean })?.isVerified ? 'Yes' : 'No'} />
        <DefRow k="Active" v={(profile.user as { isActive?: boolean })?.isActive ? 'Yes' : 'No'} />
        <DefRow k="Last Login" v={formatDate((profile.user as { lastLoginAt?: string })?.lastLoginAt ?? null)} />
        <DefRow k="Service Radius" v={`${profile.serviceRadiusKm ?? 0} km`} />
        <DefRow k="Joined" v={formatDateOnly(profile.createdAt)} />
      </Card>

      {/* Vetting questionnaire answers (onboarding). Review these against the
          vetting checklist before approving — see docs/operations/04. */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Vetting questionnaire</h3>
        {profile.yearsExperience == null && !profile.vettingAnswers ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No questionnaire on file (applied before this was added, or skipped).
          </p>
        ) : (() => {
          const va = profile.vettingAnswers ?? {};
          const link = (raw?: string): React.ReactNode => {
            if (!raw) return '—';
            const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-secondary)] underline">
                {raw}
              </a>
            );
          };
          const refs = va.references ?? [];
          return (
            <>
              <DefRow k="Years of experience" v={profile.yearsExperience != null ? String(profile.yearsExperience) : '—'} />
              <DefRow k="Main skills / specialties" v={va.mainSkills || '—'} />
              <DefRow k="Own tools / equipment" v={va.hasOwnTools == null ? '—' : va.hasOwnTools ? 'Yes' : 'No'} />
              <DefRow k="Business type" v={va.businessType || '—'} />
              <DefRow k="Year started" v={va.yearStarted || '—'} />
              <DefRow k="Team size" v={va.teamSize || '—'} />
              <DefRow k="Full address" v={va.fullAddress || '—'} />
              <DefRow k="Website" v={link(va.website)} />
              <DefRow k="Facebook" v={link(va.facebook)} />
              <DefRow k="Other links" v={va.socialOther || '—'} />
              <DefRow k="Certifications / licenses" v={va.credentials || '—'} />
              <DefRow k="Registrations" v={va.registrations || '—'} />
              <DefRow k="Resume / portfolio" v={link(va.resumeUrl)} />
              {refs.length > 0 ? (
                <div className="mt-3 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">References ({refs.length})</div>
                  {refs.map((r, i) => (
                    <div key={i} className="text-sm text-[var(--color-text)] py-0.5">
                      {r.name} — {r.contact}{r.relation ? ` (${r.relation})` : ''}
                    </div>
                  ))}
                </div>
              ) : (
                <DefRow k="References" v="—" />
              )}
            </>
          );
        })()}
      </Card>
    </div>
  );
}

function DocLine({
  label,
  url,
  extra,
}: {
  label: string;
  url: string | null;
  extra: string | null;
}): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // §35a — KYC documents (gov ID, NBI, selfie) are served through an
  // authenticated, admin-only API proxy (path starts with /api/), never a
  // public storage URL. We fetch the file WITH the admin session and open the
  // resulting blob, so the document is never reachable by a bare link. External
  // URLs (e.g. the avatar) keep the plain anchor.
  const isProxied = !!url && url.startsWith('/api/');

  async function openProxied(): Promise<void> {
    if (!url) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await api.get<Blob>(url, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(res.data);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      // Give the new tab time to load before releasing the blob URL.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-1.5 text-sm border-b border-slate-100 last:border-0">
      <span className="text-[var(--color-text)]">{label}</span>
      <span className="flex items-center gap-2">
        {url ? (
          isProxied ? (
            <button
              type="button"
              onClick={() => { void openProxied(); }}
              disabled={loading}
              className="text-[var(--color-secondary)] hover:underline text-xs disabled:opacity-50"
            >
              {loading ? 'opening…' : 'view'}
            </button>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-secondary)] hover:underline text-xs"
            >
              view
            </a>
          )
        ) : (
          <span className="text-xs text-[var(--color-text-secondary)]">missing</span>
        )}
        {err && <span className="text-xs text-red-500">{err}</span>}
        {extra && <span className="text-xs text-[var(--color-text-secondary)]">· {extra}</span>}
      </span>
    </div>
  );
}

function DefRow({ k, v }: { k: string; v: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-slate-100 last:border-0">
      <span className="text-[var(--color-text-secondary)]">{k}</span>
      <span className="text-[var(--color-text)] font-medium truncate ml-3">{v}</span>
    </div>
  );
}

const CERTIFICATION_STATUS_BADGE = {
  verified: 'success',
  pending: 'warning',
  expired: 'danger',
} as const;

export function CertificationsTab({
  providerId,
  certifications,
  exactCertificationId = '',
  onClearExactCertification,
}: {
  providerId: string;
  certifications: ProviderCertification[];
  exactCertificationId?: string;
  onClearExactCertification?: () => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [unverifyTarget, setUnverifyTarget] = useState<ProviderCertification | null>(null);
  const [reason, setReason] = useState('');
  const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  const review = useMutation({
    mutationFn: async (args: { certId: string; isVerified: boolean; reason?: string }) => {
      await api.post(`/api/v1/admin/providers/${providerId}/certifications/${args.certId}/review`, {
        isVerified: args.isVerified,
        reason: args.reason,
      });
    },
    onSuccess: () => {
      setActionError('');
      setUnverifyTarget(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-profile', providerId] });
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const currentVerified = certifications.filter((cert) =>
    cert.isVerified && (!cert.expiryDate || cert.expiryDate >= todayManila),
  ).length;
  const awaitingReview = certifications.filter((cert) => !cert.isVerified).length;
  const rawCertificationId = exactCertificationId.trim();
  const hasExactSelection = rawCertificationId.length > 0;
  const exactSelectionMalformed = hasExactSelection && !UUID_REGEX.test(rawCertificationId);
  const requestedCertificationId = exactSelectionMalformed
    ? rawCertificationId
    : rawCertificationId.toLowerCase();
  const selectedCertification = !exactSelectionMalformed && hasExactSelection
    ? certifications.find((certification) => certification.id === requestedCertificationId) ?? null
    : null;
  const exactSelectionMissing = hasExactSelection && !exactSelectionMalformed && !selectedCertification;
  const displayedCertifications = hasExactSelection
    ? (selectedCertification ? [selectedCertification] : [])
    : certifications;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Current verified</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{currentVerified}</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Visible on the customer profile and eligible for tier checks.</p>
        </Card>
        <Card className="border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Awaiting review</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{awaitingReview}</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Review the private document before adding verification.</p>
        </Card>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)]">
        Only verified, unexpired certifications appear to customers. Any provider edit automatically removes verification and returns the credential here for review.
      </p>
      {selectedCertification && (
        <Card className="border-sky-200 bg-sky-50 p-4" role="status">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Exact certification evidence</p>
          <p className="mt-1 text-sm text-sky-950">
            Showing only certification <span className="font-mono text-xs">{selectedCertification.id}</span> from this provider&apos;s current retained credentials.
          </p>
          {onClearExactCertification && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactCertification}>
              View all certifications
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMalformed && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">Certification ID must be a complete UUID. No certification is selected.</p>
          {onClearExactCertification && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactCertification}>
              View all certifications
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMissing && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">
            The requested certification is not part of this provider&apos;s retained credential list. No substitute certification is shown.
          </p>
          {onClearExactCertification && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactCertification}>
              View all certifications
            </Button>
          )}
        </Card>
      )}
      {actionError && <p role="alert" className="text-sm text-[var(--color-danger)]">{actionError}</p>}

      {!hasExactSelection && certifications.length === 0 ? (
        <EmptyState title="No certifications" description="This provider has not added a certification yet." />
      ) : displayedCertifications.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {displayedCertifications.map((cert) => {
            const expired = Boolean(cert.expiryDate && cert.expiryDate < todayManila);
            const status = expired ? 'expired' : cert.isVerified ? 'verified' : 'pending';
            return (
              <Card
                key={cert.id}
                aria-current={cert.id === selectedCertification?.id ? 'true' : undefined}
                className={`border p-4 ${cert.id === selectedCertification?.id ? 'border-sky-400 ring-2 ring-sky-100' : 'border-[var(--color-border)]'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[var(--color-text)]">{cert.name}</h3>
                      <Badge label={status} variant={CERTIFICATION_STATUS_BADGE[status]} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{cert.issuingBody}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!cert.isVerified && (
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={review.isPending || !cert.hasDocument || expired}
                        onClick={() => review.mutate({ certId: cert.id, isVerified: true })}
                      >
                        Verify
                      </Button>
                    )}
                    {cert.isVerified && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={review.isPending}
                        onClick={() => { setActionError(''); setReason(''); setUnverifyTarget(cert); }}
                      >
                        Remove verification
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                  <DefRow k="Certificate number" v={cert.certificateNumber || '—'} />
                  <DefRow k="Issued" v={formatDateOnly(cert.issuedDate)} />
                  <DefRow k="Expires" v={formatDateOnly(cert.expiryDate)} />
                  <DefRow k="Verified at" v={formatDate(cert.verifiedAt)} />
                </div>
                <div className="mt-3 border-t border-[var(--color-border)] pt-2">
                  <DocLine label="Private certificate photo" url={cert.documentUrl} extra={cert.hasDocument ? 'private admin-only access' : 'required for verification'} />
                </div>
                {!cert.hasDocument && (
                  <p className="mt-2 text-xs text-[var(--color-warning)]">The provider must add a certificate photo before this can be verified.</p>
                )}
                {expired && (
                  <p className="mt-2 text-xs text-[var(--color-danger)]">This credential is expired and cannot be verified or count toward Elite tier.</p>
                )}
              </Card>
            );
          })}
        </div>
      ) : null}

      {unverifyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="cert-unverify-title" className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-white p-5">
            <h3 id="cert-unverify-title" className="text-lg font-semibold text-[var(--color-text)]">Remove certification verification</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{unverifyTarget.name}</p>
            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
              The certification will stop appearing to customers and stop counting toward tier eligibility. The provider receives this reason in their notifications.
            </p>
            <label htmlFor="cert-unverify-reason" className="mt-4 block text-sm font-medium text-[var(--color-text)]">Reason</label>
            <Textarea
              id="cert-unverify-reason"
              aria-label="Certification verification removal reason"
              className="mt-1"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain what is invalid, expired, or needs replacement"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button className="min-h-11" variant="outline" onClick={() => { setUnverifyTarget(null); setReason(''); }}>Cancel</Button>
              <Button
                className="min-h-11"
                variant="destructive"
                disabled={review.isPending || reason.trim().length < 10}
                onClick={() => review.mutate({ certId: unverifyTarget.id, isVerified: false, reason: reason.trim() })}
              >
                {review.isPending ? 'Saving...' : 'Remove verification'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────────────

export function JobsTab({ providerId }: { providerId: string }): React.ReactElement {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const q = useQuery({
    queryKey: ['admin-provider-jobs', providerId, page, statusFilter],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: JobsResult }>(
        `/api/v1/admin/providers/${providerId}/jobs`,
        { params: { page, pageSize: 20, status: statusFilter || undefined } },
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState label="Loading jobs…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const data = q.data!;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} aria-label="Filter bookings by status" className="px-3 py-2 border rounded text-sm">
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="quoted">Quoted</option>
          <option value="matched">Matched</option>
          <option value="payment_pending">Payment pending</option>
          <option value="paid">Paid</option>
          <option value="provider_en_route">Provider en route</option>
          <option value="provider_arrived">Provider arrived</option>
          <option value="in_progress">In progress</option>
          <option value="completed_by_provider">Completed by provider</option>
          <option value="confirmed">Confirmed</option>
          <option value="disputed">Disputed</option>
          <option value="resolved">Resolved</option>
          <option value="payout_ready">Payout ready</option>
          <option value="paid_out">Paid out</option>
          <option value="cancelled_by_customer">Cancelled (customer)</option>
          <option value="cancelled_by_provider">Cancelled (provider)</option>
          <option value="cancelled_by_admin">Cancelled (admin)</option>
        </select>
        <span className="text-xs text-[var(--color-text-secondary)]">{data.total} total</span>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Booking</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Service</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Service Fee</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Rating</th>
              <th className="px-3 py-2 text-left">Dispute</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-[var(--color-text-secondary)]">No jobs found.</td></tr>
            ) : data.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{formatDateOnly(row.scheduledAt)}</td>
                <td className="px-3 py-2">
                  <Link to={`/bookings/${row.id}`} aria-label={`Open booking ${row.id}`} className="font-mono text-xs text-[var(--color-primary)] hover:underline">
                    {row.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link to={`/customers/${row.customerId}`} aria-label={`Open customer ${row.customerId}`} className="text-[var(--color-primary)] hover:underline">
                    {row.customerName}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.categoryName}</td>
                <td className="px-3 py-2 text-right">{formatPHP(row.totalAmount)}</td>
                <td className="px-3 py-2 text-right">{formatPHP(row.serviceFee)}</td>
                <td className="px-3 py-2"><Badge label={row.status} variant="default" /></td>
                <td className="px-3 py-2">{row.rating != null ? <span className="inline-flex items-center gap-1">{row.rating} <Star size={13} className="text-amber-500" fill="currentColor" aria-hidden="true" /></span> : '—'}</td>
                <td className="px-3 py-2">
                  {row.hasDispute && row.disputeId ? (
                    <Link to={`/disputes/${row.disputeId}`} className="hover:underline" aria-label={`Open dispute for booking ${row.id}`}>
                      <Badge label="Open" variant="danger" />
                    </Link>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data.total > data.pageSize && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={Math.ceil(data.total / data.pageSize)}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

// ─── Financials Tab ───────────────────────────────────────────────────────

export function FinancialsTab({ providerId }: { providerId: string }): React.ReactElement {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';

  const q = useQuery({
    queryKey: ['admin-provider-financials', providerId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Financials }>(
        `/api/v1/admin/providers/${providerId}/financials`,
      );
      return res.data.data;
    },
  });

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [amountPesos, setAmountPesos] = useState('');
  const [reason, setReason] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const parsedAmount = Number(amountPesos);
  const adjustmentCentavos = Number.isFinite(parsedAmount) && parsedAmount !== 0
    ? Math.round(parsedAmount * 100)
    : null;

  const adjust = useMutation({
    mutationFn: async () => {
      if (adjustmentCentavos === null) throw new Error('Enter a non-zero PHP amount.');
      await api.post(`/api/v1/admin/providers/${providerId}/wallet/adjust`, {
        amount: adjustmentCentavos,
        reason,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-financials', providerId] });
      setAdjustOpen(false);
      setAmountPesos('');
      setReason('');
      setAdjustError('');
    },
    onError: (err) => setAdjustError(getErrorMessage(err)),
  });

  if (q.isLoading) return <LoadingState label="Loading financials…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const f = q.data!;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total Earned" value={formatPHP(f.totalEarned)} icon={<Coins size={16} />} />
        <KpiCard title="Commission Paid" value={formatPHP(f.totalCommissionPaid)} icon={<Coins size={16} />} />
        <KpiCard title="Wallet Available" value={formatPHP(f.walletAvailable)} icon={<Coins size={16} />} />
        <KpiCard title="Wallet Pending" value={formatPHP(f.walletPending)} icon={<Coins size={16} />} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Recent Payouts</h3>
          <div className="flex items-center gap-2">
            <Link
              to={`/payouts?providerId=${encodeURIComponent(providerId)}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open payout queue
            </Link>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" onClick={() => setAdjustOpen((v) => !v)}>
                {adjustOpen ? 'Cancel' : 'Adjust Wallet'}
              </Button>
            )}
          </div>
        </div>

        {adjustOpen && isSuperAdmin && (
          <div className="mb-4 p-3 border border-amber-200 bg-amber-50 rounded-lg space-y-2">
            <p className="text-xs text-amber-800 inline-flex items-center gap-1">
              <AlertTriangle size={12} /> Super-admin only. This writes to the wallet ledger and is audited.
            </p>
            {adjustError && <p className="text-xs text-red-700">{adjustError}</p>}
            <div className="flex gap-2 flex-wrap">
              <label htmlFor="provider-wallet-adjust-amount" className="sr-only">Wallet adjustment amount in PHP</label>
              <input
                id="provider-wallet-adjust-amount"
                type="number"
                step="0.01"
                aria-label="Wallet adjustment amount in PHP"
                placeholder="Amount in PHP (e.g. -50.00 or 25.00)"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                className="px-3 py-2 border rounded text-sm w-64"
              />
            </div>
            <Textarea
              rows={2}
              aria-label="Wallet adjustment reason"
              placeholder="Reason (min 5 chars)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => adjust.mutate()}
                disabled={adjust.isPending || adjustmentCentavos === null || reason.trim().length < 5}
              >
                Submit Adjustment
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Payout</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Completed</th>
              </tr>
            </thead>
            <tbody>
              {f.recentPayouts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-[var(--color-text-secondary)]">No payouts yet.</td></tr>
              ) : f.recentPayouts.map((po) => (
                <tr key={po.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link
                      to={`/payouts?payoutId=${encodeURIComponent(po.id)}`}
                      aria-label={`Open payout ${po.id}`}
                      className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
                    >
                      {po.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatDateOnly(po.createdAt)}</td>
                  <td className="px-3 py-2">{po.method}</td>
                  <td className="px-3 py-2 text-right">{formatPHP(po.amount)}</td>
                  <td className="px-3 py-2"><Badge label={po.status} variant={po.status === 'completed' ? 'success' : po.status === 'failed' ? 'danger' : 'warning'} /></td>
                  <td className="px-3 py-2">{formatDate(po.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Monthly Earnings (last 12)</h3>
        {f.monthlyEarnings.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No earnings on record.</p>
        ) : (
          <ul className="space-y-1">
            {f.monthlyEarnings.map((m) => (
              <li key={m.month} className="text-sm flex justify-between border-b border-slate-100 py-1.5 last:border-0">
                <span className="text-[var(--color-text-secondary)]">{m.month}</span>
                <span className="text-[var(--color-text)] font-medium">{formatPHP(m.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────

export function ReviewsTab({
  providerId,
  exactReviewId = '',
  onClearExactReview,
}: {
  providerId: string;
  exactReviewId?: string;
  onClearExactReview?: () => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { requestReason, reasonDialog } = useReasonDialog();
  const rawReviewId = exactReviewId.trim();
  const hasExactSelection = rawReviewId.length > 0;
  const exactSelectionMalformed = hasExactSelection && !UUID_REGEX.test(rawReviewId);
  const requestedReviewId = exactSelectionMalformed ? rawReviewId : rawReviewId.toLowerCase();

  // BUG-PHASE20-01 fix: API returns a paginated envelope
  // {rows, total, page, pageSize}, not Review[]. Pre-fix the page typed
  // it as Review[] and called `reviews.map()` directly — this threw
  // "TypeError: reviews.map is not a function" the moment a user clicked
  // the Reviews tab. Read q.data.rows instead. Other tabs that share
  // this paginated pattern (Disputes, Jobs already correct) get the
  // same treatment.
  const q = useQuery({
    queryKey: ['admin-provider-reviews', providerId, hasExactSelection ? requestedReviewId : page],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: { rows: Review[]; total: number; page: number; pageSize: number };
      }>(
        `/api/v1/admin/providers/${providerId}/reviews`,
        { params: hasExactSelection ? { reviewId: requestedReviewId } : { page, pageSize: 20 } },
      );
      return res.data.data;
    },
    enabled: !exactSelectionMalformed,
  });

  const visibility = useMutation({
    mutationFn: async (args: { reviewId: string; isVisible: boolean; reason: string }) => {
      await api.patch(
        `/api/v1/admin/providers/${providerId}/reviews/${args.reviewId}/visibility`,
        { isVisible: args.isVisible, reason: args.reason },
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-provider-reviews', providerId] }),
  });

  const response = useMutation({
    mutationFn: async (args: { reviewId: string; response: string; reason: string }) => {
      await api.patch(
        `/api/v1/admin/providers/${providerId}/reviews/${args.reviewId}/response`,
        { response: args.response, reason: args.reason },
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-provider-reviews', providerId] }),
  });

  async function changeVisibility(review: Review): Promise<void> {
    const reason = await requestReason({
      title: review.isVisible ? 'Hide customer review?' : 'Restore customer review?',
      description: review.isVisible
        ? 'The review will stop appearing in customer-facing provider profiles. Its evidence and history remain available to support.'
        : 'The review will return to customer-facing provider profiles. Its original rating and comment will become visible again.',
      confirmLabel: review.isVisible ? 'Hide review' : 'Restore review',
      placeholder: 'Record the moderation policy or evidence that supports this decision.',
      tone: review.isVisible ? 'destructive' : 'default',
    });
    if (!reason) return;
    visibility.mutate({ reviewId: review.id, isVisible: !review.isVisible, reason });
  }

  async function publishResponse(review: Review): Promise<void> {
    const publicResponse = await requestReason({
      title: review.adminResponse ? 'Replace the public admin response?' : 'Add a public admin response?',
      description: 'This text is public support communication. Customers and providers may rely on it, so do not include private notes, phone numbers, or internal investigation details.',
      confirmLabel: 'Continue',
      reasonLabel: 'Public response',
      placeholder: 'Write the response that should appear with this review.',
      minLength: 3,
      maxLength: 2000,
      tone: 'default',
    });
    if (!publicResponse) return;
    const auditReason = await requestReason({
      title: 'Confirm public response',
      description: 'Record the internal support rationale for publishing this response. This rationale stays in the admin audit trail and is not shown publicly.',
      confirmLabel: 'Publish response',
      placeholder: 'Reference the support review, policy, or case outcome behind the response.',
      tone: 'default',
    });
    if (!auditReason) return;
    response.mutate({ reviewId: review.id, response: publicResponse, reason: auditReason });
  }

  if (q.isLoading) return <LoadingState label="Loading reviews…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  // BUG-PHASE20-01: extract rows from paginated envelope
  const data = q.data ?? { rows: [], total: 0, page: 1, pageSize: 20 };
  const reviews = data.rows;
  const selectedReview = !exactSelectionMalformed && hasExactSelection
    ? reviews.find((review) => review.id === requestedReviewId) ?? null
    : null;
  const exactSelectionMissing = hasExactSelection && !exactSelectionMalformed && !selectedReview;
  const displayedReviews = hasExactSelection ? (selectedReview ? [selectedReview] : []) : reviews;

  if (!hasExactSelection && data.total === 0) return <EmptyState title="No reviews yet" description="This provider has not received any reviews." />;

  return (
    <div className="space-y-3 mt-4">
      {selectedReview && (
        <Card className="border-sky-200 bg-sky-50 p-4" role="status">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Exact provider review evidence</p>
          <p className="mt-1 text-sm text-sky-950">
            Showing only review <span className="font-mono text-xs">{selectedReview.id}</span> from this provider&apos;s canonical review record.
          </p>
          {onClearExactReview && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactReview}>
              View all provider reviews
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMalformed && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">Provider review ID must be a complete UUID. No review is selected.</p>
          {onClearExactReview && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactReview}>
              View all provider reviews
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMissing && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">
            The requested review is not part of this provider&apos;s canonical review record. No substitute review is shown.
          </p>
          {onClearExactReview && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactReview}>
              View all provider reviews
            </Button>
          )}
        </Card>
      )}
      <div className="flex items-center justify-between gap-3">
        {!hasExactSelection && (
          <p className="text-xs text-[var(--color-text-secondary)]">{data.total} review{data.total === 1 ? '' : 's'} on record</p>
        )}
        {(visibility.isError || response.isError) && (
          <p role="alert" className="text-xs text-red-700">{getErrorMessage(visibility.error ?? response.error)}</p>
        )}
      </div>
      {displayedReviews.map((r) => (
        <Card
          key={r.id}
          aria-current={r.id === selectedReview?.id ? 'true' : undefined}
          className={`p-4 ${!r.isVisible ? 'opacity-60' : ''} ${r.id === selectedReview?.id ? 'border-sky-400 ring-2 ring-sky-100' : ''}`}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link to={`/customers/${r.reviewerId}`} aria-label={`Open customer ${r.reviewerId}`} className="font-medium text-sm text-[var(--color-primary)] hover:underline">
                  {r.reviewerName}
                </Link>
                <span className="inline-flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} size={13} className={index < r.rating ? 'text-amber-500' : 'text-slate-300'} fill={index < r.rating ? 'currentColor' : 'none'} aria-hidden="true" />
                  ))}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">{formatDate(r.createdAt)}</span>
                {!r.isVisible && <Badge label="hidden" variant="warning" />}
                {r.isFlagged && <Badge label="flagged" variant="danger" />}
              </div>
              <p className="text-sm text-[var(--color-text)] mt-1 whitespace-pre-wrap">{r.comment}</p>
              <Link to={`/bookings/${r.bookingId}`} aria-label={`Open booking ${r.bookingId}`} className="mt-1 inline-flex font-mono text-xs text-[var(--color-primary)] hover:underline">
                Booking {r.bookingId.slice(0, 8)}
              </Link>
              {r.privateNote && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Private customer note to onService</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-amber-950">{r.privateNote}</p>
                  <p className="mt-1 text-xs text-amber-800">Internal support context. Never shown to the provider or public.</p>
                </div>
              )}
              {r.imageUrls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Customer review photos">
                  {r.imageUrls.map((imageUrl, index) => (
                    <a key={imageUrl} href={imageUrl} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={imageUrl}
                        alt={`Customer review evidence ${index + 1}`}
                        className="h-20 w-20 rounded-md border border-[var(--color-border)] object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              {r.adminResponse && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-2 italic border-l-2 border-slate-300 pl-2">
                  Admin response: {r.adminResponse}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void changeVisibility(r)}
                disabled={visibility.isPending || response.isPending}
              >
                {r.isVisible ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Restore</>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void publishResponse(r)}
                disabled={visibility.isPending || response.isPending}
              >
                <MessageSquare size={12} /> {r.adminResponse ? 'Replace response' : 'Add response'}
              </Button>
            </div>
          </div>
        </Card>
      ))}
      {!hasExactSelection && data.total > data.pageSize && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={Math.ceil(data.total / data.pageSize)}
          onPageChange={setPage}
        />
      )}
      {reasonDialog}
    </div>
  );
}

// ─── Disputes Tab ─────────────────────────────────────────────────────────

export function DisputesTab({ providerId }: { providerId: string }): React.ReactElement {
  const [page, setPage] = useState(1);
  // BUG-PHASE20-01 (same pattern): API returns paginated envelope, not array.
  // The crash here is dormant when there are zero disputes (length on
  // undefined would also crash, but the `disputes.length === 0` guard hits
  // before .map). For non-zero, .map would throw the same TypeError.
  const q = useQuery({
    queryKey: ['admin-provider-disputes', providerId, page],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: { rows: Dispute[]; total: number; page: number; pageSize: number };
      }>(
        `/api/v1/admin/providers/${providerId}/disputes`,
        { params: { page, pageSize: 20 } },
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState label="Loading disputes…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const data = q.data!;
  const disputes = data.rows;

  if (data.total === 0) return <EmptyState title="No disputes" description="This provider has no disputes." />;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">{data.total} dispute{data.total === 1 ? '' : 's'} linked to this provider</p>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Dispute</th>
              <th className="px-3 py-2 text-left">Booking</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Resolution</th>
              <th className="px-3 py-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-3 py-2"><Link to={`/disputes/${d.id}`} aria-label={`Open dispute ${d.id}`} className="font-mono text-xs text-[var(--color-primary)] hover:underline">{d.id.slice(0, 8)}</Link></td>
                <td className="px-3 py-2"><Link to={`/bookings/${d.bookingId}`} aria-label={`Open booking ${d.bookingId}`} className="font-mono text-xs text-[var(--color-primary)] hover:underline">{d.bookingId.slice(0, 8)}</Link></td>
                <td className="px-3 py-2"><Link to={`/customers/${d.customerId}`} aria-label={`Open customer ${d.customerId}`} className="text-[var(--color-primary)] hover:underline">{d.customerName}</Link></td>
                <td className="px-3 py-2"><Badge label={d.status} variant={d.status === 'resolved' ? 'success' : d.status === 'escalated' ? 'danger' : 'warning'} /></td>
                <td className="px-3 py-2">{d.resolutionType ?? '—'}</td>
                <td className="px-3 py-2">{formatDate(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {data.total > data.pageSize && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={Math.ceil(data.total / data.pageSize)}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────

export function ActivityTab({
  providerId,
  exactAdminActionId = '',
  onClearExactAdminAction,
}: {
  providerId: string;
  exactAdminActionId?: string;
  onClearExactAdminAction?: () => void;
}): React.ReactElement {
  const [limit, setLimit] = useState(50);
  const rawAdminActionId = exactAdminActionId.trim();
  const hasExactAdminAction = rawAdminActionId.length > 0;
  const hasValidExactAdminAction = UUID_REGEX.test(rawAdminActionId);
  const requestedAdminActionId = hasValidExactAdminAction
    ? rawAdminActionId.toLowerCase()
    : rawAdminActionId;
  const q = useQuery({
    queryKey: ['admin-provider-activity', providerId, limit, requestedAdminActionId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: ActivityRow[] }>(
        `/api/v1/admin/providers/${providerId}/activity`,
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
        title="Invalid provider activity link"
        description="Admin action ID must be a complete UUID. No activity records were requested."
        action={onClearExactAdminAction ? (
          <Button variant="secondary" size="sm" onClick={onClearExactAdminAction}>
            Clear activity selection
          </Button>
        ) : undefined}
      />
    );
  }
  if (q.isLoading) return <LoadingState label="Loading activity…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const rows = q.data!;
  const exactActivity = hasExactAdminAction
    ? rows.find((row) => row.id === `admin_action:${requestedAdminActionId}`) ?? null
    : null;
  const visibleRows = hasExactAdminAction ? exactActivity ? [exactActivity] : [] : rows;

  return (
    <div className="mt-4 space-y-3">
      {hasExactAdminAction && exactActivity && (
        <Card className="border-2 border-[var(--color-secondary)] bg-[var(--color-secondary)]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Exact provider account decision</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                This activity row is scoped by both the provider account and admin-action ID retained by the Audit Log.
              </p>
            </div>
            {onClearExactAdminAction && (
              <Button variant="secondary" size="sm" onClick={onClearExactAdminAction}>
                Show recent provider activity
              </Button>
            )}
          </div>
        </Card>
      )}
      {hasExactAdminAction && !exactActivity && (
        <Card className="border-2 border-[var(--color-warning)] bg-[var(--color-warning)]/5 p-4" role="alert">
          <p className="text-sm font-semibold text-[var(--color-text)]">Admin decision is not in this provider activity file</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            The requested decision never belonged to this provider or is unavailable. No substitute activity is shown; return to the Audit Log for the durable event record.
          </p>
          {onClearExactAdminAction && (
            <Button className="mt-3" variant="secondary" size="sm" onClick={onClearExactAdminAction}>
              Show recent provider activity
            </Button>
          )}
        </Card>
      )}
      {!hasExactAdminAction && <select
        aria-label="Provider activity row limit"
        value={limit}
        onChange={(event) => setLimit(Number(event.target.value))}
        className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white"
      >
        <option value={50}>Last 50</option>
        <option value={100}>Last 100</option>
        <option value={200}>Last 200</option>
      </select>}
      {visibleRows.length === 0 ? (
        !hasExactAdminAction
          ? <EmptyState title="No activity" description="No recent admin actions, account events, or login attempts on file." />
          : null
      ) : (
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
        <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Actor</th>
            <th className="px-3 py-2 text-left">Action</th>
            <th className="px-3 py-2 text-left">Detail</th>
            <th className="px-3 py-2 text-left">IP</th>
            <th className="px-3 py-2 text-left">Device / client</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr
              key={r.id}
              aria-current={hasExactAdminAction ? 'true' : undefined}
              className={hasExactAdminAction
                ? 'border-t border-[var(--color-secondary)] bg-[var(--color-secondary)]/5'
                : 'border-t border-slate-100'}
            >
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-2"><Badge label={r.source} variant={r.source === 'admin_action' ? 'danger' : r.source === 'login' ? 'info' : 'success'} /></td>
              <td className="px-3 py-2 text-xs">
                <p className="font-medium text-[var(--color-text)]">{r.actor?.name ?? (r.actor?.kind === 'system' ? 'System' : 'Unknown user')}</p>
                <p className="text-[var(--color-text-secondary)]">{r.actor?.kind ?? 'unknown'}{r.actor?.id ? ` · ${r.actor.id.slice(0, 8)}…` : ''}</p>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
              <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)] max-w-sm break-words">{r.detail ?? '—'}</td>
              <td className="px-3 py-2 text-xs font-mono">{r.ipAddress ?? '—'}</td>
              <td className="px-3 py-2 text-xs truncate max-w-xs" title={r.userAgent ?? ''}>{r.userAgent ?? '—'}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </Card>
      )}
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────

// ─── Staff / team members (D23) ──────────────────────────────────────────────

interface StaffMember {
  id: string;
  userId: string | null;
  userName: string | null;
  roleTitle: string | null;
  status: 'invited' | 'pending_review' | 'approved' | 'rejected' | 'suspended' | 'deactivated';
  invitePhone: string | null;
  inviteEmail: string | null;
  contactMasked: boolean;
  adminDecisionReason: string | null;
  isAssignable: boolean;
  createdAt: string;
  performance: { totalJobs: number; totalReviews: number; averageRating: number };
}

const STAFF_STATUS_BADGE: Record<StaffMember['status'], 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  invited: 'info',
  pending_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
  deactivated: 'default',
};

export function StaffTab({
  providerId,
  exactStaffId = '',
  onClearExactStaff,
}: {
  providerId: string;
  exactStaffId?: string;
  onClearExactStaff?: () => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const { requestReason, reasonDialog } = useReasonDialog();
  const [reviewDialog, setReviewDialog] = useState<{
    staff: StaffMember;
    decision: 'rejected' | 'sent_back';
  } | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const rawStaffId = exactStaffId.trim();
  const hasExactSelection = rawStaffId.length > 0;
  const exactSelectionMalformed = hasExactSelection && !UUID_REGEX.test(rawStaffId);
  const requestedStaffId = exactSelectionMalformed ? rawStaffId : rawStaffId.toLowerCase();

  const q = useQuery({
    queryKey: ['admin-provider-staff', providerId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: StaffMember[] }>(
        `/api/v1/admin/providers/${providerId}/staff`,
      );
      return res.data.data;
    },
    enabled: !exactSelectionMalformed,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-provider-staff', providerId] });
  };

  const review = useMutation({
    mutationFn: async (vars: { staffId: string; decision: 'approved' | 'rejected' | 'sent_back'; reason?: string }) => {
      await api.post(`/api/v1/admin/providers/${providerId}/staff/${vars.staffId}/review`, {
        decision: vars.decision,
        reason: vars.reason,
      });
    },
    onSuccess: () => {
      setActionError('');
      setReviewDialog(null);
      setReviewReason('');
      invalidate();
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const suspend = useMutation({
    mutationFn: async (vars: { staffId: string; suspend: boolean; reason: string }) => {
      await api.post(`/api/v1/admin/providers/${providerId}/staff/${vars.staffId}/suspend`, {
        suspend: vars.suspend,
        reason: vars.reason,
      });
    },
    onSuccess: () => { setActionError(''); invalidate(); },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  if (q.isLoading) return <LoadingState label="Loading team members…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const staff = q.data ?? [];
  const selectedStaff = !exactSelectionMalformed && hasExactSelection
    ? staff.find((member) => member.id === requestedStaffId) ?? null
    : null;
  const exactSelectionMissing = hasExactSelection && !exactSelectionMalformed && !selectedStaff;
  const displayedStaff = hasExactSelection ? (selectedStaff ? [selectedStaff] : []) : staff;
  const busy = review.isPending || suspend.isPending;

  function approve(s: StaffMember): void {
    review.mutate({ staffId: s.id, decision: 'approved' });
  }
  function reject(s: StaffMember): void {
    setReviewReason('');
    setReviewDialog({ staff: s, decision: 'rejected' });
  }
  function sendBack(s: StaffMember): void {
    setReviewReason('');
    setReviewDialog({ staff: s, decision: 'sent_back' });
  }
  async function setSuspend(s: StaffMember, doSuspend: boolean): Promise<void> {
    setActionError('');
    const memberName = s.userName || s.roleTitle || 'this team member';
    const reason = await requestReason({
      title: doSuspend ? `Suspend ${memberName}?` : `Reactivate ${memberName}?`,
      description: doSuspend
        ? 'Suspension immediately blocks this member from opening or updating assigned jobs. The provider must take over or reassign any current work.'
        : 'Reactivation returns this member to the provider’s approved assignment list.',
      confirmLabel: doSuspend ? 'Suspend member' : 'Reactivate member',
      reasonLabel: doSuspend ? 'Suspension reason' : 'Reactivation reason',
      placeholder: doSuspend
        ? 'Record the evidence or support case that requires suspension.'
        : 'Record what was reviewed before restoring assignment access.',
      minLength: 10,
      maxLength: 1000,
      tone: doSuspend ? 'destructive' : 'default',
    });
    if (reason) suspend.mutate({ staffId: s.id, suspend: doSuspend, reason });
  }

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Team members the provider added. Each is reviewed here before they can be assigned jobs.
        Their job performance counts toward this provider&apos;s overall rating; the per-member
        numbers below are the breakdown.
      </p>
      {selectedStaff && (
        <Card className="border-sky-200 bg-sky-50 p-4" role="status">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Exact team member evidence</p>
          <p className="mt-1 text-sm text-sky-950">
            Showing only team member <span className="font-mono text-xs">{selectedStaff.id}</span> from this provider&apos;s current retained team records.
          </p>
          {onClearExactStaff && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactStaff}>
              View all team members
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMalformed && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">Team member ID must be a complete UUID. No team member is selected.</p>
          {onClearExactStaff && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactStaff}>
              View all team members
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMissing && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">
            The requested team member is not part of this provider&apos;s retained team list. No substitute team member is shown.
          </p>
          {onClearExactStaff && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactStaff}>
              View all team members
            </Button>
          )}
        </Card>
      )}
      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

      {!hasExactSelection && staff.length === 0 ? (
        <EmptyState title="No team members" description="This provider hasn't added any staff yet." />
      ) : displayedStaff.length > 0 ? (
        displayedStaff.map((s) => (
          <Card
            key={s.id}
            aria-current={s.id === selectedStaff?.id ? 'true' : undefined}
            className={`p-4 ${s.id === selectedStaff?.id ? 'border-sky-400 ring-2 ring-sky-100' : ''}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[var(--color-text)]">
                    {s.userName || s.roleTitle || 'Invited member'}
                  </span>
                  <Badge label={s.status.replace(/_/g, ' ')} variant={STAFF_STATUS_BADGE[s.status]} />
                  {s.roleTitle && s.userName && (
                    <span className="text-xs text-[var(--color-text-secondary)]">{s.roleTitle}</span>
                  )}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-1 flex flex-wrap gap-3">
                  {s.invitePhone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {s.invitePhone}</span>}
                  {s.inviteEmail && <span className="inline-flex items-center gap-1"><Mail size={12} /> {s.inviteEmail}</span>}
                  {s.contactMasked && (s.invitePhone || s.inviteEmail) && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      Invite contact masked
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Star size={12} /> {s.performance.averageRating.toFixed(2)} ({s.performance.totalReviews} reviews)
                  </span>
                  <span>{s.performance.totalJobs} jobs done</span>
                </div>
                {s.adminDecisionReason && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">Note: {s.adminDecisionReason}</p>
                )}
              </div>
              <div className="flex flex-col gap-1 items-stretch">
                {s.status === 'pending_review' && (
                  <>
                    <Button size="sm" onClick={() => approve(s)} disabled={busy}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => sendBack(s)} disabled={busy}>Send back</Button>
                    <Button size="sm" variant="outline" onClick={() => reject(s)} disabled={busy}>Reject</Button>
                  </>
                )}
                {s.status === 'approved' && (
                  <Button size="sm" variant="outline" onClick={() => void setSuspend(s, true)} disabled={busy}>Suspend</Button>
                )}
                {s.status === 'suspended' && (
                  <Button size="sm" onClick={() => void setSuspend(s, false)} disabled={busy}>Reactivate</Button>
                )}
              </div>
            </div>
          </Card>
        ))
      ) : null}

      {reviewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-staff-review-title"
            className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-white p-5"
          >
            <h3 id="provider-staff-review-title" className="text-lg font-semibold text-[var(--color-text)]">
              {reviewDialog.decision === 'rejected' ? 'Reject team member' : 'Send application back'}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {reviewDialog.staff.userName || reviewDialog.staff.roleTitle || 'Invited member'}
            </p>
            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
              This explanation is saved with the decision and shared with the provider.
            </p>
            <label htmlFor="provider-staff-review-reason" className="mt-4 block text-sm font-medium text-[var(--color-text)]">
              {reviewDialog.decision === 'rejected' ? 'Rejection reason' : 'What needs to be fixed'}
            </label>
            <Textarea
              id="provider-staff-review-reason"
              aria-label="Provider team review reason"
              className="mt-1"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder="Give the provider a clear, actionable explanation"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setReviewDialog(null); setReviewReason(''); }}
              >
                Cancel
              </Button>
              <Button
                variant={reviewDialog.decision === 'rejected' ? 'destructive' : 'default'}
                disabled={review.isPending || reviewReason.trim().length < 3}
                onClick={() => review.mutate({
                  staffId: reviewDialog.staff.id,
                  decision: reviewDialog.decision,
                  reason: reviewReason.trim(),
                })}
              >
                {review.isPending
                  ? 'Saving...'
                  : reviewDialog.decision === 'rejected'
                    ? 'Reject member'
                    : 'Send back'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {reasonDialog}
    </div>
  );
}

export function NotesTab({
  providerId,
  exactNoteId = '',
  onClearExactNote,
}: {
  providerId: string;
  exactNoteId?: string;
  onClearExactNote?: () => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const myUserId = useAuthStore((s) => s.user?.id);
  const { requestReason, reasonDialog } = useReasonDialog();
  const rawNoteId = exactNoteId.trim();
  const hasExactSelection = rawNoteId.length > 0;
  const exactSelectionMalformed = hasExactSelection && !UUID_REGEX.test(rawNoteId);
  const requestedNoteId = exactSelectionMalformed ? rawNoteId : rawNoteId.toLowerCase();

  const q = useQuery({
    queryKey: ['admin-provider-notes', providerId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Note[] }>(
        `/api/v1/admin/providers/${providerId}/notes`,
      );
      return res.data.data;
    },
    enabled: !exactSelectionMalformed,
  });

  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'general' | 'quality' | 'financial' | 'legal'>('general');
  const [pinned, setPinned] = useState(false);
  const [createError, setCreateError] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [noteActionError, setNoteActionError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<Note['category']>('general');

  const create = useMutation({
    mutationFn: async () => {
      await api.post(`/api/v1/admin/providers/${providerId}/notes`, { body, category, pinned });
    },
    onSuccess: () => {
      setBody('');
      setPinned(false);
      setCategory('general');
      setCreateError('');
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', providerId] });
    },
    onError: (err) => setCreateError(getErrorMessage(err)),
  });

  const togglePin = useMutation({
    mutationFn: async (n: Note) => {
      await api.patch(`/api/v1/admin/providers/${providerId}/notes/${n.id}`, { pinned: !n.pinned });
    },
    onSuccess: () => {
      setNoteActionError('');
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', providerId] });
    },
    onError: (error) => setNoteActionError(getErrorMessage(error)),
  });

  const update = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/v1/admin/providers/${providerId}/notes/${editingId}`, {
        body: editBody,
        category: editCategory,
      });
    },
    onSuccess: () => {
      setEditingId(null);
      setEditBody('');
      setNoteActionError('');
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', providerId] });
    },
    onError: (error) => setNoteActionError(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async ({ noteId, reason }: { noteId: string; reason: string }) => {
      await api.delete(`/api/v1/admin/providers/${providerId}/notes/${noteId}`, {
        body: { reason },
      });
    },
    onSuccess: () => {
      setRemoveError('');
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', providerId] });
    },
    onError: (error) => setRemoveError(getErrorMessage(error)),
  });

  async function requestNoteDeletion(noteId: string): Promise<void> {
    setRemoveError('');
    const reason = await requestReason({
      title: 'Delete internal note?',
      description:
        'The note will be hidden from Provider 360. Its deletion, operator, and reason remain in the audit record.',
      confirmLabel: 'Delete note',
      reasonLabel: 'Deletion reason',
      placeholder: 'Explain why this support record should be removed from the active provider file.',
      minLength: 10,
      maxLength: 1000,
      tone: 'destructive',
    });
    if (reason) remove.mutate({ noteId, reason });
  }

  if (q.isLoading) return <LoadingState label="Loading notes…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const notes = q.data ?? [];
  const selectedNote = !exactSelectionMalformed && hasExactSelection
    ? notes.find((note) => note.id === requestedNoteId) ?? null
    : null;
  const exactSelectionMissing = hasExactSelection && !exactSelectionMalformed && !selectedNote;
  const displayedNotes = hasExactSelection ? (selectedNote ? [selectedNote] : []) : notes;

  return (
    <div className="space-y-4 mt-4">
      {selectedNote && (
        <Card className="border-sky-200 bg-sky-50 p-4" role="status">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Exact provider note evidence</p>
          <p className="mt-1 text-sm text-sky-950">
            Showing only active internal note <span className="font-mono text-xs">{selectedNote.id}</span> from this provider&apos;s current support file.
          </p>
          {onClearExactNote && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactNote}>
              View all provider notes
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMalformed && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">Provider note ID must be a complete UUID. No internal note is selected.</p>
          {onClearExactNote && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactNote}>
              View all provider notes
            </Button>
          )}
        </Card>
      )}
      {exactSelectionMissing && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">
            The requested note is not in this provider&apos;s active internal file. It may have been deleted or belong to another provider. The Audit Log remains the durable event record. No substitute note is shown.
          </p>
          {onClearExactNote && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearExactNote}>
              View all provider notes
            </Button>
          )}
        </Card>
      )}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 inline-flex items-center gap-1">
          <Plus size={14} /> Add internal note
        </h3>
        {createError && <p role="alert" className="text-xs text-red-700 mb-2">{createError}</p>}
        <Textarea
          rows={3}
          aria-label="Internal note"
          placeholder="Internal note (not visible to provider)…"
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-[var(--color-text-tertiary)]">{body.length}/5000</p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <select aria-label="Note category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="px-3 py-2 border rounded text-sm">
            <option value="general">General</option>
            <option value="quality">Quality</option>
            <option value="financial">Financial</option>
            <option value="legal">Legal</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={pinned} onCheckedChange={(v) => setPinned(Boolean(v))} />
            Pin to top
          </label>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !body.trim() || body.length > 5000}>
            Save Note
          </Button>
        </div>
      </Card>

      {removeError && <p role="alert" className="text-sm text-[var(--color-danger)]">{removeError}</p>}
      {noteActionError && <p role="alert" className="text-sm text-[var(--color-danger)]">{noteActionError}</p>}

      {!hasExactSelection && notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Add the first internal note above." />
      ) : (
        displayedNotes.map((n) => {
          const canEdit = isSuperAdmin || n.authorId === myUserId;
          return (
            <Card
              key={n.id}
              aria-current={n.id === selectedNote?.id ? 'true' : undefined}
              className={`p-4 ${n.pinned ? 'border-amber-300 bg-amber-50/40' : ''} ${n.id === selectedNote?.id ? 'border-sky-400 ring-2 ring-sky-100' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Badge label={n.category} variant="info" />
                    {n.pinned && <Badge label="pinned" variant="warning" />}
                    <span className="text-[var(--color-text-secondary)]">{n.authorName}</span>
                    <span className="text-[var(--color-text-secondary)]">{formatDate(n.createdAt)}</span>
                  </div>
                  {editingId === n.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        aria-label={`Edit note by ${n.authorName}`}
                        rows={4}
                        maxLength={5000}
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <select
                          aria-label="Edit note category"
                          value={editCategory}
                          onChange={(event) => setEditCategory(event.target.value as Note['category'])}
                          className="min-h-11 rounded border border-[var(--color-border)] px-3 text-sm"
                        >
                          <option value="general">General</option>
                          <option value="quality">Quality</option>
                          <option value="financial">Financial</option>
                          <option value="legal">Legal</option>
                        </select>
                        <span className="text-xs text-[var(--color-text-tertiary)]">{editBody.length}/5000</span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setEditingId(null); setNoteActionError(''); }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={update.isPending || !editBody.trim()}
                            onClick={() => update.mutate()}
                          >
                            Save changes
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-text)] mt-2 whitespace-pre-wrap">{n.body}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(n.id);
                        setEditBody(n.body);
                        setEditCategory(n.category);
                        setNoteActionError('');
                      }}
                      disabled={update.isPending}
                    >
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => togglePin.mutate(n)} disabled={togglePin.isPending}>
                      {n.pinned ? 'Unpin' : 'Pin'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void requestNoteDeletion(n.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 size={12} /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}
      {reasonDialog}
    </div>
  );
}

// silence unused-imports warnings for icons reserved for future use
void Pencil;
void RefreshCw;
void Calendar;
void FileText;
void MessageSquare;

