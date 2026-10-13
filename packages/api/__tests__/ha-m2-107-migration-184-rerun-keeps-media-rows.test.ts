// HA-M2-107 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 32): applying migration 184 a second time on a database
// that already holds job media (stored, attached and deleted items) and
// admin audit rows changes nothing: every job_media row, every admin_actions
// row (earlier action names and job_media_viewed) and the constraint stay as
// they were, and job_media_viewed can still be recorded. (HA-M2-07 covers
// the splice on an empty table in both stored constraint forms.) The REAL
// migration file on the guarded PostgreSQL fixture.
import { applyRequestEngineMigration } from './helpers/request-engine-postgres';
import { bookingIntegrationIt as it, customerA, operatorId } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, mediaHttp, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-107: running migration 184 again keeps every job_media row and the earlier admin action names', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const kept = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const attached = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 700 }) });
    const removed = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 900 }) });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [attached.id]);
    expect((await customer.remove(removed.id)).status).toBe(200);
    for (const action of ['booking_cancelled', 'conversation_viewed', 'job_media_viewed']) {
      await database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
        VALUES ($1, $2, 'booking', $3, '{}'::jsonb)`, [operatorId, action, bookingId]);
    }
    const snapshot = async () => ({
      media: (await database.query('SELECT * FROM job_media ORDER BY id')).rows,
      actions: (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows,
      check: (await database.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'admin_actions_action_type_check' AND conrelid = 'admin_actions'::regclass`)).rows,
      jobMediaConstraints: (await database.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'job_media'::regclass ORDER BY conname`)).rows,
    });
    const before = await snapshot();
    expect(before.media.map(row => row.status).sort()).toEqual(['attached', 'deleted', 'stored']);
    expect(before.media.find(row => row.id === kept.id)).toMatchObject({ status: 'stored' });

    await applyRequestEngineMigration(database, 184);
    expect(await snapshot()).toEqual(before);

    await database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id)
      VALUES ($1, 'job_media_viewed', 'booking', $2)`, [operatorId, bookingId]);
    await expect(database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id)
      VALUES ($1, 'not_an_action', 'booking', $2)`, [operatorId, bookingId])).rejects.toMatchObject({ code: '23514' });
  });
}, 60000);
