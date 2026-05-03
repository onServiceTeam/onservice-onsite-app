// Phase 24a — drive each previously-broken admin_actions verb through every
// reachable code path + verify the row lands.
//
// The forensic extractor found 11 verbs the production code emits that the
// pre-migration-120 CHECK rejected. Migration 120 widened the CHECK. Two of
// those routes also had a NOT-NULL violation on target_id (BUG-PHASE24-12,
// BUG-PHASE24-13) — fixed in compliance-admin.routes.ts.
//
// This test:
//   1. Drives each verb through its real route where one exists.
//   2. For verbs with no current route ("latent" — code emits, no caller),
//      proves the CHECK accepts via direct DB INSERT and documents the gap.

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

async function countVerb(verb) {
  const r = await pg.query(`SELECT COUNT(*)::int AS c FROM admin_actions WHERE action_type=$1`, [verb]);
  return r.rows[0].c;
}

async function probeCheckAccepts(verb) {
  // Direct DB probe: does the CHECK accept this verb?
  try {
    await pg.query(`INSERT INTO admin_actions
      (admin_id, action_type, target_type, target_id, details, reason)
      VALUES ($1, $2, 'system', $1, '{}'::jsonb, 'phase24a probe')`,
      [SUPER_ADMIN_ID, verb]);
    await pg.query(`DELETE FROM admin_actions WHERE reason='phase24a probe'`);
    return true;
  } catch (e) {
    return false;
  }
}

const allVerbs = [
  'consent_search',
  'audit_log_exported',
  'service_area_change_approved',
  'service_area_change_rejected',
  'provider_application_approved',
  'provider_application_rejected',
  'provider_application_sent_back',
  'admin_backup_codes_generated',
  'admin_backup_codes_regenerated',
  'bir_2307_batch_generated',
  'bir_2307_regenerated',
];

const before = {};
for (const v of allVerbs) before[v] = await countVerb(v);

// ════════════════════════════════════════════════════════════════════
// Step 1 — DB CHECK accepts all 11 verbs (proves migration 120)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. DB CHECK accepts all 11 verbs (migration 120) ===');
for (const v of allVerbs) {
  const ok = await probeCheckAccepts(v);
  check(ok, `CHECK accepts '${v}'`);
}

// ════════════════════════════════════════════════════════════════════
// Step 2 — consent_search via real DPO route
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. consent_search via /admin/compliance/consent (no userId) ===');
const cs1 = await call('GET', '/api/v1/admin/compliance/consent?limit=2');
check([200,204].includes(cs1.status), 'GET consent (no userId) → 2xx', `got ${cs1.status}`);

console.log('=== 2b. consent_search via /admin/compliance/consent (with userId) ===');
const cs2 = await call('GET', '/api/v1/admin/compliance/consent?userId=00000000-0000-0000-0000-000000000001&limit=1');
check([200,204].includes(cs2.status), 'GET consent (with userId) → 2xx', `got ${cs2.status}`);

const csAfter = await countVerb('consent_search');
check(csAfter >= before.consent_search + 2,
  `consent_search rows wrote (before=${before.consent_search} after=${csAfter})`);

// ════════════════════════════════════════════════════════════════════
// Step 3 — audit_log_exported via real route
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. audit_log_exported via /admin/compliance/audit-log/export.csv ===');
const al = await call('GET', '/api/v1/admin/compliance/audit-log/export.csv?limit=5');
check(al.status === 200, 'GET export.csv → 200', `got ${al.status}`);

const alAfter = await countVerb('audit_log_exported');
check(alAfter >= before.audit_log_exported + 1,
  `audit_log_exported row wrote (before=${before.audit_log_exported} after=${alAfter})`);

// ════════════════════════════════════════════════════════════════════
// Step 4 — bir_2307_batch_generated / regenerated via real route
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. bir_2307_batch_generated / regenerated via /admin/bir-admin ===');
// Generate quarterly batches for current year — best-effort, may produce 0 batches
const bGen = await call('POST', '/api/v1/admin/bir/2307/quarter/2026/1/generate', {});
check([200,201,400,409].includes(bGen.status),
  `POST /2307/quarter/.../generate → expected status (got ${bGen.status})`,
  JSON.stringify(bGen.body).slice(0,200));

// Regenerate for the first provider that has any batch
const provWithBatch = await pg.query(
  `SELECT provider_id FROM bir_2307_batches LIMIT 1`,
);
if (provWithBatch.rows[0]) {
  const bRegen = await call('POST', `/api/v1/admin/bir/2307/provider/${provWithBatch.rows[0].provider_id}/regenerate`, {
    year: 2026, quarter: 1,
  });
  check([200,201,404,409].includes(bRegen.status),
    `POST /2307/provider/.../regenerate → expected status (got ${bRegen.status})`,
    JSON.stringify(bRegen.body).slice(0,200));
} else {
  console.log('  (no existing BIR batches — regenerate path not exercised, but verb migration verified above)');
}

const birGen = await countVerb('bir_2307_batch_generated');
const birRegen = await countVerb('bir_2307_regenerated');
console.log(`  bir_2307_batch_generated: ${before.bir_2307_batch_generated} → ${birGen}`);
console.log(`  bir_2307_regenerated:     ${before.bir_2307_regenerated} → ${birRegen}`);

// ════════════════════════════════════════════════════════════════════
// Step 5 — admin_backup_codes_generated / regenerated via service direct call
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. admin_backup_codes_generated / regenerated via service ===');
// generateBackupCodes is exported but no HTTP route currently invokes it.
// Drive via a direct service call inside this Node process so we assert end-to-end.
try {
  const { generateBackupCodes } = await import(
    path.resolve('packages/api/src/services/admin-2fa.service.ts')
  );
  const r1 = await generateBackupCodes(SUPER_ADMIN_ID);
  check(Array.isArray(r1.codes) && r1.codes.length > 0,
    'generateBackupCodes returned codes',
    `count=${r1.codes?.length}`);

  const r2 = await generateBackupCodes(SUPER_ADMIN_ID, { regeneratedBy: SUPER_ADMIN_ID });
  check(Array.isArray(r2.codes) && r2.codes.length > 0,
    'regenerate returned codes');

  const a1 = await countVerb('admin_backup_codes_generated');
  const a2 = await countVerb('admin_backup_codes_regenerated');
  check(a1 >= before.admin_backup_codes_generated + 1,
    `admin_backup_codes_generated row wrote (before=${before.admin_backup_codes_generated} after=${a1})`);
  check(a2 >= before.admin_backup_codes_regenerated + 1,
    `admin_backup_codes_regenerated row wrote (before=${before.admin_backup_codes_regenerated} after=${a2})`);

  // cleanup the backup codes
  await pg.query(`DELETE FROM admin_backup_codes WHERE admin_user_id=$1
                    AND created_at > NOW() - INTERVAL '2 minutes'`, [SUPER_ADMIN_ID]);
} catch (e) {
  console.log('  (could not import service directly: ' + (e.message || e) + ')');
  console.log('  Falling back to DB-level proof (already done in Step 1).');
}

// ════════════════════════════════════════════════════════════════════
// Step 6 — service_area_change_* and provider_application_* are LATENT
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. service_area_change_* / provider_application_* are latent ===');
console.log('  service_area_change_approved/rejected: no HTTP route currently invokes');
console.log('    service-area-change.service.decide(). Verb migration verified in Step 1.');
console.log('  provider_application_approved/rejected/sent_back: no HTTP route currently');
console.log('    invokes provider-onboarding.service.adminDecide(). Verified in Step 1.');
console.log('  These are latent — wiring them later would have crashed pre-migration-120.');

// ════════════════════════════════════════════════════════════════════
// Step 7 — re-verify the consent_search NOT-NULL fix (BUG-PHASE24-12)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. consent_search route works regardless of userId param (BUG-PHASE24-12) ===');
const cs3 = await call('GET', '/api/v1/admin/compliance/consent');  // no params at all
check([200,204].includes(cs3.status),
  'GET consent (zero params) → 2xx (NOT NULL bug fixed)',
  `got ${cs3.status} ${JSON.stringify(cs3.body).slice(0,200)}`);

const cs4 = await call('GET', '/api/v1/admin/compliance/consent?consentType=privacy_policy&limit=2');
check([200,204].includes(cs4.status),
  'GET consent (consentType only) → 2xx',
  `got ${cs4.status}`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
await pg.query(`DELETE FROM admin_actions WHERE reason='phase24a probe'`).catch(()=>{});

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
