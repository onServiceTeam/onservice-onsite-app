// HA-M2-112 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 44): when an account's deletion cooling-off ends, the real
// anonymisation cascade (processExpiredCoolingOff -> anonymizeUser) marks all
// of that user's private media deleted in the same transaction, attached
// request photos included, and the job-media cleanup worker then removes the
// files and records purged_at. Another customer's media is untouched. Real
// data-management and job-media services, storage and migration 184 on the
// guarded PostgreSQL fixture; the account tables the cascade also touches
// are added as scoped shapes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { processExpiredCoolingOff } from '../src/services/data-management.service';
import { cleanupJobMedia } from '../src/services/job-media.service';
import { bookingIntegrationIt as it, customerB } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, mediaHttp, storePath, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-112: anonymising an account marks its media deleted and the worker removes the files', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    // Account tables the anonymisation cascade reads or clears (scoped shapes).
    await database.query(`
      ALTER TABLE users ADD COLUMN phone text, ADD COLUMN email text, ADD COLUMN email_verified_at timestamptz,
        ADD COLUMN avatar_url text, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
      CREATE TABLE account_deletion_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'cooling_off',
        cooling_off_ends_at timestamptz NOT NULL DEFAULT NOW() - INTERVAL '1 day', processed_at timestamptz);
      CREATE TABLE disputes (booking_id uuid REFERENCES bookings(id), status text);
      CREATE TABLE refresh_tokens (user_id uuid REFERENCES users(id));
      CREATE TABLE email_link_challenges (user_id uuid REFERENCES users(id));
      CREATE TABLE email_sign_in_challenges (user_id uuid REFERENCES users(id));
      CREATE TABLE sign_in_email_identities (user_id uuid REFERENCES users(id));
      CREATE TABLE email_code_challenges (user_id uuid REFERENCES users(id), recipient_hash text);
      CREATE TABLE user_addresses (user_id uuid REFERENCES users(id));
      CREATE TABLE push_tokens (user_id uuid REFERENCES users(id));
      ALTER TABLE reviews ADD COLUMN reviewer_id uuid REFERENCES users(id), ADD COLUMN comment text;
    `);
    // A customer with no wallet balance and no open booking can be anonymised.
    const leaving = crypto.randomUUID();
    await database.query("INSERT INTO users (id, role, first_name, last_name) VALUES ($1, 'customer', 'Leaving', 'Customer')", [leaving]);
    const leaver = mediaHttp(leaving, 'customer');
    const sent = await uploadThroughApi(leaver, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const loose = await uploadThroughApi(leaver, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 800 }) });
    const bookingId = await createQuoteRequest(database, leaving);
    await attachRequestMedia(leaving, bookingId, [sent.id]);
    await database.query("UPDATE bookings SET status = 'cancelled_by_customer', cancelled_at = NOW() WHERE id = $1", [bookingId]);
    const other = await uploadThroughApi(mediaHttp(customerB, 'customer'), { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 600 }) });
    await database.query('INSERT INTO account_deletion_requests (user_id) VALUES ($1)', [leaving]);

    const files = new Map<string, string>();
    for (const row of (await database.query('SELECT id, storage_key FROM job_media')).rows) {
      files.set(row.id, storePath(uploadDir, row.storage_key));
    }
    const state = async () => (await database.query(`SELECT id, status, booking_id, deleted_at IS NOT NULL AS deleted,
        purged_at IS NOT NULL AS purged FROM job_media ORDER BY id`)).rows;

    expect(await processExpiredCoolingOff()).toBe(1);
    expect((await database.query('SELECT first_name, is_active FROM users WHERE id = $1', [leaving])).rows)
      .toEqual([{ first_name: 'Deleted', is_active: false }]);
    const afterCascade = new Map((await state()).map(row => [row.id, row]));
    expect(afterCascade.get(sent.id)).toMatchObject({ status: 'deleted', booking_id: bookingId, deleted: true, purged: false });
    expect(afterCascade.get(loose.id)).toMatchObject({ status: 'deleted', deleted: true, purged: false });
    expect(afterCascade.get(other.id)).toMatchObject({ status: 'stored', deleted: false });
    // Files are only removed by the worker, after the cascade committed.
    expect(fs.existsSync(files.get(sent.id)!)).toBe(true);

    expect(await cleanupJobMedia()).toMatchObject({ purged: 2 });
    const afterWorker = new Map((await state()).map(row => [row.id, row]));
    expect(afterWorker.get(sent.id)).toMatchObject({ status: 'deleted', purged: true });
    expect(afterWorker.get(loose.id)).toMatchObject({ status: 'deleted', purged: true });
    expect(fs.existsSync(files.get(sent.id)!)).toBe(false);
    expect(fs.existsSync(files.get(loose.id)!)).toBe(false);
    expect(fs.existsSync(files.get(other.id)!)).toBe(true);
  });
}, 60000);
