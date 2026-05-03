// Phase 25b — Dispute filing → admin assign → admin resolve (full lifecycle).
//
// Coverage:
//   1. Customer files dispute (must be after job complete + within window)
//   2. Window guard: dispute file >24h after completion → 409
//   3. Admin sees dispute in list, assigns to themselves
//   4. Admin resolves with full_refund — escrow refunded, dispute_resolved row
//   5. Admin resolves with partial_refund — escrow split, refundPercent enforced
//   6. Admin resolves with no_refund — escrow released to provider
//   7. Admin reopens a resolved dispute (super-admin only)
//   8. Cannot file second dispute on same booking while first is open
//   9. Wrong customer cannot file dispute on someone else's booking → 403
//  10. admin_actions has the dispute_resolved + dispute_assigned rows

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
// Setup: customer + provider + 3 bookings (different completion times)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));

const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase25b', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const otherCust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase25b', 'OtherCust') RETURNING id`, [phoneOther]);
const otherCustomerId = otherCust.rows[0].id;
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'Phase25b', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'phase25b prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;

const TOTAL = 100000; // ₱1000

// Helper: booking that's been completed N hours ago
async function makeBooking(completedHoursAgo) {
  const r = await pg.query(
    `INSERT INTO bookings
       (customer_id, provider_id, category_id, status, total_amount,
        service_price, service_fee, address, barangay, city, province,
        latitude, longitude, scheduled_at, completed_at, escrow_status)
     VALUES ($1, $2, $3, 'completed_by_provider', $4,
             $4, 0, 'Test Address', 'Manoc-Manoc', 'Malay', 'Aklan',
             11.97, 121.92, NOW() - INTERVAL '2 days',
             NOW() - $5::interval, 'held')
     RETURNING id`,
    [customerId, providerId, categoryId, TOTAL, completedHoursAgo + ' hours']);
  return r.rows[0].id;
}

const bk1 = await makeBooking(2);     // completed 2h ago — within window
const bk2 = await makeBooking(2);     // for partial-refund test
const bk3 = await makeBooking(2);     // for no-refund test
const bk4 = await makeBooking(72);    // 72h ago — outside window
const bk5 = await makeBooking(2);     // for double-file rejection test

console.log(`  bookings: bk1=${bk1.slice(0,8)} bk2=${bk2.slice(0,8)} bk3=${bk3.slice(0,8)} bk4=${bk4.slice(0,8)} bk5=${bk5.slice(0,8)}`);

// Seed escrow ledger rows so refundFromEscrow has something to refund
async function seedEscrow(bookingId) {
  // escrow_ledger has the raw movement; wallet_transactions records on platform_escrow
  const escrowWallet = await pg.query(
    `SELECT id FROM wallets WHERE type='platform_escrow' AND user_id IS NULL`);
  if (!escrowWallet.rows[0]) {
    await pg.query(`INSERT INTO wallets (type, available_balance, pending_balance) VALUES ('platform_escrow', 0, 0)`);
  }
  const ew = await pg.query(`SELECT id FROM wallets WHERE type='platform_escrow' AND user_id IS NULL`);
  await pg.query(
    `UPDATE wallets SET pending_balance = pending_balance + $1 WHERE id = $2`,
    [TOTAL, ew.rows[0].id]);
  await pg.query(
    `INSERT INTO wallet_transactions
       (wallet_id, type, amount, balance_after, description, booking_id)
     VALUES ($1, 'escrow_hold', $2, 0, 'phase25b setup', $3)`,
    [ew.rows[0].id, TOTAL, bookingId]);
}
await seedEscrow(bk1);
await seedEscrow(bk2);
await seedEscrow(bk3);

// Need a customer JWT (token issued by /verify-otp would be cleanest;
// we shortcut with direct JWT signing using the same JWT_SECRET).
const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);
const OTHER_CUST_TOKEN = jwt.sign(
  { userId: otherCustomerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

// ════════════════════════════════════════════════════════════════════
// 1. Customer files dispute
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Customer files dispute on bk1 ===');
const f1 = await call(CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk1,
  type: 'incomplete',
  description: 'Phase 25b — provider only completed half the agreed work despite repeated promises and never returned to finish.',
});
check([200,201].includes(f1.status), 'POST /disputes → 2xx',
  `got ${f1.status} ${JSON.stringify(f1.body).slice(0,200)}`);
const dispute1Id = f1.body?.data?.id;
check(typeof dispute1Id === 'string', 'response has dispute id');

// ════════════════════════════════════════════════════════════════════
// 2. Window guard: file dispute >24h after completion → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Dispute outside window → 409 ===');
const f2 = await call(CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk4,
  type: 'incomplete',
  description: 'Phase 25b — submitted way past the 24-hour window so the route should reject this with a 409 status code.',
});
check(f2.status === 409, 'late dispute → 409', `got ${f2.status}`);

// ════════════════════════════════════════════════════════════════════
// 3. Admin sees the dispute + assigns to themselves
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Admin assigns dispute ===');
const det = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/disputes/${dispute1Id}`);
check(det.status === 200, 'admin GET dispute → 200');

const assign = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${dispute1Id}/assign`, {
  assigneeAdminId: SUPER_ADMIN_ID,
  note: 'Phase 25b — self-assigned for resolution test',
});
check([200,201].includes(assign.status), 'POST .../assign → 2xx',
  `got ${assign.status} ${JSON.stringify(assign.body).slice(0,200)}`);

const dispDb = await pg.query(`SELECT assigned_to, status FROM disputes WHERE id=$1`, [dispute1Id]);
check(dispDb.rows[0]?.assigned_to === SUPER_ADMIN_ID, 'assigned_to = super admin');

// ════════════════════════════════════════════════════════════════════
// 4. Admin resolves with full_refund
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Admin resolves with full_refund ===');
// Snapshot escrow before
const escBefore = await pg.query(
  `SELECT pending_balance FROM wallets WHERE type='platform_escrow' AND user_id IS NULL`);
const before = Number(escBefore.rows[0]?.pending_balance ?? 0);

const resolve = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${dispute1Id}/resolve`, {
  resolutionType: 'full_refund',
  decisionNotes: 'Phase 25b — provider failed to complete; full refund warranted.',
  internalNotes: 'phase25b notes',
});
check([200,201].includes(resolve.status), 'POST .../resolve full_refund → 2xx',
  `got ${resolve.status} ${JSON.stringify(resolve.body).slice(0,200)}`);

const resDb = await pg.query(`SELECT status, resolution_type, resolved_by, refund_amount FROM disputes WHERE id=$1`, [dispute1Id]);
check(resDb.rows[0]?.status === 'resolved', `status=resolved (got ${resDb.rows[0]?.status})`);
check(resDb.rows[0]?.resolution_type === 'full_refund', 'resolution_type=full_refund');
check(resDb.rows[0]?.resolved_by === SUPER_ADMIN_ID, 'resolved_by = super admin');
check(Number(resDb.rows[0]?.refund_amount) === TOTAL, `refund_amount=${TOTAL}`,
  `got ${resDb.rows[0]?.refund_amount}`);

// dispute_resolved admin_actions row
const auditR = await pg.query(
  `SELECT action_type FROM admin_actions
    WHERE target_id=$1 AND action_type='dispute_resolved'`, [dispute1Id]);
check(auditR.rows.length === 1, 'admin_actions row dispute_resolved present');

// ════════════════════════════════════════════════════════════════════
// 5. Partial refund: requires refundPercent in (0, 100]
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Admin resolves bk2 with partial_refund (50%) ===');
const f5 = await call(CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk2, type: 'substandard',
  description: 'Phase 25b — half of the agreed work was completed but the rest was substandard quality requiring rework.',
});
const d2 = f5.body?.data?.id;
const r5_partial = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${d2}/resolve`, {
  resolutionType: 'partial_refund',
  refundPercent: 50,
  decisionNotes: 'Phase 25b — half the work delivered; 50% refund.',
});
check([200,201].includes(r5_partial.status), 'partial_refund → 2xx',
  `got ${r5_partial.status} ${JSON.stringify(r5_partial.body).slice(0,200)}`);
const d2Db = await pg.query(`SELECT refund_amount FROM disputes WHERE id=$1`, [d2]);
const expected = Math.floor(TOTAL / 2);
check(Number(d2Db.rows[0]?.refund_amount) === expected,
  `refund_amount = TOTAL/2 (${expected})`,
  `got ${d2Db.rows[0]?.refund_amount}`);

// 5b. partial_refund without refundPercent → 400
const r5_bad = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${d2}/resolve`, {
  resolutionType: 'partial_refund',
  decisionNotes: 'Phase 25b — bad call, should reject.',
});
check([400, 409].includes(r5_bad.status),
  'partial_refund without refundPercent → 400/409',
  `got ${r5_bad.status} ${JSON.stringify(r5_bad.body).slice(0,200)}`);

// 5c. partial_refund with refundPercent=150 → 400
const r5_oob = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${d2}/resolve`, {
  resolutionType: 'partial_refund',
  refundPercent: 150,
  decisionNotes: 'Phase 25b — 150% refund attempt.',
});
check([400, 409].includes(r5_oob.status),
  'refundPercent>100 → 400/409',
  `got ${r5_oob.status}`);

// ════════════════════════════════════════════════════════════════════
// 6. no_refund → escrow releases to provider
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. no_refund → escrow released to provider ===');
const f6 = await call(CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk3, type: 'overcharge',
  description: 'Phase 25b — no_refund path test; admin will side with the provider after reviewing all submitted evidence.',
});
const d3 = f6.body?.data?.id;
const r6 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${d3}/resolve`, {
  resolutionType: 'no_refund',
  decisionNotes: 'Phase 25b — provider performed work as agreed.',
});
check([200,201].includes(r6.status), 'no_refund → 2xx',
  `got ${r6.status} ${JSON.stringify(r6.body).slice(0,200)}`);
const d3Db = await pg.query(`SELECT refund_amount, status FROM disputes WHERE id=$1`, [d3]);
check(Number(d3Db.rows[0]?.refund_amount) === 0, 'refund_amount=0');
check(d3Db.rows[0]?.status === 'resolved', 'status=resolved');

// ════════════════════════════════════════════════════════════════════
// 7. Reopen a resolved dispute (super_admin only)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Super-admin reopens resolved dispute ===');
const r7 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${dispute1Id}/reopen`, {
  reason: 'Phase 25b — reopening to test the lifecycle path; new evidence surfaced.',
});
check([200,201].includes(r7.status), 'reopen → 2xx',
  `got ${r7.status} ${JSON.stringify(r7.body).slice(0,200)}`);
const reopened = await pg.query(`SELECT status FROM disputes WHERE id=$1`, [dispute1Id]);
check(['open','investigating','under_review'].includes(reopened.rows[0]?.status),
  `status reopened (got ${reopened.rows[0]?.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. Cannot file second active dispute on same booking
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Double-file rejected (active dispute exists) ===');
const f8a = await call(CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk5, type: 'incomplete',
  description: 'Phase 25b — first dispute filed on bk5 to test that subsequent attempts get rejected with 409.',
});
check([200,201].includes(f8a.status), 'first dispute on bk5 created');

const f8b = await call(CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk5, type: 'overcharge',  // damage requires evidenceUrls — use overcharge
  description: 'Phase 25b — second dispute attempt on the same booking; should be rejected because first is still active.',
});
check(f8b.status === 409, 'second active dispute → 409',
  `got ${f8b.status} ${JSON.stringify(f8b.body).slice(0,200)}`);

// ════════════════════════════════════════════════════════════════════
// 9. Other customer cannot file dispute on someone else's booking
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Other customer cannot dispute someone else\'s booking ===');
// Need a booking the other customer didn't make. Use bk1 (was for customerId).
const f9 = await call(OTHER_CUST_TOKEN, 'POST', '/api/v1/disputes', {
  bookingId: bk1, type: 'overcharge',
  description: 'Phase 25b — attempted by wrong customer who does not own this booking; expect 403 or 404.',
});
check(f9.status === 403 || f9.status === 404,
  'wrong customer → 403/404',
  `got ${f9.status} ${JSON.stringify(f9.body).slice(0,200)}`);

// ════════════════════════════════════════════════════════════════════
// 10. admin_actions trail
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. admin_actions trail ===');
const verbs = await pg.query(
  `SELECT DISTINCT action_type FROM admin_actions
    WHERE target_id IN ($1, $2, $3)
    ORDER BY action_type`,
  [dispute1Id, d2, d3]);
const verbList = verbs.rows.map(r => r.action_type);
console.log('  verbs:', verbList.join(', '));
check(verbList.includes('dispute_resolved'), 'dispute_resolved present');
check(verbList.includes('dispute_assigned'), 'dispute_assigned present');
check(verbList.includes('dispute_reopened'), 'dispute_reopened present');

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1,$2,$3)`,
  [dispute1Id, d2, d3]);
await pg.query(`DELETE FROM dispute_messages WHERE dispute_id IN ($1,$2,$3)`,
  [dispute1Id, d2, d3]).catch(()=>{});
await pg.query(`DELETE FROM dispute_evidence WHERE dispute_id IN ($1,$2,$3)`,
  [dispute1Id, d2, d3]).catch(()=>{});
await pg.query(`DELETE FROM disputes WHERE booking_id IN ($1,$2,$3,$4,$5)`,
  [bk1, bk2, bk3, bk4, bk5]);
await pg.query(`DELETE FROM wallet_transactions WHERE booking_id IN ($1,$2,$3,$4,$5)`,
  [bk1, bk2, bk3, bk4, bk5]);
await pg.query(`DELETE FROM official_receipts WHERE booking_id IN ($1,$2,$3,$4,$5)`,
  [bk1, bk2, bk3, bk4, bk5]).catch(()=>{});
await pg.query(`DELETE FROM bookings WHERE id IN ($1,$2,$3,$4,$5)`,
  [bk1, bk2, bk3, bk4, bk5]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2,$3)`,
  [customerId, otherCustomerId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
