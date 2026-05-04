// Phase 34c — financial-admin routes (BIR + revenue + escrow + OR cancel).
//
// Coverage:
//   1. GET /overview — admin returns aggregates
//   2. GET /overview customer → 403
//   3. GET /overview missing date range → 400
//   4. GET /revenue/by-category
//   5. GET /revenue/by-city ?limit=5
//   6. GET /revenue/by-tier
//   7. GET /revenue/by-payment
//   8. GET /escrow — totals
//   9. GET /payouts — summary
//  10. GET /guarantee-fund — summary
//  11. GET /receipts/search ?orNumber
//  12. GET /receipts/:id — known OR
//  13. GET /receipts/:id — bogus → 404
//  14. POST /receipts/:id/cancel — admin (not super) → 403
//  15. POST /receipts/:id/cancel — super_admin (creates negative OR)
//  16. POST /receipts/:id/cancel no reason → 400
//  17. No auth → 401

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

// Setup admin (not super) + customer for negative tests
const adminPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const adminUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'admin', TRUE, 'P34c', 'Admin') RETURNING id`, [adminPhone]);
const adminId = adminUser.rows[0].id;
const ADMIN_TOKEN = jwt.sign(
  { userId: adminId, role: 'admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const custPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const custUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P34c', 'Cust') RETURNING id`, [custPhone]);
const custId = custUser.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: custId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Synthesize an OR row directly (avoid ALL the booking ceremony)
// The route mainly tests admin-can-cancel; we just need a row to cancel.
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P34c', 'Prov') RETURNING id`,
  ['+63917' + (1000000 + Math.floor(Math.random()*8999999))]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P34c Prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;

const bk = await pg.query(
  `INSERT INTO bookings (
     customer_id, provider_id, category_id,
     scheduled_at, address, barangay, city, province,
     service_price, total_amount, status, escrow_status)
   VALUES ($1, $2, $3, NOW() - INTERVAL '1 day',
           '1 P34c', 'B', 'Boracay', 'Aklan',
           100000, 100000, 'confirmed', 'released')
   RETURNING id`, [custId, providerId, cat.rows[0].id]);
const bookingId = bk.rows[0].id;

// Synthesize an OR row: Use uniq month/sequence
const orNumber = `OR-2026-05-P34C${String(Date.now()).slice(-4)}`;
const or = await pg.query(
  `INSERT INTO official_receipts (
     or_number, booking_id, customer_id, provider_id,
     gross_amount, vat_amount, net_amount,
     commission_amount, service_fee_amount,
     provider_received, platform_retained)
   VALUES ($1, $2, $3, $4,
           112000, 12000, 100000,
           10000, 10000,
           80000, 20000)
   RETURNING id`,
  [orNumber, bookingId, custId, providerId]);
const orId = or.rows[0].id;

const FROM = '2026-04-01';
const TO = '2026-06-01';

// ════════════════════════════════════════════════════════════════════
// 1. GET /overview
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /overview ===');
const r1 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/admin/financials/overview?from=${FROM}&to=${TO}`);
check(r1.status === 200, `→ 200 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
check(typeof r1.body?.data === 'object', 'data is object');

// ════════════════════════════════════════════════════════════════════
// 2. customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. customer → 403 ===');
const r2 = await call(CUST_TOKEN, 'GET',
  `/api/v1/admin/financials/overview?from=${FROM}&to=${TO}`);
check(r2.status === 403, `→ 403 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Missing date range → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Missing dates → 400 ===');
const r3 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/financials/overview');
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. /revenue/by-category
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. /revenue/by-category ===');
const r4 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/admin/financials/revenue/by-category?from=${FROM}&to=${TO}`);
check(r4.status === 200, `→ 200 (got ${r4.status})`);
check(Array.isArray(r4.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 5. /revenue/by-city ?limit=5
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. /revenue/by-city ?limit=5 ===');
const r5 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/admin/financials/revenue/by-city?from=${FROM}&to=${TO}&limit=5`);
check(r5.status === 200, `→ 200 (got ${r5.status})`);
check(Array.isArray(r5.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 6. /revenue/by-tier
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. /revenue/by-tier ===');
const r6 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/admin/financials/revenue/by-tier?from=${FROM}&to=${TO}`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. /revenue/by-payment
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. /revenue/by-payment ===');
const r7 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/admin/financials/revenue/by-payment?from=${FROM}&to=${TO}`);
check(r7.status === 200, `→ 200 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. /escrow summary
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. /escrow ===');
const r8 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/financials/escrow');
check(r8.status === 200, `→ 200 (got ${r8.status})`);
check(typeof r8.body?.data === 'object', 'data is object');

// ════════════════════════════════════════════════════════════════════
// 9. /payouts summary
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. /payouts summary ===');
const r9 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/financials/payouts');
check(r9.status === 200, `→ 200 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. /guarantee-fund summary
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. /guarantee-fund ===');
const r10 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/financials/guarantee-fund');
check(r10.status === 200, `→ 200 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. /receipts/search ?orNumber
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. /receipts/search ?orNumber ===');
const r11 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/admin/financials/receipts/search?orNumber=${encodeURIComponent(orNumber)}`);
check(r11.status === 200, `→ 200 (got ${r11.status})`);
const found = r11.body?.data?.rows ?? r11.body?.data?.results ?? [];
check(Array.isArray(found), `data.rows is array (got ${typeof found})`);
check(found.some(r => r.or_number === orNumber || r.id === orId),
  `our OR found in search (count=${found.length})`);
check(typeof r11.body?.data?.total === 'number',
  `data.total numeric (got ${r11.body?.data?.total})`);

// ════════════════════════════════════════════════════════════════════
// 12. GET /receipts/:id known
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. GET /receipts/:id known ===');
const r12 = await call(ADMIN_TOKEN, 'GET', `/api/v1/admin/financials/receipts/${orId}`);
check(r12.status === 200, `→ 200 (got ${r12.status})`);
check(r12.body?.data?.id === orId, 'id matches');

// ════════════════════════════════════════════════════════════════════
// 13. GET /receipts/:id bogus → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. GET /receipts/:id bogus → 404 ===');
const r13 = await call(ADMIN_TOKEN, 'GET',
  '/api/v1/admin/financials/receipts/00000000-0000-0000-0000-000000000000');
check(r13.status === 404, `→ 404 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// 14. POST /:id/cancel admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. POST /:id/cancel admin → 403 ===');
const r14 = await call(ADMIN_TOKEN, 'POST',
  `/api/v1/admin/financials/receipts/${orId}/cancel`,
  { reason: 'Phase 34c admin-cant-cancel test' });
check(r14.status === 403, `→ 403 (got ${r14.status})`);

// ════════════════════════════════════════════════════════════════════
// 15. POST /:id/cancel super_admin
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. POST /:id/cancel super_admin ===');
const r15 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/financials/receipts/${orId}/cancel`,
  { reason: 'Phase 34c super_admin OR cancellation audit test.' });
check(r15.status === 201, `→ 201 (got ${r15.status})`,
  JSON.stringify(r15.body).slice(0,300));

const cancelled = await pg.query(
  `SELECT cancelled_at, cancelled_by FROM official_receipts WHERE id=$1`, [orId]);
check(cancelled.rows[0]?.cancelled_at !== null, 'cancelled_at set');
check(cancelled.rows[0]?.cancelled_by === SUPER_ADMIN_ID, 'cancelled_by=super_admin');

// And there should be a NEW negative-OR row pointing back to ours
const negOr = await pg.query(
  `SELECT id FROM official_receipts WHERE cancels_or_id=$1`, [orId]);
check(negOr.rows.length === 1, 'negative OR created (cancels_or_id link)');

// ════════════════════════════════════════════════════════════════════
// 16. POST /:id/cancel no reason → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. POST /:id/cancel no reason → 400 ===');
const r16 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/financials/receipts/${orId}/cancel`, {});
check(r16.status === 400, `→ 400 (got ${r16.status})`);

// ════════════════════════════════════════════════════════════════════
// 17. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. No auth → 401 ===');
const r17 = await call(null, 'GET',
  `/api/v1/admin/financials/overview?from=${FROM}&to=${TO}`);
check(r17.status === 401, `→ 401 (got ${r17.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM official_receipts WHERE cancels_or_id=$1 OR id=$1`, [orId]);
await pg.query(`DELETE FROM bookings WHERE id=$1`, [bookingId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM audit_log WHERE user_id IN ($1,$2,$3)`,
  [adminId, custId, provUserId]);
await pg.query(`DELETE FROM admin_actions WHERE target_id=$1`, [orId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2,$3)`, [adminId, custId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
