// HA-M2-07 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// migration 184 appends job_media_viewed to admin_actions_action_type_check
// without dropping any earlier action name, whichever of the two forms
// Postgres stored the constraint in, and running the file again changes
// nothing. The real migration file runs on the guarded PostgreSQL fixture.
//
// The two stored forms (see migrations 138 and 171):
//   whole-array cast  ... = ANY ((ARRAY['a'::character varying, ...])::text[])
//                     (a fresh IN list on a VARCHAR column)
//   per-element cast  ... = ANY (ARRAY[('a'::character varying)::text, ...])
//                     (what live stores after earlier splices)
import type { Pool } from 'pg';
import { bookingIntegrationIt as it, bookingA, operatorId } from './helpers/booking-participant-postgres';
import {
  applyRequestEngineMigration, inListActionCheck, perElementActionCheck, withRequestEngineDatabase,
} from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const EARLIER_ACTIONS = ['booking_cancelled', 'refund_issued', 'conversation_viewed', 'recurring_booking_cancelled'];

async function actionCheck(database: Pool): Promise<string> {
  const result = await database.query<{ def: string }>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname = 'admin_actions_action_type_check' AND conrelid = 'admin_actions'::regclass`);
  return result.rows[0]!.def;
}

async function replaceActionCheck(database: Pool, check: string): Promise<void> {
  await database.query(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check ${check}`);
}

async function recordAction(database: Pool, actionType: string): Promise<void> {
  await database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id)
    VALUES ($1, $2, 'booking', $3)`, [operatorId, actionType, bookingA]);
}

async function actionCounts(database: Pool): Promise<unknown[]> {
  return (await database.query(`SELECT action_type, count(*)::int AS n FROM admin_actions
    GROUP BY action_type ORDER BY action_type`)).rows;
}

const oneOfEach = [...EARLIER_ACTIONS, 'job_media_viewed'].sort().map(action => ({ action_type: action, n: 1 }));

async function schemaState(database: Pool): Promise<unknown> {
  return {
    check: await actionCheck(database),
    settings: (await database.query(`SELECT key, value, updated_at FROM platform_settings
      WHERE key LIKE 'job\\_media\\_%' ORDER BY key`)).rows,
    indexes: (await database.query(`SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'job_media' ORDER BY indexname`)).rows,
    columns: (await database.query(`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'job_media'`)).rows,
  };
}

it('HA-M2-07: the 184 splice keeps every earlier action name in both stored forms and re-runs as a no-op', async () => {
  await withRequestEngineDatabase(async database => {
    // Form 1: whole-array cast.
    await replaceActionCheck(database, inListActionCheck(EARLIER_ACTIONS));
    expect(await actionCheck(database)).toMatch(/\]\)::text\[\]\)\)\)$/);
    await expect(recordAction(database, 'job_media_viewed')).rejects.toMatchObject({ code: '23514' });

    await applyRequestEngineMigration(database, 184);
    const afterFirstRun = await schemaState(database);
    await applyRequestEngineMigration(database, 184);
    expect(await schemaState(database)).toEqual(afterFirstRun);
    for (const action of [...EARLIER_ACTIONS, 'job_media_viewed']) await recordAction(database, action);
    await expect(recordAction(database, 'not_a_real_action')).rejects.toMatchObject({ code: '23514' });
    expect(await actionCounts(database)).toEqual(oneOfEach);

    // Form 2: per-element cast, as live stores it. The rows written above
    // would fail the narrower constraint, so they are cleared first.
    await database.query('DELETE FROM admin_actions');
    await replaceActionCheck(database, perElementActionCheck(EARLIER_ACTIONS));
    const perElement = await actionCheck(database);
    expect(perElement).toMatch(/\('recurring_booking_cancelled'::character varying\)::text\]\)\)\)$/);
    expect(perElement).not.toContain('::text[]');
    await expect(recordAction(database, 'job_media_viewed')).rejects.toMatchObject({ code: '23514' });

    await applyRequestEngineMigration(database, 184);
    const afterSplice = await schemaState(database);
    await applyRequestEngineMigration(database, 184);
    expect(await schemaState(database)).toEqual(afterSplice);
    for (const action of [...EARLIER_ACTIONS, 'job_media_viewed']) await recordAction(database, action);
    await expect(recordAction(database, 'not_a_real_action')).rejects.toMatchObject({ code: '23514' });
    expect(await actionCounts(database)).toEqual(oneOfEach);
  }, { through: 183 });
}, 90000);
