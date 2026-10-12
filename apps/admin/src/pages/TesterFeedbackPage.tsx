// The Tester Feedback route (/feedback). Version 2 views (Ken, 2026-10-12)
// as tabs: Overview (default), Problems, Testers, and Earlier feedback, which
// is the unchanged version 1 queue. The tab and the version 2 filters live in
// the URL so a view can be reloaded or shared; their names never collide with
// the version 1 queue's own parameters (status, area, search, page, feedbackId).
// A link that arrives with no tab but with any of those parameters opens
// Earlier feedback (see the note at isEarlierQueueLink).

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import FeedbackPage from './FeedbackPage';
import { OverviewTab } from '@/components/tester-feedback/OverviewTab';
import { ProblemsTab } from '@/components/tester-feedback/ProblemsTab';
import { TestersTab } from '@/components/tester-feedback/TestersTab';
import {
  PROBLEM_STATUSES, SEVERITY_KEYS, type ProblemFilters, type ProblemStatus,
} from '@/components/tester-feedback/feedback-v2';

const TABS = ['overview', 'problems', 'testers', 'earlier'] as const;
type NavOptions = { replace?: boolean };
type TabId = typeof TABS[number];

function isTab(value: string | null): value is TabId {
  return TABS.includes(value as TabId);
}

// Links made before version 2 (the audit log's "Open exact tester feedback",
// bookmarks of the old queue) carry the old queue's own parameters and no tab.
// They must keep opening the old queue, not the Overview. This is decided once,
// for the link the page opened with, and written into the URL as tab=earlier.
// It is not re-checked later: the old queue adds its own feedbackId to the URL
// when its list loads, and that late write must not pull an admin who already
// moved to another tab back to Earlier feedback.
const EARLIER_QUEUE_PARAMS = ['feedbackId', 'status', 'area', 'search', 'page'] as const;

function isEarlierQueueLink(params: URLSearchParams): boolean {
  return !params.has('tab') && EARLIER_QUEUE_PARAMS.some((key) => params.has(key));
}

function parseTab(value: string | null): TabId {
  return isTab(value) ? value : 'overview';
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseProblemFilters(params: URLSearchParams): ProblemFilters {
  const status = params.get('problemStatus');
  const severity = params.get('severity');
  const screen = params.get('screen');
  return {
    status: PROBLEM_STATUSES.includes(status as ProblemStatus) ? status as ProblemStatus : '',
    severity: SEVERITY_KEYS.includes(severity as typeof SEVERITY_KEYS[number]) ? severity as string : '',
    screenKey: screen && /^[a-z0-9_]{1,60}$/.test(screen) ? screen : '',
    page: parsePage(params.get('problemPage')),
  };
}

function parseTesterId(value: string | null): string | null {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function setOrDelete(params: URLSearchParams, key: string, value: string | number | null | undefined, empty: string | number = ''): void {
  if (value === null || value === undefined || value === empty) params.delete(key);
  else params.set(key, String(value));
}

export default function TesterFeedbackPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openedFromOldLink, setOpenedFromOldLink] = useState(() => isEarlierQueueLink(searchParams));
  const tabParam = searchParams.get('tab');
  // Until tab=earlier is in the URL, an old link shows Earlier feedback.
  const tab = openedFromOldLink && tabParam === null ? 'earlier' : parseTab(tabParam);

  useEffect(() => {
    if (!openedFromOldLink) return;
    if (tabParam !== null) {
      setOpenedFromOldLink(false);
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!next.has('tab')) next.set('tab', 'earlier');
      return next;
    }, { replace: true });
  }, [openedFromOldLink, tabParam, setSearchParams]);

  const problemFilters = parseProblemFilters(searchParams);
  const testerId = parseTesterId(searchParams.get('tester'));
  const testerPage = parsePage(searchParams.get('testerPage'));

  // replace: true for moves the admin did not ask for (a page past the end,
  // leaving a deleted tester), so Back never lands on a view that moves again.
  const update = (change: (next: URLSearchParams) => void, options?: NavOptions): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      change(next);
      return next;
    }, { replace: options?.replace === true });
  };

  const selectTab = (value: string): void => {
    setOpenedFromOldLink(false);
    // Always written out: with an old-queue parameter still in the URL, a
    // missing tab would reopen Earlier feedback on reload.
    update((next) => next.set('tab', parseTab(value)));
  };

  const changeProblemFilters = (changes: Partial<ProblemFilters>, options?: NavOptions): void => update((next) => {
    if (changes.status !== undefined) setOrDelete(next, 'problemStatus', changes.status);
    if (changes.severity !== undefined) setOrDelete(next, 'severity', changes.severity);
    if (changes.screenKey !== undefined) setOrDelete(next, 'screen', changes.screenKey);
    // Any filter change starts again from the first page.
    setOrDelete(next, 'problemPage', changes.page ?? 1, 1);
  }, options);

  const openScreen = (screenKey: string): void => update((next) => {
    next.set('tab', 'problems');
    next.set('screen', screenKey);
    next.delete('problemStatus');
    next.delete('severity');
    next.delete('problemPage');
  });

  const openTester = (sessionId: string | null, options?: NavOptions): void => update((next) => {
    next.set('tab', 'testers');
    setOrDelete(next, 'tester', sessionId);
  }, options);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Product operations</p>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-[var(--color-text)]">
          <MessageSquare size={24} /> Tester Feedback
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
          Results from the tester study at app.onservice.ph/feedback. Earlier feedback holds the reports sent with the old form.
        </p>
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList aria-label="Tester feedback views" className="flex h-auto min-h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
          <TabsTrigger className="min-h-11 shrink-0" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="problems">Problems</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="testers">Testers</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="earlier">Earlier feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab onOpenScreen={openScreen} />
        </TabsContent>
        <TabsContent value="problems" className="mt-4">
          <ProblemsTab filters={problemFilters} onFiltersChange={changeProblemFilters} onOpenTester={openTester} />
        </TabsContent>
        <TabsContent value="testers" className="mt-4">
          <TestersTab
            selectedId={testerId}
            page={testerPage}
            onSelect={openTester}
            onPageChange={(page, options) => update((next) => setOrDelete(next, 'testerPage', page, 1), options)}
          />
        </TabsContent>
        <TabsContent value="earlier" className="mt-4">
          <FeedbackPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
