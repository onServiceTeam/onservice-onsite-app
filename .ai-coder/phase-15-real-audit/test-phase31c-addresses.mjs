// Phase 31c — address book CRUD.
//
// Coverage:
//   1. POST /addresses — first address auto-default
//   2. POST /addresses — second address with isDefault=true demotes the first
//   3. POST /addresses — third with no flag stays non-default
//   4. GET /addresses — list ordered (default first, then created DESC)
//   5. GET /addresses/:id — owner reads
//   6. GET /addresses/:id — stranger → 404
//   7. PATCH /addresses/:id — partial update (label, isDefault)
//   8. DELETE /addresses/:id — non-default delete
//   9. DELETE /addresses/:id — default delete promotes oldest remaining
//  10. POST /addresses — 11th address rejected (MAX_ADDRESSES_PER_USER=10)
//  11. PATCH stranger → 404
//  12. No auth → 401
//  13. Validator missing required fields → 400

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

async function makeUser() {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, 'customer', TRUE, 'P31c', 'A' || ${Date.now()}) RETURNING id`,
    [phone]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role: 'customer', type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const ALICE = await makeUser();
const BOB = await makeUser();

const sample = (label, defaults = {}) => ({
  label,
  fullAddress: '123 Phase 31c St, Brgy ' + label,
  barangay: 'Manoc-Manoc',
  city: 'Boracay',
  province: 'Aklan',
  region: 'Region VI',
  zipCode: '5608',
  latitude: 11.97,
  longitude: 121.93,
  ...defaults,
});

// ════════════════════════════════════════════════════════════════════
// 1. First address auto-default
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. First address auto-default ===');
const r1 = await call(ALICE.token, 'POST', '/api/v1/addresses', sample('Home')   /* label enum: Home|Work|Other */);
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
check(r1.body?.data?.isDefault === true, `auto-default=true (got ${r1.body?.data?.isDefault})`);
const addr1 = r1.body.data.id;

// ════════════════════════════════════════════════════════════════════
// 2. Second w/ isDefault=true demotes the first
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. New default demotes the first ===');
const r2 = await call(ALICE.token, 'POST', '/api/v1/addresses',
  sample('Work', { isDefault: true }));
check(r2.status === 201, `→ 201 (got ${r2.status})`,
  JSON.stringify(r2.body).slice(0,300));
check(r2.body?.data?.isDefault === true, 'new isDefault=true');
const addr2 = r2.body.data.id;

const dbState1 = await pg.query(
  `SELECT id, is_default FROM user_addresses WHERE user_id=$1 ORDER BY created_at`,
  [ALICE.userId]);
check(dbState1.rows.length === 2, '2 addresses');
check(dbState1.rows.find(r => r.id === addr1)?.is_default === false, 'addr1 demoted');
check(dbState1.rows.find(r => r.id === addr2)?.is_default === true, 'addr2 default');

// ════════════════════════════════════════════════════════════════════
// 3. Third with no flag stays non-default
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Third addr stays non-default ===');
const r3 = await call(ALICE.token, 'POST', '/api/v1/addresses', sample('Other'));
const addr3 = r3.body.data.id;
check(r3.body?.data?.isDefault === false, 'isDefault=false');

// ════════════════════════════════════════════════════════════════════
// 4. GET / ordered
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. GET / ordered ===');
const r4 = await call(ALICE.token, 'GET', '/api/v1/addresses');
check(r4.status === 200, '→ 200');
check(r4.body?.data?.[0]?.id === addr2, 'default first (addr2)');
check(r4.body?.data?.length === 3, `3 rows (got ${r4.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 5. GET /:id owner
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /:id owner ===');
const r5 = await call(ALICE.token, 'GET', `/api/v1/addresses/${addr1}`);
check(r5.status === 200, `→ 200 (got ${r5.status})`);
check(r5.body?.data?.label === 'Home', `label=Home (got ${r5.body?.data?.label})`);
// Note: address.label is a closed enum (Home|Work|Other) per validators.

// ════════════════════════════════════════════════════════════════════
// 6. Stranger GET → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Stranger GET → 404 ===');
const r6 = await call(BOB.token, 'GET', `/api/v1/addresses/${addr1}`);
check(r6.status === 404, `→ 404 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. PATCH partial — relabel + flip default
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. PATCH /:id ===');
const r7 = await call(ALICE.token, 'PATCH', `/api/v1/addresses/${addr3}`,
  { label: 'Work', isDefault: true });
check(r7.status === 200, `→ 200 (got ${r7.status})`,
  JSON.stringify(r7.body).slice(0,200));
check(r7.body?.data?.label === 'Work', 'label updated');
check(r7.body?.data?.isDefault === true, 'isDefault=true');

const dbState2 = await pg.query(
  `SELECT id, is_default FROM user_addresses WHERE user_id=$1`, [ALICE.userId]);
const defaultIds = dbState2.rows.filter(r => r.is_default).map(r => r.id);
check(defaultIds.length === 1 && defaultIds[0] === addr3,
  `exactly 1 default (=${addr3})`);

// ════════════════════════════════════════════════════════════════════
// 8. DELETE non-default
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. DELETE non-default ===');
const r8 = await call(ALICE.token, 'DELETE', `/api/v1/addresses/${addr1}`);
check(r8.status === 200, `→ 200 (got ${r8.status})`);
const remaining1 = await pg.query(
  `SELECT COUNT(*)::int AS c FROM user_addresses WHERE user_id=$1`, [ALICE.userId]);
check(remaining1.rows[0].c === 2, `2 remain (got ${remaining1.rows[0].c})`);

// ════════════════════════════════════════════════════════════════════
// 9. DELETE default → oldest remaining promoted
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. DELETE default promotes oldest ===');
const r9 = await call(ALICE.token, 'DELETE', `/api/v1/addresses/${addr3}`);
check(r9.status === 200, `→ 200 (got ${r9.status})`);
const dbState3 = await pg.query(
  `SELECT id, is_default FROM user_addresses WHERE user_id=$1`, [ALICE.userId]);
check(dbState3.rows.length === 1, '1 remains');
check(dbState3.rows[0]?.is_default === true,
  `last remaining (addr2) is now default (got ${dbState3.rows[0]?.is_default})`);
check(dbState3.rows[0]?.id === addr2, 'and it is addr2');

// ════════════════════════════════════════════════════════════════════
// 10. MAX_ADDRESSES_PER_USER=10
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. 11th address → 400 ===');
// Currently Alice has 1; create 9 more (cycling labels), then expect 11th to fail
const labels = ['Home', 'Work', 'Other'];
for (let i = 2; i <= 10; i++) {
  const rN = await call(ALICE.token, 'POST', '/api/v1/addresses', sample(labels[i % 3]));
  if (rN.status !== 201) { fail++; console.log('  ✗ filler create #'+i+' got', rN.status, JSON.stringify(rN.body).slice(0,150)); }
}
const r10 = await call(ALICE.token, 'POST', '/api/v1/addresses', sample('Other'));
check(r10.status === 400, `→ 400 (got ${r10.status})`,
  JSON.stringify(r10.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 11. PATCH stranger → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. PATCH stranger → 404 ===');
const r11 = await call(BOB.token, 'PATCH', `/api/v1/addresses/${addr2}`, { label: 'Home' });
check(r11.status === 404, `→ 404 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. No auth → 401 ===');
const r12 = await call(null, 'GET', '/api/v1/addresses');
check(r12.status === 401, `→ 401 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. Validator missing fields → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. Missing required fields → 400 ===');
const r13 = await call(ALICE.token, 'POST', '/api/v1/addresses', { label: 'X' });
check(r13.status === 400, `→ 400 (got ${r13.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM user_addresses WHERE user_id IN ($1,$2)`,
  [ALICE.userId, BOB.userId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [ALICE.userId, BOB.userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
