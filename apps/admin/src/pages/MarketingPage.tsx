/**
 * Phase 09 — Admin Marketing page.
 *
 * Four tabs: Overview, Home Banners, Promo Codes, Campaigns.
 *  - Overview: KPI cards + channel breakdown table with date filter.
 *  - Promo Codes: list + super-admin create/edit/deactivate dialogs.
 *  - Campaigns: list + super-admin create/edit dialogs.
 *
 * Mirrors the structure and conventions of CustomersPage.tsx,
 * BookingDetailPage.tsx, and DisputeDetailPage.tsx.
 */

import React, { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  KpiCard,
  Badge,
  DataTable,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Pagination,
  type Column,
} from '@/components/ui';
import {
  Megaphone,
  Coins,
  Users,
  TrendingUp,
  Activity,
  Plus,
  Pencil,
  XCircle,
} from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { adminConfig } from '@/config/admin.config';
import PromotionBannersTab from '@/components/marketing/PromotionBannersTab';

// ─── Types (mirror packages/api/src/services/marketing-admin.service.ts) ──

type DiscountType = 'percentage' | 'fixed_centavos';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCentavos: number | null;
  minimumOrderCentavos: number;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number;
  timesUsed: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
}

interface MarketingCampaign {
  id: string;
  name: string;
  channel: string;
  startedAt: string;
  endedAt: string | null;
  spendCentavos: number;
  attributedSignups: number;
  attributedFirstBookings: number;
  attributedRevenueCentavos: number;
  notes: string | null;
  createdAt: string;
  cpaCentavos: number;
  roiPercent: number;
}

interface ChannelBreakdownRow {
  channel: string;
  spendCentavos: number;
  signups: number;
  cpaCentavos: number;
  revenueCentavos: number;
  roiPercent: number;
}

interface MarketingOverview {
  totalSpendCentavos: number;
  totalSignups: number;
  totalRevenueCentavos: number;
  aggregateCpaCentavos: number;
  aggregateRoiPercent: number;
  channelBreakdown: ChannelBreakdownRow[];
}

interface PromotionBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  badge: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  targetAudience: 'all' | 'new_customers' | 'returning' | 'providers';
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

type MarketingTab = 'overview' | 'banners' | 'promos' | 'campaigns';

const MARKETING_TABS = new Set<MarketingTab>(['overview', 'banners', 'promos', 'campaigns']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FALLBACK_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'billboard', label: 'Billboard' },
  { value: 'kiosk', label: 'Kiosk' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return 'No end date';
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

function parseMarketingTab(value: string | null): MarketingTab {
  return value && MARKETING_TABS.has(value as MarketingTab)
    ? value as MarketingTab
    : 'overview';
}

function promotionDeliveryLabel(promotion: PromotionBanner): string {
  if (promotion.targetAudience !== 'all') return 'Audience not connected';
  if (!promotion.isActive) return 'Draft / paused';
  const now = Date.now();
  if (new Date(promotion.startDate).getTime() > now) return 'Scheduled for customer home';
  if (promotion.endDate && new Date(promotion.endDate).getTime() < now) return 'Ended';
  return 'Live on customer home';
}

function channelLabel(value: string): string {
  return FALLBACK_CHANNEL_OPTIONS.find((o) => o.value === value)?.label
    ?? value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function toChannelOptions(channels: string[]): Array<{ value: string; label: string }> {
  return channels.map((value) => ({ value, label: channelLabel(value) }));
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function MarketingPage(): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPromotionId = searchParams.get('promotionId')?.trim() ?? '';
  const rawPromoCodeId = searchParams.get('promoCodeId')?.trim() ?? '';
  const rawCampaignId = searchParams.get('campaignId')?.trim() ?? '';
  const exactSelections = [rawPromotionId, rawPromoCodeId, rawCampaignId].filter(Boolean);
  const hasAmbiguousExactSelection = exactSelections.length > 1;
  const hasMalformedExactSelection = exactSelections.length === 1 && !UUID_REGEX.test(exactSelections[0]!);
  const requestedPromotionId = !hasAmbiguousExactSelection && UUID_REGEX.test(rawPromotionId)
    ? rawPromotionId.toLowerCase()
    : '';
  const requestedPromoCodeId = !hasAmbiguousExactSelection && UUID_REGEX.test(rawPromoCodeId)
    ? rawPromoCodeId.toLowerCase()
    : '';
  const requestedCampaignId = !hasAmbiguousExactSelection && UUID_REGEX.test(rawCampaignId)
    ? rawCampaignId.toLowerCase()
    : '';
  const selectedTab: MarketingTab | null = requestedPromotionId
    ? 'banners'
    : requestedPromoCodeId
      ? 'promos'
      : requestedCampaignId
        ? 'campaigns'
        : null;
  const activeTab = selectedTab ?? parseMarketingTab(searchParams.get('tab'));

  const exactPromotionQuery = useQuery({
    queryKey: ['admin-promotion-banners', 'exact', requestedPromotionId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: PromotionBanner }>(
        `/api/v1/promotions/${requestedPromotionId}`,
      );
      if (response.data.data.id !== requestedPromotionId) {
        throw new Error('The home-banner response did not match the selected audit record.');
      }
      return response.data.data;
    },
    enabled: Boolean(requestedPromotionId),
    retry: false,
  });

  const exactPromoCodeQuery = useQuery({
    queryKey: ['admin-marketing-promos', 'exact', requestedPromoCodeId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: PromoCode }>(
        `/api/v1/admin/marketing/promos/${requestedPromoCodeId}`,
      );
      if (response.data.data.id !== requestedPromoCodeId) {
        throw new Error('The promo-code response did not match the selected audit record.');
      }
      return response.data.data;
    },
    enabled: Boolean(requestedPromoCodeId),
    retry: false,
  });

  const exactCampaignQuery = useQuery({
    queryKey: ['admin-marketing-campaigns', 'exact', requestedCampaignId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: MarketingCampaign }>(
        `/api/v1/admin/marketing/campaigns/${requestedCampaignId}`,
      );
      if (response.data.data.id !== requestedCampaignId) {
        throw new Error('The campaign response did not match the selected audit record.');
      }
      return response.data.data;
    },
    enabled: Boolean(requestedCampaignId),
    retry: false,
  });

  const clearExactSelection = (): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('promotionId');
      next.delete('promoCodeId');
      next.delete('campaignId');
      return next;
    });
  };

  const selectTab = (tab: MarketingTab): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      next.delete('promotionId');
      next.delete('promoCodeId');
      next.delete('campaignId');
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Marketing</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Customer home banners, staged promo codes, and campaign tracking.
        </p>
      </div>

      {hasAmbiguousExactSelection && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          The Marketing link contains more than one exact record. No record was loaded. Clear the selection and open one audit record at a time.
          <div className="mt-3"><Button type="button" size="sm" variant="outline" onClick={clearExactSelection}>Clear selection</Button></div>
        </div>
      )}
      {hasMalformedExactSelection && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          The selected Marketing record ID is invalid. No record request was sent.
          <div className="mt-3"><Button type="button" size="sm" variant="outline" onClick={clearExactSelection}>Clear selection</Button></div>
        </div>
      )}
      {(exactPromotionQuery.isLoading || exactPromoCodeQuery.isLoading || exactCampaignQuery.isLoading) && (
        <LoadingState label="Loading selected Marketing audit evidence..." />
      )}
      {exactPromotionQuery.isError && (
        <ErrorState title="Selected home banner could not be loaded" description={getErrorMessage(exactPromotionQuery.error)} action={<Button type="button" variant="outline" onClick={clearExactSelection}>Clear selection</Button>} />
      )}
      {exactPromoCodeQuery.isError && (
        <ErrorState title="Selected promo code could not be loaded" description={getErrorMessage(exactPromoCodeQuery.error)} action={<Button type="button" variant="outline" onClick={clearExactSelection}>Clear selection</Button>} />
      )}
      {exactCampaignQuery.isError && (
        <ErrorState title="Selected campaign could not be loaded" description={getErrorMessage(exactCampaignQuery.error)} action={<Button type="button" variant="outline" onClick={clearExactSelection}>Clear selection</Button>} />
      )}
      {exactPromotionQuery.data && (
        <PromotionEvidenceCard promotion={exactPromotionQuery.data} onClear={clearExactSelection} />
      )}
      {exactPromoCodeQuery.data && (
        <PromoCodeEvidenceCard promo={exactPromoCodeQuery.data} onClear={clearExactSelection} />
      )}
      {exactCampaignQuery.data && (
        <CampaignEvidenceCard campaign={exactCampaignQuery.data} onClear={clearExactSelection} />
      )}

      <Tabs key={activeTab} defaultValue={activeTab} onValueChange={(value) => selectTab(value as MarketingTab)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="banners">Home Banners</TabsTrigger>
          <TabsTrigger value="promos">Promo Codes</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="banners">
          <PromotionBannersTab isSuperAdmin={isSuperAdmin} />
        </TabsContent>
        <TabsContent value="promos">
          <PromoCodesTab isSuperAdmin={isSuperAdmin} />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsTab isSuperAdmin={isSuperAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EvidenceField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-sky-700">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-slate-950 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function EvidenceShell({ children, onClear }: { children: React.ReactNode; onClear: () => void }): React.ReactElement {
  return (
    <Card className="border-sky-200 bg-sky-50/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Selected audit evidence</p>
          <p className="mt-1 text-sm text-sky-950">Read-only canonical record. Verify this record before taking a separate operational action.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>Clear selection</Button>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</dl>
    </Card>
  );
}

function PromotionEvidenceCard({ promotion, onClear }: { promotion: PromotionBanner; onClear: () => void }): React.ReactElement {
  return (
    <EvidenceShell onClear={onClear}>
      <EvidenceField label="Home banner" value={promotion.title} />
      <EvidenceField label="Promotion ID" value={promotion.id} mono />
      <EvidenceField label="Delivery status" value={promotionDeliveryLabel(promotion)} />
      <EvidenceField label="Audience" value={promotion.targetAudience === 'all' ? 'All customers' : `${promotion.targetAudience} (not connected)`} />
      <EvidenceField label="Customer copy" value={[promotion.badge, promotion.subtitle].filter(Boolean).join(' · ') || 'Title only'} />
      <EvidenceField label="Starts · Manila" value={fmtDateTime(promotion.startDate)} />
      <EvidenceField label="Ends · Manila" value={fmtDateTime(promotion.endDate)} />
      <EvidenceField label="CTA" value={promotion.ctaText ? `${promotion.ctaText} → ${promotion.ctaLink ?? 'Destination missing'}` : 'No CTA'} />
      <EvidenceField label="Display order" value={promotion.displayOrder} />
    </EvidenceShell>
  );
}

function PromoCodeEvidenceCard({ promo, onClear }: { promo: PromoCode; onClear: () => void }): React.ReactElement {
  const discount = promo.discountType === 'percentage'
    ? `${promo.discountValue}%`
    : formatCurrency(promo.discountValue);
  return (
    <EvidenceShell onClear={onClear}>
      <EvidenceField label="Promo code" value={promo.code} mono />
      <EvidenceField label="Promo code ID" value={promo.id} mono />
      <EvidenceField label="Stored status" value={promo.active ? 'Active configuration · runtime gate, validity, and limits still apply' : 'Inactive'} />
      <EvidenceField label="Description" value={promo.description || 'No description'} />
      <EvidenceField label="Discount" value={discount} />
      <EvidenceField label="Maximum discount" value={promo.maxDiscountCentavos === null ? 'No stored cap' : formatCurrency(promo.maxDiscountCentavos)} />
      <EvidenceField label="Minimum order" value={formatCurrency(promo.minimumOrderCentavos)} />
      <EvidenceField label="Usage" value={`${promo.timesUsed} used · ${promo.usageLimitTotal ?? 'No total limit'} total · ${promo.usageLimitPerCustomer} per customer`} />
      <EvidenceField label="Validity" value={`${fmtDate(promo.validFrom)} → ${fmtDate(promo.validUntil)}`} />
      <EvidenceField label="Created" value={fmtDateTime(promo.createdAt)} />
    </EvidenceShell>
  );
}

function CampaignEvidenceCard({ campaign, onClear }: { campaign: MarketingCampaign; onClear: () => void }): React.ReactElement {
  return (
    <EvidenceShell onClear={onClear}>
      <EvidenceField label="Campaign" value={campaign.name} />
      <EvidenceField label="Campaign ID" value={campaign.id} mono />
      <EvidenceField label="Evidence source" value="Staff-reported tracking record" />
      <EvidenceField label="Channel" value={channelLabel(campaign.channel)} />
      <EvidenceField label="Period" value={`${fmtDate(campaign.startedAt)} → ${fmtDate(campaign.endedAt)}`} />
      <EvidenceField label="Recorded spend" value={formatCurrency(campaign.spendCentavos)} />
      <EvidenceField label="Reported outcomes" value={`${campaign.attributedSignups} signups · ${campaign.attributedFirstBookings} first bookings`} />
      <EvidenceField label="Reported economics" value={`${formatCurrency(campaign.attributedRevenueCentavos)} revenue · ${formatCurrency(campaign.cpaCentavos)} CPA · ${campaign.roiPercent}% ROI`} />
      <EvidenceField label="Recorded notes" value={campaign.notes || 'No notes'} />
      <EvidenceField label="Created" value={fmtDateTime(campaign.createdAt)} />
    </EvidenceShell>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────

function OverviewTab(): React.ReactElement {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [dateError, setDateError] = useState('');

  const overviewQuery = useQuery({
    queryKey: ['admin-marketing-overview', appliedFrom, appliedTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (appliedFrom) params.from = appliedFrom;
      if (appliedTo) params.to = appliedTo;
      const res = await api.get<{ success: boolean; data: MarketingOverview }>(
        '/api/v1/admin/marketing/overview',
        { params },
      );
      return res.data.data;
    },
  });

  const handleApply = (e: FormEvent): void => {
    e.preventDefault();
    if (from && to && from > to) {
      setDateError('From date cannot be after To date.');
      return;
    }
    setDateError('');
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const channelColumns: Column<ChannelBreakdownRow>[] = useMemo(() => [
    {
      key: 'channel',
      header: 'Channel',
      render: (r) => <Badge label={channelLabel(r.channel)} variant="info" />,
    },
    {
      key: 'spend',
      header: 'Spend',
      render: (r) => <span>{formatCurrency(r.spendCentavos)}</span>,
    },
    {
      key: 'signups',
      header: 'Signups',
      render: (r) => <span>{r.signups}</span>,
    },
    {
      key: 'cpa',
      header: 'CPA',
      render: (r) =>
        r.cpaCentavos > 0 ? <span>{formatCurrency(r.cpaCentavos)}</span> : <span>—</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      render: (r) => <span>{formatCurrency(r.revenueCentavos)}</span>,
    },
    {
      key: 'roi',
      header: 'ROI',
      render: (r) => (
        <Badge
          label={`${r.roiPercent}%`}
          variant={r.roiPercent > 0 ? 'success' : r.roiPercent < 0 ? 'danger' : 'default'}
        />
      ),
    },
  ], []);

  if (overviewQuery.isLoading) return <LoadingState />;
  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <ErrorState
        title="Failed to load marketing overview"
        description={getErrorMessage(overviewQuery.error)}
        action={<Button type="button" variant="outline" onClick={() => void overviewQuery.refetch()}>Try again</Button>}
      />
    );
  }

  // Phase L MED-L04 fix — coalesce missing numeric fields so a partial
  // backend response (e.g. during tests, or while we extend the schema)
  // doesn't throw on `.toLocaleString()`. The query type guarantees the
  // wire shape but defensive defaults keep the page renderable.
  const oRaw = overviewQuery.data;
  const o = {
    ...oRaw,
    totalSpendCentavos: oRaw.totalSpendCentavos ?? 0,
    totalSignups: oRaw.totalSignups ?? 0,
    totalRevenueCentavos: oRaw.totalRevenueCentavos ?? 0,
    aggregateCpaCentavos: oRaw.aggregateCpaCentavos ?? 0,
    // Same defensive defaults for the remaining two overview fields: a
    // partial response otherwise renders "undefined%" for ROI and crashes
    // the channel-breakdown DataTable (.map on undefined).
    aggregateRoiPercent: oRaw.aggregateRoiPercent ?? 0,
    channelBreakdown: oRaw.channelBreakdown ?? [],
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-950">Manual attribution records</p>
        <p className="mt-1 text-sm text-amber-800">
          These totals come from campaign records entered by staff. They are not a messaging delivery report, payment ledger, or independently verified acquisition feed.
        </p>
      </div>

      <form onSubmit={handleApply} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-auto">
          <Label htmlFor="from-date">From</Label>
          <Input
            id="from-date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full sm:w-44"
          />
        </div>
        <div className="w-full sm:w-auto">
          <Label htmlFor="to-date">To</Label>
          <Input
            id="to-date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full sm:w-44"
          />
        </div>
        <Button type="submit" size="sm">Apply</Button>
        {(appliedFrom || appliedTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom('');
              setTo('');
              setAppliedFrom('');
              setAppliedTo('');
              setDateError('');
            }}
          >
            Reset
          </Button>
        )}
        {dateError && <p role="alert" className="w-full text-sm text-red-700">{dateError}</p>}
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Recorded Spend"
          value={formatCurrency(o.totalSpendCentavos)}
          icon={<Coins size={18} />}
        />
        <KpiCard
          title="Reported Signups"
          value={o.totalSignups.toLocaleString()}
          icon={<Users size={18} />}
        />
        <KpiCard
          title="Reported Revenue"
          value={formatCurrency(o.totalRevenueCentavos)}
          icon={<TrendingUp size={18} />}
        />
        <KpiCard
          title="Aggregate CPA"
          value={
            o.aggregateCpaCentavos > 0 ? formatCurrency(o.aggregateCpaCentavos) : '—'
          }
          icon={<Activity size={18} />}
        />
        <KpiCard
          title="Aggregate ROI"
          value={`${o.aggregateRoiPercent}%`}
          icon={<Megaphone size={18} />}
          trendPct={o.aggregateRoiPercent}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={channelColumns}
            data={o.channelBreakdown}
            keyExtractor={(r) => r.channel}
            emptyMessage="No campaigns in this date range."
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Promo codes tab ──────────────────────────────────────────────────────

interface PromoListResponse {
  success: boolean;
  data: { rows: PromoCode[]; total: number };
}

function PromoCodesTab({ isSuperAdmin }: { isSuperAdmin: boolean }): React.ReactElement {
  const queryClient = useQueryClient();
  const flags = useFeatureFlags();
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editPromo, setEditPromo] = useState<PromoCode | null>(null);
  const [deactivatePromo, setDeactivatePromoState] = useState<PromoCode | null>(null);

  const promosQuery = useQuery({
    queryKey: ['admin-marketing-promos', activeFilter, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: adminConfig.defaultPageSize,
        offset: (page - 1) * adminConfig.defaultPageSize,
      };
      if (activeFilter !== 'all') params.active = activeFilter === 'active' ? 'true' : 'false';
      const res = await api.get<PromoListResponse>('/api/v1/admin/marketing/promos', {
        params,
      });
      return res.data.data;
    },
  });

  const invalidate = (): void => {
    queryClient.invalidateQueries({ queryKey: ['admin-marketing-promos'] });
  };

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ success: boolean; data: PromoCode }>(
        `/api/v1/admin/marketing/promos/${id}/deactivate`,
      );
      return res.data.data;
    },
    onSuccess: () => {
      invalidate();
      setDeactivatePromoState(null);
    },
  });

  const columns: Column<PromoCode>[] = useMemo(() => [
    {
      key: 'code',
      header: 'Code',
      render: (r) => (
        <div>
          <span className="font-mono font-semibold text-[var(--color-text)]">{r.code}</span>
          {r.description && (
            <p className="text-xs text-[var(--color-text-secondary)]">{r.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      render: (r) =>
        r.discountType === 'percentage' ? (
          <span>{r.discountValue}%</span>
        ) : (
          <span>{formatCurrency(r.discountValue)}</span>
        ),
    },
    {
      key: 'min',
      header: 'Min Order',
      render: (r) =>
        r.minimumOrderCentavos > 0 ? (
          <span>{formatCurrency(r.minimumOrderCentavos)}</span>
        ) : (
          <span>—</span>
        ),
    },
    {
      key: 'validity',
      header: 'Validity',
      render: (r) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {fmtDate(r.validFrom)} → {fmtDate(r.validUntil)}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used / Limit',
      render: (r) => (
        <span>
          {r.timesUsed} / {r.usageLimitTotal ?? '∞'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => !flags.promoRedemptionEnabled && r.active ? (
        <Badge label="Staged · launch hold" variant="warning" />
      ) : (
        <Badge label={r.active ? 'Active' : 'Inactive'} variant={r.active ? 'success' : 'danger'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        isSuperAdmin ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditPromo(r)}>
              <Pencil size={12} /> Edit
            </Button>
            {r.active && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeactivatePromoState(r)}
              >
                <XCircle size={12} /> Deactivate
              </Button>
            )}
          </div>
        ) : null,
    },
  ], [flags.promoRedemptionEnabled, isSuperAdmin]);

  return (
    <div className="space-y-4 mt-4">
      {/* Phase 14 Dispatch 13 — Bug 44 + Bug 152: promo redemption pulled
          for v1.0. Codes are still creatable + visible to admins so v1.1
          can activate them retroactively. */}
      {!flags.promoRedemptionEnabled && (
        <div
          data-testid="promo-not-wired-banner"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
          role="alert"
        >
          <p className="font-semibold text-sm">Promo redemption is on a launch hold.</p>
          <p className="text-xs mt-1">
            Customers cannot enter or redeem these codes. New rows are staged records only.
            The complete redemption pipeline remains disabled. At launch, each code must still be
            active, within its validity window, under its limits, and included in the reviewed promo cutover.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="promo-filter" className="text-xs">
            Filter
          </Label>
          <select
            id="promo-filter"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value as 'all' | 'active' | 'inactive');
              setPage(1);
            }}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} /> Create New Promo
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={promosQuery.data?.rows ?? []}
        keyExtractor={(r) => r.id}
        isLoading={promosQuery.isLoading}
        isError={promosQuery.isError}
        errorMessage={getErrorMessage(promosQuery.error)}
        emptyMessage="No promo codes found."
      />

      {(promosQuery.data?.total ?? 0) > adminConfig.defaultPageSize && (
        <Pagination
          page={page}
          pageSize={adminConfig.defaultPageSize}
          total={promosQuery.data?.total ?? 0}
          totalPages={Math.ceil((promosQuery.data?.total ?? 0) / adminConfig.defaultPageSize)}
          onPageChange={setPage}
        />
      )}

      {showCreate && (
        <CreatePromoDialog
          redemptionEnabled={flags.promoRedemptionEnabled}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            invalidate();
            setShowCreate(false);
          }}
        />
      )}
      {editPromo && (
        <EditPromoDialog
          promo={editPromo}
          onClose={() => setEditPromo(null)}
          onUpdated={() => {
            invalidate();
            setEditPromo(null);
          }}
        />
      )}
      {deactivatePromo && (
        <Dialog open onOpenChange={(o) => !o && setDeactivatePromoState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate {deactivatePromo.code}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              {flags.promoRedemptionEnabled
                ? 'This will immediately stop accepting the code. Existing redemptions are not affected.'
                : 'This staged code is already unavailable under the launch hold. Deactivation also keeps it out of a future cutover review.'}
            </p>
            {deactivateMutation.isError && (
              <p className="text-sm text-red-600">
                {getErrorMessage(deactivateMutation.error)}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeactivatePromoState(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(deactivatePromo.id)}
              >
                Deactivate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface CreatePromoForm {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountPesos: string;
  minimumOrderPesos: string;
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
  validUntil: string;
}

function CreatePromoDialog({
  redemptionEnabled,
  onClose,
  onCreated,
}: {
  redemptionEnabled: boolean;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<CreatePromoForm>({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: '',
    maxDiscountPesos: '',
    minimumOrderPesos: '',
    usageLimitTotal: '',
    usageLimitPerCustomer: '1',
    validUntil: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: CreatePromoForm) => {
      const body: Record<string, unknown> = {
        code: input.code.trim().toUpperCase(),
        description: input.description.trim() || undefined,
        discountType: input.discountType,
        discountValue: input.discountType === 'percentage'
          ? Number(input.discountValue)
          : Math.round(Number(input.discountValue) * 100),
      };
      if (input.maxDiscountPesos) {
        body.maxDiscountCentavos = Math.round(Number(input.maxDiscountPesos) * 100);
      }
      if (input.minimumOrderPesos) {
        body.minimumOrderCentavos = Math.round(Number(input.minimumOrderPesos) * 100);
      }
      if (input.usageLimitTotal) {
        body.usageLimitTotal = Number(input.usageLimitTotal);
      }
      body.usageLimitPerCustomer = Number(input.usageLimitPerCustomer);
      if (input.validUntil) {
        // BUG-PHASE115-01 fix — pre-fix used UTC midnight ("...Z").
        // For a Manila admin entering "Valid until 2026-05-31", the
        // suffix made the promo expire at 2026-05-31T23:59:59 UTC =
        // 2026-06-01T07:59:59+08:00 Manila — effectively giving the
        // promo 8 extra hours of validity into the morning of the
        // following Manila day. Customers booking before 8 AM on
        // June 1 could still apply a "May only" promo. Anchoring to
        // +08:00 makes "valid until day X" mean what the admin
        // typed: midnight-end-of-day Manila. Same Manila-tz pattern
        // as Phase 105 (calendar) and Phase 113 (recurring cron).
        body.validUntil = `${input.validUntil}T23:59:59+08:00`;
      }
      const res = await api.post<{ success: boolean; data: PromoCode }>(
        '/api/v1/admin/marketing/promos',
        body,
      );
      return res.data.data;
    },
    onSuccess: onCreated,
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create promo code</DialogTitle>
        </DialogHeader>
        {!redemptionEnabled && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This creates a staged record only. Customers cannot redeem it until the complete promo flow is launched and this code passes cutover review.
          </div>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate(form);
          }}
        >
          <div>
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="WELCOME10"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="discount-type">Discount type</Label>
              <Select
                value={form.discountType}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, discountType: v as DiscountType }))
                }
              >
                <SelectTrigger id="discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed_centavos">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="discount-value">
                {form.discountType === 'percentage' ? 'Percent (1–50)' : 'Fixed discount (PHP)'}
              </Label>
              <Input
                id="discount-value"
                type="number"
                min={form.discountType === 'percentage' ? 1 : 1}
                max={form.discountType === 'percentage' ? 50 : undefined}
                step={form.discountType === 'percentage' ? 1 : 0.01}
                value={form.discountValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountValue: e.target.value }))
                }
                required
              />
            </div>
          </div>
          {form.discountType === 'percentage' && (
            <div>
              <Label htmlFor="max-discount">Maximum discount (PHP)</Label>
              <Input
                id="max-discount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.maxDiscountPesos}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscountPesos: e.target.value }))}
                placeholder="Optional cap"
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="min-order">Minimum order (PHP)</Label>
              <Input
                id="min-order"
                type="number"
                min="0"
                step="0.01"
                value={form.minimumOrderPesos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimumOrderPesos: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="usage-limit">Usage limit (total)</Label>
              <Input
                id="usage-limit"
                type="number"
                value={form.usageLimitTotal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, usageLimitTotal: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="usage-limit-customer">Usage limit per customer</Label>
            <Input
              id="usage-limit-customer"
              type="number"
              min="1"
              step="1"
              value={form.usageLimitPerCustomer}
              onChange={(e) => setForm((f) => ({ ...f, usageLimitPerCustomer: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="valid-until">Valid until</Label>
            <Input
              id="valid-until"
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditPromoForm {
  description: string;
  minimumOrderPesos: string;
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
  validUntil: string;
}

function EditPromoDialog({
  promo,
  onClose,
  onUpdated,
}: {
  promo: PromoCode;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<EditPromoForm>({
    description: promo.description ?? '',
    minimumOrderPesos: String(promo.minimumOrderCentavos / 100),
    usageLimitTotal: promo.usageLimitTotal !== null ? String(promo.usageLimitTotal) : '',
    usageLimitPerCustomer: String(promo.usageLimitPerCustomer),
    validUntil: promo.validUntil ? promo.validUntil.slice(0, 10) : '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        description: form.description,
        minimumOrderCentavos: Math.round(Number(form.minimumOrderPesos || 0) * 100),
        usageLimitPerCustomer: Number(form.usageLimitPerCustomer),
      };
      body.usageLimitTotal = form.usageLimitTotal ? Number(form.usageLimitTotal) : null;
      // BUG-PHASE115-01 fix — same Manila-anchor as the create dialog.
      body.validUntil = form.validUntil ? `${form.validUntil}T23:59:59+08:00` : null;
      const res = await api.patch<{ success: boolean; data: PromoCode }>(
        `/api/v1/admin/marketing/promos/${promo.id}`,
        body,
      );
      return res.data.data;
    },
    onSuccess: onUpdated,
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {promo.code}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-min-order">Minimum order (PHP)</Label>
              <Input
                id="edit-min-order"
                type="number"
                min="0"
                step="0.01"
                value={form.minimumOrderPesos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimumOrderPesos: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-usage-limit">Usage limit (total)</Label>
              <Input
                id="edit-usage-limit"
                type="number"
                value={form.usageLimitTotal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, usageLimitTotal: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-usage-limit-customer">Usage limit per customer</Label>
            <Input
              id="edit-usage-limit-customer"
              type="number"
              min="1"
              step="1"
              value={form.usageLimitPerCustomer}
              onChange={(e) => setForm((f) => ({ ...f, usageLimitPerCustomer: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-valid-until">Valid until</Label>
            <Input
              id="edit-valid-until"
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaigns tab ────────────────────────────────────────────────────────

interface CampaignListResponse {
  success: boolean;
  data: { rows: MarketingCampaign[]; total: number };
}

function CampaignsTab({ isSuperAdmin }: { isSuperAdmin: boolean }): React.ReactElement {
  const queryClient = useQueryClient();
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState<MarketingCampaign | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['admin-marketing-channels'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: string[] }>('/api/v1/admin/marketing/channels');
      return res.data.data;
    },
  });
  const activeChannels = channelsQuery.data ?? [];
  const activeChannelOptions = toChannelOptions(activeChannels);

  const recordedChannelsQuery = useQuery({
    queryKey: ['admin-marketing-recorded-channels'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: string[] }>('/api/v1/admin/marketing/campaigns/channels');
      return res.data.data;
    },
  });
  const activeChannelSet = new Set(activeChannels);
  const filterChannelOptions = toChannelOptions([
    ...new Set([...activeChannels, ...(recordedChannelsQuery.data ?? [])]),
  ]).map((option) => ({
    ...option,
    label: activeChannelSet.has(option.value) ? option.label : `${option.label} (retired)`,
  }));

  const campaignsQuery = useQuery({
    queryKey: ['admin-marketing-campaigns', channelFilter, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: adminConfig.defaultPageSize,
        offset: (page - 1) * adminConfig.defaultPageSize,
      };
      if (channelFilter) params.channel = channelFilter;
      const res = await api.get<CampaignListResponse>(
        '/api/v1/admin/marketing/campaigns',
        { params },
      );
      return res.data.data;
    },
  });

  const invalidate = (): void => {
    queryClient.invalidateQueries({ queryKey: ['admin-marketing-campaigns'] });
  };

  const columns: Column<MarketingCampaign>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div>
          <span className="font-medium text-[var(--color-text)]">{r.name}</span>
          {r.notes && (
            <p className="text-xs text-[var(--color-text-secondary)]">{r.notes}</p>
          )}
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (r) => <Badge label={channelLabel(r.channel)} variant="info" />,
    },
    {
      key: 'period',
      header: 'Period',
      render: (r) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {fmtDate(r.startedAt)} → {fmtDate(r.endedAt)}
        </span>
      ),
    },
    {
      key: 'spend',
      header: 'Recorded spend',
      render: (r) => <span>{formatCurrency(r.spendCentavos)}</span>,
    },
    {
      key: 'signups',
      header: 'Reported signups',
      render: (r) => <span>{r.attributedSignups}</span>,
    },
    {
      key: 'firstBookings',
      header: 'Reported first bookings',
      render: (r) => <span>{r.attributedFirstBookings}</span>,
    },
    {
      key: 'cpa',
      header: 'CPA',
      render: (r) =>
        r.cpaCentavos > 0 ? <span>{formatCurrency(r.cpaCentavos)}</span> : <span>—</span>,
    },
    {
      key: 'revenue',
      header: 'Reported revenue',
      render: (r) => <span>{formatCurrency(r.attributedRevenueCentavos)}</span>,
    },
    {
      key: 'roi',
      header: 'ROI',
      render: (r) => (
        <Badge
          label={`${r.roiPercent}%`}
          variant={r.roiPercent > 0 ? 'success' : r.roiPercent < 0 ? 'danger' : 'default'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        isSuperAdmin ? (
          <Button size="sm" variant="outline" onClick={() => setEditCampaign(r)}>
            <Pencil size={12} /> Edit
          </Button>
        ) : null,
    },
  ], [isSuperAdmin]);

  return (
    <div className="space-y-4 mt-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm font-semibold text-sky-950">Tracking records only</p>
        <p className="mt-1 text-sm text-sky-800">
          A campaign row records staff-reported spend and attribution. It does not send SMS, email, push notifications, or select an audience. Any future sender must enforce recorded marketing consent by channel.
        </p>
      </div>
      {channelsQuery.isError && (
        <ErrorState
          title="Configured marketing channels could not be loaded"
          description="Campaigns remain visible, but creating a record is disabled to avoid saving a channel the server will reject."
          action={<Button type="button" variant="outline" onClick={() => void channelsQuery.refetch()}>Try again</Button>}
        />
      )}
      {recordedChannelsQuery.isError && (
        <ErrorState
          title="Historical channel filters could not be loaded"
          description="Campaign records remain visible. Retry to restore filters for channels that are no longer approved for new records."
          action={<Button type="button" variant="outline" onClick={() => void recordedChannelsQuery.refetch()}>Try again</Button>}
        />
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="channel-filter" className="text-xs">
              Channel
            </Label>
            <select
              id="channel-filter"
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All</option>
              {filterChannelOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="max-w-xl text-xs text-[var(--color-text-secondary)]">
            Retired channels remain available for historical filtering but cannot be selected for new campaign records.
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            onClick={() => setShowCreate(true)}
            size="sm"
            disabled={channelsQuery.isLoading || channelsQuery.isError || activeChannelOptions.length === 0}
          >
            <Plus size={14} /> Create Campaign
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={campaignsQuery.data?.rows ?? []}
        keyExtractor={(r) => r.id}
        isLoading={campaignsQuery.isLoading}
        isError={campaignsQuery.isError}
        errorMessage={getErrorMessage(campaignsQuery.error)}
        emptyMessage="No campaigns found."
      />

      {(campaignsQuery.data?.total ?? 0) > adminConfig.defaultPageSize && (
        <Pagination
          page={page}
          pageSize={adminConfig.defaultPageSize}
          total={campaignsQuery.data?.total ?? 0}
          totalPages={Math.ceil((campaignsQuery.data?.total ?? 0) / adminConfig.defaultPageSize)}
          onPageChange={setPage}
        />
      )}

      {showCreate && (
        <CreateCampaignDialog
          channelOptions={activeChannelOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            invalidate();
            setShowCreate(false);
          }}
        />
      )}
      {editCampaign && (
        <EditCampaignDialog
          campaign={editCampaign}
          onClose={() => setEditCampaign(null)}
          onUpdated={() => {
            invalidate();
            setEditCampaign(null);
          }}
        />
      )}
    </div>
  );
}

interface CreateCampaignForm {
  name: string;
  channel: string;
  startedAt: string;
  endedAt: string;
  spendPesos: string;
  notes: string;
}

function CreateCampaignDialog({
  channelOptions,
  onClose,
  onCreated,
}: {
  channelOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<CreateCampaignForm>({
    name: '',
    channel: channelOptions[0]?.value ?? '',
    startedAt: '',
    endedAt: '',
    spendPesos: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        channel: form.channel,
        startedAt: form.startedAt,
      };
      if (form.endedAt) body.endedAt = form.endedAt;
      if (form.spendPesos) body.spendCentavos = Math.round(Number(form.spendPesos) * 100);
      if (form.notes.trim()) body.notes = form.notes.trim();
      const res = await api.post<{ success: boolean; data: MarketingCampaign }>(
        '/api/v1/admin/marketing/campaigns',
        body,
      );
      return res.data.data;
    },
    onSuccess: onCreated,
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="c-channel">Channel</Label>
            <Select
              value={form.channel}
              onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}
            >
              <SelectTrigger id="c-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-start">Started at</Label>
              <Input
                id="c-start"
                type="date"
                value={form.startedAt}
                onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="c-end">Ended at</Label>
              <Input
                id="c-end"
                type="date"
                value={form.endedAt}
                onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-spend">Recorded spend (PHP)</Label>
            <Input
              id="c-spend"
              type="number"
              min="0"
              step="0.01"
              value={form.spendPesos}
              onChange={(e) => setForm((f) => ({ ...f, spendPesos: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea
              id="c-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditCampaignForm {
  name: string;
  endedAt: string;
  spendPesos: string;
  notes: string;
}

function EditCampaignDialog({
  campaign,
  onClose,
  onUpdated,
}: {
  campaign: MarketingCampaign;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<EditCampaignForm>({
    name: campaign.name,
    endedAt: campaign.endedAt ? campaign.endedAt.slice(0, 10) : '',
    spendPesos: String(campaign.spendCentavos / 100),
    notes: campaign.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        spendCentavos: Math.round(Number(form.spendPesos || 0) * 100),
        notes: form.notes,
      };
      body.endedAt = form.endedAt || null;
      const res = await api.patch<{ success: boolean; data: MarketingCampaign }>(
        `/api/v1/admin/marketing/campaigns/${campaign.id}`,
        body,
      );
      return res.data.data;
    },
    onSuccess: onUpdated,
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {campaign.name}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Reported signups, first bookings, and revenue cannot be overwritten here. Those values require an evidence-backed adjustment trail before staff editing can be enabled safely.
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="e-name">Name</Label>
            <Input
              id="e-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-end">Ended at</Label>
              <Input
                id="e-end"
                type="date"
                value={form.endedAt}
                onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="e-spend">Recorded spend (PHP)</Label>
              <Input
                id="e-spend"
                type="number"
                min="0"
                step="0.01"
                value={form.spendPesos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, spendPesos: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="e-notes">Notes</Label>
            <Textarea
              id="e-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
