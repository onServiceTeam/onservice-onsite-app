// Customer flow end-to-end against real Postgres + real API.
// Tests: OTP send → seed known OTP → verify → /me → /catalog/* →
// /providers → /bookings → /wallet → /addresses.

import { Client } from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const PHONE = '+639171234567';
const KNOWN_OTP = '654321';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

function hashOtp(code, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code + ':' + phone, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

async function freshOtp() {
  // Wipe ALL recent OTPs for this phone so the hourly limit doesn't fire.
  await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [PHONE]);
  await pg.query(`INSERT INTO otp_codes (phone, code_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [PHONE, hashOtp(KNOWN_OTP, PHONE)]);
}

// Wipe all OTPs at start to clear hourly count for this phone.
await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [PHONE]);
// Clear OTP lockouts so retries from prior runs don't gate this one.
await pg.query(`DELETE FROM security_events WHERE event_type='otp_lockout'`);
await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [PHONE]);
// Also clear Redis rate-limit prefix for this run.
// (Best-effort; if FLUSHALL is too disruptive we can target prefix.)


let pass = 0, fail = 0;
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, extra ?? ''); }
}

async function call(method, url, token, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Use a unique IP per test run so Redis-backed rate limiter
      // (which keys on req.ip) doesn't accumulate across runs.
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random() * 256) + '.' + Math.floor(Math.random() * 256),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Read once, then JSON-parse so we don't double-read the body.
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  return { status: r.status, body: j };
}

console.log('\n=== Customer flow e2e ===\n');

// 1. Public OTP send
console.log('1. POST /auth/send-otp');
const r1 = await call('POST', '/api/v1/auth/send-otp', null, { phone: PHONE });
check(r1.status === 200 && r1.body.success === true, 'OTP send returns 200',
  'got status=' + r1.status + ' body=' + JSON.stringify(r1.body).slice(0, 200));

// 2. Seed a known OTP for the next call
await freshOtp();

// 3. Verify with WRONG code
console.log('2. POST /auth/verify-otp (wrong code)');
const r2 = await call('POST', '/api/v1/auth/verify-otp', null, { phone: PHONE, code: '000000' });
check(r2.status === 400, 'wrong OTP rejected');
check((r2.body?.error?.message ?? '').match(/Invalid|Wrong|incorrect|attempts/i),
  'error message says invalid/attempts');

// 4. Seed again (wrong attempt incremented attempts counter)
await freshOtp();

// 5. Verify with KNOWN code
console.log('3. POST /auth/verify-otp (correct)');
const r3 = await call('POST', '/api/v1/auth/verify-otp', null, { phone: PHONE, code: KNOWN_OTP });
check(r3.status === 200, 'correct OTP accepted');
check(typeof r3.body?.data?.accessToken === 'string', 'accessToken returned');
check(r3.body?.data?.user?.role === 'customer', 'user.role is customer');
const TOKEN = r3.body.data.accessToken;
const USER_ID = r3.body.data.user.id;

// 6. /auth/me
console.log('4. GET /auth/me');
const r4 = await call('GET', '/api/v1/auth/me', TOKEN);
check(r4.status === 200, '/me returns 200');
check(r4.body.data?.id === USER_ID, '/me returns same userId');
check(r4.body.data?.phone === PHONE, '/me returns phone');

// 7. catalog (mounted at /api/v1/catalog, NOT /catalog/categories)
console.log('5. GET /catalog');
const r5 = await call('GET', '/api/v1/catalog', TOKEN);
check(r5.status === 200, 'catalog returns 200');
const cats = r5.body?.data ?? [];
check(Array.isArray(cats), 'catalog returns array', JSON.stringify(r5.body).slice(0, 100));
check(cats.length === 10, 'all 10 categories present', 'got: ' + cats.length);
check(cats.some(c => c.slug === 'cleaning'), 'cleaning category present');

// 8. /catalog/:slug
console.log('6. GET /catalog/cleaning');
const r6 = await call('GET', '/api/v1/catalog/cleaning', TOKEN);
check(r6.status === 200, '/catalog/cleaning returns 200', 'got ' + r6.status);
const cleaning = r6.body?.data;
check(cleaning?.slug === 'cleaning', 'category slug matches');
check(Array.isArray(cleaning?.subcategories) && cleaning.subcategories.length >= 1,
  'at least 1 subcategory present');

// 9. /providers/:id (customer discovers a provider via booking match,
//    not a list — but the detail endpoint should be reachable with auth)
console.log('7. GET /providers/:id (one of the seeded providers)');
const aProv = await pg.query(`SELECT id FROM providers LIMIT 1`);
const provId = aProv.rows[0].id;
const r7 = await call('GET', `/api/v1/providers/${provId}`, TOKEN);
check(r7.status === 200, '/providers/:id returns 200', 'got ' + r7.status);
check(r7.body?.data?.id === provId, 'detail returns the requested provider');

// 10. /bookings (customer's own)
console.log('8. GET /bookings');
const r8 = await call('GET', '/api/v1/bookings?limit=5', TOKEN);
check(r8.status === 200, '/bookings returns 200');
check(Array.isArray(r8.body?.data), '/bookings returns array');
check((r8.body?.data?.length ?? 0) >= 1, 'customer has at least 1 seeded booking');

// 11. /wallet
console.log('9. GET /wallet');
const r9 = await call('GET', '/api/v1/wallet', TOKEN);
check(r9.status === 200, '/wallet returns 200');
check(r9.body?.data?.userId === USER_ID, '/wallet links to user');

// 12. /addresses (will be empty since no seed)
console.log('10. GET /addresses');
const r10 = await call('GET', '/api/v1/addresses', TOKEN);
check(r10.status === 200, '/addresses returns 200');
check(Array.isArray(r10.body?.data), '/addresses returns array');

// 13. POST /addresses (create new) — schema requires fullAddress, not line1.
console.log('11. POST /addresses');
const r11 = await call('POST', '/api/v1/addresses', TOKEN, {
  label: 'Home',
  fullAddress: '123 Test Street, Brgy Sample, Sample City',
  barangay: 'Test Brgy',
  city: 'Manila',
  province: 'Metro Manila',
  region: 'NCR',
  zipCode: '1000',
  isDefault: true,
});
check(r11.status === 201 || r11.status === 200, 'address create returns 200/201',
  JSON.stringify(r11.body).slice(0, 200));

// 14. /addresses again (should now have 1)
console.log('12. GET /addresses (after create)');
const r12 = await call('GET', '/api/v1/addresses', TOKEN);
check((r12.body?.data?.length ?? 0) >= 1, 'addresses now has the new entry');

// 15. PATCH /me (update profile)
console.log('13. PATCH /auth/me (profile update)');
const r13 = await call('PATCH', '/api/v1/auth/me', TOKEN, { firstName: 'Maria-Updated' });
check(r13.status === 200, 'profile update returns 200', JSON.stringify(r13.body).slice(0, 200));

// 16. /auth/me confirms update
console.log('14. GET /auth/me (after update)');
const r14 = await call('GET', '/api/v1/auth/me', TOKEN);
check(r14.body?.data?.firstName === 'Maria-Updated', 'firstName persisted');

// Reset profile
await call('PATCH', '/api/v1/auth/me', TOKEN, { firstName: 'Maria' });

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
await pg.end();
process.exit(fail === 0 ? 0 : 1);
