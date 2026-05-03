// Phase 29b — promo code redemption flow.
//
// Coverage:
//   1. Admin creates promo via POST /admin/marketing/promos
//   2. resolvePromo returns canonical discount in centavos
//      a. percentage: floor(subtotal * pct/100)
//      b. fixed_centavos: literal value
//   3. max_discount_centavos cap honored
//   4. minimum_order_centavos floor enforced → promo_min_order_not_met
//   5. Inactive promo → promo_invalid
//   6. Expired (valid_until past) → promo_invalid
//   7. Future-dated (valid_from future) → promo_invalid
//   8. usage_limit_total exceeded → promo_exhausted
//   9. usage_limit_per_customer exceeded → promo_exhausted (MED-N154)
//  10. recordPromoRedemption inserts a row + idempotent on dup
//  11. discountCents capped at subtotal (never exceeds it)
//  12. Bogus code → promo_invalid

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const REPO_ROOT = process.cwd();
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

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

const SUPER_TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const promoSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/booking/promo.service.ts')
).href);

// ════════════════════════════════════════════════════════════════════
// Setup: 2 customers, the unique promo codes for this run
// ════════════════════════════════════════════════════════════════════
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29b', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const cust2 = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29b', 'Cust2') RETURNING id`, [phoneOther]);
const otherCustomerId = cust2.rows[0].id;

const TS = Date.now().toString().slice(-6);

// ════════════════════════════════════════════════════════════════════
// 1. Admin creates promo via POST /admin/marketing/promos
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Admin creates 10% promo ===');
const r1 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/marketing/promos', {
  code: 'P29B_PCT_' + TS,
  discountType: 'percentage',
  discountValue: 10,
  minimumOrderCentavos: 50000,  // ₱500 minimum
  maxDiscountCentavos: 20000,   // ₱200 cap
  usageLimitPerCustomer: 1,
  usageLimitTotal: 5,
});
check(r1.status === 201, `create promo → 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
const pctPromoCode = 'P29B_PCT_' + TS;
const pctPromoId = r1.body?.data?.id;

// 2a. Percentage promo applied to ₱1000 → ₱100 discount (under ₱200 cap)
console.log('\n=== 2a. Percentage promo: 10% of 100000 = 10000 ===');
const d2a = await promoSvc.resolvePromo({ code: pctPromoCode, subtotalCents: 100000, userId: customerId });
check(d2a === 10000, `discount = 10000 (got ${d2a})`);

// ════════════════════════════════════════════════════════════════════
// 2b. Fixed-amount promo
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2b. Fixed promo: ₱150 off ===');
const fixedCode = 'P29B_FIX_' + TS;
const r2b = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/marketing/promos', {
  code: fixedCode,
  discountType: 'fixed_centavos',
  discountValue: 15000,        // ₱150
  minimumOrderCentavos: 0,
  usageLimitPerCustomer: 5,
});
check(r2b.status === 201, `create fixed promo → 201`);
const d2b = await promoSvc.resolvePromo({ code: fixedCode, subtotalCents: 100000, userId: customerId });
check(d2b === 15000, `discount = 15000 (got ${d2b})`);

// ════════════════════════════════════════════════════════════════════
// 3. max_discount_centavos cap
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Discount capped at max_discount_centavos ===');
// 10% of ₱5000 = ₱500, but cap is ₱200
const d3 = await promoSvc.resolvePromo({ code: pctPromoCode, subtotalCents: 500000, userId: customerId });
check(d3 === 20000, `capped at 20000 (got ${d3})`);

// ════════════════════════════════════════════════════════════════════
// 4. minimum_order floor
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Below minimum_order → promo_min_order_not_met ===');
let err4 = null;
try {
  await promoSvc.resolvePromo({ code: pctPromoCode, subtotalCents: 1000, userId: customerId });
} catch (e) { err4 = e; }
check(err4 !== null && err4.message?.includes('promo_min_order_not_met'),
  `throws promo_min_order_not_met (got ${err4?.message})`);

// ════════════════════════════════════════════════════════════════════
// 5. Inactive promo
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Inactive promo → promo_invalid ===');
const inactiveCode = 'P29B_INA_' + TS;
await pg.query(
  `INSERT INTO promo_codes (code, discount_type, discount_value, active, created_by)
   VALUES ($1, 'percentage', 5, FALSE, $2)`,
  [inactiveCode, SUPER_ADMIN_ID]);
let err5 = null;
try {
  await promoSvc.resolvePromo({ code: inactiveCode, subtotalCents: 100000, userId: customerId });
} catch (e) { err5 = e; }
check(err5?.message?.includes('promo_invalid'),
  `throws promo_invalid (got ${err5?.message})`);

// ════════════════════════════════════════════════════════════════════
// 6. Expired promo
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Expired promo → promo_invalid ===');
const expiredCode = 'P29B_EXP_' + TS;
await pg.query(
  `INSERT INTO promo_codes (code, discount_type, discount_value, valid_until, created_by)
   VALUES ($1, 'percentage', 10, NOW() - INTERVAL '1 hour', $2)`,
  [expiredCode, SUPER_ADMIN_ID]);
let err6 = null;
try {
  await promoSvc.resolvePromo({ code: expiredCode, subtotalCents: 100000, userId: customerId });
} catch (e) { err6 = e; }
check(err6?.message?.includes('promo_invalid'), 'expired promo throws promo_invalid');

// ════════════════════════════════════════════════════════════════════
// 7. Future-dated promo
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Future-dated valid_from → promo_invalid ===');
const futureCode = 'P29B_FUT_' + TS;
await pg.query(
  `INSERT INTO promo_codes (code, discount_type, discount_value, valid_from, created_by)
   VALUES ($1, 'percentage', 10, NOW() + INTERVAL '1 day', $2)`,
  [futureCode, SUPER_ADMIN_ID]);
let err7 = null;
try {
  await promoSvc.resolvePromo({ code: futureCode, subtotalCents: 100000, userId: customerId });
} catch (e) { err7 = e; }
check(err7?.message?.includes('promo_invalid'), 'future promo throws promo_invalid');

// ════════════════════════════════════════════════════════════════════
// 8. usage_limit_total exceeded
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. usage_limit_total exceeded → promo_exhausted ===');
// Create a code with usage_limit_total=1 + times_used=1
const exhaustedCode = 'P29B_EXH_' + TS;
await pg.query(
  `INSERT INTO promo_codes (code, discount_type, discount_value, usage_limit_total, times_used, created_by)
   VALUES ($1, 'percentage', 10, 1, 1, $2)`,
  [exhaustedCode, SUPER_ADMIN_ID]);
let err8 = null;
try {
  await promoSvc.resolvePromo({ code: exhaustedCode, subtotalCents: 100000, userId: customerId });
} catch (e) { err8 = e; }
check(err8?.message?.includes('promo_exhausted'),
  `total-exhausted throws promo_exhausted (got ${err8?.message})`);

// ════════════════════════════════════════════════════════════════════
// 9. usage_limit_per_customer enforcement (MED-N154)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Per-customer limit enforced (MED-N154) ===');
// Need real bookings for the FK on promo_redemptions.booking_id.
const catRes = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = catRes.rows[0].id;
async function makeBooking() {
  const r = await pg.query(
    `INSERT INTO bookings
       (customer_id, category_id, status, total_amount, service_price, service_fee,
        address, barangay, city, province, latitude, longitude, scheduled_at, escrow_status)
     VALUES ($1, $2, 'paid_out', 100000, 100000, 0,
             'a','a','a','a',11.97,121.92, NOW(), 'released')
     RETURNING id`,
    [customerId, categoryId]);
  return r.rows[0].id;
}
const bk9 = await makeBooking();
// pctPromoCode has usage_limit_per_customer=1. Insert a redemption row so
// the customer has used it once.
await pg.query(
  `INSERT INTO promo_redemptions (promo_code_id, booking_id, customer_id, discount_centavos)
   VALUES ($1, $2, $3, 10000)
   ON CONFLICT (booking_id, promo_code_id) DO NOTHING`,
  [pctPromoId, bk9, customerId]);
let err9 = null;
try {
  await promoSvc.resolvePromo({ code: pctPromoCode, subtotalCents: 100000, userId: customerId });
} catch (e) { err9 = e; }
check(err9?.message?.includes('promo_exhausted'),
  `customer-limit throws promo_exhausted (got ${err9?.message})`);

// 9b. Different customer can still use it
const d9b = await promoSvc.resolvePromo({ code: pctPromoCode, subtotalCents: 100000, userId: otherCustomerId });
check(d9b === 10000, `other customer still gets discount (got ${d9b})`);

// ════════════════════════════════════════════════════════════════════
// 10. recordPromoRedemption + idempotency
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. recordPromoRedemption inserts + idempotent on dup ===');
// Need a booking for otherCustomerId for the FK.
const bk10 = await pg.query(
  `INSERT INTO bookings
     (customer_id, category_id, status, total_amount, service_price, service_fee,
      address, barangay, city, province, latitude, longitude, scheduled_at, escrow_status)
   VALUES ($1, $2, 'paid_out', 100000, 100000, 0,
           'a','a','a','a',11.97,121.92, NOW(), 'released')
   RETURNING id`, [otherCustomerId, categoryId]);
const bkId = bk10.rows[0].id;
const beforeR = await pg.query(`SELECT COUNT(*)::int AS c FROM promo_redemptions WHERE promo_code_id=$1 AND customer_id=$2`,
  [pctPromoId, otherCustomerId]);
await promoSvc.recordPromoRedemption(pg, {
  promoCodeId: pctPromoId, bookingId: bkId, customerId: otherCustomerId, discountCentavos: 10000,
});
const after1 = await pg.query(`SELECT COUNT(*)::int AS c FROM promo_redemptions WHERE promo_code_id=$1 AND customer_id=$2`,
  [pctPromoId, otherCustomerId]);
check(after1.rows[0].c === beforeR.rows[0].c + 1, 'redemption row inserted');

// Re-call with same booking — ON CONFLICT DO NOTHING should leave count unchanged
await promoSvc.recordPromoRedemption(pg, {
  promoCodeId: pctPromoId, bookingId: bkId, customerId: otherCustomerId, discountCentavos: 10000,
});
const after2 = await pg.query(`SELECT COUNT(*)::int AS c FROM promo_redemptions WHERE promo_code_id=$1 AND customer_id=$2`,
  [pctPromoId, otherCustomerId]);
check(after2.rows[0].c === after1.rows[0].c, 'idempotent: re-insert same booking is no-op');

// ════════════════════════════════════════════════════════════════════
// 11. discountCents capped at subtotal
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Fixed promo > subtotal capped at subtotal ===');
// fixed promo is ₱150 = 15000 centavos. Subtotal = 5000 → discount = 5000 not 15000
// Use other customer who hasn't used it yet
const otherCust2 = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29b', 'Cust3') RETURNING id`,
  ['+63917' + (1000000 + Math.floor(Math.random()*8999999))]);
const otherCustomerId2 = otherCust2.rows[0].id;
const d11 = await promoSvc.resolvePromo({ code: fixedCode, subtotalCents: 5000, userId: otherCustomerId2 });
check(d11 === 5000, `discount capped at subtotal (got ${d11})`);

// ════════════════════════════════════════════════════════════════════
// 12. Bogus code
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Bogus code → promo_invalid ===');
let err12 = null;
try {
  await promoSvc.resolvePromo({ code: 'NOTACODE_XYZ', subtotalCents: 100000, userId: customerId });
} catch (e) { err12 = e; }
check(err12?.message?.includes('promo_invalid'), 'bogus code → promo_invalid');

// 12b. Empty code
let err12b = null;
try {
  await promoSvc.resolvePromo({ code: '', subtotalCents: 100000, userId: customerId });
} catch (e) { err12b = e; }
check(err12b?.message?.includes('promo_invalid'), 'empty code → promo_invalid');

// 12c. Negative subtotal
let err12c = null;
try {
  await promoSvc.resolvePromo({ code: fixedCode, subtotalCents: -100, userId: customerId });
} catch (e) { err12c = e; }
check(err12c?.message?.includes('promo_invalid'), 'negative subtotal → promo_invalid');

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM promo_redemptions WHERE promo_code_id IN
  (SELECT id FROM promo_codes WHERE code LIKE 'P29B_%' || $1)`, [TS]);
await pg.query(`DELETE FROM promo_codes WHERE code LIKE 'P29B_%' || $1`, [TS]);
await pg.query(`DELETE FROM bookings WHERE customer_id IN ($1, $2, $3)`,
  [customerId, otherCustomerId, otherCustomerId2]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`,
  [customerId, otherCustomerId, otherCustomerId2]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
