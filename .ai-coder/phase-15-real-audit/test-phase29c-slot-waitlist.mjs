// Phase 29c — slot waitlist (join, notify, cancel, expire).
//
// Coverage:
//   1. POST /bookings/slot-waitlist creates waiting entry
//   2. Past date → 400
//   3. Missing fields → 400
//   4. Duplicate (same customer + date + category, status='waiting') → 409
//   5. GET /bookings/slot-waitlist returns customer's entries
//   6. Wrong customer can't cancel → 404
//   7. DELETE flips status to cancelled
//   8. processSlotAvailability flips waiting→notified + creates notifications
//   9. Notified rows dispatched a notification (best-effort, non-blocking)
//  10. expireOldWaitlistEntries flips past-expires_at waiting → expired

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const REPO_ROOT = process.cwd();

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

const wlSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/slot-waitlist.service.ts')
).href);

// ════════════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════════════
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29c', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const other = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29c', 'Other') RETURNING id`, [phoneOther]);
const otherId = other.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;

const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const OTHER_TOKEN = jwt.sign(
  { userId: otherId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10);
const dayAfter = new Date(Date.now() + 2 * 86400 * 1000).toISOString().slice(0, 10);

// ════════════════════════════════════════════════════════════════════
// 1. POST /slot-waitlist creates entry
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /slot-waitlist → 201 ===');
const r1 = await call(CUST_TOKEN, 'POST', '/api/v1/bookings/slot-waitlist', {
  categoryId,
  preferredDate: tomorrow,
  preferredTimeStart: '09:00',
  preferredTimeEnd: '12:00',
  city: 'Malay',
  province: 'Aklan',
});
check(r1.status === 201, `→ 201 (got ${r1.status})`, JSON.stringify(r1.body).slice(0,200));
const waitId = r1.body?.data?.id;
check(typeof waitId === 'string', 'waitlist id returned');

// ════════════════════════════════════════════════════════════════════
// 2. Past date → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Past date → 400 ===');
const r2 = await call(CUST_TOKEN, 'POST', '/api/v1/bookings/slot-waitlist', {
  categoryId,
  preferredDate: '2020-01-01',
  preferredTimeStart: '09:00',
  preferredTimeEnd: '12:00',
  city: 'Malay',
  province: 'Aklan',
});
check(r2.status === 400, `→ 400 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Missing fields → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Missing fields → 400 ===');
const r3a = await call(CUST_TOKEN, 'POST', '/api/v1/bookings/slot-waitlist', {
  preferredDate: tomorrow, preferredTimeStart: '09:00', preferredTimeEnd: '12:00',
  city: 'Malay', province: 'Aklan',
});
check(r3a.status === 400, `missing categoryId → 400 (got ${r3a.status})`);
const r3b = await call(CUST_TOKEN, 'POST', '/api/v1/bookings/slot-waitlist', {
  categoryId, preferredDate: tomorrow, preferredTimeStart: '09:00', preferredTimeEnd: '12:00',
});
check(r3b.status === 400, `missing city/province → 400 (got ${r3b.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Duplicate (same customer+date+category) → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Duplicate join → 409 ===');
const r4 = await call(CUST_TOKEN, 'POST', '/api/v1/bookings/slot-waitlist', {
  categoryId,
  preferredDate: tomorrow,
  preferredTimeStart: '14:00', preferredTimeEnd: '17:00',  // different time
  city: 'Malay', province: 'Aklan',
});
check(r4.status === 409, `→ 409 (got ${r4.status})`,
  JSON.stringify(r4.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 5. GET /slot-waitlist returns customer's entries
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /slot-waitlist ===');
const r5 = await call(CUST_TOKEN, 'GET', '/api/v1/bookings/slot-waitlist');
check(r5.status === 200, `→ 200 (got ${r5.status})`);
const ids = (r5.body?.data ?? []).map(w => w.id);
check(ids.includes(waitId), 'customer\'s waitlist entry in list');

// 5b. Other customer doesn't see it
const r5b = await call(OTHER_TOKEN, 'GET', '/api/v1/bookings/slot-waitlist');
const otherIds = (r5b.body?.data ?? []).map(w => w.id);
check(!otherIds.includes(waitId), 'other customer doesn\'t see this entry');

// ════════════════════════════════════════════════════════════════════
// 6. Wrong customer can't cancel → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Other customer DELETE → 404 ===');
const r6 = await call(OTHER_TOKEN, 'DELETE', `/api/v1/bookings/slot-waitlist/${waitId}`);
check(r6.status === 404, `→ 404 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. DELETE flips status to cancelled
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Customer DELETE flips status ===');
const r7 = await call(CUST_TOKEN, 'DELETE', `/api/v1/bookings/slot-waitlist/${waitId}`);
check(r7.status === 200, `→ 200 (got ${r7.status})`);
const wDb = await pg.query(`SELECT status FROM booking_slot_waitlist WHERE id=$1`, [waitId]);
check(wDb.rows[0]?.status === 'cancelled', `status=cancelled (got ${wDb.rows[0]?.status})`);

// 7b. Re-cancel → 404 (already cancelled)
const r7b = await call(CUST_TOKEN, 'DELETE', `/api/v1/bookings/slot-waitlist/${waitId}`);
check(r7b.status === 404, `re-cancel → 404 (got ${r7b.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. processSlotAvailability flips waiting→notified
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. processSlotAvailability flips waiting→notified ===');
// Create 3 fresh entries on dayAfter for the same category+city
const w1 = await pg.query(
  `INSERT INTO booking_slot_waitlist
     (customer_id, category_id, preferred_date, preferred_time_start, preferred_time_end,
      city, province, expires_at, status)
   VALUES ($1, $2, $3, '09:00', '12:00', 'Malay', 'Aklan', $4::timestamptz, 'waiting')
   RETURNING id`,
  [customerId, categoryId, dayAfter, new Date(Date.now() + 7 * 86400 * 1000).toISOString()]);
const w2 = await pg.query(
  `INSERT INTO booking_slot_waitlist
     (customer_id, category_id, preferred_date, preferred_time_start, preferred_time_end,
      city, province, expires_at, status)
   VALUES ($1, $2, $3, '14:00', '17:00', 'Malay', 'Aklan', $4::timestamptz, 'waiting')
   RETURNING id`,
  [otherId, categoryId, dayAfter, new Date(Date.now() + 7 * 86400 * 1000).toISOString()]);

const notified = await wlSvc.processSlotAvailability(categoryId, 'Malay', dayAfter);
check(notified === 2, `2 entries notified (got ${notified})`);
const w1Db = await pg.query(`SELECT status, notified_at FROM booking_slot_waitlist WHERE id=$1`, [w1.rows[0].id]);
check(w1Db.rows[0]?.status === 'notified', 'w1 status=notified');
check(w1Db.rows[0]?.notified_at !== null, 'w1 notified_at set');

// ════════════════════════════════════════════════════════════════════
// 9. Notification dispatched
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Notifications dispatched ===');
const notifs = await pg.query(
  `SELECT type, title FROM notifications WHERE user_id=$1 AND title LIKE '%slot%just opened%'`,
  [customerId]);
check(notifs.rows.length >= 1, `customer 1 received slot-opened notification (got ${notifs.rows.length})`);

// ════════════════════════════════════════════════════════════════════
// 10. expireOldWaitlistEntries flips past-expires waiting → expired
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. expireOldWaitlistEntries ===');
// Insert an entry with past expires_at
const wOld = await pg.query(
  `INSERT INTO booking_slot_waitlist
     (customer_id, category_id, preferred_date, preferred_time_start, preferred_time_end,
      city, province, expires_at, status)
   VALUES ($1, $2, $3, '09:00', '12:00', 'OldCity', 'OldProv', NOW() - INTERVAL '1 hour', 'waiting')
   RETURNING id`,
  [customerId, categoryId, tomorrow]);
const wOldId = wOld.rows[0].id;

const expired = await wlSvc.expireOldWaitlistEntries();
check(expired >= 1, `at least 1 entry expired (got ${expired})`);
const wOldDb = await pg.query(`SELECT status FROM booking_slot_waitlist WHERE id=$1`, [wOldId]);
check(wOldDb.rows[0]?.status === 'expired', `expired entry status=expired (got ${wOldDb.rows[0]?.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM notifications WHERE user_id IN ($1, $2)`, [customerId, otherId]);
await pg.query(`DELETE FROM booking_slot_waitlist WHERE customer_id IN ($1, $2)`, [customerId, otherId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2)`, [customerId, otherId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
