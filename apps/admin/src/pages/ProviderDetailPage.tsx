import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import Pagination from '@/components/ui/Pagination';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { VettingChecklist, buildChecklistSummary, type VettingState } from '@/components/VettingChecklist';
import { useAuthStore } from '@/stores/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────

interface ProviderProfile {
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
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
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
  serviceAreas: { id: string; name: string; isPrimary: boolean }[];
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
  reviewerName: string;
  rating: number;
  comment: string;
  isVisible: boolean;
  adminResponse: string | null;
  imageUrls: string[];
  createdAt: string;
}

interface Dispute {
  id: string;
  bookingId: string;
  customerName: string;
  status: string;
  resolutionType: string | null;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  source: 'audit' | 'login';
  action: string;
  detail: string | null;
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

const TABS = ['profile', 'jobs', 'financials', 'reviews', 'staff', 'disputes', 'activity', 'notes'] as const;
type TabId = (typeof TABS)[number];
void TABS;

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatPHP(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(centavos / 100);
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
  const [activeTab, setActiveTab] = useState<TabId>('profile');

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
    <div className="p-6 space-y-6">
      <Link
        to="/providers"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-secondary)] hover:underline"
      >
        <ArrowLeft size={14} /> Back to Providers
      </Link>

      <ProviderHeader profile={p} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab profile={p} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab providerId={id} />
        </TabsContent>
        <TabsContent value="financials">
          <FinancialsTab providerId={id} />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewsTab providerId={id} />
        </TabsContent>
        <TabsContent value="staff">
          <StaffTab providerId={id} />
        </TabsContent>
        <TabsContent value="disputes">
          <DisputesTab providerId={id} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab providerId={id} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab providerId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function ProviderHeader({ profile }: { profile: ProviderProfile }): React.ReactElement {
  // Phase L MED-L04 fix — guard against partial/missing user object
  // during initial render. Pre-fix profile.user.avatarUrl threw when
  // the user sub-object was still undefined from the API.
  const user = profile.user ?? { avatarUrl: null, fullName: '' };
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
              <Phone size={12} /> {('phone' in user ? (user as { phone?: string }).phone : '') || '—'}
            </span>
            {('email' in user) && (user as { email?: string }).email && (
              <span className="inline-flex items-center gap-1">
                <Mail size={12} /> {(user as { email?: string }).email}
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

      {profile.status === 'pending' && <ApprovalPanel profile={profile} />}
    </Card>
  );
}

// ─── Approval panel (vetting checklist gate) ────────────────────────────────
//
// For pending providers the admin reviews the documents on the Profile tab,
// then confirms the vetting rubric here. The Approve button stays disabled
// until every checklist item is ticked AND the rationale is filled. On
// approve we call the existing approve endpoint, then record the rationale +
// a one-line checklist summary as a 'quality' provider note via the existing
// notes API.

function ApprovalPanel({ profile }: { profile: ProviderProfile }): React.ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vetting, setVetting] = useState<VettingState>({ isComplete: false, rationale: '' });
  const [error, setError] = useState('');

  const approve = useMutation({
    mutationFn: async () => {
      await api.put(`/api/v1/admin/providers/${profile.id}/approve`);
      // Record the vetting rationale + checklist summary as an internal
      // 'quality' note. Best-effort: the approval already committed, so a
      // note failure shouldn't surface as an approval failure.
      try {
        await api.post(`/api/v1/admin/providers/${profile.id}/notes`, {
          body: `Approval rationale: ${vetting.rationale}\n\n${buildChecklistSummary()}`,
          category: 'quality',
          pinned: false,
        });
      } catch {
        // swallow — approval succeeded; the note is a secondary record.
      }
    },
    onSuccess: () => {
      setError('');
      setOpen(false);
      setVetting({ isComplete: false, rationale: '' });
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-profile', profile.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', profile.id] });
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

function ProfileTab({ profile }: { profile: ProviderProfile }): React.ReactElement {
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

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Service Categories</h3>
        {(profile.categories ?? []).length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No categories on file.</p>
        ) : (
          <ul className="space-y-1">
            {(profile.categories ?? []).map((c) => (
              <li key={c.id} className="text-sm text-[var(--color-text)] flex justify-between">
                <span>{c.name}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {c.basePrice !== null ? formatPHP(c.basePrice) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Service Areas</h3>
        {(profile.serviceAreas ?? []).length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No service areas configured.</p>
        ) : (
          <ul className="space-y-1">
            {(profile.serviceAreas ?? []).map((a) => (
              <li key={a.id} className="text-sm text-[var(--color-text)] flex justify-between">
                <span>{a.name}</span>
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

// ─── Jobs Tab ─────────────────────────────────────────────────────────────

function JobsTab({ providerId }: { providerId: string }): React.ReactElement {
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
          <option value="completed">Completed</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In progress</option>
          <option value="disputed">Disputed</option>
          <option value="cancelled_by_customer">Cancelled (customer)</option>
          <option value="cancelled_by_provider">Cancelled (provider)</option>
        </select>
        <span className="text-xs text-[var(--color-text-secondary)]">{data.total} total</span>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
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
              <tr><td colSpan={8} className="text-center py-8 text-[var(--color-text-secondary)]">No jobs found.</td></tr>
            ) : data.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{formatDateOnly(row.scheduledAt)}</td>
                <td className="px-3 py-2">{row.customerName}</td>
                <td className="px-3 py-2">{row.categoryName}</td>
                <td className="px-3 py-2 text-right">{formatPHP(row.totalAmount)}</td>
                <td className="px-3 py-2 text-right">{formatPHP(row.serviceFee)}</td>
                <td className="px-3 py-2"><Badge label={row.status} variant="default" /></td>
                <td className="px-3 py-2">{row.rating != null ? `${row.rating} ★` : '—'}</td>
                <td className="px-3 py-2">{row.hasDispute ? <Badge label="yes" variant="danger" /> : '—'}</td>
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

function FinancialsTab({ providerId }: { providerId: string }): React.ReactElement {
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
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen((v) => !v)}>
              {adjustOpen ? 'Cancel' : 'Adjust Wallet'}
            </Button>
          )}
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
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Completed</th>
              </tr>
            </thead>
            <tbody>
              {f.recentPayouts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-[var(--color-text-secondary)]">No payouts yet.</td></tr>
              ) : f.recentPayouts.map((po) => (
                <tr key={po.id} className="border-t border-slate-100">
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

function ReviewsTab({ providerId }: { providerId: string }): React.ReactElement {
  const queryClient = useQueryClient();

  // BUG-PHASE20-01 fix: API returns a paginated envelope
  // {rows, total, page, pageSize}, not Review[]. Pre-fix the page typed
  // it as Review[] and called `reviews.map()` directly — this threw
  // "TypeError: reviews.map is not a function" the moment a user clicked
  // the Reviews tab. Read q.data.rows instead. Other tabs that share
  // this paginated pattern (Disputes, Jobs already correct) get the
  // same treatment.
  const q = useQuery({
    queryKey: ['admin-provider-reviews', providerId],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: { rows: Review[]; total: number; page: number; pageSize: number };
      }>(
        `/api/v1/admin/providers/${providerId}/reviews`,
      );
      return res.data.data;
    },
  });

  const visibility = useMutation({
    mutationFn: async (args: { reviewId: string; isVisible: boolean }) => {
      await api.patch(
        `/api/v1/admin/providers/${providerId}/reviews/${args.reviewId}/visibility`,
        { isVisible: args.isVisible },
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-provider-reviews', providerId] }),
  });

  if (q.isLoading) return <LoadingState label="Loading reviews…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  // BUG-PHASE20-01: extract rows from paginated envelope
  const reviews = q.data?.rows ?? [];

  if (reviews.length === 0) return <EmptyState title="No reviews yet" description="This provider has not received any reviews." />;

  return (
    <div className="space-y-3 mt-4">
      {reviews.map((r) => (
        <Card key={r.id} className={`p-4 ${!r.isVisible ? 'opacity-60' : ''}`}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{r.reviewerName}</span>
                <span className="text-xs text-amber-600">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">{formatDate(r.createdAt)}</span>
                {!r.isVisible && <Badge label="hidden" variant="warning" />}
              </div>
              <p className="text-sm text-[var(--color-text)] mt-1 whitespace-pre-wrap">{r.comment}</p>
              {r.adminResponse && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-2 italic border-l-2 border-slate-300 pl-2">
                  Admin response: {r.adminResponse}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => visibility.mutate({ reviewId: r.id, isVisible: !r.isVisible })}
              disabled={visibility.isPending}
            >
              {r.isVisible ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Disputes Tab ─────────────────────────────────────────────────────────

function DisputesTab({ providerId }: { providerId: string }): React.ReactElement {
  // BUG-PHASE20-01 (same pattern): API returns paginated envelope, not array.
  // The crash here is dormant when there are zero disputes (length on
  // undefined would also crash, but the `disputes.length === 0` guard hits
  // before .map). For non-zero, .map would throw the same TypeError.
  const q = useQuery({
    queryKey: ['admin-provider-disputes', providerId],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: { rows: Dispute[]; total: number; page: number; pageSize: number };
      }>(
        `/api/v1/admin/providers/${providerId}/disputes`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState label="Loading disputes…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const disputes = q.data?.rows ?? [];

  if (disputes.length === 0) return <EmptyState title="No disputes" description="This provider has no disputes." />;

  return (
    <Card className="p-0 overflow-x-auto mt-4">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Customer</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Resolution</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr key={d.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{formatDate(d.createdAt)}</td>
              <td className="px-3 py-2">{d.customerName}</td>
              <td className="px-3 py-2"><Badge label={d.status} variant={d.status === 'resolved' ? 'success' : 'warning'} /></td>
              <td className="px-3 py-2">{d.resolutionType ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────

function ActivityTab({ providerId }: { providerId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-provider-activity', providerId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: ActivityRow[] }>(
        `/api/v1/admin/providers/${providerId}/activity`,
        { params: { limit: 100 } },
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState label="Loading activity…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const rows = q.data!;

  if (rows.length === 0) return <EmptyState title="No activity" description="No recent admin actions or login attempts on file." />;

  return (
    <Card className="p-0 overflow-x-auto mt-4">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-[var(--color-text-secondary)] bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Action</th>
            <th className="px-3 py-2 text-left">IP</th>
            <th className="px-3 py-2 text-left">User Agent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-2"><Badge label={r.source} variant={r.source === 'audit' ? 'info' : 'default'} /></td>
              <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
              <td className="px-3 py-2 text-xs">{r.ipAddress ?? '—'}</td>
              <td className="px-3 py-2 text-xs truncate max-w-xs" title={r.userAgent ?? ''}>{r.userAgent ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
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

export function StaffTab({ providerId }: { providerId: string }): React.ReactElement {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');

  const q = useQuery({
    queryKey: ['admin-provider-staff', providerId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: StaffMember[] }>(
        `/api/v1/admin/providers/${providerId}/staff`,
      );
      return res.data.data;
    },
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
    onSuccess: () => { setActionError(''); invalidate(); },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const suspend = useMutation({
    mutationFn: async (vars: { staffId: string; suspend: boolean; reason?: string }) => {
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
  const staff = q.data!;
  const busy = review.isPending || suspend.isPending;

  function approve(s: StaffMember): void {
    review.mutate({ staffId: s.id, decision: 'approved' });
  }
  function reject(s: StaffMember): void {
    const reason = window.prompt('Reason for rejecting this team member? (required, shared with the provider)');
    if (reason == null || !reason.trim()) return;
    review.mutate({ staffId: s.id, decision: 'rejected', reason: reason.trim() });
  }
  function sendBack(s: StaffMember): void {
    const reason = window.prompt('What does the team member need to fix? (optional)');
    if (reason == null) return;
    review.mutate({ staffId: s.id, decision: 'sent_back', reason: reason.trim() || undefined });
  }
  function setSuspend(s: StaffMember, doSuspend: boolean): void {
    if (doSuspend && !window.confirm(`Suspend ${s.userName || s.roleTitle || 'this member'}? They will not be assignable to jobs.`)) return;
    suspend.mutate({ staffId: s.id, suspend: doSuspend });
  }

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Team members the provider added. Each is reviewed here before they can be assigned jobs.
        Their job performance counts toward this provider&apos;s overall rating; the per-member
        numbers below are the breakdown.
      </p>
      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

      {staff.length === 0 ? (
        <EmptyState title="No team members" description="This provider hasn't added any staff yet." />
      ) : (
        staff.map((s) => (
          <Card key={s.id} className="p-4">
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
                  <Button size="sm" variant="outline" onClick={() => setSuspend(s, true)} disabled={busy}>Suspend</Button>
                )}
                {s.status === 'suspended' && (
                  <Button size="sm" onClick={() => setSuspend(s, false)} disabled={busy}>Reactivate</Button>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function NotesTab({ providerId }: { providerId: string }): React.ReactElement {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const myUserId = useAuthStore((s) => s.user?.id);

  const q = useQuery({
    queryKey: ['admin-provider-notes', providerId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Note[] }>(
        `/api/v1/admin/providers/${providerId}/notes`,
      );
      return res.data.data;
    },
  });

  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'general' | 'quality' | 'financial' | 'legal'>('general');
  const [pinned, setPinned] = useState(false);
  const [createError, setCreateError] = useState('');

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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', providerId] }),
  });

  const remove = useMutation({
    mutationFn: async (noteId: string) => {
      await api.delete(`/api/v1/admin/providers/${providerId}/notes/${noteId}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-provider-notes', providerId] }),
  });

  if (q.isLoading) return <LoadingState label="Loading notes…" />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>} />;
  const notes = q.data!;

  return (
    <div className="space-y-4 mt-4">
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
          onChange={(e) => setBody(e.target.value)}
        />
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
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !body.trim()}>
            Save Note
          </Button>
        </div>
      </Card>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Add the first internal note above." />
      ) : (
        notes.map((n) => {
          const canEdit = isSuperAdmin || n.authorId === myUserId;
          return (
            <Card key={n.id} className={`p-4 ${n.pinned ? 'border-amber-300 bg-amber-50/40' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Badge label={n.category} variant="info" />
                    {n.pinned && <Badge label="pinned" variant="warning" />}
                    <span className="text-[var(--color-text-secondary)]">{n.authorName}</span>
                    <span className="text-[var(--color-text-secondary)]">{formatDate(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--color-text)] mt-2 whitespace-pre-wrap">{n.body}</p>
                </div>
                {canEdit && (
                  <div className="flex flex-col gap-1">
                    <Button variant="outline" size="sm" onClick={() => togglePin.mutate(n)} disabled={togglePin.isPending}>
                      {n.pinned ? 'Unpin' : 'Pin'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Delete this internal note?')) remove.mutate(n.id);
                      }}
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
    </div>
  );
}

// silence unused-imports warnings for icons reserved for future use
void Pencil;
void RefreshCw;
void Calendar;
void FileText;
void MessageSquare;

