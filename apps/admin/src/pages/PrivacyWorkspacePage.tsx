import React, { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Lock,
  Search,
  Shield,
} from '@/components/icons';

interface DsrAlert {
  id: string;
  requestType: string;
  dueAt: string;
  daysUntilDue: number;
  isOverdue: boolean;
}

interface ConsentRecord {
  id: string;
  userId: string;
  consentType: string;
  version: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
}

interface ConsentSearchResult {
  rows: ConsentRecord[];
  total: number;
}

const CONSENT_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseConsentPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function PrivacyWorkspacePage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedConsentValue = searchParams.get('consentUserId')?.trim() ?? '';
  const linkedConsentUserId = UUID_PATTERN.test(linkedConsentValue) ? linkedConsentValue : '';
  const linkedConsentInvalid = linkedConsentValue.length > 0 && linkedConsentUserId.length === 0;
  const linkedConsentPage = parseConsentPage(searchParams.get('consentPage'));
  const [consentSearchDraft, setConsentSearchDraft] = useState(linkedConsentValue);
  const [consentUserId, setConsentUserId] = useState(linkedConsentUserId);
  const [consentPage, setConsentPage] = useState(linkedConsentUserId ? linkedConsentPage : 1);
  const [consentInputError, setConsentInputError] = useState(
    linkedConsentInvalid ? 'Enter the complete user ID in UUID format.' : '',
  );
  const consentOffset = (consentPage - 1) * CONSENT_PAGE_SIZE;

  useEffect(() => {
    setConsentSearchDraft(linkedConsentValue);
    setConsentUserId(linkedConsentUserId);
    setConsentPage(linkedConsentUserId ? linkedConsentPage : 1);
    setConsentInputError(
      linkedConsentInvalid ? 'Enter the complete user ID in UUID format.' : '',
    );
  }, [linkedConsentInvalid, linkedConsentPage, linkedConsentUserId, linkedConsentValue]);

  function writeConsentLocation(userId: string | null, nextPage = 1): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (userId) next.set('consentUserId', userId);
      else next.delete('consentUserId');
      if (userId && nextPage > 1) next.set('consentPage', String(nextPage));
      else next.delete('consentPage');
      return next;
    });
  }

  const dsrAlerts = useQuery({
    queryKey: ['privacyDsrAlerts'],
    queryFn: async () => {
      const response = await api.get('/api/v1/admin/compliance/dsr-alerts');
      return response.data.data as DsrAlert[];
    },
    staleTime: 15_000,
  });

  const consentSearch = useQuery({
    queryKey: ['privacyConsentSearch', consentUserId, consentOffset],
    queryFn: async () => {
      const response = await api.get('/api/v1/admin/compliance/consent', {
        params: { userId: consentUserId, limit: CONSENT_PAGE_SIZE, offset: consentOffset },
      });
      const payload = response.data.data as Partial<ConsentSearchResult> | ConsentRecord[];
      if (Array.isArray(payload)) return { rows: payload, total: payload.length };
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      return {
        rows,
        total: typeof payload.total === 'number' && Number.isFinite(payload.total)
          ? Math.max(0, payload.total)
          : rows.length,
      };
    },
    enabled: consentUserId.length > 0,
  });

  const urgentDsrs = dsrAlerts.data ?? [];
  const upcomingDsrs = urgentDsrs.filter((item) => !item.isOverdue);
  const overdueDsrs = urgentDsrs.filter((item) => item.isOverdue);
  const consentRows = consentSearch.data?.rows ?? [];
  const consentTotal = consentSearch.data?.total ?? 0;
  const consentTotalPages = Math.max(1, Math.ceil(consentTotal / CONSENT_PAGE_SIZE));

  useEffect(() => {
    if (consentSearch.isSuccess && consentPage > consentTotalPages) {
      setConsentPage(consentTotalPages);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (consentTotalPages > 1) next.set('consentPage', String(consentTotalPages));
        else next.delete('consentPage');
        return next;
      }, { replace: true });
    }
  }, [consentPage, consentSearch.isSuccess, consentTotalPages, setSearchParams]);

  function submitConsentSearch(event: FormEvent): void {
    event.preventDefault();
    const nextUserId = consentSearchDraft.trim();
    if (!UUID_PATTERN.test(nextUserId)) {
      setConsentInputError('Enter the complete user ID in UUID format.');
      setConsentUserId('');
      setConsentPage(1);
      writeConsentLocation(null);
      return;
    }
    setConsentInputError('');
    setConsentPage(1);
    setConsentUserId(nextUserId);
    writeConsentLocation(nextUserId);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[var(--color-primary)] px-5 py-6 text-white shadow-sm sm:px-7 lg:px-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <Shield size={18} /> Independent privacy operations
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Privacy Workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
            Work data-subject request targets and consent evidence from one privacy-only queue.
            Marketplace operations and money controls are intentionally outside this role.
          </p>
        </div>
      </section>

      <section aria-label="Privacy workload summary" className="grid gap-3 sm:grid-cols-2">
        <article aria-label="Upcoming internal target workload" className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Internal targets due within 2 days</p>
          <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{dsrAlerts.isLoading ? '…' : dsrAlerts.isError ? '—' : upcomingDsrs.length}</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Received and in-progress requests that are not overdue</p>
          <Link to="/data-protection-log" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
            Review upcoming cases <ArrowRight size={16} />
          </Link>
        </article>
        <article aria-label="Overdue internal target workload" className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Overdue internal targets</p>
          <p className="mt-2 text-3xl font-bold text-red-700">{dsrAlerts.isLoading ? '…' : dsrAlerts.isError ? '—' : overdueDsrs.length}</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Requires immediate case review</p>
          <Link to="/data-protection-log?overdueOnly=true" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
            Review overdue cases <ArrowRight size={16} />
          </Link>
        </article>
      </section>

      {dsrAlerts.isError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Privacy workload counts could not be loaded. Open the case queues directly and retry.
        </p>
      )}

      <section aria-label="Privacy tools" className="grid gap-4 lg:grid-cols-2">
        {[
          {
            to: '/data-protection-log',
            Icon: Lock,
            title: 'Data subject requests',
            copy: 'Review identity-linked requests, internal targets, evidence, responses, rejection reasons, and escalation.',
          },
          {
            to: '/consent-versions',
            Icon: FileText,
            title: 'Consent versions',
            copy: 'Review publication history and publish a traceable policy version with material re-consent treatment.',
          },
        ].map(({ to, Icon, title, copy }) => (
          <Link key={to} to={to} className="group rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition hover:border-[var(--color-primary)]">
            <Icon size={22} className="text-[var(--color-primary)]" />
            <h2 className="mt-4 font-semibold text-[var(--color-text)]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{copy}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
              Open workspace <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Search size={20} className="mt-0.5 text-[var(--color-primary)]" />
          <div>
            <h2 className="font-semibold text-[var(--color-text)]">Consent record lookup</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Search one exact user ID. Every lookup is recorded in the admin audit trail.
            </p>
          </div>
        </div>
        <form role="search" onSubmit={submitConsentSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="privacy-consent-user" className="sr-only">User ID for consent lookup</label>
          <input
            id="privacy-consent-user"
            value={consentSearchDraft}
            onChange={(event) => {
              setConsentSearchDraft(event.target.value);
              if (consentInputError) setConsentInputError('');
            }}
            placeholder="Paste the exact customer or provider user ID"
            aria-invalid={consentInputError.length > 0}
            aria-describedby={consentInputError ? 'privacy-consent-user-error' : undefined}
            className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-3 text-sm"
          />
          <button type="submit" disabled={!consentSearchDraft.trim()} className="h-11 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">
            Search consent records
          </button>
        </form>

        {consentInputError && (
          <p id="privacy-consent-user-error" role="alert" className="mt-3 text-sm text-red-700">{consentInputError}</p>
        )}
        {linkedConsentInvalid && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <p>The saved consent lookup ID is invalid, so no consent-record request was sent.</p>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-red-300 bg-white px-4 font-semibold"
              onClick={() => {
                setConsentSearchDraft('');
                setConsentUserId('');
                setConsentPage(1);
                setConsentInputError('');
                writeConsentLocation(null);
              }}
            >
              Remove invalid lookup
            </button>
          </div>
        )}

        {consentSearch.isFetching && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Searching consent evidence…</p>}
        {consentSearch.isError && (
          <p role="alert" className="mt-4 text-sm text-red-700">{getErrorMessage(consentSearch.error)}</p>
        )}
        {consentUserId && consentSearch.isSuccess && consentRows.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-secondary)]">No consent records match this user ID.</p>
        )}
        {consentRows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--color-surface-hover)] text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <tr><th className="px-4 py-3">Consent</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3">Recorded</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {consentRows.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-medium">{record.consentType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">{record.version}</td>
                      <td className="px-4 py-3">{record.granted && !record.revokedAt ? 'Granted' : 'Revoked / declined'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.revokedAt ?? record.grantedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Consent evidence pages" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Showing {consentOffset + 1}–{Math.min(consentOffset + consentRows.length, consentTotal)} of {consentTotal} records
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={consentPage === 1 || consentSearch.isFetching}
                  onClick={() => {
                    const nextPage = Math.max(1, consentPage - 1);
                    setConsentPage(nextPage);
                    writeConsentLocation(consentUserId, nextPage);
                  }}
                  className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={consentOffset + consentRows.length >= consentTotal || consentSearch.isFetching}
                  onClick={() => {
                    const nextPage = consentPage + 1;
                    setConsentPage(nextPage);
                    writeConsentLocation(consentUserId, nextPage);
                  }}
                  className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </nav>
          </div>
        )}
      </section>

      {urgentDsrs.some((item) => item.isOverdue) && (
        <section role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertTriangle size={20} className="shrink-0" />
          <p><strong>Deadline exception present.</strong> Open the affected privacy queue and record the actual action or blocker. A dashboard count is not proof that the case was handled.</p>
        </section>
      )}
    </div>
  );
}
