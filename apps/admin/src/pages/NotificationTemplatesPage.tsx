import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import {
  DataTable,
  Badge,
  Pagination,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
  useReasonDialog,
  type Column,
} from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';

interface Template {
  id: string;
  slug: string;
  titleTemplate: string;
  bodyTemplate: string;
  type: string;
  channel: string;
  isActive: boolean;
  variables: string[];
  runtimeStatus: 'connected' | 'reference_only';
  runtimeVariables: string[] | null;
  runtimeChannels?: Array<'in_app' | 'push'> | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: Template[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const CHANNEL_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  push: 'info',
  sms: 'success',
  email: 'warning',
  in_app: 'default',
};

const TYPE_OPTIONS = new Set(['booking_update', 'payment', 'dispute_update', 'tier_upgrade', 'payout', 'referral', 'suki', 'promo', 'system']);
const CHANNEL_OPTIONS = new Set(['all', 'push', 'sms', 'email', 'in_app']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_CONTRACTS: Readonly<Record<string, {
  variables: readonly string[];
  channels: ReadonlyArray<'in_app' | 'push'>;
}>> = {
  new_job_available: {
    variables: ['bookingId', 'serviceName', 'amount', 'city'],
    channels: ['in_app', 'push'],
  },
  booking_matched: {
    variables: ['bookingId', 'providerName'],
    channels: ['in_app', 'push'],
  },
};
const PREVIEW_VALUES: Readonly<Record<string, string>> = {
  bookingId: 'OS-1042',
  serviceName: 'Aircon cleaning',
  amount: '₱1,500.00',
  city: 'Cebu City',
  providerName: 'Maria Santos',
  scheduledTime: 'September 2 at 10:00 AM',
  method: 'GCash',
  resolution: 'Refund approved',
  refereeName: 'Juan Dela Cruz',
  tier: 'Gold',
  discount: '10',
  code: 'WELCOME10',
};

interface PlaceholderState {
  variables: string[];
  malformed: boolean;
}

export function inspectPlaceholders(title: string, body: string): PlaceholderState {
  const source = `${title}\n${body}`;
  const validPlaceholder = /{{([A-Za-z][A-Za-z0-9_]{0,49})}}/g;
  const variables = [...new Set([...source.matchAll(validPlaceholder)].map((match) => match[1]!))];
  const withoutValid = source.replace(validPlaceholder, '');
  return {
    variables,
    malformed: withoutValid.includes('{{') || withoutValid.includes('}}'),
  };
}

function renderPreview(copy: string, variables: string[]): string {
  return variables.reduce(
    (rendered, variable) => rendered.split(`{{${variable}}}`).join(PREVIEW_VALUES[variable] ?? `[${variable}]`),
    copy,
  );
}

function runtimeVariablesFor(slug: string): readonly string[] | null {
  return RUNTIME_CONTRACTS[slug]?.variables ?? null;
}

function runtimeChannelsFor(slug: string): ReadonlyArray<'in_app' | 'push'> | null {
  return RUNTIME_CONTRACTS[slug]?.channels ?? null;
}

function formatRuntimeChannels(channels: readonly string[]): string {
  return channels.map((channel) => channel === 'in_app' ? 'In-app' : 'Push').join(' + ');
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseType(value: string | null): string {
  return value && TYPE_OPTIONS.has(value) ? value : '';
}

function parseChannel(value: string | null): string {
  return value && CHANNEL_OPTIONS.has(value) ? value : '';
}

export default function NotificationTemplatesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const { requestReason, reasonDialog } = useReasonDialog();
  // All template lifecycle mutations are super_admin-only on the server.
  // Keep ordinary-admin support visibility read-only in the client as well.
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const typeFilter = parseType(searchParams.get('type'));
  const channelFilter = parseChannel(searchParams.get('channel'));
  const rawTemplateId = searchParams.get('templateId')?.trim() ?? '';
  const hasMalformedTemplateId = Boolean(rawTemplateId) && !UUID_REGEX.test(rawTemplateId);
  const requestedTemplateId = UUID_REGEX.test(rawTemplateId) ? rawTemplateId.toLowerCase() : '';

  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [formSlug, setFormSlug] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formType, setFormType] = useState('booking_update');
  const [formChannel, setFormChannel] = useState('push');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['adminTemplates', page, typeFilter, channelFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (typeFilter) params.type = typeFilter;
      if (channelFilter) params.channel = channelFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/notification-templates', { params });
      return res.data;
    },
  });

  const exactTemplateQuery = useQuery({
    queryKey: ['adminTemplates', 'exact', requestedTemplateId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Template }>(
        `/api/v1/admin/notification-templates/${requestedTemplateId}`,
      );
      if (response.data.data.id !== requestedTemplateId) {
        throw new Error('The notification-template response did not match the selected record.');
      }
      return response.data.data;
    },
    enabled: Boolean(requestedTemplateId),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (reason: string) => {
      const editableFields = {
        titleTemplate: formTitle.trim(),
        bodyTemplate: formBody.trim(),
        type: formType,
        isActive: formActive,
        reason,
        ...(runtimeChannelsFor(formSlug.trim()) ? {} : { channel: formChannel }),
      };
      if (editing) {
        await api.put(`/api/v1/admin/notification-templates/${editing.id}`, editableFields);
      } else {
        await api.post('/api/v1/admin/notification-templates', {
          slug: formSlug.trim(),
          ...editableFields,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
      closeModal();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.delete(`/api/v1/admin/notification-templates/${id}`, { body: { reason } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive, reason }: { id: string; isActive: boolean; reason: string }) => {
      await api.put(`/api/v1/admin/notification-templates/${id}`, { isActive, reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  function openEdit(t: Template): void {
    setEditing(t);
    setCreating(false);
    setFormSlug(t.slug);
    setFormTitle(t.titleTemplate);
    setFormBody(t.bodyTemplate);
    setFormType(t.type);
    setFormChannel(t.channel);
    setFormActive(t.isActive);
    setFormError('');
  }

  function openCreate(): void {
    setEditing(null);
    setCreating(true);
    setFormSlug('');
    setFormTitle('');
    setFormBody('');
    setFormType('booking_update');
    setFormChannel('push');
    setFormActive(true);
    setFormError('');
  }

  function closeModal(): void {
    setEditing(null);
    setCreating(false);
    setFormError('');
  }

  const placeholderState = inspectPlaceholders(formTitle, formBody);
  const connectedVariables = runtimeVariablesFor(formSlug.trim());
  const connectedChannels = runtimeChannelsFor(formSlug.trim());
  const unsupportedVariables = connectedVariables
    ? placeholderState.variables.filter((variable) => !connectedVariables.includes(variable))
    : [];
  const slugIsValid = /^[a-z0-9_]{3,100}$/.test(formSlug.trim());
  const formIsValid = slugIsValid
    && formTitle.trim().length >= 3
    && formBody.trim().length >= 10
    && !placeholderState.malformed
    && placeholderState.variables.length <= 20
    && unsupportedVariables.length === 0;

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
  }

  function setTypeFilter(nextType: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (nextType) params.set('type', nextType);
      else params.delete('type');
      return params;
    });
  }

  function setChannelFilter(nextChannel: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (nextChannel) params.set('channel', nextChannel);
      else params.delete('channel');
      return params;
    });
  }

  function clearTemplateSelection(): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('templateId');
      return params;
    });
  }

  async function submitSave(): Promise<void> {
    if (!slugIsValid) {
      setFormError('Slug must be 3–100 lowercase letters, numbers, or underscores.');
      return;
    }
    if (formTitle.trim().length < 3 || formBody.trim().length < 10) {
      setFormError('Title must be at least 3 characters and body must be at least 10 characters.');
      return;
    }
    if (placeholderState.malformed) {
      setFormError('A placeholder is malformed. Use {{variableName}} with letters, numbers, and underscores only.');
      return;
    }
    if (placeholderState.variables.length > 20) {
      setFormError('A template can contain no more than 20 variables.');
      return;
    }
    if (unsupportedVariables.length > 0) {
      setFormError(`This live workflow cannot supply: ${unsupportedVariables.map((value) => `{{${value}}}`).join(', ')}.`);
      return;
    }
    const action = editing ? 'Update' : 'Create';
    const runtimeDescription = connectedVariables && connectedChannels
      ? `When active, it overrides the built-in copy used for ${formatRuntimeChannels(connectedChannels)} delivery. SMS and email are not connected.`
      : `It is reference-only. “${formChannel.replace('_', '-')}” is stored as catalog metadata and does not make a message send.`;
    const reason = await requestReason({
      title: `${action} notification template?`,
      description: `This will ${action.toLowerCase()} “${formSlug.trim()}”. ${runtimeDescription}`,
      confirmLabel: action,
      reasonLabel: 'Change reason',
      tone: 'default',
    });
    if (!reason) return;
    saveMutation.mutate(reason);
  }

  async function toggleTemplate(template: Template): Promise<void> {
    const nextActive = !template.isActive;
    const action = nextActive ? 'Activate' : 'Deactivate';
    const reason = await requestReason({
      title: `${action} notification template?`,
      description: template.runtimeStatus === 'connected'
        ? nextActive
          ? `“${template.slug}” will replace its built-in fallback copy in the connected live workflow.`
          : `“${template.slug}” will stop overriding its connected workflow. Built-in fallback copy will continue to send.`
        : `“${template.slug}” is reference-only. This changes its catalog status but does not affect live messages.`,
      confirmLabel: action,
      reasonLabel: `${action} reason`,
      tone: nextActive ? 'default' : 'destructive',
    });
    if (!reason) return;
    toggleMutation.mutate({ id: template.id, isActive: nextActive, reason });
  }

  async function deleteTemplate(template: Template): Promise<void> {
    const reason = await requestReason({
      title: 'Delete notification template?',
      description: template.runtimeStatus === 'connected'
        ? `“${template.slug}” will be permanently removed and its built-in in-app/push fallback copy will continue to send. Deactivate it instead if the editable row must remain available.`
        : `“${template.slug}” will be permanently removed. It is reference-only and does not currently send.`,
      confirmLabel: 'Delete template',
      reasonLabel: 'Deletion reason',
      tone: 'destructive',
    });
    if (reason) deleteMutation.mutate({ id: template.id, reason });
  }

  const columns: Column<Template>[] = [
    {
      key: 'slug',
      header: 'Slug',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-text)]">{r.slug}</span>
      ),
    },
    {
      key: 'title',
      header: 'Title Template',
      render: (r) => (
        <span className="text-[var(--color-text)] text-sm truncate max-w-[200px] block">{r.titleTemplate}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => (
        <Badge label={r.type} variant="default" />
      ),
    },
    {
      key: 'channel',
      header: 'Delivery',
      render: (r) => {
        const runtimeChannels = r.runtimeChannels ?? runtimeChannelsFor(r.slug);
        return runtimeChannels ? (
          <Badge label={formatRuntimeChannels(runtimeChannels)} variant="info" />
        ) : (
          <Badge
            label={`Metadata: ${r.channel.replace(/_/g, ' ')}`}
            variant={CHANNEL_VARIANT[r.channel] ?? 'default'}
          />
        );
      },
    },
    {
      key: 'runtime',
      header: 'Runtime',
      render: (r) => r.runtimeStatus === 'connected' ? (
        <Badge label="Connected" variant="success" />
      ) : (
        <Badge label="Reference only" variant="default" />
      ),
    },
    {
      key: 'status',
      header: 'Active',
      render: (r) => isSuperAdmin ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleTemplate(r);
          }}
          aria-label={`Toggle template ${r.slug} ${r.isActive ? 'inactive' : 'active'}`}
          aria-pressed={r.isActive}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
        >
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${r.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
        </button>
      ) : (
        <Badge label={r.isActive ? 'Active' : 'Inactive'} variant={r.isActive ? 'success' : 'default'} />
      ),
    },
    {
      key: 'variables',
      header: 'Variables',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.variables ?? []).slice(0, 3).map(v => (
            <span key={v} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{`{{${v}}}`}</span>
          ))}
          {(r.variables ?? []).length > 3 && (
            <span className="text-[10px] text-slate-400">+{(r.variables ?? []).length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => isSuperAdmin ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Edit template ${r.slug}`}
            onClick={(e) => { e.stopPropagation(); openEdit(r); }}
            className="text-sky-700 hover:bg-sky-50"
          >
            Edit
          </Button>
          {isSuperAdmin && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Delete template ${r.slug}`}
              onClick={(e) => {
                e.stopPropagation();
                void deleteTemplate(r);
              }}
              className="text-red-700 hover:bg-red-50"
            >
              Delete
            </Button>
          )}
        </div>
      ) : (
        <span className="text-xs text-[var(--color-text-secondary)]">Read only</span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Notification Templates</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Review message copy, runtime linkage, channels, and placeholders before it reaches a customer or provider.
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            type="button"
            onClick={openCreate}
            className="w-full sm:w-auto"
          >
            + New Template
          </Button>
        )}
      </div>

      {!isSuperAdmin && (
        <section aria-label="Notification template access" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">Read-only operator access</p>
          <p className="mt-1 text-sm text-amber-800">
            Notification copy is a live configuration-publishing control. A super-admin must create, edit, activate, deactivate, or delete a template.
          </p>
        </section>
      )}

      <section aria-label="Notification template runtime coverage" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm font-semibold text-sky-950">2 workflows currently use admin-managed in-app and push copy</p>
        <p className="mt-1 text-sm text-sky-800">
          <span className="font-mono">new_job_available</span> and <span className="font-mono">booking_matched</span> are connected.
          SMS, email, test-send, per-channel variants, and version publication are not connected. Other rows are reference-only and do not change live messages until engineering connects their slug.
        </p>
      </section>

      {hasMalformedTemplateId && (
        <section role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          The selected notification-template ID is invalid. No detail request was sent.
          <div className="mt-3"><Button type="button" size="sm" variant="outline" onClick={clearTemplateSelection}>Clear selection</Button></div>
        </section>
      )}
      {exactTemplateQuery.isLoading && <LoadingState label="Loading selected notification template..." />}
      {exactTemplateQuery.isError && (
        <ErrorState
          title="Selected notification template could not be loaded"
          description={`${getErrorMessage(exactTemplateQuery.error)} The audit event still retains its recorded change; this table has no immutable version history under E66.`}
          action={<Button type="button" variant="outline" onClick={clearTemplateSelection}>Clear selection</Button>}
        />
      )}
      {exactTemplateQuery.data && (
        <TemplateEvidenceCard template={exactTemplateQuery.data} onClear={clearTemplateSelection} />
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter templates by type"
          className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] sm:w-auto"
        >
          <option value="">All Types</option>
          <option value="booking_update">Booking</option>
          <option value="payment">Payment</option>
          <option value="dispute_update">Dispute</option>
          <option value="tier_upgrade">Tier Upgrade</option>
          <option value="payout">Payout</option>
          <option value="referral">Referral</option>
          <option value="suki">Suki</option>
          <option value="promo">Promo</option>
          <option value="system">System</option>
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          aria-label="Filter templates by channel"
          className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] sm:w-auto"
        >
          <option value="">All stored channel markers</option>
          <option value="all">Legacy all marker</option>
          <option value="push">Push metadata</option>
          <option value="sms">SMS metadata</option>
          <option value="email">Email metadata</option>
          <option value="in_app">In-app metadata</option>
        </select>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-600 mb-4">{actionError}</p>}

      {isLoading ? (
        <LoadingState label="Loading notification templates…" />
      ) : isError ? (
        <ErrorState
          title="Notification templates could not be loaded"
          description={getErrorMessage(error)}
          action={<Button type="button" variant="outline" onClick={() => void refetch()}>Try again</Button>}
        />
      ) : (
        <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} emptyMessage="No templates match these filters." />
      )}

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      <Dialog open={Boolean(editing || creating)} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit notification template' : 'New notification template'}</DialogTitle>
            <DialogDescription>
              Preview the exact copy and verify the runtime boundary before saving. The slug becomes an immutable routing key after creation.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="template-slug" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">Slug *</label>
              <input
                id="template-slug"
                type="text"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                disabled={Boolean(editing)}
                aria-describedby="template-slug-help"
                placeholder="e.g. booking_confirmed"
                className="min-h-11 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
              />
              <p id="template-slug-help" className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {editing ? 'Routing keys cannot be renamed. Create a new slug if a workflow needs a different key.' : 'Use 3–100 lowercase letters, numbers, or underscores.'}
              </p>
            </div>

            <div className={`rounded-lg border p-3 ${connectedVariables ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className={`text-sm font-semibold ${connectedVariables ? 'text-emerald-950' : 'text-amber-950'}`}>
                {connectedVariables ? 'Connected to a live workflow' : 'Reference-only template'}
              </p>
              <p className={`mt-1 text-xs ${connectedVariables ? 'text-emerald-800' : 'text-amber-800'}`}>
                {connectedVariables
                  ? `This workflow can supply only: ${connectedVariables.map((value) => `{{${value}}}`).join(', ')}.`
                  : 'Saving this copy does not make it send. Engineering must explicitly connect this slug to a workflow.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="template-type" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">Type</label>
                <select
                  id="template-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                >
                  <option value="booking_update">Booking</option>
                  <option value="payment">Payment</option>
                  <option value="dispute_update">Dispute</option>
                  <option value="tier_upgrade">Tier Upgrade</option>
                  <option value="payout">Payout</option>
                  <option value="referral">Referral</option>
                  <option value="suki">Suki</option>
                  <option value="promo">Promo</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                {connectedChannels ? (
                  <>
                    <label htmlFor="template-runtime-channels" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">Runtime delivery channels</label>
                    <input
                      id="template-runtime-channels"
                      value={formatRuntimeChannels(connectedChannels)}
                      disabled
                      className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-slate-100 px-3 py-2 text-sm text-slate-700"
                    />
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Managed by the live workflow. SMS and email are not connected.</p>
                  </>
                ) : (
                  <>
                    <label htmlFor="template-channel" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">Stored channel metadata</label>
                    <select
                      id="template-channel"
                      value={formChannel}
                      onChange={(e) => setFormChannel(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                    >
                      <option value="all">Legacy all marker</option>
                      <option value="push">Push metadata</option>
                      <option value="sms">SMS metadata</option>
                      <option value="email">Email metadata</option>
                      <option value="in_app">In-app metadata</option>
                    </select>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Reference-only metadata does not activate a delivery channel.</p>
                  </>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="template-title" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">Title template *</label>
              <input
                id="template-title"
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Booking {{bookingId}} confirmed"
                className="min-h-11 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              />
            </div>

            <div>
              <label htmlFor="template-body" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">Body template *</label>
              <textarea
                id="template-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={4}
                placeholder="e.g. {{providerName}} has been assigned to booking {{bookingId}}."
                className="w-full resize-y rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Use {'{{variableName}}'} for dynamic content. Variables are derived automatically from this copy.
              </p>
            </div>

            {(placeholderState.malformed || unsupportedVariables.length > 0) && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {placeholderState.malformed
                  ? 'One or more placeholders are malformed.'
                  : `The connected workflow cannot supply: ${unsupportedVariables.map((value) => `{{${value}}}`).join(', ')}.`}
              </div>
            )}

            <section aria-label="Template preview" className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">Sample preview</h4>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Sample values only. Saving does not send a message.</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {placeholderState.variables.length === 0 ? (
                    <span className="text-xs text-slate-500">No variables</span>
                  ) : placeholderState.variables.map((variable) => (
                    <span key={variable} className="rounded bg-white px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200">
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-950">{renderPreview(formTitle, placeholderState.variables) || 'Notification title'}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{renderPreview(formBody, placeholderState.variables) || 'Notification body'}</p>
              </div>
            </section>

            <button
              type="button"
              onClick={() => setFormActive(!formActive)}
              aria-label={`Toggle template ${formActive ? 'inactive' : 'active'}`}
              aria-pressed={formActive}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
            >
              <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ${formActive ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${formActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
              <span>
                <span className="block text-sm font-medium text-[var(--color-text)]">{formActive ? 'Active' : 'Inactive'}</span>
                <span className="block text-xs text-[var(--color-text-secondary)]">
                  {connectedVariables ? 'Inactive connected templates use built-in fallback copy.' : 'Reference status only; no live workflow consumes this slug.'}
                </span>
              </span>
            </button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              type="button"
              onClick={() => void submitSave()}
              disabled={saveMutation.isPending || !formIsValid}
            >
              {saveMutation.isPending ? 'Saving…' : editing ? 'Update template' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {reasonDialog}
    </div>
  );
}

function TemplateEvidenceCard({ template, onClear }: { template: Template; onClear: () => void }): React.ReactElement {
  const runtimeChannels = template.runtimeChannels ?? runtimeChannelsFor(template.slug);
  const runtimeStatus = template.runtimeStatus === 'connected'
    ? template.isActive
      ? 'Active override; built-in fallback remains available'
      : 'Inactive; built-in fallback continues to send'
    : template.isActive
      ? 'Active catalog marker; no live workflow consumes it'
      : 'Inactive catalog marker; no live workflow consumes it';
  return (
    <section aria-label="Selected notification template record" className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Linked current record</p>
          <p className="mt-1 text-sm text-sky-950">
            This is the template’s current retained state, not an immutable historical version. Compare the Audit Log event for the values recorded when the change occurred.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>Clear selection</Button>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TemplateEvidenceField label="Template ID" value={template.id} mono />
        <TemplateEvidenceField label="Routing slug" value={template.slug} mono />
        <TemplateEvidenceField label="Runtime linkage" value={template.runtimeStatus === 'connected' ? 'Connected workflow' : 'Reference only'} />
        <TemplateEvidenceField label="Current delivery" value={runtimeChannels ? formatRuntimeChannels(runtimeChannels) : `Stored ${template.channel.replace(/_/g, ' ')} metadata only`} />
        <TemplateEvidenceField label="Current status" value={runtimeStatus} />
        <TemplateEvidenceField label="Type" value={template.type.replace(/_/g, ' ')} />
        <TemplateEvidenceField label="Current title" value={template.titleTemplate} />
        <TemplateEvidenceField label="Current body" value={<span className="whitespace-pre-wrap">{template.bodyTemplate}</span>} />
        <TemplateEvidenceField label="Placeholders" value={template.variables.length > 0 ? template.variables.map((value) => `{{${value}}}`).join(', ') : 'None'} mono />
        <TemplateEvidenceField label="Created" value={new Date(template.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} />
        <TemplateEvidenceField label="Last updated" value={new Date(template.updatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} />
      </dl>
    </section>
  );
}

function TemplateEvidenceField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-sky-700">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-slate-950 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
