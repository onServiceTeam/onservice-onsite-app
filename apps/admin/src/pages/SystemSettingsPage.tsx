/**
 * System Settings operator workspace.
 *
 * Every row reports its real runtime relationship. A stored database value is
 * never presented as a live control unless an authoritative consumer has been
 * audited. Mutations are super-admin only, version checked, reasoned, and
 * reviewed before submission.
 */

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import {
  AlertCircle,
  Check,
  Coins,
  CreditCard,
  History,
  Key,
  Lock,
  MapPin,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  User,
  Wallet,
  X,
  Zap,
} from '@/components/icons';

type RuntimeStatus = 'live' | 'release_coupled' | 'held' | 'not_connected';

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
  runtimeStatus: RuntimeStatus;
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
  changed_by_name?: string | null;
  changed_by_email?: string | null;
  change_reason: string | null;
  created_at: string;
}

interface PendingSave {
  setting: PlatformSetting;
  value: string;
  reason: string;
}

type CategoryMeta = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  auth: { label: 'Authentication', Icon: Key },
  bir: { label: 'Tax identity', Icon: Shield },
  booking: { label: 'Booking controls', Icon: Settings },
  branding: { label: 'Brand system', Icon: Settings },
  cache: { label: 'Cache', Icon: Zap },
  cancellation: { label: 'Cancellation', Icon: X },
  catalog: { label: 'Business setup', Icon: Settings },
  commissions: { label: 'Commissions', Icon: Coins },
  compliance: { label: 'Compliance', Icon: Shield },
  dispatch: { label: 'Dispatch & map', Icon: MapPin },
  disputes: { label: 'Disputes', Icon: Shield },
  escrow: { label: 'Escrow', Icon: Wallet },
  feature_flags: { label: 'Launch flags', Icon: Shield },
  fees: { label: 'Fees', Icon: CreditCard },
  finance: { label: 'Finance', Icon: Wallet },
  fraud: { label: 'Fraud controls', Icon: Shield },
  loyalty: { label: 'Loyalty', Icon: User },
  marketing: { label: 'Marketing', Icon: User },
  matching: { label: 'Matching', Icon: User },
  provider: { label: 'Provider', Icon: User },
  security: { label: 'Security', Icon: Lock },
};

const STATUS_META: Record<RuntimeStatus, { label: string; classes: string }> = {
  live: {
    label: 'Live',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  release_coupled: {
    label: 'Release required',
    classes: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  held: {
    label: 'Launch hold',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  not_connected: {
    label: 'Not connected',
    classes: 'border-slate-300 bg-slate-100 text-slate-700',
  },
};

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function metaFor(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? { label: humanize(category), Icon: Settings };
}

function describeActor(entry: AuditEntry): string {
  return entry.changed_by_name
    || entry.changed_by_email
    || entry.changed_by;
}

const MARKETING_CHANNEL_SLUG = /^[a-z0-9_-]{1,40}$/;
const MATCHING_TIER_KEYS = ['founding', 'new', 'verified', 'pro', 'elite'] as const;
type MatchingTier = typeof MATCHING_TIER_KEYS[number];

function parseMarketingChannels(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function parseMatchingTierBonuses(value: string): Record<MatchingTier, number | null> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return Object.fromEntries(MATCHING_TIER_KEYS.map((tier) => [
      tier,
      typeof record[tier] === 'number' && Number.isFinite(record[tier])
        ? record[tier]
        : null,
    ])) as Record<MatchingTier, number | null>;
  } catch {
    return null;
  }
}

export default function SystemSettingsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [pendingReset, setPendingReset] = useState<PlatformSetting | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<RuntimeStatus | 'all'>('all');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const allQuery = useQuery<{
    categories: CategoryEntry[];
    settings: Record<string, PlatformSetting[]>;
  }>({
    queryKey: ['admin-settings-all'],
    queryFn: async () => {
      const response = await api.get('/api/v1/admin/settings');
      return response.data.data;
    },
  });

  const categories = allQuery.data?.categories ?? [];
  const groupedSettings = allQuery.data?.settings ?? {};
  const requestedCategory = searchParams.get('category');
  const currentCategory = categories.some((entry) => entry.category === requestedCategory)
    ? requestedCategory
    : categories[0]?.category ?? null;

  const allSettings = useMemo(
    () => Object.values(groupedSettings).flat(),
    [groupedSettings],
  );
  const statusCounts = useMemo(() => {
    const counts: Record<RuntimeStatus, number> = {
      live: 0,
      release_coupled: 0,
      held: 0,
      not_connected: 0,
    };
    for (const setting of allSettings) counts[setting.runtimeStatus] += 1;
    return counts;
  }, [allSettings]);

  const currentSettings = useMemo(() => {
    const source = currentCategory ? groupedSettings[currentCategory] ?? [] : [];
    const query = searchText.trim().toLowerCase();
    return source.filter((setting) => {
      if (statusFilter !== 'all' && setting.runtimeStatus !== statusFilter) return false;
      if (!query) return true;
      return [
        setting.label,
        setting.key,
        setting.description ?? '',
        setting.runtimeSummary,
        setting.subcategory ?? '',
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [currentCategory, groupedSettings, searchText, statusFilter]);

  const updateMutation = useMutation({
    mutationFn: async (input: {
      key: string;
      value: string;
      reason: string;
      expectedUpdatedAt: string;
    }) => {
      const response = await api.put(`/api/v1/admin/settings/${input.key}`, {
        value: input.value,
        reason: input.reason,
        expectedUpdatedAt: input.expectedUpdatedAt,
      });
      return response.data.data as PlatformSetting;
    },
    onSuccess: (_data, variables) => {
      setBanner({ kind: 'ok', text: `Saved “${variables.key}”. Runtime impact is shown on its control card.` });
      setPendingSave(null);
      setEditingKey(null);
      setEditValue('');
      setEditReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-settings-all'] });
      if (historyKey === variables.key) {
        void queryClient.invalidateQueries({ queryKey: ['admin-settings-history', variables.key] });
      }
    },
    onError: (error) => {
      setPendingSave(null);
      setBanner({ kind: 'err', text: getErrorMessage(error) });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (input: {
      key: string;
      reason: string;
      expectedUpdatedAt: string;
    }) => {
      const response = await api.post(`/api/v1/admin/settings/${input.key}/reset`, {
        reason: input.reason,
        expectedUpdatedAt: input.expectedUpdatedAt,
      });
      return response.data.data as PlatformSetting;
    },
    onSuccess: (_data, input) => {
      setBanner({ kind: 'ok', text: `Reset “${input.key}” to its approved default.` });
      setPendingReset(null);
      setResetReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-settings-all'] });
      if (historyKey === input.key) {
        void queryClient.invalidateQueries({ queryKey: ['admin-settings-history', input.key] });
      }
    },
    onError: (error) => {
      setBanner({ kind: 'err', text: getErrorMessage(error) });
    },
  });

  const historyQuery = useQuery<AuditEntry[]>({
    queryKey: ['admin-settings-history', historyKey],
    enabled: historyKey !== null,
    queryFn: async () => {
      const response = await api.get(`/api/v1/admin/settings/${historyKey}/history`);
      return response.data.data;
    },
  });

  function cancelEdit(): void {
    setEditingKey(null);
    setEditValue('');
    setEditReason('');
  }

  function selectCategory(category: string): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('category', category);
      return next;
    });
    setHistoryKey(null);
    cancelEdit();
    setBanner(null);
  }

  function startEdit(setting: PlatformSetting): void {
    if (!setting.editable) {
      setBanner({ kind: 'err', text: `${setting.label} is read-only. ${setting.runtimeSummary}` });
      return;
    }
    setEditingKey(setting.key);
    setEditValue(setting.isSensitive ? '' : setting.value);
    setEditReason('');
    setBanner(null);
  }

  function validateValue(setting: PlatformSetting, value: string): string | null {
    if (!value && setting.key !== 'map_tile_api_key') return 'Enter a value before continuing.';
    if (setting.allowedValues && !setting.allowedValues.includes(value)) {
      return `Choose one of: ${setting.allowedValues.join(', ')}.`;
    }
    if (setting.key === 'marketing_channels') {
      const channels = parseMarketingChannels(value);
      if (
        !channels
        || channels.length === 0
        || channels.length > 50
        || channels.some((channel) => !MARKETING_CHANNEL_SLUG.test(channel))
        || new Set(channels).size !== channels.length
      ) {
        return 'Use 1–50 unique lowercase channel slugs containing only letters, numbers, underscores, or hyphens.';
      }
    }
    if (setting.key === 'matching_tier_bonus') {
      const bonuses = parseMatchingTierBonuses(value);
      if (
        !bonuses
        || MATCHING_TIER_KEYS.some((tier) => bonuses[tier] === null)
        || Object.values(bonuses).some((bonus) => bonus === null || bonus < -5 || bonus > 5)
      ) {
        return 'Enter a ranking bonus from -5 to 5 for every provider tier.';
      }
    }
    if (setting.valueType === 'json') {
      try {
        JSON.parse(value);
      } catch {
        return 'Enter valid JSON before continuing.';
      }
    }
    if (
      ['number', 'integer', 'percent', 'currency'].includes(setting.valueType)
      || setting.minValue !== null
      || setting.maxValue !== null
    ) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return 'Enter a valid number.';
      if (setting.valueType === 'integer' && !Number.isInteger(numericValue)) {
        return 'Enter a whole number.';
      }
      if (setting.minValue !== null && numericValue < setting.minValue) {
        return `Value must be at least ${setting.minValue}.`;
      }
      if (setting.maxValue !== null && numericValue > setting.maxValue) {
        return `Value must be at most ${setting.maxValue}.`;
      }
    }
    return null;
  }

  function requestSave(setting: PlatformSetting): void {
    const value = editValue.trim();
    const reason = editReason.trim();
    const validationError = validateValue(setting, value);
    if (validationError) {
      setBanner({ kind: 'err', text: validationError });
      return;
    }
    if (reason.length < 10) {
      setBanner({ kind: 'err', text: 'Enter an audit reason with at least 10 characters.' });
      return;
    }
    if (reason.length > 500) {
      setBanner({ kind: 'err', text: 'The audit reason must be 500 characters or fewer.' });
      return;
    }
    setPendingSave({ setting, value, reason });
    setBanner(null);
  }

  function formatValue(setting: PlatformSetting, value = setting.value): string {
    if (setting.isSensitive) return '••••••';
    if (setting.key === 'marketing_channels') {
      const channels = parseMarketingChannels(value);
      if (channels) return channels.join(', ');
    }
    if (setting.key === 'matching_tier_bonus') {
      const bonuses = parseMatchingTierBonuses(value);
      if (bonuses) {
        return MATCHING_TIER_KEYS
          .map((tier) => `${humanize(tier)} ${bonuses[tier] ?? 'missing'}`)
          .join(' · ');
      }
    }
    if (setting.unit === '%') return `${value}%`;
    if (setting.unit === 'centavos') {
      const pesos = Number(value) / 100;
      return `₱${pesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    }
    if (setting.unit) return `${value} ${setting.unit}`;
    if (setting.valueType === 'boolean') return value === 'true' ? 'Enabled' : 'Disabled';
    return value || 'Not set';
  }

  function renderValueEditor(setting: PlatformSetting): React.ReactElement {
    const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] sm:w-72';
    const ariaLabel = `Value for ${setting.key}`;

    if (setting.valueType === 'boolean') {
      return (
        <select
          id={`setting-value-${setting.key}`}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          aria-label={ariaLabel}
          className={inputClass}
          autoFocus
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      );
    }

    if (setting.allowedValues && setting.allowedValues.length > 0) {
      return (
        <select
          id={`setting-value-${setting.key}`}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          aria-label={ariaLabel}
          className={inputClass}
          autoFocus
        >
          {setting.allowedValues.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      );
    }

    if (setting.key === 'marketing_channels') {
      const channels = parseMarketingChannels(editValue) ?? [];
      return (
        <div id={`setting-value-${setting.key}`} role="group" aria-label={ariaLabel} className="space-y-2">
          {channels.map((channel, index) => (
            <div key={`marketing-channel-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={channel}
                onChange={(event) => {
                  const next = [...channels];
                  next[index] = event.target.value.trim().toLowerCase();
                  setEditValue(JSON.stringify(next));
                }}
                aria-label={`Marketing channel ${index + 1}`}
                placeholder="example_channel"
                maxLength={40}
                className={inputClass}
                autoFocus={index === 0}
              />
              <button
                type="button"
                onClick={() => setEditValue(JSON.stringify(channels.filter((_, itemIndex) => itemIndex !== index)))}
                disabled={channels.length === 1}
                aria-label={`Remove marketing channel ${index + 1}`}
                className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEditValue(JSON.stringify([...channels, '']))}
            disabled={channels.length >= 50}
            className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] disabled:opacity-40"
          >
            Add marketing channel
          </button>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Lowercase slugs only. Campaign filters use this list immediately after save.
          </p>
        </div>
      );
    }

    if (setting.key === 'matching_tier_bonus') {
      const bonuses = parseMatchingTierBonuses(editValue)
        ?? Object.fromEntries(MATCHING_TIER_KEYS.map((tier) => [tier, null])) as Record<MatchingTier, number | null>;
      return (
        <fieldset id={`setting-value-${setting.key}`} aria-label={ariaLabel} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MATCHING_TIER_KEYS.map((tier) => (
            <label key={tier} className="text-xs font-semibold text-[var(--color-text-secondary)]">
              {humanize(tier)} tier bonus
              <input
                type="number"
                min={-5}
                max={5}
                step="0.05"
                value={bonuses[tier] ?? ''}
                onChange={(event) => {
                  const next = { ...bonuses, [tier]: event.target.value === '' ? null : Number(event.target.value) };
                  setEditValue(JSON.stringify(next));
                }}
                aria-label={`${humanize(tier)} tier bonus`}
                className={`${inputClass} mt-1 sm:w-full`}
                autoFocus={tier === 'founding'}
              />
            </label>
          ))}
          <p className="text-xs font-normal leading-5 text-[var(--color-text-secondary)] sm:col-span-2 xl:col-span-3">
            Higher values improve dispatch ranking for new matches only. Existing bookings are unchanged.
          </p>
        </fieldset>
      );
    }

    if (setting.valueType === 'json') {
      return (
        <textarea
          id={`setting-value-${setting.key}`}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          aria-label={ariaLabel}
          rows={7}
          className={`${inputClass} font-mono sm:w-[32rem]`}
          autoFocus
        />
      );
    }

    const numeric = ['number', 'integer', 'percent', 'currency'].includes(setting.valueType);
    return (
      <input
        id={`setting-value-${setting.key}`}
        type={setting.isSensitive ? 'password' : numeric ? 'number' : 'text'}
        min={numeric && setting.minValue !== null ? setting.minValue : undefined}
        max={numeric && setting.maxValue !== null ? setting.maxValue : undefined}
        step={setting.valueType === 'integer' ? 1 : numeric ? 'any' : undefined}
        value={editValue}
        onChange={(event) => setEditValue(event.target.value)}
        aria-label={ariaLabel}
        placeholder={setting.isSensitive ? 'Enter a replacement value' : undefined}
        autoComplete={setting.isSensitive ? 'new-password' : undefined}
        className={inputClass}
        autoFocus
      />
    );
  }

  if (allQuery.isLoading) {
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6" aria-label="Loading system settings">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-slate-100" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="mt-6 h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (allQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          <h1 className="text-lg font-semibold">System Settings could not load</h1>
          <p className="mt-1 text-sm">{getErrorMessage(allQuery.error)}</p>
          <button
            type="button"
            onClick={() => void allQuery.refetch()}
            className="mt-4 min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-info-bg)] text-[var(--color-primary)]">
              <Settings className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                Operator control plane
              </p>
              <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
                System Settings
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            Review what each value controls before changing it. Live controls affect new operations after cache refresh;
            launch-held controls cannot be edited; release-required controls need coordinated deployment.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text-secondary)] lg:max-w-sm">
          <p className="font-medium text-[var(--color-text)]">
            {isSuperAdmin ? 'Super-admin change access' : 'Read-only operator access'}
          </p>
          <p className="mt-1 text-xs leading-5">
            {isSuperAdmin
              ? 'Every save requires a reason and a final impact review. Concurrent changes are rejected.'
              : 'You can inspect values and history. Money, policy, and security changes require a super-admin.'}
          </p>
        </div>
      </header>

      <section aria-label="Runtime control summary" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(STATUS_META) as RuntimeStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter((current) => current === status ? 'all' : status)}
            aria-pressed={statusFilter === status}
            className={`min-h-24 rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${STATUS_META[status].classes} ${statusFilter === status ? 'ring-2 ring-[var(--color-primary)] ring-offset-2' : ''}`}
          >
            <span className="text-2xl font-semibold">{statusCounts[status]}</span>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-wide">
              {STATUS_META[status].label}
            </span>
          </button>
        ))}
      </section>

      {banner && (
        <div
          role={banner.kind === 'err' ? 'alert' : 'status'}
          className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${banner.kind === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {banner.kind === 'ok'
            ? <Check className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-12 gap-5">
        <nav aria-label="Settings categories" className="col-span-12 lg:col-span-3 xl:col-span-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
            <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Categories
            </p>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {categories.map((entry) => {
                const meta = metaFor(entry.category);
                const Icon = meta.Icon;
                const active = entry.category === currentCategory;
                return (
                  <li key={entry.category}>
                    <button
                      type="button"
                      onClick={() => selectCategory(entry.category)}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${active
                        ? 'border-[var(--color-secondary)] bg-[var(--color-info-bg)] font-medium text-[var(--color-primary)]'
                        : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]'}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{meta.label}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)]">{entry.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <section className="col-span-12 lg:col-span-9 xl:col-span-10">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2">
                  {currentCategory && React.createElement(metaFor(currentCategory).Icon, {
                    className: 'h-5 w-5 text-[var(--color-primary)]',
                  })}
                  <div>
                    <h2 className="font-semibold text-[var(--color-text)]">
                      {currentCategory ? metaFor(currentCategory).label : 'Settings'}
                    </h2>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {currentSettings.length} visible of {currentCategory ? groupedSettings[currentCategory]?.length ?? 0 : 0}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative block">
                    <span className="sr-only">Search current settings category</span>
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--color-text-tertiary)]" />
                    <input
                      type="search"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Search label, key, or impact"
                      className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm sm:w-72"
                    />
                  </label>
                  <select
                    aria-label="Filter settings by runtime status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as RuntimeStatus | 'all')}
                    className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
                  >
                    <option value="all">All runtime states</option>
                    {(Object.keys(STATUS_META) as RuntimeStatus[]).map((status) => (
                      <option key={status} value={status}>{STATUS_META[status].label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {currentSettings.length === 0 ? (
              <div className="p-8 text-center">
                <Settings className="mx-auto h-7 w-7 text-[var(--color-text-tertiary)]" />
                <p className="mt-2 font-medium text-[var(--color-text)]">No controls match this view</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Clear the search or runtime-state filter to see this category.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {currentSettings.map((setting) => {
                  const isEditing = editingKey === setting.key;
                  return (
                    <li key={setting.id} className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-[var(--color-text)]">{setting.label}</h3>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[setting.runtimeStatus].classes}`}>
                              {setting.runtimeLabel}
                            </span>
                            {!setting.isDefault && (
                              <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-800">
                                Customized
                              </span>
                            )}
                            {setting.requiresRestart && (
                              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                                Restart required
                              </span>
                            )}
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-[var(--color-text-tertiary)]">{setting.key}</p>
                          {setting.description && (
                            <p className="mt-2 text-sm leading-5 text-[var(--color-text-secondary)]">{setting.description}</p>
                          )}
                          <div className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${STATUS_META[setting.runtimeStatus].classes}`}>
                            <span className="font-semibold">Operational effect: </span>
                            {setting.runtimeSummary}
                          </div>
                          {(setting.minValue !== null || setting.maxValue !== null) && (
                            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                              Allowed range: {setting.minValue ?? 'no minimum'} to {setting.maxValue ?? 'no maximum'}
                              {setting.unit ? ` ${setting.unit}` : ''}
                            </p>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="w-full rounded-xl border border-[var(--color-primary)] bg-[var(--color-info-bg)] p-3 xl:max-w-2xl">
                            <label htmlFor={`setting-value-${setting.key}`} className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">
                              New value
                            </label>
                            {renderValueEditor(setting)}
                            {setting.isSensitive && (
                              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                                The stored secret is never returned. Enter a complete replacement value.
                              </p>
                            )}
                            <label htmlFor={`setting-reason-${setting.key}`} className="mb-1 mt-3 block text-xs font-semibold text-[var(--color-text-secondary)]">
                              Audit reason
                            </label>
                            <textarea
                              id={`setting-reason-${setting.key}`}
                              value={editReason}
                              onChange={(event) => setEditReason(event.target.value)}
                              placeholder="Explain the business reason and intended effect"
                              aria-label={`Audit reason for ${setting.key}`}
                              rows={3}
                              maxLength={500}
                              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                            />
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => requestSave(setting)}
                                disabled={updateMutation.isPending}
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                              >
                                <Save className="h-4 w-4" />
                                Review change
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:max-w-sm xl:justify-end">
                            <span className="min-h-11 min-w-28 rounded-lg bg-[var(--color-surface-hover)] px-3 py-2.5 text-right font-mono text-sm text-[var(--color-text)]">
                              {formatValue(setting)}
                            </span>
                            {isSuperAdmin && setting.editable && (
                              <button
                                type="button"
                                onClick={() => startEdit(setting)}
                                aria-label={`Edit setting ${setting.key}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setHistoryKey(historyKey === setting.key ? null : setting.key)}
                              aria-label={`View change history for ${setting.key}`}
                              aria-expanded={historyKey === setting.key}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            {isSuperAdmin && setting.editable && (
                              <button
                                type="button"
                                disabled={setting.isDefault || resetMutation.isPending}
                                onClick={() => {
                                  setPendingReset(setting);
                                  setResetReason('');
                                  setBanner(null);
                                }}
                                aria-label={`Reset ${setting.key} to default`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {historyKey === setting.key && (
                        <section aria-label={`Change history for ${setting.key}`} className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-[var(--color-text)]">Recent changes</h4>
                            <span className="text-xs text-[var(--color-text-tertiary)]">Manila time</span>
                          </div>
                          {historyQuery.isLoading && (
                            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Loading change history…</p>
                          )}
                          {historyQuery.isError && (
                            <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                              <span>History could not load: {getErrorMessage(historyQuery.error)}</span>
                              <button
                                type="button"
                                onClick={() => void historyQuery.refetch()}
                                className="min-h-11 rounded-lg border border-red-300 px-3 py-2 font-medium"
                              >
                                Try again
                              </button>
                            </div>
                          )}
                          {historyQuery.data?.length === 0 && (
                            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">No prior changes are recorded.</p>
                          )}
                          {historyQuery.data && historyQuery.data.length > 0 && (
                            <ol className="mt-3 space-y-3">
                              {historyQuery.data.slice(0, 10).map((entry) => (
                                <li key={entry.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
                                  <div className="flex flex-wrap items-center gap-1 text-[var(--color-text-secondary)]">
                                    <span className="font-mono text-[var(--color-text)]">{entry.old_value ?? 'No prior value'}</span>
                                    <span aria-hidden="true">→</span>
                                    <span className="font-mono text-[var(--color-text)]">{entry.new_value}</span>
                                  </div>
                                  <p className="mt-1 font-medium text-[var(--color-text)]">
                                    {entry.change_reason ?? 'Legacy change without a recorded reason'}
                                  </p>
                                  <p className="mt-1 text-[var(--color-text-tertiary)]">
                                    {describeActor(entry)} · {new Date(entry.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                                  </p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </section>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {pendingSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-review-title"
            className="w-full max-w-lg rounded-2xl bg-[var(--color-surface)] p-5 shadow-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">Final review</p>
            <h2 id="save-review-title" className="mt-1 text-xl font-semibold text-[var(--color-text)]">
              Confirm this setting change
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              A stale browser version will be rejected. This action is stored with your identity, reason, network address, and browser details.
            </p>
            <dl className="mt-4 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4">
              <div className="py-3">
                <dt className="text-xs text-[var(--color-text-tertiary)]">Control</dt>
                <dd className="mt-1 font-medium text-[var(--color-text)]">{pendingSave.setting.label}</dd>
                <dd className="font-mono text-xs text-[var(--color-text-secondary)]">{pendingSave.setting.key}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4 py-3">
                <div>
                  <dt className="text-xs text-[var(--color-text-tertiary)]">Current</dt>
                  <dd className="mt-1 break-all font-mono text-sm">{formatValue(pendingSave.setting)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-text-tertiary)]">Proposed</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {pendingSave.setting.isSensitive ? 'New secret value' : formatValue(pendingSave.setting, pendingSave.value)}
                  </dd>
                </div>
              </div>
              <div className="py-3">
                <dt className="text-xs text-[var(--color-text-tertiary)]">Operational effect</dt>
                <dd className="mt-1 text-sm leading-5 text-[var(--color-text)]">{pendingSave.setting.runtimeSummary}</dd>
              </div>
              <div className="py-3">
                <dt className="text-xs text-[var(--color-text-tertiary)]">Audit reason</dt>
                <dd className="mt-1 text-sm text-[var(--color-text)]">{pendingSave.reason}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingSave(null)}
                disabled={updateMutation.isPending}
                className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)]"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate({
                  key: pendingSave.setting.key,
                  value: pendingSave.value,
                  reason: pendingSave.reason,
                  expectedUpdatedAt: pendingSave.setting.updatedAt,
                })}
                disabled={updateMutation.isPending}
                className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving…' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
            className="w-full max-w-lg rounded-2xl bg-[var(--color-surface)] p-5 shadow-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Destructive configuration action</p>
            <h2 id="reset-confirm-title" className="mt-1 text-xl font-semibold text-[var(--color-text)]">
              Reset to the approved default?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              This replaces the current value of <code className="font-mono">{pendingReset.key}</code>. {pendingReset.runtimeSummary}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm">
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Current</p>
                <p className="mt-1 break-all font-mono">{formatValue(pendingReset)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Default</p>
                <p className="mt-1 break-all font-mono">{formatValue(pendingReset, pendingReset.defaultValue)}</p>
              </div>
            </div>
            <label htmlFor="reset-reason" className="mb-1 mt-4 block text-xs font-semibold text-[var(--color-text-secondary)]">
              Audit reason
            </label>
            <textarea
              id="reset-reason"
              value={resetReason}
              onChange={(event) => setResetReason(event.target.value)}
              placeholder="Explain why the approved default should be restored"
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              autoFocus
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingReset(null);
                  setResetReason('');
                }}
                disabled={resetMutation.isPending}
                className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)]"
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
                  resetMutation.mutate({
                    key: pendingReset.key,
                    reason,
                    expectedUpdatedAt: pendingReset.updatedAt,
                  });
                }}
                disabled={resetMutation.isPending || resetReason.trim().length < 10}
                className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Confirm reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
