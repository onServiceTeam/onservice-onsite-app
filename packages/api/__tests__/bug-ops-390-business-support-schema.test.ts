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

integrationIt('Bug OPS-390 - support cases retain company context without relabelling planning projects', async () => {
  const client = new Client({ connectionString: databaseUrl });
  const schema = `ops390_${randomUUID().replace(/-/g, '')}`;
  const migration = readFileSync(
    path.resolve(__dirname, '../migrations/170_support_ticket_business_context.sql'),
    'utf8',
  );
  const businessId = randomUUID();

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE business_accounts (id UUID PRIMARY KEY)');
    await client.query(`
      CREATE TABLE support_tickets (
        id UUID PRIMARY KEY,
        project_id UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(migration);
    await client.query('INSERT INTO business_accounts (id) VALUES ($1)', [businessId]);
    await client.query(
      'INSERT INTO support_tickets (id, business_account_id) VALUES ($1, $2)',
      [randomUUID(), businessId],
    );

    const stored = await client.query<{ business_account_id: string }>(
      'SELECT business_account_id FROM support_tickets WHERE business_account_id = $1',
      [businessId],
    );
    expect(stored.rows).toEqual([{ business_account_id: businessId }]);
    await expect(client.query(
      'INSERT INTO support_tickets (id, project_id, business_account_id) VALUES ($1, $2, $3)',
      [randomUUID(), randomUUID(), businessId],
    )).rejects.toMatchObject({ code: '23514' });
  } finally {
    await client.query('RESET search_path').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await client.end();
  }
});
