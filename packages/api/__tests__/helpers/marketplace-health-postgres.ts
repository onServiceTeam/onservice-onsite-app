// HA-M3 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API)
// helpers: back-office marketplace insights and request alerts on the
// guarded PostgreSQL fixture.
//
// Built on P2's withRequestFlowDatabase({ through: 185 }), so the request
// engine tables come from the REAL migrations 183, 184 and 185, and the alert
// table, its three settings and its admin action name from the REAL
// migration 186 (read from disk, never a copy). On top of that it adds only
// production shapes the insights read:
//   - users.phone, users.email and users.last_login_at (migration 001);
//   - service_categories.is_active (migration 003);
//   - provider_service_areas exactly as migration 022 creates it;
//   - the real migration 156, which puts 'dpo' back into users_role_check
//     after the real 131 (applied by the request-flow fixture) dropped it;
//   - an admin and a dpo account beside the fixture's super_admin
//     (operatorId), and phone numbers for both fixture providers.
// The router is the real marketplace-health admin router behind the real
// authentication middleware (Bearer, or the admin_session cookie with its
// CSRF pair). This is a scoped fixture, not the complete migration chain.
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import marketplaceRouter from '../../src/routes/marketplace-health-admin.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { operatorId, providerUserA, providerUserB, syntheticSecret } from './booking-participant-postgres';
import { withRequestFlowDatabase } from './request-flow-postgres';
import { readMigration } from './request-engine-postgres';

export const adminUser = '40000000-0000-4000-8000-000000000002';
export const dpoUser = '40000000-0000-4000-8000-000000000003';
/** The fixture's super_admin. */
export const superAdminUser = operatorId;
export const providerPhoneA = '+639171234567';
export const providerPhoneB = '+639181112222';

export const MARKETPLACE_MIGRATION = '186_marketplace_alerts.sql';

export async function applyMarketplaceMigration(database: Pool): Promise<void> {
  await database.query(readMigration(MARKETPLACE_MIGRATION));
}

export async function addMarketplaceShapes(database: Pool): Promise<void> {
  await database.query(`
    ALTER TABLE users
      ADD COLUMN phone varchar(15) UNIQUE,
      ADD COLUMN email varchar(255) UNIQUE,
      ADD COLUMN last_login_at timestamptz;
    ALTER TABLE service_categories ADD COLUMN is_active boolean NOT NULL DEFAULT TRUE;
    CREATE TABLE provider_service_areas (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      service_area_id UUID NOT NULL REFERENCES service_areas(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider_id, service_area_id));
  `);
  // 131 (applied by the request-flow fixture) replaced users_role_check
  // without 'dpo'; the real 156 restores it, as on live.
  await database.query(readMigration('156_restore_dpo_provider_staff_user_roles.sql'));
  await database.query(`INSERT INTO users (id, role, first_name, last_name) VALUES
      ($1, 'admin', 'Ada', 'Admin'), ($2, 'dpo', 'Dina', 'Privacy')`, [adminUser, dpoUser]);
  await database.query(`UPDATE users SET phone = CASE id WHEN $1::uuid THEN $3 WHEN $2::uuid THEN $4 END
    WHERE id IN ($1, $2)`, [providerUserA, providerUserB, providerPhoneA, providerPhoneB]);
}

export interface MarketplaceFixtureOptions {
  /** Apply migration 186 before the test body (default true). */
  migration186?: boolean;
}

export async function withMarketplaceDatabase(
  run: (database: Pool) => Promise<void>,
  options: MarketplaceFixtureOptions = {},
): Promise<void> {
  await withRequestFlowDatabase(async database => {
    await addMarketplaceShapes(database);
    if (options.migration186 !== false) await applyMarketplaceMigration(database);
    await run(database);
  }, { through: 185 });
}

const BASE = '/api/v1/admin/marketplace-health';

/** The real marketplace-health router behind the real authentication middleware. */
export function marketplaceAdminHttp(userId: string, role: string) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(BASE, marketplaceRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  const auth = `Bearer ${token}`;
  return {
    get: (path: string) => request(app).get(`${BASE}${path}`).set('Authorization', auth),
    post: (path: string, body: Record<string, unknown> = {}) =>
      request(app).post(`${BASE}${path}`).set('Authorization', auth).send(body),
    /** The admin web's credential: admin_session cookie plus the admin_csrf cookie; the header is optional. */
    cookiePost: (path: string, body: Record<string, unknown>, csrfHeader?: string) => {
      const sent = request(app).post(`${BASE}${path}`)
        .set('Cookie', [`admin_session=${token}`, 'admin_csrf=synthetic-marketplace-csrf'])
        .send(body);
      return csrfHeader ? sent.set('X-CSRF-Token', csrfHeader) : sent;
    },
    anonymousGet: (path: string) => request(app).get(`${BASE}${path}`),
  };
}

export interface InviteSpec {
  bookingId: string;
  providerId: string;
  round?: number;
  source?: 'push' | 'inbox';
  status?: string;
  /** SQL interval before NOW() for sent_at (default '30 minutes'). */
  sentAgo?: string;
  /** Minutes after sent_at for viewed_at; omitted = never viewed. */
  viewedAfterMinutes?: number;
  /** Minutes after sent_at for responded_at; omitted = no timestamp. */
  respondedAfterMinutes?: number;
  quoteId?: string | null;
}

/** Insert one job_request_invites row directly (as the engine would have written it). */
export async function insertInvite(database: Pool, spec: InviteSpec): Promise<string> {
  const id = crypto.randomUUID();
  await database.query(`INSERT INTO job_request_invites
      (id, booking_id, provider_id, round, source, status, sent_at, viewed_at, responded_at, quote_id)
    SELECT $1, $2, $3, $4, $5, $6, s.sent_at,
           CASE WHEN $8::int IS NULL THEN NULL ELSE s.sent_at + make_interval(mins => $8::int) END,
           CASE WHEN $9::int IS NULL THEN NULL ELSE s.sent_at + make_interval(mins => $9::int) END,
           $10
      FROM (SELECT NOW() - $7::interval AS sent_at) s`, [
    id, spec.bookingId, spec.providerId, spec.round ?? 1, spec.source ?? 'push', spec.status ?? 'sent',
    spec.sentAgo ?? '30 minutes', spec.viewedAfterMinutes ?? null, spec.respondedAfterMinutes ?? null,
    spec.quoteId ?? null,
  ]);
  return id;
}

export interface AlertRow {
  booking_id: string;
  kind: string;
  request_round: number;
  threshold_minutes: number | null;
  resolution: string | null;
  open: boolean;
  acknowledged: boolean;
}

/** Alert rows, optionally of one request, by booking then raise order. */
export async function alertsOf(database: Pool, bookingId?: string): Promise<AlertRow[]> {
  return (await database.query<AlertRow>(`SELECT booking_id, kind, request_round, threshold_minutes, resolution,
      resolved_at IS NULL AS open, acknowledged_at IS NOT NULL AS acknowledged
    FROM marketplace_alerts
    WHERE ($1::uuid IS NULL OR booking_id = $1::uuid)
    ORDER BY booking_id, raised_at, kind`, [bookingId ?? null])).rows;
}

/** Close a request the way the 72-hour expiry worker does (no admin action row). */
export async function closeAsExpired(database: Pool, bookingId: string): Promise<void> {
  await database.query(`UPDATE bookings SET status = 'cancelled_by_admin', cancelled_at = NOW(),
      cancellation_reason = 'expired_no_provider', updated_at = NOW() WHERE id = $1`, [bookingId]);
}

/** Close a request the way a customer cancellation does. */
export async function closeByCustomer(database: Pool, bookingId: string): Promise<void> {
  await database.query(`UPDATE bookings SET status = 'cancelled_by_customer', cancelled_at = NOW(),
      cancellation_reason = 'Synthetic change of plans', updated_at = NOW() WHERE id = $1`, [bookingId]);
}
