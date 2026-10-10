// S1-8 helpers: the super admin's real dedicated cancel route, mounted on the
// guarded participant fixture. The shared fixture allows only refund audits,
// so the production booking_cancelled verb is added here, as SEC-091 does.
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import bookingAdminRouter from '../../src/routes/booking-admin.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { operatorId, syntheticSecret } from './booking-participant-postgres';

export async function allowAdminCancelAudits(database: Pool): Promise<void> {
  await database.query(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
      CHECK (action_type IN ('refund_issued','booking_cancelled'))`);
}

function superAdminApp() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/bookings', bookingAdminRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: operatorId, role: 'super_admin', sessionVersion: 1, type: 'access' },
    syntheticSecret, { expiresIn: '5m' });
  return { app, token };
}

export function adminCancelHttp() {
  const { app, token } = superAdminApp();
  return (bookingId: string, body: Record<string, unknown> = {}) => request(app)
    .post(`/api/v1/admin/bookings/${bookingId}/cancel`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Synthetic support-approved admin cancellation', ...body });
}

// The super admin's real manual release route. It reads the production
// suspension marker column and writes the manual_escrow_release verb, so the
// fixture gains both (together with the cancel verb).
export async function allowAdminReleaseAndCancel(database: Pool): Promise<void> {
  await database.query(`ALTER TABLE bookings ADD COLUMN provider_suspended_during_booking_at timestamptz;
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
      CHECK (action_type IN ('refund_issued','booking_cancelled','manual_escrow_release'))`);
}

export function adminReleaseHttp() {
  const { app, token } = superAdminApp();
  return (bookingId: string) => request(app)
    .post(`/api/v1/admin/bookings/${bookingId}/escrow/release`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Synthetic support-approved manual release' });
}
