import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { AlertTriangle, ExternalLink, RefreshCw } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';
import type { Tier } from '@/lib/cancellation-policy-validation';

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

interface LiveCancellationSetting {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  runtimeStatus: 'live' | 'held' | 'not_connected';
  runtimeLabel: string;
  runtimeSummary: string;
  editable: boolean;
}

const LIVE_REFUND_RULES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'cancel_refund_over_24h', label: 'More than 24 hours before' },
  { key: 'cancel_refund_2_to_24h', label: '2 to 24 hours before' },
  { key: 'cancel_refund_1_to_2h', label: '1 to 2 hours before' },
  { key: 'cancel_refund_30min_to_1h', label: '30 minutes to 1 hour before' },
  { key: 'cancel_refund_under_30min', label: 'Under 30 minutes before' },
  { key: 'cancel_refund_provider_arrived', label: 'Provider already arrived' },
  { key: 'cancel_refund_customer_noshow', label: 'Customer no-show' },
];

function formatPHP(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export default function CancellationPolicyPage(): React.ReactElement {
  const role = useAuthStore((state) => state.user?.role);
  const canRead = role === 'admin' || role === 'super_admin';

  const versionsQuery = useQuery({
    queryKey: ['cancellation-policies', 'list'],
    queryFn: async () => {
      const response = await api.get<{ data: VersionListItem[] }>('/api/v1/admin/cancellation-policies');
      return response.data.data;
    },
    enabled: canRead,
  });

  const activeVersion = versionsQuery.data?.find((version) => version.is_active) ?? null;

  const activePolicyQuery = useQuery({
    queryKey: ['cancellation-policies', 'active', activeVersion?.version],
    queryFn: async () => {
      const response = await api.get<{ data: ActivePolicy }>(
        `/api/v1/admin/cancellation-policies/${activeVersion!.version}`,
      );
      return response.data.data;
    },
    enabled: canRead && activeVersion !== null,
  });

  const liveSettingsQuery = useQuery({
    queryKey: ['admin-settings', 'cancellation', 'effective-refunds'],
    queryFn: async () => {
      const response = await api.get<{ data: LiveCancellationSetting[] }>(
        '/api/v1/admin/settings/cancellation',
      );
      return response.data.data;
    },
    enabled: canRead,
  });

  const liveSettingsByKey = useMemo(
    () => new Map((liveSettingsQuery.data ?? []).map((setting) => [setting.key, setting])),
    [liveSettingsQuery.data],
  );

  if (!canRead) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="Admin access required"
          description="Cancellation policy review is available to admin and super-admin accounts."
        />
      </div>
    );
  }

  if (versionsQuery.isLoading || (activeVersion && activePolicyQuery.isLoading)) {
    return <div className="p-4 sm:p-6"><LoadingState /></div>;
  }

  if (versionsQuery.isError || activePolicyQuery.isError) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title="Failed to load cancellation policy"
          description={getErrorMessage(versionsQuery.error ?? activePolicyQuery.error)}
          action={
            <Button onClick={(): void => {
              void versionsQuery.refetch();
              if (activeVersion) void activePolicyQuery.refetch();
            }}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!activeVersion) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title="No active cancellation policy"
          description="Bookings must not rely on a missing or inactive customer-facing policy. Restore and verify a policy before accepting new work."
          action={<Button onClick={(): void => { void versionsQuery.refetch(); }}>Retry policy lookup</Button>}
        />
      </div>
    );
  }

  const activePolicy = activePolicyQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Money governance</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">Cancellation policy review</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
          Compare the refund engine with the wording customers currently see. This workspace is read-only while E09 is open.
        </p>
      </header>

      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h2 className="font-semibold">E09 money-policy mismatch: changes are frozen</h2>
            <p className="mt-1 text-sm leading-6">
              The refund engine uses System Settings below. Customer Help and Terms use the separate versioned table. They do not match.
              Until one source and final percentages are approved, neither surface can be edited. Support must quote the calculated outcome on the booking record, not the customer-facing tier table.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>System A: actual refund engine</CardTitle>
            <CardDescription>
              These percentages are read by the escrow cancellation path. They apply to the service-price portion; service-fee handling is separate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {liveSettingsQuery.isLoading ? <LoadingState /> : null}
            {liveSettingsQuery.isError ? (
              <ErrorState
                title="Actual refund settings unavailable"
                description="Do not infer live percentages from the customer-facing policy."
                action={
                  <Button variant="outline" onClick={(): void => { void liveSettingsQuery.refetch(); }}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Retry
                  </Button>
                }
              />
            ) : null}
            {liveSettingsQuery.isSuccess ? (
              <div className="divide-y divide-[var(--color-border)]">
                {LIVE_REFUND_RULES.map((rule) => {
                  const setting = liveSettingsByKey.get(rule.key);
                  return (
                    <div
                      key={rule.key}
                      aria-label={`${rule.label} actual refund rule`}
                      className="flex min-h-12 items-center justify-between gap-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{rule.label}</p>
                        <p className="font-mono text-[11px] text-[var(--color-text-tertiary)]">{rule.key}</p>
                      </div>
                      <span className="shrink-0 text-base font-semibold text-[var(--color-text)]">
                        {setting ? `${setting.value}% refund` : 'Unavailable'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <Link
              to="/settings?category=cancellation"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] sm:w-auto"
            >
              View setting history <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System B: customer-displayed policy v{activePolicy?.version}</CardTitle>
            <CardDescription>
              Help and Terms render this table. It does not control the refund engine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activePolicy ? (
              <>
                <p className="mb-4 text-sm leading-6 text-[var(--color-text-secondary)]">{activePolicy.intro_text}</p>
                <div className="divide-y divide-[var(--color-border)]">
                  {activePolicy.tiers.map((tier, index) => (
                    <div
                      key={`${tier.label}-${index}`}
                      aria-label={`${tier.label} customer-displayed refund rule`}
                      className="flex min-h-12 items-center justify-between gap-4 py-3"
                    >
                      <p className="text-sm font-medium text-[var(--color-text)]">{tier.label}</p>
                      <span className="shrink-0 text-base font-semibold text-[var(--color-text)]">{tier.refund_percent}% refund</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text-secondary)]">
                  <strong className="text-[var(--color-text)]">Displayed provider no-show promise:</strong>{' '}
                  full refund plus {formatPHP(activePolicy.provider_no_show_credit_php * 100)} platform-funded credit.
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--color-text-tertiary)]">
                  Effective {formatPHT(activePolicy.effective_from)}. Created by {activePolicy.creator_name ?? 'unknown'}.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Support handling</CardTitle>
          <CardDescription>Use the booking record as the case-specific source while the mismatch is held.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="font-semibold text-[var(--color-text)]">1. Verify the booking</p>
            <p className="mt-1 text-[var(--color-text-secondary)]">Confirm payment, scheduled time, arrival, no-show, and cancellation evidence.</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="font-semibold text-[var(--color-text)]">2. Use the calculated outcome</p>
            <p className="mt-1 text-[var(--color-text-secondary)]">Quote the server-calculated refund and provider compensation shown on the case.</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="font-semibold text-[var(--color-text)]">3. Escalate disagreement</p>
            <p className="mt-1 text-[var(--color-text-secondary)]">Do not improvise a percentage or promise a gateway refund before it is confirmed.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer-facing version history</CardTitle>
          <CardDescription>Historical display versions, newest first. These records are not proof of money moved.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 xl:hidden">
            {(versionsQuery.data ?? []).map((version) => (
              <div key={version.id} className="rounded-lg border border-[var(--color-border)] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <strong>Version {version.version}</strong>
                  <span>{version.is_active ? 'Active display' : 'Historical'}</span>
                </div>
                <p className="mt-2 text-[var(--color-text-secondary)]">{formatPHT(version.effective_from)} · {version.tier_count} tiers</p>
                <p className="mt-1 text-[var(--color-text-secondary)]">Created by {version.creator_name ?? 'unknown'}</p>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase text-[var(--color-text-secondary)]">
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
                {(versionsQuery.data ?? []).map((version) => (
                  <tr key={version.id} className="border-t border-[var(--color-border)]">
                    <td className="py-3">{version.version}{version.is_active ? ' (active display)' : ''}</td>
                    <td>{formatPHT(version.effective_from)}</td>
                    <td>{version.effective_to ? formatPHT(version.effective_to) : '—'}</td>
                    <td>{version.tier_count}</td>
                    <td>{formatPHP(version.provider_no_show_credit_php * 100)}</td>
                    <td>{version.creator_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
