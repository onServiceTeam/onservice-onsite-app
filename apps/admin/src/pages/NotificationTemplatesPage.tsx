import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface Template {
  id: string;
  slug: string;
  titleTemplate: string;
  bodyTemplate: string;
  type: string;
  channel: string;
  isActive: boolean;
  variables: string[];
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

export default function NotificationTemplatesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminTemplates', page, typeFilter, channelFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (typeFilter) params.type = typeFilter;
      if (channelFilter) params.channel = channelFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/notification-templates', { params });
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        slug: formSlug,
        titleTemplate: formTitle,
        bodyTemplate: formBody,
        type: formType,
        channel: formChannel,
        isActive: formActive,
      };
      if (editing) {
        await api.put(`/api/v1/admin/notification-templates/${editing.id}`, body);
      } else {
        await api.post('/api/v1/admin/notification-templates', body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
      closeModal();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/admin/notification-templates/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.put(`/api/v1/admin/notification-templates/${id}`, { isActive });
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
      header: 'Channel',
      render: (r) => (
        <Badge label={r.channel.replace(/_/g, ' ')} variant={CHANNEL_VARIANT[r.channel] ?? 'default'} />
      ),
    },
    {
      key: 'status',
      header: 'Active',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: r.id, isActive: !r.isActive }); }}
          aria-label={`Toggle template ${r.slug} ${r.isActive ? 'inactive' : 'active'}`}
          aria-pressed={r.isActive}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${r.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      ),
    },
    {
      key: 'variables',
      header: 'Variables',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.variables.slice(0, 3).map(v => (
            <span key={v} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{`{{${v}}}`}</span>
          ))}
          {r.variables.length > 3 && (
            <span className="text-[10px] text-slate-400">+{r.variables.length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(r); }}
            className="px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete template "${r.slug}"?`)) deleteMutation.mutate(r.id);
            }}
            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Notification Templates</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Manage push, SMS, and email notification templates
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
        >
          + New Template
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          aria-label="Filter templates by type"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
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
          onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
          aria-label="Filter templates by channel"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Channels</option>
          <option value="all">All (Multi-channel)</option>
          <option value="push">Push</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="in_app">In-App</option>
        </select>
      </div>

      {isError && <p className="text-sm text-red-600 mb-4">Failed to load templates. Please try again.</p>}
      {actionError && <p className="text-sm text-red-600 mb-4">{actionError}</p>}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No templates found." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}

      {(editing || creating) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              {editing ? 'Edit Template' : 'New Template'}
            </h3>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Slug *</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="e.g. booking_confirmed"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
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
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Channel</label>
                  <select
                    value={formChannel}
                    onChange={(e) => setFormChannel(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                  >
                    <option value="all">All Channels</option>
                    <option value="push">Push</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                    <option value="in_app">In-App</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Title Template *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Booking {{bookingId}} confirmed"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Body Template *</label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={4}
                  placeholder="e.g. Your booking has been confirmed. Provider {{providerName}} will arrive at {{scheduledTime}}."
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Use {'{{variableName}}'} for dynamic content.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  aria-label={`Toggle template ${formActive ? 'inactive' : 'active'}`}
                  aria-pressed={formActive}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${formActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-[var(--color-text)]">Active</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formSlug.trim() || !formTitle.trim() || !formBody.trim()}
                className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {saveMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
