import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const parsed = new URL(databaseUrl);
    return ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.pathname.replace(/^\//, '').endsWith('_test');
  } catch { return false; }
})();
if (process.env.CI && !safeDatabase) {
  throw new Error('OPS-478 requires the isolated localhost *_test PostgreSQL service in CI.');
}
const integrationIt = safeDatabase ? it : it.skip;
const script = path.resolve(__dirname, '../scripts/run-reviewed-migrations.mjs');

integrationIt('Bug OPS-478 — a reviewed upper boundary applies every pending prerequisite, preserves history, excludes later files, and rejects unsafe bookkeeping', async () => {
  const schema = `ops478_${randomUUID().replaceAll('-', '')}`;
  const fixture = mkdtempSync(path.join(tmpdir(), 'onservice bounded migration-'));
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  let created = false;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE entries (id integer PRIMARY KEY, amount bigint NOT NULL, note text);
      INSERT INTO entries VALUES (1, 35000, 'Original customer transaction');
      CREATE TABLE pgmigrations (id serial PRIMARY KEY, name varchar(255) NOT NULL, run_on timestamp NOT NULL);
      INSERT INTO pgmigrations (name, run_on) VALUES
        ('003_legacy_audit', '2026-01-01'), ('001_original', '2026-01-02');
    `);
    const files: Record<string, string> = {
      // Already applied files must not run twice, even with old out-of-order history.
      '001_original.sql': 'CREATE TABLE entries (id integer PRIMARY KEY);',
      '002_pending_table.sql': 'CREATE TABLE pending_work (id integer PRIMARY KEY REFERENCES entries(id));',
      '003_legacy_audit.sql': 'SELECT 1 / 0;',
      '004_pending_column.sql': 'ALTER TABLE pending_work ADD COLUMN amount bigint NOT NULL;',
      '005_target.sql': 'INSERT INTO pending_work SELECT id, amount FROM entries;',
      '006_future.sql': 'CREATE TABLE future_work (id integer);',
    };
    for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(fixture, name), sql);
    const initialRows = (await client.query('SELECT * FROM entries')).rows;
    const initialHistory = (await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows;
    const execute = (target: string, extra: string[] = []) => spawnSync(process.execPath, [
      script, '--target', target, '--schema', schema, '--migrations-dir', fixture, ...extra,
    ], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, DATABASE_URL: databaseUrl } });
    const assertSuccess = (result: ReturnType<typeof execute>) => {
      expect({ status: result.status, error: result.error?.message, stderr: result.status === 0 ? '' : result.stderr })
        .toEqual({ status: 0, error: undefined, stderr: '' });
    };

    // Prove the original failure with the REAL installed CLI and database.
    // A basename selects only 005; it cannot find the table from pending 002.
    const old = spawnSync(process.execPath, [
      require.resolve('node-pg-migrate/bin/node-pg-migrate'), 'up', '005_target',
      '--schema', schema, '--migrations-schema', schema, '--migrations-dir', fixture, '--no-check-order',
    ], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, DATABASE_URL: databaseUrl } });
    expect(old.status).not.toBe(0);
    expect(old.error).toBeUndefined();
    expect(old.stderr).toContain('pending_work');
    expect((await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows).toEqual(initialHistory);

    const dry = execute('005_target', ['--dry-run']);
    assertSuccess(dry);
    expect(dry.stdout).toContain('3 pending file(s)');
    expect((await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows).toEqual(initialHistory);
    expect((await client.query("SELECT to_regclass('pending_work') AS relation")).rows).toEqual([{ relation: null }]);

    const applied = execute('005_target');
    assertSuccess(applied);
    expect((await client.query('SELECT * FROM pending_work')).rows).toEqual([{ id: 1, amount: '35000' }]);
    expect((await client.query('SELECT * FROM entries')).rows).toEqual(initialRows);
    expect((await client.query("SELECT to_regclass('future_work') AS relation")).rows).toEqual([{ relation: null }]);
    const completeHistory = (await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows;
    expect(completeHistory.map(row => row.name)).toEqual([
      '001_original', '002_pending_table', '003_legacy_audit', '004_pending_column', '005_target',
    ]);
    for (const original of initialHistory) expect(completeHistory).toContainEqual(original);
    assertSuccess(execute('005_target'));
    expect((await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows).toEqual(completeHistory);

    for (const target of ['004_pending_column', '007_missing', '005_target;select']) {
      const rejected = execute(target);
      expect(rejected.status).not.toBe(0);
      expect(rejected.error).toBeUndefined();
      expect((await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows).toEqual(completeHistory);
    }
    await client.query("INSERT INTO pgmigrations (name,run_on) VALUES ('099_foreign', NOW())");
    expect(execute('006_future').stderr).toContain('unknown to this image or beyond');
    await client.query("DELETE FROM pgmigrations WHERE name='099_foreign'");
    await client.query("INSERT INTO pgmigrations (name,run_on) VALUES ('005_target', NOW())");
    expect(execute('006_future').stderr).toContain('Duplicate applied migration history');
    await client.query("DELETE FROM pgmigrations WHERE name='005_target' AND id<>(SELECT min(id) FROM pgmigrations WHERE name='005_target')");

    // A concurrent runner cannot validate or change history while another
    // connection owns the same advisory lock used by node-pg-migrate.
    await client.query('SELECT pg_advisory_lock(7241865325823964)');
    try {
      const locked = execute('006_future');
      expect(locked.status).not.toBe(0);
      expect(locked.stderr).toContain('Another migration is already running');
    } finally {
      await client.query('SELECT pg_advisory_unlock(7241865325823964)');
    }
    writeFileSync(path.join(fixture, '006_future.sql'), 'CREATE TABLE future_work (id integer); SELECT 1 / 0;');
    const failed = execute('006_future');
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain('division by zero');
    expect((await client.query('SELECT * FROM pgmigrations ORDER BY name')).rows).toEqual(completeHistory);
    expect((await client.query("SELECT to_regclass('future_work') AS relation")).rows).toEqual([{ relation: null }]);
    expect((await client.query('SELECT * FROM entries')).rows).toEqual(initialRows);
    writeFileSync(path.join(fixture, '006_future.sql'), files['006_future.sql']);
    assertSuccess(execute('006_future'));
    expect((await client.query('SELECT count(*)::int AS count FROM pgmigrations')).rows).toEqual([{ count: 6 }]);
  } finally {
    try {
      if (created) {
        await client.query('RESET search_path');
        await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await client.end();
      // Only this randomly named test-owned directory is removed.
      rmSync(fixture, { recursive: true, force: true });
    }
  }
}, 60000);
