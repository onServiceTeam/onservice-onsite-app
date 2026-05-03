// Phase 25c — tip flow + recurring auto-charge.
//
// Coverage:
//   TIP:
//   1. GET /tips/limits public → returns minCents+maxCents
//   2. Customer sends wallet tip on completed booking → tip row created,
//      customer wallet debited, provider wallet credited, notification fired
//   3. Cannot tip own non-booking → 403
//   4. Cannot tip same booking twice → 409
//   5. Cannot tip non-completed booking → 409
//   6. Cannot tip with insufficient wallet balance → 400
//   7. Cannot exceed tip cap → 400
//   8. Non-wallet payment method rejected (MED-N153) → 400
//
//   RECURRING AUTO-CHARGE:
//   9. setAutoChargePaymentMethod stores method on recurring_bookings
//  10. Wrong customer cannot set on someone else's recurring → 404
//  11. Idempotent set (same method twice) is no-op
//  12. clearAutoChargePaymentMethod nulls out the method
//  13. Wrong customer clear → 404

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

// ════════════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));

const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase25c', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;

const otherCust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase25c', 'Other') RETURNING id`, [phoneOther]);
const otherCustomerId = otherCust.rows[0].id;

const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'Phase25c', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;

const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'phase25c prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;

const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;

const TOTAL = 100000;

async function makeBooking(status, provId = providerId) {
  const r = await pg.query(
    `INSERT INTO bookings
       (customer_id, provider_id, category_id, status, total_amount,
        service_price, service_fee, address, barangay, city, province,
        latitude, longitude, scheduled_at, completed_at, escrow_status)
     VALUES ($1, $2, $3, $4, $5, $5, 0, 'Test Address', 'Manoc-Manoc', 'Malay', 'Aklan',
             11.97, 121.92, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hours', 'pending')
     RETURNING id`,
    [customerId, provId, categoryId, status, TOTAL]);
  return r.rows[0].id;
}

const completedBk = await makeBooking('completed_by_provider');
const newBk       = await makeBooking('requested');

// Seed customer wallet with funds
await pg.query(
  `INSERT INTO wallets (user_id, type, available_balance, pending_balance)
   VALUES ($1, 'customer', $2, 0)
   ON CONFLICT DO NOTHING`,
  [customerId, 200000]);  // ₱2000 — enough for tips
// Make sure available_balance is 200000
await pg.query(
  `UPDATE wallets SET available_balance = 200000 WHERE user_id=$1 AND type='customer'`,
  [customerId]);

// Provider wallet
await pg.query(
  `INSERT INTO wallets (user_id, type, available_balance, pending_balance)
   VALUES ($1, 'provider', 0, 0)
   ON CONFLICT DO NOTHING`,
  [provUserId]);

const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);
const OTHER_TOKEN = jwt.sign(
  { userId: otherCustomerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

// ════════════════════════════════════════════════════════════════════
// TIP TESTS
// ════════════════════════════════════════════════════════════════════

// 1. Public /limits
console.log('\n=== 1. GET /tips/limits ===');
const lim = await call(null, 'GET', '/api/v1/tips/limits');
check(lim.status === 200, 'GET /limits → 200');
check(typeof lim.body?.data?.maxCents === 'number',
  `maxCents present (got ${lim.body?.data?.maxCents})`);
check(typeof lim.body?.data?.minCents === 'number',
  `minCents present (got ${lim.body?.data?.minCents})`);
const tipMax = lim.body?.data?.maxCents ?? 500_000;

// 2. Send tip on completed booking — wallet
console.log('\n=== 2. Send wallet tip on completed booking ===');
const TIP = 5000;  // ₱50
const beforeCust = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const beforeProv = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);

const tip2 = await call(CUST_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: completedBk, amount: TIP, paymentMethod: 'wallet',
  message: 'Phase 25c thank you',
});
check(tip2.status === 201, 'POST /tips → 201',
  `got ${tip2.status} ${JSON.stringify(tip2.body).slice(0,200)}`);
check(typeof tip2.body?.data?.id === 'string', 'tip id returned');

const afterCust = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const afterProv = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
check(Number(afterCust.rows[0].available_balance) === Number(beforeCust.rows[0].available_balance) - TIP,
  `customer wallet debited by ${TIP}`,
  `before=${beforeCust.rows[0].available_balance} after=${afterCust.rows[0].available_balance}`);
check(Number(afterProv.rows[0].available_balance) === Number(beforeProv.rows[0].available_balance) + TIP,
  `provider wallet credited by ${TIP}`,
  `before=${beforeProv.rows[0].available_balance} after=${afterProv.rows[0].available_balance}`);

// Notification row created
const notif = await pg.query(
  `SELECT type, title FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
  [provUserId]);
check(notif.rows[0]?.title === 'Tip Received!', 'provider notification created');

// 3. Cannot tip someone else's booking
console.log('\n=== 3. Other customer cannot tip stranger\'s booking → 403 ===');
const t3 = await call(OTHER_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: completedBk, amount: 1000, paymentMethod: 'wallet',
});
check(t3.status === 403, 'wrong customer → 403',
  `got ${t3.status} ${JSON.stringify(t3.body).slice(0,200)}`);

// 4. Cannot tip same booking twice
console.log('\n=== 4. Double tip on same booking → 409 ===');
const t4 = await call(CUST_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: completedBk, amount: 1000, paymentMethod: 'wallet',
});
check(t4.status === 409, 'second tip → 409',
  `got ${t4.status} ${JSON.stringify(t4.body).slice(0,200)}`);

// 5. Cannot tip non-completed booking
console.log('\n=== 5. Tip on requested booking → 409 ===');
const t5 = await call(CUST_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: newBk, amount: 1000, paymentMethod: 'wallet',
});
check(t5.status === 409, 'tip before completion → 409',
  `got ${t5.status}`);

// 6. Cannot tip with insufficient wallet
console.log('\n=== 6. Tip > wallet balance → 400 ===');
// Drain customer wallet
await pg.query(`UPDATE wallets SET available_balance=0 WHERE user_id=$1 AND type='customer'`, [customerId]);
// Need a fresh booking (already-tipped one rejects with 409 before balance check)
const completedBk2 = await makeBooking('completed_by_provider');
const t6 = await call(CUST_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: completedBk2, amount: 1000, paymentMethod: 'wallet',
});
check(t6.status === 400, 'insufficient balance → 400',
  `got ${t6.status} ${JSON.stringify(t6.body).slice(0,200)}`);

// 7. Refill wallet, exceed cap
console.log('\n=== 7. Tip > cap → 400 ===');
await pg.query(`UPDATE wallets SET available_balance=10000000 WHERE user_id=$1 AND type='customer'`, [customerId]);
const t7 = await call(CUST_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: completedBk2, amount: tipMax + 1, paymentMethod: 'wallet',
});
check(t7.status === 400, `tip > cap (${tipMax}) → 400`,
  `got ${t7.status} ${JSON.stringify(t7.body).slice(0,200)}`);

// 8. Non-wallet payment rejected
console.log('\n=== 8. paymentMethod=gcash → 400 (MED-N153) ===');
const t8 = await call(CUST_TOKEN, 'POST', '/api/v1/tips', {
  bookingId: completedBk2, amount: 1000, paymentMethod: 'gcash',
});
check(t8.status === 400, 'gcash tip → 400',
  `got ${t8.status} ${JSON.stringify(t8.body).slice(0,200)}`);

// ════════════════════════════════════════════════════════════════════
// RECURRING AUTO-CHARGE TESTS
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Recurring auto-charge setup ===');

// Create a recurring_bookings row directly (no easy HTTP setup path)
const recurring = await pg.query(
  `INSERT INTO recurring_bookings
     (customer_id, provider_id, category_id, frequency, preferred_day,
      preferred_time, address, barangay, city, province, latitude, longitude,
      service_price, service_fee, total_amount, next_booking_date)
   VALUES ($1, $2, $3, 'weekly', 1, '10:00:00',
           'Test Address', 'Manoc-Manoc', 'Malay', 'Aklan', 11.97, 121.92,
           $4, 0, $4, CURRENT_DATE + 7)
   RETURNING id`,
  [customerId, providerId, categoryId, TOTAL]);
const recurringId = recurring.rows[0].id;

// 9. Set auto-charge method via PUT
console.log('\n=== 9. PUT auto-charge → method stored ===');
const set9 = await call(CUST_TOKEN, 'PUT', `/api/v1/recurring/${recurringId}/auto-charge`, {
  paymentMethodId: 'pm_phase25c_test',
  paymentMethodLabel: 'Visa •••• 4242',
});
check([200, 204].includes(set9.status), 'PUT auto-charge → 2xx',
  `got ${set9.status} ${JSON.stringify(set9.body).slice(0,200)}`);
const r9db = await pg.query(
  `SELECT payment_method_id, payment_method_label FROM recurring_bookings WHERE id=$1`,
  [recurringId]);
check(r9db.rows[0]?.payment_method_id === 'pm_phase25c_test',
  'payment_method_id stored');
check(r9db.rows[0]?.payment_method_label === 'Visa •••• 4242',
  'payment_method_label stored');

// 10. Other customer cannot set
console.log('\n=== 10. Wrong customer PUT auto-charge → 404 ===');
const set10 = await call(OTHER_TOKEN, 'PUT', `/api/v1/recurring/${recurringId}/auto-charge`, {
  paymentMethodId: 'pm_x', paymentMethodLabel: 'wrong customer',
});
check(set10.status === 404, 'wrong customer → 404 (no leak)',
  `got ${set10.status} ${JSON.stringify(set10.body).slice(0,200)}`);

// 11. Idempotent set
console.log('\n=== 11. Idempotent re-set ===');
const set11 = await call(CUST_TOKEN, 'PUT', `/api/v1/recurring/${recurringId}/auto-charge`, {
  paymentMethodId: 'pm_phase25c_test',
  paymentMethodLabel: 'Visa •••• 4242',
});
check([200, 204].includes(set11.status), 'idempotent re-set → 2xx');

// 12. DELETE auto-charge
console.log('\n=== 12. DELETE auto-charge → method cleared ===');
const del12 = await call(CUST_TOKEN, 'DELETE', `/api/v1/recurring/${recurringId}/auto-charge`);
check([200, 204].includes(del12.status), 'DELETE → 2xx',
  `got ${del12.status}`);
const r12db = await pg.query(
  `SELECT payment_method_id, payment_method_label, auto_charge_status
     FROM recurring_bookings WHERE id=$1`, [recurringId]);
check(r12db.rows[0]?.payment_method_id === null, 'payment_method_id NULL after delete');
check(r12db.rows[0]?.payment_method_label === null, 'label NULL after delete');

// 13. Wrong customer delete
console.log('\n=== 13. Wrong customer DELETE → 404 ===');
const del13 = await call(OTHER_TOKEN, 'DELETE', `/api/v1/recurring/${recurringId}/auto-charge`);
check(del13.status === 404, 'wrong customer DELETE → 404',
  `got ${del13.status}`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM tips WHERE booking_id IN ($1, $2)`, [completedBk, completedBk2]);
await pg.query(`DELETE FROM notifications WHERE user_id IN ($1, $2)`, [customerId, provUserId]);
await pg.query(`DELETE FROM wallet_transactions WHERE booking_id IN ($1, $2, $3)`, [completedBk, completedBk2, newBk]);
await pg.query(`DELETE FROM recurring_bookings WHERE id=$1`, [recurringId]);
await pg.query(`DELETE FROM bookings WHERE id IN ($1, $2, $3)`, [completedBk, completedBk2, newBk]);
await pg.query(`DELETE FROM wallets WHERE user_id IN ($1, $2)`, [customerId, provUserId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [customerId, otherCustomerId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
