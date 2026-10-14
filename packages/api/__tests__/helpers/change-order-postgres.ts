// S2-4: guarded change-order fixture on top of the Slice 2 money fixture.
// change_orders is written by hand from migrations 018 (the table), 036
// ("paid"), 059 (a BIGINT amount) and 139 ("expired"): migration 018 cannot
// run as a file here because it also creates and alters the quote tables.
// change_order_line_items is migration 141 itself. Booking B is already
// assigned to provider B with final terms; here it is put back in progress,
// so provider B can raise a change order and customer B can approve and pay
// it over HTTP. Customer B's wallet holds 1,000,000 after funding booking B:
// enough for two change orders at the fixture's 25% fee.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import bookingRouter from '../../src/routes/booking.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { withMoneyDisputeDatabase } from './money-dispute-postgres';
import {
  bookingB, customerB, customerWalletB, providerUserB, syntheticSecret, participantSnapshot,
} from './booking-participant-postgres';

export async function withChangeOrderDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withMoneyDisputeDatabase(async database => {
    await database.query(`
      CREATE TABLE change_orders (
          id UUID PRIMARY KEY DEFAULT uuidv7(),
          booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          provider_id UUID NOT NULL REFERENCES providers(id),
          description TEXT NOT NULL,
          additional_amount BIGINT NOT NULL,
          photos TEXT[] DEFAULT '{}',
          status VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'declined', 'paid', 'expired')),
          customer_responded_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await database.query(fs.readFileSync(path.join(__dirname, '../../migrations/141_change_order_line_items.sql'), 'utf8'));
    await database.query("UPDATE bookings SET status='in_progress', completed_at=NULL WHERE id=$1", [bookingB]);
    await run(database);
  });
}

function bearer(userId: string, role: string): string {
  return `Bearer ${jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' })}`;
}

// The mounted booking router with real authentication, for provider B
// (create) and customer B (respond, pay, list).
export function changeOrderHttp() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/bookings', bookingRouter);
  app.use(errorMiddleware);
  const provider = bearer(providerUserB, 'provider');
  const customer = bearer(customerB, 'customer');
  return {
    create: (additionalAmount: number, description = 'Synthetic extra work found during the job') => request(app)
      .post(`/api/v1/bookings/${bookingB}/change-orders`).set('Authorization', provider)
      .send({ description, additionalAmount }),
    respond: (changeOrderId: string, approved: boolean) => request(app)
      .post(`/api/v1/bookings/change-orders/${changeOrderId}/respond`).set('Authorization', customer)
      .send({ approved }),
    pay: (changeOrderId: string) => request(app)
      .post(`/api/v1/bookings/change-orders/${changeOrderId}/pay`).set('Authorization', customer)
      .send({ paymentMethod: 'wallet' }),
  };
}

// Raises a change order for `additionalAmount` and approves it over HTTP.
export async function approvedChangeOrder(additionalAmount: number): Promise<{ id: string; additionalTotal: number }> {
  const http = changeOrderHttp();
  const created = await http.create(additionalAmount);
  if (created.status !== 201) throw new Error(`Change order create failed with ${created.status}: ${JSON.stringify(created.body)}`);
  const approved = await http.respond(created.body.data.id, true);
  if (approved.status !== 200 || approved.body.data.paymentRequired !== true) {
    throw new Error(`Change order approval failed with ${approved.status}: ${JSON.stringify(approved.body)}`);
  }
  return { id: created.body.data.id, additionalTotal: approved.body.data.additionalTotal };
}

export async function customerWalletBalance(database: Pool): Promise<number> {
  return Number((await database.query<{ b: string }>('SELECT available_balance::text AS b FROM wallets WHERE id=$1',
    [customerWalletB])).rows[0]!.b);
}

export async function changeOrderSnapshot(database: Pool) {
  return {
    ...await participantSnapshot(database),
    changeOrders: (await database.query('SELECT * FROM change_orders ORDER BY id')).rows,
  };
}
