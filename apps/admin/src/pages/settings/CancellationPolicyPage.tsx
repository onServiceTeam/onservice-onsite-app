/**
 * Bug 1170 / 1198 + Bug 1170-admin-ui fix verified.
 * Phase 14 Dispatch 02 — admin editor for the cancellation policy.
 *
 * Server-canonical (table cancellation_policies, migration 071); this is the
 * only mutation surface. Talks to /api/v1/admin/cancellation-policies.
 * Public consumers (mobile terms.tsx, help.tsx) read /api/v1/settings/cancellation-policy.
 *
 * super_admin role only (server enforces; the client also hides the link
 * when role !== 'super_admin').
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Textarea,
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/components/ui';
import { Plus, Trash2, Save, RefreshCw } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';
import { Tier, validateTiers, findTier } from '@/lib/cancellation-policy-validation';

interface ActivePolicy {
  id: string;
  version: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  tiers: Tier[];
  intro_text: string;
  legal_disclaimer?: string;
  provider_no_show_credit_php: number;
  created_at: string;
  created_by: string | null;
  creator_name: string | null;
}

interface VersionListItem {
  id: string;
  version: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  creator_name: string | null;
  tier_count: number;
  provider_no_show_credit_php: number;
  intro_text_preview: string;
}

const SAMPLE_BOOKING_PHP = 1000;

function formatPHP(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPHT(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

interface EditorState {
  tiers: Tier[];
  intro_text: string;
  legal_disclaimer: string;
  provider_no_show_credit_php: number;
}

export default function CancellationPolicyPage(): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [previewHours, setPreviewHours] = useState<number>(20);
  const [submitError, setSubmitError] = useState<string>('');
  const [editMode, setEditMode] = useState<'new-version' | 'in-place' | null>(null);

  const versionsQuery = useQuery({
    queryKey: ['cancellation-policies', 'list'],
    queryFn: async () => {
      const res = await api.get<{ data: VersionListItem[] }>('/api/v1/admin/cancellation-policies');
      return res.data.data;
    },
    enabled: role === 'super_admin',
  });

  const activeVersion = versionsQuery.data?.find((v) => v.is_active) ?? null;

  const activePolicyQuery = useQuery({
    queryKey: ['cancellation-policies', 'active', activeVersion?.version],
    queryFn: async () => {
      const res = await api.get<{ data: ActivePolicy }>(
        `/api/v1/admin/cancellation-policies/${activeVersion!.version}`,
      );
      return res.data.data;
    },
    enabled: !!activeVersion,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { mode: 'new-version' | 'in-place'; version?: number; body: EditorState }) => {
      if (payload.mode === 'in-place' && payload.version !== undefined) {
        const res = await api.put(`/api/v1/admin/cancellation-policies/${payload.version}`, payload.body);
        return res.data;
      }
      const res = await api.post('/api/v1/admin/cancellation-policies', payload.body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancellation-policies'] });
      setEditing(null);
      setEditMode(null);
      setSubmitError('');
    },
    onError: (err) => {
      setSubmitError(getErrorMessage(err));
    },
  });

  const startNewVersion = (): void => {
    if (!activePolicyQuery.data) return;
    setEditing({
      tiers: activePolicyQuery.data.tiers.map((t) => ({ ...t })),
      intro_text: activePolicyQuery.data.intro_text,
      legal_disclaimer: activePolicyQuery.data.legal_disclaimer ?? '',
      provider_no_show_credit_php: activePolicyQuery.data.provider_no_show_credit_php,
    });
    setEditMode('new-version');
    setSubmitError('');
  };

  const startInPlaceEdit = (): void => {
    if (!activePolicyQuery.data) return;
    setEditing({
      tiers: activePolicyQuery.data.tiers.map((t) => ({ ...t })),
      intro_text: activePolicyQuery.data.intro_text,
      legal_disclaimer: activePolicyQuery.data.legal_disclaimer ?? '',
      provider_no_show_credit_php: activePolicyQuery.data.provider_no_show_credit_php,
    });
    setEditMode('in-place');
    setSubmitError('');
  };

  const validation = useMemo(() => {
    if (!editing) return { ok: true, errors: {}, summary: null };
    return validateTiers(editing.tiers);
  }, [editing]);

  const previewResult = useMemo(() => {
    const tiers = editing?.tiers ?? activePolicyQuery.data?.tiers ?? [];
    const tier = findTier(previewHours, tiers);
    if (!tier) return { tier: null, refund: 0, fee: SAMPLE_BOOKING_PHP * 100 };
    const refund = Math.floor((SAMPLE_BOOKING_PHP * 100 * tier.refund_percent) / 100);
    return { tier, refund, fee: SAMPLE_BOOKING_PHP * 100 - refund };
  }, [previewHours, editing, activePolicyQuery.data]);

  const inPlaceWindowOpen = useMemo(() => {
    if (!activePolicyQuery.data) return false;
    const ageMs = Date.now() - new Date(activePolicyQuery.data.created_at).getTime();
    return ageMs < 60 * 60 * 1000;
  }, [activePolicyQuery.data]);

  function validateEditorState(payload: EditorState): string | null {
    // Mirror the server's Zod limits so the admin gets a clear message instead
    // of an opaque server validation error on save.
    if (payload.intro_text.trim().length < 10) return 'Intro text must be at least 10 characters.';
    if (payload.legal_disclaimer.trim().length < 10) return 'Legal disclaimer must be at least 10 characters.';
    if (
      !Number.isFinite(payload.provider_no_show_credit_php) ||
      payload.provider_no_show_credit_php < 0 ||
      payload.provider_no_show_credit_php > 10000
    ) {
      return 'Provider no-show credit must be between 0 and 10,000 pesos.';
    }
    return null;
  }

  function savePolicy(): void {
    if (!editing || !editMode) return;
    const validationError = validateEditorState(editing);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    const body: EditorState = {
      ...editing,
      intro_text: editing.intro_text.trim(),
      legal_disclaimer: editing.legal_disclaimer.trim(),
    };
    const action = editMode === 'in-place' ? 'save changes to the active version' : 'publish a new cancellation policy version';
    if (!window.confirm(`Confirm ${action}?`)) return;
    saveMutation.mutate({
      mode: editMode,
      version: editMode === 'in-place' ? activePolicyQuery.data?.version : undefined,
      body,
    });
  }

  if (role !== 'super_admin') {
    return (
      <div className="p-6">
        <EmptyState
          title="Super-admin access required"
          description="Cancellation policy editing is restricted to super_admin accounts."
        />
      </div>
    );
  }

  if (versionsQuery.isLoading || activePolicyQuery.isLoading) {
    return <div className="p-6"><LoadingState /></div>;
  }

  if (versionsQuery.isError || activePolicyQuery.isError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Failed to load cancellation policy"
          description={getErrorMessage(versionsQuery.error ?? activePolicyQuery.error)}
          action={
            <Button onClick={(): void => { void versionsQuery.refetch(); void activePolicyQuery.refetch(); }}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!activeVersion) {
    return (
      <div className="p-6">
        <ErrorState
          title="No active cancellation policy"
          description="Bookings must not rely on a missing or inactive cancellation policy. Restore and verify a server-canonical policy before accepting new work."
          action={<Button onClick={(): void => { void versionsQuery.refetch(); }}>Retry policy lookup</Button>}
        />
      </div>
    );
  }

  const editPayload = editing;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Cancellation policy</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Server-canonical, admin-editable. The active version is read by every client and every server pricing path.
        </p>
      </div>

      {activePolicyQuery.data && !editing && (
        <Card>
          <CardHeader>
            <CardTitle>Active version (v{activePolicyQuery.data.version})</CardTitle>
            <CardDescription>
              Effective {formatPHT(activePolicyQuery.data.effective_from)} —
              {' '}created by {activePolicyQuery.data.creator_name ?? 'unknown'}.
              {' '}{inPlaceWindowOpen ? 'In-place edit window: open (within 1 hour of creation).' : 'In-place edit window closed; new version required.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--color-text-secondary)] uppercase">
                <tr>
                  <th className="py-2">Label</th>
                  <th>Min hours</th>
                  <th>Max hours</th>
                  <th>Refund %</th>
                  <th>Fee %</th>
                </tr>
              </thead>
              <tbody>
                {activePolicyQuery.data.tiers.map((t, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="py-2">{t.label}</td>
                    <td>{t.min_hours_before}</td>
                    <td>{t.max_hours_before ?? '∞'}</td>
                    <td>{t.refund_percent}</td>
                    <td>{t.fee_percent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-sm">
              <strong>Provider no-show credit:</strong> {formatPHP(activePolicyQuery.data.provider_no_show_credit_php * 100)}
              {' '}(platform-funded apology credit)
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={startNewVersion}>
                <Plus className="w-4 h-4 mr-1" /> Save as new version
              </Button>
              <Button variant="outline" onClick={startInPlaceEdit} disabled={!inPlaceWindowOpen}>
                Edit this version (1h window)
              </Button>
              <Button variant="ghost" onClick={(): void => { void versionsQuery.refetch(); void activePolicyQuery.refetch(); }}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editPayload && (
        <Card>
          <CardHeader>
            <CardTitle>{editMode === 'in-place' ? 'Edit current version (in place)' : 'Save as new version'}</CardTitle>
            <CardDescription>
              {validation.ok
                ? <span className="text-green-600">All validations pass.</span>
                : <span className="text-red-600">{validation.summary}</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-text-secondary)] uppercase">
                  <tr>
                    <th className="py-2 w-1/4">Label</th>
                    <th>Min hrs</th>
                    <th>Max hrs (blank = ∞)</th>
                    <th>Refund %</th>
                    <th>Fee %</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {editPayload.tiers.map((t, i) => {
                    const rowError = validation.errors[i];
                    return (
                      <React.Fragment key={i}>
                        <tr className="border-t border-[var(--color-border)] align-top">
                          <td className="py-2 pr-2">
                            <Input
                              aria-label={`Tier ${i + 1} label`}
                              value={t.label}
                              onChange={(e): void => {
                                const next = editPayload.tiers.slice();
                                next[i] = { ...next[i]!, label: e.target.value };
                                setEditing({ ...editPayload, tiers: next });
                              }}
                            />
                          </td>
                          <td className="pr-2">
                            <Input
                              aria-label={`Tier ${i + 1} minimum hours before booking`}
                              type="number"
                              value={t.min_hours_before}
                              onChange={(e): void => {
                                const next = editPayload.tiers.slice();
                                next[i] = { ...next[i]!, min_hours_before: Number(e.target.value) };
                                setEditing({ ...editPayload, tiers: next });
                              }}
                            />
                          </td>
                          <td className="pr-2">
                            <Input
                              aria-label={`Tier ${i + 1} maximum hours before booking`}
                              type="number"
                              value={t.max_hours_before ?? ''}
                              placeholder="∞"
                              onChange={(e): void => {
                                const next = editPayload.tiers.slice();
                                next[i] = { ...next[i]!, max_hours_before: e.target.value === '' ? null : Number(e.target.value) };
                                setEditing({ ...editPayload, tiers: next });
                              }}
                            />
                          </td>
                          <td className="pr-2">
                            <Input
                              aria-label={`Tier ${i + 1} refund percent`}
                              type="number"
                              value={t.refund_percent}
                              onChange={(e): void => {
                                const refund = Number(e.target.value);
                                const next = editPayload.tiers.slice();
                                next[i] = { ...next[i]!, refund_percent: refund, fee_percent: 100 - refund };
                                setEditing({ ...editPayload, tiers: next });
                              }}
                            />
                          </td>
                          <td className="pr-2">
                            <Input aria-label={`Tier ${i + 1} fee percent`} type="number" value={t.fee_percent} disabled />
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              onClick={(): void => {
                                const next = editPayload.tiers.slice();
                                next.splice(i, 1);
                                setEditing({ ...editPayload, tiers: next });
                              }}
                              aria-label={`Remove tier ${i + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                        {rowError && (
                          <tr>
                            <td colSpan={6} className="text-xs text-red-600 pb-2">{rowError}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Button
              variant="outline"
              onClick={(): void => {
                const last = editPayload.tiers[editPayload.tiers.length - 1];
                const newRow: Tier = {
                  min_hours_before: last ? Math.max(0, last.min_hours_before - 1) : 0,
                  max_hours_before: last ? last.min_hours_before : 0,
                  refund_percent: 0,
                  fee_percent: 100,
                  label: 'New tier',
                };
                setEditing({ ...editPayload, tiers: [...editPayload.tiers, newRow] });
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add tier
            </Button>

            <div>
              <Label htmlFor="intro_text">Intro text (shown above the tier table on customer screens)</Label>
              <Textarea
                id="intro_text"
                value={editPayload.intro_text}
                onChange={(e): void => setEditing({ ...editPayload, intro_text: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="legal_disclaimer">Legal disclaimer</Label>
              <Textarea
                id="legal_disclaimer"
                value={editPayload.legal_disclaimer}
                onChange={(e): void => setEditing({ ...editPayload, legal_disclaimer: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="no_show_credit">Provider no-show credit (PHP)</Label>
              <Input
                id="no_show_credit"
                type="number"
                value={editPayload.provider_no_show_credit_php}
                onChange={(e): void => setEditing({ ...editPayload, provider_no_show_credit_php: Number(e.target.value) })}
              />
            </div>

            <div className="bg-[var(--color-bg)] p-4 rounded-lg">
              <Label htmlFor="preview-hours">Preview: customer cancels at...</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="preview-hours"
                  type="number"
                  value={previewHours}
                  onChange={(e): void => setPreviewHours(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm">hours before scheduled time, on a ₱{SAMPLE_BOOKING_PHP} booking →</span>
              </div>
              <div className="mt-2 text-sm">
                {previewResult.tier ? (
                  <>
                    Tier: <strong>{previewResult.tier.label}</strong>;
                    {' '}refund <strong>{formatPHP(previewResult.refund)}</strong>;
                    {' '}fee <strong>{formatPHP(previewResult.fee)}</strong>
                  </>
                ) : (
                  <span className="text-red-600">No tier matches this hour value — the policy has a gap.</span>
                )}
              </div>
            </div>

            {submitError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                disabled={!validation.ok || saveMutation.isPending}
                onClick={savePolicy}
              >
                <Save className="w-4 h-4 mr-1" />
                {saveMutation.isPending ? 'Saving...' : (editMode === 'in-place' ? 'Save in place' : 'Save as new version')}
              </Button>
              <Button variant="ghost" onClick={(): void => { setEditing(null); setEditMode(null); setSubmitError(''); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>All policy versions, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)] uppercase">
              <tr>
                <th className="py-2">Version</th>
                <th>Effective from</th>
                <th>Effective to</th>
                <th>Tiers</th>
                <th>No-show credit</th>
                <th>Created by</th>
              </tr>
            </thead>
            <tbody>
              {(versionsQuery.data ?? []).map((v) => (
                <tr key={v.id} className="border-t border-[var(--color-border)]">
                  <td className="py-2">{v.version}{v.is_active ? ' (active)' : ''}</td>
                  <td>{formatPHT(v.effective_from)}</td>
                  <td>{v.effective_to ? formatPHT(v.effective_to) : '—'}</td>
                  <td>{v.tier_count}</td>
                  <td>{formatPHP(v.provider_no_show_credit_php * 100)}</td>
                  <td>{v.creator_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
