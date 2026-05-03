// Phase 23d — DSR full lifecycle.
// Customer files DSR → admin updates status → admin completes → verify state.

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';
const CUSTOMER_PHONE = '+639171234567';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

function hashOtp(code, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code + ':' + phone, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [CUSTOMER_PHONE]);
await pg.query(`DELETE FROM security_events WHERE event_type='otp_lockout'`);
await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [CUSTOMER_PHONE]);
await pg.query(`INSERT INTO otp_codes (phone, code_hash, expires_at)
  VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [CUSTOMER_PHONE, hashOtp('654321', CUSTOMER_PHONE)]);

const r = await fetch(API + '/api/v1/auth/verify-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json',
    'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256) },
  body: JSON.stringify({ phone: CUSTOMER_PHONE, code: '654321' }),
});
const j = await r.json();
const customerToken = j.data.accessToken;
const customerId = j.data.user.id;

const SUPER_TOKEN = jwt.sign({ userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
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
      'Authorization': 'Bearer ' + token,
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,300) }; }
  return { status: r.status, body: j };
}

// Clean any leftover DSRs from prior runs (column is received_at, not created_at)
await pg.query(`DELETE FROM data_subject_requests WHERE user_id=$1 AND received_at > NOW() - INTERVAL '10 minutes'`, [customerId]);

// ════════════════════════════════════════════════════════════════════
// 1. Customer files DSR (data_access)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Customer files DSR ===');
const dsr1 = await call(customerToken, 'POST', '/api/v1/compliance/dsr', {
  requestType: 'access',
  userMessage: 'Phase 23d — full lifecycle test. Requesting all my data per GDPR Art. 15.',
});
check([200,201].includes(dsr1.status), 'POST /compliance/dsr → 2xx',
  'got ' + dsr1.status + ' ' + JSON.stringify(dsr1.body).slice(0,300));
const dsrId = dsr1.body?.data?.id;
check(typeof dsrId === 'string', 'response has DSR id');

// Verify DB state — column is `request_type` not `type`
const dsrInDb = await pg.query(
  `SELECT id, status, request_type, user_id FROM data_subject_requests WHERE id=$1`, [dsrId]);
check(dsrInDb.rows[0]?.status === 'received' || dsrInDb.rows[0]?.status === 'pending',
  'DSR in DB with initial status',
  'got: ' + JSON.stringify(dsrInDb.rows[0]));
check(dsrInDb.rows[0]?.user_id === customerId,
  'DSR linked to customer');
check(dsrInDb.rows[0]?.request_type === 'access', 'DSR type matches');

// ════════════════════════════════════════════════════════════════════
// 2. Customer lists their own DSRs
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Customer lists their DSRs ===');
const myDsrs = await call(customerToken, 'GET', '/api/v1/compliance/my-requests');
check(myDsrs.status === 200, 'GET /compliance/my-requests → 200');
const myList = myDsrs.body?.data ?? myDsrs.body?.data?.rows ?? [];
const found = (Array.isArray(myList) ? myList : myList.rows ?? []).find(d => d.id === dsrId);
check(!!found, 'newly-filed DSR appears in customer\'s list');

// ════════════════════════════════════════════════════════════════════
// 3. Admin sees DSR in queue
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Admin lists DSR queue ===');
const adminList = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/compliance/dsr?limit=50');
check(adminList.status === 200, 'GET /admin/compliance/dsr → 200');
const adminRows = adminList.body?.data?.rows ?? adminList.body?.data ?? [];
const adminFound = (Array.isArray(adminRows) ? adminRows : []).find(d => d.id === dsrId);
check(!!adminFound, 'DSR visible in admin queue');

// ════════════════════════════════════════════════════════════════════
// 4. Admin updates DSR status (assign / in_progress)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Admin updates DSR status to in_progress ===');
const update = await call(SUPER_TOKEN, 'PATCH', `/api/v1/admin/compliance/dsr/${dsrId}`, {
  newStatus: 'in_progress',
  adminNotes: 'Phase 23d test — investigating data export.',
});
check([200,204].includes(update.status), 'PATCH dsr → 2xx',
  'got ' + update.status + ' ' + JSON.stringify(update.body).slice(0,250));

const updated = await pg.query(`SELECT status FROM data_subject_requests WHERE id=$1`, [dsrId]);
check(updated.rows[0]?.status === 'in_progress',
  'status=in_progress in DB',
  'got: ' + updated.rows[0]?.status);

// ════════════════════════════════════════════════════════════════════
// 5. Admin completes DSR (data shipped)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Admin completes DSR ===');
const complete = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/compliance/dsr/${dsrId}/complete`, {
  responsePayloadUrl: 'https://example.com/dsr-export-phase23d.zip',
  adminNotes: 'Phase 23d — completed test export.',
});
check([200,204].includes(complete.status), 'POST .../complete → 2xx',
  'got ' + complete.status + ' ' + JSON.stringify(complete.body).slice(0,250));

const completed = await pg.query(`SELECT status FROM data_subject_requests WHERE id=$1`, [dsrId]);
check(['completed','fulfilled'].includes(completed.rows[0]?.status),
  'status=completed/fulfilled in DB',
  'got: ' + completed.rows[0]?.status);

// ════════════════════════════════════════════════════════════════════
// 6. Test rejection path on a separate DSR
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. File another DSR, then admin rejects it ===');
const dsr2 = await call(customerToken, 'POST', '/api/v1/compliance/dsr', {
  requestType: 'erasure',
  userMessage: 'Phase 23d test — request to delete all my data per GDPR Art. 17.',
});
const dsr2Id = dsr2.body?.data?.id;

const reject = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/compliance/dsr/${dsr2Id}/reject`, {
  reason: 'Phase 23d test — rejection requires explanation of at least thirty characters: legitimate business need to retain transactional records for BIR audit.',
});
check([200,204].includes(reject.status), 'POST .../reject → 2xx',
  'got ' + reject.status + ' ' + JSON.stringify(reject.body).slice(0,250));

const rejected = await pg.query(`SELECT status FROM data_subject_requests WHERE id=$1`, [dsr2Id]);
check(['rejected','denied'].includes(rejected.rows[0]?.status),
  'status=rejected in DB',
  'got: ' + rejected.rows[0]?.status);

// ════════════════════════════════════════════════════════════════════
// 7. Audit log has DSR-related rows
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Audit log has DSR action rows ===');
const audit = await pg.query(
  `SELECT action_type FROM admin_actions
    WHERE target_id IN ($1, $2)
    ORDER BY created_at DESC`, [dsrId, dsr2Id]);
check(audit.rows.length >= 1, 'admin_actions has DSR rows',
  'count: ' + audit.rows.length + ' verbs: ' + audit.rows.map(r=>r.action_type).join(','));

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1, $2)`, [dsrId, dsr2Id]).catch(()=>{});
await pg.query(`DELETE FROM data_subject_requests WHERE id IN ($1, $2)`, [dsrId, dsr2Id]);
console.log('  removed test DSRs');

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
