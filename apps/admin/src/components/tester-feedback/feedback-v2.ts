// Tester feedback version 2 (Ken, 2026-10-12): shapes and fetchers for the
// admin views. The API lives at /api/v1/admin/feedback/v2 and its shapes are
// defined in packages/api/src/services/feedback-study-admin.service.ts. All
// study wording (missions, questions, severities) comes from GET /study, so
// this file holds no tester-facing text of its own.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import api from '@/lib/api';

export const FEEDBACK_V2_BASE = '/api/v1/admin/feedback/v2';

export type StudySide = 'customer' | 'provider' | 'both';

export interface StudyQuestion {
  key: string;
  label: string;
  hint?: string;
  required: boolean;
  maxLength: number;
  roles?: Array<'customer' | 'provider'>;
}

export interface Study {
  version: string;
  missions: Array<{ key: string; role: 'customer' | 'provider'; title: string; goal: string; stopAt: string; needsApprovedProvider: boolean }>;
  missionQuestions: StudyQuestion[];
  missionOutcomes: Array<{ key: string; label: string }>;
  seq: { question: string; low: string; high: string };
  firstImpression: StudyQuestion[];
  problemQuestions: StudyQuestion[];
  severities: Array<{ key: string; label: string; hint: string }>;
  helpMethods: Array<{ key: string; label: string }>;
  sus: { items: string[]; scale: { low: string; high: string } };
  wrapup: StudyQuestion[];
  prices: { services: Array<{ key: string; name: string }>; points: Array<{ key: string; label: string }> };
  screens: Array<{ key: string; side: string; name: string }>;
}

export interface MissionStat {
  key: string;
  role: 'customer' | 'provider';
  title: string;
  answered: number;
  done: number;
  partly: number;
  no: number;
  gaveUp: number;
  completionRate: number | null;
  averageEase: number | null;
}

export interface ScreenProblemStat {
  screenKey: string | null;
  screenName: string;
  reports: number;
  testers: number;
  bySeverity: Record<string, number>;
}

export interface Overview {
  sessions: { total: number; completed: number; byRole: Record<string, number> };
  missions: MissionStat[];
  sus: { responses: number; average: number | null; lowest: number | null; highest: number | null };
  problemsByScreen: ScreenProblemStat[];
}

export const PROBLEM_STATUSES = ['new', 'triaged', 'planned', 'done', 'dismissed', 'duplicate'] as const;
export type ProblemStatus = typeof PROBLEM_STATUSES[number];
export const SEVERITY_KEYS = ['stopped', 'slowed', 'annoyed', 'looks_wrong'] as const;

export interface FeedbackEntry {
  id: string;
  sessionId: string;
  kind: 'first_impression' | 'mission' | 'problem' | 'wrapup' | string;
  itemKey: string;
  createdAt: string;
  updatedAt: string;
  missionOutcome: string | null;
  seq: number | null;
  severity: string | null;
  screenKey: string | null;
  screenName: string | null;
  screenRoute: string | null;
  /** The app version the tester was using when they sent this (optional). */
  appVersion?: string | null;
  answers: Record<string, unknown>;
  sus: number[] | null;
  susScore: number | null;
  prices: Record<string, Record<string, number | null> | null> | null;
  screenshots: string[];
  status: ProblemStatus;
  duplicateOf: string | null;
  assignedAdminId: string | null;
  triageNote: string | null;
}

export interface ProblemEntry extends FeedbackEntry {
  sessionRole: StudySide;
}

export interface ProblemList {
  total: number;
  page: number;
  pageSize: number;
  problems: ProblemEntry[];
}

export interface TesterSession {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  studyVersion: string;
  role: StudySide;
  deviceKind: string | null;
  appSurface: string | null;
  platformDetail: string | null;
  appVersion: string | null;
  helpMethods: string[];
  testerName: string | null;
  testerContact: string | null;
  hasContact: boolean;
  completedAt: string | null;
  status: 'active' | 'completed' | 'dismissed' | string;
}

export interface TesterSessionRow extends TesterSession {
  missions: number;
  problems: number;
}

export interface SessionList {
  total: number;
  page: number;
  pageSize: number;
  sessions: TesterSessionRow[];
}

export interface SessionDetail {
  session: TesterSession;
  entries: FeedbackEntry[];
}

/** One triage decision, the way GET /problems/:id/history returns it. */
export interface TriageState {
  status: ProblemStatus | string;
  assignedAdminId: string | null;
  triageNote: string | null;
  duplicateOf: string | null;
}

export interface ProblemHistoryItem {
  at: string;
  adminId: string | null;
  adminName: string | null;
  from: TriageState | null;
  to: TriageState | null;
}

/** Erasing a tester session returns how much was deleted. */
export interface EraseResult {
  entries: number;
  screenshots: number;
}

export interface AdminOwner {
  id: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'super_admin';
}

export interface ProblemFilters {
  status: ProblemStatus | '';
  severity: string;
  screenKey: string;
  page: number;
}

export const PROBLEMS_PAGE_SIZE = 25;
export const SESSIONS_PAGE_SIZE = 25;

export const STATUS_LABELS: Record<ProblemStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  planned: 'Planned',
  done: 'Done',
  dismissed: 'Dismissed',
  duplicate: 'Same as another report',
};

export const SIDE_LABELS: Record<string, string> = {
  customer: 'Customer side',
  provider: 'Provider side',
  both: 'Both sides',
};

export const DEVICE_LABELS: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer' };
export const SURFACE_LABELS: Record<string, string> = { apk: 'Android app', browser: 'Web browser', both: 'App and browser' };

export const SESSION_STATUS_LABELS: Record<string, string> = {
  active: 'In progress',
  completed: 'Finished',
  dismissed: 'Junk',
};

/** The same label the API gives a session ("Tester " + the first 6 characters of its id). */
export function testerLabel(sessionId: string): string {
  return `Tester ${sessionId.slice(0, 6)}`;
}

/** The app version a tester gave with an answer, in words. */
export function appVersionText(version: string | null | undefined): string {
  const trimmed = version?.trim();
  return trimmed ? `App version ${trimmed}` : 'App version not given';
}

export function fmtManila(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function severityLabel(study: Study, key: string | null): string {
  if (!key) return 'How bad: not given';
  return study.severities.find((severity) => severity.key === key)?.label ?? key;
}

export function answerText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value.trim() : String(value);
  return text.length ? text : null;
}

export function isConflict(error: unknown): boolean {
  return error instanceof Error && 'status' in error && (error as { status?: unknown }).status === 409;
}

export function useFeedbackStudy() {
  return useQuery({
    queryKey: ['feedback-v2-study'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Study }>(`${FEEDBACK_V2_BASE}/study`);
      return response.data.data;
    },
    staleTime: Infinity,
  });
}

export function problemHistoryKey(problemId: string): readonly ['feedback-v2-problem-history', string] {
  return ['feedback-v2-problem-history', problemId] as const;
}

export function useProblemHistory(problemId: string, enabled: boolean): UseQueryResult<ProblemHistoryItem[]> {
  return useQuery({
    queryKey: problemHistoryKey(problemId),
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: ProblemHistoryItem[] }>(
        `${FEEDBACK_V2_BASE}/problems/${encodeURIComponent(problemId)}/history`,
      );
      return response.data.data;
    },
    enabled,
  });
}

export function useAdminOwners() {
  // Same source and cache key as the version 1 queue's owner picker.
  return useQuery({
    queryKey: ['assignable-admin-agents'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: AdminOwner[] }>('/api/v1/support-tickets/agents');
      return response.data.data;
    },
  });
}

export function ownerName(owners: AdminOwner[] | undefined, id: string | null): string {
  if (!id) return 'Unassigned';
  const owner = owners?.find((candidate) => candidate.id === id);
  return owner ? `${owner.first_name} ${owner.last_name}` : 'An admin (name not loaded)';
}
