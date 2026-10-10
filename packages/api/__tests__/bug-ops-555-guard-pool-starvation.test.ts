import { Pool } from 'pg';
import { pool } from '../src/config/database.config';
import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withStaffJobListDatabase, participantHttp, snapshot,
  providerUserB, providerB, bookingA, bookingB, customerA, customerB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Run the application against a one-connection pool on the same fixture
// schema. While transitionBookingStatus holds its booking lock on that single
// connection, any awaited query that asks the shared pool for a second
// connection cannot be served and times out after one second.
async function withSingleConnectionPool(database: Pool, run: () => Promise<void>): Promise<void> {
  const schema = (await database.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0]!.schema;
  const single = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 1000,
    application_name: `${schema}_single`,
    options: `-c search_path=${schema} -c statement_timeout=15000 -c lock_timeout=12000`,
  });
  const previous = { query: pool.query, connect: pool.connect };
  Object.assign(pool, { query: single.query.bind(single), connect: single.connect.bind(single) });
  try { await run(); } finally {
    Object.assign(pool, previous);
    await single.end();
  }
}

// Focused gate tables: the columns the completion gates filter and count on
// (checklist.service getChecklistCompletionStatus, booking-photo.service
// countAfterPhotos), plus ids and the photo uploader reference. Not the full
// migration 078/079 schema.
async function addCompletionEvidence(database: Pool, bookingId: string, uploaderId: string): Promise<void> {
  // The completion write stamps these booking columns, which the shared
  // participant fixture does not create.
  await database.query(`
    ALTER TABLE bookings ADD COLUMN completed_at timestamptz, ADD COLUMN work_completed_at timestamptz;
    CREATE TABLE booking_checklists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL REFERENCES bookings(id));
    CREATE TABLE booking_checklist_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_checklist_id uuid NOT NULL REFERENCES booking_checklists(id),
      is_required boolean NOT NULL DEFAULT TRUE, is_completed boolean NOT NULL DEFAULT FALSE);
    CREATE TABLE booking_photos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL REFERENCES bookings(id), uploaded_by uuid NOT NULL REFERENCES users(id),
      uploaded_by_role text NOT NULL, photo_type text NOT NULL, deleted_at timestamptz);`);
  const checklist = await database.query<{ id: string }>(
    'INSERT INTO booking_checklists(booking_id) VALUES ($1) RETURNING id', [bookingId]);
  await database.query(`INSERT INTO booking_checklist_items(booking_checklist_id,is_required,is_completed)
    VALUES ($1,TRUE,TRUE),($1,TRUE,TRUE),($1,FALSE,FALSE)`, [checklist.rows[0]!.id]);
  await database.query(`INSERT INTO booking_photos(booking_id,uploaded_by,uploaded_by_role,photo_type)
    VALUES ($1,$2,'provider','after'),($1,$2,'provider','after')`, [bookingId, uploaderId]);
}

it('Bug OPS-555 - booking status changes do not wait for a second pool connection while holding the booking lock', async () => {
  await withStaffJobListDatabase(async (database, staffUserId) => {
    // bookingA: provider B with its approved staff member as performer.
    // bookingB: provider B, in progress for an hour, with complete evidence.
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='in_progress', work_started_at=NOW() - INTERVAL '1 hour' WHERE id=$1",
        [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    await addCompletionEvidence(database, bookingB, providerUserB);
    const before = await snapshot(database);

    await withSingleConnectionPool(database, async () => {
      const staff = await participantHttp(staffUserId, 'provider_staff')(bookingA, 'provider_en_route');
      const provider = await participantHttp(providerUserB, 'provider')(bookingB, 'completed_by_provider');
      expect({ staff: staff.status, provider: provider.status }).toEqual({ staff: 200, provider: 200 });
      expect(staff.body.data).toMatchObject({ id: bookingA, status: 'provider_en_route' });
      expect(provider.body.data).toMatchObject({ id: bookingB, status: 'completed_by_provider' });
    });

    expect((await database.query('SELECT id,status FROM bookings ORDER BY id')).rows).toEqual([
      { id: bookingA, status: 'provider_en_route' }, { id: bookingB, status: 'completed_by_provider' },
    ]);
    expect(await snapshot(database)).toEqual(before);
    expect((await database.query('SELECT user_id,type FROM notifications ORDER BY type')).rows).toEqual([
      { user_id: customerB, type: 'job_completed' },
      { user_id: customerA, type: 'provider_en_route' },
    ]);
  });
}, 60000);
