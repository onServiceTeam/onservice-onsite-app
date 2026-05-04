// Phase 31d — customer-admin (admin Customer 360) + breach-log (DPO).
//
// Customer 360 routes (admin/super_admin):
//   1. GET /admin/customers/:id  → profile
//   2. GET /admin/customers/:id/bookings
//   3. GET /admin/customers/:id/payments
//   4. GET /admin/customers/:id/disputes
//   5. GET /admin/customers/:id/referrals
//   6. GET /admin/customers/:id/activity (PII mask: super_admin gets raw IP/UA)
//   7. PUT /admin/customers/:id/status (super_admin only — suspend/reactivate/flag_fraud)
//   8. POST /admin/customers/:id/credit (super_admin only — wallet credit)
//   9. customer/non-admin → 403 on profile
//  10. Bogus action → 400
//
// Breach-log routes (DPO + super_admin):
//  11. POST /admin/breach-log creates with valid type + scope
//  12. POST /admin/breach-log requires scope ≥ 10 chars → 400
//  13. POST /admin/breach-log rejects discoveredAt < occurredAt → 400
//  14. GET /admin/breach-log lists with sla72h fields enriched
//  15. GET /admin/breach-log?pendingNpcOnly=true filters
//  16. POST /:id/notify-npc rejects bad NPC ref format → 400
//  17. POST /:id/notify-npc accepts NPC-YYYY-XXXXXX format
//  18. POST /:id/notify-npc rejects re-notify → 409
//  19. PATCH /:id/status moves through investigating → mitigating
//  20. Non-DPO (admin role) → 403 on breach endpoints
//  21. admin_actions trail captures breach_logged + breach_npc_notified
//      + breach_status_changed verbs

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

// ════════════════════════════════════════════════════════════════════
// SETUP — a real customer
// ════════════════════════════════════════════════════════════════════
const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name, email)
   VALUES ($1, 'customer', TRUE, 'P31d', 'Cust', $2) RETURNING id`,
  [phone, `p31d_${Date.now()}@test.com`]);
const customerId = cust.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Plain admin (not super) for breach-log negative test
const adminPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const adminUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'admin', TRUE, 'P31d', 'Admin') RETURNING id`,
  [adminPhone]);
const adminId = adminUser.rows[0].id;
const ADMIN_TOKEN = jwt.sign(
  { userId: adminId, role: 'admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// ════════════════════════════════════════════════════════════════════
// 1. GET /admin/customers/:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /admin/customers/:id ===');
const r1 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}`);
check(r1.status === 200, `→ 200 (got ${r1.status})`, JSON.stringify(r1.body).slice(0,200));
check(r1.body?.data?.user?.id === customerId || r1.body?.data?.id === customerId,
  'profile id matches');

// ════════════════════════════════════════════════════════════════════
// 2. GET /:id/bookings
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. GET /:id/bookings ===');
const r2 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}/bookings?page=1&pageSize=10`);
check(r2.status === 200, `→ 200 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. GET /:id/payments
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. GET /:id/payments ===');
const r3 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}/payments`);
check(r3.status === 200, `→ 200 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. GET /:id/disputes
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. GET /:id/disputes ===');
const r4 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}/disputes`);
check(r4.status === 200, `→ 200 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. GET /:id/referrals
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /:id/referrals ===');
const r5 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}/referrals`);
check(r5.status === 200, `→ 200 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. GET /:id/activity
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET /:id/activity ===');
const r6 = await call(SUPER_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}/activity?limit=10`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. PUT /:id/status — super_admin suspends + reactivates
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. PUT /:id/status — suspend then reactivate ===');
const r7a = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/customers/${customerId}/status`,
  { action: 'suspend', reason: 'P31d testing suspension flow' });
check(r7a.status === 200, `suspend → 200 (got ${r7a.status})`,
  JSON.stringify(r7a.body).slice(0,200));

const r7b = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/customers/${customerId}/status`,
  { action: 'reactivate', reason: 'P31d testing reactivation' });
check(r7b.status === 200, `reactivate → 200 (got ${r7b.status})`);

const userState = await pg.query(`SELECT is_active FROM users WHERE id=$1`, [customerId]);
check(userState.rows[0]?.is_active === true, 'user is_active=true after reactivate');

// ════════════════════════════════════════════════════════════════════
// 8. POST /:id/credit — super_admin grants wallet credit
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. POST /:id/credit — wallet credit ===');
// Pre-create wallet (or service may create)
await pg.query(
  `INSERT INTO wallets (user_id, type, currency, available_balance)
   VALUES ($1, 'customer', 'PHP', 0)
   ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO NOTHING`,
  [customerId]);
const beforeBal = await pg.query(
  `SELECT available_balance::bigint AS b FROM wallets WHERE user_id=$1 AND type='customer'`,
  [customerId]);

const r8 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/customers/${customerId}/credit`,
  { amount: 50000, reason: 'P31d goodwill credit for audit testing' });
check(r8.status === 200, `→ 200 (got ${r8.status})`,
  JSON.stringify(r8.body).slice(0,200));

const afterBal = await pg.query(
  `SELECT available_balance::bigint AS b FROM wallets WHERE user_id=$1 AND type='customer'`,
  [customerId]);
check(Number(afterBal.rows[0].b) - Number(beforeBal.rows[0].b) === 50000,
  `wallet credited +50000 (before=${beforeBal.rows[0].b} after=${afterBal.rows[0].b})`);

// ════════════════════════════════════════════════════════════════════
// 9. customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. customer → 403 ===');
const r9 = await call(CUST_TOKEN, 'GET', `/api/v1/admin/customers/${customerId}`);
check(r9.status === 403, `→ 403 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. Bogus action → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Bogus action → 400 ===');
const r10 = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/customers/${customerId}/status`,
  { action: 'incinerate', reason: 'should reject' });
check(r10.status === 400, `→ 400 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. Breach-log: POST creates
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. POST /admin/breach-log (DPO/super_admin) ===');
const occurredAt = new Date(Date.now() - 6 * 3600_000).toISOString(); // 6h ago
const discoveredAt = new Date(Date.now() - 1 * 3600_000).toISOString(); // 1h ago
const r11 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/breach-log', {
  type: 'unauthorized_access',
  scope: 'Phase 31d test breach: simulated unauthorized access to test scope.',
  occurredAt,
  discoveredAt,
  affectedUserCount: 7,
});
check(r11.status === 201, `→ 201 (got ${r11.status})`,
  JSON.stringify(r11.body).slice(0,200));
const breachId = r11.body?.data?.id;
check(typeof breachId === 'string', `id returned (${breachId})`);
check(r11.body?.data?.status === 'investigating', `status=investigating`);
check(typeof r11.body?.data?.sla72hRemainingHours === 'number',
  `sla72hRemainingHours computed (${r11.body?.data?.sla72hRemainingHours})`);

// ════════════════════════════════════════════════════════════════════
// 12. POST scope < 10 chars → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Short scope → 400 ===');
const r12 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/breach-log', {
  type: 'data_loss', scope: 'too short', occurredAt, discoveredAt,
});
check(r12.status === 400, `→ 400 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. discoveredAt < occurredAt → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. discoveredAt < occurredAt → 400 ===');
const r13 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/breach-log', {
  type: 'data_loss',
  scope: 'Phase 31d backwards-time test, expected to be rejected.',
  occurredAt: discoveredAt,           // swapped
  discoveredAt: occurredAt,
});
check(r13.status === 400, `→ 400 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// 14. GET / lists with sla72h enriched
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. GET / lists with sla72h enriched ===');
const r14 = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/breach-log');
check(r14.status === 200, `→ 200 (got ${r14.status})`);
const ourBreach = r14.body?.data?.find(b => b.id === breachId);
check(ourBreach, 'created breach in list');
check(typeof ourBreach?.sla72hRemainingHours === 'number',
  'sla72h_remaining_hours present (number)');
check(ourBreach?.sla72hExpired === false, 'sla72h_expired=false (1h ago)');

// ════════════════════════════════════════════════════════════════════
// 15. ?pendingNpcOnly=true filter
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. ?pendingNpcOnly=true ===');
const r15 = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/breach-log?pendingNpcOnly=true');
check(r15.status === 200, `→ 200 (got ${r15.status})`);
check(r15.body?.data?.some(b => b.id === breachId), 'pending breach included');
check(r15.body?.data?.every(b => b.npcNotifiedAt === null),
  'all returned have npc_notified_at=null');

// ════════════════════════════════════════════════════════════════════
// 16. notify-npc bad ref → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. notify-npc bad ref → 400 ===');
const r16 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/breach-log/${breachId}/notify-npc`, {
  npcReference: 'NPC-2026-A1B2C3XYZ_garbage',
});
check(r16.status === 400, `→ 400 (got ${r16.status})`);

// ════════════════════════════════════════════════════════════════════
// 17. notify-npc valid → 200
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. notify-npc valid format ===');
const r17 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/breach-log/${breachId}/notify-npc`, {
  npcReference: 'NPC-2026-A1B2C3',
});
check(r17.status === 200, `→ 200 (got ${r17.status})`,
  JSON.stringify(r17.body).slice(0,200));
check(r17.body?.data?.npcReference === 'NPC-2026-A1B2C3', 'npcReference stored');
check(r17.body?.data?.status === 'reported', `status auto-advanced to reported`);
check(r17.body?.data?.npcNotifiedAt !== null, 'npc_notified_at set');

// ════════════════════════════════════════════════════════════════════
// 18. notify-npc twice → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 18. notify-npc twice → 409 ===');
const r18 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/breach-log/${breachId}/notify-npc`, {
  npcReference: 'NPC-2026-Z9Y8X7',
});
check(r18.status === 409, `→ 409 (got ${r18.status})`);

// ════════════════════════════════════════════════════════════════════
// 19. PATCH /:id/status investigating → mitigating
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 19. PATCH /:id/status mitigating ===');
const r19 = await call(SUPER_TOKEN, 'PATCH', `/api/v1/admin/breach-log/${breachId}/status`, {
  status: 'mitigating',
  remediationSummary: 'Phase 31d: rotated all credentials and disabled affected accounts.',
});
check(r19.status === 200, `→ 200 (got ${r19.status})`,
  JSON.stringify(r19.body).slice(0,200));
check(r19.body?.data?.status === 'mitigating', `status=mitigating`);
check(r19.body?.data?.remediationSummary?.includes('Phase 31d'), 'remediation persisted');

// ════════════════════════════════════════════════════════════════════
// 20. Plain admin role → 403 on breach-log
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 20. plain admin → 403 ===');
const r20 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/breach-log');
check(r20.status === 403, `→ 403 (got ${r20.status})`);

// ════════════════════════════════════════════════════════════════════
// 21. admin_actions trail captures all 3 verbs
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 21. admin_actions trail captures all verbs ===');
const audVerbs = await pg.query(
  `SELECT action_type FROM admin_actions
     WHERE target_type='breach' AND target_id=$1
   ORDER BY created_at ASC`, [breachId]);
const verbs = audVerbs.rows.map(r => r.action_type);
check(verbs.includes('breach_logged'), 'breach_logged audited');
check(verbs.includes('breach_npc_notified'), 'breach_npc_notified audited');
check(verbs.includes('breach_status_changed'), 'breach_status_changed audited');

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id=$1`, [breachId]);
await pg.query(`DELETE FROM admin_actions WHERE target_id=$1`, [customerId]);
await pg.query(`DELETE FROM breach_log WHERE id=$1`, [breachId]);
await pg.query(`DELETE FROM wallet_transactions WHERE wallet_id=(SELECT id FROM wallets WHERE user_id=$1 AND type='customer')`,
  [customerId]);
await pg.query(`DELETE FROM wallets WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [customerId, adminId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
