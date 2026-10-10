import React, { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { adminConfig } from '@/config/admin.config';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Input,
  Label,
  Pagination,
  Textarea,
  type Column,
} from '@/components/ui';
import { Pencil, Plus } from '@/components/icons';

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

interface PromotionListResponse {
  success: boolean;
  data: PromotionBanner[];
  meta: { page: number; pageSize: number; total: number };
}

type DeliveryStatus = 'live' | 'scheduled' | 'draft' | 'ended' | 'not_connected';

interface BannerFormState {
  title: string;
  subtitle: string;
  badge: string;
  ctaText: string;
  ctaLink: string;
  startDate: string;
  endDate: string;
  displayOrder: string;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaInput(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Date(parsed.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

function nowManilaInput(): string {
  return new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

function toApiTimestamp(value: string): string | null {
  if (!value) return null;
  return `${value}:00+08:00`;
}

function formatSchedule(iso: string | null): string {
  if (!iso) return 'No end date';
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return 'Invalid date';
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function deliveryStatus(promotion: PromotionBanner): DeliveryStatus {
  if (promotion.targetAudience !== 'all') return 'not_connected';
  if (!promotion.isActive) return 'draft';
  const now = Date.now();
  if (new Date(promotion.startDate).getTime() > now) return 'scheduled';
  if (promotion.endDate && new Date(promotion.endDate).getTime() < now) return 'ended';
  return 'live';
}

function statusBadge(status: DeliveryStatus): React.ReactElement {
  if (status === 'live') return <Badge label="Live on customer home" variant="success" />;
  if (status === 'scheduled') return <Badge label="Scheduled" variant="info" />;
  if (status === 'ended') return <Badge label="Ended" variant="default" />;
  if (status === 'not_connected') return <Badge label="Audience not connected" variant="warning" />;
  return <Badge label="Draft / paused" variant="warning" />;
}

function audienceLabel(audience: PromotionBanner['targetAudience']): string {
  if (audience === 'all') return 'All customers';
  if (audience === 'new_customers') return 'New customers (legacy)';
  if (audience === 'returning') return 'Returning customers (legacy)';
  return 'Providers (legacy)';
}

function validateForm(form: BannerFormState): string | null {
  if (!form.title.trim()) return 'Title is required.';
  if (form.endDate && form.startDate && form.endDate <= form.startDate) {
    return 'End date must be after start date.';
  }
  const link = form.ctaLink.trim();
  if (link && !((link.startsWith('/') && !link.startsWith('//')) || /^https:\/\//i.test(link))) {
    return 'Destination must be an internal app path beginning with / or an HTTPS URL.';
  }
  if ((form.ctaText.trim() && !link) || (!form.ctaText.trim() && link)) {
    return 'CTA label and destination must either both be filled in or both be blank.';
  }
  return null;
}

function toRequestBody(form: BannerFormState): Record<string, unknown> {
  return {
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    badge: form.badge.trim() || null,
    ctaText: form.ctaText.trim() || null,
    ctaLink: form.ctaLink.trim() || null,
    targetAudience: 'all',
    startDate: toApiTimestamp(form.startDate),
    endDate: toApiTimestamp(form.endDate),
    displayOrder: Number(form.displayOrder || 0),
  };
}

export default function PromotionBannersTab({ isSuperAdmin }: { isSuperAdmin: boolean }): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PromotionBanner | null>(null);
  const [publishing, setPublishing] = useState<PromotionBanner | null>(null);

  const bannersQuery = useQuery({
    queryKey: ['admin-promotion-banners', page],
    queryFn: async () => {
      const response = await api.get<PromotionListResponse>('/api/v1/promotions', {
        params: { page, pageSize: adminConfig.defaultPageSize },
      });
      return { rows: response.data.data, total: response.data.meta.total };
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-promotion-banners'] });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await api.put<{ success: boolean; data: PromotionBanner }>(
        `/api/v1/promotions/${id}`,
        { isActive },
      );
      return response.data.data;
    },
    onSuccess: () => {
      invalidate();
      setPublishing(null);
    },
  });

  const columns: Column<PromotionBanner>[] = useMemo(() => [
    {
      key: 'content',
      header: 'Customer-facing content',
      render: (promotion) => (
        <div className="min-w-56">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--color-text)]">{promotion.title}</span>
            {promotion.badge && <Badge label={promotion.badge} variant="info" />}
          </div>
          {promotion.subtitle && <p className="mt-1 max-w-md text-xs text-[var(--color-text-secondary)]">{promotion.subtitle}</p>}
          {promotion.ctaText && (
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              CTA: {promotion.ctaText} → {promotion.ctaLink}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'audience',
      header: 'Audience',
      render: (promotion) => <span className="text-sm">{audienceLabel(promotion.targetAudience)}</span>,
    },
    {
      key: 'schedule',
      header: 'Schedule (Manila)',
      render: (promotion) => (
        <div className="text-xs text-[var(--color-text-secondary)]">
          <p>Starts {formatSchedule(promotion.startDate)}</p>
          <p>Ends {formatSchedule(promotion.endDate)}</p>
          <p>Display order {promotion.displayOrder}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Delivery status',
      render: (promotion) => statusBadge(deliveryStatus(promotion)),
    },
    {
      key: 'actions',
      header: '',
      render: (promotion) => isSuperAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(promotion)}>
            <Pencil size={12} /> Edit
          </Button>
          {promotion.isActive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ id: promotion.id, isActive: false })}
            >
              Pause
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={promotion.targetAudience !== 'all' || deliveryStatus(promotion) === 'ended'}
              onClick={() => setPublishing(promotion)}
            >
              Publish
            </Button>
          )}
        </div>
      ) : null,
    },
  ], [isSuperAdmin, statusMutation.isPending]);

  const total = bannersQuery.data?.total ?? 0;

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
        <p className="text-sm font-semibold">Customer home carousel</p>
        <p className="mt-1 text-sm text-sky-800">
          These banners render as text cards on the customer home screen. Images are not rendered by the current app. New banners are saved as drafts and require a separate publish action.
        </p>
        {!isSuperAdmin && (
          <p className="mt-2 text-sm font-medium text-sky-950">
            Your Admin role has read-only access. A Super Admin must create, edit, publish, or pause customer-facing banners.
          </p>
        )}
      </div>
      {(bannersQuery.data?.rows ?? []).some((promotion) => promotion.targetAudience !== 'all') && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Legacy targeted rows exist, but no customer or provider client currently requests those audience segments. They are not delivered. Edit them to the connected all-customer audience before publishing.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--color-text)]">Home banners</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Manage visible customer copy, CTA destinations, timing, and display order.</p>
        </div>
        {isSuperAdmin && (
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create draft banner
          </Button>
        )}
      </div>

      {bannersQuery.isError ? (
        <ErrorState
          title="Failed to load home banners"
          description={getErrorMessage(bannersQuery.error)}
          action={<Button type="button" variant="outline" onClick={() => void bannersQuery.refetch()}>Try again</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={bannersQuery.data?.rows ?? []}
          keyExtractor={(promotion) => promotion.id}
          isLoading={bannersQuery.isLoading}
          emptyMessage="No customer home banners have been created."
        />
      )}

      {total > adminConfig.defaultPageSize && (
        <Pagination
          page={page}
          pageSize={adminConfig.defaultPageSize}
          total={total}
          totalPages={Math.ceil(total / adminConfig.defaultPageSize)}
          onPageChange={setPage}
        />
      )}

      {showCreate && (
        <BannerEditorDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            invalidate();
            setShowCreate(false);
          }}
        />
      )}
      {editing && (
        <BannerEditorDialog
          mode="edit"
          promotion={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {publishing && (
        <Dialog open onOpenChange={(open) => !open && setPublishing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish “{publishing.title}”?</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>
                {new Date(publishing.startDate).getTime() > Date.now()
                  ? `This banner will become visible at ${formatSchedule(publishing.startDate)}.`
                  : 'This banner will become visible on customer home immediately.'}
              </p>
              <p>Destination: {publishing.ctaLink ?? 'No CTA'}</p>
            </div>
            {statusMutation.isError && <p role="alert" className="text-sm text-red-700">{getErrorMessage(statusMutation.error)}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPublishing(null)}>Cancel</Button>
              <Button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: publishing.id, isActive: true })}
              >
                Publish banner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function BannerEditorDialog({
  mode,
  promotion,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  promotion?: PromotionBanner;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<BannerFormState>({
    title: promotion?.title ?? '',
    subtitle: promotion?.subtitle ?? '',
    badge: promotion?.badge ?? '',
    ctaText: promotion?.ctaText ?? '',
    ctaLink: promotion?.ctaLink ?? '',
    startDate: promotion ? toManilaInput(promotion.startDate) : nowManilaInput(),
    endDate: promotion?.endDate ? toManilaInput(promotion.endDate) : '',
    displayOrder: String(promotion?.displayOrder ?? 0),
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const validationError = validateForm(form);
      if (validationError) throw new Error(validationError);
      const body = toRequestBody(form);
      if (mode === 'create') {
        body.isActive = false;
        const response = await api.post<{ success: boolean; data: PromotionBanner }>('/api/v1/promotions', body);
        return response.data.data;
      }
      const response = await api.put<{ success: boolean; data: PromotionBanner }>(`/api/v1/promotions/${promotion!.id}`, body);
      return response.data.data;
    },
    onSuccess: onSaved,
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create draft home banner' : `Edit ${promotion?.title}`}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Customer preview</p>
            <div className="mt-3 max-w-md rounded-2xl bg-[var(--color-primary)] p-5 text-white shadow-sm">
              {form.badge.trim() && <span className="rounded-full bg-white/20 px-2 py-1 text-xs font-semibold">{form.badge.trim()}</span>}
              <p className="mt-3 text-lg font-bold">{form.title.trim() || 'Banner title'}</p>
              {form.subtitle.trim() && <p className="mt-1 text-sm text-white/85">{form.subtitle.trim()}</p>}
              {form.ctaText.trim() && <p className="mt-4 text-sm font-semibold underline">{form.ctaText.trim()}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="banner-title">Title</Label>
            <Input
              id="banner-title"
              maxLength={200}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="banner-subtitle">Subtitle</Label>
            <Textarea
              id="banner-subtitle"
              maxLength={1000}
              value={form.subtitle}
              onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="banner-badge">Badge</Label>
              <Input
                id="banner-badge"
                maxLength={30}
                placeholder="Optional, e.g. NEW"
                value={form.badge}
                onChange={(event) => setForm((current) => ({ ...current, badge: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="banner-order">Display order</Label>
              <Input
                id="banner-order"
                type="number"
                min="0"
                max="10000"
                step="1"
                value={form.displayOrder}
                onChange={(event) => setForm((current) => ({ ...current, displayOrder: event.target.value }))}
                required
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Lower numbers appear first.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="banner-cta-text">CTA label</Label>
              <Input
                id="banner-cta-text"
                maxLength={50}
                placeholder="Browse services"
                value={form.ctaText}
                onChange={(event) => setForm((current) => ({ ...current, ctaText: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="banner-cta-link">CTA destination</Label>
              <Input
                id="banner-cta-link"
                maxLength={500}
                placeholder="/customer/search or https://…"
                value={form.ctaLink}
                onChange={(event) => setForm((current) => ({ ...current, ctaLink: event.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="banner-start">Starts (Manila time)</Label>
              <Input
                id="banner-start"
                type="datetime-local"
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="banner-end">Ends (Manila time)</Label>
              <Input
                id="banner-end"
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Leave blank for no automatic end.</p>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Audience is limited to all customers because that is the only segment currently connected to the customer app. Image URLs are not offered because the app does not render them.
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mode === 'create' ? 'Save draft' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
