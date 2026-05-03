// Phase 28c — business account end-to-end.
//
// Coverage:
//   1. POST /business creates account, owner is creator
//   2. Invalid businessType → 400
//   3. Invalid paymentTerms → 400
//   4. Missing required field → 400
//   5. GET /business lists owner's accounts
//   6. GET /business/:id returns full detail (owner)
//   7. Other user trying to GET → 403/404
//   8. PATCH /business/:id updates (owner only)
//   9. POST /business/:id/members adds member with role
//  10. DELETE /business/:id/members/:userId removes member
//  11. Cannot remove owner via member-delete
//  12. POST /business/:id/transfer-ownership flips owner; admin_actions row written
//  13. POST /business/:id/contracts creates a contract
//  14. GET /business/:id/contracts lists contracts
//  15. POST .../contracts/:id/cancel marks cancelled

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

// ════════════════════════════════════════════════════════════════════
// Setup: 3 users (owner, member-to-add, stranger)
// ════════════════════════════════════════════════════════════════════
async function makeUser(label) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const email = `${label.toLowerCase()}_${Date.now()}_${Math.floor(Math.random()*9000)+1000}@p28c.test`;
  const r = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name, email)
     VALUES ($1, 'customer', TRUE, 'P28c', $2, $3) RETURNING id`,
    [phone, label, email]);
  return r.rows[0].id;
}
const ownerId = await makeUser('Owner');
const memberId = await makeUser('Mem');
const strangerId = await makeUser('Stranger');
const newOwnerId = await makeUser('NewOwner');

const OWNER_TOKEN = jwt.sign(
  { userId: ownerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const MEMBER_TOKEN = jwt.sign(
  { userId: memberId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const STRANGER_TOKEN = jwt.sign(
  { userId: strangerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const validBody = {
  companyName: 'Phase 28c Test Co',
  businessType: 'office',
  billingAddress: '123 Test St',
  barangay: 'Manoc-Manoc', city: 'Malay', province: 'Aklan',
  contactPerson: 'Phase 28c Owner',
  contactEmail: 'owner@p28c.test',
  contactPhone: '+639171112233',
  paymentTerms: 'net_30',
};

// ════════════════════════════════════════════════════════════════════
// 1. Create account
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /business → 201 ===');
const r1 = await call(OWNER_TOKEN, 'POST', '/api/v1/business', validBody);
check(r1.status === 201, `→ 201 (got ${r1.status})`, JSON.stringify(r1.body).slice(0,200));
const businessId = r1.body?.data?.id;
check(typeof businessId === 'string', 'business id returned');

// ════════════════════════════════════════════════════════════════════
// 2. Invalid businessType → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Invalid businessType → 400 ===');
const r2 = await call(OWNER_TOKEN, 'POST', '/api/v1/business',
  { ...validBody, businessType: 'spaceship' });
check(r2.status === 400, `→ 400 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Invalid paymentTerms → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Invalid paymentTerms → 400 ===');
const r3 = await call(OWNER_TOKEN, 'POST', '/api/v1/business',
  { ...validBody, paymentTerms: 'net_99' });
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Missing field → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Missing companyName → 400 ===');
const { companyName, ...withoutName } = validBody;
const r4 = await call(OWNER_TOKEN, 'POST', '/api/v1/business', withoutName);
check(r4.status === 400, `→ 400 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. GET /business → owner sees their account
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /business → owner lists ===');
const r5 = await call(OWNER_TOKEN, 'GET', '/api/v1/business');
check(r5.status === 200, `→ 200 (got ${r5.status})`);
const ids = (r5.body?.data ?? []).map(b => b.id);
check(ids.includes(businessId), 'owner sees newly created account');

// ════════════════════════════════════════════════════════════════════
// 6. GET /business/:id (owner)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET /business/:id (owner) → 200 ===');
const r6 = await call(OWNER_TOKEN, 'GET', `/api/v1/business/${businessId}`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. Stranger → 403/404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Stranger GET → 403/404 ===');
const r7 = await call(STRANGER_TOKEN, 'GET', `/api/v1/business/${businessId}`);
check([403, 404].includes(r7.status), `→ 403/404 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. PATCH /business/:id (owner only)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. PATCH /business/:id ===');
const r8 = await call(OWNER_TOKEN, 'PATCH', `/api/v1/business/${businessId}`, {
  notes: 'Phase 28c — updated notes via PATCH endpoint.',
});
check([200, 204].includes(r8.status), `→ 2xx (got ${r8.status})`,
  JSON.stringify(r8.body).slice(0,200));

// 8b. Stranger PATCH → 403
const r8b = await call(STRANGER_TOKEN, 'PATCH', `/api/v1/business/${businessId}`, {
  notes: 'Phase 28c stranger attempt.',
});
check([403, 404].includes(r8b.status), `stranger PATCH → 403/404 (got ${r8b.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. POST /:id/members
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. POST /:id/members → add member ===');
const r9 = await call(OWNER_TOKEN, 'POST', `/api/v1/business/${businessId}/members`, {
  targetUserId: memberId, role: 'manager',
  canBook: true, canApprove: false, canViewInvoices: true,
});
check(r9.status === 201, `→ 201 (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));

// 9b. List members
const memList = await call(OWNER_TOKEN, 'GET', `/api/v1/business/${businessId}/members`);
check(memList.status === 200, 'GET members → 200');
const memIds = (memList.body?.data ?? []).map(m => m.userId);
check(memIds.includes(memberId), `member appears in list (got ${JSON.stringify(memIds)})`);

// ════════════════════════════════════════════════════════════════════
// 10. DELETE /:id/members/:userId
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. DELETE member ===');
const r10 = await call(OWNER_TOKEN, 'DELETE',
  `/api/v1/business/${businessId}/members/${memberId}`,
  { reason: 'Phase 28c — testing member removal' });
check(r10.status === 200, `→ 200 (got ${r10.status})`,
  JSON.stringify(r10.body).slice(0,200));

const memListAfter = await call(OWNER_TOKEN, 'GET', `/api/v1/business/${businessId}/members`);
const memIdsAfter = (memListAfter.body?.data ?? []).map(m => m.userId ?? m.user_id);
check(!memIdsAfter.includes(memberId), 'member no longer in list');

// ════════════════════════════════════════════════════════════════════
// 11. Cannot remove owner via member-delete
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Cannot remove owner via DELETE member ===');
const r11 = await call(OWNER_TOKEN, 'DELETE',
  `/api/v1/business/${businessId}/members/${ownerId}`);
check([400, 403, 409].includes(r11.status),
  `owner removal rejected → 4xx (got ${r11.status})`,
  JSON.stringify(r11.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 12. Transfer ownership → admin_actions row
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Transfer ownership ===');
// New owner must be a member first.
await call(OWNER_TOKEN, 'POST', `/api/v1/business/${businessId}/members`, {
  targetUserId: newOwnerId, role: 'manager', canBook: true, canApprove: true, canViewInvoices: true,
});
const r12 = await call(OWNER_TOKEN, 'POST',
  `/api/v1/business/${businessId}/transfer-ownership`,
  { newOwnerUserId: newOwnerId, reason: 'Phase 28c — transferring ownership for test' });
check([200, 201].includes(r12.status), `→ 2xx (got ${r12.status})`,
  JSON.stringify(r12.body).slice(0,200));

// owner_id moved on the business row
const ownDb = await pg.query(`SELECT owner_user_id FROM business_accounts WHERE id=$1`, [businessId]);
check(ownDb.rows[0]?.owner_user_id === newOwnerId,
  'business_accounts.owner_user_id flipped',
  `got ${ownDb.rows[0]?.owner_user_id}`);

// admin_actions row
const audit = await pg.query(
  `SELECT action_type FROM admin_actions
    WHERE target_id=$1 AND action_type='business_ownership_transferred'`, [businessId]);
check(audit.rows.length === 1, 'business_ownership_transferred audit row written');

// ════════════════════════════════════════════════════════════════════
// 13. Create a contract (new owner)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. POST /:id/contracts ===');
const NEW_OWNER_TOKEN = jwt.sign(
  { userId: newOwnerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Need a service category id for the contract
const catRes = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = catRes.rows[0].id;
const r13 = await call(NEW_OWNER_TOKEN, 'POST', `/api/v1/business/${businessId}/contracts`, {
  categoryId,
  contractType: 'recurring',
  frequency: 'monthly',
  agreedRate: 500000,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  estimatedMonthlyValue: 500000,
  terms: 'Phase 28c test contract',
});
check([200, 201].includes(r13.status), `→ 2xx (got ${r13.status})`,
  JSON.stringify(r13.body).slice(0,200));
const contractId = r13.body?.data?.id;

// ════════════════════════════════════════════════════════════════════
// 14. GET contracts list
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. GET /:id/contracts ===');
const r14 = await call(NEW_OWNER_TOKEN, 'GET', `/api/v1/business/${businessId}/contracts`);
check(r14.status === 200, `→ 200 (got ${r14.status})`);
const cids = (r14.body?.data ?? []).map(c => c.id);
if (contractId) {
  check(cids.includes(contractId), 'contract in list');
}

// ════════════════════════════════════════════════════════════════════
// 15. Cancel contract
// ════════════════════════════════════════════════════════════════════
if (contractId) {
  console.log('\n=== 15. POST /:id/contracts/:cid/cancel ===');
  const r15 = await call(NEW_OWNER_TOKEN, 'POST',
    `/api/v1/business/${businessId}/contracts/${contractId}/cancel`,
    { reason: 'Phase 28c — testing contract cancellation' });
  check([200, 204].includes(r15.status), `→ 2xx (got ${r15.status})`,
    JSON.stringify(r15.body).slice(0,200));

  const cDb = await pg.query(`SELECT status FROM business_contracts WHERE id=$1`, [contractId]);
  check(cDb.rows[0]?.status === 'cancelled' || cDb.rows[0]?.status === 'inactive',
    `contract cancelled (got ${cDb.rows[0]?.status})`);
}

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id=$1`, [businessId]);
await pg.query(`DELETE FROM business_contracts WHERE business_account_id=$1`, [businessId]);
await pg.query(`DELETE FROM business_members WHERE business_account_id=$1`, [businessId]);
await pg.query(`DELETE FROM business_accounts WHERE id=$1`, [businessId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`,
  [ownerId, memberId, strangerId, newOwnerId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
