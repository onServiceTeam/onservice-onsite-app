// HA-REQ (customer human audit 2026-10-13, D38) helpers: request-first job
// requests on the guarded PostgreSQL fixture, so a request, a provider quote,
// the customer's acceptance and the wallet payment all run real SQL against
// one schema.
//
// Built on withQuotePaymentDatabase (booking-participant + payment_intents and
// the real migration 162 financial terms), plus the job-request, catalog,
// quote and coverage tables those steps read. Column shapes follow the
// production migrations: bookings 004/018/031/059/140, booking_quotes
// 004/018/059, service_subcategories 003/142, subcategory_intake_fields 140,
// provider_services 013. This is a scoped fixture, not the complete migration
// chain. Push delivery is the only network edge; each test file mocks
// notification.service sendPushNotification itself.
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import bookingRouter from '../../src/routes/booking.routes';
import paymentRouter from '../../src/routes/payment.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { withQuotePaymentDatabase } from './quote-payment-postgres';
import { providerA, syntheticSecret } from './booking-participant-postgres';

export const requestCategory = '80000000-0000-4000-8000-000000000001';
/** Fixed-price service with a catalog price of 50,000 centavos. */
export const fixedService = '81000000-0000-4000-8000-000000000001';
export const quoteService = '81000000-0000-4000-8000-000000000002';
export const hourlyService = '81000000-0000-4000-8000-000000000003';
export const inactiveService = '81000000-0000-4000-8000-000000000004';
export const perUnitService = '81000000-0000-4000-8000-000000000005';
/** A pin inside the fixture's active Cebu City service area. */
export const cebuPin = { latitude: 10.3157, longitude: 123.8854 };

export interface JobRequestFixtureOptions {
  /** Stored value of request_first_booking; omit to leave the row out. */
  requestFirstBooking?: string;
}

export async function withJobRequestDatabase(
  run: (database: Pool) => Promise<void>,
  options: JobRequestFixtureOptions = {},
): Promise<void> {
  await withQuotePaymentDatabase(async database => {
    await database.query(`
      ALTER TABLE users ADD COLUMN first_name text, ADD COLUMN last_name text;
      ALTER TABLE bookings
        ALTER COLUMN id SET DEFAULT gen_random_uuid(),
        ALTER COLUMN status SET DEFAULT 'requested',
        ALTER COLUMN escrow_status SET DEFAULT 'pending',
        ALTER COLUMN service_price SET DEFAULT 0,
        ALTER COLUMN service_fee SET DEFAULT 0,
        ALTER COLUMN total_amount SET DEFAULT 0,
        ADD COLUMN booking_type varchar(20) NOT NULL DEFAULT 'fixed_price'
          CHECK (booking_type IN ('fixed_price', 'quote_based')),
        ADD COLUMN description text NOT NULL DEFAULT '',
        ADD COLUMN address text NOT NULL DEFAULT '',
        ADD COLUMN barangay varchar(100) NOT NULL DEFAULT '',
        ADD COLUMN province varchar(100) NOT NULL DEFAULT '',
        ADD COLUMN urgency varchar(20)
          CHECK (urgency IS NULL OR urgency IN ('same_day', 'within_3_days', 'within_a_week', 'flexible')),
        ADD COLUMN budget_min bigint,
        ADD COLUMN budget_max bigint,
        ADD COLUMN job_photos text[] DEFAULT '{}',
        ADD COLUMN job_video_url text,
        ADD COLUMN intake_answers jsonb,
        ADD COLUMN suki_discount bigint NOT NULL DEFAULT 0;
      ALTER TABLE service_categories ADD COLUMN name text;
      ALTER TABLE service_subcategories
        ADD COLUMN category_id uuid REFERENCES service_categories(id),
        ADD COLUMN name text,
        ADD COLUMN pricing_type varchar(20) NOT NULL DEFAULT 'fixed'
          CHECK (pricing_type IN ('fixed', 'quote', 'hourly', 'per_unit')),
        ADD COLUMN base_price bigint,
        ADD COLUMN is_active boolean NOT NULL DEFAULT TRUE;
      ALTER TABLE providers ADD COLUMN latitude numeric, ADD COLUMN longitude numeric,
        ADD COLUMN service_radius_km integer;
      CREATE TABLE provider_services (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id),
        category_id uuid REFERENCES service_categories(id),
        subcategory_id uuid REFERENCES service_subcategories(id),
        is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE subcategory_intake_fields (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subcategory_id uuid NOT NULL REFERENCES service_subcategories(id) ON DELETE CASCADE,
        field_key varchar(60) NOT NULL,
        label varchar(120) NOT NULL,
        help_text varchar(200),
        field_type varchar(20) NOT NULL CHECK (field_type IN ('number', 'text', 'choice', 'boolean')),
        unit varchar(30),
        options jsonb,
        placeholder varchar(160),
        is_required boolean NOT NULL DEFAULT FALSE,
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT TRUE,
        UNIQUE (subcategory_id, field_key));
      CREATE TABLE booking_quotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        provider_id uuid NOT NULL REFERENCES providers(id),
        quoted_price bigint NOT NULL,
        description text NOT NULL DEFAULT '',
        estimated_duration_minutes integer,
        is_accepted boolean NOT NULL DEFAULT FALSE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        status varchar(20) NOT NULL DEFAULT 'submitted'
          CHECK (status IN ('submitted', 'accepted', 'declined', 'expired', 'withdrawn')),
        labor_amount bigint DEFAULT 0,
        materials_amount bigint DEFAULT 0,
        estimated_days integer,
        notes text DEFAULT '',
        portfolio_photos text[] DEFAULT '{}',
        updated_at timestamptz DEFAULT NOW());
      CREATE TABLE service_areas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL, status text NOT NULL,
        center_lat numeric NOT NULL, center_lng numeric NOT NULL, radius_km numeric NOT NULL);
      CREATE TABLE suki_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL REFERENCES users(id),
        provider_id uuid NOT NULL REFERENCES providers(id),
        tier text NOT NULL DEFAULT 'new');
    `);
    await database.query(`INSERT INTO service_areas(name,status,center_lat,center_lng,radius_km)
      VALUES ('Cebu City','active',10.3157,123.8854,25)`);
    await database.query("INSERT INTO service_categories(id,name) VALUES ($1,'Aircon Services')", [requestCategory]);
    await database.query(`INSERT INTO service_subcategories(id,category_id,name,pricing_type,base_price,is_active) VALUES
      ($2,$1,'Aircon cleaning','fixed',50000,TRUE),
      ($3,$1,'Aircon repair','quote',NULL,TRUE),
      ($4,$1,'Aircon technician by the hour','hourly',NULL,TRUE),
      ($5,$1,'Retired aircon service','fixed',40000,FALSE),
      ($6,$1,'Duct cleaning per metre','per_unit',NULL,TRUE)`,
    [requestCategory, fixedService, quoteService, hourlyService, inactiveService, perUnitService]);
    // Provider A covers the whole category from 2 km away with a 20 km radius.
    await database.query(`UPDATE providers SET latitude=10.33, longitude=123.90, service_radius_km=20
      WHERE id=$1`, [providerA]);
    await database.query('INSERT INTO provider_services(provider_id,category_id) VALUES ($1,$2)',
      [providerA, requestCategory]);
    if (options.requestFirstBooking !== undefined) {
      await database.query("INSERT INTO platform_settings(key,value) VALUES ('request_first_booking',$1)",
        [options.requestFirstBooking]);
    }
    await run(database);
  });
}

/** Mounted booking + payment routers behind the real authentication middleware. */
export function marketplaceHttp(userId: string, role: string) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/bookings', bookingRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  const auth = `Bearer ${token}`;
  return {
    jobRequest: (body: Record<string, unknown>) => request(app)
      .post('/api/v1/bookings/job-request').set('Authorization', auth).send(body),
    quote: (bookingId: string, body: Record<string, unknown>) => request(app)
      .post(`/api/v1/bookings/${bookingId}/quotes`).set('Authorization', auth).send(body),
    accept: (bookingId: string, quoteId: string) => request(app)
      .post(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/accept`).set('Authorization', auth).send({}),
    walletPay: (bookingId: string) => request(app)
      .post('/api/v1/payments/intent').set('Authorization', auth).send({ bookingId, paymentMethod: 'wallet' }),
  };
}

/** A complete, valid request body; tests override the parts they exercise. */
export function jobRequestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoryId: requestCategory,
    address: '22 Mango Avenue',
    barangay: 'Kamputhaw',
    city: 'Cebu City',
    province: 'Cebu',
    ...cebuPin,
    urgency: 'within_3_days',
    description: 'The bedroom aircon blows warm air and drips water onto the floor.',
    ...overrides,
  };
}

/**
 * The route fans each new request out to providers without awaiting it. Wait
 * for that background work to finish before the fixture schema is dropped.
 */
export async function waitForLeadFanOut(push: jest.Mock, calls: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (push.mock.calls.length < calls && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
