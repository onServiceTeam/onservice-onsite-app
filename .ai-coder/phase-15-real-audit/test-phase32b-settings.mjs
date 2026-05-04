// Phase 32b — admin platform settings.
//
// Coverage:
//   1. GET / lists all settings grouped by category
//   2. GET /:category lists single category
//   3. GET /:key/history returns audit rows
//   4. PUT /:key — super_admin updates a single setting (writes audit row)
//   5. PUT /:key — admin (not super) → 403 (CRIT-N16)
//   6. PUT / — bulk update (super_admin)
//   7. PUT / — bulk too large (>50) → 400
//   8. PUT / — empty array → 400
//   9. POST /:key/reset — super_admin resets to default_value
//  10. POST /cache/flush — super_admin
//  11. POST /cache/flush — admin (not super) → 403
//  12. customer → 403 on GET /
//  13. No auth → 401
//  14. PUT /:key — value out of min/max bounds → service throws (400)

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
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

async function call(token, method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,300) }; }
  return { status: r.status, body: j };
}

// Plain admin
const adminPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const adminUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'admin', TRUE, 'P32b', 'Admin') RETURNING id`, [adminPhone]);
const adminId = adminUser.rows[0].id;
const ADMIN_TOKEN = jwt.sign(
  { userId: adminId, role: 'admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const custPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const custUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P32b', 'Cust') RETURNING id`, [custPhone]);
const custId = custUser.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: custId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Snapshot the current value of a tunable so we can restore it after.
const probeKey = 'escrow_auto_confirm_hours';  // seeded in mig 050, range 1..168
const beforeRow = await pg.query(`SELECT value FROM platform_settings WHERE key=$1`, [probeKey]);
const originalValue = beforeRow.rows[0]?.value ?? '30';

// ════════════════════════════════════════════════════════════════════
// 1. GET / grouped
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET / grouped ===');
const r1 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/settings');
check(r1.status === 200, `→ 200 (got ${r1.status})`);
check(typeof r1.body?.data?.settings === 'object', 'settings is object');
check(Array.isArray(r1.body?.data?.categories), 'categories array present');
check(Array.isArray(r1.body?.data?.settings?.commissions),
  `commissions group present (${r1.body?.data?.settings?.commissions?.length ?? 0} settings)`);

// ════════════════════════════════════════════════════════════════════
// 2. GET /:category
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. GET /:category ===');
const r2 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/settings/escrow');
check(r2.status === 200, `→ 200 (got ${r2.status})`);
check(Array.isArray(r2.body?.data) && r2.body.data.length > 0,
  `escrow has rows (${r2.body?.data?.length})`);
check(r2.body?.data?.every(s => s.category === 'escrow'), 'every row has category=escrow');

// ════════════════════════════════════════════════════════════════════
// 4. PUT /:key — super_admin updates
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. PUT /:key super_admin ===');
const r4 = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/settings/${probeKey}`, {
  value: '36',
  reason: 'Phase 32b — bumping from default to 36 for audit verification.',
});
check(r4.status === 200, `→ 200 (got ${r4.status})`,
  JSON.stringify(r4.body).slice(0,200));
check(r4.body?.data?.value === '36', `value=36 (got ${r4.body?.data?.value})`);

const audAfter = await pg.query(
  `SELECT new_value, change_reason, changed_by FROM platform_settings_audit
     WHERE setting_key=$1 ORDER BY created_at DESC LIMIT 1`, [probeKey]);
check(audAfter.rows[0]?.new_value === '36', 'audit row written with new_value=36');
check(audAfter.rows[0]?.changed_by === SUPER_ADMIN_ID, 'audit changed_by=super_admin');
check(audAfter.rows[0]?.change_reason?.includes('Phase 32b'), 'audit change_reason persisted');

// ════════════════════════════════════════════════════════════════════
// 3. GET /:key/history
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. GET /:key/history ===');
const r3 = await call(ADMIN_TOKEN, 'GET', `/api/v1/admin/settings/${probeKey}/history?limit=10`);
check(r3.status === 200, `→ 200 (got ${r3.status})`);
check(Array.isArray(r3.body?.data) && r3.body.data.length >= 1,
  `history has ≥1 row (${r3.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 5. PUT /:key admin (not super) → 403 (CRIT-N16)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. PUT /:key admin → 403 (CRIT-N16) ===');
const r5 = await call(ADMIN_TOKEN, 'PUT', `/api/v1/admin/settings/${probeKey}`, {
  value: '50',
});
check(r5.status === 403, `→ 403 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. PUT / bulk (super_admin)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. PUT / bulk update ===');
const r6 = await call(SUPER_TOKEN, 'PUT', '/api/v1/admin/settings', {
  updates: [
    { key: probeKey, value: '48' },
  ],
  reason: 'Phase 32b bulk update test',
});
check(r6.status === 200, `→ 200 (got ${r6.status})`,
  JSON.stringify(r6.body).slice(0,200));
check(r6.body?.data?.[0]?.value === '48', `bulk value=48 (got ${r6.body?.data?.[0]?.value})`);

// ════════════════════════════════════════════════════════════════════
// 7. Bulk too large (>50) → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Bulk >50 → 400 ===');
const big = Array.from({ length: 51 }, (_, i) => ({ key: probeKey, value: String(30 + i) }));
const r7 = await call(SUPER_TOKEN, 'PUT', '/api/v1/admin/settings', { updates: big });
check(r7.status === 400, `→ 400 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. Empty array → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Empty array → 400 ===');
const r8 = await call(SUPER_TOKEN, 'PUT', '/api/v1/admin/settings', { updates: [] });
check(r8.status === 400, `→ 400 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. POST /:key/reset — back to default
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. POST /:key/reset super_admin ===');
const r9 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/settings/${probeKey}/reset`);
check(r9.status === 200, `→ 200 (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));
const dbAfterReset = await pg.query(
  `SELECT value, default_value FROM platform_settings WHERE key=$1`, [probeKey]);
check(dbAfterReset.rows[0]?.value === dbAfterReset.rows[0]?.default_value,
  `value=default_value (got ${dbAfterReset.rows[0]?.value} default=${dbAfterReset.rows[0]?.default_value})`);

// ════════════════════════════════════════════════════════════════════
// 10. POST /cache/flush — super_admin
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. POST /cache/flush super_admin ===');
const r10 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/settings/cache/flush');
check(r10.status === 200, `→ 200 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. POST /cache/flush — admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. POST /cache/flush admin → 403 ===');
const r11 = await call(ADMIN_TOKEN, 'POST', '/api/v1/admin/settings/cache/flush');
check(r11.status === 403, `→ 403 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. customer → 403 ===');
const r12 = await call(CUST_TOKEN, 'GET', '/api/v1/admin/settings');
check(r12.status === 403, `→ 403 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. No auth → 401 ===');
const r13 = await call(null, 'GET', '/api/v1/admin/settings');
check(r13.status === 401, `→ 401 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// 14. PUT /:key out-of-bounds → 400
//     (probe min_value=1 max_value=720; try 99999)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. Out-of-bounds value → 400 ===');
const r14 = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/settings/${probeKey}`, {
  value: '99999',
  reason: 'Phase 32b out-of-bounds value',
});
check(r14.status === 400, `→ 400 (got ${r14.status})`,
  JSON.stringify(r14.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// Cleanup — restore original value, drop test users
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`UPDATE platform_settings SET value=$1 WHERE key=$2`,
  [originalValue, probeKey]);
await pg.query(`DELETE FROM platform_settings_audit WHERE change_reason ~ 'Phase 32b'`);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [adminId, custId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
