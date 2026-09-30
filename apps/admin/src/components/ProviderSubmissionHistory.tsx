import React, { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import api from '@/lib/api';
import { captureAdminRequestSession, isAdminRequestSessionCurrent } from '@/lib/admin-request-session';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

const uuid = z.string().uuid();
const revisionNumber = z.number().int().positive().max(2_147_483_647);
const timestamp = z.string().datetime();
const summarySchema = z.object({ id: uuid, revisionNumber, submittedAt: timestamp });
const indexSchema = z.object({
  providerId: uuid, currentStatus: z.string(), historyState: z.enum(['recorded', 'not_recorded']),
  revisions: z.array(summarySchema).max(20), nextBeforeRevision: revisionNumber.nullable(),
});
const namedRecord = z.object({ id: uuid, name: z.string() });
const questionnaireSchema = z.object({
  mainSkills: z.string().optional(), hasOwnTools: z.boolean().optional(), businessType: z.string().optional(),
  yearStarted: z.string().optional(), teamSize: z.string().optional(), fullAddress: z.string().optional(),
  website: z.string().optional(), facebook: z.string().optional(), socialOther: z.string().optional(),
  credentials: z.string().optional(), registrations: z.string().optional(), resumeUrl: z.string().optional(),
  references: z.array(z.object({ name: z.string(), contact: z.string(), relation: z.string().optional() })).optional(),
}).strict();
const detailSchema = z.object({
  providerId: uuid, currentStatus: z.string(), revision: z.object({
    id: uuid, revisionNumber, previousRevisionNumber: revisionNumber.nullable(), schemaVersion: z.literal(1),
    businessName: z.string(), serviceRadiusKm: z.number(), latitude: z.number(), longitude: z.number(),
    city: z.string(), province: z.string(), serviceArea: namedRecord, categories: z.array(namedRecord).min(1).max(10),
    nbiExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), governmentIdNumber: z.string().nullable(),
    yearsExperience: z.number().int().nullable(), vettingAnswers: questionnaireSchema.nullable(),
    agreementAcceptedAt: timestamp, submittedAt: timestamp, recordedAt: timestamp,
    documents: z.object({ government_id_front: z.string(), government_id_back: z.string(),
      nbi_clearance: z.string(), selfie: z.string() }),
  }).strict(),
});
type SubmissionSummary = z.infer<typeof summarySchema>;
type Submission = z.infer<typeof detailSchema>['revision'];
const DOCUMENTS = [
  { type: 'government_id_front', label: 'Government ID (front)' },
  { type: 'government_id_back', label: 'Government ID (back)' },
  { type: 'nbi_clearance', label: 'NBI Clearance' },
  { type: 'selfie', label: 'Selfie' },
] as const;

// Private evidence is deliberately component-local, not persisted or shared
// through the operational profile query cache. An abandoned read cannot settle.
function usePrivateRead<T>(url: string, schema: z.ZodType<T>, attempt: number):
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T } {
  const [result, setResult] = useState<{ url: string; attempt: number; data?: T; failed?: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    const session = captureAdminRequestSession();
    void (async () => {
      try {
        const response = await api.get<{ success: true; data: unknown }>(url, { signal: controller.signal });
        const data = schema.parse(response.data.data);
        if (!controller.signal.aborted && isAdminRequestSessionCurrent(session)) setResult({ url, attempt, data });
      } catch {
        if (!controller.signal.aborted && isAdminRequestSessionCurrent(session)) setResult({ url, attempt, failed: true });
      }
    })();
    return () => controller.abort();
  }, [url, schema, attempt]);
  if (result?.url !== url || result.attempt !== attempt) return { status: 'loading' };
  return result.failed || !result.data ? { status: 'error' } : { status: 'ready', data: result.data };
}

function Reading({ label }: { label: string }): React.ReactElement {
  return <div role="status" className="space-y-3 py-4">
    <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
    <div aria-hidden="true"><Skeleton className="h-5 w-2/3 motion-reduce:animate-none" /></div>
    <div aria-hidden="true"><Skeleton className="h-16 w-full motion-reduce:animate-none" /></div>
  </div>;
}

function ReadFailure({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return <div role="alert" className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
    <p className="text-sm text-[var(--color-danger)]">Submitted application evidence could not be loaded or verified. No current-profile substitute is shown.</p>
    <Button variant="outline" className="min-h-11" onClick={onRetry}>Retry submitted evidence</Button>
  </div>;
}

export function ProviderSubmissionHistory({ providerId }: { providerId: string }): React.ReactElement {
  const auth = useAuthStore(state => state);
  const session = captureAdminRequestSession();
  const [opened, setOpened] = useState<{ providerId: string; operatorId: string; session: object } | null>(null);
  const regionId = useId();
  const allowed = auth.isAuthenticated === true && !auth.mustRotatePassword
    && (auth.user?.role === 'admin' || auth.user?.role === 'super_admin') && uuid.safeParse(providerId).success;
  const open = allowed && opened?.providerId === providerId && opened.operatorId === auth.user?.id && opened.session === session;
  return <Card className="min-w-0 space-y-4 p-4 md:col-span-2 sm:p-5">
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:flex-wrap">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Submitted applications</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Review preserved submission records separately from the current profile below. Later profile edits do not rewrite these records.
        </p>
      </div>
      <Button variant="outline" className="min-h-11" disabled={!allowed} aria-expanded={Boolean(open)} aria-controls={regionId}
        onClick={() => setOpened(open ? null : { providerId, operatorId: auth.user!.id, session })}>
        {open ? 'Close submitted applications' : 'Review submitted applications'}
      </Button>
    </div>
    {open && <div id={regionId}><SubmissionIndex providerId={providerId} /></div>}
  </Card>;
}

function SubmissionIndex({ providerId }: { providerId: string }): React.ReactElement {
  const [cursors, setCursors] = useState<Array<number | null>>([null]);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const cursor = cursors[cursors.length - 1]!;
  const base = `/api/v1/admin/providers/${providerId}/application-revisions`;
  const query = usePrivateRead(`${base}?limit=20${cursor === null ? '' : `&beforeRevision=${cursor}`}`, indexSchema, attempt);
  const refresh = (): void => { setSelected(null); setAttempt(value => value + 1); };
  if (query.status === 'loading') return <Reading label="Loading submitted application history..." />;
  if (query.status === 'error') return <ReadFailure onRetry={refresh} />;
  const page = query.data;
  const invalid = page.providerId !== providerId
    || new Set(page.revisions.map(row => row.id)).size !== page.revisions.length
    || page.revisions.some((row, index) => (cursor !== null && row.revisionNumber >= cursor)
      || (index > 0 && row.revisionNumber >= page.revisions[index - 1]!.revisionNumber))
    || (page.nextBeforeRevision !== null && page.nextBeforeRevision !== page.revisions.at(-1)?.revisionNumber)
    || (page.historyState === 'not_recorded' && (page.revisions.length > 0 || page.nextBeforeRevision !== null))
    || (cursor === null && page.historyState === 'recorded' && page.revisions.length === 0);
  if (invalid) return <ReadFailure onRetry={refresh} />;
  const chosen = page.revisions.find(row => row.id === selected);
  return <div className="space-y-4">
    <p className="text-sm text-[var(--color-text-secondary)]">This is a read-only review. It does not approve, reject, reopen, or change a provider account.</p>
    {page.historyState === 'not_recorded' ? <p role="status" className="rounded-lg border border-[var(--color-border)] p-4 text-sm">
      No preserved submission record is available for this provider. This may be a legacy application. The current profile is not proof of what was originally submitted.
    </p> : page.revisions.length === 0 ? <p role="status" className="text-sm">No older submissions on this page.</p> : <ul aria-label="Preserved submissions" className="space-y-2">
      {page.revisions.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3">
        <div className="min-w-0 text-sm"><p className="font-semibold">Submission {row.revisionNumber}</p><RecordedTime value={row.submittedAt} /></div>
        <Button variant={chosen?.id === row.id ? 'secondary' : 'outline'} className="min-h-11"
          aria-pressed={chosen?.id === row.id} onClick={() => setSelected(row.id)}>View submission {row.revisionNumber}</Button>
      </li>)}
    </ul>}
    <nav aria-label="Submission history pages" className="flex flex-wrap gap-2">
      {cursors.length > 1 && <Button variant="outline" className="min-h-11" onClick={() => { setSelected(null); setCursors(values => values.slice(0, -1)); }}>Newer submissions</Button>}
      {page.nextBeforeRevision !== null && <Button variant="outline" className="min-h-11" onClick={() => { setSelected(null); setCursors(values => [...values, page.nextBeforeRevision]); }}>Older submissions</Button>}
      <Button variant="outline" className="min-h-11" onClick={() => { setCursors([null]); refresh(); }}>Refresh latest submissions</Button>
    </nav>
    {chosen && <SubmissionDetail key={`${chosen.id}:${attempt}`} providerId={providerId} summary={chosen} />}
  </div>;
}

function RecordedTime({ value }: { value: string }): React.ReactElement {
  return <time dateTime={value}>{new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })} PHT</time>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return <div className="min-w-0 space-y-1 border-b border-[var(--color-border)] py-3 last:border-0">
    <dt className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</dt>
    <dd className="whitespace-pre-wrap break-words text-sm text-[var(--color-text)] [overflow-wrap:anywhere]">{children ?? 'Not provided at submission'}</dd>
  </div>;
}

function SubmissionDetail({ providerId, summary }: { providerId: string; summary: SubmissionSummary }): React.ReactElement {
  const [attempt, setAttempt] = useState(0);
  const base = `/api/v1/admin/providers/${providerId}/application-revisions/${summary.id}`;
  const query = usePrivateRead(base, detailSchema, attempt);
  const retry = (): void => setAttempt(value => value + 1);
  if (query.status === 'loading') return <Reading label={`Loading submission ${summary.revisionNumber}...`} />;
  if (query.status === 'error') return <ReadFailure onRetry={retry} />;
  const { revision: row, currentStatus } = query.data;
  if (query.data.providerId !== providerId || row.id !== summary.id || row.revisionNumber !== summary.revisionNumber
    || row.submittedAt !== summary.submittedAt || row.previousRevisionNumber !== (row.revisionNumber === 1 ? null : row.revisionNumber - 1)
    || DOCUMENTS.some(doc => row.documents[doc.type] !== `${base}/kyc/${doc.type}`)) return <ReadFailure onRetry={retry} />;
  return <section aria-label={`Submission ${row.revisionNumber} as submitted`} className="min-w-0 space-y-4 border-t border-[var(--color-border)] pt-5">
    <div><h3 className="text-lg font-semibold">Submission {row.revisionNumber} as submitted</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Names, selections, answers and document references below come from this preserved submission, not today’s profile or catalog.</p></div>
    <p className="rounded-lg border border-[var(--color-border)] p-3 text-sm">Current provider status at load: <strong>{currentStatus}</strong>. This does not identify which submission was approved.</p>
    <dl className="grid min-w-0 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
      <Field label="Business name">{row.businessName}</Field>
      <Field label="City">{row.city}</Field><Field label="Province">{row.province}</Field>
      <Field label="Service market">{row.serviceArea.name}</Field>
      <Field label="Service market ID"><span className="font-mono text-xs">{row.serviceArea.id}</span></Field>
      <Field label="Service radius">{row.serviceRadiusKm} km</Field>
      <Field label="Location coordinates">{row.latitude}, {row.longitude}</Field>
      <Field label="Government ID number">{row.governmentIdNumber}</Field>
      <Field label="NBI expiry date (YYYY-MM-DD)">{row.nbiExpiryDate}</Field>
      <Field label="Years of experience">{row.yearsExperience}</Field>
      <Field label="Submitted at"><RecordedTime value={row.submittedAt} /></Field>
      <Field label="Recorded at"><RecordedTime value={row.recordedAt} /></Field>
      <Field label="Agreement accepted at"><RecordedTime value={row.agreementAcceptedAt} /></Field>
    </dl>
    <div><h4 className="text-sm font-semibold">Service categories as submitted</h4><ul className="mt-2 space-y-2">
      {row.categories.map(category => <li key={category.id} className="min-w-0 text-sm [overflow-wrap:anywhere]">
        <p>{category.name}</p><p className="font-mono text-xs text-[var(--color-text-secondary)]">{category.id}</p>
      </li>)}
    </ul></div>
    <Questionnaire row={row} />
    <section aria-label="Submitted private documents" className="space-y-3">
      <h4 className="text-sm font-semibold">Documents referenced by this submission</h4>
      <p className="text-sm text-[var(--color-text-secondary)]">A saved reference does not prove that the file is still available or that its contents were verified. Missing original files are not replaced with current documents.</p>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">{DOCUMENTS.map(doc => <SubmittedDocument key={doc.type} label={doc.label} url={`${base}/kyc/${doc.type}`} />)}</div>
    </section>
    <div className="space-y-2 text-xs text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
      <p>Submission ID: <span className="font-mono">{row.id}</span></p>
      <p>Previous submission: {row.previousRevisionNumber === null ? 'None (first submission)' : row.previousRevisionNumber}. Record format: {row.schemaVersion}.</p>
      <p>Original account name and agreement wording were not captured in this record. The agreement time alone does not prove which wording was accepted.</p>
    </div>
  </section>;
}

function Questionnaire({ row }: { row: Submission }): React.ReactElement {
  const answers = row.vettingAnswers;
  const fields = [
    ['Main skills / specialties', answers?.mainSkills], ['Own tools / equipment', answers?.hasOwnTools == null ? null : answers.hasOwnTools ? 'Yes' : 'No'],
    ['Business type', answers?.businessType], ['Year started', answers?.yearStarted], ['Team size', answers?.teamSize],
    ['Full address', answers?.fullAddress], ['Website', answers?.website], ['Facebook', answers?.facebook],
    ['Other links', answers?.socialOther], ['Certifications / licenses', answers?.credentials],
    ['Registrations', answers?.registrations], ['Resume / portfolio', answers?.resumeUrl],
  ] as const;
  return <section aria-label="Questionnaire as submitted" className="space-y-3">
    <h4 className="text-sm font-semibold">Questionnaire as submitted</h4>
    {answers === null ? <p className="text-sm">No questionnaire was provided at submission.</p> : <>
      <p className="text-xs text-[var(--color-text-secondary)]">Applicant-supplied links are shown as text, not verified destinations.</p>
      <dl className="grid min-w-0 gap-x-6 sm:grid-cols-2">{fields.map(([label, value]) => <Field key={label} label={label}>{value ?? null}</Field>)}</dl>
      <h5 className="text-sm font-semibold">References as submitted</h5>
      {!answers.references?.length ? <p className="text-sm">No references were provided at submission.</p> : <ul className="space-y-3">
        {answers.references.map((reference, index) => <li key={index} className="min-w-0 rounded-lg border border-[var(--color-border)] p-3 text-sm [overflow-wrap:anywhere]">
          <p>{reference.name}</p><p>{reference.contact}</p><p>{reference.relation ?? 'Relationship not provided'}</p>
        </li>)}
      </ul>}
    </>}
  </section>;
}

function SubmittedDocument({ label, url }: { label: string; url: string }): React.ReactElement {
  const [requested, setRequested] = useState(false);
  const [result, setResult] = useState<{ objectUrl: string; type: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    const session = captureAdminRequestSession();
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const response = await api.get<Blob>(url, { responseType: 'blob', signal: controller.signal });
        if (controller.signal.aborted || !isAdminRequestSessionCurrent(session)) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(response.data.type)) throw new Error('Unsupported private preview type.');
        objectUrl = URL.createObjectURL(response.data);
        setResult({ objectUrl, type: response.data.type });
      } catch {
        if (!controller.signal.aborted && isAdminRequestSessionCurrent(session)) setFailed(true);
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, requested]);
  return <div className="min-w-0 space-y-3 rounded-lg border border-[var(--color-border)] p-3">
    <p className="text-sm font-medium">{label}</p>
    {!requested ? <Button variant="outline" className="min-h-11" onClick={() => setRequested(true)}>Load submitted {label}</Button>
      : failed ? <div role="alert" className="space-y-2 text-sm">
        <p>The original {label} could not be opened safely. It may be missing, unavailable, or in an unsupported format. No replacement file was opened.</p>
        <Button variant="outline" className="min-h-11" onClick={() => { setFailed(false); setRequested(false); }}>Reset document preview</Button>
      </div> : !result ? <p role="status" className="text-sm">Loading submitted {label}...</p> : <>
        {result.type.startsWith('image/') && <img src={result.objectUrl} alt={`Submitted ${label}`} className="max-h-96 w-full object-contain" />}
        <a href={result.objectUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-[var(--color-primary)] underline">Open loaded {label} in new tab</a>
        <Button variant="outline" className="min-h-11" onClick={() => { setResult(null); setRequested(false); }}>Close {label} preview</Button>
      </>}
  </div>;
}
