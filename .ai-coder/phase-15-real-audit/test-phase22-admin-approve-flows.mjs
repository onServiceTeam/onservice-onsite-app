// Phase 22b/c/d — admin approve flows that need seeded pending data.
// Phase 19 noted these were untested because seed had 0 pending providers,
// 0 pending payouts. Phase 22 seeds the precondition then drives the
// approval, verifying:
//   - status changes correctly
//   - admin_actions audit row written with correct verb
//   - any side effect (wallet credit on customer credit, etc.) lands

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const SUPER_TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

async function call(method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + SUPER_TOKEN,
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
// SECTION 1 — Provider approve flow
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Provider approve flow (seed pending → approve) ===');

// Seed a pending provider (with a throwaway user)
const tempUserResult = await pg.query(`
  INSERT INTO users (phone, role, first_name, last_name, is_active)
  VALUES ('+639195551234', 'provider', 'Test', 'Pending', TRUE)
  RETURNING id`);
const tempUserId = tempUserResult.rows[0].id;

// Provider approve gate requires KYC fields populated. Seed them.
const provCols = await pg.query(`
  SELECT column_name FROM information_schema.columns
   WHERE table_name='providers'
     AND column_name IN ('nbi_clearance_url','government_id_front_url','selfie_url','nbi_expiry_date')`);
const hasKyc = provCols.rows.length > 0;
const tempProvResult = await pg.query(`
  INSERT INTO providers (user_id, business_name, description, tier, status,
                         service_radius_km, rating, total_reviews, total_jobs,
                         is_available, acceptance_rate, cancellations_last_30d,
                         total_cancellations, nbi_expiry_notified
                         ${hasKyc ? ', nbi_clearance_url, government_id_front_url, selfie_url, nbi_expiry_date' : ''})
  VALUES ($1, 'Phase 22 Test Pending', 'Test', 'new', 'pending',
          10, 0, 0, 0, FALSE, 0, 0, 0, FALSE
          ${hasKyc ? ", 'http://test/nbi.jpg', 'http://test/id.jpg', 'http://test/selfie.jpg', CURRENT_DATE + INTERVAL '1 year'" : ''})
  RETURNING id`, [tempUserId]);
const pendingProvId = tempProvResult.rows[0].id;
console.log('  seeded pending provider with KYC:', pendingProvId.slice(0,8));

// Approve via admin endpoint
const approve = await call('PUT', `/api/v1/admin/providers/${pendingProvId}/approve`, {
  reason: 'Phase 22 test approval — automated verification.',
});
check([200,204].includes(approve.status), 'PUT /admin/providers/:id/approve → 2xx',
  'got ' + approve.status + ' ' + JSON.stringify(approve.body).slice(0,250));

// Verify status changed
const provAfter = await pg.query(`SELECT status FROM providers WHERE id=$1`, [pendingProvId]);
check(provAfter.rows[0]?.status === 'approved',
  'provider status updated to approved in DB',
  'got: ' + provAfter.rows[0]?.status);

// Verify admin_actions row written
const auditApprove = await pg.query(
  `SELECT action_type, target_type FROM admin_actions
    WHERE target_id=$1 AND action_type='provider_approved'
    ORDER BY created_at DESC LIMIT 1`, [pendingProvId]);
check(auditApprove.rows.length === 1,
  'admin_actions has provider_approved row',
  JSON.stringify(auditApprove.rows[0] ?? {}));

// Now suspend → reactivate cycle
const suspend = await call('PUT', `/api/v1/admin/providers/${pendingProvId}/suspend`, {
  reason: 'Phase 22 test suspend — automated.',
});
check([200,204].includes(suspend.status), 'PUT /admin/providers/:id/suspend → 2xx',
  'got ' + suspend.status + ' ' + JSON.stringify(suspend.body).slice(0,200));

const provSuspended = await pg.query(`SELECT status FROM providers WHERE id=$1`, [pendingProvId]);
check(provSuspended.rows[0]?.status === 'suspended', 'status=suspended in DB');

const reactivate = await call('PUT', `/api/v1/admin/providers/${pendingProvId}/reactivate`, {
  reason: 'Phase 22 test reactivate — automated.',
});
check([200,204].includes(reactivate.status), 'PUT /admin/providers/:id/reactivate → 2xx',
  'got ' + reactivate.status + ' ' + JSON.stringify(reactivate.body).slice(0,200));

const provReactivated = await pg.query(`SELECT status FROM providers WHERE id=$1`, [pendingProvId]);
check(provReactivated.rows[0]?.status === 'approved', 'status back to approved after reactivate');

// Cleanup pending provider
await pg.query(`DELETE FROM providers WHERE id=$1`, [pendingProvId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [tempUserId]);
console.log('  cleaned up test provider');

// ════════════════════════════════════════════════════════════════════
// SECTION 2 — Provider reject flow (separate seed)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Provider reject flow ===');

const rejUser = await pg.query(`
  INSERT INTO users (phone, role, first_name, last_name, is_active)
  VALUES ('+639195551235', 'provider', 'Test', 'Reject', TRUE)
  RETURNING id`);
const rejUserId = rejUser.rows[0].id;
const rejProv = await pg.query(`
  INSERT INTO providers (user_id, business_name, description, tier, status,
                         service_radius_km, rating, total_reviews, total_jobs,
                         is_available, acceptance_rate, cancellations_last_30d,
                         total_cancellations, nbi_expiry_notified)
  VALUES ($1, 'Phase 22 Test Reject', 'Test', 'new', 'pending',
          10, 0, 0, 0, FALSE, 0, 0, 0, FALSE)
  RETURNING id`, [rejUserId]);
const rejProvId = rejProv.rows[0].id;

const reject = await call('PUT', `/api/v1/admin/providers/${rejProvId}/reject`, {
  reason: 'Phase 22 test reject — application incomplete (automated).',
});
check([200,204].includes(reject.status), 'PUT /admin/providers/:id/reject → 2xx',
  'got ' + reject.status + ' ' + JSON.stringify(reject.body).slice(0,250));

const provRejected = await pg.query(`SELECT status FROM providers WHERE id=$1`, [rejProvId]);
check(provRejected.rows[0]?.status === 'rejected', 'status=rejected in DB',
  'got: ' + provRejected.rows[0]?.status);

const auditReject = await pg.query(
  `SELECT action_type FROM admin_actions
    WHERE target_id=$1 AND action_type='provider_rejected'
    ORDER BY created_at DESC LIMIT 1`, [rejProvId]);
check(auditReject.rows.length === 1, 'admin_actions has provider_rejected row');

// Cleanup
await pg.query(`DELETE FROM providers WHERE id=$1`, [rejProvId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [rejUserId]);

// ════════════════════════════════════════════════════════════════════
// SECTION 3 — Payout approve/reject/complete flow
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Payout approve/reject flow ===');

// Seed a pending payout against an existing provider with a wallet
const provForPayout = (await pg.query(`SELECT id, user_id FROM providers WHERE status='approved' LIMIT 1`)).rows[0];
const provWallet = (await pg.query(
  `SELECT id FROM wallets WHERE user_id=$1 AND type='provider'`, [provForPayout.user_id])).rows[0];
if (!provWallet) {
  // Create one
  await pg.query(
    `INSERT INTO wallets (user_id, type, available_balance, pending_balance)
     VALUES ($1, 'provider', 50000, 0)`, [provForPayout.user_id]);
}
const wid = (await pg.query(`SELECT id FROM wallets WHERE user_id=$1 AND type='provider'`,
  [provForPayout.user_id])).rows[0].id;
// Top up wallet to ensure sufficient balance
await pg.query(`UPDATE wallets SET available_balance = 50000 WHERE id=$1`, [wid]);

// Reserve money in pending — production flow does this in requestPayout.
// Skipping it leaves reject path crashing on positive_pending CHECK
// (BUG-PHASE22-01: data drift between payouts and wallets is uncaught).
await pg.query(`UPDATE wallets SET available_balance = available_balance - 10000, pending_balance = pending_balance + 10000 WHERE id=$1`, [wid]);
const payoutSeed = await pg.query(`
  INSERT INTO payouts (provider_id, wallet_id, amount, method, destination_account, status, requires_aml_review)
  VALUES ($1, $2, 10000, 'gcash', '+639175557777', 'pending', FALSE)
  RETURNING id`, [provForPayout.id, wid]);
const payoutId = payoutSeed.rows[0].id;
console.log('  seeded pending payout (with proper wallet reservation):', payoutId.slice(0,8));

const payApprove = await call('PUT', `/api/v1/payouts/${payoutId}/approve`, {
  reason: 'Phase 22 test payout approve — automated.',
});
check([200,204].includes(payApprove.status), 'PUT /payouts/:id/approve → 2xx',
  'got ' + payApprove.status + ' ' + JSON.stringify(payApprove.body).slice(0,250));

const payAfter = await pg.query(`SELECT status FROM payouts WHERE id=$1`, [payoutId]);
check(['approved','processing','completed'].includes(payAfter.rows[0]?.status),
  'payout status moved to approved/processing/completed',
  'got: ' + payAfter.rows[0]?.status);

const auditPay = await pg.query(
  `SELECT action_type FROM admin_actions
    WHERE target_id=$1 AND action_type='payout_approved'
    ORDER BY created_at DESC LIMIT 1`, [payoutId]);
check(auditPay.rows.length === 1, 'admin_actions has payout_approved row');

// Test reject path on a separate seed — also reserve money first.
await pg.query(`UPDATE wallets SET available_balance = available_balance - 5000, pending_balance = pending_balance + 5000 WHERE id=$1`, [wid]);
const payoutRej = await pg.query(`
  INSERT INTO payouts (provider_id, wallet_id, amount, method, destination_account, status, requires_aml_review)
  VALUES ($1, $2, 5000, 'gcash', '+639175557777', 'pending', FALSE)
  RETURNING id`, [provForPayout.id, wid]);
const payoutRejId = payoutRej.rows[0].id;

const payReject = await call('PUT', `/api/v1/payouts/${payoutRejId}/reject`, {
  reason: 'Phase 22 test payout reject — automated. AML hold.',
});
check([200,204].includes(payReject.status), 'PUT /payouts/:id/reject → 2xx',
  'got ' + payReject.status + ' ' + JSON.stringify(payReject.body).slice(0,250));

const payRejAfter = await pg.query(`SELECT status FROM payouts WHERE id=$1`, [payoutRejId]);
check(payRejAfter.rows[0]?.status === 'rejected', 'rejected status in DB');

// Cleanup
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1, $2)`, [payoutId, payoutRejId]);
await pg.query(`DELETE FROM wallet_transactions WHERE description LIKE '%payout%' AND created_at > NOW() - INTERVAL '5 minutes'`).catch(()=>{});
await pg.query(`DELETE FROM payouts WHERE id IN ($1, $2)`, [payoutId, payoutRejId]);

// ════════════════════════════════════════════════════════════════════
// SECTION 4 — Customer credit issuance flow
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Customer credit issuance flow ===');

const custForCredit = (await pg.query(`SELECT id FROM users WHERE role='customer' LIMIT 1`)).rows[0];
const custWalletRow = await pg.query(
  `SELECT id, available_balance::bigint AS bal FROM wallets WHERE user_id=$1 AND type='customer'`,
  [custForCredit.id]);
let custWalletId, custBalBefore;
if (custWalletRow.rows.length === 0) {
  const w = await pg.query(
    `INSERT INTO wallets (user_id, type, available_balance, pending_balance)
     VALUES ($1, 'customer', 0, 0) RETURNING id`, [custForCredit.id]);
  custWalletId = w.rows[0].id;
  custBalBefore = 0;
} else {
  custWalletId = custWalletRow.rows[0].id;
  custBalBefore = Number(custWalletRow.rows[0].bal);
}

const credit = await call('POST', `/api/v1/admin/customers/${custForCredit.id}/credit`, {
  amount: 5000, // ₱50.00
  reason: 'Phase 22 test credit — automated verification of admin issuance.',
});
check([200,201,204].includes(credit.status), 'POST /admin/customers/:id/credit → 2xx',
  'got ' + credit.status + ' ' + JSON.stringify(credit.body).slice(0,300));

const custAfter = await pg.query(
  `SELECT available_balance::bigint AS bal FROM wallets WHERE id=$1`, [custWalletId]);
const custBalAfter = Number(custAfter.rows[0].bal);
check(custBalAfter - custBalBefore === 5000,
  'customer wallet credited by exactly 5000 centavos',
  'before=' + custBalBefore + ' after=' + custBalAfter + ' delta=' + (custBalAfter - custBalBefore));

const auditCredit = await pg.query(
  `SELECT action_type FROM admin_actions
    WHERE target_id=$1 AND action_type='customer_credited'
    ORDER BY created_at DESC LIMIT 1`, [custForCredit.id]);
check(auditCredit.rows.length === 1, 'admin_actions has customer_credited row');

// Cleanup: reverse the credit
await pg.query(
  `UPDATE wallets SET available_balance = available_balance - 5000 WHERE id=$1`, [custWalletId]);
await pg.query(
  `DELETE FROM wallet_transactions WHERE wallet_id=$1 AND amount=5000 AND created_at > NOW() - INTERVAL '5 minutes'`,
  [custWalletId]);

// ════════════════════════════════════════════════════════════════════
// SECTION 5 — Tier change with ALL valid tiers
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Tier change cycle ===');

const tierProv = (await pg.query(`SELECT id, tier FROM providers WHERE status='approved' LIMIT 1`)).rows[0];
const origTier = tierProv.tier;
const tierProvId = tierProv.id;

for (const targetTier of ['new', 'verified', 'pro', 'elite']) {
  if (targetTier === origTier) continue;
  const tc = await call('PUT', `/api/v1/admin/providers/${tierProvId}/tier`, {
    tier: targetTier, reason: `Phase 22 cycle to ${targetTier}`,
  });
  check([200,204].includes(tc.status), `tier change to ${targetTier} → 2xx`,
    'got ' + tc.status + ' ' + JSON.stringify(tc.body).slice(0,150));
  const v = await pg.query(`SELECT tier FROM providers WHERE id=$1`, [tierProvId]);
  check(v.rows[0].tier === targetTier, `DB tier=${targetTier}`,
    'got: ' + v.rows[0].tier);
}
// Restore
await call('PUT', `/api/v1/admin/providers/${tierProvId}/tier`,
  { tier: origTier, reason: 'Phase 22 restore' });

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,300) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
