// HA-M3-02 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 71): migration 186 appends marketplace_alert_acknowledged
// to admin_actions_action_type_check without dropping any earlier action name,
// whichever of the two forms Postgres stored the constraint in, an unknown
// name is still refused, and running the whole file again changes nothing.
// The real migration file runs on the guarded PostgreSQL fixture.
//
// The two stored forms (see migrations 138 and 171):
//   whole-array cast  ... = ANY ((ARRAY['a'::character varying, ...])::text[])
//   per-element cast  ... = ANY (ARRAY[('a'::character varying)::text, ...])
import type { Pool } from 'pg';
import { bookingIntegrationIt as it, bookingA, operatorId } from './helpers/booking-participant-postgres';
import { inListActionCheck, perElementActionCheck } from './helpers/request-engine-postgres';
import { applyMarketplaceMigration, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const EARLIER_ACTIONS = ['booking_cancelled', 'refund_issued', 'conversation_viewed', 'job_media_viewed'];
const NEW_ACTION = 'marketplace_alert_acknowledged';

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

async function schemaState(database: Pool): Promise<unknown> {
  return {
    check: await actionCheck(database),
    settings: (await database.query(`SELECT key, value, updated_at FROM platform_settings
      WHERE key LIKE 'ops\\_%' ORDER BY key`)).rows,
    indexes: (await database.query(`SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename IN ('marketplace_alerts', 'bookings') ORDER BY indexname`)).rows,
    constraints: (await database.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'marketplace_alerts'::regclass ORDER BY conname`)).rows,
  };
}

const oneOfEach = [...EARLIER_ACTIONS, NEW_ACTION].sort().map(action => ({ action_type: action, n: 1 }));

it('HA-M3-02: the 186 splice keeps every earlier action name in both stored forms and re-runs as a no-op', async () => {
  await withMarketplaceDatabase(async database => {
    // Form 1: whole-array cast.
    await replaceActionCheck(database, inListActionCheck(EARLIER_ACTIONS));
    expect(await actionCheck(database)).toMatch(/\]\)::text\[\]\)\)\)$/);
    await expect(recordAction(database, NEW_ACTION)).rejects.toMatchObject({ code: '23514' });

    await applyMarketplaceMigration(database);
    const afterFirstRun = await schemaState(database);
    await applyMarketplaceMigration(database);
    expect(await schemaState(database)).toEqual(afterFirstRun);
    for (const action of [...EARLIER_ACTIONS, NEW_ACTION]) await recordAction(database, action);
    await expect(recordAction(database, 'not_a_real_action')).rejects.toMatchObject({ code: '23514' });
    expect(await actionCounts(database)).toEqual(oneOfEach);

    // Form 2: per-element cast, as live stores it.
    await database.query('DELETE FROM admin_actions');
    await replaceActionCheck(database, perElementActionCheck(EARLIER_ACTIONS));
    const perElement = await actionCheck(database);
    expect(perElement).toMatch(/\('job_media_viewed'::character varying\)::text\]\)\)\)$/);
    expect(perElement).not.toContain('::text[]');
    await expect(recordAction(database, NEW_ACTION)).rejects.toMatchObject({ code: '23514' });

    await applyMarketplaceMigration(database);
    const afterSplice = await schemaState(database);
    await applyMarketplaceMigration(database);
    expect(await schemaState(database)).toEqual(afterSplice);
    for (const action of [...EARLIER_ACTIONS, NEW_ACTION]) await recordAction(database, action);
    await expect(recordAction(database, 'not_a_real_action')).rejects.toMatchObject({ code: '23514' });
    expect(await actionCounts(database)).toEqual(oneOfEach);
  }, { migration186: false });
}, 90000);
