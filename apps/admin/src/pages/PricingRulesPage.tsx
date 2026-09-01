import React, { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Pagination,
  Textarea,
} from '@/components/ui';
import { TrendingUp } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type RuleType = 'rush' | 'holiday' | 'peak_hours';
type PublicationStatus = 'draft' | 'published' | 'retired' | 'legacy_active' | 'legacy_inactive';

interface PricingRule {
  id: string;
  name: string;
  type: RuleType;
  multiplier: number;
  rushHoursThreshold: number | null;
  holidayDate: string | null;
  peakStartTime: string | null;
  peakEndTime: string | null;
  peakDaysOfWeek: number[] | null;
  categoryId: string | null;
  serviceAreaId: string | null;
  isActive: boolean;
  publicationStatus: PublicationStatus;
  priority: number;
  platformSurgeShare: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  publishReason: string | null;
  publishedAt: string | null;
  retireReason: string | null;
  retiredAt: string | null;
}

interface Subcategory {
  id: string;
  name: string;
  pricingType: string;
  basePrice: number | null;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  isActive?: boolean;
  subcategories: Subcategory[];
}

interface ServiceArea {
  id: string;
  name: string;
  city: string;
  province: string;
  status: string;
}

interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface DraftForm {
  name: string;
  type: RuleType;
  multiplier: string;
  rushHoursThreshold: string;
  holidayDate: string;
  peakStartTime: string;
  peakEndTime: string;
  peakDaysOfWeek: number[];
  categoryMode: 'global' | 'category';
  categoryId: string;
  areaMode: 'global' | 'service_area';
  serviceAreaId: string;
  priority: string;
  platformSurgeShare: string;
  description: string;
  reason: string;
}

interface PreviewSampleForm {
  subcategoryId: string;
  serviceAreaId: string;
  scheduledAt: string;
}

interface PreviewResult {
  subcategory: { id: string; name: string; categoryId: string; categoryName: string };
  serviceArea: { id: string; name: string; city: string; province: string };
  scheduledAt: string;
  basePrice: number;
  surgeMultiplier: number;
  surgeAmount: number;
  finalPrice: number;
  platformSurgeShare: number;
  providerSurgeShare: number;
  winningRule: { id: string; name: string; type: string; multiplier: number; isDraft: boolean } | null;
  matchingRules: Array<{
    id: string;
    name: string;
    type: string;
    multiplier: number;
    priority: number;
    isDraft: boolean;
  }>;
}

interface PreviewReceipt {
  id: string;
  ruleId: string;
  results: PreviewResult[];
  expiresAt: string;
  createdAt: string;
}

const EMPTY_FORM: DraftForm = {
  name: '',
  type: 'rush',
  multiplier: '1.50',
  rushHoursThreshold: '3',
  holidayDate: '',
  peakStartTime: '18:00',
  peakEndTime: '21:00',
  peakDaysOfWeek: [],
  categoryMode: 'category',
  categoryId: '',
  areaMode: 'service_area',
  serviceAreaId: '',
  priority: '0',
  platformSurgeShare: '0.50',
  description: '',
  reason: '',
};

const TYPE_LABELS: Record<RuleType, string> = {
  rush: 'Rush',
  holiday: 'Holiday',
  peak_hours: 'Peak hours',
};

const STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  retired: 'Retired',
  legacy_active: 'Legacy active',
  legacy_inactive: 'Legacy inactive',
};

const STATUS_VARIANTS: Record<PublicationStatus, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  draft: 'warning',
  published: 'success',
  retired: 'default',
  legacy_active: 'danger',
  legacy_inactive: 'default',
};

function dateTimeLocalValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function defaultPreviewTime(rule: PricingRule): string {
  if (rule.type === 'holiday' && rule.holidayDate) {
    return `${rule.holidayDate}T12:00`;
  }
  const date = new Date();
  if (rule.type === 'rush') {
    date.setMinutes(date.getMinutes() + Math.max(30, Math.floor((rule.rushHoursThreshold ?? 3) * 30)));
  } else {
    date.setDate(date.getDate() + 1);
    const [hour, minute] = (rule.peakStartTime ?? '18:00').split(':').map(Number);
    date.setHours(hour ?? 18, minute ?? 0, 0, 0);
  }
  return dateTimeLocalValue(date);
}

function scheduleLabel(rule: PricingRule): string {
  if (rule.type === 'rush') return `Within ${rule.rushHoursThreshold ?? '?'} hours`;
  if (rule.type === 'holiday') return rule.holidayDate ?? 'Date missing';
  const days = !rule.peakDaysOfWeek?.length
    ? 'all days'
    : rule.peakDaysOfWeek.map((day) => DAY_NAMES[day] ?? String(day)).join(', ');
  return `${rule.peakStartTime ?? '?'}–${rule.peakEndTime ?? '?'} · ${days}`;
}

function lifecycleEvidence(rule: PricingRule): string {
  if (rule.publicationStatus === 'published') {
    return `${rule.publishedAt ? new Date(rule.publishedAt).toLocaleString('en-PH') : 'Publication time unavailable'}${rule.publishReason ? ` · ${rule.publishReason}` : ''}`;
  }
  if (rule.publicationStatus === 'retired') {
    return `${rule.retiredAt ? new Date(rule.retiredAt).toLocaleString('en-PH') : 'Retirement time unavailable'}${rule.retireReason ? ` · ${rule.retireReason}` : ''}`;
  }
  if (rule.publicationStatus.startsWith('legacy_')) {
    return 'Pre-workflow record. Production inventory review required.';
  }
  return `Last draft change ${new Date(rule.updatedAt).toLocaleString('en-PH')}`;
}

function parseBoundedNumber(raw: string, label: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

function ruleToForm(rule: PricingRule): DraftForm {
  return {
    name: rule.name,
    type: rule.type,
    multiplier: String(rule.multiplier),
    rushHoursThreshold: rule.rushHoursThreshold === null ? '' : String(rule.rushHoursThreshold),
    holidayDate: rule.holidayDate ?? '',
    peakStartTime: rule.peakStartTime?.slice(0, 5) ?? '',
    peakEndTime: rule.peakEndTime?.slice(0, 5) ?? '',
    peakDaysOfWeek: rule.peakDaysOfWeek ?? [],
    categoryMode: rule.categoryId ? 'category' : 'global',
    categoryId: rule.categoryId ?? '',
    areaMode: rule.serviceAreaId ? 'service_area' : 'global',
    serviceAreaId: rule.serviceAreaId ?? '',
    priority: String(rule.priority),
    platformSurgeShare: String(rule.platformSurgeShare),
    description: rule.description,
    reason: '',
  };
}

export default function PricingRulesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<PricingRule | 'new' | null>(null);
  const [form, setForm] = useState<DraftForm>({ ...EMPTY_FORM });
  const [actionError, setActionError] = useState('');
  const [previewTarget, setPreviewTarget] = useState<PricingRule | null>(null);
  const [previewSamples, setPreviewSamples] = useState<PreviewSampleForm[]>([]);
  const [previewReceipt, setPreviewReceipt] = useState<PreviewReceipt | null>(null);
  const [publishReason, setPublishReason] = useState('');
  const [retireTarget, setRetireTarget] = useState<PricingRule | null>(null);
  const [retireReason, setRetireReason] = useState('');

  const rulesQuery = useQuery({
    queryKey: ['adminPricingRules', page, typeFilter, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const response = await api.get<PaginatedResult<PricingRule>>('/api/v1/admin/pricing-rules', { params });
      return response.data;
    },
  });

  const catalogQuery = useQuery({
    queryKey: ['adminCatalog', 'pricingRuleScopes'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Category[] }>('/api/v1/catalog/admin/full');
      return response.data.data;
    },
    staleTime: 60_000,
  });

  const areasQuery = useQuery({
    queryKey: ['adminServiceAreas', 'pricingRuleScopes'],
    queryFn: async () => {
      const response = await api.get<PaginatedResult<ServiceArea>>('/api/v1/admin/service-areas', {
        params: { page: 1, pageSize: 100 },
      });
      return response.data.data;
    },
    staleTime: 60_000,
  });

  const categories = catalogQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const areaById = useMemo(() => new Map(areas.map((item) => [item.id, item])), [areas]);
  const fixedSubcategories = useMemo(() => categories.flatMap((category) =>
    category.subcategories
      .filter((subcategory) => subcategory.isActive && subcategory.pricingType === 'fixed' && subcategory.basePrice !== null)
      .map((subcategory) => ({ ...subcategory, categoryId: category.id, categoryName: category.name }))), [categories]);

  const invalidateRules = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['adminPricingRules'] });
  };

  const buildDraftBody = (): Record<string, unknown> => {
    if (!form.name.trim()) throw new Error('Rule name is required.');
    if (form.reason.trim().length < 10) throw new Error('Explain this draft change in at least 10 characters.');
    if (form.categoryMode === 'category' && !form.categoryId) throw new Error('Choose a category or explicitly use all categories.');
    if (form.areaMode === 'service_area' && !form.serviceAreaId) throw new Error('Choose a service area or explicitly use all areas.');
    const multiplier = parseBoundedNumber(form.multiplier, 'Multiplier', 1, 5);
    const platformSurgeShare = parseBoundedNumber(form.platformSurgeShare, 'Platform surge share', 0, 1);
    const priority = parseBoundedNumber(form.priority, 'Priority', 0, 1000);
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      multiplier,
      categoryScope: form.categoryMode === 'global'
        ? { mode: 'global' }
        : { mode: 'category', categoryId: form.categoryId },
      serviceAreaScope: form.areaMode === 'global'
        ? { mode: 'global' }
        : { mode: 'service_area', serviceAreaId: form.serviceAreaId },
      priority,
      platformSurgeShare,
      description: form.description.trim(),
      reason: form.reason.trim(),
    };
    if (form.type === 'rush') {
      body.rushHoursThreshold = parseBoundedNumber(form.rushHoursThreshold, 'Rush threshold', 1, 24);
    } else if (form.type === 'holiday') {
      if (!form.holidayDate) throw new Error('Choose the holiday date.');
      body.holidayDate = form.holidayDate;
    } else {
      if (!form.peakStartTime || !form.peakEndTime) throw new Error('Choose peak start and end times.');
      body.peakStartTime = form.peakStartTime;
      body.peakEndTime = form.peakEndTime;
      body.peakDaysOfWeek = form.peakDaysOfWeek;
    }
    return body;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildDraftBody();
      if (editing === 'new') {
        await api.post('/api/v1/admin/pricing-rules', { ...body, type: form.type });
      } else if (editing) {
        await api.patch(`/api/v1/admin/pricing-rules/${editing.id}`, {
          ...body,
          expectedUpdatedAt: editing.updatedAt,
        });
      }
    },
    onSuccess: () => {
      invalidateRules();
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setActionError('');
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!previewTarget) throw new Error('Choose a draft to preview.');
      if (previewSamples.length === 0) throw new Error('Add at least one representative sample.');
      const samples = previewSamples.map((sample) => {
        if (!sample.subcategoryId || !sample.serviceAreaId || !sample.scheduledAt) {
          throw new Error('Every preview sample needs a service, area, and scheduled time.');
        }
        return {
          subcategoryId: sample.subcategoryId,
          serviceAreaId: sample.serviceAreaId,
          scheduledAt: new Date(sample.scheduledAt).toISOString(),
        };
      });
      const response = await api.post<{ success: boolean; data: PreviewReceipt }>(
        `/api/v1/admin/pricing-rules/${previewTarget.id}/preview`,
        { samples },
      );
      return response.data.data;
    },
    onSuccess: (receipt) => {
      setPreviewReceipt(receipt);
      setActionError('');
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!previewTarget || !previewReceipt) throw new Error('Run a current preview before publishing.');
      if (publishReason.trim().length < 10) throw new Error('Explain the publication decision in at least 10 characters.');
      await api.post(`/api/v1/admin/pricing-rules/${previewTarget.id}/publish`, {
        previewId: previewReceipt.id,
        reason: publishReason.trim(),
      });
    },
    onSuccess: () => {
      invalidateRules();
      closePreview();
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const retireMutation = useMutation({
    mutationFn: async () => {
      if (!retireTarget) throw new Error('Choose a pricing rule.');
      if (retireReason.trim().length < 10) throw new Error('Explain the retirement decision in at least 10 characters.');
      await api.post(`/api/v1/admin/pricing-rules/${retireTarget.id}/retire`, {
        reason: retireReason.trim(),
      });
    },
    onSuccess: () => {
      invalidateRules();
      setRetireTarget(null);
      setRetireReason('');
      setActionError('');
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const closePreview = (): void => {
    setPreviewTarget(null);
    setPreviewSamples([]);
    setPreviewReceipt(null);
    setPublishReason('');
    setActionError('');
  };

  const openPreview = (rule: PricingRule): void => {
    const eligibleSubcategory = fixedSubcategories.find((item) => !rule.categoryId || item.categoryId === rule.categoryId);
    const eligibleArea = rule.serviceAreaId
      ? areas.find((area) => area.id === rule.serviceAreaId)
      : areas.find((area) => area.status !== 'retired');
    setPreviewTarget(rule);
    setPreviewSamples([{
      subcategoryId: eligibleSubcategory?.id ?? '',
      serviceAreaId: eligibleArea?.id ?? '',
      scheduledAt: defaultPreviewTime(rule),
    }]);
    setPreviewReceipt(null);
    setPublishReason('');
    setActionError('');
  };

  const setSample = (index: number, patch: Partial<PreviewSampleForm>): void => {
    setPreviewSamples((samples) => samples.map((sample, sampleIndex) =>
      sampleIndex === index ? { ...sample, ...patch } : sample));
    setPreviewReceipt(null);
  };

  const toggleDay = (day: number): void => {
    setForm((current) => ({
      ...current,
      peakDaysOfWeek: current.peakDaysOfWeek.includes(day)
        ? current.peakDaysOfWeek.filter((value) => value !== day)
        : [...current.peakDaysOfWeek, day].sort(),
    }));
  };

  const openCreate = (): void => {
    setEditing('new');
    setForm({
      ...EMPTY_FORM,
      categoryId: categories[0]?.id ?? '',
      serviceAreaId: areas.find((area) => area.status !== 'retired')?.id ?? '',
    });
    setActionError('');
  };

  const submitDraft = (event: FormEvent): void => {
    event.preventDefault();
    setActionError('');
    saveMutation.mutate();
  };

  const rules = rulesQuery.data?.data ?? [];
  const isBusy = saveMutation.isPending || previewMutation.isPending || publishMutation.isPending || retireMutation.isPending;
  const eligiblePreviewSubcategories = fixedSubcategories.filter((item) =>
    !previewTarget?.categoryId || item.categoryId === previewTarget.categoryId);
  const eligiblePreviewAreas = areas.filter((area) =>
    area.status !== 'retired' && (!previewTarget?.serviceAreaId || area.id === previewTarget.serviceAreaId));

  const scopeLabel = (rule: PricingRule): string => {
    const category = rule.categoryId ? categoryById.get(rule.categoryId)?.name ?? 'Unknown category' : 'All categories';
    const area = rule.serviceAreaId ? areaById.get(rule.serviceAreaId)?.name ?? 'Unknown area' : 'All service areas';
    return `${category} · ${area}`;
  };

  const actionButtons = (rule: PricingRule): React.ReactElement => (
    <div className="flex flex-wrap justify-end gap-2">
      {isSuperAdmin && rule.publicationStatus === 'draft' && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditing(rule); setForm(ruleToForm(rule)); setActionError(''); }}
            disabled={isBusy}
          >
            Edit draft
          </Button>
          <Button size="sm" onClick={() => openPreview(rule)} disabled={isBusy}>
            Preview & publish
          </Button>
        </>
      )}
      {isSuperAdmin && rule.publicationStatus !== 'retired' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setRetireTarget(rule); setRetireReason(''); setActionError(''); }}
          disabled={isBusy}
        >
          Retire
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge label="Money control" variant="warning" />
            <span className="text-xs font-medium text-slate-500">New bookings only</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Pricing rules</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-secondary)]">
            Stage surge pricing as a draft, test it with server prices and live scopes, then publish it with an audit reason. Existing booking totals never change.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={openCreate} disabled={editing !== null || isBusy}>Create draft</Button>
        )}
      </header>

      {!isSuperAdmin && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Read-only pricing access</p>
          <p className="mt-1">You can review scope, lifecycle, and publication history. A super-admin must stage or publish customer-price changes.</p>
        </div>
      )}

      {(catalogQuery.isError || areasQuery.isError) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Live catalog or service-area scope data could not be loaded. Draft controls are unavailable until both sources are current.
        </div>
      )}

      {actionError && !editing && !previewTarget && !retireTarget && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError}</div>
      )}

      {editing && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="pricing-draft-heading">
          <div className="mb-5">
            <h2 id="pricing-draft-heading" className="text-lg font-semibold text-slate-950">
              {editing === 'new' ? 'Create pricing draft' : `Edit draft: ${editing.name}`}
            </h2>
            <p className="mt-1 text-sm text-slate-600">Saving does not activate this rule. Scope must be explicit.</p>
          </div>
          <form onSubmit={submitDraft} className="space-y-5" noValidate>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2">
                <Label htmlFor="pricing-name">Rule name</Label>
                <Input id="pricing-name" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />
              </div>
              <div>
                <Label htmlFor="pricing-type">Rule type</Label>
                <select
                  id="pricing-type"
                  value={form.type}
                  disabled={editing !== 'new'}
                  onChange={(event) => setForm((value) => ({ ...value, type: event.target.value as RuleType }))}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                >
                  <option value="rush">Rush</option>
                  <option value="holiday">Holiday</option>
                  <option value="peak_hours">Peak hours</option>
                </select>
              </div>
              <div>
                <Label htmlFor="pricing-multiplier">Customer multiplier</Label>
                <Input id="pricing-multiplier" type="number" min="1" max="5" step="0.05" value={form.multiplier} onChange={(event) => setForm((value) => ({ ...value, multiplier: event.target.value }))} />
              </div>
              <div>
                <Label htmlFor="pricing-platform-share">Platform share of surge</Label>
                <Input id="pricing-platform-share" type="number" min="0" max="1" step="0.05" value={form.platformSurgeShare} onChange={(event) => setForm((value) => ({ ...value, platformSurgeShare: event.target.value }))} />
                <p className="mt-1 text-xs text-slate-500">0 sends all surge revenue to the provider. 1 sends all to the platform.</p>
              </div>
              <div>
                <Label htmlFor="pricing-priority">Priority</Label>
                <Input id="pricing-priority" type="number" min="0" max="1000" value={form.priority} onChange={(event) => setForm((value) => ({ ...value, priority: event.target.value }))} />
                <p className="mt-1 text-xs text-slate-500">Higher priority wins; multiplier breaks a tie.</p>
              </div>

              {form.type === 'rush' && (
                <div>
                  <Label htmlFor="pricing-rush">Hours before service</Label>
                  <Input id="pricing-rush" type="number" min="1" max="24" value={form.rushHoursThreshold} onChange={(event) => setForm((value) => ({ ...value, rushHoursThreshold: event.target.value }))} />
                </div>
              )}
              {form.type === 'holiday' && (
                <div>
                  <Label htmlFor="pricing-holiday">Holiday date</Label>
                  <Input id="pricing-holiday" type="date" value={form.holidayDate} onChange={(event) => setForm((value) => ({ ...value, holidayDate: event.target.value }))} />
                </div>
              )}
              {form.type === 'peak_hours' && (
                <>
                  <div>
                    <Label htmlFor="pricing-start">Start time</Label>
                    <Input id="pricing-start" type="time" value={form.peakStartTime} onChange={(event) => setForm((value) => ({ ...value, peakStartTime: event.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="pricing-end">End time</Label>
                    <Input id="pricing-end" type="time" value={form.peakEndTime} onChange={(event) => setForm((value) => ({ ...value, peakEndTime: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <Label>Peak days</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DAY_NAMES.map((day, index) => (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={form.peakDaysOfWeek.includes(index)}
                          onClick={() => toggleDay(index)}
                          className={`min-h-10 rounded-full border px-3 text-sm font-medium ${form.peakDaysOfWeek.includes(index) ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">No selected days means every day.</p>
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="pricing-category-mode">Category scope</Label>
                <select id="pricing-category-mode" value={form.categoryMode} onChange={(event) => setForm((value) => ({ ...value, categoryMode: event.target.value as DraftForm['categoryMode'] }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="category">One category</option>
                  <option value="global">All categories (global)</option>
                </select>
              </div>
              {form.categoryMode === 'category' && (
                <div>
                  <Label htmlFor="pricing-category">Category</Label>
                  <select id="pricing-category" value={form.categoryId} onChange={(event) => setForm((value) => ({ ...value, categoryId: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Choose category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="pricing-area-mode">Service-area scope</Label>
                <select id="pricing-area-mode" value={form.areaMode} onChange={(event) => setForm((value) => ({ ...value, areaMode: event.target.value as DraftForm['areaMode'] }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="service_area">One service area</option>
                  <option value="global">All service areas (global)</option>
                </select>
              </div>
              {form.areaMode === 'service_area' && (
                <div>
                  <Label htmlFor="pricing-area">Service area</Label>
                  <select id="pricing-area" value={form.serviceAreaId} onChange={(event) => setForm((value) => ({ ...value, serviceAreaId: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Choose service area</option>
                    {areas.filter((area) => area.status !== 'retired').map((area) => <option key={area.id} value={area.id}>{area.name} · {area.city}</option>)}
                  </select>
                </div>
              )}
              {(form.categoryMode === 'global' || form.areaMode === 'global') && (
                <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">Global scope selected</p>
                  <p className="mt-1">This draft can affect all categories and/or all service areas selected above. Add representative preview cases before publishing.</p>
                </div>
              )}
              <div className="md:col-span-2 xl:col-span-3">
                <Label htmlFor="pricing-description">Internal description</Label>
                <Textarea id="pricing-description" rows={2} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} />
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <Label htmlFor="pricing-reason">Audit reason</Label>
                <Textarea id="pricing-reason" rows={3} value={form.reason} onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))} placeholder="Why is this draft needed, and what operational evidence supports it?" />
              </div>
            </div>
            {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => { setEditing(null); setActionError(''); }} disabled={isBusy}>Cancel</Button>
              <Button type="submit" disabled={isBusy || catalogQuery.isError || areasQuery.isError}>{saveMutation.isPending ? 'Saving draft…' : 'Save draft'}</Button>
            </div>
          </form>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label="Filter pricing rules by type" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">All rule types</option>
          <option value="rush">Rush</option>
          <option value="holiday">Holiday</option>
          <option value="peak_hours">Peak hours</option>
        </select>
        <select aria-label="Filter pricing rules by lifecycle" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">All lifecycle states</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {rulesQuery.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : rulesQuery.isError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Pricing rules could not be loaded.</div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-slate-600">
          <TrendingUp size={40} className="mx-auto mb-3 text-slate-400" />
          <p className="font-semibold text-slate-900">No pricing rules match this view</p>
          <p className="mt-1 text-sm">Clear the filters or create a controlled draft.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {rules.map((rule) => (
              <article key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{rule.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{TYPE_LABELS[rule.type]} · priority {rule.priority}</p>
                  </div>
                  <Badge label={STATUS_LABELS[rule.publicationStatus]} variant={STATUS_VARIANTS[rule.publicationStatus]} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Scope</dt><dd className="mt-1 text-slate-800">{scopeLabel(rule)}</dd></div>
                  <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Schedule</dt><dd className="mt-1 text-slate-800">{scheduleLabel(rule)}</dd></div>
                  <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer price</dt><dd className="mt-1 font-semibold text-slate-950">×{rule.multiplier.toFixed(2)}</dd></div>
                  <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Surge split</dt><dd className="mt-1 text-slate-800">Platform {Math.round(rule.platformSurgeShare * 100)}% · Provider {Math.round((1 - rule.platformSurgeShare) * 100)}%</dd></div>
                </dl>
                {rule.description && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{rule.description}</p>}
                <p className="mt-3 text-xs text-slate-500">{lifecycleEvidence(rule)}</p>
                <div className="mt-4 border-t border-slate-100 pt-3">{actionButtons(rule)}</div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Customer price</th>
                  <th className="px-4 py-3">Surge split</th>
                  <th className="px-4 py-3">Lifecycle</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rules.map((rule) => (
                  <tr key={rule.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4"><p className="font-semibold text-slate-950">{rule.name}</p><p className="mt-1 text-xs text-slate-500">{TYPE_LABELS[rule.type]} · priority {rule.priority}</p></td>
                    <td className="max-w-56 px-4 py-4 text-slate-700">{scopeLabel(rule)}</td>
                    <td className="max-w-52 px-4 py-4 text-slate-700">{scheduleLabel(rule)}</td>
                    <td className="px-4 py-4 font-semibold text-slate-950">×{rule.multiplier.toFixed(2)}<p className="mt-1 text-xs font-normal text-slate-500">+{Math.round((rule.multiplier - 1) * 100)}%</p></td>
                    <td className="px-4 py-4 text-slate-700">Platform {Math.round(rule.platformSurgeShare * 100)}%<p className="mt-1 text-xs text-slate-500">Provider {Math.round((1 - rule.platformSurgeShare) * 100)}%</p></td>
                    <td className="max-w-64 px-4 py-4"><Badge label={STATUS_LABELS[rule.publicationStatus]} variant={STATUS_VARIANTS[rule.publicationStatus]} /><p className="mt-2 text-xs leading-5 text-slate-500">{lifecycleEvidence(rule)}</p></td>
                    <td className="px-4 py-4">{actionButtons(rule)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rulesQuery.data?.pagination && rulesQuery.data.pagination.totalPages > 1 && (
        <Pagination {...rulesQuery.data.pagination} onPageChange={setPage} />
      )}

      <Dialog open={previewTarget !== null} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Authoritative preview · {previewTarget?.name}</DialogTitle>
            <DialogDescription>Use fixed-price services, live service areas, and representative dates. The server resolves overlap using the same rule engine as booking creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewSamples.map((sample, index) => (
              <div key={`${index}-${sample.subcategoryId}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Sample {index + 1}</p>{previewSamples.length > 1 && <Button size="sm" variant="outline" onClick={() => { setPreviewSamples((items) => items.filter((_, itemIndex) => itemIndex !== index)); setPreviewReceipt(null); }}>Remove</Button>}</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label htmlFor={`preview-service-${index}`}>Fixed-price service</Label>
                    <select id={`preview-service-${index}`} value={sample.subcategoryId} onChange={(event) => setSample(index, { subcategoryId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                      <option value="">Choose service</option>
                      {eligiblePreviewSubcategories.map((item) => <option key={item.id} value={item.id}>{item.categoryName} · {item.name} · {formatCurrency(item.basePrice ?? 0)}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`preview-area-${index}`}>Service area</Label>
                    <select id={`preview-area-${index}`} value={sample.serviceAreaId} onChange={(event) => setSample(index, { serviceAreaId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                      <option value="">Choose area</option>
                      {eligiblePreviewAreas.map((area) => <option key={area.id} value={area.id}>{area.name} · {area.city}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`preview-time-${index}`}>Scheduled date and time</Label>
                    <Input id={`preview-time-${index}`} type="datetime-local" value={sample.scheduledAt} onChange={(event) => setSample(index, { scheduledAt: event.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            {previewSamples.length < 12 && (
              <Button type="button" variant="outline" onClick={() => setPreviewSamples((samples) => [...samples, { subcategoryId: eligiblePreviewSubcategories[0]?.id ?? '', serviceAreaId: eligiblePreviewAreas[0]?.id ?? '', scheduledAt: previewTarget ? defaultPreviewTime(previewTarget) : '' }])}>Add representative sample</Button>
            )}
            {!previewReceipt && <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>{previewMutation.isPending ? 'Running server preview…' : 'Run server preview'}</Button>}
            {actionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}

            {previewReceipt && (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p className="font-semibold">Current server preview</p>
                  <p className="mt-1">Valid until {new Date(previewReceipt.expiresAt).toLocaleString('en-PH')}. Any draft or active-rule change invalidates it.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[850px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-3 py-3">Case</th><th className="px-3 py-3">Base</th><th className="px-3 py-3">Winner</th><th className="px-3 py-3">Customer total</th><th className="px-3 py-3">Platform surge</th><th className="px-3 py-3">Provider surge</th><th className="px-3 py-3">Overlap</th></tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {previewReceipt.results.map((result, index) => (
                        <tr key={`${result.subcategory.id}-${index}`}>
                          <td className="px-3 py-3"><p className="font-medium text-slate-950">{result.subcategory.name}</p><p className="text-xs text-slate-500">{result.serviceArea.name} · {new Date(result.scheduledAt).toLocaleString('en-PH')}</p></td>
                          <td className="px-3 py-3">{formatCurrency(result.basePrice)}</td>
                          <td className="px-3 py-3"><span className={result.winningRule?.isDraft ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{result.winningRule?.name ?? 'No surge'}</span></td>
                          <td className="px-3 py-3 font-semibold">{formatCurrency(result.finalPrice)}<p className="text-xs font-normal text-slate-500">+{formatCurrency(result.surgeAmount)}</p></td>
                          <td className="px-3 py-3">{formatCurrency(result.platformSurgeShare)}</td>
                          <td className="px-3 py-3">{formatCurrency(result.providerSurgeShare)}</td>
                          <td className="px-3 py-3">{result.matchingRules.length} matching<p className="text-xs text-slate-500">{result.matchingRules.map((rule) => `${rule.name} (P${rule.priority})`).join(', ') || 'None'}</p></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <Label htmlFor="publish-reason">Publication reason</Label>
                  <Textarea id="publish-reason" rows={3} value={publishReason} onChange={(event) => setPublishReason(event.target.value)} placeholder="What did you verify, and why should this price change become active for future bookings?" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePreview} disabled={isBusy}>Close</Button>
            {previewReceipt && <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>{publishMutation.isPending ? 'Publishing…' : 'Publish for future bookings'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retireTarget !== null} onOpenChange={(open) => { if (!open) { setRetireTarget(null); setRetireReason(''); setActionError(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire pricing rule</DialogTitle>
            <DialogDescription>Retiring “{retireTarget?.name}” stops it from new pricing decisions. Its record and existing booking evidence remain unchanged.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="retire-reason">Retirement reason</Label>
            <Textarea id="retire-reason" rows={3} value={retireReason} onChange={(event) => setRetireReason(event.target.value)} />
            {actionError && <p role="alert" className="mt-2 text-sm text-red-700">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRetireTarget(null); setRetireReason(''); setActionError(''); }} disabled={retireMutation.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={() => retireMutation.mutate()} disabled={retireMutation.isPending}>{retireMutation.isPending ? 'Retiring…' : 'Retire rule'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
