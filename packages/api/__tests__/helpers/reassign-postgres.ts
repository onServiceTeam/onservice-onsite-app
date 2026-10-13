// S1-12 (OPS-560) helpers: the super admin's real reassign route on the
// guarded participant fixture. Booking B is paid by customer B and assigned to
// provider B with real assignment terms; provider A is approved, available,
// offers the booking's service and covers its location, so it is eligible to
// take the booking over. The time-overlap check is stubbed by the tests (no
// overlap).
//
// D38 (Milestone 2, package P4): the fixture now runs on the request-thread
// fixture (helpers/request-thread-postgres.ts), so conversations and messages
// are the REAL tables from migrations 006, 123, 138 and 185 instead of the
// earlier bare stand-in (booking_id and provider_id only). Booking B starts
// with provider B's booked thread (customer B and provider B). Changes from
// the original lines: the base fixture, the performer column only (the
// provider location columns, provider_services and the provider notification
// preferences now come from the base fixtures), and the conversation insert
// gains customer_id. The data each test starts from is otherwise unchanged.
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import { db } from '../../src/models/db';
import bookingAdminRouter from '../../src/routes/booking-admin.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { appendProviderAssignmentTermsInTransaction } from '../../src/services/booking-financial-terms.service';
import {
  bookingB, customerB, providerA, providerB, providerUserB, operatorId, syntheticSecret,
} from './booking-participant-postgres';
import { withRequestThreadDatabase } from './request-thread-postgres';

/** Provider B's booked thread on booking B. */
export const bookingBConversation = '86000000-0000-4000-8000-000000000001';

export async function withReassignDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withRequestThreadDatabase(async database => {
    const categoryId = crypto.randomUUID();
    await database.query('ALTER TABLE bookings ADD COLUMN performer_staff_id uuid');
    await database.query('INSERT INTO service_categories(id) VALUES ($1)', [categoryId]);
    // Cebu City; both providers sit on the booking and cover 20 km.
    await database.query(`UPDATE bookings SET category_id=$2, latitude=10.3157, longitude=123.8854 WHERE id=$1`,
      [bookingB, categoryId]);
    await database.query(`UPDATE providers SET latitude=10.3157, longitude=123.8854, service_radius_km=20`);
    await database.query('INSERT INTO provider_services(provider_id,category_id) VALUES ($1,$2),($3,$2)',
      [providerA, categoryId, providerB]);
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    await database.query('INSERT INTO conversations(id,booking_id,customer_id,provider_id) VALUES ($1,$2,$3,$4)',
      [bookingBConversation, bookingB, customerB, providerUserB]);
    await run(database);
  });
}

export function reassignHttp() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/bookings', bookingAdminRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: operatorId, role: 'super_admin', sessionVersion: 1, type: 'access' },
    syntheticSecret, { expiresIn: '5m' });
  return (bookingId: string, newProviderId: string) => request(app)
    .post(`/api/v1/admin/bookings/${bookingId}/reassign`)
    .set('Authorization', `Bearer ${token}`)
    .send({ newProviderId, reason: 'Synthetic support-approved reassignment' });
}
