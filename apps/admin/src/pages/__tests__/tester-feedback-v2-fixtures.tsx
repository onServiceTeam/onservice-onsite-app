// Fixtures for the tester feedback version 2 admin views. Only the network
// layer (@/lib/api) is mocked; the page, tabs, React Query and the real
// router render for real. The study below copies the wording shape of
// packages/api/src/config/feedback-study.ts (publicStudy()), trimmed to what
// the views read.

import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import api from '@/lib/api';
import TesterFeedbackPage from '../TesterFeedbackPage';
import { getFeedbackFixture } from './feedback-test-fixtures';

export const V2 = '/api/v1/admin/feedback/v2';
export const SESSION_A = 'a1b2c3d4-0000-4000-8000-000000000001';
export const SESSION_B = 'b2c3d4e5-0000-4000-8000-000000000002';
export const PROBLEM_1 = '11111111-aaaa-4aaa-8aaa-000000000001';
export const PROBLEM_2 = '22222222-bbbb-4bbb-8bbb-000000000002';
export const SHOT = '0f0e0d0c-0b0a-4909-8807-060504030201.png';

export const study = {
  version: '2.0',
  missions: [
    { key: 'c_aircon', role: 'customer', title: 'Aircon cleaning', goal: 'Your aircon is dripping and not cooling well.', stopAt: 'Stop when the app asks you to pay.', needsApprovedProvider: false },
    { key: 'c_leak', role: 'customer', title: 'Leaking tap', goal: 'A tap in your kitchen keeps leaking.', stopAt: 'Stop when you think you have found it.', needsApprovedProvider: false },
    { key: 'p_hours', role: 'provider', title: 'Your working hours', goal: 'Set your working hours.', stopAt: 'Stop when they are saved.', needsApprovedProvider: true },
  ],
  missionQuestions: [
    { key: 'why', label: 'Why did you give that score?', required: true, maxLength: 2000 },
    { key: 'expected', label: 'What did you expect to happen that did not?', required: false, maxLength: 2000 },
    { key: 'change', label: 'What is one thing you would change on these screens?', required: false, maxLength: 2000 },
  ],
  missionOutcomes: [
    { key: 'done', label: 'Yes, I did it' },
    { key: 'partly', label: 'Partly' },
    { key: 'no', label: 'No, I could not' },
    { key: 'gave_up', label: 'I gave up' },
  ],
  seq: { question: 'Overall, how difficult or easy was this mission?', low: 'Very difficult', high: 'Very easy' },
  firstImpression: [
    { key: 'what_for', label: 'What do you think this app is for?', required: true, maxLength: 1000 },
    { key: 'who_for', label: 'Who do you think it is for?', required: false, maxLength: 1000 },
  ],
  problemQuestions: [
    { key: 'trying', label: 'What were you trying to do?', required: true, maxLength: 2000 },
    { key: 'happened', label: 'What happened?', required: true, maxLength: 3000 },
    { key: 'expected', label: 'What did you expect to happen?', required: false, maxLength: 2000 },
  ],
  severities: [
    { key: 'stopped', label: 'It stopped me', hint: 'I could not continue.' },
    { key: 'slowed', label: 'It slowed me down', hint: 'I got there, but it took effort.' },
    { key: 'annoyed', label: 'It annoyed me', hint: 'It worked, but it bothered me.' },
    { key: 'looks_wrong', label: 'It just looks wrong', hint: 'Wording, layout, colours, a typo.' },
  ],
  helpMethods: [
    { key: 'facebook', label: 'Facebook groups or Marketplace' },
    { key: 'referral', label: 'Someone a friend or neighbour recommends' },
  ],
  sus: {
    items: [
      'I think that I would like to use this app often.',
      'I found the app more complicated than it needs to be.',
      'I thought the app was easy to use.',
      'I think I would need help from a technical person to be able to use this app.',
      'I found the different parts of this app worked well together.',
      'I thought there were too many things in this app that did not match each other.',
      'I would imagine that most people would learn to use this app very quickly.',
      'I found the app very awkward to use.',
      'I felt very confident using the app.',
      'I needed to learn a lot of things before I could get going with this app.',
    ],
    scale: { low: 'Strongly disagree', high: 'Strongly agree' },
  },
  wrapup: [
    { key: 'change_1', label: 'The first thing you would change', required: true, maxLength: 2000 },
    { key: 'would_use', label: 'Would you use this instead of how you get help today? Why or why not?', required: true, maxLength: 2000, roles: ['customer'] },
  ],
  prices: {
    services: [{ key: 'aircon_clean', name: 'Cleaning one split-type aircon' }],
    points: [
      { key: 'too_cheap', label: 'So cheap you would doubt the quality' },
      { key: 'bargain', label: 'A good deal' },
      { key: 'expensive', label: 'Starting to feel expensive' },
      { key: 'too_expensive', label: 'Too expensive, you would not book it' },
    ],
  },
  screens: [
    { key: 'booking_time', side: 'customer', name: 'Choosing a booking time' },
    { key: 'other', side: 'start', name: 'Somewhere else / not sure' },
  ],
};

export const overview = {
  sessions: { total: 7, completed: 3, byRole: { customer: 4, provider: 2, both: 1 } },
  missions: [
    { key: 'c_aircon', role: 'customer', title: 'Aircon cleaning', answered: 4, done: 2, partly: 1, no: 1, gaveUp: 0, completionRate: 50, averageEase: 4.2 },
    { key: 'c_leak', role: 'customer', title: 'Leaking tap', answered: 5, done: 5, partly: 0, no: 0, gaveUp: 0, completionRate: 100, averageEase: 6.4 },
    { key: 'p_hours', role: 'provider', title: 'Your working hours', answered: 0, done: 0, partly: 0, no: 0, gaveUp: 0, completionRate: null, averageEase: null },
  ],
  sus: { responses: 3, average: 61.7, lowest: 45, highest: 77.5 },
  problemsByScreen: [
    { screenKey: 'other', screenName: 'Somewhere else / not sure', reports: 4, testers: 1, bySeverity: { annoyed: 4 } },
    { screenKey: 'booking_time', screenName: 'Choosing a booking time', reports: 3, testers: 3, bySeverity: { stopped: 2, slowed: 1 } },
  ],
};

export function problem(overrides: Record<string, unknown> = {}) {
  return {
    id: PROBLEM_1,
    sessionId: SESSION_A,
    sessionRole: 'customer',
    kind: 'problem',
    itemKey: 'problem',
    createdAt: '2026-10-12T02:30:00.000Z',
    updatedAt: '2026-10-12T02:30:00.000Z',
    missionOutcome: null,
    seq: null,
    severity: 'stopped',
    screenKey: 'booking_time',
    screenName: 'Choosing a booking time',
    screenRoute: '/customer/booking/new',
    appVersion: '1.0.1',
    answers: { trying: 'Pick Saturday morning', happened: 'The time list stayed empty', expected: 'A list of times' },
    sus: null,
    susScore: null,
    prices: null,
    screenshots: [SHOT],
    status: 'new',
    duplicateOf: null,
    assignedAdminId: null,
    triageNote: null,
    ...overrides,
  };
}

export const problemList = {
  total: 2,
  page: 1,
  pageSize: 25,
  problems: [
    problem(),
    problem({
      id: PROBLEM_2, sessionId: SESSION_B, severity: 'slowed', screenshots: [], appVersion: null,
      answers: { trying: 'Choose a time slot', happened: 'No times showed for Saturday' },
    }),
  ],
};

export const sessionDetail = {
  session: {
    id: SESSION_A,
    label: 'Tester a1b2c3',
    createdAt: '2026-10-12T01:00:00.000Z',
    updatedAt: '2026-10-12T03:00:00.000Z',
    studyVersion: '2.0',
    role: 'customer',
    deviceKind: 'phone',
    appSurface: 'apk',
    platformDetail: 'Android 14',
    appVersion: '1.0.1',
    helpMethods: ['facebook'],
    testerName: 'Maria Santos',
    testerContact: '09171234567',
    hasContact: true,
    completedAt: '2026-10-12T03:00:00.000Z',
    status: 'completed',
  },
  entries: [
    { ...problem({ id: 'e0000000-0000-4000-8000-000000000001', kind: 'first_impression', itemKey: 'first_impression', severity: null, screenKey: null, screenName: null, screenRoute: null, screenshots: [], answers: { what_for: 'Booking cleaners and repairs' } }) },
    { ...problem({ id: 'e0000000-0000-4000-8000-000000000002', kind: 'mission', itemKey: 'c_aircon', missionOutcome: 'partly', seq: 3, severity: null, screenKey: null, screenName: null, screenRoute: null, screenshots: [], answers: { why: 'Saturday was hard to find', change: 'Show dates first' } }) },
    problem(),
    { ...problem({ id: 'e0000000-0000-4000-8000-000000000004', kind: 'wrapup', itemKey: 'wrapup', severity: null, screenKey: null, screenName: null, screenRoute: null, screenshots: [], sus: [4, 2, 4, 1, 3, 2, 4, 2, 3, 2], susScore: 72.5, answers: { change_1: 'Show prices sooner', would_use: 'Maybe, if workers are checked' }, prices: { aircon_clean: { too_cheap: 300, bargain: 600, expensive: 1200, too_expensive: 1800 } } }) },
  ],
};

export const sessionList = {
  total: 1,
  page: 1,
  pageSize: 25,
  sessions: [{ ...sessionDetail.session, missions: 1, problems: 1 }],
};

type Handler = (url: string, init?: { params?: Record<string, unknown> }) => unknown;

/** Routes GET calls to the fixtures; `overrides` replaces any single URL's answer. */
export function mockV2Api(overrides: Record<string, Handler> = {}): void {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.delete).mockReset();
  vi.mocked(api.get).mockImplementation((async (url: string, init?: { params?: Record<string, unknown> }) => {
    if (overrides[url]) return overrides[url]!(url, init);
    if (url === `${V2}/study`) return { data: { success: true, data: study } };
    if (url === `${V2}/overview`) return { data: { success: true, data: overview } };
    if (url === `${V2}/problems`) return { data: { success: true, data: problemList } };
    if (url === `${V2}/sessions`) return { data: { success: true, data: sessionList } };
    if (url === `${V2}/sessions/${SESSION_A}`) return { data: { success: true, data: sessionDetail } };
    if (url.startsWith(`${V2}/entries/`)) return { data: new Blob(['png-bytes'], { type: 'image/png' }) };
    return getFeedbackFixture(url);
  }) as never);
}

export function LocationProbe(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.pathname}{location.search}</output>
      <button type="button" hidden data-testid="browser-back" onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

/** history: earlier browser entries before path (the Back button walks into them). */
export function renderTesterFeedback(path = '/feedback', history: string[] = []): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[...history, path]} initialIndex={history.length}>
        <LocationProbe />
        <TesterFeedbackPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type ObserverCallback = ConstructorParameters<typeof window.IntersectionObserver>[0];
type Observer = InstanceType<typeof window.IntersectionObserver>;
type ObserverRecord = Parameters<ObserverCallback>[0][number];
type Watched = ObserverRecord['target'];

/** Installs a controllable IntersectionObserver; `reveal` scrolls every watched element into view. */
export function installIntersectionObserver(): { reveal: () => void; restore: () => void } {
  const watchers: Array<{ callback: ObserverCallback; elements: Watched[]; observer: Observer }> = [];
  class FakeObserver {
    private readonly watcher: { callback: ObserverCallback; elements: Watched[]; observer: Observer };
    constructor(callback: ObserverCallback) {
      this.watcher = { callback, elements: [], observer: this as unknown as Observer };
      watchers.push(this.watcher);
    }
    observe(element: Watched): void { this.watcher.elements.push(element); }
    unobserve(): void { /* not used */ }
    disconnect(): void { this.watcher.elements = []; }
    takeRecords(): ObserverRecord[] { return []; }
  }
  const previous = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
  Object.defineProperty(window, 'IntersectionObserver', { value: FakeObserver, configurable: true, writable: true });
  return {
    reveal: () => {
      for (const watcher of [...watchers]) {
        if (!watcher.elements.length) continue;
        const records = watcher.elements.map((target) => ({ target, isIntersecting: true }) as unknown as ObserverRecord);
        watcher.callback(records, watcher.observer);
      }
    },
    restore: () => {
      if (previous) Object.defineProperty(window, 'IntersectionObserver', previous);
      else delete (window as unknown as Record<string, unknown>).IntersectionObserver;
    },
  };
}

/** An error the way the API client raises it (ApiError carries the HTTP status). */
export function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}
