/**
 * Phase 09 — Admin Marketing page.
 *
 * Three tabs: Overview, Promo Codes, Campaigns.
 *  - Overview: KPI cards + channel breakdown table with date filter.
 *  - Promo Codes: list + super-admin create/edit/deactivate dialogs.
 *  - Campaigns: list + super-admin create/edit dialogs.
 *
 * Mirrors the structure and conventions of CustomersPage.tsx,
 * BookingDetailPage.tsx, and DisputeDetailPage.tsx.
 */

import React, { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
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

function channelLabel(value: string): string {
  return CHANNEL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function MarketingPage(): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Marketing</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Promo codes and marketing campaign tracking.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="promos">Promo Codes</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
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

// ─── Overview tab ─────────────────────────────────────────────────────────

function OverviewTab(): React.ReactElement {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

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
  };

  return (
    <div className="space-y-6 mt-4">
      <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="from-date">From</Label>
          <Input
            id="from-date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label htmlFor="to-date">To</Label>
          <Input
            id="to-date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-44"
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
            }}
          >
            Reset
          </Button>
        )}
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Total Spend"
          value={formatCurrency(o.totalSpendCentavos)}
          icon={<Coins size={18} />}
        />
        <KpiCard
          title="Attributed Signups"
          value={o.totalSignups.toLocaleString()}
          icon={<Users size={18} />}
        />
        <KpiCard
          title="Attributed Revenue"
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
  const [showCreate, setShowCreate] = useState(false);
  const [editPromo, setEditPromo] = useState<PromoCode | null>(null);
  const [deactivatePromo, setDeactivatePromoState] = useState<PromoCode | null>(null);

  const promosQuery = useQuery({
    queryKey: ['admin-marketing-promos', activeFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
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
      render: (r) => (
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
  ], [isSuperAdmin]);

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
          <p className="font-semibold text-sm">Promo redemption is not wired in v1.0.</p>
          <p className="text-xs mt-1">
            Codes you create here will be honored once Phase 14 v1.1 wires the
            redemption pipeline (target: post-launch). Customers do not see a
            promo input in checkout yet.
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
            onChange={(e) =>
              setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
            }
            className="h-9 rounded-md border border-slate-300 px-3 text-sm bg-white"
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
        emptyMessage="No promo codes found."
      />

      {showCreate && (
        <CreatePromoDialog
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
              This will immediately stop accepting the code. Existing redemptions are
              not affected.
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
  minimumOrderCentavos: string;
  usageLimitTotal: string;
  validUntil: string;
}

function CreatePromoDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<CreatePromoForm>({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: '',
    minimumOrderCentavos: '',
    usageLimitTotal: '',
    validUntil: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: CreatePromoForm) => {
      const body: Record<string, unknown> = {
        code: input.code.trim().toUpperCase(),
        description: input.description.trim() || undefined,
        discountType: input.discountType,
        discountValue: Number(input.discountValue),
      };
      if (input.minimumOrderCentavos) {
        body.minimumOrderCentavos = Number(input.minimumOrderCentavos);
      }
      if (input.usageLimitTotal) {
        body.usageLimitTotal = Number(input.usageLimitTotal);
      }
      if (input.validUntil) {
        body.validUntil = `${input.validUntil}T23:59:59Z`;
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
          <div className="grid grid-cols-2 gap-3">
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
                  <SelectItem value="fixed_centavos">Fixed (centavos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="discount-value">
                {form.discountType === 'percentage' ? 'Percent (1-50)' : 'Centavos (>=100)'}
              </Label>
              <Input
                id="discount-value"
                type="number"
                value={form.discountValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountValue: e.target.value }))
                }
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="min-order">Min order centavos</Label>
              <Input
                id="min-order"
                type="number"
                value={form.minimumOrderCentavos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimumOrderCentavos: e.target.value }))
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
  minimumOrderCentavos: string;
  usageLimitTotal: string;
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
    minimumOrderCentavos: String(promo.minimumOrderCentavos),
    usageLimitTotal: promo.usageLimitTotal !== null ? String(promo.usageLimitTotal) : '',
    validUntil: promo.validUntil ? promo.validUntil.slice(0, 10) : '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        description: form.description,
        minimumOrderCentavos: Number(form.minimumOrderCentavos || 0),
      };
      body.usageLimitTotal = form.usageLimitTotal ? Number(form.usageLimitTotal) : null;
      body.validUntil = form.validUntil ? `${form.validUntil}T23:59:59Z` : null;
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-min-order">Min order centavos</Label>
              <Input
                id="edit-min-order"
                type="number"
                value={form.minimumOrderCentavos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimumOrderCentavos: e.target.value }))
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
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState<MarketingCampaign | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['admin-marketing-campaigns', channelFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
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
      header: 'Spend',
      render: (r) => <span>{formatCurrency(r.spendCentavos)}</span>,
    },
    {
      key: 'signups',
      header: 'Signups',
      render: (r) => <span>{r.attributedSignups}</span>,
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="channel-filter" className="text-xs">
            Channel
          </Label>
          <select
            id="channel-filter"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm bg-white"
          >
            <option value="">All</option>
            {CHANNEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} /> Create Campaign
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={campaignsQuery.data?.rows ?? []}
        keyExtractor={(r) => r.id}
        isLoading={campaignsQuery.isLoading}
        emptyMessage="No campaigns found."
      />

      {showCreate && (
        <CreateCampaignDialog
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
  spendCentavos: string;
  notes: string;
}

function CreateCampaignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<CreateCampaignForm>({
    name: '',
    channel: 'facebook_ads',
    startedAt: '',
    endedAt: '',
    spendCentavos: '',
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
      if (form.spendCentavos) body.spendCentavos = Number(form.spendCentavos);
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
                {CHANNEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="c-spend">Spend (centavos)</Label>
            <Input
              id="c-spend"
              type="number"
              value={form.spendCentavos}
              onChange={(e) => setForm((f) => ({ ...f, spendCentavos: e.target.value }))}
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
  spendCentavos: string;
  attributedSignups: string;
  attributedFirstBookings: string;
  attributedRevenueCentavos: string;
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
    spendCentavos: String(campaign.spendCentavos),
    attributedSignups: String(campaign.attributedSignups),
    attributedFirstBookings: String(campaign.attributedFirstBookings),
    attributedRevenueCentavos: String(campaign.attributedRevenueCentavos),
    notes: campaign.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        spendCentavos: Number(form.spendCentavos || 0),
        attributedSignups: Number(form.attributedSignups || 0),
        attributedFirstBookings: Number(form.attributedFirstBookings || 0),
        attributedRevenueCentavos: Number(form.attributedRevenueCentavos || 0),
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
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="e-spend">Spend (centavos)</Label>
              <Input
                id="e-spend"
                type="number"
                value={form.spendCentavos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, spendCentavos: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="e-signups">Signups</Label>
              <Input
                id="e-signups"
                type="number"
                value={form.attributedSignups}
                onChange={(e) =>
                  setForm((f) => ({ ...f, attributedSignups: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="e-first">First bookings</Label>
              <Input
                id="e-first"
                type="number"
                value={form.attributedFirstBookings}
                onChange={(e) =>
                  setForm((f) => ({ ...f, attributedFirstBookings: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="e-revenue">Revenue (centavos)</Label>
              <Input
                id="e-revenue"
                type="number"
                value={form.attributedRevenueCentavos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, attributedRevenueCentavos: e.target.value }))
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
