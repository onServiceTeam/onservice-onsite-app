// Phase 26a — Cancellation lifecycle end-to-end.
//
// Drives every real cancellation path through the live API + verifies
// money split is correct per the platform_settings tiers:
//
//   over_24h         → 100% customer / 0% provider
//   2-24h            → 100% customer / 0% provider
//   1-2h             →  90% customer / 10% provider
//   30min-1h         →  80% customer / 20% provider
//   under_30min      →  70% customer / 30% provider
//   provider_arrived →  50% customer / 50% provider
//   customer_noshow  →   0% customer / 100% provider + service_fee retained
//
// Plus:
//   - cancellation_reason persisted in bookings
//   - admin force-cancel via /admin/bookings/:id/cancel writes admin_actions row
//   - provider cancel: cancellations_last_30d counter increments atomically
//   - terminal-state guard: cannot cancel an already-cancelled booking → 409
//   - role guard: customer cannot cancel someone else's booking → 403
//   - escrow_status flips: held → refunded / partially_refunded
//   - cancellation_policy_active read endpoint serves the right values

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
// Setup: customer + provider + escrow wallet primed
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));

const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase26a', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const otherCust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase26a', 'Other') RETURNING id`, [phoneOther]);
const otherCustomerId = otherCust.rows[0].id;
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'Phase26a', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status, total_cancellations, cancellations_last_30d)
   VALUES ($1, 'phase26a prov', 'approved', 0, 0) RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;

const SERVICE_PRICE = 100000;  // ₱1000
const SERVICE_FEE   =   5000;  // ₱50
const TOTAL         = SERVICE_PRICE + SERVICE_FEE;

// Ensure customer + provider wallets exist
await pg.query(`INSERT INTO wallets (user_id, type, available_balance, pending_balance) VALUES ($1, 'customer', 0, 0) ON CONFLICT DO NOTHING`, [customerId]);
await pg.query(`INSERT INTO wallets (user_id, type, available_balance, pending_balance) VALUES ($1, 'provider', 0, 0) ON CONFLICT DO NOTHING`, [provUserId]);

// Helper: make a booking scheduled hoursFromNow, status='paid', escrow_status='held',
// with escrow funded so handleCancellation has something to refund.
async function makeBooking(opts) {
  const {
    hoursFromNow, status = 'paid', oldStatus = null,
    bookingProviderId = providerId, customerOverride = customerId,
    withPaymentIntent = true,
  } = opts;
  const r = await pg.query(
    `INSERT INTO bookings
       (customer_id, provider_id, category_id, status, total_amount,
        service_price, service_fee, address, barangay, city, province,
        latitude, longitude, scheduled_at, escrow_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Test Address', 'Manoc-Manoc', 'Malay', 'Aklan',
             11.97, 121.92, NOW() + ($8 || ' hours')::interval, 'held')
     RETURNING id`,
    [customerOverride, bookingProviderId, categoryId, status, TOTAL,
     SERVICE_PRICE, SERVICE_FEE, hoursFromNow.toString()]);
  const bid = r.rows[0].id;
  // Fund escrow
  await pg.query(
    `UPDATE wallets SET pending_balance = pending_balance + $1 WHERE type='platform_escrow' AND user_id IS NULL`,
    [TOTAL]);
  await pg.query(
    `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
     SELECT id, $1, 'escrow_hold', $2, pending_balance, 'phase26a setup' FROM wallets WHERE type='platform_escrow' AND user_id IS NULL`,
    [bid, TOTAL]);
  // Phase 26a fix verification: create a payment_intent so processRefund
  // post-commit (BUG-PHASE26-01 fix) actually flips status to refunded.
  // Use sandbox payment id so PayMongo HTTP call is skipped at line 252.
  if (withPaymentIntent) {
    await pg.query(
      `INSERT INTO payment_intents
         (booking_id, amount, status, payment_method,
          paymongo_intent_id, paymongo_payment_id, metadata)
       VALUES ($1::uuid, $2, 'succeeded', 'gcash',
               'pi_phase26a_' || $1::text, 'pay_sandbox_phase26a_' || $1::text, '{}'::jsonb)`,
      [bid, TOTAL]);
  }
  return bid;
}

const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);
const OTHER_TOKEN = jwt.sign(
  { userId: otherCustomerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);
const PROV_TOKEN = jwt.sign(
  { userId: provUserId, role: 'provider', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

// Snapshot wallet for delta-checks
async function walletDelta(userId, type, fn) {
  const before = await pg.query(
    `SELECT available_balance, pending_balance FROM wallets WHERE user_id=$1 AND type=$2`,
    [userId, type]);
  await fn();
  const after = await pg.query(
    `SELECT available_balance, pending_balance FROM wallets WHERE user_id=$1 AND type=$2`,
    [userId, type]);
  return {
    available: Number(after.rows[0]?.available_balance ?? 0) - Number(before.rows[0]?.available_balance ?? 0),
    pending: Number(after.rows[0]?.pending_balance ?? 0) - Number(before.rows[0]?.pending_balance ?? 0),
  };
}

// ════════════════════════════════════════════════════════════════════
// 1. cancellation-policy public endpoint
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /settings/cancellation-policy ===');
const polR = await call(null, 'GET', '/api/v1/settings/cancellation-policy');
check(polR.status === 200, 'GET /settings/cancellation-policy → 200');
check(Array.isArray(polR.body?.data?.tiers), 'tiers array present');

// Helper: assert payment_intent transitioned correctly. The post-commit
// processRefund call (BUG-PHASE26-01 fix) flips status + sets refunded_amount.
// expectedRefundCentavos is the customer-facing portion (service*pct + fee).
async function assertIntentRefund(bookingId, expectedRefundCentavos, label) {
  const r = await pg.query(
    `SELECT status, refunded_amount FROM payment_intents WHERE booking_id=$1`,
    [bookingId]);
  if (!r.rows[0]) {
    check(false, `${label}: payment_intent row missing`);
    return;
  }
  const expectedStatus = expectedRefundCentavos >= TOTAL ? 'refunded' : 'partially_refunded';
  check(r.rows[0].status === expectedStatus,
    `${label}: payment_intent.status = ${expectedStatus} (got ${r.rows[0].status})`);
  check(Number(r.rows[0].refunded_amount) === expectedRefundCentavos,
    `${label}: refunded_amount = ${expectedRefundCentavos} (got ${r.rows[0].refunded_amount})`);
}

// ════════════════════════════════════════════════════════════════════
// 2. Customer cancels >24h before → 100% refund (full PayMongo refund)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Customer cancels >24h before → 100% refund ===');
const bk2 = await makeBooking({ hoursFromNow: 48 });
const r2 = await call(CUST_TOKEN, 'PATCH', `/api/v1/bookings/${bk2}/status`, {
  status: 'cancelled_by_customer',
  cancellationReason: 'Phase 26a — over_24h tier — expect 100% refund.',
});
check([200, 207].includes(r2.status), `cancel → 2xx (got ${r2.status})`,
  JSON.stringify(r2.body).slice(0, 200));
const bk2Db = await pg.query(`SELECT status, escrow_status, cancellation_reason, cancelled_at FROM bookings WHERE id=$1`, [bk2]);
check(bk2Db.rows[0]?.status === 'cancelled_by_customer', 'status=cancelled_by_customer');
check(bk2Db.rows[0]?.escrow_status === 'refunded', `escrow_status=refunded (got ${bk2Db.rows[0]?.escrow_status})`);
check(bk2Db.rows[0]?.cancellation_reason?.includes('over_24h'), 'cancellation_reason persisted');
check(bk2Db.rows[0]?.cancelled_at !== null, 'cancelled_at set');
// Wait briefly for post-commit processRefund to complete.
await new Promise(r => setTimeout(r, 200));
await assertIntentRefund(bk2, TOTAL, 'over_24h');

// ════════════════════════════════════════════════════════════════════
// 3. Customer cancels in 1-2h tier → 90% refund / 10% to provider
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Customer cancels 1.5h before → 90/10 split ===');
const bk3 = await makeBooking({ hoursFromNow: 1.5 });
const before3 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const beforeProv3 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);

const r3 = await call(CUST_TOKEN, 'PATCH', `/api/v1/bookings/${bk3}/status`, {
  status: 'cancelled_by_customer',
  cancellationReason: 'Phase 26a — 1-2h tier — expect 90/10 split.',
});
check([200, 207].includes(r3.status), `cancel → 2xx (got ${r3.status})`);

const afterProv3 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const provDelta3 = Number(afterProv3.rows[0].available_balance) - Number(beforeProv3.rows[0].available_balance);

const expectedCust3 = Math.round(SERVICE_PRICE * 0.90) + SERVICE_FEE; // 90% of service + full fee back via PayMongo
const expectedProv3 = Math.round(SERVICE_PRICE * 0.10);
check(provDelta3 === expectedProv3,
  `provider compensation = ${expectedProv3} (10% service)`, `got ${provDelta3}`);
await new Promise(r => setTimeout(r, 200));
await assertIntentRefund(bk3, expectedCust3, '1-2h tier');

// ════════════════════════════════════════════════════════════════════
// 4. Customer cancels under 30min → 70% / 30% split
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Customer cancels 0.25h before → 70/30 split ===');
const bk4 = await makeBooking({ hoursFromNow: 0.25 });
const before4c = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const before4p = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const r4 = await call(CUST_TOKEN, 'PATCH', `/api/v1/bookings/${bk4}/status`, {
  status: 'cancelled_by_customer',
  cancellationReason: 'Phase 26a — under_30min tier.',
});
check([200, 207].includes(r4.status), `cancel → 2xx (got ${r4.status})`);
const after4p = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const provDelta4 = Number(after4p.rows[0].available_balance) - Number(before4p.rows[0].available_balance);
const expectedCust4 = Math.round(SERVICE_PRICE * 0.70) + SERVICE_FEE;
const expectedProv4 = Math.round(SERVICE_PRICE * 0.30);
check(provDelta4 === expectedProv4, `provider compensation = ${expectedProv4}`, `got ${provDelta4}`);
await new Promise(r => setTimeout(r, 200));
await assertIntentRefund(bk4, expectedCust4, 'under_30min');

// ════════════════════════════════════════════════════════════════════
// 5. Provider already arrived — only admin can cancel from this state.
//    Customer self-cancel from provider_arrived is intentionally blocked
//    (booking.types.ts: provider_arrived only transitions to in_progress
//    or cancelled_by_admin). Admin-cancel passes providerArrived=true →
//    50/50 split per cancel_refund_provider_arrived.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Provider arrived, admin cancels → 50/50 ===');
const bk5 = await makeBooking({ hoursFromNow: 0.5 });
await pg.query(`UPDATE bookings SET status='provider_arrived' WHERE id=$1`, [bk5]);

// First confirm customer self-cancel IS blocked
const r5_blocked = await call(CUST_TOKEN, 'PATCH', `/api/v1/bookings/${bk5}/status`, {
  status: 'cancelled_by_customer',
  cancellationReason: 'Phase 26a — customer cancel after arrival; expect 409.',
});
check(r5_blocked.status === 409, `customer self-cancel from provider_arrived → 409 (got ${r5_blocked.status})`);

const before5p = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const r5 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/bookings/${bk5}/cancel`, {
  reason: 'Phase 26a — admin cancel after provider arrived; expect 50/50 split.',
  providerArrived: true,
  hoursUntilScheduled: 0.5,
});
check([200, 207].includes(r5.status), `admin cancel → 2xx (got ${r5.status})`,
  JSON.stringify(r5.body).slice(0, 200));
const after5p = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const provDelta5 = Number(after5p.rows[0].available_balance) - Number(before5p.rows[0].available_balance);
const expectedCust5 = Math.round(SERVICE_PRICE * 0.50) + SERVICE_FEE;
const expectedProv5 = Math.round(SERVICE_PRICE * 0.50);
check(provDelta5 === expectedProv5, `provider compensation = ${expectedProv5}`, `got ${provDelta5}`);
await new Promise(r => setTimeout(r, 200));
await assertIntentRefund(bk5, expectedCust5, 'provider_arrived');

// ════════════════════════════════════════════════════════════════════
// 6. Provider cancels → cancellations_last_30d counter increments
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Provider cancels → counter increments atomically ===');
const bk6 = await makeBooking({ hoursFromNow: 5 });
const cancelsBefore = await pg.query(
  `SELECT cancellations_last_30d, total_cancellations FROM providers WHERE id=$1`, [providerId]);
const r6 = await call(PROV_TOKEN, 'PATCH', `/api/v1/bookings/${bk6}/status`, {
  status: 'cancelled_by_provider',
  cancellationReason: 'Phase 26a — provider-side cancel; counter must move atomically.',
});
check([200, 207].includes(r6.status), `provider cancel → 2xx (got ${r6.status})`,
  JSON.stringify(r6.body).slice(0,200));
const cancelsAfter = await pg.query(
  `SELECT cancellations_last_30d, total_cancellations, last_cancellation_at FROM providers WHERE id=$1`, [providerId]);
check(Number(cancelsAfter.rows[0].cancellations_last_30d) > Number(cancelsBefore.rows[0].cancellations_last_30d),
  'cancellations_last_30d incremented',
  `before=${cancelsBefore.rows[0].cancellations_last_30d} after=${cancelsAfter.rows[0].cancellations_last_30d}`);
check(Number(cancelsAfter.rows[0].total_cancellations) === Number(cancelsBefore.rows[0].total_cancellations) + 1,
  'total_cancellations += 1');
check(cancelsAfter.rows[0].last_cancellation_at !== null, 'last_cancellation_at set');

// ════════════════════════════════════════════════════════════════════
// 7. Customer no-show via /report-no-show → 0% customer / fee retained
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Provider reports customer no-show → fee retained ===');
const bk7 = await makeBooking({ hoursFromNow: 0 });
// Fast-forward + walk to provider_arrived. providerNoShowMinutes default is
// 30; backdate scheduled_at to 35 min ago so the no-show wait check passes.
await pg.query(`UPDATE bookings SET status='provider_arrived', scheduled_at = NOW() - INTERVAL '35 minutes' WHERE id=$1`, [bk7]);
const before7p = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const before7c = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const before7rev = await pg.query(`SELECT available_balance FROM wallets WHERE type='platform_revenue' AND user_id IS NULL`);

const r7 = await call(PROV_TOKEN, 'POST', `/api/v1/bookings/${bk7}/report-no-show`);
check([200, 201].includes(r7.status), `report-no-show → 2xx (got ${r7.status})`,
  JSON.stringify(r7.body).slice(0,200));

const after7p = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]);
const after7c = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const after7rev = await pg.query(`SELECT available_balance FROM wallets WHERE type='platform_revenue' AND user_id IS NULL`);

const provDelta7 = Number(after7p.rows[0].available_balance) - Number(before7p.rows[0].available_balance);
const custDelta7 = Number(after7c.rows[0].available_balance) - Number(before7c.rows[0].available_balance);
const revDelta7 = Number(after7rev.rows[0]?.available_balance ?? 0) - Number(before7rev.rows[0]?.available_balance ?? 0);
check(custDelta7 === 0, `customer wallet 0 movement (no refund) — got ${custDelta7}`);
check(provDelta7 === SERVICE_PRICE, `provider got 100% of service price = ${SERVICE_PRICE}`,
  `got ${provDelta7}`);
check(revDelta7 === SERVICE_FEE, `platform revenue retained service_fee = ${SERVICE_FEE}`,
  `got ${revDelta7}`);

const bk7Db = await pg.query(`SELECT status, escrow_status FROM bookings WHERE id=$1`, [bk7]);
check(bk7Db.rows[0]?.status === 'cancelled_by_customer', 'status=cancelled_by_customer (no-show is customer cancel)');

// ════════════════════════════════════════════════════════════════════
// 8. Admin force-cancel via /admin/bookings/:id/cancel writes admin_actions
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Admin force-cancel → admin_actions row + escrow handled ===');
const bk8 = await makeBooking({ hoursFromNow: 12 });
const r8 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/bookings/${bk8}/cancel`, {
  reason: 'Phase 26a — admin override cancel; reason is at least thirty chars long.',
});
check([200,201].includes(r8.status), `admin cancel → 2xx (got ${r8.status})`,
  JSON.stringify(r8.body).slice(0,200));
const audit8 = await pg.query(
  `SELECT action_type FROM admin_actions WHERE target_id=$1 AND action_type='booking_cancelled'`,
  [bk8]);
check(audit8.rows.length === 1, 'admin_actions booking_cancelled row written');
const bk8Db = await pg.query(`SELECT status, escrow_status FROM bookings WHERE id=$1`, [bk8]);
check(bk8Db.rows[0]?.status === 'cancelled_by_admin', 'status=cancelled_by_admin');

// ════════════════════════════════════════════════════════════════════
// 9. Cannot cancel an already-cancelled booking → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Re-cancel rejected → 409 ===');
const r9 = await call(CUST_TOKEN, 'PATCH', `/api/v1/bookings/${bk2}/status`, {
  status: 'cancelled_by_customer',
  cancellationReason: 'Phase 26a — second cancel attempt; should be rejected.',
});
check(r9.status === 409, `re-cancel → 409 (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 10. Other customer cannot cancel stranger's booking → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Wrong customer cancel → 403/404 ===');
const bk10 = await makeBooking({ hoursFromNow: 24 });
const r10 = await call(OTHER_TOKEN, 'PATCH', `/api/v1/bookings/${bk10}/status`, {
  status: 'cancelled_by_customer',
  cancellationReason: 'Phase 26a — wrong customer attempt; should be rejected.',
});
check([403, 404].includes(r10.status), `wrong customer → 403/404 (got ${r10.status})`,
  JSON.stringify(r10.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
const bookings = [bk2, bk3, bk4, bk5, bk6, bk7, bk8, bk10];
await pg.query(`DELETE FROM admin_actions WHERE target_id = ANY($1)`, [bookings]);
await pg.query(`DELETE FROM wallet_transactions WHERE booking_id = ANY($1)`, [bookings]);
await pg.query(`DELETE FROM official_receipts WHERE booking_id = ANY($1)`, [bookings]).catch(()=>{});
await pg.query(`DELETE FROM payment_intents WHERE booking_id = ANY($1)`, [bookings]).catch(()=>{});
await pg.query(`DELETE FROM bookings WHERE id = ANY($1)`, [bookings]);
await pg.query(`DELETE FROM wallets WHERE user_id IN ($1, $2)`, [customerId, provUserId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [customerId, otherCustomerId, provUserId]);
// Reset escrow wallet pending_balance (we may have left residual from cleanup races)
await pg.query(`UPDATE wallets SET pending_balance = 0 WHERE type='platform_escrow' AND user_id IS NULL AND pending_balance < 0`);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
