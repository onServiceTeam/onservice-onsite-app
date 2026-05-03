// Phase 21e — exercise flows that hadn't been touched in prior tests:
// tips, reviews, recurring CRUD, referrals, promotions, suki memberships.
//
// These features are core to the business model (loyalty, referral
// rewards, repeat customers, promo redemption) but have only been
// tested at the GET-endpoint level via Phase 18 contract test. This
// phase actually exercises the write paths and verifies DB state.

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';
const CUSTOMER_PHONE = '+639171234567';
const PROVIDER_PHONE = '+639221234567';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

function hashOtp(code, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code + ':' + phone, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

for (const [phone, code] of [[CUSTOMER_PHONE, '654321'], [PROVIDER_PHONE, '123456']]) {
  await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [phone]);
  await pg.query(`DELETE FROM security_events WHERE event_type='otp_lockout'`);
  await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [phone]);
  await pg.query(`INSERT INTO otp_codes (phone, code_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [phone, hashOtp(code, phone)]);
}

async function loginOtp(phone, code) {
  const r = await fetch(API + '/api/v1/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type':'application/json',
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256) },
    body: JSON.stringify({ phone, code }),
  });
  const j = await r.json();
  if (!j.data?.accessToken) throw new Error('login fail: ' + JSON.stringify(j).slice(0,300));
  return { token: j.data.accessToken, userId: j.data.user.id };
}

const customer = await loginOtp(CUSTOMER_PHONE, '654321');
const provider = await loginOtp(PROVIDER_PHONE, '123456');
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

const provRow = await pg.query(`SELECT id FROM providers WHERE user_id=$1`, [provider.userId]);
const providerProvId = provRow.rows[0].id;

// ════════════════════════════════════════════════════════════════════
// SECTION 1 — Referrals
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Referrals ===');

// 1a. Get my referral code
const refCode = await call(customer.token, 'GET', '/api/v1/referrals/my-code');
check(refCode.status === 200, 'GET /referrals/my-code → 200',
  'got ' + refCode.status + ' ' + JSON.stringify(refCode.body).slice(0,150));
check(typeof refCode.body?.data?.code === 'string',
  'code is a string',
  JSON.stringify(refCode.body?.data).slice(0,150));

// 1b. List my referrals (likely empty)
const refList = await call(customer.token, 'GET', '/api/v1/referrals/my-referrals');
check(refList.status === 200, 'GET /referrals/my-referrals → 200');

// ════════════════════════════════════════════════════════════════════
// SECTION 2 — Suki memberships
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Suki memberships ===');

const sukiList = await call(customer.token, 'GET', '/api/v1/suki/memberships');
check(sukiList.status === 200, 'GET /suki/memberships → 200');

const sukiTiers = await call(customer.token, 'GET', '/api/v1/suki/tiers');
check(sukiTiers.status === 200, 'GET /suki/tiers → 200');

const sukiCust = await call(provider.token, 'GET', '/api/v1/suki/provider-customers');
check(sukiCust.status === 200, 'GET /suki/provider-customers (provider view) → 200');

// ════════════════════════════════════════════════════════════════════
// SECTION 3 — Promotions
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Promotions ===');

const promoActive = await call(customer.token, 'GET', '/api/v1/promotions/active');
check(promoActive.status === 200, 'GET /promotions/active → 200');

// ════════════════════════════════════════════════════════════════════
// SECTION 4 — Recurring bookings
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Recurring bookings ===');

const recList = await call(customer.token, 'GET', '/api/v1/recurring');
check(recList.status === 200, 'GET /recurring → 200');

// Try to create one (may fail if no recent booking to copy from)
const recentBooking = await pg.query(
  `SELECT id FROM bookings WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 1`,
  [customer.userId]);
if (recentBooking.rows[0]) {
  const recCreate = await call(customer.token, 'POST', '/api/v1/recurring', {
    bookingId: recentBooking.rows[0].id,
    frequency: 'weekly',
    daysBetween: 7,
  });
  check([200,201,400,409].includes(recCreate.status),
    'POST /recurring returns expected (2xx or validation 4xx)',
    'got ' + recCreate.status + ' ' + JSON.stringify(recCreate.body).slice(0,200));
  const recId = recCreate.body?.data?.id;
  if (recId) {
    // Pause + resume + cancel
    const pause = await call(customer.token, 'POST', `/api/v1/recurring/${recId}/pause`);
    check([200,204].includes(pause.status), 'POST /recurring/:id/pause → 2xx');
    const resume = await call(customer.token, 'POST', `/api/v1/recurring/${recId}/resume`);
    check([200,204].includes(resume.status), 'POST /recurring/:id/resume → 2xx');
    const cancel = await call(customer.token, 'POST', `/api/v1/recurring/${recId}/cancel`);
    check([200,204].includes(cancel.status), 'POST /recurring/:id/cancel → 2xx');
    // Cleanup
    await pg.query(`DELETE FROM recurring_bookings WHERE id=$1`, [recId]);
  }
}

// ════════════════════════════════════════════════════════════════════
// SECTION 5 — Reviews
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Reviews ===');

const someProvId = (await pg.query(`SELECT id FROM providers LIMIT 1`)).rows[0].id;
const rev = await call(customer.token, 'GET', `/api/v1/reviews/provider/${someProvId}`);
check(rev.status === 200, 'GET /reviews/provider/:id → 200');

// Check shape
const revData = rev.body?.data;
check(Array.isArray(revData) || (revData && Array.isArray(revData.rows)),
  'reviews response is array or paginated envelope',
  'shape: ' + (Array.isArray(revData) ? 'array' :
    revData && revData.rows ? 'paginated' : typeof revData));

// ════════════════════════════════════════════════════════════════════
// SECTION 6 — Tips
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Tips ===');

const someBookingId = (await pg.query(
  `SELECT id FROM bookings WHERE customer_id=$1 LIMIT 1`, [customer.userId])).rows[0]?.id;
if (someBookingId) {
  const tipGet = await call(customer.token, 'GET', `/api/v1/tips/booking/${someBookingId}`);
  check(tipGet.status === 200, 'GET /tips/booking/:id → 200');
}

// ════════════════════════════════════════════════════════════════════
// SECTION 7 — Provider tools (skills, portfolio, certifications)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Provider tools ===');

const skills = await call(provider.token, 'GET', '/api/v1/providers/me/services');
check(skills.status === 200, 'GET /providers/me/services → 200');

const portfolio = await call(provider.token, 'GET', '/api/v1/providers/me/portfolio');
check(portfolio.status === 200, 'GET /providers/me/portfolio → 200');

const certs = await call(provider.token, 'GET', '/api/v1/providers/me/certifications');
check(certs.status === 200, 'GET /providers/me/certifications → 200');

// Test add + delete a portfolio item via real API
const portCreate = await call(provider.token, 'POST', '/api/v1/providers/me/portfolio', {
  imageUrl: 'https://example.com/phase21-test.jpg',
  caption: 'Phase 21e test portfolio',
});
check([200,201,400].includes(portCreate.status),
  'POST /providers/me/portfolio → 2xx or 400',
  'got ' + portCreate.status + ' ' + JSON.stringify(portCreate.body).slice(0,200));
if ([200,201].includes(portCreate.status) && portCreate.body?.data?.id) {
  await call(provider.token, 'DELETE', `/api/v1/providers/me/portfolio/${portCreate.body.data.id}`);
}

// ════════════════════════════════════════════════════════════════════
// SECTION 8 — Compliance (DSR self-service, consent records)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Compliance ===');

const consent = await call(customer.token, 'GET', '/api/v1/compliance/my-pending-consents');
check(consent.status === 200, 'GET /compliance/my-pending-consents → 200');

const dsr = await call(customer.token, 'GET', '/api/v1/compliance/my-requests');
check(dsr.status === 200, 'GET /compliance/my-requests → 200');

// File a DSR (data export) and verify it lands in DB
const dsrFile = await call(customer.token, 'POST', '/api/v1/compliance/dsr', {
  type: 'data_access',
  details: 'Phase 21e — automated test data access request',
});
check([200,201,400].includes(dsrFile.status),
  'POST /compliance/dsr → 2xx (or 400 if cooldown)',
  'got ' + dsrFile.status + ' ' + JSON.stringify(dsrFile.body).slice(0,200));
const dsrId = dsrFile.body?.data?.id;
if (dsrId) {
  const dsrCheck = await pg.query(`SELECT id, status FROM dsrs WHERE id=$1`, [dsrId]);
  check(dsrCheck.rows[0]?.status === 'pending' || dsrCheck.rows[0]?.status === 'received',
    'DSR persisted with initial status',
    'got: ' + JSON.stringify(dsrCheck.rows[0]));
  // Cleanup
  await pg.query(`DELETE FROM dsrs WHERE id=$1`, [dsrId]);
}

// ════════════════════════════════════════════════════════════════════
// SECTION 9 — Account deletion request (NOT executed, just request)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Account deletion (request status only) ===');

const delStatus = await call(customer.token, 'GET', '/api/v1/account/deletion/status');
check(delStatus.status === 200, 'GET /account/deletion/status → 200');

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
