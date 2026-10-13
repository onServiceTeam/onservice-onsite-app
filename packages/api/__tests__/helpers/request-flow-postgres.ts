// HA-M2 package P2 (customer human audit 2026-10-13, D38 Milestone 2): the
// request engine end to end on the guarded PostgreSQL fixture.
//
// Wraps P1's withRequestEngineDatabase (real migrations 183 and 184 over the
// Milestone 1 job-request fixture) and adds what the quote, decline, accept,
// lead and worker paths read in production:
//   - the real migration 007 (reviews, counted for the quote cards'
//     ratingCount and isNew) and the real migration 131 (provider_staff and
//     bookings.performer_staff_id, read by the participant access checks);
//   - users.avatar_url (migration 001), read by the quote cards, and
//     quote_line_items (migration 018), read with every quote list;
//   - provider B as a second eligible provider (3 km from the Cebu pin, 20 km
//     radius, same category), and readable names for the customers.
// Everything else is the real code: mounted routers behind the real
// authentication middleware, real notification rows (device push stays off
// through the participant fixture's stored preferences), a real Socket.IO
// server when a test listens for events, and the scheduler's own processor
// for worker steps (only BullMQ's Redis connection is replaced, by each test
// file's jest.mock).
//
// Time of day: quote slots are wall-clock windows in the platform time zone
// (platformConfig.timezone, Asia/Manila). The database clock cannot be faked,
// so a test that needs "the morning window has started" sets the platform
// zone, for the length of the test, to a whole-hour Etc/GMT zone in which
// the real current instant falls at the wanted local hour
// (withPlatformClockAt). Production code then runs unchanged, including the
// SQL that turns a date and window into times.
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import bookingRouter from '../../src/routes/booking.routes';
import paymentRouter from '../../src/routes/payment.routes';
import providerRouter from '../../src/routes/provider.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { platformConfig } from '../../src/config/platform.config';
import { _setIoForTest, initSocketServer } from '../../src/services/socket.service';
import {
  customerA, customerB, providerA, providerB, providerUserA, providerUserB, syntheticSecret,
} from './booking-participant-postgres';
import { requestCategory, quoteService, cebuPin } from './job-request-postgres';
import {
  withRequestEngineDatabase, readMigration, upsertPlatformSetting, type RequestEngineFixtureOptions,
} from './request-engine-postgres';

export { customerA, customerB, providerA, providerB, providerUserA, providerUserB, requestCategory, quoteService };
export { upsertPlatformSetting };

/** Extra providers some tests add with addProvider(). */
export const providerC = '71000000-0000-4000-8000-000000000003';
export const providerUserC = '70000000-0000-4000-8000-000000000003';
export const providerD = '71000000-0000-4000-8000-000000000004';
export const providerUserD = '70000000-0000-4000-8000-000000000004';
export const providerE = '71000000-0000-4000-8000-000000000005';
export const providerUserE = '70000000-0000-4000-8000-000000000005';

export async function withRequestFlowDatabase(
  run: (database: Pool) => Promise<void>,
  options: RequestEngineFixtureOptions = {},
): Promise<void> {
  await withRequestEngineDatabase(async database => {
    await database.query(readMigration('007_create_reviews.sql'));
    await database.query(readMigration('131_provider_staff.sql'));
    await database.query('ALTER TABLE users ADD COLUMN avatar_url text');
    // Itemized quote lines exactly as migration 018 creates them.
    await database.query(`CREATE TABLE quote_line_items (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      quote_id UUID NOT NULL REFERENCES booking_quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
      unit VARCHAR(30) NOT NULL DEFAULT 'unit',
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      item_type VARCHAR(20) NOT NULL DEFAULT 'labor'
          CHECK (item_type IN ('labor', 'materials', 'equipment', 'other')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await database.query(`UPDATE users SET first_name = CASE id WHEN $1::uuid THEN 'Ana' WHEN $2::uuid THEN 'Ben' END,
        last_name = CASE id WHEN $1::uuid THEN 'Reyes' WHEN $2::uuid THEN 'Cruz' END
      WHERE id IN ($1, $2)`, [customerA, customerB]);
    await database.query(`UPDATE providers SET latitude = 10.34, longitude = 123.87, service_radius_km = 20
      WHERE id = $1`, [providerB]);
    await database.query('INSERT INTO provider_services (provider_id, category_id) VALUES ($1, $2)',
      [providerB, requestCategory]);
    await run(database);
  }, options);
}

export interface ProviderSpec {
  providerId: string;
  userId: string;
  businessName?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
  available?: boolean;
  rating?: number;
  totalReviews?: number;
  /** Offer the request category (default true). */
  servesCategory?: boolean;
  status?: string;
}

/** Add an approved provider (default: 1 km from the Cebu pin, serving the category). */
export async function addProvider(database: Pool, spec: ProviderSpec): Promise<void> {
  await database.query(`INSERT INTO users (id, role, first_name, last_name) VALUES ($1, 'provider', 'Pro', $2)`,
    [spec.userId, spec.businessName ?? 'Extra']);
  await database.query(`INSERT INTO notification_preferences (user_id) VALUES ($1)`, [spec.userId]);
  await database.query(`INSERT INTO providers (id, user_id, status, business_name, latitude, longitude,
        service_radius_km, is_available, rating, total_reviews)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
    spec.providerId, spec.userId, spec.status ?? 'approved', spec.businessName ?? 'Synthetic extra provider',
    spec.latitude === undefined ? 10.32 : spec.latitude,
    spec.longitude === undefined ? 123.89 : spec.longitude,
    spec.radiusKm ?? 20, spec.available ?? true, spec.rating ?? 0, spec.totalReviews ?? 0,
  ]);
  if (spec.servesCategory !== false) {
    await database.query('INSERT INTO provider_services (provider_id, category_id) VALUES ($1, $2)',
      [spec.providerId, requestCategory]);
  }
}

export interface QuoteRequestSpec {
  id?: string;
  customerId?: string;
  status?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetUnknown?: boolean;
  round?: number;
  /** SQL interval subtracted from NOW() for created_at, e.g. '73 hours'. */
  createdAgo?: string;
  /**
   * SQL interval subtracted from NOW() for request_round_opened_at, e.g.
   * '5 minutes': a round the D38 engine opened (createJobRequest stamps it at
   * creation, a reopen stamps it again). Left out, the column stays NULL, as
   * on every request stored before the engine went live (migration 183 adds
   * the column with no backfill).
   */
  roundOpenedAgo?: string;
  /** SQL expression for scheduled_at (default NOW() + INTERVAL '3 days'). */
  scheduledAtSql?: string;
  bookingType?: 'quote_based' | 'fixed_price';
}

/** Insert a quote request directly (no fan-out runs). Returns its id. */
export async function insertQuoteRequest(database: Pool, spec: QuoteRequestSpec = {}): Promise<string> {
  const id = spec.id ?? crypto.randomUUID();
  await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        description, address, barangay, city, province, latitude, longitude, urgency,
        budget_min, budget_max, budget_unknown, request_round, created_at, scheduled_at, request_round_opened_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'The bedroom aircon drips water onto the floor.', '22 Mango Avenue',
        'Kamputhaw', 'Cebu City', 'Cebu', $7, $8, 'within_3_days', $9, $10, $11, $12,
        NOW() - $13::interval, ${spec.scheduledAtSql ?? "NOW() + INTERVAL '3 days'"},
        NOW() - $14::interval)`, [
    id, spec.customerId ?? customerA, spec.bookingType ?? 'quote_based', spec.status ?? 'requested',
    requestCategory, quoteService, cebuPin.latitude, cebuPin.longitude,
    spec.budgetMin ?? null, spec.budgetMax ?? null, spec.budgetUnknown ?? false, spec.round ?? 1,
    spec.createdAgo ?? '0 seconds', spec.roundOpenedAgo ?? null,
  ]);
  return id;
}

/**
 * One review of `providerId` (a real migration 007 row) on its own earlier,
 * completed job for customer B. `visible` false is a review an admin hid;
 * a comment starting "[demo]" is seeded demo content.
 */
export async function addReview(
  database: Pool,
  providerId: string,
  review: { visible?: boolean; comment?: string } = {},
): Promise<void> {
  const bookingId = await insertQuoteRequest(database, { customerId: customerB, status: 'completed', createdAgo: '30 days' });
  await database.query('UPDATE bookings SET provider_id = $2 WHERE id = $1', [bookingId, providerId]);
  await database.query(`INSERT INTO reviews (booking_id, reviewer_id, provider_id, rating, comment, is_visible)
    VALUES ($1, $2, $3, 5, $4, $5)`, [bookingId, customerB, providerId, review.comment ?? 'Fixed it fast.', review.visible ?? true]);
}

export interface QuoteRowSpec {
  id?: string;
  bookingId: string;
  providerId: string;
  quotedPrice?: number;
  status?: string;
  /** SQL expression for expires_at (default NOW() + INTERVAL '1 day'). */
  expiresAtSql?: string;
  /** Days after today (platform zone) for earliest_date; null for a quote with no slot. */
  earliestDayOffset?: number | null;
  window?: string | null;
  declineReason?: string | null;
  round?: number;
}

/** Insert a quote row directly, as an existing or legacy quote. Returns its id. */
export async function insertQuote(database: Pool, spec: QuoteRowSpec): Promise<string> {
  const id = spec.id ?? crypto.randomUUID();
  const offset = spec.earliestDayOffset === undefined ? 2 : spec.earliestDayOffset;
  await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, description, status,
        expires_at, earliest_date, earliest_time_window, decline_reason, declined_at, round)
      VALUES ($1, $2, $3, $4, 'Clean the unit and clear the drain line.', $5,
        ${spec.expiresAtSql ?? "NOW() + INTERVAL '1 day'"},
        CASE WHEN $6::int IS NULL THEN NULL ELSE (clock_timestamp() AT TIME ZONE $7::text)::date + $6::int END,
        CASE WHEN $6::int IS NULL THEN NULL ELSE $8::text END,
        $9::text, CASE WHEN $9::text IS NULL THEN NULL ELSE NOW() END, $10)`, [
    id, spec.bookingId, spec.providerId, spec.quotedPrice ?? 80000, spec.status ?? 'submitted',
    offset, platformConfig.timezone, spec.window ?? 'morning', spec.declineReason ?? null, spec.round ?? 1,
  ]);
  return id;
}

/** A calendar date (YYYY-MM-DD) `daysAhead` after today in the platform time zone. */
export function platformDate(daysAhead = 0): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toLocaleDateString('en-CA', { timeZone: platformConfig.timezone });
}

/** Quote body defaults: ₱800, a morning slot two days out. */
export function quoteBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quotedPrice: 80000,
    description: 'Clean the unit, re-gas it and clear the drain line.',
    earliestDate: platformDate(2),
    earliestTimeWindow: 'morning',
    ...overrides,
  };
}

/**
 * Run `body` with the platform time zone set so that the real current
 * instant is at `localHour` (minutes unchanged). Restores the zone after.
 */
export async function withPlatformClockAt(localHour: number, body: () => Promise<void>): Promise<void> {
  const now = new Date();
  let offset = (((localHour - now.getUTCHours()) % 24) + 24) % 24;
  if (offset > 14) offset -= 24;
  // Etc/GMT names use the POSIX sign: Etc/GMT-3 is three hours ahead of UTC.
  const zone = offset === 0 ? 'Etc/GMT' : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
  const config = platformConfig as { timezone: string };
  const original = config.timezone;
  config.timezone = zone;
  try {
    await body();
  } finally {
    config.timezone = original;
  }
}

/** Mounted booking, payment and provider routers behind the real auth middleware. */
export function flowHttp(userId: string, role: string) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/bookings', bookingRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use('/api/v1/providers', providerRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  const auth = `Bearer ${token}`;
  const get = (path: string) => request(app).get(path).set('Authorization', auth);
  const post = (path: string, body: unknown = {}) => request(app).post(path).set('Authorization', auth).send(body as object);
  return {
    jobRequest: (body: Record<string, unknown>) => post('/api/v1/bookings/job-request', body),
    quote: (bookingId: string, body: Record<string, unknown> = quoteBody()) => post(`/api/v1/bookings/${bookingId}/quotes`, body),
    quotes: (bookingId: string) => get(`/api/v1/bookings/${bookingId}/quotes`),
    accept: (bookingId: string, quoteId: string) => post(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/accept`),
    decline: (bookingId: string, quoteId: string, body: Record<string, unknown> = { reason: 'too_expensive' }) =>
      post(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/decline`, body),
    withdraw: (bookingId: string, quoteId: string) => post(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/withdraw`),
    confirmPreview: (bookingId: string, quoteId: string) => get(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/confirm-preview`),
    requestStatus: (bookingId: string) => get(`/api/v1/bookings/${bookingId}/request-status`),
    requestSummary: () => get('/api/v1/bookings/requests/summary'),
    bookings: () => get('/api/v1/bookings'),
    assign: (bookingId: string, providerId: string) => post(`/api/v1/bookings/${bookingId}/assign`, { providerId }),
    dispatch: (bookingId: string) => post(`/api/v1/bookings/${bookingId}/dispatch`),
    cancel: (bookingId: string) => request(app).patch(`/api/v1/bookings/${bookingId}/status`)
      .set('Authorization', auth).send({ status: 'cancelled_by_customer', cancellationReason: 'Synthetic change of plans' }),
    walletPay: (bookingId: string) => post('/api/v1/payments/intent', { bookingId, paymentMethod: 'wallet' }),
    leads: () => get('/api/v1/providers/me/job-requests'),
    lead: (bookingId: string) => get(`/api/v1/providers/me/job-requests/${bookingId}`),
    leadSummary: () => get('/api/v1/providers/me/job-requests/summary'),
    myQuotes: (status = 'all') => get(`/api/v1/providers/me/quotes?status=${status}`),
  };
}

/** Poll until `check` returns true (5 s); background fan-outs finish before assertions. */
export async function waitUntil(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

/** Notification rows of one user, oldest first. */
export async function notificationsOf(database: Pool, userId: string): Promise<Array<{ type: string; title: string; body: string; data: Record<string, unknown> }>> {
  return (await database.query(`SELECT type, title, body, data FROM notifications WHERE user_id = $1
    ORDER BY created_at, id`, [userId])).rows;
}

/** Invite rows of one request, by provider then round. */
export async function invitesOf(database: Pool, bookingId: string): Promise<Array<Record<string, unknown>>> {
  return (await database.query(`SELECT provider_id, round, source, status, rank, quote_id,
      viewed_at IS NOT NULL AS viewed, responded_at IS NOT NULL AS responded, closed_at IS NOT NULL AS closed
    FROM job_request_invites WHERE booking_id = $1 ORDER BY provider_id, round`, [bookingId])).rows;
}

export interface SocketRecorder {
  /** Events each listening user received, in order. */
  events: Map<string, Array<{ event: string; payload: unknown }>>;
  close: () => Promise<void>;
}

/**
 * Start a real Socket.IO server (the production initSocketServer, real
 * handshake against the users table) and connect one client per user. Every
 * event a client receives is recorded.
 */
export async function listenAs(users: Array<{ userId: string; role: string }>): Promise<SocketRecorder> {
  const httpServer = createServer();
  const socketServer = initSocketServer(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  const events = new Map<string, Array<{ event: string; payload: unknown }>>();
  const clients: ClientSocket[] = [];
  for (const user of users) {
    const token = jwt.sign({ userId: user.userId, role: user.role, sessionVersion: 1, type: 'access' },
      syntheticSecret, { expiresIn: '5m' });
    const client = await new Promise<ClientSocket>((resolve, reject) => {
      const socket = createClient(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', error => { socket.close(); reject(error); });
    });
    const received: Array<{ event: string; payload: unknown }> = [];
    client.onAny((event: string, payload: unknown) => received.push({ event, payload }));
    events.set(user.userId, received);
    clients.push(client);
  }
  return {
    events,
    close: async () => {
      for (const client of clients) client.close();
      // Closing the Socket.IO server also closes its HTTP server.
      await new Promise<void>(resolve => socketServer.close(() => resolve()));
      _setIoForTest(null);
    },
  };
}
