// Booking + escrow + commission end-to-end against real Postgres + API.
//
// Walks through the canonical money path:
//   1. Customer logs in
//   2. Customer creates a booking via POST /bookings
//   3. DB shows the booking + escrow row
//   4. Customer view: /bookings shows the new one
//   5. Provider view: /bookings shows the new one
//   6. Provider accepts the booking (PATCH /:id/status)
//   7. Provider marks in-progress
//   8. Provider marks completed_by_provider
//   9. Customer confirms (PATCH /:id/status to completed)
//  10. DB confirms escrow released to provider's wallet
//  11. Commission deducted at the right tier rate
//
// Budget: this exercises CRIT-N09 (transactional createBooking),
// CRIT-N10 (atomic confirmation flow), CRIT-N04 (escrow money
// conservation), and the commission_rate_* settings.

import { Client } from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const API = 'http://localhost:7381';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

function hashOtp(code, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code + ':' + phone, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

async function loginAs(phone, code) {
  await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [phone]);
  await pg.query(`DELETE FROM security_events WHERE event_type='otp_lockout'`);
  await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [phone]);
  await pg.query(`INSERT INTO otp_codes (phone, code_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [phone, hashOtp(code, phone)]);
  const r = await fetch(API + '/api/v1/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256) },
    body: JSON.stringify({ phone, code }),
  });
  const j = await r.json();
  if (!j.success) throw new Error('login failed: ' + JSON.stringify(j));
  return j.data.accessToken;
}

let pass = 0, fail = 0;
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, extra ?? ''); }
}

async function call(method, url, token, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  return { status: r.status, body: j };
}

console.log('\n=== Booking + escrow + commission e2e ===\n');

const CUSTOMER_PHONE = '+639171234567';
const PROVIDER_PHONE = '+639221234567';
const OTP = '123456';

console.log('1. Login customer + provider');
const custToken = await loginAs(CUSTOMER_PHONE, OTP);
const provToken = await loginAs(PROVIDER_PHONE, OTP);
check(typeof custToken === 'string', 'customer token');
check(typeof provToken === 'string', 'provider token');

// 2. Get IDs
const custUserId = (await pg.query(`SELECT id FROM users WHERE phone=$1`, [CUSTOMER_PHONE])).rows[0].id;
const provUserId = (await pg.query(`SELECT id FROM users WHERE phone=$1`, [PROVIDER_PHONE])).rows[0].id;
const provider = (await pg.query(`SELECT id, tier FROM providers WHERE user_id=$1`, [provUserId])).rows[0];
const PROVIDER_ID = provider.id;
console.log('   customer:', custUserId, 'provider:', PROVIDER_ID, 'tier:', provider.tier);

// 3. Pick a subcategory
const sub = (await pg.query(`SELECT id, category_id, slug, base_price FROM service_subcategories WHERE pricing_type='fixed' AND base_price IS NOT NULL LIMIT 1`)).rows[0];
console.log('   subcategory:', sub.slug, 'base price:', sub.base_price, 'centavos');

// 4. Create address (label must be one of Home/Work/Other)
const addr = await call('POST', '/api/v1/addresses', custToken, {
  label: 'Home',
  fullAddress: '999 E2E Lane',
  barangay: 'Test',
  city: 'Manila',
  province: 'Metro Manila',
  region: 'NCR',
  zipCode: '1000',
});
check(addr.status === 201 || addr.status === 200, 'address created',
  JSON.stringify(addr.body).slice(0, 200));

// 5. Create the booking — schema requires categoryId + bookingType +
//    description + address fields directly (not addressId).
console.log('2. POST /bookings');
const bookBody = {
  categoryId: sub.category_id,
  subcategoryId: sub.id,
  bookingType: 'fixed_price',
  scheduledAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  description: 'E2E test booking — automated Phase 17 verification.',
  address: '999 E2E Lane',
  barangay: 'Test',
  city: 'Manila',
  province: 'Metro Manila',
};
const r2 = await call('POST', '/api/v1/bookings', custToken, bookBody);
check(r2.status === 200 || r2.status === 201, 'booking created',
  'got ' + r2.status + ' ' + JSON.stringify(r2.body).slice(0, 250));
const BOOKING_ID = r2.body?.data?.id;
check(typeof BOOKING_ID === 'string', 'booking has id');

if (BOOKING_ID) {
  // 6. Verify DB row
  const dbBooking = (await pg.query(`SELECT id, status, total_amount, escrow_status FROM bookings WHERE id=$1`, [BOOKING_ID])).rows[0];
  check(dbBooking !== undefined, 'booking row exists in DB');
  if (dbBooking) {
    check(dbBooking.total_amount > 0, 'total_amount > 0', 'got ' + dbBooking.total_amount);
    // Initial state for a fixed_price booking is `requested` (server
    // matches a provider before transitioning to `matched`).
    check(dbBooking.status === 'requested', 'status starts at requested',
      'got: ' + dbBooking.status);
  }

  // 7. Customer view
  console.log('3. GET /bookings (customer)');
  const cb = await call('GET', '/api/v1/bookings?limit=10', custToken);
  check(cb.body?.data?.some(b => b.id === BOOKING_ID), 'customer sees booking');

  // 8. Force-match the booking to our provider (simulating what the
  //    matching engine would do; we're verifying the state machine
  //    not the matching algorithm here).
  await pg.query(
    `UPDATE bookings SET provider_id=$1, status='matched' WHERE id=$2`,
    [PROVIDER_ID, BOOKING_ID],
  );

  // 9. Provider view (now matched)
  console.log('4. GET /bookings (provider) after match');
  const pb = await call('GET', '/api/v1/bookings?limit=10', provToken);
  check(pb.body?.data?.some(b => b.id === BOOKING_ID), 'provider sees matched booking');

  // 10. Verify the state machine REJECTS invalid jumps. The correct
  //     full flow is: matched → payment_pending → paid → in_progress
  //     → completed_by_provider → completed (customer confirms).
  //     Driving payment through PayMongo sandbox is out of scope —
  //     here we just prove the invariants are enforced.
  console.log('5. PATCH /bookings/:id/status (skip-ahead → in_progress, should 409)');
  const skip = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, provToken,
    { status: 'in_progress' });
  check(skip.status === 409, 'matched → in_progress rejected (must pay first)');
  check((skip.body?.error?.message || '').includes('payment_pending'),
    'rejection message lists payment_pending as allowed next step');

  // 11. Drive matched → payment_pending (the legitimate next state).
  //     This goes via the booking PATCH path; some routes restrict
  //     transitions to specific roles. Try as customer first.
  console.log('6. PATCH /bookings/:id/status (customer → payment_pending)');
  const pp = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, custToken,
    { status: 'payment_pending' });
  console.log('   →', pp.status, JSON.stringify(pp.body).slice(0, 200));

  // 12. Direct DB advance to paid (simulates PayMongo webhook firing
  //     successfully). Then verify provider can transition further.
  await pg.query(
    `UPDATE bookings SET status='paid', escrow_status='held' WHERE id=$1`,
    [BOOKING_ID],
  );
  console.log('7. PATCH paid → provider_en_route');
  const enroute = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, provToken,
    { status: 'provider_en_route' });
  check(enroute.status === 200, 'paid → provider_en_route accepted',
    JSON.stringify(enroute.body).slice(0, 150));

  console.log('8a. PATCH provider_en_route → provider_arrived');
  const arrived = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, provToken,
    { status: 'provider_arrived' });
  check(arrived.status === 200, 'provider_en_route → provider_arrived accepted');

  console.log('8b. PATCH provider_arrived → in_progress');
  const inProg = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, provToken,
    { status: 'in_progress' });
  check(inProg.status === 200, 'provider_arrived → in_progress accepted',
    JSON.stringify(inProg.body).slice(0, 150));

  console.log('9. PATCH in_progress → completed_by_provider');
  const compP = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, provToken,
    { status: 'completed_by_provider' });
  check(compP.status === 200, 'in_progress → completed_by_provider accepted',
    JSON.stringify(compP.body).slice(0, 150));

  const after = (await pg.query(`SELECT status, escrow_status, total_amount FROM bookings WHERE id=$1`, [BOOKING_ID])).rows[0];
  check(after?.status === 'completed_by_provider', 'DB shows completed_by_provider');
  console.log('   final state — status:', after?.status, 'escrow:', after?.escrow_status, 'total:', after?.total_amount);

  // 13. Customer confirms — escrow should release to provider wallet.
  //     The status verb may be 'completed' OR a separate confirm
  //     endpoint. Try both.
  console.log('10. customer confirms (POST /bookings/:id/confirm OR PATCH status=completed)');
  const provWalletBefore = (await pg.query(
    `SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]
  )).rows[0]?.available_balance ?? 0;
  console.log('    provider wallet before:', provWalletBefore);

  let finalize = await call('POST', `/api/v1/bookings/${BOOKING_ID}/confirm`, custToken, {});
  if (finalize.status === 404) {
    finalize = await call('PATCH', `/api/v1/bookings/${BOOKING_ID}/status`, custToken, { status: 'completed' });
  }
  check(finalize.status === 200, 'customer confirm accepted',
    JSON.stringify(finalize.body).slice(0, 200));

  const provWalletAfter = (await pg.query(
    `SELECT available_balance FROM wallets WHERE user_id=$1 AND type='provider'`, [provUserId]
  )).rows[0]?.available_balance ?? 0;
  console.log('    provider wallet after:', provWalletAfter);

  const escrowAfter = (await pg.query(`SELECT status, escrow_status FROM bookings WHERE id=$1`, [BOOKING_ID])).rows[0];
  check(escrowAfter?.status === 'completed', 'DB shows completed');
  check(escrowAfter?.escrow_status === 'released', 'escrow released',
    'got: ' + escrowAfter?.escrow_status);
  // Provider wallet should have grown by total_amount minus commission
  check(Number(provWalletAfter) > Number(provWalletBefore),
    'provider wallet grew (escrow released)',
    `before: ${provWalletBefore}, after: ${provWalletAfter}`);

  // 14. Verify commission was deducted at the right rate
  const commissionRate = (await pg.query(
    `SELECT value FROM platform_settings WHERE key='commission_rate_${provider.tier}'`
  )).rows[0]?.value;
  console.log('    commission rate for tier=' + provider.tier + ':', commissionRate, '%');
  const expectedNet = Math.round(after.total_amount * (1 - Number(commissionRate) / 100));
  const actualNet = Number(provWalletAfter) - Number(provWalletBefore);
  console.log('    expected net to provider:', expectedNet, 'actual:', actualNet);
  // Allow ±1 centavo for rounding
  check(Math.abs(actualNet - expectedNet) <= 1,
    'provider net amount matches commission_rate_' + provider.tier,
    `expected ~${expectedNet}, got ${actualNet}`);
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
await pg.end();
process.exit(fail === 0 ? 0 : 1);
