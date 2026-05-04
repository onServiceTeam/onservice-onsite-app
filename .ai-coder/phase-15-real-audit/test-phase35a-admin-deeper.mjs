// Phase 35a — admin.routes.ts deeper coverage of previously-untested
// dashboard, blocked-IPs, audit-log, security-events, escrow release,
// and recurring booking management endpoints.
//
// Coverage:
//   1. GET /dashboard kpis (legacy)
//   2. GET /dashboard/kpis?range=7d (Phase 04 ranged)
//   3. GET /dashboard/kpis?range=junk → 400
//   4. GET /dashboard/revenue-trend?days=14
//   5. GET /dashboard/booking-volume?days=7
//   6. GET /dashboard/acquisition-funnel?days=30
//   7. GET /dashboard/alerts
//   8. GET /dashboard/cities
//   9. GET /audit-log paginated
//  10. GET /audit-log ?action=login filter
//  11. GET /security-events
//  12. POST /blocked-ips creates entry
//  13. POST /blocked-ips missing fields → 400
//  14. GET /blocked-ips lists
//  15. DELETE /blocked-ips/:ip removes
//  16. DELETE /blocked-ips/:ip not-found → 404
//  17. POST /bookings/:id/release-escrow super_admin happy path
//  18. POST /bookings/:id/release-escrow short reason → 400
//  19. POST /bookings/:id/release-escrow already-released → 409
//  20. POST /bookings/:id/release-escrow admin (not super) → 403
//  21. customer → 403 on /dashboard
//  22. No auth → 401
//  23. GET /service-areas-waitlist (admin paginated)

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

async function makeUser(role) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, $2, TRUE, 'P35a', $3) RETURNING id`,
    [phone, role, role.slice(0,8) + Date.now()]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const ADMIN_USER = await makeUser('admin');
const CUST = await makeUser('customer');

// ════════════════════════════════════════════════════════════════════
// 1-2. Dashboard
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /dashboard ===');
const r1 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard');
check(r1.status === 200, `→ 200 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
check(typeof r1.body?.data === 'object', 'data is object');

console.log('\n=== 2. GET /dashboard/kpis?range=7d ===');
const r2 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/kpis?range=7d');
check(r2.status === 200, `→ 200 (got ${r2.status})`);

console.log('\n=== 3. ?range=junk → 400 ===');
const r3 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/kpis?range=lifetime');
check(r3.status === 400, `→ 400 (got ${r3.status})`);

console.log('\n=== 4. /dashboard/revenue-trend ===');
const r4 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/revenue-trend?days=14');
check(r4.status === 200, `→ 200 (got ${r4.status})`);

console.log('\n=== 5. /dashboard/booking-volume ===');
const r5 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/booking-volume?days=7');
check(r5.status === 200, `→ 200 (got ${r5.status})`);

console.log('\n=== 6. /dashboard/acquisition-funnel ===');
const r6 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/acquisition-funnel?days=30');
check(r6.status === 200, `→ 200 (got ${r6.status})`);

console.log('\n=== 7. /dashboard/alerts ===');
const r7 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/alerts');
check(r7.status === 200, `→ 200 (got ${r7.status})`);

console.log('\n=== 8. /dashboard/cities ===');
const r8 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/dashboard/cities');
check(r8.status === 200, `→ 200 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 9-10. Audit log
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. GET /audit-log ===');
const r9 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/audit-log?page=1&pageSize=10');
check(r9.status === 200, `→ 200 (got ${r9.status})`);
check(Array.isArray(r9.body?.data), 'data is array');

console.log('\n=== 10. GET /audit-log ?action=login ===');
const r10 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/audit-log?action=login');
check(r10.status === 200, `→ 200 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. Security events
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. GET /security-events ===');
const r11 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/security-events?limit=10');
check(r11.status === 200, `→ 200 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 12-16. Blocked IPs
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. POST /blocked-ips ===');
const testIp = '203.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256);
const r12 = await call(ADMIN_USER.token, 'POST', '/api/v1/admin/blocked-ips', {
  ipAddress: testIp,
  reason: 'Phase 35a admin block test — forensic verification',
  expiresInHours: 24,
});
check(r12.status === 201, `→ 201 (got ${r12.status})`,
  JSON.stringify(r12.body).slice(0,200));

console.log('\n=== 13. POST /blocked-ips no fields → 400 ===');
const r13 = await call(ADMIN_USER.token, 'POST', '/api/v1/admin/blocked-ips', {});
check(r13.status === 400, `→ 400 (got ${r13.status})`);

console.log('\n=== 14. GET /blocked-ips ===');
const r14 = await call(ADMIN_USER.token, 'GET', '/api/v1/admin/blocked-ips');
check(r14.status === 200, `→ 200 (got ${r14.status})`);
check(r14.body?.data?.some(b => b.ipAddress === testIp || b.ip_address === testIp),
  'our IP in list');

console.log('\n=== 15. DELETE /blocked-ips/:ip ===');
const r15 = await call(ADMIN_USER.token, 'DELETE', `/api/v1/admin/blocked-ips/${encodeURIComponent(testIp)}`);
check(r15.status === 200, `→ 200 (got ${r15.status})`);

console.log('\n=== 16. DELETE not-found → 404 ===');
const r16 = await call(ADMIN_USER.token, 'DELETE', '/api/v1/admin/blocked-ips/9.9.9.9');
check(r16.status === 404, `→ 404 (got ${r16.status})`);

// ════════════════════════════════════════════════════════════════════
// 17-20. Manual escrow release
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. POST /bookings/:id/release-escrow super_admin ===');
// Setup: create a booking with escrow_status='held' and provider assigned
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const provUser = await makeUser('provider');
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P35a Prov', 'approved') RETURNING id`, [provUser.userId]);
const providerId = prov.rows[0].id;

// Provider needs a wallet for escrow-release to credit
await pg.query(
  `INSERT INTO wallets (user_id, type, currency, available_balance)
   VALUES ($1, 'provider', 'PHP', 0)
   ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO NOTHING`,
  [provUser.userId]);

const customerUser = await makeUser('customer');
const bk = await pg.query(
  `INSERT INTO bookings (
     customer_id, provider_id, category_id,
     scheduled_at, address, barangay, city, province,
     service_price, total_amount, status, escrow_status)
   VALUES ($1, $2, $3, NOW(),
           '1 P35a', 'B', 'Boracay', 'Aklan',
           100000, 100000, 'confirmed', 'held')
   RETURNING id`,
  [customerUser.userId, providerId, cat.rows[0].id]);
const bookingId = bk.rows[0].id;

const r17 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/bookings/${bookingId}/release-escrow`,
  { reason: 'Phase 35a manual escrow release verification test.' });
check(r17.status === 200, `→ 200 (got ${r17.status})`,
  JSON.stringify(r17.body).slice(0,200));

const escrowAfter = await pg.query(
  `SELECT escrow_status FROM bookings WHERE id=$1`, [bookingId]);
check(escrowAfter.rows[0]?.escrow_status === 'released', `escrow_status=released (got ${escrowAfter.rows[0]?.escrow_status})`);

const audit = await pg.query(
  `SELECT 1 FROM admin_actions
     WHERE action_type='manual_escrow_release' AND target_id=$1`, [bookingId]);
check(audit.rows.length >= 1, 'manual_escrow_release admin_actions row written');

console.log('\n=== 18. release-escrow short reason → 400 ===');
const r18 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/bookings/${bookingId}/release-escrow`,
  { reason: 'short' });
check(r18.status === 400, `→ 400 (got ${r18.status})`);

console.log('\n=== 19. release-escrow already-released → 409 ===');
const r19 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/bookings/${bookingId}/release-escrow`,
  { reason: 'Phase 35a already-released path verification.' });
check(r19.status === 409, `→ 409 (got ${r19.status})`);

console.log('\n=== 20. release-escrow admin (not super) → 403 ===');
const r20 = await call(ADMIN_USER.token, 'POST',
  `/api/v1/admin/bookings/${bookingId}/release-escrow`,
  { reason: 'Phase 35a admin no-permission verification.' });
check(r20.status === 403, `→ 403 (got ${r20.status})`);

// ════════════════════════════════════════════════════════════════════
// 21. customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 21. customer /dashboard → 403 ===');
const r21 = await call(CUST.token, 'GET', '/api/v1/admin/dashboard');
check(r21.status === 403, `→ 403 (got ${r21.status})`);

// ════════════════════════════════════════════════════════════════════
// 22. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 22. No auth → 401 ===');
const r22 = await call(null, 'GET', '/api/v1/admin/dashboard');
check(r22.status === 401, `→ 401 (got ${r22.status})`);

// ════════════════════════════════════════════════════════════════════
// 23. /service-areas-waitlist
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 23. GET /service-areas-waitlist ===');
const r23 = await call(ADMIN_USER.token, 'GET',
  '/api/v1/admin/service-areas-waitlist?page=1&pageSize=10');
check(r23.status === 200, `→ 200 (got ${r23.status})`);
check(Array.isArray(r23.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id=$1`, [bookingId]);
await pg.query(`DELETE FROM wallet_transactions WHERE booking_id=$1`, [bookingId]);
await pg.query(`DELETE FROM official_receipts WHERE booking_id=$1`, [bookingId]);
await pg.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (
  SELECT id FROM wallets WHERE user_id IN ($1,$2,$3)
)`, [provUser.userId, customerUser.userId, ADMIN_USER.userId]);
await pg.query(`DELETE FROM wallets WHERE user_id IN ($1,$2,$3)`,
  [provUser.userId, customerUser.userId, ADMIN_USER.userId]);
await pg.query(`DELETE FROM bookings WHERE id=$1`, [bookingId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM audit_log WHERE user_id IN ($1,$2,$3,$4)`,
  [ADMIN_USER.userId, CUST.userId, provUser.userId, customerUser.userId]);
await pg.query(`DELETE FROM blocked_ips WHERE ip_address=$1::inet`, [testIp]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2,$3,$4)`,
  [ADMIN_USER.userId, CUST.userId, provUser.userId, customerUser.userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
