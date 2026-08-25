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

integrationIt('Bug UX-350 — migration 156 accepts both DPO and provider-staff accounts', async () => {
  const client = new Client({ connectionString: databaseUrl });
  const schema = `ux350_${randomUUID().replace(/-/g, '')}`;
  const migration = readFileSync(
    path.resolve(__dirname, '../migrations/156_restore_dpo_provider_staff_user_roles.sql'),
    'utf8',
  );

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE users (
        role VARCHAR(30) NOT NULL,
        CONSTRAINT users_role_check CHECK (
          role IN ('customer', 'provider', 'admin', 'super_admin', 'provider_staff')
        )
      )
    `);

    await client.query(migration);
    await client.query(`
      INSERT INTO users (role) VALUES
        ('customer'), ('provider'), ('admin'), ('super_admin'), ('dpo'), ('provider_staff')
    `);
    const roles = await client.query<{ role: string }>('SELECT role FROM users ORDER BY role');
    expect(roles.rows.map((row) => row.role)).toEqual([
      'admin', 'customer', 'dpo', 'provider', 'provider_staff', 'super_admin',
    ]);
  } finally {
    await client.query('RESET search_path').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await client.end();
  }
});
