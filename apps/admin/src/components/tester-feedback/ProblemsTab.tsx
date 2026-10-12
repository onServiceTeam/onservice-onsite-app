// Tester feedback version 2: the Problems tab. Each "Report a problem" entry
// with its own screenshots, filters, paging, the triage form (status, owner,
// "same as another report", note) guarded by the problem's updatedAt, and
// the triage history from GET /problems/:id/history.

import React, { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnswerList, Meta, ScreenshotGrid, SectionCard } from './FeedbackV2Parts';
import {
  FEEDBACK_V2_BASE, PROBLEMS_PAGE_SIZE, PROBLEM_STATUSES, SIDE_LABELS, STATUS_LABELS,
  answerText, appVersionText, fmtManila, isConflict, ownerName, problemHistoryKey, severityLabel, testerLabel,
  useAdminOwners, useFeedbackStudy, useProblemHistory,
  type AdminOwner, type ProblemEntry, type ProblemFilters, type ProblemHistoryItem, type ProblemList,
  type ProblemStatus, type Study,
} from './feedback-v2';

const SEVERITY_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'outline'> = {
  stopped: 'danger',
  slowed: 'warning',
  annoyed: 'info',
  looks_wrong: 'outline',
};
const OWNER_REQUIRED: ProblemStatus[] = ['triaged', 'planned', 'done'];
const NOTE_MIN = 10;
const NOTE_MAX = 2000;
const selectClass = 'mt-1.5 h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-normal text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50';

export function ProblemsTab({ filters, onFiltersChange, onOpenTester }: {
  filters: ProblemFilters;
  onFiltersChange: (changes: Partial<ProblemFilters>, options?: { replace?: boolean }) => void;
  onOpenTester: (sessionId: string) => void;
}): React.ReactElement {
  const study = useFeedbackStudy();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const problems = useQuery({
    queryKey: ['feedback-v2-problems', filters.status, filters.severity, filters.screenKey, filters.page],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: ProblemList }>(`${FEEDBACK_V2_BASE}/problems`, {
        params: {
          status: filters.status || undefined,
          severity: filters.severity || undefined,
          screenKey: filters.screenKey || undefined,
          page: filters.page,
          pageSize: PROBLEMS_PAGE_SIZE,
        },
      });
      return response.data.data;
    },
  });
  const filtered = Boolean(filters.status || filters.severity || filters.screenKey);
  const total = problems.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PROBLEMS_PAGE_SIZE));
  // A page past the end (an old link, or reports that were deleted) moves to
  // the last page that has reports instead of showing an empty list.
  const pastTheEnd = problems.isSuccess && total > 0 && filters.page > pageCount;
  const changeFilters = useRef(onFiltersChange);
  changeFilters.current = onFiltersChange;
  useEffect(() => {
    if (pastTheEnd) changeFilters.current({ page: pageCount }, { replace: true });
  }, [pastTheEnd, pageCount]);

  if (study.isLoading) return <LoadingState label="Loading problem reports…" />;
  if (study.isError || !study.data) {
    return (
      <ErrorState
        title="Study wording unavailable"
        description={study.isError ? getErrorMessage(study.error) : undefined}
        action={<Button variant="outline" onClick={() => void study.refetch()}>Retry</Button>}
      />
    );
  }
  const screens = study.data.screens.some((screen) => screen.key === filters.screenKey) || !filters.screenKey
    ? study.data.screens
    : [...study.data.screens, { key: filters.screenKey, side: '', name: filters.screenKey }];

  return (
    <div className="space-y-4">
      <form
        aria-label="Filter problem reports"
        className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="text-sm font-medium text-[var(--color-text)]">
          Status
          <select
            value={filters.status}
            onChange={(event) => onFiltersChange({ status: event.target.value as ProblemStatus | '' })}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {PROBLEM_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--color-text)]">
          How bad
          <select
            value={filters.severity}
            onChange={(event) => onFiltersChange({ severity: event.target.value })}
            className={selectClass}
          >
            <option value="">Any</option>
            {study.data.severities.map((severity) => <option key={severity.key} value={severity.key}>{severity.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--color-text)]">
          Screen
          <select
            value={filters.screenKey}
            onChange={(event) => onFiltersChange({ screenKey: event.target.value })}
            className={selectClass}
          >
            <option value="">All screens</option>
            {screens.map((screen) => <option key={screen.key} value={screen.key}>{screen.name}</option>)}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!filtered}
          onClick={() => onFiltersChange({ status: '', severity: '', screenKey: '' })}
        >
          Clear filters
        </Button>
      </form>

      {!isSuperAdmin && (
        <p className="text-xs text-[var(--color-text-secondary)]">Phone numbers and emails inside answers are hidden for your role.</p>
      )}

      {problems.isLoading && <LoadingState label="Loading problem reports…" />}
      {problems.isError && (
        <ErrorState
          title="Problem reports unavailable"
          description={getErrorMessage(problems.error)}
          action={<Button variant="outline" onClick={() => void problems.refetch()}>Retry</Button>}
        />
      )}
      {problems.isSuccess && problems.data.total === 0 && (
        <Card className="p-6">
          {filtered
            ? <EmptyState title="No problems match these filters." description="Try another status, severity or screen." />
            : <EmptyState title="No problem reports yet." description="Testers send these with Report a problem at app.onservice.ph/feedback." />}
        </Card>
      )}
      {pastTheEnd && <LoadingState label="Going to the last page of reports…" />}
      {problems.isSuccess && problems.data.total > 0 && !pastTheEnd && (
        <>
          <p className="text-sm text-[var(--color-text-secondary)]">
            <strong className="text-[var(--color-text)]">{problems.data.total}</strong> problem {problems.data.total === 1 ? 'report' : 'reports'}, most serious first.
          </p>
          <ol className="space-y-4">
            {problems.data.problems.map((problem) => (
              <li key={problem.id}>
                <ProblemCard
                  problem={problem}
                  study={study.data}
                  onOpenTester={onOpenTester}
                  onReload={() => void problems.refetch()}
                />
              </li>
            ))}
          </ol>
          {pageCount > 1 && (
            <nav aria-label="Problem report pages" className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => onFiltersChange({ page: filters.page - 1 })}>Previous</Button>
              <span className="text-xs text-[var(--color-text-secondary)]">Page {filters.page} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={filters.page >= pageCount} onClick={() => onFiltersChange({ page: filters.page + 1 })}>Next</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function ProblemCard({ problem, study, onOpenTester, onReload }: {
  problem: ProblemEntry;
  study: Study;
  onOpenTester: (sessionId: string) => void;
  onReload: () => void;
}): React.ReactElement {
  const owners = useAdminOwners();
  const [triageOpen, setTriageOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const headingId = useId();
  const historyId = useId();
  const tester = testerLabel(problem.sessionId);

  return (
    <SectionCard className="p-5" labelledBy={headingId}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge label={severityLabel(study, problem.severity)} variant={SEVERITY_VARIANTS[problem.severity ?? ''] ?? 'outline'} />
        <Badge label={STATUS_LABELS[problem.status] ?? problem.status} variant={problem.status === 'new' ? 'danger' : 'default'} />
      </div>
      <h3 id={headingId} className="mt-2 text-base font-semibold text-[var(--color-text)]">
        {problem.screenName ?? 'Screen not given'}
      </h3>
      {problem.screenRoute && (
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
          Route: <code className="break-all rounded bg-[var(--color-bg)] px-1 py-0.5">{problem.screenRoute}</code>
        </p>
      )}
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        {tester} · {SIDE_LABELS[problem.sessionRole] ?? problem.sessionRole} · {fmtManila(problem.createdAt)}
        {' · '}
        <span data-testid="fb2-problem-app-version">{appVersionText(problem.appVersion)}</span>
        {' '}
        <button
          type="button"
          onClick={() => onOpenTester(problem.sessionId)}
          className="ml-1 font-medium text-[var(--color-secondary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
        >
          Open {tester}'s session
        </button>
      </p>

      <div className="mt-3">
        <AnswerList questions={study.problemQuestions} answers={problem.answers} showMissing />
      </div>
      <ScreenshotGrid entryId={problem.id} screenshots={problem.screenshots} />

      <dl className="mt-4 grid gap-3 rounded-md bg-[var(--color-bg)] p-3 sm:grid-cols-3">
        <Meta label="Status" value={STATUS_LABELS[problem.status] ?? problem.status} />
        <Meta label="Owner" value={owners.isLoading ? 'Loading…' : ownerName(owners.data, problem.assignedAdminId)} />
        <Meta label="Note" value={problem.triageNote || 'No note yet'} />
        {problem.duplicateOf && <Meta label="Same as" value={`Report ${problem.duplicateOf.slice(0, 8)}`} />}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" aria-expanded={triageOpen} onClick={() => setTriageOpen((open) => !open)}>
          {triageOpen ? 'Close triage' : 'Triage this problem'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={historyOpen}
          aria-controls={historyOpen ? historyId : undefined}
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? 'Hide history' : 'Show history'}
        </Button>
      </div>
      {historyOpen && <ProblemHistory id={historyId} problemId={problem.id} owners={owners.data} />}
      {triageOpen && <TriageForm problem={problem} study={study} onReload={onReload} />}
    </SectionCard>
  );
}

function statusText(status: string | null | undefined): string {
  if (!status) return 'not set';
  return STATUS_LABELS[status as ProblemStatus] ?? status;
}

/** What one triage decision changed, in plain words. */
function historyChanges(item: ProblemHistoryItem, owners: AdminOwner[] | undefined): string[] {
  const { from, to } = item;
  if (!to) return ['The details of this change were not recorded.'];
  const lines: string[] = [];
  if (!from) lines.push(`Status set to ${statusText(to.status)}`);
  else if (from.status !== to.status) lines.push(`Status: ${statusText(from.status)} to ${statusText(to.status)}`);
  if ((from?.assignedAdminId ?? null) !== (to.assignedAdminId ?? null)) {
    lines.push(`Owner: ${ownerName(owners, from?.assignedAdminId ?? null)} to ${ownerName(owners, to.assignedAdminId ?? null)}`);
  }
  if ((from?.duplicateOf ?? null) !== (to.duplicateOf ?? null)) {
    lines.push(to.duplicateOf
      ? `Marked as the same as Report ${to.duplicateOf.slice(0, 8)}`
      : 'No longer marked as the same as another report');
  }
  if (lines.length === 0) lines.push('Only the note changed');
  return lines;
}

function ProblemHistory({ id, problemId, owners }: {
  id: string;
  problemId: string;
  owners: AdminOwner[] | undefined;
}): React.ReactElement {
  const history = useProblemHistory(problemId, true);
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className="mt-3 rounded-lg border border-[var(--color-border)] p-4">
      <h4 id={headingId} className="text-sm font-semibold text-[var(--color-text)]">History</h4>
      {history.isLoading && <p role="status" className="mt-2 text-sm text-[var(--color-text-secondary)]">Loading history…</p>}
      {history.isError && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <span>The history could not be loaded. {getErrorMessage(history.error)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void history.refetch()}>Retry history</Button>
        </div>
      )}
      {history.isSuccess && history.data.length === 0 && (
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">No triage changes yet.</p>
      )}
      {history.isSuccess && history.data.length > 0 && (
        <ol aria-label="Triage history, oldest first" className="mt-2 space-y-3">
          {history.data.map((item, index) => (
            <li key={`${item.at}-${index}`} className="border-l-2 border-[var(--color-border)] pl-3 text-sm">
              <p className="text-[var(--color-text)]">
                <strong>{item.adminName?.trim() || 'An admin'}</strong>
                <span className="text-[var(--color-text-secondary)]">, {fmtManila(item.at)} (Manila time)</span>
              </p>
              <ul className="mt-1 space-y-0.5 text-[var(--color-text)]">
                {historyChanges(item, owners).map((line) => <li key={line}>{line}</li>)}
              </ul>
              {item.to?.triageNote && (
                <p className="mt-1 whitespace-pre-wrap break-words text-[var(--color-text-secondary)]">Note: {item.to.triageNote}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TriageForm({ problem, study, onReload }: {
  problem: ProblemEntry;
  study: Study;
  onReload: () => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const owners = useAdminOwners();
  const [status, setStatus] = useState<ProblemStatus>(problem.status);
  const [ownerId, setOwnerId] = useState(problem.assignedAdminId ?? '');
  const [duplicateOf, setDuplicateOf] = useState(problem.duplicateOf ?? '');
  // The note box always starts empty: each decision gets its own note, and the
  // current note is shown read-only above it. Pre-filling it would let an
  // admin whose view hides phone numbers and emails save that hidden copy
  // over the real note.
  const [note, setNote] = useState('');
  const [reloadedAfterConflict, setReloadedAfterConflict] = useState(false);

  // A newer version of this problem (after a save or a reload) resets the
  // choices. The typed note is left alone, so a reload after a conflict does
  // not throw away what the admin wrote.
  useEffect(() => {
    setStatus(problem.status);
    setOwnerId(problem.assignedAdminId ?? '');
    setDuplicateOf(problem.duplicateOf ?? '');
  }, [problem.updatedAt, problem.status, problem.assignedAdminId, problem.duplicateOf]);

  const originals = useQuery({
    queryKey: ['feedback-v2-problem-options'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: ProblemList }>(`${FEEDBACK_V2_BASE}/problems`, {
        params: { page: 1, pageSize: 100 },
      });
      return response.data.data;
    },
    enabled: status === 'duplicate',
  });
  const originalOptions = (originals.data?.problems ?? [])
    .filter((candidate) => candidate.id !== problem.id && candidate.status !== 'duplicate');
  // The original saved now may not be among the 100 loaded reports; keep it
  // as a choice so the picker shows what is really saved.
  const savedOriginal = problem.duplicateOf;
  const savedOriginalMissing = Boolean(savedOriginal)
    && !originalOptions.some((candidate) => candidate.id === savedOriginal);
  const pointingHere = (originals.data?.problems ?? [])
    .filter((candidate) => candidate.duplicateOf === problem.id).length;

  const save = useMutation({
    mutationFn: async () => {
      const response = await api.patch<{ success: boolean; data: ProblemEntry }>(
        `${FEEDBACK_V2_BASE}/problems/${encodeURIComponent(problem.id)}`,
        {
          status,
          assignedAdminId: ownerId || null,
          duplicateOf: status === 'duplicate' ? duplicateOf || null : null,
          note: note.trim(),
          expectedUpdatedAt: problem.updatedAt,
        },
      );
      return response.data.data;
    },
    onSuccess: () => {
      setNote('');
      setReloadedAfterConflict(false);
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-problems'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-problem-options'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback-v2-session'] });
      void queryClient.invalidateQueries({ queryKey: problemHistoryKey(problem.id) });
    },
  });

  const trimmed = note.trim();
  const ownerRequired = OWNER_REQUIRED.includes(status);
  const needsOriginal = status === 'duplicate' && !duplicateOf;
  const missingOwner = ownerRequired && !ownerId;
  const noteValid = trimmed.length >= NOTE_MIN && trimmed.length <= NOTE_MAX;
  const hasChanges = status !== problem.status
    || ownerId !== (problem.assignedAdminId ?? '')
    || (status === 'duplicate' ? duplicateOf : '') !== (problem.duplicateOf ?? '')
    || trimmed !== (problem.triageNote ?? '');
  const canSave = hasChanges && noteValid && !needsOriginal && !missingOwner && !save.isPending;
  const conflict = isConflict(save.error);
  const ids = useId();
  const ownerLocked = status === 'new';

  return (
    <form
      aria-label="Triage this problem"
      className="mt-3 space-y-3 rounded-lg border border-[var(--color-border)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save.mutate();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-[var(--color-text)]">
          Status
          <select
            aria-label="Problem status"
            value={status}
            disabled={save.isPending}
            onChange={(event) => {
              const next = event.target.value as ProblemStatus;
              setStatus(next);
              if (next !== 'duplicate') setDuplicateOf('');
              // Same rule as the version 1 queue: a report back at New has no owner.
              if (next === 'new') setOwnerId('');
              save.reset();
              setReloadedAfterConflict(false);
            }}
            className={selectClass}
          >
            {PROBLEM_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)]">
            Owner{ownerRequired ? ' (required)' : ''}
            <select
              aria-label="Problem owner"
              aria-describedby={ownerLocked ? `${ids}-owner-locked` : undefined}
              value={ownerId}
              disabled={ownerLocked || owners.isLoading || owners.isError || save.isPending}
              onChange={(event) => setOwnerId(event.target.value)}
              className={selectClass}
            >
              <option value="">{owners.isLoading ? 'Loading admins…' : 'Unassigned'}</option>
              {(owners.data ?? []).map((owner) => (
                <option key={owner.id} value={owner.id}>{owner.first_name} {owner.last_name}</option>
              ))}
            </select>
          </label>
          {ownerLocked && (
            <p id={`${ids}-owner-locked`} className="mt-1 text-xs text-[var(--color-text-secondary)]">
              A report at New has no owner. Choose another status to pick one.
            </p>
          )}
        </div>
      </div>
      {owners.isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <span>The list of admins could not be loaded.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void owners.refetch()}>Retry admins</Button>
        </div>
      )}

      {status === 'duplicate' && (
        <label className="block text-sm font-medium text-[var(--color-text)]">
          Same as another report (required)
          <select
            aria-label="Same as another report"
            value={duplicateOf}
            disabled={originals.isLoading || originals.isError || save.isPending}
            onChange={(event) => setDuplicateOf(event.target.value)}
            className={selectClass}
          >
            <option value="">{originals.isLoading ? 'Loading reports…' : 'Pick the original report'}</option>
            {savedOriginalMissing && savedOriginal && (
              <option value={savedOriginal}>Saved original: Report {savedOriginal.slice(0, 8)}</option>
            )}
            {originalOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {severityLabel(study, candidate.severity)} · {candidate.screenName ?? 'Screen not given'} · {(answerText(candidate.answers.trying) ?? 'No description').slice(0, 60)} ({testerLabel(candidate.sessionId)})
              </option>
            ))}
          </select>
          {originals.isError && (
            <span role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-red-800">
              The other reports could not be loaded.
              <Button type="button" variant="outline" size="sm" onClick={() => void originals.refetch()}>Retry reports</Button>
            </span>
          )}
          {originals.isSuccess && originals.data.total > 100 && (
            <span className="mt-1 block text-xs font-normal text-[var(--color-text-secondary)]">Showing the 100 most serious reports.</span>
          )}
          {pointingHere > 0 && (
            <span className="mt-1 block text-xs font-normal text-amber-800">
              {pointingHere === 1 ? '1 other report is' : `${pointingHere} other reports are`} marked as the same as this one.
              {' '}Point {pointingHere === 1 ? 'it' : 'them'} at the new original too, so nothing points to a duplicate.
            </span>
          )}
        </label>
      )}

      <div className="rounded-md bg-[var(--color-bg)] p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Current note</p>
        <p data-testid="fb2-current-note" className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">
          {problem.triageNote || 'No note yet'}
        </p>
      </div>
      <label className="block text-sm font-medium text-[var(--color-text)]">
        Your note for this decision (required, {NOTE_MIN} to {NOTE_MAX} characters)
        <Textarea
          aria-label="Triage note"
          aria-describedby={`${ids}-note-count`}
          value={note}
          rows={3}
          maxLength={NOTE_MAX}
          disabled={save.isPending}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What you checked, and what happens next."
          className="mt-1.5"
        />
      </label>
      <p id={`${ids}-note-count`} className="text-xs text-[var(--color-text-secondary)]">
        {trimmed.length} of at least {NOTE_MIN} characters. Your note replaces the current one, and the current one stays in the history.
      </p>

      <ul className="space-y-1 text-xs text-amber-800">
        {needsOriginal && <li>Pick the original report before saving.</li>}
        {missingOwner && <li>Choose an owner for triaged, planned or done.</li>}
      </ul>

      {reloadedAfterConflict && (
        <p role="status" className="text-sm text-[var(--color-text)]">
          The newer decision is shown above. Your note is still in the box. Check it, then save again.
        </p>
      )}
      {save.isError && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {conflict ? (
            <>
              <p>Someone changed this problem after you opened it. Reload to see their decision, then try again.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  save.reset();
                  setReloadedAfterConflict(true);
                  void queryClient.invalidateQueries({ queryKey: problemHistoryKey(problem.id) });
                  onReload();
                }}
              >
                Reload problems
              </Button>
            </>
          ) : (
            <p>{getErrorMessage(save.error)}</p>
          )}
        </div>
      )}
      {save.isSuccess && <p role="status" className="text-sm text-emerald-700">Triage saved.</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSave}>{save.isPending ? 'Saving…' : 'Save triage'}</Button>
      </div>
    </form>
  );
}
