// Phase 30b — PII reveal flow.
//
// Coverage:
//   1. POST /admin/audit-log/:id/reveal-pii returns raw audit_log row
//   2. admin_actions row written with action_type='pii_reveal'
//   3. target_id = audit_log id
//   4. details.audit_log_id stored
//   5. reason < 20 chars → 400
//   6. Bogus auditLogId → 404
//   7. Non-super-admin → 403
//   8. No auth → 401

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
// Setup: a customer + a sample audit_log row containing PII
// ════════════════════════════════════════════════════════════════════
const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name, email)
   VALUES ($1, 'customer', TRUE, 'P30b', 'Cust', $2) RETURNING id`,
  [phone, `p30b_${Date.now()}@test.com`]);
const customerId = cust.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Insert an audit_log row with raw PII
const aud = await pg.query(
  `INSERT INTO audit_log (user_id, action, entity_type, entity_id,
                          old_values, new_values,
                          ip_address, user_agent)
   VALUES ($1, 'POST /api/v1/test', 'test', NULL,
           '{"phone": "+639171234567"}'::jsonb,
           '{"email": "phase30b@example.com"}'::jsonb,
           '203.123.45.67'::inet,
           'Mozilla/5.0 (iPhone; OS 18_0) AppleWebKit/605.1.15 (KHTML, like Gecko)')
   RETURNING id`,
  [customerId]);
const auditLogId = aud.rows[0].id;

// ════════════════════════════════════════════════════════════════════
// 1. Super-admin reveals PII
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /admin/audit-log/:id/reveal-pii → 200 ===');
const r1 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/audit-log/${auditLogId}/reveal-pii`, {
  reason: 'Phase 30b — testing PII reveal endpoint with proper reason length.',
});
check(r1.status === 200, `→ 200 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));

// 1b. Returns raw IP and user-agent (unmasked)
check(r1.body?.data?.ip_address?.includes('203.123.45.67'),
  `raw IP returned (got ${r1.body?.data?.ip_address})`);
check(r1.body?.data?.user_agent?.includes('iPhone'),
  `raw user_agent returned (got ${String(r1.body?.data?.user_agent).slice(0,40)})`);
check(r1.body?.data?.old_values?.phone === '+639171234567',
  'raw phone in old_values returned');
check(r1.body?.data?.new_values?.email === 'phase30b@example.com',
  'raw email in new_values returned');

// ════════════════════════════════════════════════════════════════════
// 2. admin_actions row written
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. admin_actions pii_reveal row written ===');
const audAction = await pg.query(
  `SELECT admin_id, action_type, target_id, target_type, details, reason
     FROM admin_actions WHERE target_id=$1 AND action_type='pii_reveal'`,
  [auditLogId]);
check(audAction.rows.length === 1, 'pii_reveal row present');
check(audAction.rows[0]?.admin_id === SUPER_ADMIN_ID, 'admin_id captured');
check(audAction.rows[0]?.target_type === 'system', 'target_type=system');
check(audAction.rows[0]?.details?.audit_log_id === auditLogId, 'details.audit_log_id stored');
check(audAction.rows[0]?.reason?.includes('Phase 30b'), 'reason persisted');

// ════════════════════════════════════════════════════════════════════
// 5. Reason < 20 chars → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Short reason → 400 ===');
const r5 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/audit-log/${auditLogId}/reveal-pii`, {
  reason: 'too short',
});
check(r5.status === 400, `→ 400 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. Bogus auditLogId → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Bogus auditLogId → 404 ===');
const r6 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/audit-log/00000000-0000-0000-0000-000000000000/reveal-pii`, {
  reason: 'Phase 30b — non-existent audit log row test reveal.',
});
check(r6.status === 404, `→ 404 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. Non-super-admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Customer → 403 ===');
const r7 = await call(CUST_TOKEN, 'POST', `/api/v1/admin/audit-log/${auditLogId}/reveal-pii`, {
  reason: 'Phase 30b — customer trying to reveal PII; should be rejected.',
});
check(r7.status === 403, `→ 403 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. No auth → 401 OR 403 (CSRF middleware runs first per Phase 25a;
//    no-auth POST gets 403 csrf_invalid before authMiddleware fires)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. No auth → 401 or 403 ===');
const r8 = await call(null, 'POST', `/api/v1/admin/audit-log/${auditLogId}/reveal-pii`, {
  reason: 'Phase 30b — no auth attempt; should be rejected.',
});
check([401, 403].includes(r8.status), `→ 401 or 403 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id=$1`, [auditLogId]);
await pg.query(`DELETE FROM audit_log WHERE id=$1`, [auditLogId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [customerId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
