/**
 * D38 Milestone 2 test support (package P5b): API response fixtures shaped
 * like the committed endpoints (packages/api booking.service and
 * job-leads.service), and a GET/POST router for the global api mock
 * (jest.setup.js mocks '@/services/api').
 *
 * Times: NOW is Wednesday 14 Oct 2026, 09:00 in Manila (01:00 UTC). Tests
 * that depend on "today" spy Date.now to return it.
 */
import api, { ApiError } from '@/services/api';
import type {
  ConfirmPreview,
  MyQuote,
  ProviderJobRequestDetail,
  RequestQuote,
  RequestStatus,
} from '@/services/request.service';

export const NOW = Date.parse('2026-10-14T01:00:00.000Z');
export const TODAY = '2026-10-14';
export const TOMORROW = '2026-10-15';
export const BOOKING_ID = 'booking-req-1';
export const QUOTE_ID = 'quote-1';
export const PROVIDER_USER_ID = 'provider-user-1';

export function providerRequestFixture(overrides: Partial<ProviderJobRequestDetail> = {}): ProviderJobRequestDetail {
  return {
    id: BOOKING_ID,
    categoryId: 'category-aircon',
    categoryName: 'Aircon Services',
    serviceName: 'Aircon repair',
    subcategoryId: 'subcategory-aircon',
    description: 'Bedroom aircon blows warm air and drips water.',
    urgency: 'within_3_days',
    budgetMin: 150000,
    budgetMax: 250000,
    budgetUnknown: false,
    round: 1,
    customerDeclines: [],
    mediaCounts: { photo: 0, video: 0, voice: 0 },
    viewedAt: null,
    jobPhotos: [],
    jobVideoUrl: null,
    intakeAnswers: null,
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    customerName: 'Ana R.',
    distanceKm: 2.1,
    createdAt: '2026-10-14T00:30:00.000Z',
    intakeQuestions: [],
    myQuote: null,
    ...overrides,
  };
}

export function quoteFixture(overrides: Partial<RequestQuote> = {}): RequestQuote {
  return {
    id: QUOTE_ID,
    bookingId: BOOKING_ID,
    providerId: 'provider-1',
    providerUserId: PROVIDER_USER_ID,
    conversationId: 'conversation-1',
    quotedPrice: 180000,
    description: 'Clean and check one split-type aircon, including the drain line.',
    status: 'submitted',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-10-14T00:42:00.000Z',
    couldChangeIf: 'The compressor needs replacing.',
    earliestDate: TOMORROW,
    earliestTimeWindow: 'morning',
    acceptedCustomerBudget: false,
    round: 1,
    declineReason: null,
    respondedInMinutes: 12,
    budget: { kind: 'within', aboveBy: 0 },
    provider: {
      id: 'provider-1',
      userId: PROVIDER_USER_ID,
      name: 'Cebu Cooling',
      photoUrl: null,
      ratingAverage: 4.8,
      ratingCount: 12,
      isNew: false,
      jobsCompleted: 42,
    },
    lineItems: [],
    laborAmount: 0,
    materialsAmount: 0,
    estimatedDays: null,
    notes: '',
    ...overrides,
  };
}

export function confirmPreviewFixture(overrides: Partial<ConfirmPreview> = {}): ConfirmPreview {
  return {
    quoteId: QUOTE_ID,
    quotedPrice: 180000,
    sukiDiscount: 0,
    servicePrice: 180000,
    serviceFee: 18000,
    totalAmount: 198000,
    walletBalance: 500000,
    walletCovers: true,
    provider: quoteFixture().provider,
    slot: { date: TOMORROW, window: 'morning', startsAt: '2026-10-15T00:00:00.000Z', status: 'ok' },
    address: { line: '88 Banilad Road', barangay: 'Banilad', city: 'Cebu City' },
    description: 'Clean and check one split-type aircon, including the drain line.',
    couldChangeIf: 'The compressor needs replacing.',
    ...overrides,
  };
}

export function requestStatusFixture(overrides: Partial<RequestStatus> = {}): RequestStatus {
  return {
    bookingId: BOOKING_ID,
    status: 'requested',
    stage: 'waiting',
    serviceName: 'Aircon repair',
    round: 1,
    maxRounds: 3,
    roundOpenedAt: '2026-10-14T00:55:00.000Z',
    notifiedProviderCount: 4,
    openQuoteCount: 0,
    maxOpenQuotes: 1,
    stillLookingAfterMinutes: 30,
    stillLooking: false,
    opsReviewAt: null,
    ...overrides,
  };
}

export function myQuoteFixture(overrides: Partial<MyQuote> = {}): MyQuote {
  return {
    quoteId: QUOTE_ID,
    bookingId: BOOKING_ID,
    serviceName: 'Aircon repair',
    barangay: 'Lahug',
    city: 'Cebu City',
    quotedPrice: 180000,
    displayStatus: 'waiting',
    declineReason: null,
    earliestDate: TOMORROW,
    earliestTimeWindow: 'morning',
    createdAt: '2026-10-14T00:42:00.000Z',
    expiresAt: '2026-10-16T00:42:00.000Z',
    ...overrides,
  };
}

/** The envelope the API wraps data in. */
export function ok<T>(data: T, extra: Record<string, unknown> = {}): { data: Record<string, unknown> } {
  return { data: { success: true, data, ...extra } };
}

/** An API failure with a code, as error.middleware serializes it. */
export function apiError(status: number, code: string | null, message = 'Request failed'): Error {
  return new ApiError(status, {
    success: false,
    error: { message, statusCode: status, ...(code ? { code } : {}) },
  } as never, message);
}

type Answer = unknown | ((url: string, arg?: unknown) => unknown);

/**
 * Answer api.get by URL (exact match, or the longest matching prefix ending
 * in '*'). An unknown URL resolves to `{ data: {} }` like the global mock.
 */
export function routeGets(routes: Record<string, Answer>): void {
  jest.mocked(api.get).mockImplementation((async (url: string, init?: unknown) => {
    const answer = resolveRoute(routes, url);
    if (answer === undefined) return { data: {} };
    const value = typeof answer === 'function' ? await (answer as (u: string, a?: unknown) => unknown)(url, init) : answer;
    if (value instanceof Error) throw value;
    return value;
  }) as never);
}

export function routePosts(routes: Record<string, Answer>): void {
  jest.mocked(api.post).mockImplementation((async (url: string, body?: unknown) => {
    const answer = resolveRoute(routes, url);
    if (answer === undefined) return { data: {} };
    const value = typeof answer === 'function' ? await (answer as (u: string, a?: unknown) => unknown)(url, body) : answer;
    if (value instanceof Error) throw value;
    return value;
  }) as never);
}

function resolveRoute(routes: Record<string, Answer>, url: string): Answer | undefined {
  if (Object.prototype.hasOwnProperty.call(routes, url)) return routes[url];
  const prefixes = Object.keys(routes)
    .filter((key) => key.endsWith('*') && url.startsWith(key.slice(0, -1)))
    .sort((a, b) => b.length - a.length);
  return prefixes.length > 0 ? routes[prefixes[0]!] : undefined;
}

/** The URLs a test's screen asked for, in order. */
export function getUrls(): string[] {
  return jest.mocked(api.get).mock.calls.map((call) => String(call[0]));
}

/** The GETs every provider quote-screen test needs: the lead detail, its media and the commission preview. */
export function quoteScreenGets(detail: ProviderJobRequestDetail = providerRequestFixture(), extra: Record<string, Answer> = {}): void {
  routeGets({
    [`/api/v1/providers/me/job-requests/${detail.id}`]: ok(detail),
    [`/api/v1/job-media/booking/${detail.id}`]: ok({ items: [], legacyPhotos: [] }),
    '/api/v1/providers/me/commission-preview*': { data: { data: { tier: 'pro', commissionRate: 0.1 } } },
    ...extra,
  });
}
