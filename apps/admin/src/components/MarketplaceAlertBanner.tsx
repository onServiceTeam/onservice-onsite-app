/**
 * D38 Milestone 3 (Ken, 2026-10-13): "backend admin alerts even when it takes
 * more than 5 - 10 minutes for a service pro to respond". This banner sits
 * under the header on every admin page (AdminLayout) and shows the open
 * marketplace request alerts raised by the one-minute sweep
 * (packages/api/src/services/marketplace-alert.service.ts):
 *   - amber: no quote after the amber minutes (5 by default);
 *   - red: no quote after the red minutes (10 by default);
 *   - needs review: the request engine flagged the request;
 *   - closed with no quote: the request ended with no quote at all.
 *
 * Source: GET /api/v1/admin/marketplace-health/alerts?status=open. It reloads
 * on the admin socket's alert:new, and on a timer: every 60 seconds while the
 * socket is connected (new alerts arrive through it; the timer only picks up
 * alerts that another admin took or that resolved), every 30 seconds while it
 * is not. The banner is on every admin page and the API's global limit is 100
 * requests per operator per 15 minutes by default (rate_limit_max_requests),
 * so it does not poll faster than it must, and a burst of alert:new events
 * (the sweep sends one per new alert, up to 50) is folded into at most two
 * reloads of the alerts alone (use-coalesced-callback). This keeps the
 * banner's share small but does NOT keep an operator under the default 100:
 * the Command Center's own polling is already about 123 requests per 15
 * minutes, and this banner plus the dashboard card add about 30 more
 * (integrated review 2026-10-14). The live tester server's limit is 2000;
 * production needs a higher or admin-specific limit (LAUNCH-LIMITATIONS 132,
 * Ken's call). Acknowledge
 * posts /alerts/:id/acknowledge (audit-logged as
 * marketplace_alert_acknowledged); an acknowledged alert stays listed, muted,
 * as "Being handled", until the request gets a quote or closes.
 *
 * Shown only to admin and super_admin, and not while a password change is
 * forced: for other roles it renders nothing and never asks the server
 * (dpo has no access, E34). The query lives in the operator-owned cache
 * (AdminSessionQueries), so another operator signing in never sees these
 * results. When a check fails the banner says so, also after an earlier
 * check found nothing: silence would look like "no customer is waiting".
 * With no open alert and no failed check it renders nothing.
 *
 * Sound: off by default (AlertSoundToggle, lib/alert-tone). When on and
 * allowed by the browser, a new marketplace alert plays a short beep; a burst
 * of alerts plays one (playAlertTone keeps a minimum gap between beeps).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getErrorMessage } from '@/lib/api';
import { useAdminSocketEvent, useAdminSocketStatus } from '@/lib/use-admin-socket';
import { playAlertTone } from '@/lib/alert-tone';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Timer } from '@/components/icons';
import { AlertSoundToggle } from '@/components/marketplace/AlertSoundToggle';
import { useCoalescedCallback } from '@/components/marketplace/use-coalesced-callback';
import {
  ALERT_KIND_LABELS, OPS_REVIEW_REASON_LABELS, acknowledgeMarketplaceAlert, areaLabel, fetchOpenAlerts, formatManilaTime,
  formatWait, marketplaceKeys, plural, type MarketplaceAlert,
} from '@/components/marketplace/marketplace-api';

/** How often the open alerts reload while the admin socket is down. */
export const ALERT_REFETCH_MS = 30_000;
/** How often they reload while the socket is connected (alert:new also reloads them). */
export const ALERT_REFETCH_CONNECTED_MS = 60_000;

interface AlertNewPayload {
  source?: string;
}

// details.closedBy on a request_unfilled alert (marketplace-alert.service).
const UNFILLED_CLOSED_BY: Record<string, string> = {
  customer: 'the customer cancelled',
  provider: 'a provider cancelled',
  system: 'closed by the system',
};

function alertTitle(alert: MarketplaceAlert): string {
  if (alert.kind === 'request_waiting_amber' || alert.kind === 'request_waiting_red') {
    return alert.thresholdMinutes !== null
      ? `No quote after ${alert.thresholdMinutes} min`
      : ALERT_KIND_LABELS[alert.kind];
  }
  if (alert.kind === 'request_needs_ops') {
    const reason = typeof alert.details.reason === 'string' ? OPS_REVIEW_REASON_LABELS[alert.details.reason] : undefined;
    return reason ? `${ALERT_KIND_LABELS[alert.kind]}: ${reason.toLowerCase()}` : ALERT_KIND_LABELS[alert.kind];
  }
  if (alert.kind === 'request_unfilled') {
    const closedBy = typeof alert.details.closedBy === 'string' ? UNFILLED_CLOSED_BY[alert.details.closedBy] : undefined;
    return closedBy ? `${ALERT_KIND_LABELS[alert.kind]}: ${closedBy}` : ALERT_KIND_LABELS[alert.kind];
  }
  return ALERT_KIND_LABELS[alert.kind] ?? 'Request alert';
}

function AlertItem({ alert }: { alert: MarketplaceAlert }): React.ReactElement {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeMarketplaceAlert(alert.id),
    onSuccess: () => {
      setNotice(null);
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
    onError: (error) => {
      if ((error as { status?: unknown } | null)?.status === 409) {
        setNotice('Someone else already took this alert.');
        void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
        return;
      }
      setNotice(`Could not acknowledge: ${getErrorMessage(error)}`);
    },
  });
  const handled = alert.acknowledgedAt !== null;
  const waited = alert.currentWaitMinutes;

  return (
    <li
      data-testid="marketplace-alert"
      data-alert-id={alert.id}
      data-severity={alert.severity}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 ${
        handled ? 'border-[var(--color-border)] opacity-75' : alert.severity === 'red' ? 'border-red-300' : 'border-amber-300'
      }`}
    >
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-[var(--color-text)]">
          <span
            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-bold ${
              alert.severity === 'red' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {alert.severity === 'red' ? 'Red' : 'Amber'}
          </span>
          {alertTitle(alert)}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {alert.serviceName ?? 'Service not recorded'} · {areaLabel(alert.barangay, alert.city)} · Round {alert.round}
          {waited !== null ? ` · Waiting ${formatWait(waited)}` : ''} · Raised {formatManilaTime(alert.raisedAt)}
        </p>
        {handled ? (
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            Being handled{alert.acknowledgedBy?.name ? ` by ${alert.acknowledgedBy.name}` : ''} since {formatManilaTime(alert.acknowledgedAt)}
          </p>
        ) : null}
        {notice ? <p role="alert" className="text-xs text-[var(--color-danger)]">{notice}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/bookings/${alert.bookingId}`}
          className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-[var(--color-secondary)] hover:underline"
        >
          <ExternalLink size={12} aria-hidden="true" /> Open booking
        </Link>
        {!handled ? (
          <button
            type="button"
            onClick={() => acknowledge.mutate()}
            disabled={acknowledge.isPending}
            className="inline-flex min-h-11 items-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {acknowledge.isPending ? 'Saving' : 'Acknowledge'}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AlertBannerBody(): React.ReactElement | null {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const socketStatus = useAdminSocketStatus();
  const alerts = useQuery({
    queryKey: marketplaceKeys.alerts,
    queryFn: fetchOpenAlerts,
    refetchInterval: socketStatus === 'connected' ? ALERT_REFETCH_CONNECTED_MS : ALERT_REFETCH_MS,
  });

  // Only the banner's own query: Waiting now and the Command Center reload
  // their own data on alert:new, so no query is reloaded twice per event.
  const reloadAlerts = useCoalescedCallback(() => {
    void queryClient.invalidateQueries({ queryKey: marketplaceKeys.alerts });
  });
  useAdminSocketEvent<AlertNewPayload>('alert:new', (payload) => {
    reloadAlerts();
    if (payload?.source === 'marketplace') playAlertTone();
  });

  if (alerts.isLoading) return null;

  // A failed check is reported whenever nothing else is on show: before any
  // answer, and also after an earlier answer of "no open alerts" (that zero
  // is no longer known to be true).
  if (alerts.isError && (!alerts.data || alerts.data.openCount === 0)) {
    return (
      <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 xl:px-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle size={16} aria-hidden="true" />
            Request alerts could not be checked. Retrying automatically.
          </span>
          <button
            type="button"
            onClick={() => void alerts.refetch()}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold"
          >
            <RefreshCw size={12} aria-hidden="true" /> Check now
          </button>
        </div>
      </div>
    );
  }

  const data = alerts.data;
  if (!data || data.openCount === 0) return null;

  const red = data.openRedCount > 0;
  const tone = red ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900';

  return (
    <section
      aria-label="Marketplace request alerts"
      data-severity={red ? 'red' : 'amber'}
      className={`border-b px-4 py-2 sm:px-6 xl:px-8 ${tone}`}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex flex-wrap items-center gap-2 text-sm">
            <Timer size={16} aria-hidden="true" />
            <span className="font-bold">
              {data.openCount} quote request {plural(data.openCount, 'alert', 'alerts')} open
            </span>
            <span>
              {data.unacknowledgedCount > 0
                ? `${data.unacknowledgedCount} not yet being handled.`
                : 'All are being handled.'}
            </span>
            {alerts.isError ? <span className="text-xs">The last check failed; retrying.</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AlertSoundToggle compact />
            <Link
              to="/marketplace?tab=waiting"
              className="inline-flex min-h-11 items-center px-2 text-xs font-semibold underline-offset-2 hover:underline"
            >
              Open Marketplace
            </Link>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-current bg-white/60 px-3 text-xs font-semibold"
            >
              {open ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
              {open ? 'Hide alerts' : 'Show alerts'}
            </button>
          </div>
        </div>
        {open ? (
          <ul className="mt-2 space-y-2 pb-1">
            {data.alerts.map((alert) => <AlertItem key={alert.id} alert={alert} />)}
            {data.openCount > data.alerts.length ? (
              <li className="text-xs">
                Showing {data.alerts.length} of {data.openCount}. Open Marketplace for the full queue.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export default function MarketplaceAlertBanner(): React.ReactElement | null {
  const role = useAuthStore((state) => state.user?.role);
  const mustRotatePassword = useAuthStore((state) => state.mustRotatePassword);
  if ((role !== 'admin' && role !== 'super_admin') || mustRotatePassword === true) return null;
  return <AlertBannerBody />;
}
