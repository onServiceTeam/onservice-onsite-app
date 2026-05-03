// Phase 29a — Suki rewards / loyalty discount end-to-end.
//
// Tier table (platform_settings.suki_tiers):
//   new        ≥0 bookings: 1 pt/peso, 0% discount
//   regular    ≥3 bookings: 1 pt/peso, 0% discount
//   suki       ≥10 bookings: 2 pt/peso, 5% discount
//   super_suki ≥25 bookings: 3 pt/peso, 10% discount
//
// Coverage:
//   1. recordBookingForSuki creates membership + points earned
//   2. Tier transitions fire correctly (3→regular, 10→suki, 25→super_suki)
//   3. Tier-up bonus points awarded + 'Suki Tier Up!' notification
//   4. calculateSukiDiscountForBooking returns the right discount per tier
//   5. redeemPoints: amountCredited = points / pointsToPesoRate (CRIT-N127)
//   6. redeemPoints: insufficient balance → 400
//   7. redeemPoints: not multiple of POINTS_REDEMPTION_MIN_MULTIPLE → 400
//   8. redeemPoints: race-safe (concurrent redemption — only one wins)
//   9. GET /suki/memberships lists customer's memberships
//  10. GET /suki/memberships/:id/rewards returns reward history
//  11. POST /suki/redeem credits wallet correctly
//  12. Wrong customer cannot view another's rewards → 403

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

const sukiSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/suki.service.ts')
).href);

// ════════════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29a', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const other = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29a', 'Other') RETURNING id`, [phoneOther]);
const otherId = other.rows[0].id;
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P29a', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'p29a prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;

await pg.query(
  `INSERT INTO wallets (user_id, type, available_balance, pending_balance)
   VALUES ($1, 'customer', 0, 0) ON CONFLICT DO NOTHING`, [customerId]);

const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const OTHER_TOKEN = jwt.sign(
  { userId: otherId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

async function makeBooking() {
  const r = await pg.query(
    `INSERT INTO bookings
       (customer_id, provider_id, category_id, status, total_amount,
        service_price, service_fee, address, barangay, city, province,
        latitude, longitude, scheduled_at, escrow_status)
     VALUES ($1, $2, $3, 'paid_out', 100000, 100000, 0,
             'a','a','a','a',11.97,121.92, NOW() - INTERVAL '1 day', 'released')
     RETURNING id`,
    [customerId, providerId, categoryId]);
  return r.rows[0].id;
}

// ════════════════════════════════════════════════════════════════════
// 1. recordBookingForSuki creates membership at tier=new
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. recordBookingForSuki creates membership ===');
const bk1 = await makeBooking();
const r1 = await sukiSvc.recordBookingForSuki(customerId, providerId, bk1, 100000);
check(r1.membership.tier === 'new', `tier=new (got ${r1.membership.tier})`);
check(Number(r1.membership.total_bookings) === 1, 'total_bookings=1');
check(Number(r1.membership.total_spent) === 100000, 'total_spent=100000');
check(r1.pointsEarned === 1000, `pointsEarned=1000 (1pt/peso × 1000 pesos = 1000)`,
  `got ${r1.pointsEarned}`);
check(r1.tierChanged === false, 'tierChanged=false (still new)');

// ════════════════════════════════════════════════════════════════════
// 2. Tier transitions: 3 → regular, 10 → suki, 25 → super_suki
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Tier transitions ===');
// Already have 1 booking. Drive to 3 → regular tier
for (let i = 0; i < 2; i++) {
  await sukiSvc.recordBookingForSuki(customerId, providerId, await makeBooking(), 100000);
}
const m3 = await pg.query(
  `SELECT tier, total_bookings, points_balance FROM suki_memberships
    WHERE customer_id=$1 AND provider_id=$2`, [customerId, providerId]);
check(m3.rows[0]?.tier === 'regular',
  `after 3 bookings tier=regular (got ${m3.rows[0]?.tier})`);

// Drive to 10 → suki
for (let i = 0; i < 7; i++) {
  await sukiSvc.recordBookingForSuki(customerId, providerId, await makeBooking(), 100000);
}
const m10 = await pg.query(
  `SELECT tier FROM suki_memberships WHERE customer_id=$1 AND provider_id=$2`,
  [customerId, providerId]);
check(m10.rows[0]?.tier === 'suki',
  `after 10 bookings tier=suki (got ${m10.rows[0]?.tier})`);

// Drive to 25 → super_suki
for (let i = 0; i < 15; i++) {
  await sukiSvc.recordBookingForSuki(customerId, providerId, await makeBooking(), 100000);
}
const m25 = await pg.query(
  `SELECT tier, total_bookings, points_balance FROM suki_memberships
    WHERE customer_id=$1 AND provider_id=$2`, [customerId, providerId]);
check(m25.rows[0]?.tier === 'super_suki',
  `after 25 bookings tier=super_suki (got ${m25.rows[0]?.tier})`);

// ════════════════════════════════════════════════════════════════════
// 3. Tier-up bonus + notification
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Tier-up bonus points + notification ===');
const tierUpRewards = await pg.query(
  `SELECT type, points, description FROM suki_rewards
    WHERE membership_id=(SELECT id FROM suki_memberships WHERE customer_id=$1 AND provider_id=$2)
      AND type='bonus'`, [customerId, providerId]);
check(tierUpRewards.rows.length === 3, `3 tier-up bonus rows (got ${tierUpRewards.rows.length})`);

const tierNotifs = await pg.query(
  `SELECT type, title, data FROM notifications
    WHERE user_id=$1 AND type='suki' AND title='Suki Tier Up!'`, [customerId]);
check(tierNotifs.rows.length === 3, `3 tier-up notifications (got ${tierNotifs.rows.length})`);

// ════════════════════════════════════════════════════════════════════
// 4. calculateSukiDiscountForBooking returns right discount per tier
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. calculateSukiDiscountForBooking ===');
const disc = await sukiSvc.calculateSukiDiscountForBooking(customerId, providerId, 100000);
check(disc.discountPercent === 10 && disc.discountAmount === 10000,
  `super_suki: 10% / 10000 centavos discount`,
  `got ${JSON.stringify(disc)}`);

// ════════════════════════════════════════════════════════════════════
// 5. redeemPoints: amountCredited = points / 100 (CRIT-N127)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. redeemPoints amountCredited correct ===');
const balBefore = await pg.query(`SELECT points_balance FROM suki_memberships WHERE customer_id=$1 AND provider_id=$2`, [customerId, providerId]);
const m1 = await pg.query(`SELECT id FROM suki_memberships WHERE customer_id=$1 AND provider_id=$2`, [customerId, providerId]);
const membershipId = m1.rows[0].id;
const walletBefore = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);

const POINTS = 200;  // multiple of 100
const r5 = await sukiSvc.redeemPoints(customerId, membershipId, POINTS);
check(r5.amountCredited === 2, `redeem 200 points → ₱2 credit (got ${r5.amountCredited})`);
check(r5.remainingPoints === Number(balBefore.rows[0].points_balance) - POINTS,
  'points_balance decremented exactly');

const walletAfter = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
check(Number(walletAfter.rows[0].available_balance) === Number(walletBefore.rows[0].available_balance) + 2,
  `customer wallet credited ₱2 = 200 centavos (got delta=${Number(walletAfter.rows[0].available_balance) - Number(walletBefore.rows[0].available_balance)})`);

// ════════════════════════════════════════════════════════════════════
// 6. Insufficient balance → error
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Insufficient points → 400 ===');
let threw6 = false;
try {
  await sukiSvc.redeemPoints(customerId, membershipId, 999_999_900);
} catch (e) { threw6 = true; }
check(threw6, 'insufficient balance throws');

// ════════════════════════════════════════════════════════════════════
// 7. Not multiple of 100 → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Non-multiple → throws ===');
let threw7 = false;
try {
  await sukiSvc.redeemPoints(customerId, membershipId, 150);
} catch (e) { threw7 = true; }
check(threw7, 'non-multiple of 100 throws');

// ════════════════════════════════════════════════════════════════════
// 8. Concurrent redemption — only one wins
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Concurrent redemption race-safe ===');
const balBefore8 = await pg.query(`SELECT points_balance FROM suki_memberships WHERE id=$1`, [membershipId]);
const beforePts = Number(balBefore8.rows[0].points_balance);
// Drain to exactly 100 points
const drainBy = beforePts - 100;
if (drainBy > 0 && drainBy % 100 === 0) {
  await sukiSvc.redeemPoints(customerId, membershipId, drainBy);
}
const balExact = await pg.query(`SELECT points_balance FROM suki_memberships WHERE id=$1`, [membershipId]);
check(Number(balExact.rows[0].points_balance) === 100, `exactly 100 points left (got ${balExact.rows[0].points_balance})`);

// Fire 5 parallel 100-point redeems — only 1 should succeed
const settled = await Promise.allSettled([
  sukiSvc.redeemPoints(customerId, membershipId, 100),
  sukiSvc.redeemPoints(customerId, membershipId, 100),
  sukiSvc.redeemPoints(customerId, membershipId, 100),
  sukiSvc.redeemPoints(customerId, membershipId, 100),
  sukiSvc.redeemPoints(customerId, membershipId, 100),
]);
const fulfilled = settled.filter(s => s.status === 'fulfilled');
const rejected = settled.filter(s => s.status === 'rejected');
check(fulfilled.length === 1, `exactly 1 of 5 redeems succeeded (got ${fulfilled.length})`,
  rejected[0]?.reason?.message);
check(rejected.length === 4, `exactly 4 of 5 rejected`);
const balAfter8 = await pg.query(`SELECT points_balance FROM suki_memberships WHERE id=$1`, [membershipId]);
check(Number(balAfter8.rows[0].points_balance) === 0,
  `final balance = 0 (got ${balAfter8.rows[0].points_balance})`);

// ════════════════════════════════════════════════════════════════════
// 9. GET /suki/memberships
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. GET /suki/memberships ===');
const r9 = await call(CUST_TOKEN, 'GET', '/api/v1/suki/memberships');
check(r9.status === 200, `→ 200 (got ${r9.status})`);
const memberships = r9.body?.data ?? [];
check(memberships.some(m => m.id === membershipId),
  'customer\'s membership appears in list');

// ════════════════════════════════════════════════════════════════════
// 10. GET /suki/memberships/:id/rewards
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. GET membership rewards ===');
const r10 = await call(CUST_TOKEN, 'GET', `/api/v1/suki/memberships/${membershipId}/rewards`);
check(r10.status === 200, `→ 200 (got ${r10.status})`);
check(Array.isArray(r10.body?.data) && r10.body.data.length > 0,
  `rewards returned (got ${r10.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 11. POST /suki/redeem (HTTP path)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. POST /suki/redeem (HTTP) ===');
// Earn more points first by recording another booking
await sukiSvc.recordBookingForSuki(customerId, providerId, await makeBooking(), 100000);
// At super_suki, 1000 pesos earns 1000 * 3 = 3000 points
const r11 = await call(CUST_TOKEN, 'POST', '/api/v1/suki/redeem', {
  membershipId, points: 200,
});
check(r11.status === 200, `→ 200 (got ${r11.status})`,
  JSON.stringify(r11.body).slice(0,200));
check(r11.body?.data?.amountCredited === 2, `amountCredited=2 (got ${r11.body?.data?.amountCredited})`);

// ════════════════════════════════════════════════════════════════════
// 12. Wrong customer cannot view rewards → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Other customer GET rewards → 403 ===');
const r12 = await call(OTHER_TOKEN, 'GET', `/api/v1/suki/memberships/${membershipId}/rewards`);
check(r12.status === 403, `→ 403 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM notifications WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM suki_rewards WHERE membership_id=$1`, [membershipId]);
await pg.query(`DELETE FROM suki_memberships WHERE id=$1`, [membershipId]);
await pg.query(`DELETE FROM wallet_transactions WHERE wallet_id IN
                  (SELECT id FROM wallets WHERE user_id=$1)`, [customerId]);
await pg.query(`DELETE FROM bookings WHERE customer_id=$1`, [customerId]);
await pg.query(`DELETE FROM wallets WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [customerId, otherId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
