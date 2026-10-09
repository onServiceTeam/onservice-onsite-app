/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 13 Dispatch C — Consent Versions manager (admin DPO surface).
 *
 * Lists current (consent_type, version) tuples with active-user counts
 * (derived from consent_records) and the published-version audit trail.
 * Lets DPO publish a new version (writes admin_actions.consent_version_published).
 *
 * All form inputs include aria-* attributes; all feedback uses sonner toasts.
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { Shield } from '@/components/icons';

interface ConsentVersionSummary {
  consentType: string;
  version: string;
  effectiveDate: string;
  activeUsers: number;
  totalRecords: number;
  lastUpdated: string;
}

interface PublishedConsentVersion {
  id: string;
  targetId: string;
  consentType: string;
  version: string;
  effectiveAt: string;
  changeSummary: string;
  /**
   * LAUNCH-LIMITATIONS #5 — when true, the publish event forces every
   * user with an older grant of this consentType to re-acknowledge.
   * Server returns false for legacy publishes that predate the flag.
  */
  material: boolean;
  publishedBy: string | null;
  publishedByName?: string | null;
  publishedByEmail?: string | null;
  publishedAt: string;
}

interface ConsentVersionsResponse {
  data: {
    summaries: ConsentVersionSummary[];
    published: PublishedConsentVersion[];
    allowedConsentTypes: string[];
  };
}

interface ConsentPublicationResponse {
  data: PublishedConsentVersion;
}

type ConsentTab = 'current' | 'history';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseTab(value: string | null): ConsentTab {
  return value === 'history' ? 'history' : 'current';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function fmtManilaDay(value: string): string {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
  });
}

// BUG-PHASE111-01 fix — pre-fix this called toISOString().slice(0,10),
// which returns the UTC date. For an admin in Manila publishing late
// at night (e.g., 00:30 Manila Thursday = 16:30 UTC Wednesday), the
// effectiveDate defaulted to 'Wednesday' even though the admin saw
// the screen on 'Thursday'. The effectiveDate determines the platform's
// recorded in-force day and acknowledgement behavior. Now we extract the
// Manila day via toLocaleDateString
// with `en-CA` (which produces the same YYYY-MM-DD shape).
export function todayLocalIso(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function manilaDateToIso(value: string, now: Date = new Date()): string {
  return value.trim()
    ? new Date(`${value.trim()}T00:00:00+08:00`).toISOString()
    : now.toISOString();
}

function publisherIdentity(record: PublishedConsentVersion): React.ReactElement {
  if (!record.publishedBy) return <span>—</span>;
  const primary = record.publishedByName || record.publishedByEmail || record.publishedBy.slice(0, 8);
  return (
    <span className="block min-w-[9rem]">
      <span className="block text-xs font-medium text-slate-800">{primary}</span>
      {record.publishedByName && record.publishedByEmail && (
        <span className="block truncate text-xs text-slate-500" title={record.publishedByEmail}>{record.publishedByEmail}</span>
      )}
      <span className="block font-mono text-[10px] text-slate-400" title={`Publisher ID: ${record.publishedBy}`}>
        {record.publishedBy.slice(0, 8)}
      </span>
    </span>
  );
}

export default function ConsentVersionsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = parseTab(searchParams.get('tab'));
  const linkedPublicationValue = searchParams.get('publicationId')?.trim() ?? '';
  const linkedPublicationId = UUID_REGEX.test(linkedPublicationValue)
    ? linkedPublicationValue.toLowerCase()
    : null;
  const linkedPublicationInvalid = linkedPublicationValue.length > 0
    && linkedPublicationId === null;
  const [publishOpen, setPublishOpen] = useState(false);
  const [consentType, setConsentType] = useState('');
  const [versionStr, setVersionStr] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayLocalIso());
  const [changeSummary, setChangeSummary] = useState('');
  // LAUNCH-LIMITATIONS #5 — defaults to false so a routine publish
  // keeps the legacy marker-only semantics. Operator must explicitly
  // tick the box when the change is material (e.g., adds new processing
  // purpose, expands data sharing). Acknowledgement copy in the dialog
  // explains the consequence.
  const [material, setMaterial] = useState(false);

  function setTab(value: ConsentTab): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('tab', value);
      return params;
    });
  }

  const versionsQuery = useQuery({
    queryKey: ['adminConsentVersions'],
    queryFn: async (): Promise<ConsentVersionsResponse['data']> => {
      const res = await api.get<ConsentVersionsResponse>('/api/v1/admin/compliance/consent-versions');
      return res.data.data;
    },
    staleTime: 30 * 1000,
  });
  const linkedPublicationQuery = useQuery({
    queryKey: ['adminConsentPublication', linkedPublicationId],
    queryFn: async (): Promise<PublishedConsentVersion> => {
      const response = await api.get<ConsentPublicationResponse>(
        `/api/v1/admin/compliance/consent-versions/${encodeURIComponent(linkedPublicationId!)}`,
      );
      return response.data.data;
    },
    enabled: linkedPublicationId !== null,
    retry: false,
    staleTime: 30 * 1000,
  });
  const allowedConsentTypes = versionsQuery.data?.allowedConsentTypes ?? [];
  const soleAllowedConsentType = allowedConsentTypes.length === 1
    ? allowedConsentTypes[0]
    : undefined;

  useEffect(() => {
    if (publishOpen && consentType.length === 0 && soleAllowedConsentType) {
      setConsentType(soleAllowedConsentType);
    }
  }, [consentType, publishOpen, soleAllowedConsentType]);

  const publishMutation = useMutation({
    mutationFn: async (input: {
      consentType: string;
      version: string;
      effectiveAt: string;
      changeSummary: string;
      material: boolean;
    }) => {
      await api.post('/api/v1/admin/compliance/consent-versions', {
        consentType: input.consentType,
        version: input.version,
        effectiveAt: input.effectiveAt,
        changeSummary: input.changeSummary,
        material: input.material,
      });
    },
    onSuccess: () => {
      toast.success('Consent version publication recorded.');
      void queryClient.invalidateQueries({ queryKey: ['adminConsentVersions'] });
      closePublishDialog();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const closePublishDialog = (): void => {
    setPublishOpen(false);
    setConsentType('');
    setVersionStr('');
    setEffectiveDate(todayLocalIso());
    setChangeSummary('');
    setMaterial(false);
  };

  const publishDisabled = consentType.trim().length === 0
    || versionStr.trim().length === 0
    || effectiveDate.trim().length === 0
    || changeSummary.trim().length < 30
    || publishMutation.isPending;
  const materialIsScheduled = material && effectiveDate > todayLocalIso();
  const linkedPublicationScheduled = linkedPublicationQuery.data
    ? new Date(linkedPublicationQuery.data.effectiveAt).getTime() > Date.now()
    : false;

  function clearLinkedPublication(): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('publicationId');
      return params;
    }, { replace: true });
  }

  function openPublication(record: PublishedConsentVersion): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('tab', 'history');
      params.set('publicationId', record.targetId);
      return params;
    });
  }

  function publishVersion(): void {
    const trimmedConsentType = consentType.trim();
    const trimmedVersion = versionStr.trim();
    const trimmedSummary = changeSummary.trim();
    if (publishDisabled) return;
    publishMutation.mutate({
      consentType: trimmedConsentType,
      version: trimmedVersion,
      // Anchor the selected operational effective day to Manila midnight.
      effectiveAt: manilaDateToIso(effectiveDate),
      changeSummary: trimmedSummary,
      material,
    });
  }

  const summaryColumns: Column<ConsentVersionSummary>[] = [
    {
      key: 'consentType',
      header: 'Consent type',
      render: (r) => <span className="font-mono text-xs">{r.consentType}</span>,
    },
    { key: 'version', header: 'Version', render: (r) => r.version },
    { key: 'effective', header: 'First seen', render: (r) => fmtDate(r.effectiveDate) },
    {
      key: 'activeUsers',
      header: 'Current grants',
      render: (r) => <span className="font-medium">{r.activeUsers.toLocaleString('en-PH')}</span>,
    },
    {
      key: 'total',
      header: 'Total records',
      render: (r) => r.totalRecords.toLocaleString('en-PH'),
    },
    { key: 'lastUpdated', header: 'Last updated', render: (r) => fmtDate(r.lastUpdated) },
  ];

  const publishedColumns: Column<PublishedConsentVersion>[] = [
    {
      key: 'consentType',
      header: 'Consent type',
      render: (r) => <span className="font-mono text-xs">{r.consentType}</span>,
    },
    { key: 'version', header: 'Version', render: (r) => r.version },
    { key: 'effective', header: 'Effective', render: (r) => fmtDate(r.effectiveAt) },
    {
      key: 'summary',
      header: 'Change summary',
      render: (r) => <span className="text-xs text-slate-700">{r.changeSummary}</span>,
    },
    {
      key: 'material',
      header: 'Material',
      render: (r) => r.material ? (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
          aria-label="Material change requiring re-consent"
        >Material</span>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      ),
    },
    {
      key: 'publishedBy',
      header: 'Published by',
      render: publisherIdentity,
    },
    { key: 'publishedAt', header: 'Published at', render: (r) => fmtDate(r.publishedAt) },
    {
      key: 'evidence',
      header: 'Evidence',
      render: (r) => (
        <Button variant="outline" className="min-h-11" onClick={() => openPublication(r)}>
          Open evidence
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[var(--color-primary)] px-5 py-6 text-white shadow-sm sm:px-7 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80"><Shield size={18} /> Consent evidence operations</div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Consent Versions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
              Review the latest recorded user decisions, retained history, and the audited version events that the customer and provider clients can acknowledge.
            </p>
          </div>
          <Button
            variant="outline"
            className="min-h-11 shrink-0 self-start border-white bg-white text-slate-900 hover:bg-white/90 lg:self-auto"
            onClick={() => setPublishOpen(true)}
            aria-label="Publish a new consent version"
          >
            Publish new version
          </Button>
        </div>
      </section>

      <section role="note" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
        This workspace records platform evidence. Publishing does not certify legal compliance or file anything with the NPC. A material flag tells the apps to require a fresh acknowledgement for that consent type.
      </section>

      {linkedPublicationInvalid && (
        <ErrorState
          title="Invalid consent publication link"
          description="The saved publication ID is not a valid UUID, so no evidence request was sent. Remove it to keep the current workspace tab."
          action={<Button variant="outline" onClick={clearLinkedPublication}>Remove invalid publication link</Button>}
        />
      )}

      {linkedPublicationId && linkedPublicationQuery.isLoading && (
        <LoadingState label="Loading linked consent publication…" />
      )}

      {linkedPublicationId && linkedPublicationQuery.isError && (
        <ErrorState
          title="Linked consent publication unavailable"
          description={getErrorMessage(linkedPublicationQuery.error)}
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void linkedPublicationQuery.refetch()}>Retry publication evidence</Button>
              <Button variant="outline" onClick={clearLinkedPublication}>Return to publication history</Button>
            </div>
          )}
        />
      )}

      {linkedPublicationQuery.data && (
        <Card aria-label="Selected consent publication evidence">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-secondary)]">Selected publication evidence</p>
              <h2 className="mt-1 text-lg font-semibold leading-none tracking-tight text-slate-900">
                {linkedPublicationQuery.data.consentType.replace(/_/g, ' ')} · Version {linkedPublicationQuery.data.version}
              </h2>
            </div>
            <Button variant="outline" onClick={clearLinkedPublication}>Return to full history</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Change class</dt><dd className="mt-1">{linkedPublicationQuery.data.material ? 'Material' : 'Routine'}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Activation</dt><dd className="mt-1">{linkedPublicationScheduled ? 'Scheduled' : 'Effective'}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Effective · Manila</dt><dd className="mt-1">{fmtDateTime(linkedPublicationQuery.data.effectiveAt)}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Published · Manila</dt><dd className="mt-1">{fmtDateTime(linkedPublicationQuery.data.publishedAt)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Publication target ID</dt><dd className="mt-1 break-all font-mono text-xs">{linkedPublicationQuery.data.targetId}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Audit event ID</dt><dd className="mt-1 break-all font-mono text-xs">{linkedPublicationQuery.data.id}</dd></div>
              <div className="sm:col-span-2 xl:col-span-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Published by</dt><dd className="mt-1">{publisherIdentity(linkedPublicationQuery.data)}</dd></div>
            </dl>
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Recorded change summary</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{linkedPublicationQuery.data.changeSummary || 'No summary recorded.'}</p>
            </section>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ConsentTab)}>
        <TabsList className="grid min-h-11 w-full grid-cols-2 sm:w-fit">
          <TabsTrigger className="min-h-11" value="current">Current versions</TabsTrigger>
          <TabsTrigger className="min-h-11" value="history">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="current">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Versions currently in use</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                Current grants count each user only at their latest recorded decision for that consent type. Historical decisions remain in total records.
              </p>
              {versionsQuery.isLoading ? (
                <LoadingState label="Loading consent evidence…" />
              ) : versionsQuery.isError ? (
                <ErrorState
                  title="Consent evidence unavailable"
                  description={getErrorMessage(versionsQuery.error)}
                  action={<Button variant="outline" onClick={() => void versionsQuery.refetch()}>Retry consent evidence</Button>}
                />
              ) : (versionsQuery.data?.summaries?.length ?? 0) === 0 ? (
                <EmptyState title="No consent records yet" description="No supported consent type has a recorded user decision." icon={<Shield size={28} />} />
              ) : (
                <>
                  <section aria-label="Current consent version cards" className="space-y-3 lg:hidden">
                    {versionsQuery.data?.summaries?.map((record) => (
                      <article key={`${record.consentType}__${record.version}`} className="rounded-xl border border-[var(--color-border)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0"><p className="break-all font-mono text-xs font-semibold text-[var(--color-primary)]">{record.consentType}</p><p className="mt-1 text-lg font-semibold">Version {record.version}</p></div>
                          <div className="rounded-lg bg-[var(--color-surface-hover)] px-3 py-2 text-right"><p className="text-xs uppercase text-[var(--color-text-tertiary)]">Current grants</p><p className="font-semibold">{record.activeUsers.toLocaleString('en-PH')}</p></div>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Total records</dt><dd className="mt-1">{record.totalRecords.toLocaleString('en-PH')}</dd></div>
                          <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">First seen</dt><dd className="mt-1">{fmtDate(record.effectiveDate)}</dd></div>
                          <div className="col-span-2"><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Last decision recorded</dt><dd className="mt-1">{fmtDate(record.lastUpdated)}</dd></div>
                        </dl>
                      </article>
                    ))}
                  </section>
                  <div className="hidden lg:block"><DataTable columns={summaryColumns} data={versionsQuery.data?.summaries ?? []} keyExtractor={(r) => `${r.consentType}__${r.version}`} /></div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Published-version audit trail</CardTitle></CardHeader>
            <CardContent>
              {versionsQuery.isLoading ? (
                <LoadingState label="Loading publish history…" />
              ) : versionsQuery.isError ? (
                <ErrorState
                  title="Publish history unavailable"
                  description={getErrorMessage(versionsQuery.error)}
                  action={<Button variant="outline" onClick={() => void versionsQuery.refetch()}>Retry consent evidence</Button>}
                />
              ) : (versionsQuery.data?.published?.length ?? 0) === 0 ? (
                <EmptyState title="No published versions yet" description="No audited publish event has been recorded." icon={<Shield size={28} />} />
              ) : (
                <>
                  <section aria-label="Published consent version cards" className="space-y-3 lg:hidden">
                    {versionsQuery.data?.published?.map((record) => (
                      <article key={record.id} className="rounded-xl border border-[var(--color-border)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0"><p className="break-all font-mono text-xs font-semibold text-[var(--color-primary)]">{record.consentType}</p><p className="mt-1 text-lg font-semibold">Version {record.version}</p></div>
                          {record.material ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Material</span> : <span className="text-xs text-[var(--color-text-tertiary)]">Routine</span>}
                        </div>
                        <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{record.changeSummary}</p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Effective</dt><dd className="mt-1">{fmtDate(record.effectiveAt)}</dd></div>
                          <div><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Published</dt><dd className="mt-1">{fmtDate(record.publishedAt)}</dd></div>
                          <div className="col-span-2"><dt className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Published by</dt><dd className="mt-1">{publisherIdentity(record)}</dd></div>
                        </dl>
                        <Button variant="outline" className="mt-4 min-h-11 w-full" onClick={() => openPublication(record)}>Open publication evidence</Button>
                      </article>
                    ))}
                  </section>
                  <div className="hidden lg:block"><DataTable columns={publishedColumns} data={versionsQuery.data?.published ?? []} keyExtractor={(r) => r.id} /></div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Publish dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={publishOpen}
        onOpenChange={(open) => { if (!open) closePublishDialog(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish a new consent version</DialogTitle>
            <DialogDescription>
              Record an audited version for a consent type supported by the
              customer and provider apps. Publication is recorded immediately.
              A material version starts requiring fresh acknowledgement only
              when its effective date begins in Philippine time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cv-type">Consent type</Label>
              <Select value={consentType} onValueChange={setConsentType}>
                <SelectTrigger id="cv-type" className="min-h-11" aria-label="Consent type">
                  <SelectValue placeholder="Choose a supported consent type" />
                </SelectTrigger>
                <SelectContent>
                  {allowedConsentTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="cv-type-help" className="text-xs text-slate-500 mt-1">
                The server rejects unknown types because customer/provider clients cannot acknowledge them.
              </p>
            </div>
            <div>
              <Label htmlFor="cv-version">Version</Label>
              <Input
                id="cv-version"
                value={versionStr}
                onChange={(e) => setVersionStr(e.target.value)}
                placeholder="e.g., 1.2 or 2026-04-28"
                aria-required="true"
                maxLength={20}
              />
            </div>
            <div>
              <Label htmlFor="cv-effective">Effective date</Label>
              <Input
                id="cv-effective"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cv-summary">Change summary</Label>
              <Textarea
                id="cv-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Justify the version bump. What changed? What rights are affected?"
                rows={4}
                aria-required="true"
                aria-describedby="cv-summary-help"
              />
              <p id="cv-summary-help" className="text-xs text-slate-500 mt-1">
                Minimum 30 characters. Will appear in the audit trail.{' '}
                <span aria-live="polite">{changeSummary.trim().length}/30 characters</span>
              </p>
            </div>
            {/* LAUNCH-LIMITATIONS #5 — material flag toggle. */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="cv-material"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-amber-600"
                  checked={material}
                  onChange={(e) => setMaterial(e.target.checked)}
                  aria-describedby="cv-material-help"
                />
                <span>
                  <span className="block text-sm font-semibold text-amber-900">
                    This is a material change (force re-consent)
                  </span>
                  <span
                    id="cv-material-help"
                    className="block text-xs text-amber-800 mt-1"
                  >
                    The publish event is recorded now. The apps will treat
                    prior grants as needing fresh acknowledgement only after
                    the selected effective date begins in Philippine time.
                  </span>
                </span>
              </label>
            </div>
            <div
              role="status"
              className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"
            >
              <p className="font-semibold">
                {material
                  ? materialIsScheduled
                    ? 'Scheduled material activation'
                    : 'Material activation begins on the selected day'
                  : 'Routine evidence publication'}
              </p>
              <p className="mt-1 text-xs leading-5">
                {material
                  ? materialIsScheduled
                    ? `Publishing records the audit event now. Customer and provider re-consent starts on ${fmtManilaDay(effectiveDate)}, not before.`
                    : 'Publishing records the audit event now. Because the selected Philippine day has begun, prior grants can require fresh acknowledgement immediately.'
                  : 'Publishing records the audit event now. This routine version does not require customer or provider re-consent.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePublishDialog} disabled={publishMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={publishVersion}
              disabled={publishDisabled}
            >
              {publishMutation.isPending
                ? 'Publishing…'
                : materialIsScheduled
                  ? 'Publish and schedule'
                  : material
                    ? 'Publish and activate'
                    : 'Publish version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
