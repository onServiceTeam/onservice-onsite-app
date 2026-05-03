// Phase 25d — verify DSR mark-complete + NPC-escalate now write audit rows
// after migration 121 added back the silently-dropped verbs.
//
// Pre-fix (Phase 19 → 24): writeAdminAction() try/catch swallowed every
// CHECK violation, so DSR completion succeeded but the NPC RA 10173 §22
// processing-activity record was silently dropped.

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
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,200) }; }
  return { status: r.status, body: j };
}

async function countVerb(verb) {
  const r = await pg.query(`SELECT COUNT(*)::int AS c FROM admin_actions WHERE action_type=$1`, [verb]);
  return r.rows[0].c;
}

const beforeComplete = await countVerb('dsr_marked_complete');
const beforeEscalate = await countVerb('dsr_escalated_to_npc');

// Setup: a customer with two pending DSRs
const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const u = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'Phase25d', 'DsrCust') RETURNING id`,
  [phone]);
const userId = u.rows[0].id;

async function makeDsr(type) {
  const r = await pg.query(
    `INSERT INTO data_subject_requests
       (user_id, request_type, status, user_message, due_at)
     VALUES ($1, $2, 'received', 'Phase 25d test', NOW() + INTERVAL '15 days')
     RETURNING id`,
    [userId, type]);
  return r.rows[0].id;
}

const dsrComplete = await makeDsr('access');
const dsrEscalate = await makeDsr('erasure');

// 1. Mark complete via real route
console.log('\n=== 1. POST /admin/compliance/dsr/:id/complete ===');
const c1 = await call('POST', `/api/v1/admin/compliance/dsr/${dsrComplete}/complete`, {
  responsePayloadUrl: 'https://example.com/phase25d-export.zip',
  adminNotes: 'Phase 25d audit-row landing test',
});
check([200,201].includes(c1.status), `complete → 2xx (got ${c1.status})`,
  JSON.stringify(c1.body).slice(0,200));

const dbA = await pg.query(`SELECT status FROM data_subject_requests WHERE id=$1`, [dsrComplete]);
check(dbA.rows[0]?.status === 'completed', 'DSR status=completed');

const afterComplete = await countVerb('dsr_marked_complete');
check(afterComplete === beforeComplete + 1,
  `dsr_marked_complete row landed (before=${beforeComplete} after=${afterComplete})`);

// Verify the row was correctly bound
const auditRow = await pg.query(
  `SELECT admin_id, target_type, target_id, action_type FROM admin_actions
    WHERE target_id=$1 AND action_type='dsr_marked_complete'`, [dsrComplete]);
check(auditRow.rows[0]?.admin_id === SUPER_ADMIN_ID, 'admin_id captured');
check(auditRow.rows[0]?.target_type === 'dsr_request', 'target_type=dsr_request');

// 2. Escalate to NPC via real route
console.log('\n=== 2. POST /admin/compliance/dsr/:id/escalate ===');
const c2 = await call('POST', `/api/v1/admin/compliance/dsr/${dsrEscalate}/escalate`, {
  npcReference: 'NPC-2026-P25D' + String(Math.floor(Math.random()*9000)+1000),
  reason: 'Phase 25d test — escalating to NPC for regulator handoff verification with sufficient detail.',
});
check([200,201].includes(c2.status), `escalate → 2xx (got ${c2.status})`,
  JSON.stringify(c2.body).slice(0,200));

const afterEscalate = await countVerb('dsr_escalated_to_npc');
check(afterEscalate === beforeEscalate + 1,
  `dsr_escalated_to_npc row landed (before=${beforeEscalate} after=${afterEscalate})`);

// Cleanup
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1, $2)`,
  [dsrComplete, dsrEscalate]);
await pg.query(`DELETE FROM data_subject_requests WHERE id IN ($1, $2)`,
  [dsrComplete, dsrEscalate]);
await pg.query(`DELETE FROM users WHERE id=$1`, [userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,200) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
