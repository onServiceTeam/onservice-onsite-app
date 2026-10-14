/**
 * D38 Milestone 3 (Ken, 2026-10-13): shared types, requests and wording for
 * the Marketplace back office (MarketplacePage tabs, MarketplaceAlertBanner,
 * the dashboard card and Booking 360 "Who was notified").
 *
 * Contract: packages/api/src/routes/marketplace-health-admin.routes.ts,
 * mounted at /api/v1/admin/marketplace-health (admin and super_admin only;
 * dpo gets 403). Shapes mirror marketplace-health.service.ts and
 * marketplace-alert.service.ts. Every endpoint only reads, except
 * acknowledging an alert. Provider phone numbers arrive masked for every role
 * except super_admin; the full number comes only from the audit-logged
 * POST /api/v1/admin/providers/:id/reveal-contact (ProviderCallButton).
 *
 * A response that is not the documented shape is an error, never "nothing
 * to show": an empty queue must mean the server said it is empty.
 */
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';

export const MARKETPLACE_API = '/api/v1/admin/marketplace-health';

/** Every marketplace query key starts with this, so one invalidation refreshes them all. */
export const MARKETPLACE_QUERY_ROOT = 'marketplace';

export const marketplaceKeys = {
  all: [MARKETPLACE_QUERY_ROOT] as const,
  alerts: [MARKETPLACE_QUERY_ROOT, 'alerts', 'open'] as const,
  summary: [MARKETPLACE_QUERY_ROOT, 'summary'] as const,
  openRequests: [MARKETPLACE_QUERY_ROOT, 'open-requests'] as const,
  invites: (bookingId: string) => [MARKETPLACE_QUERY_ROOT, 'invites', bookingId] as const,
  responseTimes: (params: Record<string, string | undefined>) => [MARKETPLACE_QUERY_ROOT, 'response-times', params] as const,
  lost: (params: Record<string, string | number | undefined>) => [MARKETPLACE_QUERY_ROOT, 'lost', params] as const,
  providers: (params: Record<string, string | number | undefined>) => [MARKETPLACE_QUERY_ROOT, 'providers', params] as const,
  coverage: [MARKETPLACE_QUERY_ROOT, 'coverage'] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────

export type WaitSeverity = 'none' | 'amber' | 'red';

export interface OpenRequestRow {
  bookingId: string;
  categoryName: string | null;
  subcategoryName: string | null;
  barangay: string | null;
  city: string | null;
  urgency: string | null;
  scheduledAt: string | null;
  createdAt: string;
  waitingSince: string;
  waitMinutes: number;
  waitingOn: 'providers' | 'customer';
  severity: WaitSeverity;
  round: number;
  maxRounds: number;
  notified: number;
  viewed: number;
  responded: number;
  notifiedTotal: number;
  viewedTotal: number;
  respondedTotal: number;
  liveQuotes: number;
  totalQuotes: number;
  declinedQuotes: number;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  budgetUnknown: boolean;
  opsReviewAt: string | null;
  opsReviewReason: string | null;
  openAlertIds: string[];
  customer: { id: string; displayName: string };
}

export interface WaitThresholds {
  amberMinutes: number;
  redMinutes: number;
}

export interface OpenRequestsResult {
  requests: OpenRequestRow[];
  thresholds: WaitThresholds | null;
  maxRounds: number | null;
  /** Server time when the list was made (API clock), if sent. */
  generatedAt: string | null;
}

export interface RequestInviteRow {
  inviteId: string;
  providerId: string;
  providerName: string;
  phone: string | null;
  contactMasked: boolean;
  round: number;
  source: string;
  status: string;
  sentAt: string;
  viewedAt: string | null;
  respondedAt: string | null;
  responseMinutes: number | null;
  quoteId: string | null;
  quoteStatus: string | null;
}

export interface RequestInvitesResult {
  applicable: boolean;
  currentRound: number | null;
  invites: RequestInviteRow[];
}

export const RESPONSE_TIME_GROUPS = ['category', 'city', 'category_city'] as const;
export type ResponseTimeGroup = typeof RESPONSE_TIME_GROUPS[number];

export interface ResponseTimeGroupRow {
  categoryName?: string | null;
  city?: string | null;
  requests: number;
  responded: number;
  noResponse: number;
  p50Minutes: number | null;
  p90Minutes: number | null;
  within30Pct: number | null;
}

export interface ResponseTimesResult {
  groups: ResponseTimeGroupRow[];
  overall: ResponseTimeGroupRow | null;
  from: string | null;
  to: string | null;
  /**
   * How these rows are grouped: meta.groupBy, else the grouping that was
   * asked for. Labels must follow this, not the toggle, because the previous
   * figures stay on screen while a new grouping loads.
   */
  groupBy: ResponseTimeGroup;
}

export const LOST_REASONS = [
  'no_eligible_provider',
  'notified_none_viewed',
  'viewed_none_responded',
  'customer_declined_all_rounds',
  'customer_cancelled_waiting',
  'expired_no_response',
] as const;
export type LostReason = typeof LOST_REASONS[number];

export interface LostOpportunityRow {
  bookingId: string;
  reason: LostReason;
  closedBy: 'customer' | 'provider' | 'admin' | 'system';
  status: string;
  cancellationReason: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  barangay: string | null;
  city: string | null;
  createdAt: string;
  closedAt: string;
  rounds: number;
  invited: number;
  viewed: number;
  quotes: number;
  declinedQuotes: number;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  budgetUnknown: boolean;
  estimatedValueCentavos: number | null;
}

export interface LostOpportunitySummary {
  total: number;
  byReason: Partial<Record<LostReason, number>>;
  estimatedValueCentavos: number;
  withoutBudget: number;
}

export interface LostOpportunitiesResult {
  rows: LostOpportunityRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: LostOpportunitySummary | null;
  from: string | null;
  to: string | null;
}

export const PROVIDER_SORTS = ['invites', 'slowest', 'lowest_response_rate'] as const;
export type ProviderSort = typeof PROVIDER_SORTS[number];

export interface ProviderResponsivenessRow {
  providerId: string;
  providerName: string;
  providerStatus: string;
  isAvailable: boolean;
  phone: string | null;
  contactMasked: boolean;
  invites: number;
  notified: number;
  viewed: number;
  responded: number;
  viewedRate: number | null;
  responseRate: number | null;
  medianResponseMinutes: number | null;
  quotesAccepted: number;
  lastActiveAt: string | null;
}

export interface ProvidersResult {
  rows: ProviderResponsivenessRow[];
  total: number;
  page: number;
  pageSize: number;
  from: string | null;
  to: string | null;
}

export interface CoverageCell {
  areaId: string;
  categoryId: string;
  approvedProviders: number;
  responsiveProviders: number;
  requests30d: number;
  belowThreshold: boolean;
}

export interface CoverageGrid {
  threshold: number;
  areas: Array<{ id: string; name: string; status: string }>;
  categories: Array<{ id: string; name: string }>;
  cells: CoverageCell[];
}

export type AlertKind = 'request_waiting_amber' | 'request_waiting_red' | 'request_needs_ops' | 'request_unfilled';

export interface MarketplaceAlert {
  id: string;
  bookingId: string;
  kind: AlertKind;
  severity: 'amber' | 'red';
  round: number;
  anchorAt: string;
  thresholdMinutes: number | null;
  details: Record<string, unknown>;
  raisedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string | null } | null;
  resolvedAt: string | null;
  resolution: string | null;
  serviceName: string | null;
  barangay: string | null;
  city: string | null;
  currentWaitMinutes: number | null;
}

export interface AlertsResult {
  alerts: MarketplaceAlert[];
  openCount: number;
  unacknowledgedCount: number;
  openRedCount: number;
}

export interface MarketplaceSummary {
  waitingCount: number;
  waitingOverAmber: number;
  waitingOverRed: number;
  awaitingCustomer: number;
  openAlerts: number;
  unacknowledgedAlerts: number;
  amberMinutes: number;
  redMinutes: number;
}

// ─── Reading responses ──────────────────────────────────────────────────

interface Envelope {
  data: unknown;
  meta: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function getEnvelope(path: string, params?: Record<string, unknown>): Promise<Envelope> {
  const response = await api.get<{ success?: boolean; data?: unknown; meta?: unknown }>(`${MARKETPLACE_API}${path}`, { params });
  const body = response.data;
  return { data: body?.data, meta: isRecord(body?.meta) ? body.meta : {} };
}

function unreadable(what: string): Error {
  return new Error(`The ${what} response could not be read.`);
}

function readArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw unreadable(what);
  return value as T[];
}

export async function fetchOpenRequests(limit = 100): Promise<OpenRequestsResult> {
  const { data, meta } = await getEnvelope('/open-requests', { limit });
  const requests = readArray<OpenRequestRow>(data, 'waiting requests');
  const thresholds = isFiniteNumber(meta.amberMinutes) && isFiniteNumber(meta.redMinutes)
    ? { amberMinutes: meta.amberMinutes, redMinutes: meta.redMinutes }
    : null;
  return {
    requests,
    thresholds,
    maxRounds: isFiniteNumber(meta.maxRounds) ? meta.maxRounds : null,
    generatedAt: stringOrNull(meta.generatedAt),
  };
}

export async function fetchRequestInvites(bookingId: string): Promise<RequestInvitesResult> {
  const { data, meta } = await getEnvelope(`/bookings/${encodeURIComponent(bookingId)}/invites`);
  return {
    invites: readArray<RequestInviteRow>(data, 'notified providers'),
    applicable: meta.applicable !== false,
    currentRound: isFiniteNumber(meta.currentRound) ? meta.currentRound : null,
  };
}

export async function fetchResponseTimes(params: { from?: string; to?: string; groupBy: ResponseTimeGroup }): Promise<ResponseTimesResult> {
  const { data, meta } = await getEnvelope('/response-times', params);
  return {
    groups: readArray<ResponseTimeGroupRow>(data, 'response times'),
    overall: isRecord(meta.overall) ? (meta.overall as unknown as ResponseTimeGroupRow) : null,
    from: stringOrNull(meta.from),
    to: stringOrNull(meta.to),
    groupBy: RESPONSE_TIME_GROUPS.includes(meta.groupBy as ResponseTimeGroup)
      ? (meta.groupBy as ResponseTimeGroup)
      : params.groupBy,
  };
}

export async function fetchLostOpportunities(params: {
  from?: string; to?: string; reason?: LostReason; page: number; pageSize: number;
}): Promise<LostOpportunitiesResult> {
  const { data, meta } = await getEnvelope('/lost-opportunities', params);
  const rows = readArray<LostOpportunityRow>(data, 'lost requests');
  return {
    rows,
    total: numberOr(meta.total, rows.length),
    page: numberOr(meta.page, params.page),
    pageSize: numberOr(meta.pageSize, params.pageSize),
    summary: isRecord(meta.summary) ? (meta.summary as unknown as LostOpportunitySummary) : null,
    from: stringOrNull(meta.from),
    to: stringOrNull(meta.to),
  };
}

export async function fetchProviderResponsiveness(params: {
  from?: string; to?: string; sort: ProviderSort; page: number; pageSize: number;
}): Promise<ProvidersResult> {
  const { data, meta } = await getEnvelope('/providers', params);
  const rows = readArray<ProviderResponsivenessRow>(data, 'provider responsiveness');
  return {
    rows,
    total: numberOr(meta.total, rows.length),
    page: numberOr(meta.page, params.page),
    pageSize: numberOr(meta.pageSize, params.pageSize),
    from: stringOrNull(meta.from),
    to: stringOrNull(meta.to),
  };
}

export async function fetchCoverage(): Promise<CoverageGrid> {
  const { data } = await getEnvelope('/coverage');
  if (!isRecord(data) || !isFiniteNumber(data.threshold) || !Array.isArray(data.areas)
    || !Array.isArray(data.categories) || !Array.isArray(data.cells)) {
    throw unreadable('coverage');
  }
  return data as unknown as CoverageGrid;
}

export async function fetchOpenAlerts(): Promise<AlertsResult> {
  const { data, meta } = await getEnvelope('/alerts', { status: 'open', limit: 50 });
  const alerts = readArray<MarketplaceAlert>(data, 'request alerts');
  return {
    alerts,
    openCount: numberOr(meta.openCount, alerts.length),
    unacknowledgedCount: numberOr(meta.unacknowledgedCount, alerts.filter((alert) => !alert.acknowledgedAt).length),
    openRedCount: numberOr(meta.openRedCount, alerts.filter((alert) => alert.severity === 'red').length),
  };
}

/** The dashboard card's figures; null when the response is not the summary object. */
export function readMarketplaceSummary(value: unknown): MarketplaceSummary | null {
  if (!isRecord(value)) return null;
  const keys: Array<keyof MarketplaceSummary> = [
    'waitingCount', 'waitingOverAmber', 'waitingOverRed', 'awaitingCustomer',
    'openAlerts', 'unacknowledgedAlerts', 'amberMinutes', 'redMinutes',
  ];
  return keys.every((key) => isFiniteNumber(value[key])) ? (value as unknown as MarketplaceSummary) : null;
}

export async function fetchMarketplaceSummary(): Promise<MarketplaceSummary | null> {
  const { data } = await getEnvelope('/summary');
  return readMarketplaceSummary(data);
}

export async function acknowledgeMarketplaceAlert(alertId: string): Promise<MarketplaceAlert> {
  const response = await api.post<{ success?: boolean; data?: MarketplaceAlert }>(
    `${MARKETPLACE_API}/alerts/${encodeURIComponent(alertId)}/acknowledge`,
    {},
  );
  return response.data?.data as MarketplaceAlert;
}

// ─── Wording and formatting ─────────────────────────────────────────────

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "12 min", "1 h 5 min", "2 d 3 h". */
export function formatWait(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

/** A measured duration such as a median: "8.5 min", "1 h 5 min"; a dash with no value. */
export function formatDurationMinutes(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '-';
  if (value < 60) return `${Math.round(value * 10) / 10} min`;
  return formatWait(Math.round(value));
}

/** A 0-1 rate as a whole percentage, or a dash. */
export function formatRate(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${Math.round(value * 100)}%` : '-';
}

/** A 0-100 percentage with up to one decimal, or a dash. */
export function formatPercent(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${Math.round(value * 10) / 10}%` : '-';
}

const MANILA_DATE_TIME: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString('en-PH', MANILA_DATE_TIME);
}

export function formatManilaTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? '-'
    : parsed.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

/** The customer's budget in pesos, or "Budget not given". */
export function budgetText(min: number | null, max: number | null, unknown: boolean): string {
  if (unknown || (min === null && max === null)) return 'Budget not given';
  if (min !== null && max !== null) {
    return min === max ? formatCurrency(min) : `${formatCurrency(min)} to ${formatCurrency(max)}`;
  }
  if (max !== null) return `Up to ${formatCurrency(max)}`;
  return `From ${formatCurrency(min)}`;
}

export function serviceLabel(subcategoryName: string | null, categoryName: string | null): string {
  return subcategoryName ?? categoryName ?? 'Service not recorded';
}

export function areaLabel(barangay: string | null, city: string | null): string {
  const parts = [barangay, city].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  return parts.length > 0 ? parts.join(', ') : 'Area not recorded';
}

export function severityFor(minutes: number, thresholds: WaitThresholds | null): WaitSeverity {
  if (!thresholds) return 'none';
  if (minutes >= thresholds.redMinutes) return 'red';
  if (minutes >= thresholds.amberMinutes) return 'amber';
  return 'none';
}

const SEVERITY_RANK: Record<WaitSeverity, number> = { none: 0, amber: 1, red: 2 };

export function higherSeverity(a: WaitSeverity, b: WaitSeverity): WaitSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export const OPS_REVIEW_REASON_LABELS: Record<string, string> = {
  max_rounds: 'The customer declined quotes in every round',
  no_eligible_providers: 'No provider could be notified',
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  no_eligible_provider: 'No eligible provider',
  notified_none_viewed: 'Providers notified, none opened it',
  viewed_none_responded: 'Opened, but nobody sent a quote',
  customer_declined_all_rounds: 'Customer declined the quotes',
  customer_cancelled_waiting: 'Customer cancelled while waiting',
  expired_no_response: 'Closed with no booking',
};

export const CLOSED_BY_LABELS: Record<LostOpportunityRow['closedBy'], string> = {
  customer: 'Customer',
  provider: 'Provider',
  admin: 'Admin',
  system: 'System',
};

export const INVITE_STATUS_LABELS: Record<string, string> = {
  sent: 'Not opened yet',
  viewed: 'Opened, no quote yet',
  quoted: 'Sent a quote',
  declined: 'Quote declined by the customer',
  taken: 'Closed: enough quotes arrived',
  expired: 'Closed before they answered',
  passed: 'Withdrew their quote',
};

export const INVITE_SOURCE_LABELS: Record<string, string> = {
  push: 'Notified',
  inbox: 'Found it in their list',
};

export function humanize(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  request_waiting_amber: 'No quote yet',
  request_waiting_red: 'No quote yet',
  request_needs_ops: 'Needs back-office review',
  request_unfilled: 'Closed with no quote',
};

/** A tel: link target, digits and a leading plus only. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}
