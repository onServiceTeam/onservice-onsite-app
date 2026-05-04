// Phase 35d — booking status transition matrix.
//
// Verifies the VALID_TRANSITIONS state machine in booking.types.ts:
//   requested → quoted | matched | cancelled_by_*
//   quoted → matched | cancelled_*
//   matched → payment_pending | cancelled_*
//   payment_pending → paid | cancelled_by_customer/admin
//   paid → provider_en_route | cancelled_*
//   provider_en_route → provider_arrived | cancelled_*
//   provider_arrived → in_progress | cancelled_by_admin   (NB: customer
//     CANNOT cancel after provider arrives — service can't no-show their
//     way out of payment)
//   in_progress → completed_by_provider | cancelled_by_admin
//   completed_by_provider → confirmed | disputed
//   confirmed → payout_ready
//   disputed → resolved
//   resolved → payout_ready | cancelled_by_admin
//   payout_ready → paid_out
//   paid_out, cancelled_* → terminal (no transitions)
//
// We assert on the pure helper canTransition() rather than driving the
// full booking pipeline (each transition there has its own side
// effects). Plus a few key API-level transitions to catch regressions.

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const REPO_ROOT = process.cwd();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

const types = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/types/booking.types.ts')
).href);
const { canTransition, VALID_TRANSITIONS } = types;

// ════════════════════════════════════════════════════════════════════
// Pure transition tests
// ════════════════════════════════════════════════════════════════════

// Happy-path "ok"
const ok = [
  ['requested', 'quoted'],
  ['requested', 'matched'],
  ['quoted', 'matched'],
  ['matched', 'payment_pending'],
  ['payment_pending', 'paid'],
  ['paid', 'provider_en_route'],
  ['provider_en_route', 'provider_arrived'],
  ['provider_arrived', 'in_progress'],
  ['in_progress', 'completed_by_provider'],
  ['completed_by_provider', 'confirmed'],
  ['completed_by_provider', 'disputed'],
  ['confirmed', 'payout_ready'],
  ['disputed', 'resolved'],
  ['resolved', 'payout_ready'],
  ['payout_ready', 'paid_out'],
];
console.log('\n=== Happy-path transitions ===');
for (const [from, to] of ok) {
  check(canTransition(from, to), `${from} → ${to}`);
}

// Cancellation paths from each non-terminal pre-arrived status
const customerCancellable = [
  'requested', 'quoted', 'matched', 'payment_pending',
  'paid', 'provider_en_route',
];
console.log('\n=== Customer-cancellable from pre-arrived ===');
for (const s of customerCancellable) {
  check(canTransition(s, 'cancelled_by_customer'),
    `${s} → cancelled_by_customer`);
}

console.log('\n=== After provider_arrived: customer CANNOT cancel ===');
check(!canTransition('provider_arrived', 'cancelled_by_customer'),
  'provider_arrived → cancelled_by_customer is BLOCKED');
check(!canTransition('in_progress', 'cancelled_by_customer'),
  'in_progress → cancelled_by_customer is BLOCKED');

console.log('\n=== Admin can always cancel non-terminal ===');
const adminCancellable = [
  'requested', 'quoted', 'matched', 'payment_pending', 'paid',
  'provider_en_route', 'provider_arrived', 'in_progress', 'resolved',
];
for (const s of adminCancellable) {
  check(canTransition(s, 'cancelled_by_admin'),
    `${s} → cancelled_by_admin`);
}

console.log('\n=== Provider can cancel only matched, paid, en_route ===');
const providerCancellable = ['matched', 'paid', 'provider_en_route'];
for (const s of providerCancellable) {
  check(canTransition(s, 'cancelled_by_provider'),
    `${s} → cancelled_by_provider`);
}
const providerCannotCancel = ['provider_arrived', 'in_progress', 'completed_by_provider'];
for (const s of providerCannotCancel) {
  check(!canTransition(s, 'cancelled_by_provider'),
    `${s} → cancelled_by_provider BLOCKED`);
}

// ════════════════════════════════════════════════════════════════════
// Terminal states have no outgoing edges
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Terminal states ===');
const terminals = ['paid_out', 'cancelled_by_customer',
  'cancelled_by_provider', 'cancelled_by_admin'];
for (const s of terminals) {
  check(VALID_TRANSITIONS[s].length === 0, `${s} is terminal (no outgoing)`);
}

// ════════════════════════════════════════════════════════════════════
// Backwards transitions are always rejected
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Backwards transitions blocked ===');
const backwards = [
  ['confirmed', 'in_progress'],
  ['paid', 'matched'],
  ['paid_out', 'payout_ready'],
  ['cancelled_by_admin', 'requested'],
  ['completed_by_provider', 'in_progress'],
];
for (const [from, to] of backwards) {
  check(!canTransition(from, to), `${from} → ${to} BLOCKED`);
}

// ════════════════════════════════════════════════════════════════════
// Skip-the-line transitions blocked
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Skip-the-line transitions blocked ===');
const skips = [
  ['requested', 'paid'],          // can't skip payment
  ['requested', 'completed_by_provider'],
  ['matched', 'in_progress'],     // can't skip arrival
  ['paid', 'completed_by_provider'],
  ['confirmed', 'paid_out'],      // must go through payout_ready
];
for (const [from, to] of skips) {
  check(!canTransition(from, to), `${from} → ${to} BLOCKED (skip-the-line)`);
}

// ════════════════════════════════════════════════════════════════════
// Bogus statuses
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Bogus status names ===');
check(!canTransition('blarghhh', 'paid'), 'bogus from rejected');
check(!canTransition('paid', 'fly_to_moon'), 'bogus to rejected');

// ════════════════════════════════════════════════════════════════════
// Live API check: PATCH /bookings/:id/status (if endpoint exists) for
// one rejected and one accepted transition. We use the customer
// /bookings/:id/cancel as the cleanest API-level hook.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Live API: customer cancel from provider_arrived → 409 ===');
import jwt from 'jsonwebtoken';

const API = 'http://localhost:7381';

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

const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const u = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P35d', 'Cust') RETURNING id`, [phone]);
const custId = u.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: custId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const provPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P35d', 'Prov') RETURNING id`, [provPhone]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P35d Prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;

const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const bk = await pg.query(
  `INSERT INTO bookings (
     customer_id, provider_id, category_id,
     scheduled_at, address, barangay, city, province,
     service_price, total_amount, status, escrow_status)
   VALUES ($1, $2, $3, NOW(),
           '1 P35d', 'B', 'Boracay', 'Aklan',
           100000, 100000, 'provider_arrived', 'held')
   RETURNING id`, [custId, providerId, cat.rows[0].id]);
const bookingId = bk.rows[0].id;

// Customer attempts cancel via PATCH /:id/status — should reject
// because VALID_TRANSITIONS does not include cancelled_by_customer
// from provider_arrived.
const r1 = await call(CUST_TOKEN, 'PATCH', `/api/v1/bookings/${bookingId}/status`,
  { status: 'cancelled_by_customer',
    cancellationReason: 'Phase 35d expects rejection from provider_arrived' });
check([409, 403].includes(r1.status),
  `customer cancel from provider_arrived → 409 or 403 (got ${r1.status})`);

// Cleanup
await pg.query(`DELETE FROM bookings WHERE id=$1`, [bookingId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM audit_log WHERE user_id IN ($1,$2)`, [custId, provUserId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [custId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
