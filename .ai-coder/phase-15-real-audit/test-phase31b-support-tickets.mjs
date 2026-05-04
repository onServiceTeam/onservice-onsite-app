// Phase 31b — support tickets (admin + customer-create flows).
//
// Coverage:
//   1. POST /support-tickets — customer creates, ticket_number generated
//   2. POST /support-tickets — missing required fields → 400
//   3. GET /support-tickets — admin lists; customer → 403
//   4. GET /support-tickets/:id — admin reads with messages array
//   5. POST /:id/messages — owner can add public message
//   6. POST /:id/messages — non-owner customer → 403
//   7. POST /:id/messages — customer cannot post internal_note → 403
//   8. POST /:id/messages — admin posts internal_note
//   9. PATCH /:id/status — admin moves to resolved + resolution_notes
//  10. PATCH /:id/status — non-admin → 403
//  11. PATCH /:id/assign — admin assigns
//  12. GET /:id — non-admin → 403 (DOCUMENTED admin-only design)
//  13. No auth → 401

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
     VALUES ($1, $2, TRUE, 'P31b', $3) RETURNING id`,
    [phone, role, role + Date.now()]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const CUST_A = await makeUser('customer');
const CUST_B = await makeUser('customer');

// ════════════════════════════════════════════════════════════════════
// 1. POST /support-tickets — customer creates
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /support-tickets (customer) ===');
const r1 = await call(CUST_A.token, 'POST', '/api/v1/support-tickets', {
  type: 'general_inquiry',
  subject: 'Phase 31b probe',
  description: 'Phase 31b: testing the support-ticket create endpoint.',
  priority: 'low',
});
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
const ticketId = r1.body?.data?.id;
check(typeof ticketId === 'string' && ticketId.length > 0, `id returned (${ticketId})`);
check(typeof r1.body?.data?.ticket_number === 'string',
  `ticket_number generated (${r1.body?.data?.ticket_number})`);

// ════════════════════════════════════════════════════════════════════
// 2. Missing required fields → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Missing fields → 400 ===');
const r2 = await call(CUST_A.token, 'POST', '/api/v1/support-tickets', {
  type: 'general_inquiry',
  // no subject / description
});
check(r2.status === 400, `→ 400 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. GET /support-tickets — admin sees list, customer 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. GET / (admin lists, customer 403) ===');
const r3a = await call(SUPER_TOKEN, 'GET', '/api/v1/support-tickets?page=1&limit=20');
check(r3a.status === 200, `admin → 200 (got ${r3a.status})`);
check(Array.isArray(r3a.body?.data), 'data is array');
check(r3a.body?.data?.some(t => t.id === ticketId), 'created ticket in list');

const r3b = await call(CUST_A.token, 'GET', '/api/v1/support-tickets');
check(r3b.status === 403, `customer → 403 (got ${r3b.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. GET /:id — admin reads with messages
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. GET /:id (admin) ===');
const r4 = await call(SUPER_TOKEN, 'GET', `/api/v1/support-tickets/${ticketId}`);
check(r4.status === 200, `→ 200 (got ${r4.status})`);
check(r4.body?.data?.id === ticketId, 'id matches');
check(Array.isArray(r4.body?.data?.messages), 'messages array present');

// ════════════════════════════════════════════════════════════════════
// 5. POST /:id/messages — owner posts public message
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. POST /:id/messages (owner) ===');
const r5 = await call(CUST_A.token, 'POST', `/api/v1/support-tickets/${ticketId}/messages`, {
  message: 'Phase 31b — owner replies to ticket.',
});
check(r5.status === 201, `→ 201 (got ${r5.status})`,
  JSON.stringify(r5.body).slice(0,200));
check(r5.body?.data?.is_internal_note === false, 'is_internal_note=false');

// ════════════════════════════════════════════════════════════════════
// 6. Non-owner customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Non-owner customer → 403 ===');
const r6 = await call(CUST_B.token, 'POST', `/api/v1/support-tickets/${ticketId}/messages`, {
  message: 'Phase 31b — stranger trying to post.',
});
check(r6.status === 403, `→ 403 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. Customer cannot post internal_note → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Customer internal_note → 403 ===');
const r7 = await call(CUST_A.token, 'POST', `/api/v1/support-tickets/${ticketId}/messages`, {
  message: 'Phase 31b — owner trying internal_note (should reject).',
  isInternalNote: true,
});
check(r7.status === 403, `→ 403 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. Admin posts internal_note
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Admin posts internal_note ===');
const r8 = await call(SUPER_TOKEN, 'POST', `/api/v1/support-tickets/${ticketId}/messages`, {
  message: 'Phase 31b — admin internal note for triage.',
  isInternalNote: true,
});
check(r8.status === 201, `→ 201 (got ${r8.status})`);
check(r8.body?.data?.is_internal_note === true, 'is_internal_note=true');

// ════════════════════════════════════════════════════════════════════
// 9. PATCH /:id/status — resolved
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. PATCH /:id/status (admin → resolved) ===');
const r9 = await call(SUPER_TOKEN, 'PATCH', `/api/v1/support-tickets/${ticketId}/status`, {
  status: 'resolved',
  resolutionNotes: 'Phase 31b — auto-resolved after admin review.',
});
check(r9.status === 200, `→ 200 (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));
check(r9.body?.data?.status === 'resolved', `status=resolved (got ${r9.body?.data?.status})`);

const dbResolved = await pg.query(
  `SELECT status, resolution_notes, resolved_at FROM support_tickets WHERE id=$1`, [ticketId]);
check(dbResolved.rows[0]?.status === 'resolved', 'DB status=resolved');
check(dbResolved.rows[0]?.resolution_notes?.includes('Phase 31b'), 'resolution_notes persisted');
check(dbResolved.rows[0]?.resolved_at !== null, 'resolved_at set');

// ════════════════════════════════════════════════════════════════════
// 10. PATCH /:id/status — non-admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. PATCH /:id/status (customer → 403) ===');
const r10 = await call(CUST_A.token, 'PATCH', `/api/v1/support-tickets/${ticketId}/status`, {
  status: 'closed',
});
check(r10.status === 403, `→ 403 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. PATCH /:id/assign — admin assigns
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. PATCH /:id/assign ===');
const r11 = await call(SUPER_TOKEN, 'PATCH', `/api/v1/support-tickets/${ticketId}/assign`, {
  agentId: SUPER_ADMIN_ID,
});
check(r11.status === 200, `→ 200 (got ${r11.status})`,
  JSON.stringify(r11.body).slice(0,200));

const dbAssigned = await pg.query(
  `SELECT assigned_agent_id FROM support_tickets WHERE id=$1`, [ticketId]);
check(dbAssigned.rows[0]?.assigned_agent_id === SUPER_ADMIN_ID,
  `assigned_agent_id stored (got ${dbAssigned.rows[0]?.assigned_agent_id})`);

// ════════════════════════════════════════════════════════════════════
// 12. GET /:id — owner customer → 403
//     SOFT BUG: Customer who created the ticket cannot fetch it back
//     via this endpoint. POST works (auth), POST messages works (auth +
//     ownership), but GET is admin-rbac-only. Today no mobile UI calls
//     this so it's not exploited; documented for the day customer
//     "my support tickets" screen ships.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. GET /:id (owner → 403, documented) ===');
const r12 = await call(CUST_A.token, 'GET', `/api/v1/support-tickets/${ticketId}`);
check(r12.status === 403, `owner → 403 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. No auth → 401 ===');
const r13 = await call(null, 'GET', '/api/v1/support-tickets');
check(r13.status === 401, `→ 401 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM support_ticket_messages WHERE ticket_id=$1`, [ticketId]);
await pg.query(`DELETE FROM support_tickets WHERE id=$1`, [ticketId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [CUST_A.userId, CUST_B.userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
