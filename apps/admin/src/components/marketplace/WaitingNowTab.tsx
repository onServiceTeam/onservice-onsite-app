/**
 * D38 Milestone 3: "Waiting now", the live queue of open quote requests.
 *
 * Source: GET /api/v1/admin/marketplace-health/open-requests
 * (marketplace-health.service getOpenRequests). Requests still waiting for a
 * provider's quote come first, longest wait first; requests whose quote is
 * waiting for the customer's decision follow, without a colour. The page
 * re-sorts the rows the same way, so the order never depends on how the
 * server happened to send them.
 *
 * The wait keeps counting on screen: every 15 seconds each row's age is
 * worked out again from its waitingSince, corrected by the gap between this
 * computer's clock and the server's (meta.generatedAt), and the amber and red
 * badges follow the alert settings in meta (5 and 10 minutes by default).
 * The badges always carry words ("Red: over 10 min"), never colour alone. The
 * list reloads every 30 seconds and when the server announces new alerts
 * (alert:new; a burst of them is folded into at most two reloads,
 * use-coalesced-callback).
 *
 * The list holds the first WAITING_LIST_LIMIT requests the server sends
 * (provider waits first, longest first). When a full page arrives the list
 * may be cut off, so the tab says so and gives the real totals from
 * GET /marketplace-health/summary (fetched only in that case), and the
 * heading reads "(100 of 120)" instead of a count that looks complete.
 *
 * Nothing here contacts a provider or changes a request. "Call provider"
 * reveals one number through the audit-logged reveal-contact route.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/api';
import { useAdminSocketEvent } from '@/lib/use-admin-socket';
import { useCoalescedCallback } from './use-coalesced-callback';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw, Timer } from '@/components/icons';
import { InvitedProvidersList } from './InvitedProvidersList';
import {
  OPS_REVIEW_REASON_LABELS, areaLabel, budgetText, fetchMarketplaceSummary, fetchOpenRequests, formatManilaDateTime,
  formatWait, higherSeverity, marketplaceKeys, plural, serviceLabel, severityFor,
  type MarketplaceSummary, type OpenRequestRow, type WaitSeverity, type WaitThresholds,
} from './marketplace-api';

/** How often the on-screen wait is worked out again. */
export const WAIT_TICK_MS = 15_000;
/** How often the queue reloads from the server. */
export const WAITING_REFETCH_MS = 30_000;
/** How many open requests the tab asks for (the API allows up to 200). */
export const WAITING_LIST_LIMIT = 100;

function cutOffNotice(limit: number, summary: MarketplaceSummary | null): string {
  const first = `Only the first ${limit} open requests are listed, longest wait for a provider first.`;
  if (!summary) return `${first} More may be open than this list shows.`;
  const total = summary.waitingCount + summary.awaitingCustomer;
  return `${first} ${total} are open: ${summary.waitingCount} waiting for a provider's quote and ${summary.awaitingCustomer} waiting for the customer.`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Providers first, then the longest wait (earliest waitingSince), then the id. */
export function sortWaitingRows(rows: OpenRequestRow[]): OpenRequestRow[] {
  return [...rows].sort((a, b) => {
    if (a.waitingOn !== b.waitingOn) return a.waitingOn === 'providers' ? -1 : 1;
    const since = Date.parse(a.waitingSince) - Date.parse(b.waitingSince);
    if (since !== 0 && Number.isFinite(since)) return since;
    return a.bookingId.localeCompare(b.bookingId);
  });
}

function liveWaitMinutes(row: OpenRequestRow, serverNow: number): number {
  const since = Date.parse(row.waitingSince);
  if (!Number.isFinite(since)) return row.waitMinutes;
  return Math.max(0, Math.floor((serverNow - since) / 60_000));
}

const SEVERITY_STYLES: Record<Exclude<WaitSeverity, 'none'>, string> = {
  red: 'border-red-300 bg-red-50 text-red-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
};

function SeverityBadge({ severity, thresholds }: { severity: WaitSeverity; thresholds: WaitThresholds | null }): React.ReactElement | null {
  if (severity === 'none') return null;
  const minutes = thresholds ? (severity === 'red' ? thresholds.redMinutes : thresholds.amberMinutes) : null;
  const name = severity === 'red' ? 'Red' : 'Amber';
  const label = minutes !== null ? `${name}: over ${minutes} min` : `${name} alert`;
  return (
    <span
      data-severity={severity}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${SEVERITY_STYLES[severity]}`}
    >
      <Timer size={12} aria-hidden="true" /> {label}
    </span>
  );
}

function WaitingRow({
  row,
  minutes,
  severity,
  thresholds,
}: {
  row: OpenRequestRow;
  minutes: number;
  severity: WaitSeverity;
  thresholds: WaitThresholds | null;
}): React.ReactElement {
  const [showProviders, setShowProviders] = useState(false);
  const waitingOnProviders = row.waitingOn === 'providers';
  // Only the round number: request_max_rounds counts rounds the customer
  // fully declined before review, not a cap on rounds, so "Round 4 of 3"
  // would mislead (integrated review 2026-10-14).
  const roundText = `Round ${row.round}`;
  const borderTone = severity === 'red' ? 'border-l-red-500' : severity === 'amber' ? 'border-l-amber-500' : 'border-l-transparent';

  return (
    <li
      data-testid="waiting-row"
      data-booking-id={row.bookingId}
      data-severity={severity}
      className={`rounded-lg border border-[var(--color-border)] border-l-4 ${borderTone} bg-white p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--color-text)]">{serviceLabel(row.subcategoryName, row.categoryName)}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {areaLabel(row.barangay, row.city)} · {row.customer.displayName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={severity} thresholds={thresholds} />
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {waitingOnProviders ? `Waiting ${formatWait(minutes)}` : `Round open ${formatWait(minutes)}`}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--color-text-tertiary)]">Providers this round</dt>
          <dd className="text-[var(--color-text)]">
            Notified {row.notified} · Opened {row.viewed} · Quoted {row.responded}
          </dd>
          {row.round > 1 ? (
            <dd className="text-xs text-[var(--color-text-secondary)]">
              All rounds: notified {row.notifiedTotal} · opened {row.viewedTotal} · quoted {row.respondedTotal}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-tertiary)]">Round</dt>
          <dd className="text-[var(--color-text)]">{roundText}</dd>
          {row.declinedQuotes > 0 ? (
            <dd className="text-xs text-[var(--color-text-secondary)]">
              Customer declined {row.declinedQuotes} {plural(row.declinedQuotes, 'quote', 'quotes')}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-tertiary)]">Customer budget</dt>
          <dd className="text-[var(--color-text)]">{budgetText(row.budgetMinCentavos, row.budgetMaxCentavos, row.budgetUnknown)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-tertiary)]">Requested</dt>
          <dd className="text-[var(--color-text)]">{formatManilaDateTime(row.createdAt)}</dd>
          {waitingOnProviders && row.waitingSince !== row.createdAt ? (
            <dd className="text-xs text-[var(--color-text-secondary)]">Waiting since {formatManilaDateTime(row.waitingSince)}</dd>
          ) : null}
        </div>
      </dl>

      {row.opsReviewAt ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Flagged for back-office review: {OPS_REVIEW_REASON_LABELS[row.opsReviewReason ?? ''] ?? 'reason not recorded'}.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-expanded={showProviders}
          onClick={() => setShowProviders((open) => !open)}
        >
          {showProviders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showProviders ? 'Hide providers' : 'Show providers and call'}
        </Button>
        <Link
          to={`/bookings/${row.bookingId}`}
          className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-[var(--color-secondary)] hover:underline"
        >
          <ExternalLink size={14} aria-hidden="true" /> Open booking
        </Link>
      </div>

      {showProviders ? (
        <div className="mt-3 rounded-md bg-[var(--color-surface-hover)] p-3">
          <InvitedProvidersList bookingId={row.bookingId} />
        </div>
      ) : null}
    </li>
  );
}

export function WaitingNowTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: marketplaceKeys.openRequests,
    queryFn: () => fetchOpenRequests(WAITING_LIST_LIMIT),
    refetchInterval: WAITING_REFETCH_MS,
  });
  const reloadQueue = useCoalescedCallback(() => {
    void queryClient.invalidateQueries({ queryKey: marketplaceKeys.openRequests });
  });
  useAdminSocketEvent<unknown>('alert:new', reloadQueue);
  const now = useNow(WAIT_TICK_MS);

  // A full page may be a cut-off list: only then ask for the real totals.
  const cutOff = (queue.data?.requests.length ?? 0) >= WAITING_LIST_LIMIT;
  const totals = useQuery({
    queryKey: marketplaceKeys.summary,
    queryFn: fetchMarketplaceSummary,
    enabled: cutOff,
    refetchInterval: cutOff ? WAITING_REFETCH_MS : false,
  });

  const data = queue.data;
  const serverOffset = useMemo(() => {
    if (!data?.generatedAt || !queue.dataUpdatedAt) return 0;
    const generated = Date.parse(data.generatedAt);
    return Number.isFinite(generated) ? generated - queue.dataUpdatedAt : 0;
  }, [data?.generatedAt, queue.dataUpdatedAt]);

  if (queue.isLoading) return <LoadingState label="Loading waiting requests..." />;
  if (queue.isError || !data) {
    return (
      <ErrorState
        title="Waiting requests could not be loaded"
        description={`${getErrorMessage(queue.error)} This is not the same as "nobody is waiting". Retry before treating the queue as clear.`}
        action={(
          <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
            <RefreshCw size={14} /> Retry
          </Button>
        )}
      />
    );
  }

  const thresholds = data.thresholds;
  const serverNow = now + serverOffset;
  const rows = sortWaitingRows(data.requests).map((row) => {
    const minutes = liveWaitMinutes(row, serverNow);
    const severity = row.waitingOn === 'providers'
      ? higherSeverity(row.severity, severityFor(minutes, thresholds))
      : 'none';
    return { row, minutes, severity };
  });
  const onProviders = rows.filter((item) => item.row.waitingOn === 'providers');
  const onCustomer = rows.filter((item) => item.row.waitingOn === 'customer');
  const redCount = onProviders.filter((item) => item.severity === 'red').length;
  const amberCount = onProviders.filter((item) => item.severity === 'amber').length;

  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="No quote requests are open right now"
          description="Every customer request has either been booked or closed. This list reloads every 30 seconds."
        />
      </Card>
    );
  }

  const summary = cutOff ? (totals.data ?? null) : null;
  const providerCount = !cutOff
    ? String(onProviders.length)
    : summary
      ? `${onProviders.length} of ${summary.waitingCount}`
      : `first ${onProviders.length}`;
  const customerCount = !cutOff
    ? String(onCustomer.length)
    : summary
      ? `${onCustomer.length} of ${summary.awaitingCustomer}`
      : `first ${onCustomer.length}`;

  return (
    <div className="space-y-6">
      {cutOff ? (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {cutOffNotice(WAITING_LIST_LIMIT, summary)}
        </p>
      ) : null}
      <section aria-labelledby="waiting-providers-title">
        <div className="mb-3">
          <h2 id="waiting-providers-title" className="text-lg font-bold text-[var(--color-text)]">
            Waiting for a provider&apos;s quote ({providerCount})
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {thresholds
              ? `${cutOff ? 'In this list: ' : ''}Red (${thresholds.redMinutes} min or more): ${redCount}. Amber (${thresholds.amberMinutes} to ${thresholds.redMinutes} min): ${amberCount}. `
              : ''}
            Longest wait first. The wait counts from when the request opened, or reopened after its quotes ended.
          </p>
        </div>
        {onProviders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-text-secondary)]">
            No request is waiting for a provider right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {onProviders.map(({ row, minutes, severity }) => (
              <WaitingRow key={row.bookingId} row={row} minutes={minutes} severity={severity} thresholds={thresholds} />
            ))}
          </ul>
        )}
      </section>

      {onCustomer.length > 0 ? (
        <section aria-labelledby="waiting-customer-title">
          <div className="mb-3">
            <h2 id="waiting-customer-title" className="text-lg font-bold text-[var(--color-text)]">
              Quote sent, waiting for the customer ({customerCount})
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              A provider has answered these. They are shown for follow-up and do not raise alerts.
            </p>
          </div>
          <ul className="space-y-3">
            {onCustomer.map(({ row, minutes, severity }) => (
              <WaitingRow key={row.bookingId} row={row} minutes={minutes} severity={severity} thresholds={thresholds} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-[var(--color-text-tertiary)]">
        Reloads every 30 seconds and when a new alert arrives. Times are Manila time.
      </p>
    </div>
  );
}
