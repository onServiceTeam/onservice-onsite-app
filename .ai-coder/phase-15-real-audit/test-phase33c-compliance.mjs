// Phase 33c — public compliance routes (DSR + consent + my-pending-consents).
//
// Coverage:
//   1. POST /compliance/dsr — creates DSR with valid request_type
//   2. POST /compliance/dsr — bogus request_type → 400
//   3. POST /compliance/dsr — missing request_type → 400
//   4. POST /compliance/dsr — 6th in 24h → 429 (LAUNCH-LIMITATIONS #4)
//   5. GET /compliance/my-requests — lists DSR history
//   6. GET /compliance/my-requests?limit=2 — respects limit
//   7. GET /compliance/my-pending-consents — returns array
//   8. POST /compliance/consent — records grant
//   9. POST /compliance/consent — records revoke (granted=false)
//  10. POST /compliance/consent — both granted=true and granted=false
//      coexist as separate rows (history preserved)
//  11. due_at is set 15 days ahead per NPC RA 10173 §16
//  12. No auth → 401

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
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

const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const u = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P33c', 'Cust') RETURNING id`, [phone]);
const userId = u.rows[0].id;
const TOKEN = jwt.sign(
  { userId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// ════════════════════════════════════════════════════════════════════
// 1. POST /compliance/dsr valid
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /compliance/dsr (access) ===');
const r1 = await call(TOKEN, 'POST', '/api/v1/compliance/dsr', {
  requestType: 'access',
  userMessage: 'Phase 33c test — please send me my data.',
});
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
const dsrId = r1.body?.data?.id;
check(typeof dsrId === 'string', `id returned (${dsrId})`);

// ════════════════════════════════════════════════════════════════════
// 11. due_at = received_at + 15 days
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. due_at ~15d ahead ===');
const dsrRow = await pg.query(
  `SELECT received_at, due_at FROM data_subject_requests WHERE id=$1`, [dsrId]);
const daysBetween = (new Date(dsrRow.rows[0].due_at).getTime() -
                     new Date(dsrRow.rows[0].received_at).getTime()) / 86400000;
check(daysBetween > 14 && daysBetween < 16,
  `due_at ~15d after received_at (got ${daysBetween.toFixed(2)}d)`);

// ════════════════════════════════════════════════════════════════════
// 2. POST bogus type → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. POST bogus type → 400 ===');
const r2 = await call(TOKEN, 'POST', '/api/v1/compliance/dsr', {
  requestType: 'incinerate',
});
check(r2.status === 400, `→ 400 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. POST missing type → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. POST no type → 400 ===');
const r3 = await call(TOKEN, 'POST', '/api/v1/compliance/dsr', {});
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. 24h rate limit (4 more so we're at 5; 6th → 429)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. 5 in 24h → 429 ===');
for (let i = 2; i <= 5; i++) {
  const rN = await call(TOKEN, 'POST', '/api/v1/compliance/dsr', {
    requestType: 'access',
    userMessage: `Phase 33c filler ${i}`,
  });
  if (rN.status !== 201) { fail++; console.log('  ✗ filler', i, 'got', rN.status); }
}
const r4 = await call(TOKEN, 'POST', '/api/v1/compliance/dsr', {
  requestType: 'access',
  userMessage: 'Phase 33c — 6th request',
});
check(r4.status === 429, `→ 429 (got ${r4.status})`,
  JSON.stringify(r4.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 5. GET /my-requests
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /my-requests ===');
const r5 = await call(TOKEN, 'GET', '/api/v1/compliance/my-requests');
check(r5.status === 200, `→ 200 (got ${r5.status})`);
check(Array.isArray(r5.body?.data), 'data is array');
check(r5.body?.data?.length === 5, `5 DSRs (got ${r5.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 6. ?limit=2
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. ?limit=2 ===');
const r6 = await call(TOKEN, 'GET', '/api/v1/compliance/my-requests?limit=2');
check(r6.body?.data?.length === 2, `2 returned (got ${r6.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 7. GET /my-pending-consents
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. GET /my-pending-consents ===');
const r7 = await call(TOKEN, 'GET', '/api/v1/compliance/my-pending-consents');
check(r7.status === 200, `→ 200 (got ${r7.status})`);
check(Array.isArray(r7.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 8. POST /consent — grant
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. POST /consent grant ===');
const r8 = await call(TOKEN, 'POST', '/api/v1/compliance/consent', {
  consentType: 'marketing_consent',
  version: 'v1.0',
  granted: true,
});
check(r8.status === 201, `→ 201 (got ${r8.status})`,
  JSON.stringify(r8.body).slice(0,200));

const grantRow = await pg.query(
  `SELECT granted FROM consent_records
     WHERE user_id=$1 AND consent_type='marketing_consent' ORDER BY granted_at DESC LIMIT 1`,
  [userId]);
check(grantRow.rows[0]?.granted === true, 'DB granted=true');

// ════════════════════════════════════════════════════════════════════
// 9. POST /consent — revoke
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. POST /consent revoke ===');
const r9 = await call(TOKEN, 'POST', '/api/v1/compliance/consent', {
  consentType: 'marketing_consent',
  version: 'v1.0',
  granted: false,
});
check(r9.status === 201, `→ 201 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. Both rows coexist (history preserved)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Grant + revoke both kept ===');
const allRows = await pg.query(
  `SELECT granted FROM consent_records
     WHERE user_id=$1 AND consent_type='marketing_consent'`, [userId]);
check(allRows.rows.length === 2, `2 rows (got ${allRows.rows.length})`);
check(allRows.rows.some(r => r.granted === true), 'grant row present');
check(allRows.rows.some(r => r.granted === false), 'revoke row present');

// ════════════════════════════════════════════════════════════════════
// 11b. BUG-PHASE33-01 fix verified: bogus consent_type now → 400
//      (was 500 — DB CHECK constraint surfacing through to user).
//      Service layer now pre-validates against the same allow-list as
//      migration 080's consent_records_type_valid CHECK.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11b. Bogus consent_type → 400 (BUG-PHASE33-01) ===');
const r11b = await call(TOKEN, 'POST', '/api/v1/compliance/consent', {
  consentType: 'totally_made_up_type',
  version: 'v1.0',
  granted: true,
});
check(r11b.status === 400, `→ 400 (got ${r11b.status})`,
  JSON.stringify(r11b.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 12. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. No auth → 401 ===');
const r12 = await call(null, 'POST', '/api/v1/compliance/dsr', { requestType: 'access' });
check(r12.status === 401, `→ 401 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM consent_records WHERE user_id=$1`, [userId]);
await pg.query(`DELETE FROM data_subject_requests WHERE user_id=$1`, [userId]);
await pg.query(`DELETE FROM audit_log WHERE user_id=$1`, [userId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
