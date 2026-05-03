// Phase 24b — push notification queue paths.
// Drives every state transition in push_retry_queue:
//   pending → in_progress → succeeded
//   pending → in_progress → pending (with backoff)
//   pending → in_progress → failed_permanent (after max_attempts)
//   FOR UPDATE SKIP LOCKED concurrency guarantee
//
// Important: the live API server runs the actual notification.service —
// to drive the retry queue we'd normally need a flaky push provider. We
// instead exercise the service module directly via tsx so we hit real
// DB writes without needing a fake Expo server.

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { spawnSync } from 'child_process';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

// Need a real user for FK on push_retry_queue.user_id — reuse the super_admin.
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

// Fresh slate for our test rows
await pg.query(`DELETE FROM push_retry_queue WHERE title LIKE 'phase24b %'`);

// Helper that runs a snippet of code via tsx in the api workspace.
// The tmp file MUST live inside packages/api so its relative imports
// (./src/services/...) resolve. We also need dotenv to load .env from
// the project root because the API services need DATABASE_URL.
async function runInApi(snippet) {
  // Wrap user snippet in async IIFE — packages/api is CJS so top-level await
  // is rejected by esbuild's tsx transform. Imports stay at top level.
  // We split user snippet into import lines + body to preserve order.
  const lines = snippet.split('\n');
  const importLines = lines.filter(l => /^\s*import\b/.test(l));
  const bodyLines = lines.filter(l => !/^\s*import\b/.test(l));
  const fullSnippet =
    `import 'dotenv/config';\n` +
    importLines.join('\n') + '\n' +
    `(async () => {\n` +
    bodyLines.join('\n') + '\n' +
    `})().catch(e => { console.error(e); process.exit(1); });\n`;
  const tmpFile = path.resolve('packages/api/_phase24b-snippet.ts');
  await import('fs/promises').then(fs => fs.writeFile(tmpFile, fullSnippet, 'utf8'));
  const r = spawnSync('node', ['--import', 'tsx', tmpFile], {
    cwd: path.resolve('packages/api'),
    encoding: 'utf8',
    env: { ...process.env },
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

// ════════════════════════════════════════════════════════════════════
// 1. enqueuePushRetry inserts pending row with status=pending, attempts=0
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. enqueuePushRetry inserts pending row ===');
const enqResult = await runInApi(`
  import { enqueuePushRetry } from './src/services/push-retry.service';
  await enqueuePushRetry({
    userId: '${SUPER_ADMIN_ID}',
    notificationId: null,
    title: 'phase24b enqueue',
    body: 'phase24b body',
    data: { tag: 'phase24b' },
    initialError: 'phase24b synthetic error',
  });
  process.exit(0);
`);
if (enqResult.status !== 0) {
  console.log('  enqueue snippet stderr:', enqResult.stderr.slice(0, 500));
}
check(enqResult.status === 0, 'enqueue snippet exited 0');

const enq = await pg.query(
  `SELECT * FROM push_retry_queue WHERE title='phase24b enqueue' ORDER BY created_at DESC LIMIT 1`,
);
check(enq.rows.length === 1, 'one row inserted', `count=${enq.rows.length}`);
check(enq.rows[0]?.status === 'pending', `status=pending`, `got: ${enq.rows[0]?.status}`);
check(enq.rows[0]?.attempts === 0, `attempts=0`, `got: ${enq.rows[0]?.attempts}`);
check(enq.rows[0]?.last_error === 'phase24b synthetic error',
  'last_error preserved');
check(enq.rows[0]?.max_attempts === 5, `max_attempts default=5`,
  `got: ${enq.rows[0]?.max_attempts}`);

// ════════════════════════════════════════════════════════════════════
// 2. processPushRetries with always-succeeding deliver → succeeded
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. processPushRetries (succeeding deliver) → succeeded ===');
const succResult = await runInApi(`
  import { processPushRetries } from './src/services/push-retry.service';
  const r = await processPushRetries(async () => { /* always succeed */ }, 25);
  console.log(JSON.stringify(r));
  process.exit(0);
`);
const succLine = succResult.stdout.trim().split(/\r?\n/).filter(l => l.startsWith('{')).pop();
let succCounts = {};
try { succCounts = JSON.parse(succLine ?? '{}'); } catch {}
check(succResult.status === 0, 'process snippet exited 0', succResult.stderr.slice(0,300));
check((succCounts.attempted ?? 0) >= 1, `attempted ≥ 1`, JSON.stringify(succCounts));
check((succCounts.succeeded ?? 0) >= 1, `succeeded ≥ 1`, JSON.stringify(succCounts));

const after = await pg.query(
  `SELECT status, attempts, succeeded_at FROM push_retry_queue WHERE title='phase24b enqueue'`,
);
check(after.rows[0]?.status === 'succeeded', 'row status=succeeded after process',
  `got: ${after.rows[0]?.status}`);
check(after.rows[0]?.succeeded_at !== null, 'succeeded_at populated');
check(after.rows[0]?.attempts === 1, 'attempts incremented to 1');

// ════════════════════════════════════════════════════════════════════
// 3. processPushRetries with always-failing deliver → backoff/retry
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. processPushRetries (failing deliver) → backoff ===');
// enqueue another fresh row
await runInApi(`
  import { enqueuePushRetry } from './src/services/push-retry.service';
  await enqueuePushRetry({
    userId: '${SUPER_ADMIN_ID}', notificationId: null,
    title: 'phase24b backoff', body: 'b', data: {}, initialError: 'init',
  });
  process.exit(0);
`);

const fail1 = await runInApi(`
  import { processPushRetries } from './src/services/push-retry.service';
  const r = await processPushRetries(async () => { throw new Error('phase24b synth fail'); }, 25);
  console.log(JSON.stringify(r));
  process.exit(0);
`);
const f1Line = fail1.stdout.trim().split(/\r?\n/).filter(l => l.startsWith('{')).pop();
let f1 = {};
try { f1 = JSON.parse(f1Line ?? '{}'); } catch {}
check((f1.failedAndRetrying ?? 0) >= 1, 'failedAndRetrying ≥ 1', JSON.stringify(f1));

const r1 = await pg.query(
  `SELECT status, attempts, next_retry_at, last_error FROM push_retry_queue WHERE title='phase24b backoff'`,
);
check(r1.rows[0]?.status === 'pending', 'status returned to pending after retry-fail',
  `got: ${r1.rows[0]?.status}`);
check(r1.rows[0]?.attempts === 1, 'attempts=1');
check(r1.rows[0]?.last_error.includes('phase24b synth fail'),
  'last_error captured');

// ════════════════════════════════════════════════════════════════════
// 4. After 5 failures → failed_permanent
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. After max_attempts failures → failed_permanent ===');
// Force the row's next_retry_at to the past so processPushRetries sees it again
const rowId = r1.rows[0] ? (await pg.query(
  `SELECT id FROM push_retry_queue WHERE title='phase24b backoff'`,
)).rows[0]?.id : null;

// Run process 4 more times to exhaust attempts (1 already used)
for (let i = 0; i < 4; i++) {
  await pg.query(
    `UPDATE push_retry_queue SET next_retry_at = NOW() - INTERVAL '1 second'
       WHERE id=$1 AND status='pending'`, [rowId]);
  await runInApi(`
    import { processPushRetries } from './src/services/push-retry.service';
    await processPushRetries(async () => { throw new Error('round ${i+2} fail'); }, 25);
    process.exit(0);
  `);
}
const fp = await pg.query(
  `SELECT status, attempts, failed_permanent_at FROM push_retry_queue WHERE id=$1`, [rowId]);
check(fp.rows[0]?.status === 'failed_permanent',
  'status=failed_permanent after exhausting attempts',
  `got: ${fp.rows[0]?.status} attempts=${fp.rows[0]?.attempts}`);
check(fp.rows[0]?.attempts === 5, 'attempts=5');
check(fp.rows[0]?.failed_permanent_at !== null, 'failed_permanent_at set');

// ════════════════════════════════════════════════════════════════════
// 5. listFailedPermanentPushes returns this row
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. listFailedPermanentPushes surfaces row ===');
const listResult = await runInApi(`
  import { listFailedPermanentPushes } from './src/services/push-retry.service';
  const rows = await listFailedPermanentPushes(20);
  console.log('FOUND:'+rows.filter(r => r.title==='phase24b backoff').length);
  process.exit(0);
`);
check(listResult.status === 0, 'list snippet exited 0', listResult.stderr.slice(0,200));
check(listResult.stdout.includes('FOUND:1'),
  'failed_permanent row appears in admin list',
  listResult.stdout.slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 6. Concurrency: FOR UPDATE SKIP LOCKED prevents double-claim
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. FOR UPDATE SKIP LOCKED — two workers don\'t double-claim ===');
// Insert 5 fresh pending rows
for (let i = 0; i < 5; i++) {
  await runInApi(`
    import { enqueuePushRetry } from './src/services/push-retry.service';
    await enqueuePushRetry({
      userId: '${SUPER_ADMIN_ID}', notificationId: null,
      title: 'phase24b concur ${i}', body: 'b', data: {}, initialError: 'i',
    });
    process.exit(0);
  `);
}

// Run two workers in parallel; each claims a slow-deliver and we count
// how many rows ended up succeeded. Because workers SKIP LOCKED rows,
// each row can only be claimed by ONE worker — total succeeded must equal 5,
// not 10.
const par = await Promise.all([
  runInApi(`
    import { processPushRetries } from './src/services/push-retry.service';
    const r = await processPushRetries(async () => {
      await new Promise(res => setTimeout(res, 50));
    }, 25);
    console.log('RES:'+JSON.stringify(r));
    process.exit(0);
  `),
  runInApi(`
    import { processPushRetries } from './src/services/push-retry.service';
    const r = await processPushRetries(async () => {
      await new Promise(res => setTimeout(res, 50));
    }, 25);
    console.log('RES:'+JSON.stringify(r));
    process.exit(0);
  `),
]);
const sum = par.reduce((acc, p) => {
  const m = p.stdout.match(/RES:(\{[^}]+\})/);
  if (!m) return acc;
  try {
    const j = JSON.parse(m[1]);
    return acc + (j.succeeded ?? 0);
  } catch { return acc; }
}, 0);
const finalCount = await pg.query(
  `SELECT COUNT(*)::int AS c FROM push_retry_queue
     WHERE title LIKE 'phase24b concur%' AND status='succeeded'`);
check(finalCount.rows[0].c === 5,
  'exactly 5 rows succeeded (no double-process)',
  `got ${finalCount.rows[0].c} from sum-reported ${sum}`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
await pg.query(`DELETE FROM push_retry_queue WHERE title LIKE 'phase24b %'`);
const tmp = path.resolve('packages/api/_phase24b-snippet.ts');
try { await import('fs/promises').then(fs => fs.unlink(tmp)); } catch {}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
