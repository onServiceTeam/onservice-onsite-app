// A migration filename is an exact-file selector in node-pg-migrate, NOT an
// upper bound. Select every reviewed file through the target before invoking
// the real runner, and verify its bookkeeping on the same locked connection.
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { runner, PG_MIGRATE_LOCK_ID } from 'node-pg-migrate/runner';

export async function runReviewedMigrations({
  databaseUrl, dir = 'migrations', target, dryRun = false, schema = 'public', logger = console,
}) {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Invalid migration schema.');
  if (target !== undefined && !/^\d{3}_[a-z0-9_]+$/.test(target)) throw new Error('Invalid migration target.');
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter(entry => entry.name.endsWith('.sql'));
  if (!files.length || files.some(entry => !entry.isFile() || !/^\d{3}_[a-z0-9_]+\.sql$/.test(entry.name))) {
    throw new Error('Expected regular, three-digit, named SQL migration files.');
  }
  const names = files.map(entry => entry.name.slice(0, -4)).sort();
  if (new Set(names.map(name => name.slice(0, 3))).size !== names.length) {
    throw new Error('Duplicate migration sequence prefixes.');
  }
  const last = target ?? names.at(-1);
  const end = names.indexOf(last);
  if (end === -1) throw new Error('The reviewed migration target is absent from this image.');
  const selected = names.slice(0, end + 1);
  if (!databaseUrl) throw new Error('A direct database connection is required.');
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  let locked = false;
  await client.connect();
  try {
    // Keep history validation and execution under the existing runner mutex.
    // Its nested same-session lock/unlock is balanced; do not disable its lock.
    const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [PG_MIGRATE_LOCK_ID]);
    if (!result.rows[0].acquired) throw new Error('Another migration is already running.');
    locked = true;
    const history = async () => {
      const present = await client.query('SELECT to_regclass($1) AS relation', [`${schema}.pgmigrations`]);
      if (!present.rows[0].relation) return [];
      const records = await client.query(`SELECT name FROM "${schema}".pgmigrations ORDER BY name`);
      const applied = records.rows.map(row => row.name);
      if (new Set(applied).size !== applied.length) throw new Error('Duplicate applied migration history.');
      if (applied.some(name => !selected.includes(name))) {
        throw new Error('Applied migration history is unknown to this image or beyond the reviewed target.');
      }
      return applied;
    };
    const before = await history();
    const pending = selected.filter(name => !before.includes(name));
    logger.info(`Reviewed migration boundary: ${last}; ${pending.length} pending file(s).`);
    await runner({
      dbClient: client,
      dir: resolve(dir),
      // Only these validated basenames may be loaded. This also excludes later
      // files from parsing, so a future migration cannot affect this release.
      ignorePattern: `(?!(?:${selected.join('|')})\\.sql$).*`,
      direction: 'up', migrationsTable: 'pgmigrations', migrationsSchema: schema,
      schema, checkOrder: false, singleTransaction: true, dryRun, verbose: false,
      logger,
    });
    const after = await history();
    const expected = dryRun ? before : selected;
    if (JSON.stringify(after) !== JSON.stringify(expected)) {
      throw new Error('Migration bookkeeping does not match the reviewed boundary.');
    }
    logger.info(dryRun
      ? 'Reviewed migration dry run complete; no pending migration marked applied.'
      : `Reviewed migrations verified through ${last}; ${after.length} applied.`);
    return { target: last, pending, applied: after, dryRun };
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [PG_MIGRATE_LOCK_ID]);
    } finally {
      await client.end();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = { databaseUrl: process.env.DATABASE_URL };
    const args = process.argv.slice(2);
    while (args.length) {
      const arg = args.shift();
      if (arg === '--dry-run') options.dryRun = true;
      else if (['--target', '--migrations-dir', '--schema'].includes(arg)) {
        const value = args.shift();
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
        options[arg === '--target' ? 'target' : arg === '--schema' ? 'schema' : 'dir'] = value;
      } else throw new Error('Unsupported migration runner argument.');
    }
    await runReviewedMigrations(options);
  } catch (error) {
    // Never print connection options, environment or complete database errors.
    console.error(`Reviewed migrations failed: ${error.message}`);
    process.exitCode = 1;
  }
}
