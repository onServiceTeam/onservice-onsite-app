// S1-12 (OPS-560) helpers: the super admin's real reassign route on the
// guarded participant fixture. Booking B is paid by customer B and assigned to
// provider B with real assignment terms; provider A is approved, available,
// offers the booking's service and covers its location, so it is eligible to
// take the booking over. The time-overlap check reads quote tables this
// fixture does not have, so tests stub it (no overlap). conversations and the
// performer column are bare stand-ins with the columns the reassign uses.
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
  withParticipantRefundDatabase, bookingB, providerA, providerB, providerUserA, providerUserB,
  operatorId, syntheticSecret,
} from './booking-participant-postgres';

export async function withReassignDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withParticipantRefundDatabase(async database => {
    const categoryId = crypto.randomUUID();
    await database.query(`
      ALTER TABLE providers ADD COLUMN is_available boolean NOT NULL DEFAULT TRUE,
        ADD COLUMN latitude numeric, ADD COLUMN longitude numeric, ADD COLUMN service_radius_km numeric;
      ALTER TABLE bookings ADD COLUMN performer_staff_id uuid;
      CREATE TABLE provider_services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id), category_id uuid NOT NULL,
        subcategory_id uuid, is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id uuid REFERENCES bookings(id), provider_id uuid, updated_at timestamptz NOT NULL DEFAULT NOW());
      ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
      ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
        CHECK (action_type IN ('refund_issued','booking_reassigned'));
    `);
    await database.query('INSERT INTO service_categories(id) VALUES ($1)', [categoryId]);
    // Cebu City; both providers sit on the booking and cover 20 km.
    await database.query(`UPDATE bookings SET category_id=$2, latitude=10.3157, longitude=123.8854 WHERE id=$1`,
      [bookingB, categoryId]);
    await database.query(`UPDATE providers SET latitude=10.3157, longitude=123.8854, service_radius_km=20`);
    await database.query('INSERT INTO provider_services(provider_id,category_id) VALUES ($1,$2),($3,$2)',
      [providerA, categoryId, providerB]);
    await database.query('INSERT INTO notification_preferences(user_id) VALUES ($1),($2)', [providerUserA, providerUserB]);
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    await database.query('INSERT INTO conversations(booking_id,provider_id) VALUES ($1,$2)', [bookingB, providerUserB]);
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
