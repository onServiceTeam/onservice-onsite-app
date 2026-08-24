/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 03 — Categorized Platform Settings UI.
 *
 * Talks to /api/v1/admin/settings:
 *   GET    /                          → { categories, settings: { [cat]: Setting[] } }
 *   GET    /:category                 → Setting[]
 *   PUT    /:key   { value, reason }  → Setting
 *   POST   /:key/reset                → Setting
 *   GET    /:key/history              → AuditRow[]
 *   POST   /cache/flush               → { ok }
 *
 * No emoji literals — all glyphs come from `@/components/icons`.
 */

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import {
  Coins,
  CreditCard,
  Wallet,
  X,
  Shield,
  Key,
  User,
  Lock,
  Zap,
  Save,
  RefreshCw,
  RotateCcw,
  History,
  Pencil,
  Settings,
  Check,
  AlertCircle,
  MapPin,
} from '@/components/icons';

interface PlatformSetting {
  id: string;
  category: string;
  subcategory: string | null;
  key: string;
  label: string;
  description: string | null;
  valueType: string;
  value: string;
  defaultValue: string;
  minValue: number | null;
  maxValue: number | null;
  allowedValues: string[] | null;
  unit: string | null;
  isSensitive: boolean;
  isDefault: boolean;
  requiresRestart: boolean;
  runtimeStatus: 'live' | 'held' | 'not_connected';
  runtimeLabel: string;
  runtimeSummary: string;
  editable: boolean;
  updatedAt: string;
}

interface CategoryEntry {
  category: string;
  count: number;
}

interface AuditEntry {
  id: string;
  setting_key: string;
  old_value: string | null;
  new_value: string;
  changed_by: string;
  change_reason: string | null;
  created_at: string;
}

const CATEGORY_META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  commissions: { label: 'Commissions',  Icon: Coins       },
  fees:        { label: 'Fees',         Icon: CreditCard  },
  escrow:      { label: 'Escrow',       Icon: Wallet      },
  cancellation:{ label: 'Cancellation', Icon: X           },
  protection:  { label: 'Protection',   Icon: Shield      },
  auth:        { label: 'Auth',         Icon: Key         },
  provider:    { label: 'Provider',     Icon: User        },
  security:    { label: 'Security',     Icon: Lock        },
  cache:       { label: 'Cache',        Icon: Zap         },
  dispatch:    { label: 'Dispatch & Map', Icon: MapPin     },
};

function metaFor(category: string): { label: string; Icon: React.ComponentType<{ className?: string }> } {
  return CATEGORY_META[category] ?? { label: category, Icon: Settings };
}

export default function SystemSettingsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  // Phase 200 fix — every mutation (PUT setting, reset, cache flush) is
  // super_admin-only on the server (settings.routes.ts). Pre-fix the
  // Edit/Reset/Flush controls rendered for any admin and always 403'd.
  // Gate them; plain admins keep read-only + change-history access.
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // BUG-PHASE75-01 fix — pre-fix the "Reset to default" button fired
  // resetMutation immediately on tap. These settings tune commissions,
  // escrow windows, fee caps — production money knobs. A misclick on
  // commission_rate_elite (currently 9% via admin override, default
  // 12%) silently rolls every elite provider to the default rate at
  // their next payout. Now: clicking Reset opens a confirmation modal
  // showing the current → default values + a reason field that maps
  // to admin_actions.reason for the audit trail. Same pattern as the
  // edit-value flow already uses (editReason).
  const [pendingReset, setPendingReset] = useState<PlatformSetting | null>(null);
  const [resetReason, setResetReason] = useState<string>('');

  const allQuery = useQuery<{
    categories: CategoryEntry[];
    settings: Record<string, PlatformSetting[]>;
  }>({
    queryKey: ['admin-settings-all'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/settings');
      return res.data.data;
    },
  });

  const categories = allQuery.data?.categories ?? [];
  const groupedSettings = allQuery.data?.settings ?? {};

  const requestedCategory = searchParams.get('category');
  const currentCategory = categories.some((entry) => entry.category === requestedCategory)
    ? requestedCategory
    : categories[0]?.category ?? null;
  const currentSettings = useMemo(
    () => (currentCategory ? groupedSettings[currentCategory] ?? [] : []),
    [currentCategory, groupedSettings],
  );

  const updateMutation = useMutation({
    mutationFn: async (input: { key: string; value: string; reason?: string }) => {
      const res = await api.put(`/api/v1/admin/settings/${input.key}`, {
        value: input.value,
        reason: input.reason ?? undefined,
      });
      return res.data.data as PlatformSetting;
    },
    onSuccess: (_data, variables) => {
      setBanner({ kind: 'ok', text: `Saved "${variables.key}".` });
      setEditingKey(null);
      setEditValue('');
      setEditReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-settings-all'] });
    },
    onError: (err) => {
      setBanner({ kind: 'err', text: getErrorMessage(err) });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (input: { key: string; reason?: string }) => {
      const res = await api.post(`/api/v1/admin/settings/${input.key}/reset`, {
        reason: input.reason ?? undefined,
      });
      return res.data.data as PlatformSetting;
    },
    onSuccess: (_data, input) => {
      setBanner({ kind: 'ok', text: `Reset "${input.key}" to default.` });
      setPendingReset(null);
      setResetReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-settings-all'] });
    },
    onError: (err) => {
      setBanner({ kind: 'err', text: getErrorMessage(err) });
    },
  });

  const cacheFlushMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/admin/settings/cache/flush');
      return res.data;
    },
    onSuccess: () => {
      setBanner({ kind: 'ok', text: 'Settings cache flushed.' });
      void queryClient.invalidateQueries({ queryKey: ['admin-settings-all'] });
    },
    onError: (err) => {
      setBanner({ kind: 'err', text: getErrorMessage(err) });
    },
  });

  const historyQuery = useQuery<AuditEntry[]>({
    queryKey: ['admin-settings-history', historyKey],
    enabled: historyKey !== null,
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/settings/${historyKey}/history`);
      return res.data.data;
    },
  });

  function startEdit(s: PlatformSetting): void {
    if (!s.editable) {
      setBanner({ kind: 'err', text: `${s.label} is read-only. ${s.runtimeSummary}` });
      return;
    }
    setEditingKey(s.key);
    setEditValue(s.value);
    setEditReason('');
    setBanner(null);
  }

  function cancelEdit(): void {
    setEditingKey(null);
    setEditValue('');
    setEditReason('');
  }

  function selectCategory(category: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('category', category);
      return params;
    });
    setHistoryKey(null);
    cancelEdit();
    setBanner(null);
  }

  function validateSettingValue(setting: PlatformSetting, value: string): string | null {
    if (!value) return 'Enter a value before saving.';
    if (setting.allowedValues && !setting.allowedValues.includes(value)) {
      return `Choose one of: ${setting.allowedValues.join(', ')}.`;
    }
    if (setting.valueType === 'number' || setting.valueType === 'integer' || setting.minValue !== null || setting.maxValue !== null) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return 'Enter a valid number.';
      if (setting.valueType === 'integer' && !Number.isInteger(numericValue)) return 'Enter a whole number.';
      if (setting.minValue !== null && numericValue < setting.minValue) return `Value must be at least ${setting.minValue}.`;
      if (setting.maxValue !== null && numericValue > setting.maxValue) return `Value must be at most ${setting.maxValue}.`;
    }
    return null;
  }

  function saveEdit(setting: PlatformSetting): void {
    if (!editingKey) return;
    const value = editValue.trim();
    const reason = editReason.trim();
    const validationError = validateSettingValue(setting, value);
    if (validationError) {
      setBanner({ kind: 'err', text: validationError });
      return;
    }
    if (reason.length < 10) {
      setBanner({ kind: 'err', text: 'Enter an audit reason with at least 10 characters.' });
      return;
    }
    if (!window.confirm(`Save ${setting.key} as ${value}?`)) return;
    updateMutation.mutate({ key: editingKey, value, reason });
  }

  function formatValue(s: PlatformSetting): string {
    if (s.isSensitive) return s.value;
    if (s.unit === '%') return `${s.value}%`;
    if (s.unit === 'centavos') {
      const pesos = Number(s.value) / 100;
      return `\u20B1${pesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    }
    if (s.unit) return `${s.value} ${s.unit}`;
    return s.value;
  }

  function renderValueEditor(s: PlatformSetting): React.ReactElement {
    const commonClass = 'w-full sm:w-52 px-2 py-1.5 border border-[var(--color-primary)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]';
    const ariaLabel = `Value for ${s.key}`;

    if (s.valueType === 'boolean') {
      return (
        <select
          id={`setting-value-${s.key}`}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          aria-label={ariaLabel}
          className={commonClass}
          autoFocus
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      );
    }

    if (s.allowedValues && s.allowedValues.length > 0) {
      return (
        <select
          id={`setting-value-${s.key}`}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          aria-label={ariaLabel}
          className={commonClass}
          autoFocus
        >
          {s.allowedValues.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      );
    }

    if (s.valueType === 'json') {
      return (
        <textarea
          id={`setting-value-${s.key}`}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          aria-label={ariaLabel}
          rows={5}
          className={`${commonClass} sm:w-96 font-mono`}
          autoFocus
        />
      );
    }

    const numeric = ['number', 'integer', 'percent', 'currency'].includes(s.valueType);
    return (
      <input
        id={`setting-value-${s.key}`}
        type={numeric ? 'number' : 'text'}
        min={numeric && s.minValue !== null ? s.minValue : undefined}
        max={numeric && s.maxValue !== null ? s.maxValue : undefined}
        step={s.valueType === 'integer' ? 1 : numeric ? 'any' : undefined}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        aria-label={ariaLabel}
        className={commonClass}
        autoFocus
      />
    );
  }

  if (allQuery.isLoading) {
    return <div className="p-6 text-[var(--color-text-secondary)]">Loading settings…</div>;
  }
  if (allQuery.isError) {
    return (
      <div className="p-6">
        <div role="alert" className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          Failed to load platform settings: {getErrorMessage(allQuery.error)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Settings className="w-6 h-6 text-[var(--color-primary)]" />
            Platform Settings
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Every control shows whether it is live, intentionally held, or not yet connected to authoritative runtime behavior.
          </p>
          {!isSuperAdmin && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
              You have read-only access. Editing, resetting, and flushing settings requires a super-admin account.
            </p>
          )}
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Flush the settings cache now?')) return;
              cacheFlushMutation.mutate();
            }}
            disabled={cacheFlushMutation.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-[var(--color-surface-hover)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] rounded border border-[var(--color-border)] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${cacheFlushMutation.isPending ? 'animate-spin' : ''}`} />
            Flush cache
          </button>
        )}
      </header>

      {banner && (
        <div
          className={`mb-4 rounded border p-3 text-sm flex items-center gap-2 ${
            banner.kind === 'ok'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role={banner.kind === 'err' ? 'alert' : 'status'}
        >
          {banner.kind === 'ok' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <nav className="col-span-12 md:col-span-3 lg:col-span-2">
          <ul className="space-y-1">
            {categories.map((c) => {
              const meta = metaFor(c.category);
              const Icon = meta.Icon;
              const active = c.category === currentCategory;
              return (
                <li key={c.category}>
                  <button
                    type="button"
                    onClick={() => selectCategory(c.category)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
                      active
                        ? 'bg-[var(--color-info-bg)] text-[var(--color-primary)] font-medium border border-[var(--color-secondary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1 text-left capitalize">{meta.label}</span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{c.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Settings panel */}
        <section className="col-span-12 md:col-span-9 lg:col-span-10">
          <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] overflow-hidden">
            <div className="bg-[var(--color-bg)] px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
              {currentCategory && React.createElement(metaFor(currentCategory).Icon, { className: 'w-4 h-4 text-[var(--color-text-secondary)]' })}
              <h2 className="font-semibold text-[var(--color-text)] capitalize">
                {currentCategory ? metaFor(currentCategory).label : 'Settings'}
              </h2>
            </div>

            {currentSettings.length === 0 ? (
              <div className="p-6 text-[var(--color-text-secondary)] text-sm">No settings in this category.</div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {currentSettings.map((s) => {
                  const isEditing = editingKey === s.key;
                  return (
                    <li key={s.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--color-text)] text-sm">{s.label}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] font-mono">{s.key}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                s.runtimeStatus === 'live'
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : s.runtimeStatus === 'held'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-slate-300 bg-slate-100 text-slate-700'
                              }`}
                            >
                              {s.runtimeLabel}
                            </span>
                            <span className="text-xs text-[var(--color-text-tertiary)]">{s.runtimeSummary}</span>
                          </div>
                          {s.description && (
                            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{s.description}</p>
                          )}
                          {(s.minValue !== null || s.maxValue !== null) && (
                            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                              Range: {s.minValue ?? '—'} – {s.maxValue ?? '—'}
                              {s.unit ? ` ${s.unit}` : ''}
                            </p>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <label htmlFor={`setting-value-${s.key}`} className="sr-only">Value for {s.key}</label>
                              {renderValueEditor(s)}
                              <button
                                type="button"
                                onClick={() => saveEdit(s)}
                                disabled={updateMutation.isPending}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--color-primary)] hover:opacity-90 text-white rounded text-sm disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-3 py-1 bg-[var(--color-surface-hover)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] rounded text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                            <input
                              id={`setting-reason-${s.key}`}
                              type="text"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              placeholder="Change reason (required, audited)"
                              aria-label={`Audit reason for ${s.key}`}
                              className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-xs sm:w-80"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-sm bg-[var(--color-surface-hover)] px-2 py-1 rounded">
                              {formatValue(s)}
                            </span>
                            {!s.isDefault && (
                              <span className="text-xs text-amber-600">customized</span>
                            )}
                            {isSuperAdmin && s.editable && (
                              <button
                                type="button"
                                onClick={() => startEdit(s)}
                                title="Edit"
                                aria-label={`Edit setting ${s.key}`}
                                className="p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setHistoryKey(historyKey === s.key ? null : s.key)}
                              title="History"
                              aria-label={`View change history for ${s.key}`}
                              className="p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && s.editable && (
                              <button
                                type="button"
                                disabled={s.isDefault || resetMutation.isPending}
                                onClick={() => { setPendingReset(s); setResetReason(''); }}
                                title="Reset to default"
                                aria-label={`Reset ${s.key} to default`}
                                className="p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded disabled:opacity-30 disabled:hover:bg-transparent"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {historyKey === s.key && (
                        <div className="mt-3 ml-4 border-l-2 border-[var(--color-border)] pl-3">
                          <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Recent changes</p>
                          {historyQuery.isLoading && (
                            <p className="text-xs text-[var(--color-text-secondary)]">Loading…</p>
                          )}
                          {historyQuery.data && historyQuery.data.length === 0 && (
                            <p className="text-xs text-[var(--color-text-secondary)]">No prior changes recorded.</p>
                          )}
                          {historyQuery.data && historyQuery.data.length > 0 && (
                            <ul className="space-y-1">
                              {historyQuery.data.slice(0, 10).map((h) => (
                                <li key={h.id} className="text-xs text-[var(--color-text-secondary)]">
                                  <span className="font-mono">{h.old_value ?? '∅'}</span>
                                  {' → '}
                                  <span className="font-mono">{h.new_value}</span>
                                  <span className="text-[var(--color-text-tertiary)]">
                                    {' · '}{new Date(h.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                                    {' · '}{h.change_reason ?? 'no reason'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* BUG-PHASE75-01 fix — confirm-reset modal */}
      {pendingReset && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
        >
          <div className="bg-[var(--color-surface)] rounded-lg max-w-md w-full p-5">
            <h3 id="reset-confirm-title" className="text-lg font-semibold text-[var(--color-text)] mb-1">
              Reset to default?
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              This will overwrite the current value of <code className="font-mono bg-[var(--color-surface-hover)] px-1 rounded">{pendingReset.key}</code> with its built-in default. {pendingReset.runtimeSummary}
            </p>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-3 mb-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Current</span>
                <span className="font-mono">{formatValue(pendingReset)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[var(--color-text-secondary)]">Default</span>
                <span className="font-mono">
                  {formatValue({ ...pendingReset, value: pendingReset.defaultValue })}
                </span>
              </div>
            </div>
            <label htmlFor="reset-reason" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Reason (audited)
            </label>
            <input
              id="reset-reason"
              type="text"
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
              placeholder="Why are you resetting this?"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded text-sm mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setPendingReset(null); setResetReason(''); }}
                disabled={resetMutation.isPending}
                className="px-3 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] rounded text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const reason = resetReason.trim();
                  if (reason.length < 10) {
                    setBanner({ kind: 'err', text: 'Enter a reset reason with at least 10 characters.' });
                    return;
                  }
                  if (!window.confirm(`Reset ${pendingReset.key} to its default value?`)) return;
                  resetMutation.mutate({ key: pendingReset.key, reason });
                }}
                disabled={resetMutation.isPending || resetReason.trim().length < 10}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Reset to default'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
