// LL#5 forced re-consent on material publish — end-to-end test.
import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const cust = await pg.query(`SELECT id FROM users WHERE role='customer' LIMIT 1`);
const CUSTOMER_ID = cust.rows[0].id;

// Reset state
await pg.query(`DELETE FROM consent_records WHERE consent_type='privacy_policy'`);
await pg.query(`DELETE FROM admin_actions WHERE action_type='consent_version_published' AND details->>'consentType'='privacy_policy'`);

const sign = (id, role) => jwt.sign({ userId: id, role, type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const SUPER = sign(SUPER_ADMIN_ID, 'super_admin');
const CUST = sign(CUSTOMER_ID, 'customer');

async function call(label, method, url, token, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  console.log(`[${r.status}] ${label}`);
  console.log('  ', JSON.stringify(j.data ?? j.error ?? j).slice(0, 200));
  return { status: r.status, body: j };
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('     ✓', msg); }
  else      { fail++; console.log('     ✗ FAIL:', msg); }
}

console.log('\n=== LL#5 forced re-consent end-to-end ===\n');

let r;

r = await call('1. customer pending (initial)', 'GET', '/api/v1/compliance/my-pending-consents', CUST);
assert(Array.isArray(r.body.data) && r.body.data.length === 0, 'pending list starts empty');

r = await call('2. customer grants v1', 'POST', '/api/v1/compliance/consent', CUST,
  { consentType: 'privacy_policy', version: 'v1', granted: true });
assert(r.status === 201, 'grant accepted');

r = await call('3. admin publishes NON-material v2', 'POST', '/api/v1/admin/compliance/consent-versions', SUPER,
  { consentType: 'privacy_policy', version: 'v2',
    changeSummary: 'Minor wording cleanup; no new processing or sharing.',
    material: false });
assert(r.status === 201, 'publish accepted');
assert(r.body.data?.material === false, 'material=false echoed');

r = await call('4. customer pending (still empty)', 'GET', '/api/v1/compliance/my-pending-consents', CUST);
assert(r.body.data.length === 0, 'non-material publish does NOT add pending');

r = await call('5. admin publishes MATERIAL v3', 'POST', '/api/v1/admin/compliance/consent-versions', SUPER,
  { consentType: 'privacy_policy', version: 'v3',
    changeSummary: 'Adds new partner data sharing for ML quality scoring purposes.',
    material: true });
assert(r.status === 201, 'material publish accepted');
assert(r.body.data?.material === true, 'material=true echoed');

r = await call('6. customer pending (should have v3)', 'GET', '/api/v1/compliance/my-pending-consents', CUST);
assert(r.body.data.length === 1, 'pending now has 1 item');
const pending = r.body.data[0];
assert(pending?.consentType === 'privacy_policy', 'pending consentType matches');
assert(pending?.latestVersion === 'v3', 'pending latestVersion is v3');
assert(pending?.userCurrentVersion === 'v1', 'userCurrentVersion is the prior v1 (not v2 — non-material was skipped)');
assert(pending?.userLastAction === 'granted', 'userLastAction is granted');

r = await call('7. customer accepts v3', 'POST', '/api/v1/compliance/consent', CUST,
  { consentType: 'privacy_policy', version: 'v3', granted: true });
assert(r.status === 201, 'accept v3');

r = await call('8. customer pending (back to empty)', 'GET', '/api/v1/compliance/my-pending-consents', CUST);
assert(r.body.data.length === 0, 'pending cleared after acceptance');

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
await pg.end();
process.exit(fail === 0 ? 0 : 1);
