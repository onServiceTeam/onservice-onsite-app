/**
 * D24 Option A: read-only status of Google address search, shown on System
 * Settings > Dispatch & map above the address search controls. Backed by
 * GET /api/v1/admin/geo/address-search/status (admin and super_admin).
 *
 * It says whether the server key is set (never the key itself), whether the
 * switch is on, whether a pause (cool-down) is running after Google refused a
 * call, today's call counts for the Manila day, and Google's last status word.
 * Times are shown in Manila time with month names.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { AlertTriangle, CheckCircle2, MapPin } from '@/components/icons';

export interface AddressSearchStatus {
  keyConfigured: boolean;
  enabled: boolean;
  available: boolean;
  cooldownUntil: string | null;
  cooldownStatus: string | null;
  stateReadable: boolean;
  today: {
    date: string;
    autocomplete: number | null;
    details: number | null;
    reverse: number | null;
    total: number | null;
  };
  limits: {
    userDailyAutocomplete: number;
    userDailyLookups: number;
    platformDaily: number;
    timeoutMs: number;
    cooldownMinutes: number;
  };
  lastStatus: { status: string; operation: string; at: string } | null;
}

export const ADDRESS_SEARCH_STATUS_QUERY_KEY = ['admin', 'address-search-status'] as const;

/** An older API (before this endpoint) or a proxy page must show the error state, not crash the settings page. */
function isAddressSearchStatus(value: unknown): value is AddressSearchStatus {
  const status = value as Partial<AddressSearchStatus> | null;
  return Boolean(status)
    && typeof status!.keyConfigured === 'boolean'
    && typeof status!.enabled === 'boolean'
    && typeof status!.stateReadable === 'boolean'
    && typeof status!.today === 'object' && status!.today !== null && typeof status!.today.date === 'string'
    && typeof status!.limits === 'object' && status!.limits !== null && typeof status!.limits.platformDaily === 'number';
}

const MANILA_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const CALENDAR_DAY = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
});

function manilaTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? MANILA_TIME.format(new Date(time)) : iso;
}

function calendarDay(day: string): string {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(time) ? CALENDAR_DAY.format(new Date(time)) : day;
}

const OPERATION_LABELS: Record<string, string> = {
  autocomplete: 'suggestions',
  details: 'chosen address',
  reverse: 'pin lookup',
};

function statusLine(status: AddressSearchStatus): { tone: 'ok' | 'warn' | 'off'; text: string } {
  if (!status.keyConfigured) return { tone: 'off', text: 'Off: the server has no Google key yet. The app keeps its own address picker.' };
  if (!status.enabled) return { tone: 'off', text: 'Off: switched off in the setting below. The app keeps its own address picker.' };
  if (!status.stateReadable) return { tone: 'warn', text: 'Unavailable: the server cannot read its call counters, so it refuses address search calls.' };
  if (status.cooldownUntil) {
    const reason = status.cooldownStatus ? ` (Google answered ${status.cooldownStatus})` : '';
    return { tone: 'warn', text: `Paused until ${manilaTime(status.cooldownUntil)}${reason}. The app hides search until then.` };
  }
  // The server's `available` also follows the daily limits (GET /api/v1/config uses the same rule).
  if (!status.available) {
    const { limits } = status;
    if (limits.platformDaily === 0 || (limits.userDailyAutocomplete === 0 && limits.userDailyLookups === 0)) {
      return { tone: 'off', text: 'Off: the daily limits below are set to 0. The app keeps its own address picker.' };
    }
    return {
      tone: 'warn',
      text: 'Stopped for today: all users together reached the daily limit of Google calls. Search starts again after midnight Manila time; until then the app keeps its own picker.',
    };
  }
  return { tone: 'ok', text: 'Working: customers can search addresses and turn a map pin into an address.' };
}

function count(value: number | null): string {
  return value === null ? 'unknown' : value.toLocaleString('en-PH');
}

export default function AddressSearchStatusCard(): React.ReactElement {
  const query = useQuery<AddressSearchStatus>({
    queryKey: ADDRESS_SEARCH_STATUS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get('/api/v1/admin/geo/address-search/status');
      const data: unknown = response.data?.data;
      if (!isAddressSearchStatus(data)) throw new Error('The server sent an unexpected status. Reload after the next API release.');
      return data;
    },
    refetchInterval: 60_000,
  });

  return (
    <section
      aria-label="Google address search status"
      className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
        <h3 className="font-medium text-[var(--color-text)]">Google address search</h3>
      </div>

      {query.isLoading && (
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Loading address search status…</p>
      )}

      {query.isError && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Address search status could not load: {getErrorMessage(query.error)}</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-11 rounded-lg border border-red-300 px-3 py-2 font-medium"
          >
            Try again
          </button>
        </div>
      )}

      {query.data && (() => {
        const status = query.data;
        const line = statusLine(status);
        const toneClasses = line.tone === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : line.tone === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-300 bg-slate-100 text-slate-700';
        return (
          <>
            <p role="status" className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${toneClasses}`}>
              {line.tone === 'ok'
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{line.text}</span>
            </p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-xs text-[var(--color-text-tertiary)]">Server key</dt>
                <dd className="mt-1 font-medium text-[var(--color-text)]">{status.keyConfigured ? 'Set' : 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-tertiary)]">Switch</dt>
                <dd className="mt-1 font-medium text-[var(--color-text)]">{status.enabled ? 'On' : 'Off'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-tertiary)]">
                  Google calls today ({calendarDay(status.today.date)}, Manila)
                </dt>
                <dd className="mt-1 text-[var(--color-text)]">
                  <span className="font-medium">{count(status.today.total)} of {status.limits.platformDaily.toLocaleString('en-PH')}</span>
                  <span className="block text-xs text-[var(--color-text-secondary)]">
                    Suggestions {count(status.today.autocomplete)} · Chosen addresses {count(status.today.details)} · Pin lookups {count(status.today.reverse)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-tertiary)]">Last Google answer</dt>
                <dd className="mt-1 text-[var(--color-text)]">
                  {status.lastStatus ? (
                    <>
                      <span className="font-mono font-medium">{status.lastStatus.status}</span>
                      <span className="block text-xs text-[var(--color-text-secondary)]">
                        {OPERATION_LABELS[status.lastStatus.operation] ?? status.lastStatus.operation}, {manilaTime(status.lastStatus.at)}
                      </span>
                    </>
                  ) : 'None yet'}
                </dd>
              </div>
            </dl>
          </>
        );
      })()}
    </section>
  );
}
