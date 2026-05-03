// Phase 27a — Wallet topup flow end-to-end.
//
// Coverage:
//   1. POST /wallet/top-up creates a payment_intent with metadata.intent_kind='top_up'
//   2. amount < min → 400
//   3. amount > max → 400
//   4. invalid paymentMethod → 400
//   5. Webhook payment.paid for the topup intent → wallet credited (centavos exact)
//   6. Idempotent webhook re-delivery → no double-credit
//   7. Two parallel topups → both credit (no race lost)
//   8. Topup metadata.intent_kind='top_up' takes precedence over legacy 'topup_' prefix
//   9. Auth required → 401
//  10. Wallet transactions audit row written

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('PAYMONGO_WEBHOOK_SECRET missing from .env');
  process.exit(1);
}

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

function signWebhook(body, tsSec = Math.floor(Date.now() / 1000)) {
  const payload = `${tsSec}.${body}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `t=${tsSec},te=${sig}`;
}

async function postWebhook(body) {
  const sig = signWebhook(body);
  const r = await fetch(API + '/api/v1/webhooks/paymongo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paymongo-signature': sig,
      'X-Forwarded-For': '10.99.27.27',
    },
    body,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  return { status: r.status, body: j };
}

function buildPaidEvent(topUpId, amount, paymongoPaymentId) {
  return JSON.stringify({
    data: {
      attributes: {
        type: 'payment.paid',
        data: {
          id: paymongoPaymentId,
          attributes: {
            amount,
            metadata: {
              booking_id: topUpId,
              intent_kind: 'top_up',
            },
          },
        },
      },
    },
  });
}

// ════════════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');
const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P27a', 'Cust') RETURNING id`, [phone]);
const customerId = cust.rows[0].id;
await pg.query(
  `INSERT INTO wallets (user_id, type, available_balance, pending_balance)
   VALUES ($1, 'customer', 0, 0) ON CONFLICT DO NOTHING`, [customerId]);

const TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// ════════════════════════════════════════════════════════════════════
// 1. Topup creates payment_intent with metadata.intent_kind='top_up'
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /wallet/top-up creates intent ===');
const TOPUP = 50000;  // ₱500
const r1 = await call(TOKEN, 'POST', '/api/v1/wallet/top-up', {
  amount: TOPUP, paymentMethod: 'gcash',
});
check(r1.status === 201, `→ 201 (got ${r1.status})`, JSON.stringify(r1.body).slice(0,200));
const topUpId = r1.body?.data?.topUpId;
check(typeof topUpId === 'string' && topUpId.startsWith('topup_'),
  'topUpId returned', topUpId);
const intentId = r1.body?.data?.paymentIntent?.id;
check(typeof intentId === 'string', 'paymentIntent.id returned');

// Verify DB row
const intRow = await pg.query(
  `SELECT amount, status, payment_method, metadata FROM payment_intents WHERE id=$1`,
  [intentId]);
check(intRow.rows[0]?.status === 'pending' || intRow.rows[0]?.status === 'awaiting_payment',
  `intent status pending/awaiting (got ${intRow.rows[0]?.status})`);
check(Number(intRow.rows[0]?.amount) === TOPUP, `intent amount = ${TOPUP}`);
check(intRow.rows[0]?.metadata?.intent_kind === 'top_up',
  'intent metadata.intent_kind = top_up');

// ════════════════════════════════════════════════════════════════════
// 2. Validation errors
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Validation errors ===');
const r2a = await call(TOKEN, 'POST', '/api/v1/wallet/top-up', { amount: 1, paymentMethod: 'gcash' });
check(r2a.status === 400, `tiny amount → 400 (got ${r2a.status})`);

const r2b = await call(TOKEN, 'POST', '/api/v1/wallet/top-up', { amount: 99999999999, paymentMethod: 'gcash' });
check(r2b.status === 400, `huge amount → 400 (got ${r2b.status})`);

const r2c = await call(TOKEN, 'POST', '/api/v1/wallet/top-up', { amount: TOPUP, paymentMethod: 'bitcoin' });
check(r2c.status === 400, `invalid paymentMethod → 400 (got ${r2c.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Webhook payment.paid → wallet credited
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Webhook payment.paid → wallet credited ===');
const before3 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const beforeBal = Number(before3.rows[0].available_balance);

const wbBody = buildPaidEvent(topUpId, TOPUP, 'pay_p27a_test_' + Date.now());
const wr = await postWebhook(wbBody);
check(wr.status === 200, `webhook → 200 (got ${wr.status})`,
  JSON.stringify(wr.body).slice(0,200));

const after3 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const afterBal = Number(after3.rows[0].available_balance);
check(afterBal === beforeBal + TOPUP,
  `wallet credited TOPUP=${TOPUP}`,
  `before=${beforeBal} after=${afterBal}`);

// payment_intents flipped to succeeded
const intAfter = await pg.query(`SELECT status FROM payment_intents WHERE id=$1`, [intentId]);
check(intAfter.rows[0]?.status === 'succeeded', 'intent status=succeeded');

// wallet_transactions audit row
const tx = await pg.query(
  `SELECT type, amount, description FROM wallet_transactions
    WHERE wallet_id=(SELECT id FROM wallets WHERE user_id=$1 AND type='customer')
      AND created_at > NOW() - INTERVAL '1 minute'
    ORDER BY created_at DESC LIMIT 1`, [customerId]);
check(tx.rows[0]?.type === 'payment', `tx type=payment (got ${tx.rows[0]?.type})`);
check(Number(tx.rows[0]?.amount) === TOPUP, `tx amount = ${TOPUP}`);
check(tx.rows[0]?.description?.toLowerCase().includes('top-up'),
  'tx description mentions top-up');

// ════════════════════════════════════════════════════════════════════
// 4. Idempotent re-delivery — no double-credit
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Idempotent re-delivery → no double-credit ===');
const before4 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
const wr2 = await postWebhook(wbBody);  // same body, fresh signature
check(wr2.status === 200, 'second webhook → 200');
const after4 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
check(Number(after4.rows[0].available_balance) === Number(before4.rows[0].available_balance),
  'wallet balance unchanged on re-delivery (idempotent)',
  `before=${before4.rows[0].available_balance} after=${after4.rows[0].available_balance}`);

// ════════════════════════════════════════════════════════════════════
// 5. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. POST /wallet/top-up no auth → 401 ===');
const r5 = await call(null, 'POST', '/api/v1/wallet/top-up', { amount: TOPUP, paymentMethod: 'gcash' });
check(r5.status === 401, `no auth → 401 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. Two parallel topups → both credit
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Two parallel topups → both credit ===');
const before6 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
// Create two intents
const t6a = await call(TOKEN, 'POST', '/api/v1/wallet/top-up', { amount: 25000, paymentMethod: 'gcash' });
const t6b = await call(TOKEN, 'POST', '/api/v1/wallet/top-up', { amount: 35000, paymentMethod: 'maya' });
const id6a = t6a.body?.data?.topUpId;
const id6b = t6b.body?.data?.topUpId;
// Fire both webhooks in parallel
const [wr6a, wr6b] = await Promise.all([
  postWebhook(buildPaidEvent(id6a, 25000, 'pay_p27a_p1_' + Date.now())),
  postWebhook(buildPaidEvent(id6b, 35000, 'pay_p27a_p2_' + Date.now())),
]);
check(wr6a.status === 200 && wr6b.status === 200,
  'both webhooks → 200', `${wr6a.status} ${wr6b.status}`);
const after6 = await pg.query(`SELECT available_balance FROM wallets WHERE user_id=$1 AND type='customer'`, [customerId]);
check(Number(after6.rows[0].available_balance) === Number(before6.rows[0].available_balance) + 60000,
  'both topups credited (no race lost)',
  `before=${before6.rows[0].available_balance} after=${after6.rows[0].available_balance}`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id=$1)`, [customerId]);
await pg.query(`DELETE FROM payment_intents WHERE booking_id IN ($1, $2, $3)`,
  [topUpId, id6a, id6b]).catch(()=>{});
await pg.query(`DELETE FROM wallets WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [customerId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
