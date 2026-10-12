// Tester feedback version 2: the Overview tab (testers, missions, usability
// score, problems by screen). Numbers come from GET /overview, which already
// leaves out sessions marked as junk.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard, WarningFlag } from './FeedbackV2Parts';
import {
  FEEDBACK_V2_BASE, SIDE_LABELS, useFeedbackStudy, type Overview, type SessionList, type Study,
} from './feedback-v2';

export const LOW_EASE = 5;
export const LOW_COMPLETION = 70;
export const RELIABLE_SUS_RESPONSES = 5;

export function NoTesterAnswers(): React.ReactElement {
  return (
    <Card className="p-6">
      <EmptyState title="No tester answers yet." description="Send testers app.onservice.ph/feedback." />
    </Card>
  );
}

/**
 * The Overview leaves out testers marked as junk, so zero testers there can
 * mean "nobody yet" or "every tester is junk". The tester list counts every
 * session, junk included, so one row of it tells the two apart.
 */
function AllTestersJunkOrNone(): React.ReactElement {
  const sessions = useQuery({
    queryKey: ['feedback-v2-sessions-any'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: SessionList }>(`${FEEDBACK_V2_BASE}/sessions`, {
        params: { page: 1, pageSize: 1 },
      });
      return response.data.data;
    },
  });
  if (sessions.isLoading) return <LoadingState label="Loading tester results…" />;
  if (sessions.isSuccess && sessions.data.total > 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="Every tester so far is marked as junk."
          description={`${sessions.data.total} ${sessions.data.total === 1 ? 'tester is' : 'testers are'} marked as junk, so the Overview has no numbers to show. Open the Testers tab to review them or restore one.`}
        />
      </Card>
    );
  }
  // No sessions at all, or the check failed: the plain "nothing yet" message.
  return <NoTesterAnswers />;
}

export function useFeedbackOverview() {
  return useQuery({
    queryKey: ['feedback-v2-overview'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Overview }>(`${FEEDBACK_V2_BASE}/overview`);
      return response.data.data;
    },
  });
}

export function OverviewTab({ onOpenScreen }: { onOpenScreen: (screenKey: string) => void }): React.ReactElement {
  const study = useFeedbackStudy();
  const overview = useFeedbackOverview();

  if (overview.isLoading || study.isLoading) return <LoadingState label="Loading tester results…" />;
  if (overview.isError) {
    return (
      <ErrorState
        title="Tester results unavailable"
        description={getErrorMessage(overview.error)}
        action={<Button variant="outline" onClick={() => void overview.refetch()}>Retry</Button>}
      />
    );
  }
  if (study.isError) {
    return (
      <ErrorState
        title="Study wording unavailable"
        description={getErrorMessage(study.error)}
        action={<Button variant="outline" onClick={() => void study.refetch()}>Retry</Button>}
      />
    );
  }
  const data = overview.data;
  if (!data || !study.data) return <LoadingState label="Loading tester results…" />;
  if (data.sessions.total === 0) return <AllTestersJunkOrNone />;

  return (
    <div className="space-y-4">
      <TestersCard data={data} />
      <MissionsCard data={data} />
      <UsabilityCard sus={data.sus} />
      <ScreensCard data={data} study={study.data} onOpenScreen={onOpenScreen} />
    </div>
  );
}

function TestersCard({ data }: { data: Overview }): React.ReactElement {
  const { total, completed, byRole } = data.sessions;
  return (
    <SectionCard className="p-5" labelledBy="fb2-testers-heading">
      <h2 id="fb2-testers-heading" className="text-lg font-semibold text-[var(--color-text)]">Testers so far</h2>
      <p className="mt-2 text-3xl font-bold text-[var(--color-text)]" data-testid="fb2-testers-total">
        {completed} of {total} finished
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        {(['customer', 'provider', 'both'] as const).map((side) => (
          <div key={side} className="rounded-md border border-[var(--color-border)] p-3">
            <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">{SIDE_LABELS[side]}</dt>
            <dd className="mt-1 text-lg font-semibold text-[var(--color-text)]">{byRole[side] ?? 0}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Testers marked as junk are left out of every number on this page.</p>
    </SectionCard>
  );
}

function MissionsCard({ data }: { data: Overview }): React.ReactElement {
  return (
    <SectionCard className="p-5" labelledBy="fb2-missions-heading">
      <h2 id="fb2-missions-heading" className="text-lg font-semibold text-[var(--color-text)]">Missions</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Ease is the tester's own score from 1 (very difficult) to 7 (very easy). "Low ease" means an average under {LOW_EASE}.
        "Low completion" means fewer than {LOW_COMPLETION}% managed it.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Results for each mission</caption>
          <thead className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-tertiary)]">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">Mission</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Answered</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Did it</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Partly</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Could not</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Gave up</th>
              <th scope="col" className="py-2 font-semibold">Average ease (out of 7)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {data.missions.map((mission) => {
              const lowCompletion = mission.completionRate !== null && mission.completionRate < LOW_COMPLETION;
              const lowEase = mission.averageEase !== null && mission.averageEase < LOW_EASE;
              return (
                <tr key={mission.key} data-testid={`fb2-mission-${mission.key}`}>
                  <th scope="row" className="py-2 pr-3 align-top font-medium text-[var(--color-text)]">
                    {mission.title}
                    <span className="block text-xs font-normal text-[var(--color-text-tertiary)]">{SIDE_LABELS[mission.role] ?? mission.role}</span>
                  </th>
                  <td className="py-2 pr-3 align-top">{mission.answered}</td>
                  <td className="py-2 pr-3 align-top">
                    {mission.completionRate === null ? 'No answers yet' : `${mission.completionRate}% (${mission.done} of ${mission.answered})`}
                    {lowCompletion && <><br /><WarningFlag>Low completion</WarningFlag></>}
                  </td>
                  <td className="py-2 pr-3 align-top">{mission.partly}</td>
                  <td className="py-2 pr-3 align-top">{mission.no}</td>
                  <td className="py-2 pr-3 align-top">{mission.gaveUp}</td>
                  <td className="py-2 align-top">
                    {mission.averageEase === null
                      ? 'No answers yet'
                      : `${mission.averageEase} / 7 (from ${mission.answered} ${mission.answered === 1 ? 'answer' : 'answers'})`}
                    {lowEase && <><br /><WarningFlag>Low ease</WarningFlag></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function UsabilityCard({ sus }: { sus: Overview['sus'] }): React.ReactElement {
  return (
    <SectionCard className="p-5" labelledBy="fb2-sus-heading">
      <h2 id="fb2-sus-heading" className="text-lg font-semibold text-[var(--color-text)]">Usability score</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">From the 10 statements at the end of the test (the System Usability Scale).</p>
      {sus.responses < 1 || sus.average === null ? (
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">No tester has finished the wrap-up yet.</p>
      ) : (
        <>
          <p className="mt-3 text-3xl font-bold text-[var(--color-text)]" data-testid="fb2-sus-average">{sus.average} out of 100</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            From {sus.responses} {sus.responses === 1 ? 'tester' : 'testers'}. Lowest {sus.lowest ?? 'n/a'}, highest {sus.highest ?? 'n/a'}.
          </p>
          <p className="mt-3 text-sm text-[var(--color-text)]">
            How to read it: 68 is about average for apps. Above 80 is good. Below 50 means serious problems.
          </p>
          {sus.responses < RELIABLE_SUS_RESPONSES && (
            <p className="mt-2"><WarningFlag>Fewer than {RELIABLE_SUS_RESPONSES} testers have answered, so this number is not reliable yet.</WarningFlag></p>
          )}
        </>
      )}
    </SectionCard>
  );
}

function ScreensCard({ data, study, onOpenScreen }: {
  data: Overview;
  study: Study;
  onOpenScreen: (screenKey: string) => void;
}): React.ReactElement {
  const rows = [...data.problemsByScreen].sort((a, b) => b.testers - a.testers || b.reports - a.reports);
  return (
    <SectionCard className="p-5" labelledBy="fb2-screens-heading">
      <h2 id="fb2-screens-heading" className="text-lg font-semibold text-[var(--color-text)]">Problems by screen</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Sorted by how many different testers hit a problem there. Reports marked dismissed or as the same as another report are not counted.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">No problems reported yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Problem reports grouped by screen</caption>
            <thead className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-tertiary)]">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">Screen</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Different testers</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Reports</th>
                {study.severities.map((severity) => (
                  <th key={severity.key} scope="col" className="py-2 pr-3 font-semibold">{severity.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.screenKey ?? 'none'} data-testid={`fb2-screen-${row.screenKey ?? 'none'}`}>
                  <th scope="row" className="py-2 pr-3 font-medium">
                    {row.screenKey ? (
                      <button
                        type="button"
                        className="text-left text-[var(--color-secondary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
                        onClick={() => onOpenScreen(row.screenKey!)}
                      >
                        {row.screenName}
                        <span className="sr-only">: show its problems</span>
                      </button>
                    ) : (
                      <span className="text-[var(--color-text)]">{row.screenName}</span>
                    )}
                  </th>
                  <td className="py-2 pr-3">{row.testers}</td>
                  <td className="py-2 pr-3">{row.reports}</td>
                  {study.severities.map((severity) => (
                    <td key={severity.key} className="py-2 pr-3">{row.bySeverity[severity.key] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
