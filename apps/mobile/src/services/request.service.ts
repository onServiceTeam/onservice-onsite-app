/**
 * D38 Milestone 2 (merged plan section 2.6, package P5b): the request-first
 * booking loop as the app sees it.
 *
 * Every function calls a real, committed endpoint:
 *   customer  GET  /api/v1/bookings/:id/request-status
 *             GET  /api/v1/bookings/requests/summary
 *             GET  /api/v1/bookings/:id/quotes
 *             GET  /api/v1/bookings/:id/quotes/:quoteId/confirm-preview
 *             POST /api/v1/bookings/:id/quotes/:quoteId/accept
 *             POST /api/v1/bookings/:id/quotes/:quoteId/decline   {reason, note?}
 *   provider  GET  /api/v1/providers/me/job-requests(?page)
 *             GET  /api/v1/providers/me/job-requests/summary
 *             GET  /api/v1/providers/me/job-requests/:bookingId
 *             POST /api/v1/bookings/:id/quotes
 *             POST /api/v1/bookings/:id/quotes/:quoteId/withdraw
 *             GET  /api/v1/providers/me/quotes(?status&page)
 *
 * Money: every amount here is centavos and comes from the server. The app
 * shows them; it never works out a price the server would trust. The one
 * number the app sends is the provider's own quote price, which the server
 * validates (and, for an itemized quote, recomputes from the line items).
 *
 * The second half of this file is the request vocabulary shared by the
 * provider and customer screens: time-window words, decline reasons and
 * Manila calendar dates. They are pure functions so every screen says the
 * same thing.
 */
import api from './api';

// ────────────────────────────────────────────────────────────────────
// Types (shapes of the API responses)
// ────────────────────────────────────────────────────────────────────

export type RequestStage =
  | 'waiting'
  | 'no_pros'
  | 'quote_ready'
  | 'reopened'
  | 'payment_pending'
  | 'booked'
  | 'closed';

/** GET /bookings/:id/request-status (booking.service getRequestStatus). */
export interface RequestStatus {
  bookingId: string;
  status: string;
  stage: RequestStage;
  serviceName: string | null;
  round: number;
  maxRounds: number;
  roundOpenedAt: string | null;
  /** Providers sent this round's request by push (invites with source 'push'). */
  notifiedProviderCount: number;
  openQuoteCount: number;
  maxOpenQuotes: number;
  stillLookingAfterMinutes: number;
  /** Server-decided: no live quote and the round has waited the configured minutes. */
  stillLooking: boolean;
  /** Set when the back office has been asked to look at this request. */
  opsReviewAt: string | null;
}

export type QuoteTimeWindow = 'morning' | 'afternoon' | 'evening' | 'asap';
export type DeclineReason = 'too_expensive' | 'timing' | 'changed_mind' | 'other';

export interface QuoteProvider {
  id: string;
  userId: string | null;
  name: string | null;
  photoUrl: string | null;
  ratingAverage: number;
  /** Visible reviews. */
  ratingCount: number;
  /** Fewer than 3 visible reviews (server-decided). */
  isNew: boolean;
  jobsCompleted: number;
}

export interface QuoteBudgetComparison {
  kind: 'within' | 'above' | 'no_budget';
  /** Centavos above the customer's budget maximum (only for 'above'). */
  aboveBy: number | null;
}

export interface RequestQuoteLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  itemType: string;
}

/** One quote on GET /bookings/:id/quotes (booking.service getBookingQuotes). */
export interface RequestQuote {
  id: string;
  bookingId: string;
  providerId: string;
  providerUserId: string | null;
  /** The request thread with this pro, null until it opens. */
  conversationId: string | null;
  quotedPrice: number;
  /** "What is included". */
  description: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  couldChangeIf: string | null;
  earliestDate: string | null;
  earliestTimeWindow: QuoteTimeWindow | null;
  acceptedCustomerBudget: boolean;
  round: number;
  /** Customer and admin views only. */
  declineReason?: string | null;
  respondedInMinutes: number | null;
  budget: QuoteBudgetComparison;
  provider: QuoteProvider;
  lineItems: RequestQuoteLineItem[];
  laborAmount: number;
  materialsAmount: number;
  estimatedDays: number | null;
  notes: string;
}

/** GET /bookings/:id/quotes/:quoteId/confirm-preview (read-only). */
export interface ConfirmPreview {
  quoteId: string;
  quotedPrice: number;
  sukiDiscount: number;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  walletBalance: number;
  walletCovers: boolean;
  provider: QuoteProvider;
  slot: {
    date: string | null;
    window: QuoteTimeWindow | null;
    /** The job time if confirmed now (server clock), null when the slot has passed. */
    startsAt: string | null;
    status: 'ok' | 'passed';
  };
  address: { line: string | null; barangay: string | null; city: string | null };
  description: string;
  couldChangeIf: string | null;
}

export interface QuoteAcceptance {
  quoteId: string;
  providerId: string;
  totalAmount: number;
  scheduledAt: string;
  scheduledWindow: QuoteTimeWindow | null;
}

export interface QuoteDeclineResult {
  quoteId: string;
  bookingStatus: string;
  round: number;
  /** True when the request is being sent to other pros again. */
  reopened: boolean;
  /** True while the back office has been asked to help. */
  opsReview: boolean;
}

export interface QuoteWithdrawResult {
  quoteId: string;
  bookingStatus: string;
  round: number;
  reopened: boolean;
}

export interface CustomerDeclineSignal {
  round: number;
  reason: string;
  /** Present only when an admin setting allows it. The app never shows it. */
  amount: number | null;
}

export interface JobRequestMediaCounts {
  photo: number;
  video: number;
  voice: number;
}

/** One open request in the provider's Requests list (job-leads.service OpenJobRequest). */
export interface ProviderJobRequest {
  id: string;
  categoryId: string;
  categoryName: string;
  serviceName: string;
  subcategoryId: string | null;
  description: string;
  urgency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetUnknown: boolean;
  round: number;
  customerDeclines: CustomerDeclineSignal[];
  mediaCounts: JobRequestMediaCounts;
  /** When this provider first opened the request in its current round. */
  viewedAt: string | null;
  /** Photos from requests sent by apps older than 1.0.4 (public links). */
  jobPhotos: string[];
  jobVideoUrl: string | null;
  intakeAnswers: Record<string, unknown> | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  /** "Ana R." before booking. */
  customerName: string;
  distanceKm: number | null;
  createdAt: string;
}

/** One answer under the question the admin wrote. label is null when the question no longer exists. */
export interface IntakeQuestionAnswer {
  key: string;
  label: string | null;
  unit: string | null;
  value: string | number | boolean;
}

/** This provider's own quote on a request they already answered. */
export interface ProviderOwnQuote {
  id: string;
  status: string;
  quotedPrice: number;
  earliestDate: string | null;
  earliestTimeWindow: QuoteTimeWindow | null;
}

export interface ProviderJobRequestDetail extends ProviderJobRequest {
  intakeQuestions: IntakeQuestionAnswer[];
  /** Set when this provider already quoted: the screen is then read-only. */
  myQuote: ProviderOwnQuote | null;
}

export interface ProviderJobRequestPage {
  requests: ProviderJobRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProviderRequestSummary {
  openCount: number;
  unseenCount: number;
  quotesWaitingCount: number;
  isAvailable: boolean;
}

export interface QuoteSubmissionLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  itemType?: 'labor' | 'materials' | 'equipment' | 'other';
}

/** POST /bookings/:id/quotes body (validators/booking.validators.ts submitQuoteSchema). */
export interface QuoteSubmissionPayload {
  /** Centavos. Required unless acceptBudget. */
  quotedPrice?: number;
  /** "What is included", 10 to 300 characters. */
  description: string;
  couldChangeIf?: string;
  /** YYYY-MM-DD, Manila calendar. */
  earliestDate: string;
  earliestTimeWindow: QuoteTimeWindow;
  acceptBudget?: boolean;
  /** One per quote form, so a retry never sends a second quote. */
  clientRequestId?: string;
  estimatedDays?: number;
  notes?: string;
  lineItems?: QuoteSubmissionLineItem[];
}

export interface SubmittedQuote {
  id: string;
  quoted_price?: number;
  status?: string;
  replayed?: boolean;
  [key: string]: unknown;
}

export type MyQuoteDisplayStatus =
  | 'waiting'
  | 'accepted'
  | 'booked'
  | 'declined'
  | 'not_selected'
  | 'expired'
  | 'withdrawn'
  | 'request_closed';

export type MyQuoteFilter = 'all' | 'waiting' | 'accepted' | 'declined' | 'expired';

export interface MyQuote {
  quoteId: string;
  bookingId: string;
  serviceName: string;
  barangay: string | null;
  city: string | null;
  quotedPrice: number;
  displayStatus: MyQuoteDisplayStatus;
  /** The customer's decline reason code; the note is never sent to providers. */
  declineReason: string | null;
  earliestDate: string | null;
  earliestTimeWindow: QuoteTimeWindow | null;
  createdAt: string;
  expiresAt: string;
}

export interface MyQuotePage {
  quotes: MyQuote[];
  total: number;
  page: number;
  pageSize: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: { page?: number; pageSize?: number; total?: number };
}

function path(segment: string): string {
  return encodeURIComponent(segment);
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// ────────────────────────────────────────────────────────────────────
// Customer
// ────────────────────────────────────────────────────────────────────

export async function getRequestStatus(bookingId: string): Promise<RequestStatus> {
  const res = await api.get<Envelope<RequestStatus>>(`/api/v1/bookings/${path(bookingId)}/request-status`);
  return res.data.data;
}

export async function getCustomerRequestSummary(): Promise<{ awaitingDecisionCount: number }> {
  const res = await api.get<Envelope<{ awaitingDecisionCount?: unknown }>>('/api/v1/bookings/requests/summary');
  return { awaitingDecisionCount: count(res.data?.data?.awaitingDecisionCount) };
}

/** The customer sees every quote; a provider sees only their own. */
export async function getBookingQuotes(bookingId: string): Promise<RequestQuote[]> {
  const res = await api.get<Envelope<RequestQuote[]>>(`/api/v1/bookings/${path(bookingId)}/quotes`);
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export async function getConfirmPreview(bookingId: string, quoteId: string): Promise<ConfirmPreview> {
  const res = await api.get<Envelope<ConfirmPreview>>(
    `/api/v1/bookings/${path(bookingId)}/quotes/${path(quoteId)}/confirm-preview`,
  );
  return res.data.data;
}

export async function acceptQuote(bookingId: string, quoteId: string): Promise<QuoteAcceptance> {
  const res = await api.post<Envelope<QuoteAcceptance>>(
    `/api/v1/bookings/${path(bookingId)}/quotes/${path(quoteId)}/accept`,
    {},
  );
  return res.data.data;
}

export async function declineQuote(
  bookingId: string,
  quoteId: string,
  input: { reason: DeclineReason; note?: string },
): Promise<QuoteDeclineResult> {
  const note = input.note?.trim();
  const res = await api.post<Envelope<QuoteDeclineResult>>(
    `/api/v1/bookings/${path(bookingId)}/quotes/${path(quoteId)}/decline`,
    note ? { reason: input.reason, note } : { reason: input.reason },
  );
  return res.data.data;
}

// ────────────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────────────

/** The route answers {success, requests, total, page, pageSize} (no data wrapper). */
export async function getProviderJobRequests(page = 1, pageSize = 50): Promise<ProviderJobRequestPage> {
  const res = await api.get<Partial<ProviderJobRequestPage> & { success?: boolean }>(
    '/api/v1/providers/me/job-requests',
    { params: { page, pageSize } },
  );
  const body = res.data ?? {};
  return {
    requests: Array.isArray(body.requests) ? body.requests : [],
    total: count(body.total),
    page: count(body.page) || page,
    pageSize: count(body.pageSize) || pageSize,
  };
}

export async function getProviderRequestSummary(): Promise<ProviderRequestSummary> {
  const res = await api.get<Envelope<Partial<ProviderRequestSummary>>>('/api/v1/providers/me/job-requests/summary');
  const data = res.data?.data ?? {};
  return {
    openCount: count(data.openCount),
    unseenCount: count(data.unseenCount),
    quotesWaitingCount: count(data.quotesWaitingCount),
    // Unknown is treated as online so no false "you're offline" banner shows.
    isAvailable: data.isAvailable !== false,
  };
}

export async function getProviderJobRequest(bookingId: string): Promise<ProviderJobRequestDetail> {
  const res = await api.get<Envelope<ProviderJobRequestDetail>>(
    `/api/v1/providers/me/job-requests/${path(bookingId)}`,
  );
  return res.data.data;
}

export async function submitQuote(bookingId: string, payload: QuoteSubmissionPayload): Promise<SubmittedQuote> {
  const res = await api.post<Envelope<SubmittedQuote>>(`/api/v1/bookings/${path(bookingId)}/quotes`, payload);
  return res.data.data;
}

export async function withdrawQuote(bookingId: string, quoteId: string): Promise<QuoteWithdrawResult> {
  const res = await api.post<Envelope<QuoteWithdrawResult>>(
    `/api/v1/bookings/${path(bookingId)}/quotes/${path(quoteId)}/withdraw`,
    {},
  );
  return res.data.data;
}

export async function getMyQuotes(status: MyQuoteFilter = 'all', page = 1, pageSize = 50): Promise<MyQuotePage> {
  const res = await api.get<Envelope<MyQuote[]>>('/api/v1/providers/me/quotes', {
    params: { status, page, pageSize },
  });
  const quotes = Array.isArray(res.data?.data) ? res.data.data : [];
  return {
    quotes,
    total: count(res.data?.meta?.total) || quotes.length,
    page: count(res.data?.meta?.page) || page,
    pageSize: count(res.data?.meta?.pageSize) || pageSize,
  };
}

// ────────────────────────────────────────────────────────────────────
// Request vocabulary (pure)
// ────────────────────────────────────────────────────────────────────

export const TIME_WINDOWS: readonly QuoteTimeWindow[] = ['morning', 'afternoon', 'evening', 'asap'];

/**
 * Local hours of each window (packages/api services/booking/quote-slot.ts
 * QUOTE_WINDOW_HOURS). ASAP runs from now until 9 PM, today only.
 */
export const TIME_WINDOW_HOURS: Readonly<Record<QuoteTimeWindow, { start: number | null; end: number }>> = {
  morning: { start: 8, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
  asap: { start: null, end: 21 },
};

export const TIME_WINDOW_NAMES: Readonly<Record<QuoteTimeWindow, string>> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  asap: 'As soon as possible',
};

export function isQuoteTimeWindow(value: unknown): value is QuoteTimeWindow {
  return typeof value === 'string' && (TIME_WINDOWS as readonly string[]).includes(value);
}

/** "8 AM", "12 PM", "5 PM". */
export function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}

/** "Morning (8 AM to 12 PM)" or "As soon as possible". */
export function timeWindowLabel(window: QuoteTimeWindow): string {
  const hours = TIME_WINDOW_HOURS[window];
  if (hours.start === null) return TIME_WINDOW_NAMES[window];
  return `${TIME_WINDOW_NAMES[window]} (${hourLabel(hours.start)} to ${hourLabel(hours.end)})`;
}

/** The customer's choices when declining (POST .../decline reason). */
export const DECLINE_REASON_OPTIONS: ReadonlyArray<{ value: DeclineReason; label: string }> = [
  { value: 'too_expensive', label: 'Price too high' },
  { value: 'timing', label: 'Timing does not work' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'other', label: 'Other' },
];

/**
 * What a provider is told about a customer's decline: the same labels the
 * server puts in notifications (packages/api job-leads.service
 * DECLINE_REASON_LABELS). Never an amount, never the customer's note.
 */
export const PROVIDER_DECLINE_REASON_LABELS: Readonly<Record<string, string>> = {
  too_expensive: 'Price too high',
  timing: 'Timing did not work',
  changed_mind: 'Customer changed their mind',
  other: 'Other reason',
};

export function providerDeclineReasonLabel(reason: string | null | undefined): string {
  if (!reason) return PROVIDER_DECLINE_REASON_LABELS.other!;
  return PROVIDER_DECLINE_REASON_LABELS[reason] ?? PROVIDER_DECLINE_REASON_LABELS.other!;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8 all year (no daylight saving).
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A Manila wall-clock view of a moment: the UTC fields of the shifted date. */
function manilaClock(ms: number): Date {
  return new Date(ms + MANILA_OFFSET_MS);
}

/** Today's calendar date in Manila, YYYY-MM-DD. */
export function manilaDateKey(nowMs: number = Date.now()): string {
  const d = manilaClock(nowMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Minutes since midnight on the Manila clock. */
export function manilaMinutesOfDay(nowMs: number = Date.now()): number {
  const d = manilaClock(nowMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function dateKeyToUtcMs(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDaysToDateKey(key: string, days: number): string {
  const ms = dateKeyToUtcMs(key);
  if (ms === null) return key;
  const d = new Date(ms + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from `fromKey` to `toKey` (both YYYY-MM-DD). */
export function daysBetweenDateKeys(fromKey: string, toKey: string): number | null {
  const from = dateKeyToUtcMs(fromKey);
  const to = dateKeyToUtcMs(toKey);
  if (from === null || to === null) return null;
  return Math.round((to - from) / DAY_MS);
}

/** "Fri 16 Oct". */
export function shortDateLabel(key: string): string {
  const ms = dateKeyToUtcMs(key);
  if (ms === null) return key;
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Today", "Tomorrow" or "Fri 16 Oct", relative to Manila today. */
export function relativeDateLabel(key: string, nowMs: number = Date.now()): string {
  const diff = daysBetweenDateKeys(manilaDateKey(nowMs), key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return shortDateLabel(key);
}

/** "8:30 AM" on the Manila clock. */
export function manilaTimeLabel(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const d = manilaClock(ms);
  const hour = d.getUTCHours();
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${pad(d.getUTCMinutes())} ${suffix}`;
}

/** The Manila calendar date of a moment, YYYY-MM-DD. */
export function manilaDateKeyOf(iso: string): string | null {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? manilaDateKey(ms) : null;
}

/**
 * A provider's earliest slot in plain words:
 * "Today, morning (8 AM to 12 PM)", "Tomorrow, evening (5 PM to 9 PM)",
 * "Today, as soon as possible". Null when the quote has no slot.
 */
export function describeSlot(
  date: string | null | undefined,
  window: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!date || !isQuoteTimeWindow(window)) return null;
  const day = relativeDateLabel(date, nowMs);
  const label = timeWindowLabel(window);
  return `${day}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** "Responded in 12 min", "Responded in 1 h 5 min", "Responded in under a minute". */
export function respondedInLabel(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return 'Responded in under a minute';
  if (minutes < 60) return `Responded in ${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `Responded in ${hours} h` : `Responded in ${hours} h ${rest} min`;
}
