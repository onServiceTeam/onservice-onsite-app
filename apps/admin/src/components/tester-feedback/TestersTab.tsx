// Tester feedback version 2: the Testers tab. A list of tester sessions and,
// for one session, everything that tester sent, in order: first impression,
// missions, problems, wrap-up (usability statements, score, prices).
// Only super admins see a tester's name and contact, and only super admins
// can delete a tester's answers (a tester's deletion request).

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/Dialog';
import { AnswerList, Meta, ScreenshotGrid, SectionCard } from './FeedbackV2Parts';
import { NoTesterAnswers } from './OverviewTab';
import {
  DEVICE_LABELS, FEEDBACK_V2_BASE, SESSIONS_PAGE_SIZE, SESSION_STATUS_LABELS, SIDE_LABELS, STATUS_LABELS,
  SURFACE_LABELS, appVersionText, fmtManila, severityLabel, useFeedbackStudy,
  type EraseResult, type FeedbackEntry, type SessionDetail, type SessionList, type Study, type TesterSession,
} from './feedback-v2';

const NOTE_MIN = 10;
const NOTE_MAX = 2000;

function deviceText(session: TesterSession): string {
  const parts = [
    session.deviceKind ? DEVICE_LABELS[session.deviceKind] ?? session.deviceKind : null,
    session.appSurface ? SURFACE_LABELS[session.appSurface] ?? session.appSurface : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Not given';
}

export function TestersTab({ selectedId, page, onSelect, onPageChange }: {
  selectedId: string | null;
  page: number;
  onSelect: (sessionId: string | null, options?: { replace?: boolean }) => void;
  onPageChange: (page: number, options?: { replace?: boolean }) => void;
}): React.ReactElement {
  // Shown on the list after a tester's answers were deleted; cleared when
  // another tester is opened.
  const [notice, setNotice] = useState<string | null>(null);
  if (selectedId) {
    return (
      <TesterSessionView
        sessionId={selectedId}
        onBack={() => onSelect(null)}
        onErased={(message) => {
          setNotice(message);
          onSelect(null, { replace: true });
        }}
      />
    );
  }
  return (
    <div className="space-y-4">
      {notice && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <Button variant="outline" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
        </div>
      )}
      <TesterList
        page={page}
        onSelect={(sessionId) => {
          setNotice(null);
          onSelect(sessionId);
        }}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function TesterList({ page, onSelect, onPageChange }: {
  page: number;
  onSelect: (sessionId: string) => void;
  onPageChange: (page: number, options?: { replace?: boolean }) => void;
}): React.ReactElement {
  const sessions = useQuery({
    queryKey: ['feedback-v2-sessions', page],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: SessionList }>(`${FEEDBACK_V2_BASE}/sessions`, {
        params: { page, pageSize: SESSIONS_PAGE_SIZE },
      });
      return response.data.data;
    },
  });
  const total = sessions.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SESSIONS_PAGE_SIZE));
  // A page past the end (an old link, or testers that were deleted) moves to
  // the last page that has testers instead of showing an empty table.
  const pastTheEnd = sessions.isSuccess && total > 0 && page > pageCount;
  const changePage = useRef(onPageChange);
  changePage.current = onPageChange;
  useEffect(() => {
    if (pastTheEnd) changePage.current(pageCount, { replace: true });
  }, [pastTheEnd, pageCount]);

  if (sessions.isLoading || pastTheEnd) return <LoadingState label="Loading testers…" />;
  if (sessions.isError || !sessions.data) {
    return (
      <ErrorState
        title="Testers unavailable"
        description={sessions.isError ? getErrorMessage(sessions.error) : undefined}
        action={<Button variant="outline" onClick={() => void sessions.refetch()}>Retry</Button>}
      />
    );
  }
  if (sessions.data.total === 0) return <NoTesterAnswers />;

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Testers ({sessions.data.total})</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Newest first. Open a tester to read everything they sent, in order.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <caption className="sr-only">Tester sessions</caption>
          <thead className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-tertiary)]">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">Tester</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Side</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Device</th>
              <th scope="col" className="py-2 pr-3 font-semibold">App version</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Missions saved</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Problems</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Finished</th>
              <th scope="col" className="py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sessions.data.sessions.map((session) => (
              <tr key={session.id}>
                <th scope="row" className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className="text-left text-[var(--color-secondary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
                  >
                    {session.label}
                  </button>
                  <span className="block text-xs font-normal text-[var(--color-text-tertiary)]">Started {fmtManila(session.createdAt)}</span>
                </th>
                <td className="py-2 pr-3">{SIDE_LABELS[session.role] ?? session.role}</td>
                <td className="py-2 pr-3">{deviceText(session)}</td>
                <td className="py-2 pr-3">{session.appVersion ?? 'Not given'}</td>
                <td className="py-2 pr-3">{session.missions}</td>
                <td className="py-2 pr-3">{session.problems}</td>
                <td className="py-2 pr-3">{session.completedAt ? 'Yes' : 'Not yet'}</td>
                <td className="py-2">{SESSION_STATUS_LABELS[session.status] ?? session.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label="Tester pages" className="flex items-center justify-between pt-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
          <span className="text-xs text-[var(--color-text-secondary)]">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</Button>
        </nav>
      )}
    </Card>
  );
}

function TesterSessionView({ sessionId, onBack, onErased }: {
  sessionId: string;
  onBack: () => void;
  onErased: (message: string) => void;
}): React.ReactElement {
  const study = useFeedbackStudy();
  const detail = useQuery({
    queryKey: ['feedback-v2-session', sessionId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: SessionDetail }>(
        `${FEEDBACK_V2_BASE}/sessions/${encodeURIComponent(sessionId)}`,
      );
      return response.data.data;
    },
  });

  const back = <Button variant="outline" size="sm" onClick={onBack}>Back to all testers</Button>;
  if (detail.isLoading || study.isLoading) return <div className="space-y-3">{back}<LoadingState label="Loading this tester…" /></div>;
  if (detail.isError || study.isError || !detail.data || !study.data) {
    const failed = detail.isError ? detail : study;
    return (
      <div className="space-y-3">
        {back}
        <ErrorState
          title={detail.isError ? 'This tester could not be loaded' : 'Study wording unavailable'}
          description={failed.isError ? getErrorMessage(failed.error) : undefined}
          action={<Button variant="outline" onClick={() => void failed.refetch()}>Retry</Button>}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {back}
      <SessionDetailView detail={detail.data} study={study.data} onErased={onErased} />
    </div>
  );
}

function SessionDetailView({ detail, study, onErased }: {
  detail: SessionDetail;
  study: Study;
  onErased: (message: string) => void;
}): React.ReactElement {
  const { session, entries } = detail;
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const firstImpression = entries.find((entry) => entry.kind === 'first_impression');
  const missions = entries.filter((entry) => entry.kind === 'mission');
  const problems = entries.filter((entry) => entry.kind === 'problem');
  const wrapup = entries.find((entry) => entry.kind === 'wrapup');
  const helpMethods = session.helpMethods
    .map((key) => study.helpMethods.find((method) => method.key === key)?.label ?? key)
    .join(', ');

  return (
    <>
      <SectionCard className="p-5" labelledBy="fb2-session-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fb2-session-heading" className="text-xl font-semibold text-[var(--color-text)]">{session.label}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge label={SIDE_LABELS[session.role] ?? session.role} variant="info" />
              <Badge label={session.completedAt ? 'Finished' : 'Not finished'} variant={session.completedAt ? 'success' : 'outline'} />
              {session.status === 'dismissed' && <Badge label="Marked as junk" variant="warning" />}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <JunkAction session={session} />
            {isSuperAdmin && <EraseAction detail={detail} onErased={onErased} />}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 rounded-md bg-[var(--color-bg)] p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Meta label="Device" value={deviceText(session)} />
          <Meta label="Device details" value={session.platformDetail ?? 'Not given'} />
          <Meta label="App version" value={session.appVersion ?? 'Not given'} />
          <Meta label="Study version" value={session.studyVersion} />
          <Meta label="Started" value={fmtManila(session.createdAt)} />
          <Meta label="Finished" value={session.completedAt ? fmtManila(session.completedAt) : 'Not yet'} />
          <Meta label="Gets home help today through" value={helpMethods || 'Not given'} />
          {isSuperAdmin ? (
            <>
              <Meta label="Name" value={session.testerName ?? 'Not given'} />
              <Meta label="Contact" value={session.testerContact ?? 'Not given'} />
            </>
          ) : (
            <Meta label="Name or contact" value={session.hasContact ? 'Name or contact given' : 'No name or contact given'} />
          )}
        </dl>
        {!isSuperAdmin && (
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Only super admins can see names and contact details. Phone numbers and emails inside answers are hidden for your role.
          </p>
        )}
      </SectionCard>

      <Section title="First impression">
        {firstImpression
          ? <AnswerList questions={study.firstImpression} answers={firstImpression.answers} />
          : <NotYet />}
        {firstImpression && <ScreenshotGrid entryId={firstImpression.id} screenshots={firstImpression.screenshots} />}
      </Section>

      <Section title={`Missions (${missions.length})`}>
        {missions.length === 0 ? <NotYet /> : (
          <ol className="space-y-4">
            {missions.map((entry) => <li key={entry.id}><MissionEntry entry={entry} study={study} /></li>)}
          </ol>
        )}
      </Section>

      <Section title={`Problems (${problems.length})`}>
        {problems.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No problems reported.</p> : (
          <ol className="space-y-4">
            {problems.map((entry) => <li key={entry.id}><ProblemEntryView entry={entry} study={study} /></li>)}
          </ol>
        )}
      </Section>

      <Section title="Wrap-up">
        {wrapup ? <WrapupEntry entry={wrapup} study={study} /> : <NotYet />}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Card className="p-5">
      <section aria-label={title}>
        <h3 className="mb-3 text-base font-semibold text-[var(--color-text)]">{title}</h3>
        {children}
      </section>
    </Card>
  );
}

function NotYet(): React.ReactElement {
  return <p className="text-sm text-[var(--color-text-secondary)]">Not answered yet.</p>;
}

function MissionEntry({ entry, study }: { entry: FeedbackEntry; study: Study }): React.ReactElement {
  const mission = study.missions.find((candidate) => candidate.key === entry.itemKey);
  const outcome = study.missionOutcomes.find((candidate) => candidate.key === entry.missionOutcome)?.label
    ?? entry.missionOutcome ?? 'Not given';
  return (
    <article className="rounded-lg border border-[var(--color-border)] p-4">
      <h4 className="text-sm font-semibold text-[var(--color-text)]">{mission?.title ?? entry.itemKey}</h4>
      {mission && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{mission.goal}</p>}
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Meta label="Did they manage it?" value={outcome} />
        <Meta label="Ease" value={entry.seq === null ? 'Not given' : `${entry.seq} / 7`} />
        <Meta label="Saved" value={fmtManila(entry.updatedAt)} />
      </dl>
      <div className="mt-3"><AnswerList questions={study.missionQuestions} answers={entry.answers} /></div>
      <ScreenshotGrid entryId={entry.id} screenshots={entry.screenshots} />
    </article>
  );
}

function ProblemEntryView({ entry, study }: { entry: FeedbackEntry; study: Study }): React.ReactElement {
  return (
    <article className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge label={severityLabel(study, entry.severity)} variant="warning" />
        <Badge label={STATUS_LABELS[entry.status] ?? entry.status} variant="outline" />
      </div>
      <h4 className="mt-2 text-sm font-semibold text-[var(--color-text)]">{entry.screenName ?? 'Screen not given'}</h4>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {entry.screenRoute ? <>Route: <code className="break-all">{entry.screenRoute}</code> · </> : null}
        {fmtManila(entry.createdAt)} · {appVersionText(entry.appVersion)}
      </p>
      <div className="mt-3"><AnswerList questions={study.problemQuestions} answers={entry.answers} showMissing /></div>
      <ScreenshotGrid entryId={entry.id} screenshots={entry.screenshots} />
    </article>
  );
}

function WrapupEntry({ entry, study }: { entry: FeedbackEntry; study: Study }): React.ReactElement {
  const prices = entry.prices ?? {};
  const priceServices = study.prices.services.filter((service) => prices[service.key]);
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-[var(--color-text)]">Usability statements</h4>
        <p className="mt-1 text-sm text-[var(--color-text)]">
          Score: <strong>{entry.susScore === null ? 'Not scored' : `${entry.susScore} out of 100`}</strong>
        </p>
        {entry.sus && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Usability statements and this tester's answers</caption>
              <thead className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-tertiary)]">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Statement</th>
                  <th scope="col" className="py-2 font-semibold">Answer (1 {study.sus.scale.low.toLowerCase()}, 5 {study.sus.scale.high.toLowerCase()})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {study.sus.items.map((statement, index) => (
                  <tr key={statement}>
                    <th scope="row" className="py-2 pr-3 font-normal text-[var(--color-text)]">{statement}</th>
                    <td className="py-2">{entry.sus?.[index] ?? 'Not given'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Written answers</h4>
        <AnswerList questions={study.wrapup} answers={entry.answers} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Fair prices</h4>
        {priceServices.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No prices given.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {priceServices.map((service) => (
              <dl key={service.key} className="rounded-lg border border-[var(--color-border)] p-3">
                <p className="mb-2 text-sm font-medium text-[var(--color-text)]">{service.name}</p>
                {study.prices.points.map((point) => {
                  const value = prices[service.key]?.[point.key];
                  return (
                    <div key={point.key} className="flex justify-between gap-3 py-1 text-sm">
                      <dt className="text-[var(--color-text-secondary)]">{point.label}</dt>
                      <dd className="font-medium text-[var(--color-text)]">{typeof value === 'number' ? `₱${value.toLocaleString('en-PH')}` : 'Not given'}</dd>
                    </div>
                  );
                })}
              </dl>
            ))}
          </div>
        )}
      </div>
      <ScreenshotGrid entryId={entry.id} screenshots={entry.screenshots} />
    </div>
  );
}

function JunkAction({ session }: { session: TesterSession }): React.ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const dismissed = session.status === 'dismissed';
  const mutation = useMutation({
    mutationFn: async () => {
      await api.patch(`${FEEDBACK_V2_BASE}/sessions/${encodeURIComponent(session.id)}`, {
        dismissed: !dismissed,
        note: note.trim(),
      });
    },
    onSuccess: () => {
      setOpen(false);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-session', session.id] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-sessions-any'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-problems'] });
    },
  });
  const trimmed = note.trim();
  const noteValid = trimmed.length >= NOTE_MIN && trimmed.length <= NOTE_MAX;
  const actionLabel = dismissed ? 'Restore' : 'Mark as junk';

  return (
    <>
      <Button variant={dismissed ? 'outline' : 'destructive'} size="sm" onClick={() => { mutation.reset(); setOpen(true); }}>
        {actionLabel}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dismissed ? 'Restore this tester?' : 'Mark this tester as junk?'}</DialogTitle>
            <DialogDescription>
              {dismissed
                ? 'Their answers will count in the Overview numbers again.'
                : 'Their answers will be left out of the Overview numbers. Their problem reports stay on the Problems tab. You can restore them later.'}
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-medium text-[var(--color-text)]">
            Reason (required, {NOTE_MIN} to {NOTE_MAX} characters)
            <Textarea
              aria-label="Reason for this change"
              value={note}
              rows={3}
              maxLength={NOTE_MAX}
              disabled={mutation.isPending}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5"
            />
          </label>
          {mutation.isError && <p role="alert" className="text-sm text-red-700">{getErrorMessage(mutation.error)}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button
              variant={dismissed ? 'default' : 'destructive'}
              disabled={!noteValid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Saving…' : actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What deleting this session removes, counted from what is on screen. */
function eraseSummary(detail: SessionDetail): { answers: string; screenshots: number } {
  const { entries } = detail;
  const missions = entries.filter((entry) => entry.kind === 'mission').length;
  const problems = entries.filter((entry) => entry.kind === 'problem').length;
  const parts = [
    entries.some((entry) => entry.kind === 'first_impression') ? 'first impression' : null,
    missions ? plural(missions, 'mission', 'missions') : null,
    problems ? plural(problems, 'problem report', 'problem reports') : null,
    entries.some((entry) => entry.kind === 'wrapup') ? 'wrap-up' : null,
  ].filter(Boolean);
  const answers = `${plural(entries.length, 'saved answer', 'saved answers')}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  const screenshots = entries.reduce((sum, entry) => sum + entry.screenshots.length, 0);
  return { answers, screenshots };
}

/**
 * Super admins only (the API refuses everyone else): deletes a tester's whole
 * session for good, when the tester asks for their answers to be deleted.
 */
function EraseAction({ detail, onErased }: {
  detail: SessionDetail;
  onErased: (message: string) => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const { session } = detail;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const summary = eraseSummary(detail);
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete<{ success: boolean; data: EraseResult }>(
        `${FEEDBACK_V2_BASE}/sessions/${encodeURIComponent(session.id)}`,
        { body: { note: note.trim() } },
      );
      return response.data.data;
    },
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: ['feedback-v2-session', session.id] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-sessions-any'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-problems'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-problem-options'] });
      setOpen(false);
      setNote('');
      const entries = result?.entries ?? detail.entries.length;
      const screenshots = result?.screenshots ?? summary.screenshots;
      onErased(`${session.label}'s answers were deleted: ${plural(entries, 'saved answer', 'saved answers')} and ${plural(screenshots, 'screenshot', 'screenshots')}.`);
    },
  });
  const trimmed = note.trim();
  const noteValid = trimmed.length >= NOTE_MIN && trimmed.length <= NOTE_MAX;

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => { mutation.reset(); setOpen(true); }}>
        Delete this tester's answers
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {session.label}'s answers?</DialogTitle>
            <DialogDescription>
              Use this when a tester asks for their answers to be deleted. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-[var(--color-text)]">
            <p>This deletes, for good:</p>
            <ul aria-label="What will be deleted" className="list-disc space-y-1 pl-5">
              <li>{summary.answers}</li>
              <li>{plural(summary.screenshots, 'screenshot', 'screenshots')}</li>
              <li>their device details, and any name or contact they gave</li>
            </ul>
            <p className="text-[var(--color-text-secondary)]">
              Reports from other testers marked as the same as one of these go back to New.
            </p>
          </div>
          <label className="block text-sm font-medium text-[var(--color-text)]">
            Why are you deleting this? (required, {NOTE_MIN} to {NOTE_MAX} characters)
            <Textarea
              aria-label="Reason for deleting"
              value={note}
              rows={3}
              maxLength={NOTE_MAX}
              disabled={mutation.isPending}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: the tester emailed on 12 October asking us to delete their answers."
              className="mt-1.5"
            />
          </label>
          {mutation.isError && <p role="alert" className="text-sm text-red-700">{getErrorMessage(mutation.error)}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!noteValid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Deleting…' : 'Delete for good'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
