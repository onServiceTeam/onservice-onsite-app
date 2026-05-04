// Phase 33b — cancellation-policy public read + admin editor (D02 Bug 1170/1198).
//
// Coverage (public):
//   1. GET /settings/cancellation-policy — no auth required
//   2. Returns tiers + intro_text + provider_no_show_credit_php
//   3. Cached (back-to-back calls return same is_active version)
//
// Coverage (admin — super_admin only):
//   4. GET /admin/cancellation-policies lists versions
//   5. GET /admin/cancellation-policies admin (not super) → 403
//   6. GET /:version returns full payload
//   7. GET /:version invalid (0) → 400
//   8. GET /:version not found → 404
//   9. POST creates new version + closes the old one (effective_to set)
//  10. POST validates: refund + fee == 100 → 400
//  11. POST validates: top tier max_hours_before must be null → 400
//  12. POST validates: bottom tier min_hours_before must be ≤ 0 → 400
//  13. POST validates: gap between tiers → 400
//  14. PUT in-place edit (within 1h, on active version) → 200
//  15. PUT on non-active version → 409
//  16. PUT after cooling window past 1h → 409 (synthetic — backdate created_at)
//  17. POST customer/admin → 403
//  18. No auth → 401

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
   VALUES ($1, 'admin', TRUE, 'P33b', 'Admin') RETURNING id`, [adminPhone]);
const adminId = adminUser.rows[0].id;
const ADMIN_TOKEN = jwt.sign(
  { userId: adminId, role: 'admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const custPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const custUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P33b', 'Cust') RETURNING id`, [custPhone]);
const custId = custUser.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: custId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Snapshot original active version so we can restore later
const originalActive = await pg.query(
  `SELECT id, version, effective_to FROM cancellation_policies
     WHERE effective_to IS NULL ORDER BY version DESC LIMIT 1`);

// Build a valid policy body
const validPolicy = () => ({
  tiers: [
    { min_hours_before: 24,  max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: '>24h' },
    { min_hours_before: 2,   max_hours_before: 24,   refund_percent: 90,  fee_percent: 10,  label: '2-24h' },
    { min_hours_before: 1,   max_hours_before: 2,    refund_percent: 80,  fee_percent: 20,  label: '1-2h' },
    { min_hours_before: 0.5, max_hours_before: 1,    refund_percent: 70,  fee_percent: 30,  label: '30min-1h' },
    { min_hours_before: 0,   max_hours_before: 0.5,  refund_percent: 50,  fee_percent: 50,  label: '<30min' },
    { min_hours_before: -1,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'no-show' },
  ],
  intro_text: 'Phase 33b test policy — Boracay launch defaults snapshot for audit.',
  legal_disclaimer: 'Phase 33b legal disclaimer for cancellation policy testing purposes.',
  provider_no_show_credit_php: 200,
});

// ════════════════════════════════════════════════════════════════════
// 1. GET public — no auth
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /settings/cancellation-policy (public) ===');
const r1 = await call(null, 'GET', '/api/v1/settings/cancellation-policy');
check(r1.status === 200, `→ 200 (got ${r1.status})`);
check(Array.isArray(r1.body?.data?.tiers), 'tiers array');
check(typeof r1.body?.data?.intro_text === 'string', 'intro_text present');
check(typeof r1.body?.data?.provider_no_show_credit_php === 'number',
  'provider_no_show_credit_php number');

// ════════════════════════════════════════════════════════════════════
// 3. Cached (idempotent)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Idempotent ===');
const r3 = await call(null, 'GET', '/api/v1/settings/cancellation-policy');
check(r3.body?.data?.version === r1.body?.data?.version, 'same version returned');

// ════════════════════════════════════════════════════════════════════
// 4. Admin GET / lists versions
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. GET /admin/cancellation-policies super_admin ===');
const r4 = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/cancellation-policies');
check(r4.status === 200, `→ 200 (got ${r4.status})`);
check(Array.isArray(r4.body?.data) && r4.body.data.length > 0, 'list non-empty');
check(r4.body?.data?.some(p => p.is_active === true), 'an is_active row exists');

// ════════════════════════════════════════════════════════════════════
// 5. Admin GET (not super) → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. admin → 403 ===');
const r5 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/cancellation-policies');
check(r5.status === 403, `→ 403 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. GET /:version returns full payload
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET /:version ===');
const versionToFetch = r4.body.data[0].version;
const r6 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/cancellation-policies/${versionToFetch}`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);
check(r6.body?.data?.version === versionToFetch, 'version matches');
check(Array.isArray(r6.body?.data?.tiers), 'tiers in payload');

// ════════════════════════════════════════════════════════════════════
// 7. GET /:version invalid 0 → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. /:version=0 → 400 ===');
const r7 = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/cancellation-policies/0');
check(r7.status === 400, `→ 400 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. GET /:version not found → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. /:version=99999 → 404 ===');
const r8 = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/cancellation-policies/99999');
check(r8.status === 404, `→ 404 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. POST new version
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. POST creates new version ===');
const r9 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/cancellation-policies', validPolicy());
check(r9.status === 201, `→ 201 (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));
const newVersion = r9.body?.data?.version;
check(typeof newVersion === 'number' && newVersion > versionToFetch,
  `version > ${versionToFetch} (got ${newVersion})`);

// Old active version should now have effective_to set
const oldClosed = await pg.query(
  `SELECT effective_to FROM cancellation_policies WHERE version=$1`, [versionToFetch]);
check(oldClosed.rows[0]?.effective_to !== null, 'old version closed');

// ════════════════════════════════════════════════════════════════════
// 10. POST validation: refund + fee != 100 → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. refund+fee != 100 → 400 ===');
const bad10 = validPolicy();
bad10.tiers[0].refund_percent = 50;
bad10.tiers[0].fee_percent = 30;
const r10 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/cancellation-policies', bad10);
check(r10.status === 400, `→ 400 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. POST validation: top tier max_hours not null → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. top tier max != null → 400 ===');
const bad11 = validPolicy();
bad11.tiers[0].max_hours_before = 100;
const r11 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/cancellation-policies', bad11);
check(r11.status === 400, `→ 400 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. POST validation: bottom tier min > 0 → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. bottom tier min > 0 → 400 ===');
const bad12 = validPolicy();
bad12.tiers[bad12.tiers.length - 1].min_hours_before = 1;
const r12 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/cancellation-policies', bad12);
check(r12.status === 400, `→ 400 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. POST validation: gap between tiers → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. gap between tiers → 400 ===');
const bad13 = validPolicy();
bad13.tiers[1].max_hours_before = 36; // gap: row 0 min=24, row 1 max=36 (mismatch)
const r13 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/cancellation-policies', bad13);
check(r13.status === 400, `→ 400 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// 14. PUT in-place edit (within 1h, active version)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. PUT in-place (within 1h) ===');
const tweaked = validPolicy();
tweaked.intro_text = 'Phase 33b in-place edit verification — same shape, slight tweak.';
const r14 = await call(SUPER_TOKEN, 'PUT',
  `/api/v1/admin/cancellation-policies/${newVersion}`, tweaked);
check(r14.status === 200, `→ 200 (got ${r14.status})`,
  JSON.stringify(r14.body).slice(0,200));

const updated = await pg.query(
  `SELECT intro_text FROM cancellation_policies WHERE version=$1`, [newVersion]);
check(updated.rows[0]?.intro_text?.includes('in-place edit verification'),
  'intro_text persisted');

// ════════════════════════════════════════════════════════════════════
// 15. PUT on non-active version → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. PUT on non-active → 409 ===');
const r15 = await call(SUPER_TOKEN, 'PUT',
  `/api/v1/admin/cancellation-policies/${versionToFetch}`, validPolicy());
check(r15.status === 409, `→ 409 (got ${r15.status})`);

// ════════════════════════════════════════════════════════════════════
// 16. PUT after 1h → 409 (backdate created_at)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. PUT after 1h window → 409 ===');
await pg.query(
  `UPDATE cancellation_policies SET created_at = NOW() - INTERVAL '2 hours' WHERE version=$1`,
  [newVersion]);
const r16 = await call(SUPER_TOKEN, 'PUT',
  `/api/v1/admin/cancellation-policies/${newVersion}`, validPolicy());
check(r16.status === 409, `→ 409 (got ${r16.status})`);

// ════════════════════════════════════════════════════════════════════
// 17. customer POST → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. customer POST → 403 ===');
const r17 = await call(CUST_TOKEN, 'POST', '/api/v1/admin/cancellation-policies', validPolicy());
check(r17.status === 403, `→ 403 (got ${r17.status})`);

// ════════════════════════════════════════════════════════════════════
// 18. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 18. No auth → 401 ===');
const r18 = await call(null, 'GET', '/api/v1/admin/cancellation-policies');
check(r18.status === 401, `→ 401 (got ${r18.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup — restore the original active version
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
// Delete our test version and restore the previously-active one
await pg.query(`DELETE FROM cancellation_policies WHERE version=$1`, [newVersion]);
if (originalActive.rows[0]) {
  await pg.query(
    `UPDATE cancellation_policies SET effective_to=NULL WHERE id=$1`,
    [originalActive.rows[0].id]);
}
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [adminId, custId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
