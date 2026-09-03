import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  KpiCard,
  Label,
  LoadingState,
  Pagination,
  Textarea,
} from '@/components/ui';

const SCHEDULE_CONFIRMATION = 'SCHEDULE COMMISSION CHANGE';
const CANCELLATION_CONFIRMATION = 'CANCEL COMMISSION CHANGE';
const PAGE_SIZE = 25;

type ScopeType = 'tier' | 'provider';
type Tier = 'founding' | 'new' | 'verified' | 'pro' | 'elite';
type LifecycleStatus = 'cancelled' | 'scheduled' | 'active' | 'superseded';

const TIERS: Tier[] = ['founding', 'new', 'verified', 'pro', 'elite'];

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ProviderOption {
  id: string;
  businessName: string;
  fullName: string;
  tier: Tier;
  status: string;
}

interface ProviderSearchResponse {
  success: boolean;
  data: ProviderOption[];
  pagination: { total: number };
}

interface CatalogSubcategory {
  id: string;
  categoryId: string;
  name: string;
}

interface CatalogCategory {
  id: string;
  name: string;
  subcategories: CatalogSubcategory[];
}

interface CommissionRateVersion {
  id: string;
  scopeType: ScopeType;
  tier: Tier | null;
  providerId: string | null;
  providerName: string | null;
  providerTier: Tier | null;
  serviceCategoryId: string | null;
  categoryName: string | null;
  serviceSubcategoryId: string | null;
  subcategoryName: string | null;
  rateBasisPoints: number;
  ratePercent: number;
  effectiveFrom: string;
  reason: string;
  source: string;
  createdByName: string | null;
  approvedByName: string | null;
  createdAt: string;
  cancellation: null | {
    reason: string;
    cancelledByName: string | null;
    cancelledAt: string;
  };
  snapshotUsageCount: number;
  lifecycleStatus: LifecycleStatus;
}

interface RateList {
  items: CommissionRateVersion[];
  total: number;
}

interface CommissionControlsPanelProps {
  selectedRateId?: string;
  selectionError?: string;
  onClearExact?: () => void;
}

interface ScheduleImpact {
  eligibleProviderCount: number;
  approvedProviderCount: number;
  currentlyAssignedPendingBookingCount: number;
  existingSnapshotCount: number;
  currentExactScopeRateBasisPoints: number | null;
  existingSnapshotsWillChange: false;
}

interface PreviewResult {
  schedule: {
    scopeType: ScopeType;
    tier: Tier | null;
    providerId: string | null;
    serviceCategoryId: string | null;
    serviceSubcategoryId: string | null;
    rateBasisPoints: number;
    effectiveFrom: string;
    reason: string;
  };
  impact: ScheduleImpact;
}

interface DraftSchedule {
  scopeType: ScopeType;
  tier: Tier;
  providerSearch: string;
  provider: ProviderOption | null;
  serviceCategoryId: string;
  serviceSubcategoryId: string;
  ratePercent: string;
  effectiveLocal: string;
  reason: string;
  confirmation: string;
}

function manilaInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function initialEffectiveLocal(): string {
  return manilaInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function manilaLocalToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

function formatManila(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid time';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatPercent(basisPoints: number | null): string {
  return basisPoints === null ? 'No exact predecessor' : `${(basisPoints / 100).toFixed(2)}%`;
}

function scopeLabel(rate: CommissionRateVersion): React.ReactNode {
  if (rate.scopeType === 'provider' && rate.providerId) {
    return (
      <Link className="font-medium text-[var(--color-primary)] hover:underline" to={`/providers/${rate.providerId}`}>
        {rate.providerName ?? 'Provider agreement'}
      </Link>
    );
  }
  return <span className="font-medium capitalize">{rate.tier} tier</span>;
}

function statusVariant(status: LifecycleStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'scheduled') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'default';
}

function newDraft(): DraftSchedule {
  return {
    scopeType: 'tier',
    tier: 'new',
    providerSearch: '',
    provider: null,
    serviceCategoryId: '',
    serviceSubcategoryId: '',
    ratePercent: '',
    effectiveLocal: initialEffectiveLocal(),
    reason: '',
    confirmation: '',
  };
}

export function CommissionControlsPanel({
  selectedRateId = '',
  selectionError = '',
  onClearExact = () => undefined,
}: CommissionControlsPanelProps = {}): React.ReactElement {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<DraftSchedule>(newDraft);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CommissionRateVersion | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmation, setCancelConfirmation] = useState('');

  const ratesQ = useQuery({
    queryKey: ['commission-controls', page],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<RateList>>('/api/v1/admin/financials/commission-controls', {
        params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      });
      return response.data.data;
    },
  });

  const exactRateQ = useQuery({
    queryKey: ['commission-controls', 'exact', selectedRateId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<CommissionRateVersion>>(
        `/api/v1/admin/financials/commission-controls/${selectedRateId}`,
      );
      const rate = response.data.data;
      if (!rate || rate.id !== selectedRateId) {
        throw new Error('The server returned a different commission agreement. No substitute record was shown.');
      }
      return rate;
    },
    enabled: Boolean(selectedRateId) && !selectionError,
    retry: false,
  });

  const catalogQ = useQuery({
    queryKey: ['adminCatalog'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<CatalogCategory[]>>('/api/v1/catalog/admin/full');
      return response.data.data;
    },
  });

  const providerQ = useQuery({
    queryKey: ['commission-provider-search', draft.providerSearch],
    queryFn: async () => {
      const response = await api.get<ProviderSearchResponse>('/api/v1/admin/providers', {
        params: { page: 1, pageSize: 10, search: draft.providerSearch.trim() },
      });
      return response.data.data;
    },
    enabled: draft.scopeType === 'provider'
      && draft.provider === null
      && draft.providerSearch.trim().length >= 2,
  });

  const selectedCategory = useMemo(
    () => catalogQ.data?.find((category) => category.id === draft.serviceCategoryId) ?? null,
    [catalogQ.data, draft.serviceCategoryId],
  );

  const rateNumber = Number(draft.ratePercent);
  const rateBasisPoints = Number.isFinite(rateNumber) ? Math.round(rateNumber * 100) : NaN;
  const canPreview = draft.ratePercent.trim() !== ''
    && Number.isInteger(rateBasisPoints)
    && rateBasisPoints >= 0
    && rateBasisPoints <= 5000
    && draft.effectiveLocal.length > 0
    && draft.reason.trim().length >= 20
    && (draft.scopeType === 'tier' || draft.provider !== null);

  const setField = <K extends keyof DraftSchedule>(key: K, value: DraftSchedule[K]): void => {
    setDraft((current) => ({ ...current, [key]: value, confirmation: '' }));
    setPreview(null);
  };

  const openCancellation = (rate: CommissionRateVersion): void => {
    setCancelReason('');
    setCancelConfirmation('');
    setCancelTarget(rate);
  };

  const closeCancellation = (): void => {
    setCancelTarget(null);
    setCancelReason('');
    setCancelConfirmation('');
  };

  const requestPayload = (includeConfirmation: boolean): Record<string, unknown> => ({
    scopeType: draft.scopeType,
    tier: draft.scopeType === 'tier' ? draft.tier : undefined,
    providerId: draft.scopeType === 'provider' ? draft.provider?.id : undefined,
    serviceCategoryId: draft.serviceCategoryId || undefined,
    serviceSubcategoryId: draft.serviceSubcategoryId || undefined,
    rateBasisPoints,
    effectiveFrom: manilaLocalToIso(draft.effectiveLocal),
    reason: draft.reason.trim(),
    confirmation: includeConfirmation ? draft.confirmation : undefined,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiEnvelope<PreviewResult>>(
        '/api/v1/admin/financials/commission-controls/preview',
        requestPayload(false),
      );
      return response.data.data;
    },
    onSuccess: setPreview,
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => api.post(
      '/api/v1/admin/financials/commission-controls',
      requestPayload(true),
    ),
    onSuccess: () => {
      toast.success('Commission schedule recorded. Existing booking terms were not changed.');
      setDraft(newDraft());
      setPreview(null);
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: ['commission-controls'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!cancelTarget) return;
      return api.post(`/api/v1/admin/financials/commission-controls/${cancelTarget.id}/cancel`, {
        reason: cancelReason.trim(),
        confirmation: cancelConfirmation,
      });
    },
    onSuccess: () => {
      toast.success('Future commission schedule cancelled.');
      setCancelTarget(null);
      setCancelReason('');
      setCancelConfirmation('');
      void queryClient.invalidateQueries({ queryKey: ['commission-controls'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const totalPages = Math.ceil((ratesQ.data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
        <h2 className="font-semibold">Prospective agreements only</h2>
        <p className="mt-1">
          A new rate applies only when a future booking fixes its financial terms. Paid bookings keep
          their original commission, customer charge, provider earnings, and cancellation policy.
          Effective versions are evidence and cannot be edited or deleted.
        </p>
      </div>

      {selectionError ? (
        <ErrorState
          title="Selected commission agreement could not be loaded"
          description={selectionError}
          action={<Button type="button" variant="outline" onClick={onClearExact}>Clear selection</Button>}
        />
      ) : selectedRateId && exactRateQ.isLoading ? (
        <LoadingState label="Loading selected commission agreement…" />
      ) : selectedRateId && exactRateQ.isError ? (
        <ErrorState
          title="Selected commission agreement could not be loaded"
          description={`${getErrorMessage(exactRateQ.error)} No other agreement was substituted.`}
          action={<Button type="button" variant="outline" onClick={onClearExact}>Clear selection</Button>}
        />
      ) : exactRateQ.data ? (
        <section
          className="rounded-xl border border-blue-200 bg-blue-50/40 p-5"
          aria-labelledby="selected-commission-evidence-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Audit-linked record</p>
              <h2 id="selected-commission-evidence-title" className="mt-1 text-base font-semibold text-[var(--color-text)]">
                Selected commission agreement evidence
              </h2>
              <p className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">
                {exactRateQ.data.id}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                label={exactRateQ.data.lifecycleStatus.toUpperCase()}
                variant={statusVariant(exactRateQ.data.lifecycleStatus)}
              />
              <Button type="button" size="sm" variant="outline" onClick={onClearExact}>Clear selection</Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Agreement scope</p>
              <div className="mt-1 text-sm text-[var(--color-text)]">{scopeLabel(exactRateQ.data)}</div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Service scope</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">
                {exactRateQ.data.subcategoryName ?? exactRateQ.data.categoryName ?? 'All services'}
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Commission rate</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {exactRateQ.data.ratePercent.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Booking snapshots</p>
              <p className="mt-1 text-sm tabular-nums text-[var(--color-text)]">{exactRateQ.data.snapshotUsageCount}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3 sm:col-span-2">
              <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Effective from</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{formatManila(exactRateQ.data.effectiveFrom)}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3 sm:col-span-2">
              <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Recorded</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{formatManila(exactRateQ.data.createdAt)}</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Owner: {exactRateQ.data.createdByName ?? (exactRateQ.data.source === 'migration_seed' ? 'Migration seed' : 'Unknown actor')}
                {exactRateQ.data.approvedByName ? ` · Approver: ${exactRateQ.data.approvedByName}` : ''}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3 text-sm text-[var(--color-text)]">
            <p className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">Recorded business reason</p>
            <p className="mt-1 whitespace-pre-wrap">{exactRateQ.data.reason}</p>
          </div>

          {exactRateQ.data.cancellation && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">Future version cancelled</p>
              <p className="mt-1">{exactRateQ.data.cancellation.reason}</p>
              <p className="mt-1 text-xs">
                {formatManila(exactRateQ.data.cancellation.cancelledAt)} by{' '}
                {exactRateQ.data.cancellation.cancelledByName ?? 'Unknown actor'}
              </p>
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
            This is the retained append-only agreement record and its current cancellation state. The Audit Log
            remains the event-time evidence. Existing booking financial snapshots are immutable and are never
            recalculated from this screen.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="commission-schedule-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="commission-schedule-title" className="text-base font-semibold text-[var(--color-text)]">Schedule a commission agreement</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Preview exposure first. Only a super admin can commit the schedule.</p>
          </div>
          {!isSuperAdmin && <Badge label="READ & PREVIEW ONLY" variant="warning" />}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="commission-scope">Agreement scope</Label>
            <select
              id="commission-scope"
              value={draft.scopeType}
              onChange={(event) => {
                const scopeType = event.target.value as ScopeType;
                setDraft((current) => ({
                  ...current,
                  scopeType,
                  provider: null,
                  providerSearch: '',
                  confirmation: '',
                }));
                setPreview(null);
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="tier">Provider tier</option>
              <option value="provider">Specific provider contract</option>
            </select>
          </div>

          {draft.scopeType === 'tier' ? (
            <div>
              <Label htmlFor="commission-tier">Provider tier</Label>
              <select
                id="commission-tier"
                value={draft.tier}
                onChange={(event) => setField('tier', event.target.value as Tier)}
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm capitalize"
              >
                {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </div>
          ) : (
            <div className="md:col-span-1 xl:col-span-2">
              <Label htmlFor="commission-provider-search">Provider</Label>
              {draft.provider ? (
                <div className="mt-1 flex min-h-11 items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                  <span className="text-sm"><strong>{draft.provider.fullName || draft.provider.businessName}</strong> · {draft.provider.tier}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setField('provider', null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input
                    id="commission-provider-search"
                    value={draft.providerSearch}
                    onChange={(event) => setField('providerSearch', event.target.value)}
                    placeholder="Search provider name, business, email, or phone"
                    className="mt-1"
                  />
                  {providerQ.isFetching && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Searching providers…</p>}
                  {providerQ.data && providerQ.data.length > 0 && (
                    <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-[var(--color-border)] bg-white shadow-sm">
                      {providerQ.data.map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => {
                            setDraft((current) => ({
                              ...current,
                              provider,
                              providerSearch: '',
                              confirmation: '',
                            }));
                            setPreview(null);
                          }}
                        >
                          <span>{provider.fullName || provider.businessName}</span>
                          <span className="text-xs capitalize text-[var(--color-text-secondary)]">{provider.tier} · {provider.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="commission-category">Service category (optional)</Label>
            <select
              id="commission-category"
              value={draft.serviceCategoryId}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  serviceCategoryId: event.target.value,
                  serviceSubcategoryId: '',
                  confirmation: '',
                }));
                setPreview(null);
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All service categories</option>
              {catalogQ.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>

          <div>
            <Label htmlFor="commission-subcategory">Service (optional)</Label>
            <select
              id="commission-subcategory"
              value={draft.serviceSubcategoryId}
              onChange={(event) => setField('serviceSubcategoryId', event.target.value)}
              disabled={!selectedCategory}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
            >
              <option value="">All services in category</option>
              {selectedCategory?.subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="commission-rate">Commission rate (%)</Label>
            <Input
              id="commission-rate"
              type="number"
              min={0}
              max={50}
              step="0.01"
              inputMode="decimal"
              value={draft.ratePercent}
              onChange={(event) => setField('ratePercent', event.target.value)}
              placeholder="e.g. 12.50"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Allowed range: 0.00% to 50.00%.</p>
          </div>

          <div>
            <Label htmlFor="commission-effective">Effective date and time (Philippines)</Label>
            <Input
              id="commission-effective"
              type="datetime-local"
              value={draft.effectiveLocal}
              onChange={(event) => setField('effectiveLocal', event.target.value)}
              className="mt-1"
            />
            {draft.effectiveLocal && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{formatManila(manilaLocalToIso(draft.effectiveLocal))}</p>}
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <Label htmlFor="commission-reason">Business reason (20–1000 characters)</Label>
            <Textarea
              id="commission-reason"
              value={draft.reason}
              onChange={(event) => setField('reason', event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Explain the commercial agreement, owner, approval basis, and expected outcome."
              className="mt-1"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{draft.reason.trim().length} / 1000</p>
          </div>
        </div>

        {catalogQ.isError && (
          <p role="alert" className="mt-3 text-sm text-red-700">Service catalog could not load. Global tier/provider previews still work. {getErrorMessage(catalogQ.error)}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!canPreview || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? 'Calculating impact…' : 'Preview impact'}
          </Button>
          {!canPreview && <span className="text-xs text-[var(--color-text-secondary)]">Complete scope, rate, Philippines time, and a 20-character reason.</span>}
        </div>

        {preview && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4" aria-live="polite">
            <h3 className="font-semibold text-emerald-950">Impact preview</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard title="Eligible Providers" value={String(preview.impact.eligibleProviderCount)} icon={null} />
              <KpiCard title="Approved Providers" value={String(preview.impact.approvedProviderCount)} icon={null} />
              <KpiCard title="Assigned / Unpaid Work" value={String(preview.impact.currentlyAssignedPendingBookingCount)} icon={null} />
              <KpiCard title="Locked Snapshots" value={String(preview.impact.existingSnapshotCount)} icon={null} />
              <KpiCard title="Prior Exact Rate" value={formatPercent(preview.impact.currentExactScopeRateBasisPoints)} icon={null} />
            </div>
            <p className="mt-3 text-sm font-medium text-emerald-950">
              Existing snapshots that will change: 0. The pending-work count is an exposure estimate;
              each booking fixes the applicable agreement only when its own financial terms become final.
            </p>

            {isSuperAdmin && (
              <div className="mt-4 border-t border-emerald-200 pt-4">
                <Label htmlFor="commission-confirmation">Type {SCHEDULE_CONFIRMATION} to schedule</Label>
                <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-center">
                  <Input
                    id="commission-confirmation"
                    value={draft.confirmation}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      confirmation: event.target.value,
                    }))}
                    className="md:max-w-md"
                  />
                  <Button
                    type="button"
                    disabled={draft.confirmation !== SCHEDULE_CONFIRMATION || scheduleMutation.isPending}
                    onClick={() => scheduleMutation.mutate()}
                  >
                    {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule commission change'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="commission-history-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="commission-history-title" className="text-base font-semibold text-[var(--color-text)]">Agreement history</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Active, future, superseded, and cancelled versions stay visible for audit.</p>
          </div>
          {ratesQ.data && <span className="text-xs text-[var(--color-text-secondary)]">{ratesQ.data.total} versions</span>}
        </div>

        {ratesQ.isLoading ? <LoadingState label="Loading commission agreements…" /> : ratesQ.isError ? (
          <ErrorState
            title="Commission agreement history unavailable"
            description={`${getErrorMessage(ratesQ.error)} Do not infer current rates from the legacy System Settings rows.`}
            action={<Button variant="outline" onClick={() => { void ratesQ.refetch(); }}>Retry</Button>}
          />
        ) : !ratesQ.data || ratesQ.data.items.length === 0 ? (
          <EmptyState title="No commission agreements recorded" description="Payments will remain blocked until an effective agreement exists." />
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead><tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Scope</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Service scope</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[var(--color-text-secondary)]">Rate</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Effective</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[var(--color-text-secondary)]">Snapshots</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Reason / owner</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[var(--color-text-secondary)]">Action</th>
                </tr></thead>
                <tbody>{ratesQ.data.items.map((rate) => (
                  <tr key={rate.id} className="border-b border-[var(--color-border)] align-top hover:bg-slate-50">
                    <td className="px-3 py-3">{scopeLabel(rate)}<p className="mt-1 text-xs capitalize text-[var(--color-text-secondary)]">{rate.source.replace(/_/g, ' ')}</p></td>
                    <td className="px-3 py-3">{rate.subcategoryName ?? rate.categoryName ?? 'All services'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{rate.ratePercent.toFixed(2)}%</td>
                    <td className="px-3 py-3 text-xs">{formatManila(rate.effectiveFrom)}</td>
                    <td className="px-3 py-3"><Badge label={rate.lifecycleStatus.toUpperCase()} variant={statusVariant(rate.lifecycleStatus)} /></td>
                    <td className="px-3 py-3 text-right tabular-nums">{rate.snapshotUsageCount}</td>
                    <td className="max-w-[320px] px-3 py-3"><p>{rate.reason}</p><p className="mt-1 text-xs text-[var(--color-text-secondary)]">{rate.createdByName ?? (rate.source === 'migration_seed' ? 'Migration seed' : 'Unknown actor')}</p></td>
                    <td className="px-3 py-3 text-right">
                      {isSuperAdmin && rate.lifecycleStatus === 'scheduled' ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => openCancellation(rate)}>Cancel future version</Button>
                      ) : <span className="text-xs text-[var(--color-text-secondary)]">Append only</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={ratesQ.data.total}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </section>

      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && closeCancellation()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel future commission version</DialogTitle>
            <DialogDescription>
              This is allowed only before {cancelTarget ? formatManila(cancelTarget.effectiveFrom) : 'the effective time'}.
              The scheduled row remains in history with cancellation evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="commission-cancel-reason">Reason (20–1000 characters)</Label>
              <Textarea
                id="commission-cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                rows={4}
                maxLength={1000}
              />
            </div>
            <div>
              <Label htmlFor="commission-cancel-confirm">Type {CANCELLATION_CONFIRMATION}</Label>
              <Input id="commission-cancel-confirm" value={cancelConfirmation} onChange={(event) => setCancelConfirmation(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCancellation} disabled={cancelMutation.isPending}>Keep schedule</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelReason.trim().length < 20 || cancelConfirmation !== CANCELLATION_CONFIRMATION || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel future version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
