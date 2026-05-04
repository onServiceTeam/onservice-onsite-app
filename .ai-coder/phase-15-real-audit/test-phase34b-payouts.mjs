// Phase 34b — payout / withdrawal flow.
//
// Coverage:
//   1. POST /payouts/request — provider requests payout
//   2. POST request — under minimum → 400
//   3. POST request — bogus method → 400
//   4. POST request — destination account too short → 400 (Zod)
//   5. POST request — pending one already exists → 409
//   6. POST request — non-provider → 403
//   7. GET /my (provider) lists own payouts
//   8. GET /my non-provider → 403
//   9. GET /:id provider sees own; stranger → 403
//  10. GET / (admin) lists all
//  11. GET / customer → 403
//  12. PUT /:id/approve — super_admin approves
//  13. PUT /:id/approve — admin (not super) → 403 (MED-N159)
//  14. PUT /:id/reject — super_admin rejects + reason ≥ 10 chars
//  15. PUT /:id/reject — short reason → 400
//  16. PUT /:id/complete — super_admin marks paid_out
//  17. AML over threshold → status='aml_review_pending' (MED-N77)
//  18. PUT /:id/clear-aml-review — super_admin clears
//  19. No auth → 401

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

async function makeUser(role) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, $2, TRUE, 'P34b', $3) RETURNING id`,
    [phone, role, role.slice(0,8) + Date.now()]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const PROV1 = await makeUser('provider');
const PROV2 = await makeUser('provider');
const ADMIN_USER = await makeUser('admin');
const CUST = await makeUser('customer');

// Real provider rows
const p1 = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P34b Prov 1', 'approved') RETURNING id`, [PROV1.userId]);
const provider1Id = p1.rows[0].id;
const p2 = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P34b Prov 2', 'approved') RETURNING id`, [PROV2.userId]);
const provider2Id = p2.rows[0].id;

// Provider wallets pre-seeded with balance for payout
async function fundWallet(userId, amount) {
  await pg.query(
    `INSERT INTO wallets (user_id, type, currency, available_balance)
     VALUES ($1, 'provider', 'PHP', $2)
     ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO UPDATE SET available_balance=EXCLUDED.available_balance`,
    [userId, amount]);
}
await fundWallet(PROV1.userId, 200_000);  // ₱2000
await fundWallet(PROV2.userId, 60_000_000);  // ₱600,000 (over AML threshold)

// ════════════════════════════════════════════════════════════════════
// 1. POST /payouts/request
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /payouts/request ===');
const r1 = await call(PROV1.token, 'POST', '/api/v1/payouts/request', {
  amount: 100_000,  // ₱1000
  method: 'gcash',
  destinationAccount: '09171234567',
  accountName: 'P34b Provider 1',
});
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
const payout1Id = r1.body?.data?.id;
check(typeof payout1Id === 'string', `id (${payout1Id})`);
check(r1.body?.data?.status === 'pending', `status=pending (got ${r1.body?.data?.status})`);

// ════════════════════════════════════════════════════════════════════
// 2. Under minimum → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Under minimum → 400 ===');
const r2 = await call(PROV1.token, 'POST', '/api/v1/payouts/request', {
  amount: 100,  // way under min
  method: 'gcash',
  destinationAccount: '09171234567',
});
check(r2.status === 400, `→ 400 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Bogus method → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Bogus method → 400 ===');
const r3 = await call(PROV1.token, 'POST', '/api/v1/payouts/request', {
  amount: 100_000,
  method: 'bitcoin_lightning',
  destinationAccount: '09171234567',
});
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Destination too short → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. dest too short → 400 ===');
const r4 = await call(PROV1.token, 'POST', '/api/v1/payouts/request', {
  amount: 100_000,
  method: 'gcash',
  destinationAccount: 'abc',
});
check(r4.status === 400, `→ 400 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. Pending exists → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Second request → 409 ===');
const r5 = await call(PROV1.token, 'POST', '/api/v1/payouts/request', {
  amount: 50_000,
  method: 'gcash',
  destinationAccount: '09171234567',
});
check(r5.status === 409, `→ 409 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. Non-provider → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. customer POST → 403 ===');
const r6 = await call(CUST.token, 'POST', '/api/v1/payouts/request', {
  amount: 100_000,
  method: 'gcash',
  destinationAccount: '09171234567',
});
check(r6.status === 403, `→ 403 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. GET /my
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. GET /payouts/my ===');
const r7 = await call(PROV1.token, 'GET', '/api/v1/payouts/my');
check(r7.status === 200, `→ 200 (got ${r7.status})`);
check(r7.body?.data?.some(p => p.id === payout1Id), 'own payout in list');

// ════════════════════════════════════════════════════════════════════
// 8. GET /my non-provider → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. customer GET /my → 403 ===');
const r8 = await call(CUST.token, 'GET', '/api/v1/payouts/my');
check(r8.status === 403, `→ 403 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. Stranger GET /:id → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Stranger provider /:id → 403 ===');
const r9 = await call(PROV2.token, 'GET', `/api/v1/payouts/${payout1Id}`);
check(r9.status === 403, `→ 403 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. GET / admin lists all
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. GET / admin ===');
const r10 = await call(SUPER_TOKEN, 'GET', '/api/v1/payouts?pageSize=10');
check(r10.status === 200, `→ 200 (got ${r10.status})`);
check(Array.isArray(r10.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 11. GET / customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. GET / customer → 403 ===');
const r11 = await call(CUST.token, 'GET', '/api/v1/payouts');
check(r11.status === 403, `→ 403 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. Approve admin (not super) → 403 (MED-N159)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. PUT /:id/approve admin → 403 (MED-N159) ===');
const r13 = await call(ADMIN_USER.token, 'PUT', `/api/v1/payouts/${payout1Id}/approve`, {});
check(r13.status === 403, `→ 403 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. Approve super_admin
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. PUT /:id/approve super_admin ===');
const r12 = await call(SUPER_TOKEN, 'PUT', `/api/v1/payouts/${payout1Id}/approve`, {});
check(r12.status === 200, `→ 200 (got ${r12.status})`,
  JSON.stringify(r12.body).slice(0,200));
check(r12.body?.data?.status === 'approved' || r12.body?.data?.status === 'processing',
  `status=approved|processing (got ${r12.body?.data?.status})`);

// ════════════════════════════════════════════════════════════════════
// 14. Reject — make a fresh payout, then reject it
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. Reject super_admin ===');
// Need a fresh payout — approve closed the only pending; use second wallet/provider
await fundWallet(PROV1.userId, 100_000);  // re-add some
// PROV1 still has an approved one — for reject we use PROV2 with a small amount
const rr = await pg.query(
  `INSERT INTO wallets (user_id, type, currency, available_balance)
   VALUES ($1, 'provider', 'PHP', 200000)
   ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO UPDATE SET available_balance=200000`,
  [PROV2.userId]);
void rr;

const r14a = await call(PROV2.token, 'POST', '/api/v1/payouts/request', {
  amount: 100_000,
  method: 'gcash',
  destinationAccount: '09170000000',
});
check(r14a.status === 201, `prov2 request → 201 (got ${r14a.status})`,
  JSON.stringify(r14a.body).slice(0,200));
const payout2Id = r14a.body.data.id;

const r14 = await call(SUPER_TOKEN, 'PUT', `/api/v1/payouts/${payout2Id}/reject`, {
  reason: 'Phase 34b test — automated reject for rejection-flow audit verification.',
});
check(r14.status === 200, `→ 200 (got ${r14.status})`,
  JSON.stringify(r14.body).slice(0,200));
check(r14.body?.data?.status === 'rejected', `status=rejected (got ${r14.body?.data?.status})`);

// ════════════════════════════════════════════════════════════════════
// 15. Reject short reason → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. Reject short reason → 400 ===');
const r15 = await call(SUPER_TOKEN, 'PUT', `/api/v1/payouts/${payout2Id}/reject`, {
  reason: 'short',
});
check(r15.status === 400, `→ 400 (got ${r15.status})`);

// ════════════════════════════════════════════════════════════════════
// 16. Complete payout (mark paid_out)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. PUT /:id/complete ===');
const r16 = await call(SUPER_TOKEN, 'PUT', `/api/v1/payouts/${payout1Id}/complete`, {
  paymongoTransferId: 'p34b_test_xfer_' + Date.now(),
});
check(r16.status === 200, `→ 200 (got ${r16.status})`,
  JSON.stringify(r16.body).slice(0,200));
check(['paid_out', 'completed'].includes(r16.body?.data?.status),
  `status=paid_out|completed (got ${r16.body?.data?.status})`);

// ════════════════════════════════════════════════════════════════════
// 17. AML over threshold → status=aml_review_pending (MED-N77)
//     Threshold default is ₱500K = 50,000,000 centavos. PROV2 had ₱2000
//     reduced earlier; refund the wallet up to ₱600K and try.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. AML threshold → aml_review_pending ===');
await pg.query(
  `UPDATE wallets SET available_balance = 60000000 WHERE user_id=$1 AND type='provider'`,
  [PROV2.userId]);
const r17 = await call(PROV2.token, 'POST', '/api/v1/payouts/request', {
  amount: 50_000_000,   // ₱500,000 = at threshold
  method: 'bank_pesonet',
  destinationAccount: '012345678901',
  accountName: 'AML test',
});
check(r17.status === 201, `→ 201 (got ${r17.status})`,
  JSON.stringify(r17.body).slice(0,200));
check(r17.body?.data?.status === 'aml_review_pending',
  `status=aml_review_pending (got ${r17.body?.data?.status})`);
const payout3Id = r17.body.data.id;

// ════════════════════════════════════════════════════════════════════
// 18. clear-aml-review super_admin
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 18. PUT /:id/clear-aml-review ===');
const r18 = await call(SUPER_TOKEN, 'PUT', `/api/v1/payouts/${payout3Id}/clear-aml-review`, {});
check(r18.status === 200, `→ 200 (got ${r18.status})`,
  JSON.stringify(r18.body).slice(0,200));
check(r18.body?.data?.status === 'pending', `status=pending after clear (got ${r18.body?.data?.status})`);

// ════════════════════════════════════════════════════════════════════
// 19. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 19. No auth → 401 ===');
const r19 = await call(null, 'GET', '/api/v1/payouts/my');
check(r19.status === 401, `→ 401 (got ${r19.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (
  SELECT id FROM wallets WHERE user_id IN ($1,$2,$3,$4)
)`, [PROV1.userId, PROV2.userId, ADMIN_USER.userId, CUST.userId]);
await pg.query(`DELETE FROM payouts WHERE provider_id IN ($1,$2)`, [provider1Id, provider2Id]);
await pg.query(`DELETE FROM wallets WHERE user_id IN ($1,$2,$3,$4)`,
  [PROV1.userId, PROV2.userId, ADMIN_USER.userId, CUST.userId]);
await pg.query(`DELETE FROM providers WHERE id IN ($1,$2)`, [provider1Id, provider2Id]);
await pg.query(`DELETE FROM audit_log WHERE user_id IN ($1,$2,$3,$4)`,
  [PROV1.userId, PROV2.userId, ADMIN_USER.userId, CUST.userId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2,$3,$4)`,
  [PROV1.userId, PROV2.userId, ADMIN_USER.userId, CUST.userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
