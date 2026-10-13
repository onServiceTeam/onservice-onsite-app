// HA-M2 (customer human audit 2026-10-13, D38 Milestone 2, package P4) helpers:
// request threads on the guarded PostgreSQL fixture.
//
// Built on withRequestEngineDatabase({ through: 185 }), so the chat tables come
// from the REAL migration files 006, 123, 138, 184 and 185 (one thread per
// booking and provider, derived thread state, system events, idempotent sends)
// and the quote columns from the real 183. On top of that it adds only:
//   - users.avatar_url and synthetic names (customer A is "Ana Reyes", so a
//     provider sees "Ana R.");
//   - the admin action names the reassignment and support-message routes
//     record, in the stored per-element CHECK form;
//   - stored notification preferences for both providers, so device push
//     stays off (the participant fixture already stores them for customers
//     and fails any network call).
// seedQuoteRequest() writes a quote request for customer A with live quotes
// from providers A and B. The routers are mounted behind the real
// authentication middleware. This is a scoped fixture, not the complete
// migration chain.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { _setIoForTest, initSocketServer } from '../../src/services/socket.service';
import messagingRouter from '../../src/routes/messaging.routes';
import bookingAdminRouter from '../../src/routes/booking-admin.routes';
import messagingAdminRouter from '../../src/routes/messaging-admin.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import {
  BASE_ADMIN_ACTION_TYPES, perElementActionCheck, upsertPlatformSetting, withRequestEngineDatabase,
} from './request-engine-postgres';
import {
  customerA, customerB, operatorId, providerA, providerB, providerUserA, providerUserB, syntheticSecret,
} from './booking-participant-postgres';
import { quoteService, requestCategory } from './job-request-postgres';

export const requestBooking = '85000000-0000-4000-8000-000000000001';
export const quoteFromA = '85100000-0000-4000-8000-000000000001';
export const quoteFromB = '85100000-0000-4000-8000-000000000002';

/** Admin action names the P4 routes record, beside the base 17 and the 138/184 splices. */
export const THREAD_ADMIN_ACTION_TYPES = [
  ...BASE_ADMIN_ACTION_TYPES,
  'conversation_viewed', 'message_redacted', 'message_flag_reviewed', 'job_media_viewed',
  'booking_reassigned', 'admin_message_sent',
] as const;

export interface RequestThreadFixtureOptions {
  /** Stored value of request_threads_enabled (the 185 row seeds 'true'). */
  threadsEnabled?: boolean;
}

export async function addRequestThreadShapes(database: Pool): Promise<void> {
  await database.query('ALTER TABLE users ADD COLUMN avatar_url text');
  await database.query(`UPDATE users SET first_name = v.first_name, last_name = v.last_name
      FROM (VALUES ($1::uuid, 'Ana', 'Reyes'), ($2::uuid, 'Dan', 'Cruz'), ($3::uuid, 'Ben', 'Santos'),
                   ($4::uuid, 'Carla', 'Diaz'), ($5::uuid, 'Olive', 'Ops')) AS v(id, first_name, last_name)
     WHERE users.id = v.id`, [customerA, customerB, providerUserA, providerUserB, operatorId]);
  await database.query(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
      ${perElementActionCheck(THREAD_ADMIN_ACTION_TYPES)}`);
  await database.query('INSERT INTO notification_preferences(user_id) VALUES ($1),($2)', [providerUserA, providerUserB]);
}

export async function withRequestThreadDatabase(
  run: (database: Pool) => Promise<void>,
  options: RequestThreadFixtureOptions = {},
): Promise<void> {
  await withRequestEngineDatabase(async database => {
    await addRequestThreadShapes(database);
    if (options.threadsEnabled !== undefined) {
      await upsertPlatformSetting(database, 'request_threads_enabled', String(options.threadsEnabled));
    }
    await run(database);
  }, { through: 185 });
}

/**
 * Customer A's quote request in Kamputhaw, Cebu City, with a live quote from
 * provider A (1,800 pesos) and one from provider B (2,100 pesos), both valid
 * for 40 more hours. No provider is booked yet.
 */
export async function seedQuoteRequest(database: Pool, status = 'quoted'): Promise<void> {
  await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
      description, address, barangay, city, province, latitude, longitude, urgency, scheduled_at)
    VALUES ($1, $2, 'quote_based', $3, $4, $5, 'The bedroom aircon blows warm air and drips water.',
      '22 Mango Avenue', 'Kamputhaw', 'Cebu City', 'Cebu', 10.3157, 123.8854, 'within_3_days',
      NOW() + INTERVAL '3 days')`,
  [requestBooking, customerA, status, requestCategory, quoteService]);
  await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, description, status, expires_at)
    VALUES ($1, $3, $4, 180000, 'Clean the coils and recharge the gas.', 'submitted', NOW() + INTERVAL '40 hours'),
           ($2, $3, $5, 210000, 'Replace the capacitor and clean the unit.', 'submitted', NOW() + INTERVAL '40 hours')`,
  [quoteFromA, quoteFromB, requestBooking, providerA, providerB]);
}

/** Book provider A on the request the way acceptQuote leaves it (price omitted). */
export async function bookProviderA(database: Pool): Promise<void> {
  await database.query(`UPDATE bookings SET provider_id = $2, status = 'payment_pending' WHERE id = $1`,
    [requestBooking, providerA]);
  await database.query(`UPDATE booking_quotes SET status = 'accepted', is_accepted = TRUE WHERE id = $1`, [quoteFromA]);
  await database.query(`UPDATE booking_quotes SET status = 'declined' WHERE id = $1`, [quoteFromB]);
}

/** One participant message written directly, for paging and read fixtures. */
export async function insertMessage(
  database: Pool,
  conversationId: string,
  senderId: string,
  content: string,
  createdAt?: string,
): Promise<string> {
  const result = await database.query<{ id: string }>(`INSERT INTO messages (conversation_id, sender_id, content, created_at)
    VALUES ($1, $2, $3, COALESCE($4::timestamptz, clock_timestamp())) RETURNING id`,
  [conversationId, senderId, content, createdAt ?? null]);
  return result.rows[0]!.id;
}

/** The participant messaging routes behind the real authentication middleware. */
export function threadHttp(userId: string, role: string) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/conversations', messagingRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  const auth = `Bearer ${token}`;
  return {
    list: (query: Record<string, string> = {}) => request(app).get('/api/v1/conversations')
      .query(query).set('Authorization', auth),
    open: (body: Record<string, unknown>) => request(app).post('/api/v1/conversations')
      .set('Authorization', auth).send(body),
    get: (conversationId: string) => request(app).get(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', auth),
    messages: (conversationId: string, query: Record<string, string | number> = {}) => request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`).query(query).set('Authorization', auth),
    send: (conversationId: string, body: Record<string, unknown>) => request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`).set('Authorization', auth).send(body),
    report: (messageId: string, reason: string) => request(app)
      .post(`/api/v1/conversations/messages/${messageId}/report`).set('Authorization', auth).send({ reason }),
  };
}

/** The admin Booking 360 and Communications routes as the fixture's super admin. */
export function adminHttp() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/bookings', bookingAdminRouter);
  app.use('/api/v1/admin/conversations', messagingAdminRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: operatorId, role: 'super_admin', sessionVersion: 1, type: 'access' },
    syntheticSecret, { expiresIn: '5m' });
  const auth = `Bearer ${token}`;
  return {
    get: (path: string) => request(app).get(`/api/v1/admin${path}`).set('Authorization', auth),
    post: (path: string, body: Record<string, unknown>) => request(app).post(`/api/v1/admin${path}`)
      .set('Authorization', auth).send(body),
  };
}

/** A signed access token for the fixture's synthetic secret. */
export function accessToken(userId: string, role: string, expiresInSeconds = 300): string {
  return jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: expiresInSeconds });
}

/** The real Socket.IO server (initSocketServer) on an ephemeral local port. */
export async function startSocketServer(): Promise<{ url: string; io: Server; close: () => Promise<void> }> {
  const httpServer = createServer();
  const io = initSocketServer(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  return {
    url,
    io,
    close: async () => {
      await new Promise<void>(resolve => io.close(() => resolve()));
      _setIoForTest(null);
    },
  };
}

/** A real Socket.IO client that has completed the handshake. */
export function connectSocket(url: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = createClient(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    client.once('connect', () => resolve(client));
    client.once('connect_error', error => { client.close(); reject(error); });
  });
}

/** Resolve with the next `event` payload, or reject after `ms`. */
export function nextEvent<T = unknown>(client: ClientSocket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} was not received`)), ms);
    client.once(event, (payload: T) => { clearTimeout(timer); resolve(payload); });
  });
}

/**
 * Stand-in shapes for the admin Booking 360 reads (detail, timeline, evidence
 * and proof summary) that this fixture does not otherwise build: the columns
 * and tables those queries name, with no rows. The conversations and messages
 * tables they count stay the real 006/123/138/185 ones.
 */
export async function addBookingAdminReadShapes(database: Pool): Promise<void> {
  await database.query(`
    ALTER TABLE users ADD COLUMN phone text, ADD COLUMN email text;
    ALTER TABLE bookings
      ADD COLUMN completed_at timestamptz, ADD COLUMN confirmed_at timestamptz,
      ADD COLUMN work_completed_at timestamptz, ADD COLUMN completion_notes text,
      ADD COLUMN business_account_id uuid, ADD COLUMN contract_id uuid,
      ADD COLUMN business_account_terms_version_id uuid, ADD COLUMN billing_mode text;
    CREATE TABLE business_accounts (id uuid PRIMARY KEY, company_name text, status text);
    CREATE TABLE business_contracts (id uuid PRIMARY KEY, business_account_id uuid, contract_type text,
      frequency text, status text);
    CREATE TABLE business_account_term_versions (id uuid PRIMARY KEY, business_account_id uuid,
      version integer, effective_from timestamptz);
    CREATE TABLE business_invoices (id uuid PRIMARY KEY, business_account_id uuid, invoice_number text,
      status text, settlement_state text, created_at timestamptz);
    CREATE TABLE business_invoice_items (id uuid PRIMARY KEY, invoice_id uuid, booking_id uuid);
    CREATE TABLE reviews (id uuid PRIMARY KEY, reviewer_id uuid, rating integer);
    CREATE TABLE booking_images (id uuid PRIMARY KEY, booking_id uuid, image_url text, image_type text,
      uploaded_by uuid, created_at timestamptz);
    CREATE TABLE booking_photos (id uuid PRIMARY KEY, booking_id uuid, storage_url text, storage_key text,
      photo_type text, uploaded_by uuid, uploaded_by_role text, uploaded_at timestamptz, deleted_at timestamptz,
      mime_type text, original_size_bytes integer, stored_size_bytes integer);
    CREATE TABLE booking_checklists (id uuid PRIMARY KEY, booking_id uuid, template_version integer, shown_at timestamptz);
    CREATE TABLE checklist_template_sections (id uuid PRIMARY KEY, title text, display_order integer);
    CREATE TABLE checklist_template_items (id uuid PRIMARY KEY, section_id uuid, display_order integer);
    CREATE TABLE booking_checklist_items (id uuid PRIMARY KEY, booking_checklist_id uuid, template_item_id uuid,
      title_snapshot text, description_snapshot text, photo_required boolean, is_required boolean,
      is_completed boolean, completed_at timestamptz, photo_id uuid, notes text);
    CREATE TABLE booking_signatures (id uuid PRIMARY KEY, booking_id uuid, signature_type text, signed_by uuid,
      signed_role text, full_name_typed text, signed_at timestamptz, storage_url text, storage_key text,
      deleted_at timestamptz);
    CREATE TABLE change_orders (id uuid PRIMARY KEY, booking_id uuid, description text, additional_amount bigint,
      status text, photos text[], customer_responded_at timestamptz, created_at timestamptz);
    CREATE TABLE disputes (id uuid PRIMARY KEY, booking_id uuid, type text, status text, created_at timestamptz,
      resolved_at timestamptz);
    CREATE TABLE quote_line_items (id uuid PRIMARY KEY, quote_id uuid, description text, item_type text,
      quantity numeric, unit text, unit_price bigint, line_total bigint, created_at timestamptz);
  `);
}
