import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const isSafeIntegrationDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const parsed = new URL(databaseUrl);
    return ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.pathname.replace(/^\//, '').endsWith('_test');
  } catch {
    return false;
  }
})();

const integrationIt = isSafeIntegrationDatabase ? it : it.skip;

integrationIt('Bug OPS-408 - Postgres accepts the recurring cancellation audit without dropping earlier action or target values', async () => {
  const client = new Client({ connectionString: databaseUrl });
  const schema = `ops408_${randomUUID().replace(/-/g, '')}`;
  const migration = readFileSync(
    path.resolve(__dirname, '../migrations/171_recurring_booking_admin_action.sql'),
    'utf8',
  );

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE admin_actions (
        action_type VARCHAR(50) NOT NULL,
        target_type VARCHAR(30) NOT NULL,
        CONSTRAINT admin_actions_action_type_check CHECK (
          action_type IN ('booking_cancelled', 'business_approved', 'review_visibility_changed')
        ),
        CONSTRAINT admin_actions_target_type_check CHECK (
          target_type IN ('booking', 'business_account', 'review')
        )
      )
    `);

    await client.query(migration);
    await client.query(migration);
    await client.query(`
      INSERT INTO admin_actions (action_type, target_type) VALUES
        ('booking_cancelled', 'booking'),
        ('business_approved', 'business_account'),
        ('review_visibility_changed', 'review'),
        ('recurring_booking_cancelled', 'recurring_booking')
    `);

    const recurring = await client.query<{ action_type: string; target_type: string }>(
      `SELECT action_type, target_type
         FROM admin_actions
        WHERE target_type = 'recurring_booking'`,
    );
    expect(recurring.rows).toEqual([{
      action_type: 'recurring_booking_cancelled',
      target_type: 'recurring_booking',
    }]);

    await expect(
      client.query(
        "INSERT INTO admin_actions (action_type, target_type) VALUES ('not_a_real_action', 'not_a_real_target')",
      ),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await client.query('RESET search_path').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await client.end();
  }
});
