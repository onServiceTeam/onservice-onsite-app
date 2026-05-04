// Phase 33a — account routes (DPA right-to-portability + right-to-erasure).
//
// Coverage:
//   1. POST /account/data-export creates pending request
//   2. GET /account/data-export lists user's exports
//   3. POST /account/data-export second pending → 409
//   4. POST /account/data-export format=csv accepted
//   5. POST /account/deletion creates pending + 30d cooling_off
//   6. POST /account/deletion second pending → 409
//   7. POST /account/deletion blocked by active booking → 409 (MED-N55 cancellable bucket)
//   8. POST /account/deletion blocked by in-progress booking → 409 (MED-N55 in-progress bucket, distinct message)
//   9. GET /account/deletion/status returns active row
//  10. POST /account/deletion/cancel — within cooling-off → 200
//  11. POST /account/deletion/cancel — after cooling-off → 404 (MED-N54 race guard)
//  12. POST /account/deletion/cancel — no request → 404
//  13. No auth → 401

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

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

async function makeUser(role = 'customer') {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, $2, TRUE, 'P33a', $3) RETURNING id`,
    [phone, role, role.slice(0,8) + Date.now()]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const ALICE = await makeUser();    // for data export
const BOB = await makeUser();      // for deletion happy-path
const CAROL = await makeUser();    // for deletion-with-cancellable-booking
const DAVE = await makeUser();     // for deletion-with-in-progress-booking
const EMILY = await makeUser();    // for cooling-off-elapsed
const FRANK = await makeUser();    // for no-request cancel test

// ════════════════════════════════════════════════════════════════════
// 1. POST /account/data-export creates pending
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /account/data-export ===');
const r1 = await call(ALICE.token, 'POST', '/api/v1/account/data-export', {});
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
check(r1.body?.data?.status === 'pending', `status=pending (got ${r1.body?.data?.status})`);
check(r1.body?.data?.format === 'json', `format=json (got ${r1.body?.data?.format})`);

// ════════════════════════════════════════════════════════════════════
// 2. GET lists exports
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. GET /account/data-export ===');
const r2 = await call(ALICE.token, 'GET', '/api/v1/account/data-export');
check(r2.status === 200, `→ 200 (got ${r2.status})`);
check(Array.isArray(r2.body?.data) && r2.body.data.length === 1,
  `1 export listed (got ${r2.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 3. Second pending → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Second pending export → 409 ===');
const r3 = await call(ALICE.token, 'POST', '/api/v1/account/data-export', {});
check(r3.status === 409, `→ 409 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. format=csv accepted (clear pending first)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. format=csv accepted ===');
await pg.query(`UPDATE data_export_requests SET status='completed' WHERE user_id=$1`, [ALICE.userId]);
const r4 = await call(ALICE.token, 'POST', '/api/v1/account/data-export', { format: 'csv' });
check(r4.status === 201, `→ 201 (got ${r4.status})`,
  JSON.stringify(r4.body).slice(0,200));
check(r4.body?.data?.format === 'csv', `format=csv (got ${r4.body?.data?.format})`);

// ════════════════════════════════════════════════════════════════════
// 5. POST /account/deletion happy path (Bob has no bookings)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. POST /account/deletion ===');
const r5 = await call(BOB.token, 'POST', '/api/v1/account/deletion', {
  reason: 'Phase 33a test',
});
check(r5.status === 201, `→ 201 (got ${r5.status})`,
  JSON.stringify(r5.body).slice(0,200));
check(['pending', 'cooling_off'].includes(r5.body?.data?.status),
  `status=pending|cooling_off (got ${r5.body?.data?.status})`);
const coolingEnd = new Date(r5.body?.data?.coolingOffEndsAt);
const daysAhead = (coolingEnd.getTime() - Date.now()) / 86400000;
check(daysAhead > 29 && daysAhead < 31,
  `cooling_off ~30d ahead (got ${daysAhead.toFixed(1)}d)`);

// ════════════════════════════════════════════════════════════════════
// 6. Second pending → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Second deletion → 409 ===');
const r6 = await call(BOB.token, 'POST', '/api/v1/account/deletion', {});
check(r6.status === 409, `→ 409 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. Cancellable-bucket booking blocks deletion
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Cancellable booking blocks → 409 ===');
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
let categoryId = cat.rows[0]?.id;
if (!categoryId) {
  const insSvc = await pg.query(
    `INSERT INTO service_categories (name, slug, description)
     VALUES ($1, $2, 'p33a probe') RETURNING id`,
    [`P33a-${Date.now()}`, `p33a-${Date.now()}`]);
  categoryId = insSvc.rows[0].id;
}
// Bare booking with status=requested for Carol
const carolBk = await pg.query(
  `INSERT INTO bookings (
     customer_id, category_id, scheduled_at, address, barangay, city, province,
     service_price, total_amount, status, escrow_status)
   VALUES ($1, $2, NOW() + INTERVAL '1 day',
           '1 P33a', 'B', 'Boracay', 'Aklan',
           100000, 100000, 'requested', 'pending')
   RETURNING id`,
  [CAROL.userId, categoryId]);
const carolBkId = carolBk.rows[0].id;

const r7 = await call(CAROL.token, 'POST', '/api/v1/account/deletion', {});
check(r7.status === 409, `→ 409 (got ${r7.status})`,
  JSON.stringify(r7.body).slice(0,200));
check(r7.body?.error?.message?.includes('complete or cancel'),
  `cancellable-bucket message (got "${r7.body?.error?.message?.slice(0,80)}")`);

// ════════════════════════════════════════════════════════════════════
// 8. In-progress booking → distinct MED-N55 message
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. In-progress booking → distinct message ===');
const daveBk = await pg.query(
  `INSERT INTO bookings (
     customer_id, category_id, scheduled_at, address, barangay, city, province,
     service_price, total_amount, status, escrow_status)
   VALUES ($1, $2, NOW(),
           '2 P33a', 'B', 'Boracay', 'Aklan',
           100000, 100000, 'in_progress', 'held')
   RETURNING id`,
  [DAVE.userId, categoryId]);
const daveBkId = daveBk.rows[0].id;

const r8 = await call(DAVE.token, 'POST', '/api/v1/account/deletion', {});
check(r8.status === 409, `→ 409 (got ${r8.status})`);
check(r8.body?.error?.message?.includes('still in progress') ||
      r8.body?.error?.message?.includes('auto-complete'),
  `in-progress-specific message (got "${r8.body?.error?.message?.slice(0,80)}")`);

// ════════════════════════════════════════════════════════════════════
// 9. GET /deletion/status returns active row
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. GET /deletion/status ===');
const r9 = await call(BOB.token, 'GET', '/api/v1/account/deletion/status');
check(r9.status === 200, `→ 200 (got ${r9.status})`);
check(r9.body?.data?.status, `status returned (got ${r9.body?.data?.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. Cancel within cooling-off → 200
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Cancel within cooling-off → 200 ===');
const r10 = await call(BOB.token, 'POST', '/api/v1/account/deletion/cancel', {});
check(r10.status === 200, `→ 200 (got ${r10.status})`);
const dbBob = await pg.query(
  `SELECT status FROM account_deletion_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
  [BOB.userId]);
check(dbBob.rows[0]?.status === 'cancelled', `DB status=cancelled (got ${dbBob.rows[0]?.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. Cancel after cooling-off elapsed → 404 (MED-N54)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Cancel after cooling-off elapsed → 404 ===');
// Insert a row with cooling_off_ends_at in the past
await pg.query(
  `INSERT INTO account_deletion_requests
     (user_id, status, requested_at, cooling_off_ends_at)
   VALUES ($1, 'cooling_off', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day')`,
  [EMILY.userId]);
const r11 = await call(EMILY.token, 'POST', '/api/v1/account/deletion/cancel', {});
check(r11.status === 404, `→ 404 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. Cancel with no request → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Cancel with no request → 404 ===');
const r12 = await call(FRANK.token, 'POST', '/api/v1/account/deletion/cancel', {});
check(r12.status === 404, `→ 404 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. No auth → 401 ===');
const r13 = await call(null, 'POST', '/api/v1/account/data-export', {});
check(r13.status === 401, `→ 401 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
const userIds = [ALICE.userId, BOB.userId, CAROL.userId, DAVE.userId, EMILY.userId, FRANK.userId];
await pg.query(`DELETE FROM data_export_requests WHERE user_id = ANY($1)`, [userIds]);
await pg.query(`DELETE FROM account_deletion_requests WHERE user_id = ANY($1)`, [userIds]);
await pg.query(`DELETE FROM bookings WHERE id IN ($1,$2)`, [carolBkId, daveBkId]);
await pg.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
