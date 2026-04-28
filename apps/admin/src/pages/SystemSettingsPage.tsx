/**
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
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
};

function metaFor(category: string): { label: string; Icon: React.ComponentType<{ className?: string }> } {
  return CATEGORY_META[category] ?? { label: category, Icon: Settings };
}

export default function SystemSettingsPage(): React.ReactElement {
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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

  const currentCategory = activeCategory ?? categories[0]?.category ?? null;
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
    mutationFn: async (key: string) => {
      const res = await api.post(`/api/v1/admin/settings/${key}/reset`);
      return res.data.data as PlatformSetting;
    },
    onSuccess: (_data, key) => {
      setBanner({ kind: 'ok', text: `Reset "${key}" to default.` });
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

  function saveEdit(): void {
    if (!editingKey) return;
    updateMutation.mutate({ key: editingKey, value: editValue, reason: editReason || undefined });
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

  if (allQuery.isLoading) {
    return <div className="p-6 text-gray-600">Loading settings…</div>;
  }
  if (allQuery.isError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          Failed to load platform settings: {getErrorMessage(allQuery.error)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-600" />
            Platform Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tune commissions, fees, and runtime knobs. Changes take effect within 60 seconds (cache TTL).
          </p>
        </div>
        <button
          type="button"
          onClick={() => cacheFlushMutation.mutate()}
          disabled={cacheFlushMutation.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${cacheFlushMutation.isPending ? 'animate-spin' : ''}`} />
          Flush cache
        </button>
      </header>

      {banner && (
        <div
          className={`mb-4 rounded border p-3 text-sm flex items-center gap-2 ${
            banner.kind === 'ok'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
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
                    onClick={() => { setActiveCategory(c.category); setHistoryKey(null); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                        : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1 text-left capitalize">{meta.label}</span>
                    <span className="text-xs text-gray-400">{c.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Settings panel */}
        <section className="col-span-12 md:col-span-9 lg:col-span-10">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
              {currentCategory && React.createElement(metaFor(currentCategory).Icon, { className: 'w-4 h-4 text-gray-500' })}
              <h2 className="font-semibold text-gray-800 capitalize">
                {currentCategory ? metaFor(currentCategory).label : 'Settings'}
              </h2>
            </div>

            {currentSettings.length === 0 ? (
              <div className="p-6 text-gray-500 text-sm">No settings in this category.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {currentSettings.map((s) => {
                  const isEditing = editingKey === s.key;
                  return (
                    <li key={s.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{s.label}</p>
                          <p className="text-xs text-gray-500 font-mono">{s.key}</p>
                          {s.description && (
                            <p className="text-xs text-gray-500 mt-1">{s.description}</p>
                          )}
                          {(s.minValue !== null || s.maxValue !== null) && (
                            <p className="text-xs text-gray-400 mt-1">
                              Range: {s.minValue ?? '—'} – {s.maxValue ?? '—'}
                              {s.unit ? ` ${s.unit}` : ''}
                            </p>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-40 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={updateMutation.isPending}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                            <input
                              type="text"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              placeholder="Change reason (optional, audited)"
                              className="w-72 px-2 py-1 border border-gray-200 rounded text-xs"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                              {formatValue(s)}
                            </span>
                            {!s.isDefault && (
                              <span className="text-xs text-amber-600">customized</span>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              title="Edit"
                              aria-label={`Edit setting ${s.key}`}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryKey(historyKey === s.key ? null : s.key)}
                              title="History"
                              aria-label={`View change history for ${s.key}`}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={s.isDefault || resetMutation.isPending}
                              onClick={() => resetMutation.mutate(s.key)}
                              title="Reset to default"
                              aria-label={`Reset ${s.key} to default`}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {historyKey === s.key && (
                        <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-3">
                          <p className="text-xs font-semibold text-gray-600 mb-1">Recent changes</p>
                          {historyQuery.isLoading && (
                            <p className="text-xs text-gray-500">Loading…</p>
                          )}
                          {historyQuery.data && historyQuery.data.length === 0 && (
                            <p className="text-xs text-gray-500">No prior changes recorded.</p>
                          )}
                          {historyQuery.data && historyQuery.data.length > 0 && (
                            <ul className="space-y-1">
                              {historyQuery.data.slice(0, 10).map((h) => (
                                <li key={h.id} className="text-xs text-gray-600">
                                  <span className="font-mono">{h.old_value ?? '∅'}</span>
                                  {' → '}
                                  <span className="font-mono">{h.new_value}</span>
                                  <span className="text-gray-400">
                                    {' · '}{new Date(h.created_at).toLocaleString()}
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
    </div>
  );
}
