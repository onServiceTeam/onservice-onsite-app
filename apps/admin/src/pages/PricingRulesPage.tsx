import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import {
  Badge,
  Pagination,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Input,
  Textarea,
} from '@/components/ui';
import { TrendingUp } from '@/components/icons';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PricingRule {
  id: string;
  name: string;
  type: 'rush' | 'holiday' | 'peak_hours';
  multiplier: number;
  rushHoursThreshold: number | null;
  holidayDate: string | null;
  peakStartTime: string | null;
  peakEndTime: string | null;
  peakDaysOfWeek: number[] | null;
  categoryId: string | null;
  serviceAreaId: string | null;
  isActive: boolean;
  priority: number;
  platformSurgeShare: number;
  description: string;
  createdAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: PricingRule[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const TYPE_VARIANT: Record<string, 'warning' | 'danger' | 'info'> = {
  rush: 'warning',
  holiday: 'danger',
  peak_hours: 'info',
};

const TYPE_LABELS: Record<string, string> = {
  rush: 'Rush',
  holiday: 'Holiday',
  peak_hours: 'Peak Hours',
};

function formatMultiplier(m: number): string {
  return `×${m.toFixed(2)}`;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  return `${start} – ${end}`;
}

function formatDays(days: number[] | null): string {
  if (!days || days.length === 0) return 'All days';
  return days.map((d) => DAY_NAMES[d] ?? d).join(', ');
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const EMPTY_FORM = {
  name: '',
  type: 'rush' as 'rush' | 'holiday' | 'peak_hours',
  multiplier: '1.50',
  rushHoursThreshold: '',
  holidayDate: '',
  peakStartTime: '',
  peakEndTime: '',
  peakDaysOfWeek: [] as number[],
  priority: '0',
  platformSurgeShare: '0.5',
  description: '',
};

export default function PricingRulesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PricingRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminPricingRules', page, typeFilter, activeFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        pageSize: adminConfig.defaultPageSize,
      };
      if (typeFilter) params.type = typeFilter;
      if (activeFilter) params.isActive = activeFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/pricing-rules', { params });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const multiplier = Number(form.multiplier);
      if (!form.name.trim()) throw new Error('Name is required.');
      if (isNaN(multiplier) || multiplier < 1 || multiplier > 5) {
        throw new Error('Multiplier must be between 1.0 and 5.0.');
      }

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        multiplier,
        priority: Number(form.priority) || 0,
        platformSurgeShare: Number(form.platformSurgeShare) || 0.5,
        description: form.description.trim(),
      };

      if (form.type === 'rush') {
        if (!form.rushHoursThreshold) throw new Error('Rush hours threshold is required.');
        body.rushHoursThreshold = Number(form.rushHoursThreshold);
      } else if (form.type === 'holiday') {
        if (!form.holidayDate) throw new Error('Holiday date is required.');
        body.holidayDate = form.holidayDate;
      } else if (form.type === 'peak_hours') {
        if (!form.peakStartTime || !form.peakEndTime) {
          throw new Error('Peak start and end time are required.');
        }
        body.peakStartTime = form.peakStartTime;
        body.peakEndTime = form.peakEndTime;
        if (form.peakDaysOfWeek.length > 0) body.peakDaysOfWeek = form.peakDaysOfWeek;
      }

      await api.post('/api/v1/admin/pricing-rules', body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPricingRules'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setActionError('');
    },
    onError: (e) => { setActionError(getErrorMessage(e)); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      await api.patch(`/api/v1/admin/pricing-rules/${id}`, updates);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPricingRules'] });
      setEditing(null);
      setForm(EMPTY_FORM);
      setActionError('');
    },
    onError: (e) => { setActionError(getErrorMessage(e)); },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.post(`/api/v1/admin/pricing-rules/${id}/toggle`, { isActive });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPricingRules'] });
      setActionError('');
    },
    onError: (e) => { setActionError(getErrorMessage(e)); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/admin/pricing-rules/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPricingRules'] });
      setActionError('');
    },
    onError: (e) => { setActionError(getErrorMessage(e)); },
  });

  const openCreate = (): void => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowCreate(true);
    setActionError('');
  };

  const validateForm = (): string | null => {
    const multiplier = Number(form.multiplier);
    const priority = Number(form.priority);
    const platformSurgeShare = Number(form.platformSurgeShare);

    if (!form.name.trim()) return 'Rule name is required.';
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) {
      return 'Multiplier must be between 1.0 and 5.0.';
    }
    if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
      return 'Priority must be between 0 and 100.';
    }
    if (!Number.isFinite(platformSurgeShare) || platformSurgeShare < 0 || platformSurgeShare > 1) {
      return 'Platform surge share must be between 0 and 1.';
    }

    if (form.type === 'rush') {
      const rushHoursThreshold = Number(form.rushHoursThreshold);
      if (!Number.isFinite(rushHoursThreshold) || rushHoursThreshold < 1 || rushHoursThreshold > 72) {
        return 'Rush threshold must be between 1 and 72 hours.';
      }
    }
    if (form.type === 'holiday' && !form.holidayDate) {
      return 'Holiday date is required.';
    }
    if (form.type === 'peak_hours') {
      if (!form.peakStartTime || !form.peakEndTime) return 'Peak start and end time are required.';
      if (form.peakStartTime >= form.peakEndTime) return 'Peak start time must be before end time.';
    }

    return null;
  };

  const openEdit = (rule: PricingRule): void => {
    setShowCreate(false);
    setEditing(rule);
    setForm({
      name: rule.name,
      type: rule.type,
      multiplier: String(rule.multiplier),
      rushHoursThreshold: rule.rushHoursThreshold != null ? String(rule.rushHoursThreshold) : '',
      holidayDate: rule.holidayDate ?? '',
      peakStartTime: rule.peakStartTime ?? '',
      peakEndTime: rule.peakEndTime ?? '',
      peakDaysOfWeek: rule.peakDaysOfWeek ?? [],
      priority: String(rule.priority),
      platformSurgeShare: String(rule.platformSurgeShare),
      description: rule.description,
    });
    setActionError('');
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setActionError(validationError);
      return;
    }
    setActionError('');
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        updates: {
          name: form.name.trim(),
          multiplier: Number(form.multiplier),
          rushHoursThreshold: form.rushHoursThreshold ? Number(form.rushHoursThreshold) : undefined,
          holidayDate: form.holidayDate || undefined,
          peakStartTime: form.peakStartTime || undefined,
          peakEndTime: form.peakEndTime || undefined,
          peakDaysOfWeek: form.peakDaysOfWeek.length > 0 ? form.peakDaysOfWeek : undefined,
          priority: Number(form.priority),
          platformSurgeShare: Number(form.platformSurgeShare),
          description: form.description.trim(),
        },
      });
    } else {
      createMutation.mutate();
    }
  };

  const toggleDay = (day: number): void => {
    setForm((prev) => ({
      ...prev,
      peakDaysOfWeek: prev.peakDaysOfWeek.includes(day)
        ? prev.peakDaysOfWeek.filter((d) => d !== day)
        : [...prev.peakDaysOfWeek, day],
    }));
  };

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending;

  const rules = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Pricing Rules</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Manage surge pricing multipliers for rush hours, holidays, and peak periods.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          + New Rule
        </button>
      </div>

      {/* Error banner */}
      {actionError && !showCreate && !editing && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          aria-label="Filter pricing rules by type"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white"
        >
          <option value="">All Types</option>
          <option value="rush">Rush</option>
          <option value="holiday">Holiday</option>
          <option value="peak_hours">Peak Hours</option>
        </select>
        <select
          aria-label="Filter pricing rules by status"
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editing) && (
        <div className="bg-white border border-[var(--color-border)] rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
            {editing ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
          </h2>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="pr-name" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Rule name
                </Label>
                <Input
                  id="pr-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Weekend Evening Surge"
                  required
                />
              </div>

              {!editing && (
                <div>
                  <Label htmlFor="pr-type" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                    Type
                  </Label>
                  <select
                    id="pr-type"
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as typeof p.type }))}
                    className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="rush">Rush (booking close to now)</option>
                    <option value="holiday">Holiday (specific date)</option>
                    <option value="peak_hours">Peak Hours (time of day)</option>
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="pr-multiplier" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Multiplier (1.0 – 5.0)
                </Label>
                <Input
                  id="pr-multiplier"
                  type="number"
                  min="1.0"
                  max="5.0"
                  step="0.05"
                  value={form.multiplier}
                  onChange={(e) => setForm((p) => ({ ...p, multiplier: e.target.value }))}
                  required
                />
              </div>

              {/* Rush-specific */}
              {form.type === 'rush' && (
                <div>
                  <Label htmlFor="pr-rush-threshold" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                    Rush threshold (hours before service)
                  </Label>
                  <Input
                    id="pr-rush-threshold"
                    type="number"
                    min="1"
                    max="72"
                    value={form.rushHoursThreshold}
                    onChange={(e) => setForm((p) => ({ ...p, rushHoursThreshold: e.target.value }))}
                    placeholder="e.g. 3"
                  />
                </div>
              )}

              {/* Holiday-specific */}
              {form.type === 'holiday' && (
                <div>
                  <Label htmlFor="pr-holiday-date" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                    Holiday date
                  </Label>
                  <Input
                    id="pr-holiday-date"
                    type="date"
                    value={form.holidayDate}
                    onChange={(e) => setForm((p) => ({ ...p, holidayDate: e.target.value }))}
                  />
                </div>
              )}

              {/* Peak-hours-specific */}
              {form.type === 'peak_hours' && (
                <>
                  <div>
                    <Label htmlFor="pr-peak-start" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                      Peak start time
                    </Label>
                    <Input
                      id="pr-peak-start"
                      type="time"
                      value={form.peakStartTime}
                      onChange={(e) => setForm((p) => ({ ...p, peakStartTime: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pr-peak-end" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                      Peak end time
                    </Label>
                    <Input
                      id="pr-peak-end"
                      type="time"
                      value={form.peakEndTime}
                      onChange={(e) => setForm((p) => ({ ...p, peakEndTime: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                      Days of week (leave empty for all days)
                    </Label>
                    <div className="flex gap-2 flex-wrap">
                      {DAY_NAMES.map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(i)}
                          aria-pressed={form.peakDaysOfWeek.includes(i)}
                          aria-label={`${form.peakDaysOfWeek.includes(i) ? 'Remove' : 'Add'} ${day} peak day`}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            form.peakDaysOfWeek.includes(i)
                              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                              : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="pr-priority" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Priority (higher = applied first)
                </Label>
                <Input
                  id="pr-priority"
                  type="number"
                  min="0"
                  max="100"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="pr-platform-share" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Platform surge share (0–1)
                </Label>
                <Input
                  id="pr-platform-share"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={form.platformSurgeShare}
                  onChange={(e) => setForm((p) => ({ ...p, platformSurgeShare: e.target.value }))}
                  placeholder="0.5 = 50% to platform"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="pr-description" className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Description
                </Label>
                <Textarea
                  id="pr-description"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Internal notes about this pricing rule"
                />
              </div>
            </div>

            {actionError && (
              <p role="alert" className="text-red-600 text-sm">{actionError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditing(null); setForm(EMPTY_FORM); }}
                className="px-4 py-2 border border-[var(--color-border)] text-sm rounded-lg hover:bg-gray-50"
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed"
              >
                {isBusy ? 'Saving…' : editing ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to load pricing rules.
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-text-secondary)]">
          <TrendingUp size={40} className="mx-auto mb-3 text-slate-400" />
          <p className="font-medium">No pricing rules yet.</p>
          <p className="text-sm mt-1">Create one to enable surge pricing for rush hours, holidays, or peak periods.</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Multiplier</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Details</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Priority</th>
                {/* BUG-PHASE40-02 fix — platformSurgeShare controls how
                    surge revenue splits between platform and provider
                    and is editable in the form, but was never visible
                    in the table. Admin had to open each rule to see
                    it. Money-flow setting deserves a column. */}
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Platform share</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--color-text)]">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-[var(--color-text)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--color-text)]">{rule.name}</p>
                    {rule.description && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 max-w-xs truncate">
                        {rule.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={TYPE_LABELS[rule.type] ?? rule.type}
                      variant={TYPE_VARIANT[rule.type] ?? 'default'}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--color-text)]">
                    {formatMultiplier(rule.multiplier)}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                    {rule.type === 'rush' && rule.rushHoursThreshold != null && (
                      <span>Within {rule.rushHoursThreshold}h of booking</span>
                    )}
                    {rule.type === 'holiday' && rule.holidayDate && (
                      <span>{formatDateOnly(rule.holidayDate)}</span>
                    )}
                    {rule.type === 'peak_hours' && (
                      <div>
                        <div>{formatTimeRange(rule.peakStartTime, rule.peakEndTime)}</div>
                        <div>{formatDays(rule.peakDaysOfWeek)}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {rule.priority}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {Math.round(rule.platformSurgeShare * 100)}%
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={rule.isActive ? 'Active' : 'Inactive'}
                      variant={rule.isActive ? 'success' : 'default'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(rule)}
                        aria-label={`Edit pricing rule ${rule.name}`}
                        className="text-xs px-2.5 py-1 border border-[var(--color-border)] rounded-md hover:bg-gray-50 text-[var(--color-text-secondary)]"
                        disabled={isBusy}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          const action = rule.isActive ? 'Disable' : 'Enable';
                          if (window.confirm(`${action} pricing rule "${rule.name}"?`)) {
                            toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive });
                          }
                        }}
                        aria-label={`${rule.isActive ? 'Disable' : 'Enable'} pricing rule ${rule.name}`}
                        className={`text-xs px-2.5 py-1 border rounded-md disabled:opacity-50 ${
                          rule.isActive
                            ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}
                        disabled={isBusy}
                      >
                        {rule.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(rule); }}
                        aria-label={`Delete pricing rule ${rule.name}`}
                        className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          pageSize={data.pagination.pageSize}
          onPageChange={setPage}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete pricing rule</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Delete rule “${deleteTarget.name}”? This cannot be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSettled: () => setDeleteTarget(null),
                  });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
