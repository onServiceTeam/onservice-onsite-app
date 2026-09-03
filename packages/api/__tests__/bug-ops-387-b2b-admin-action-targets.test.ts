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

integrationIt('Bug OPS-387 - the database accepts every B2B audit target without dropping earlier targets', async () => {
  const client = new Client({ connectionString: databaseUrl });
  const schema = `ops387_${randomUUID().replace(/-/g, '')}`;
  const migration = readFileSync(
    path.resolve(__dirname, '../migrations/169_b2b_admin_action_targets.sql'),
    'utf8',
  );

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE admin_actions (
        target_type VARCHAR(30) NOT NULL,
        CONSTRAINT admin_actions_target_type_check CHECK (
          target_type IN ('provider', 'business', 'review')
        )
      )
    `);

    await client.query(migration);
    await client.query(`
      INSERT INTO admin_actions (target_type) VALUES
        ('provider'),
        ('business'),
        ('review'),
        ('business_account'),
        ('business_contract'),
        ('business_invoice')
    `);

    const targets = await client.query<{ target_type: string }>(
      'SELECT target_type FROM admin_actions ORDER BY target_type',
    );
    expect(targets.rows.map((row) => row.target_type)).toEqual([
      'business',
      'business_account',
      'business_contract',
      'business_invoice',
      'provider',
      'review',
    ]);

    await expect(
      client.query("INSERT INTO admin_actions (target_type) VALUES ('not_a_real_target')"),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await client.query('RESET search_path').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await client.end();
  }
});
