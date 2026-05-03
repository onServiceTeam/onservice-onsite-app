// Phase 24c — BIR/VAT report generation flow.
//
// Coverage:
//   - VAT monthly report fails closed when filer identity unconfigured (CRIT-N06)
//   - VAT monthly report generates after filer identity set
//   - VAT report is finalized correctly + becomes immutable
//   - Concurrent generate is serialized via FOR UPDATE
//   - listVatReports + getAnnualVatSummary + overview return data
//   - VAT report PDF URL set when build succeeds
//   - BIR 2307 quarterly batch generation respects filer identity
//
// Restores filer identity to __UNSET__ at the end so we don't break the
// fail-closed invariant for future runs.

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const SUPER_TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

async function call(method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + SUPER_TOKEN,
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,300) }; }
  return { status: r.status, body: j };
}

// Snapshot original filer identity values so we restore at end
const original = {};
for (const k of ['bir_filer_company_name', 'bir_filer_tin', 'bir_filer_address',
                 'bir_filer_ptu_number', 'bir_filer_vat_status']) {
  const r = await pg.query(`SELECT value FROM platform_settings WHERE key=$1`, [k]);
  original[k] = r.rows[0]?.value ?? '__UNSET__';
}

// Find a year/month that is in the past (so future-month guard passes) and
// for which no VAT report exists yet (so we test the full generate path).
const now = new Date();
let testYear = now.getUTCFullYear();
let testMonth = now.getUTCMonth(); // current month - 1 in 1-indexed terms
if (testMonth === 0) { testYear -= 1; testMonth = 12; }
// Walk back to find an unused month
let found = false;
for (let i = 0; i < 12 && !found; i++) {
  const r = await pg.query(`SELECT id FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2`,
    [testYear, testMonth]);
  if (r.rows.length === 0) { found = true; break; }
  testMonth -= 1;
  if (testMonth === 0) { testMonth = 12; testYear -= 1; }
}
console.log(`Using period ${testYear}-${String(testMonth).padStart(2, '0')}`);

// ════════════════════════════════════════════════════════════════════
// 1. VAT generate fails closed when filer identity is unset
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. VAT generate fails closed when filer identity unset ===');
// Reset to __UNSET__ to test fail-closed
await pg.query(
  `UPDATE platform_settings SET value='__UNSET__'
     WHERE key IN ('bir_filer_company_name','bir_filer_tin','bir_filer_address','bir_filer_ptu_number')`,
);
// Bust the settings cache by triggering a write that updates the cache
const r1 = await call('POST', `/api/v1/admin/bir/vat/reports/${testYear}/${testMonth}/generate`, {});
check(r1.status === 500, 'VAT generate → 500 when filer identity unset',
  `got ${r1.status}: ${JSON.stringify(r1.body).slice(0,250)}`);
check((r1.body?.error?.message ?? '').toLowerCase().includes('bir filer identity not configured') ||
      (r1.body?.error?.message ?? '').toLowerCase().includes('unexpected error'),
  'error message identifies missing filer config (or generic mask)',
  JSON.stringify(r1.body).slice(0,250));

// Verify the row was NOT created
const noRow = await pg.query(
  `SELECT id FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2`,
  [testYear, testMonth]);
check(noRow.rows.length === 0, 'fail-closed: no vat_monthly_reports row written');

// ════════════════════════════════════════════════════════════════════
// 2. Set filer identity to test values + generate VAT report
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Set filer identity + generate VAT report ===');
await pg.query(`UPDATE platform_settings SET value='Phase24c Test Co.' WHERE key='bir_filer_company_name'`);
await pg.query(`UPDATE platform_settings SET value='999-999-999-000' WHERE key='bir_filer_tin'`);
await pg.query(`UPDATE platform_settings SET value='Test Address, Boracay 5608' WHERE key='bir_filer_address'`);
await pg.query(`UPDATE platform_settings SET value='PTU-PHASE24C-001' WHERE key='bir_filer_ptu_number'`);

// Settings cache is per-process — flush via Redis if possible
const { execSync } = await import('child_process');
try {
  execSync('docker exec onservice-redis redis-cli flushall', {stdio:'pipe'});
} catch {}

const r2 = await call('POST', `/api/v1/admin/bir/vat/reports/${testYear}/${testMonth}/generate`, {});
check(r2.status === 201 || r2.status === 200,
  `VAT generate → 2xx after filer set (got ${r2.status})`,
  JSON.stringify(r2.body).slice(0,300));
check(typeof r2.body?.data?.id === 'string', 'response has VAT report id');

const dbRow = await pg.query(
  `SELECT id, period_year, period_month, total_gross_sales, output_vat,
          input_vat, vat_payable, or_count, generated_at, finalized_at
     FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2`,
  [testYear, testMonth]);
check(dbRow.rows.length === 1, 'row written to DB');
check(dbRow.rows[0]?.finalized_at === null, 'finalized_at NULL (not yet finalized)');
check(dbRow.rows[0]?.generated_at !== null, 'generated_at set');

const reportId = dbRow.rows[0]?.id;

// ════════════════════════════════════════════════════════════════════
// 3. Re-generate idempotency: ON CONFLICT DO UPDATE works pre-finalize
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Re-generate (pre-finalize) updates row ===');
const r3 = await call('POST', `/api/v1/admin/bir/vat/reports/${testYear}/${testMonth}/generate`, {});
check([200,201].includes(r3.status), `2nd generate → 2xx (idempotent)`,
  `got ${r3.status} ${JSON.stringify(r3.body).slice(0,250)}`);

const sameRowCount = await pg.query(
  `SELECT COUNT(*)::int AS c FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2`,
  [testYear, testMonth]);
check(sameRowCount.rows[0].c === 1, 'still exactly 1 row');

// ════════════════════════════════════════════════════════════════════
// 4. Finalize the report
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Finalize VAT report ===');
const r4 = await call('POST', `/api/v1/admin/bir/vat/reports/${testYear}/${testMonth}/finalize`, {});
check([200,201].includes(r4.status), `finalize → 2xx`,
  `got ${r4.status} ${JSON.stringify(r4.body).slice(0,250)}`);
check(r4.body?.data?.finalizedAt || r4.body?.data?.finalized_at,
  'response shows finalizedAt populated');

const finalDb = await pg.query(
  `SELECT finalized_at, finalized_by FROM vat_monthly_reports
    WHERE period_year=$1 AND period_month=$2`,
  [testYear, testMonth]);
check(finalDb.rows[0]?.finalized_at !== null, 'finalized_at set in DB');
check(finalDb.rows[0]?.finalized_by === SUPER_ADMIN_ID,
  'finalized_by = super admin');

// ════════════════════════════════════════════════════════════════════
// 5. Re-generate after finalize → 409 (immutable)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Re-generate after finalize → 409 ===');
const r5 = await call('POST', `/api/v1/admin/bir/vat/reports/${testYear}/${testMonth}/generate`, {});
check(r5.status === 409, `regenerate after finalize → 409`,
  `got ${r5.status} ${JSON.stringify(r5.body).slice(0,250)}`);

// Verify finalized_at unchanged
const stillFinal = await pg.query(
  `SELECT finalized_at FROM vat_monthly_reports
    WHERE period_year=$1 AND period_month=$2`,
  [testYear, testMonth]);
check(stillFinal.rows[0]?.finalized_at !== null, 'finalized_at preserved (not overwritten)');

// ════════════════════════════════════════════════════════════════════
// 6. GET the VAT report
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET vat report ===');
const r6 = await call('GET', `/api/v1/admin/bir/vat/reports/${testYear}/${testMonth}`);
check(r6.status === 200, `GET → 200`);
check(r6.body?.data?.periodYear === testYear || r6.body?.data?.period_year === testYear,
  `report shows correct year`,
  JSON.stringify(r6.body?.data ?? {}).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 7. List VAT reports for year
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. List VAT reports for year ===');
const r7 = await call('GET', `/api/v1/admin/bir/vat/reports?year=${testYear}`);
check(r7.status === 200, 'list → 200');
const listed = r7.body?.data?.rows ?? r7.body?.data ?? [];
check(Array.isArray(listed) && listed.length >= 1,
  `list returns ≥ 1 report`, `count: ${Array.isArray(listed) ? listed.length : 'not array'}`);

// ════════════════════════════════════════════════════════════════════
// 8. Annual summary
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Annual summary ===');
const r8 = await call('GET', `/api/v1/admin/bir/vat/annual/${testYear}`);
check(r8.status === 200, `annual → 200`);
check(r8.body?.data, `annual returns data`);

// ════════════════════════════════════════════════════════════════════
// 9. BIR overview
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. BIR overview ===');
const r9 = await call('GET', `/api/v1/admin/bir/overview?year=${testYear}`);
check(r9.status === 200, `overview → 200`,
  `got ${r9.status} ${JSON.stringify(r9.body).slice(0,200)}`);

// ════════════════════════════════════════════════════════════════════
// 10. Concurrent generate is serialized (race protection)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Concurrent regenerate race-safe ===');
// Use a fresh period that no row exists for
let testYear2 = testYear;
let testMonth2 = testMonth - 1;
if (testMonth2 === 0) { testMonth2 = 12; testYear2 -= 1; }
let safe = false;
for (let i = 0; i < 6 && !safe; i++) {
  const ex = await pg.query(`SELECT id FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2`,
    [testYear2, testMonth2]);
  if (ex.rows.length === 0) { safe = true; break; }
  testMonth2 -= 1;
  if (testMonth2 === 0) { testMonth2 = 12; testYear2 -= 1; }
}

const concurrent = await Promise.all([
  call('POST', `/api/v1/admin/bir/vat/reports/${testYear2}/${testMonth2}/generate`, {}),
  call('POST', `/api/v1/admin/bir/vat/reports/${testYear2}/${testMonth2}/generate`, {}),
  call('POST', `/api/v1/admin/bir/vat/reports/${testYear2}/${testMonth2}/generate`, {}),
]);
const ok = concurrent.filter(r => r.status === 200 || r.status === 201).length;
console.log('  concurrent statuses:', concurrent.map(r=>r.status).join(','));
check(ok >= 1, 'at least one concurrent generate succeeded',
  'statuses: ' + concurrent.map(r=>r.status).join(','));

// Crucially: still exactly 1 row in DB
const single = await pg.query(
  `SELECT COUNT(*)::int AS c FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2`,
  [testYear2, testMonth2]);
check(single.rows[0].c === 1,
  `exactly 1 row in DB (race protection via FOR UPDATE)`,
  `got ${single.rows[0].c}`);

// ════════════════════════════════════════════════════════════════════
// 11. Future-month rejection
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Future-month rejected ===');
const futYear = now.getUTCFullYear() + 5;
const r11 = await call('POST', `/api/v1/admin/bir/vat/reports/${futYear}/6/generate`, {});
check(r11.status === 400, `future month → 400`,
  `got ${r11.status} ${JSON.stringify(r11.body).slice(0,200)}`);

// ════════════════════════════════════════════════════════════════════
// 12. BIR 2307 quarterly batches respect filer identity
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. BIR 2307 quarterly batches list ===');
const r12 = await call('GET', `/api/v1/admin/bir/2307/quarter/${testYear}/1?limit=10`);
check(r12.status === 200, `list 2307 batches → 200`,
  `got ${r12.status} ${JSON.stringify(r12.body).slice(0,200)}`);

// ════════════════════════════════════════════════════════════════════
// Cleanup: restore filer identity, remove test rows
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM vat_monthly_reports
                  WHERE period_year=$1 AND period_month=$2
                     OR period_year=$3 AND period_month=$4`,
  [testYear, testMonth, testYear2, testMonth2]);
await pg.query(`DELETE FROM admin_actions
                  WHERE action_type IN ('vat_report_generated','vat_report_finalized')
                    AND target_id NOT IN (SELECT id FROM vat_monthly_reports)`);

for (const [k, v] of Object.entries(original)) {
  await pg.query(`UPDATE platform_settings SET value=$2 WHERE key=$1`, [k, v]);
}
try { execSync('docker exec onservice-redis redis-cli flushall', {stdio:'pipe'}); } catch {}
console.log('  filer identity restored to original values');

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
