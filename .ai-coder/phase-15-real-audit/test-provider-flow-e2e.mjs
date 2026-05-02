// Provider flow end-to-end against real Postgres + real API.
// OTP login as a seeded provider, then exercise the provider-side
// endpoints: /me dashboard, /me/services, /me/schedule, /me/portfolio,
// /me/certifications, /me/availability, /me/earnings/trends.

import { Client } from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const PHONE = '+639221234567';   // Roberto's Plumbing Services — provider seed
const KNOWN_OTP = '123456';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

function hashOtp(code, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code + ':' + phone, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [PHONE]);
await pg.query(`DELETE FROM security_events WHERE event_type='otp_lockout'`);
await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [PHONE]);
await pg.query(`INSERT INTO otp_codes (phone, code_hash, expires_at)
  VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [PHONE, hashOtp(KNOWN_OTP, PHONE)]);

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
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random() * 256) + '.' + Math.floor(Math.random() * 256),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  return { status: r.status, body: j };
}

console.log('\n=== Provider flow e2e ===\n');

// 1. Verify OTP → token
console.log('1. POST /auth/verify-otp');
const r1 = await call('POST', '/api/v1/auth/verify-otp', null, { phone: PHONE, code: KNOWN_OTP });
check(r1.status === 200, 'login succeeds');
check(r1.body?.data?.user?.role === 'provider', 'role is provider');
const TOKEN = r1.body.data.accessToken;
const USER_ID = r1.body.data.user.id;

// 2. /providers/me dashboard
console.log('2. GET /providers/me');
const r2 = await call('GET', '/api/v1/providers/me', TOKEN);
check(r2.status === 200, '/providers/me returns 200', 'got ' + r2.status + ' ' + JSON.stringify(r2.body).slice(0,150));
check(typeof r2.body?.data?.id === 'string', 'returns provider object');
check(typeof r2.body?.data?.businessName === 'string', 'businessName present');
const PROVIDER_ID = r2.body.data.id;

// 3. /providers/me/services
console.log('3. GET /providers/me/services');
const r3 = await call('GET', '/api/v1/providers/me/services', TOKEN);
check(r3.status === 200, '/providers/me/services returns 200');
check(Array.isArray(r3.body?.data), 'services returns array');

// 4. /providers/me/schedule
console.log('4. GET /providers/me/schedule');
const r4 = await call('GET', '/api/v1/providers/me/schedule', TOKEN);
check(r4.status === 200, '/providers/me/schedule returns 200');
check(Array.isArray(r4.body?.data), 'schedule returns array');

// 5. /providers/me/portfolio
console.log('5. GET /providers/me/portfolio');
const r5 = await call('GET', '/api/v1/providers/me/portfolio', TOKEN);
check(r5.status === 200, '/providers/me/portfolio returns 200');

// 6. /providers/me/certifications
console.log('6. GET /providers/me/certifications');
const r6 = await call('GET', '/api/v1/providers/me/certifications', TOKEN);
check(r6.status === 200, '/providers/me/certifications returns 200');

// 7. PATCH /providers/me/availability
console.log('7. POST /providers/me/availability (toggle)');
const r7a = await call('POST', '/api/v1/providers/me/availability', TOKEN, { isAvailable: false });
check(r7a.status === 200, 'availability toggle returns 200', JSON.stringify(r7a.body).slice(0, 150));
const r7b = await call('POST', '/api/v1/providers/me/availability', TOKEN, { isAvailable: true });
check(r7b.status === 200, 'availability toggle back returns 200');

// 8. /providers/me/earnings/trends — used by mobile chart in withdraw + earnings + payouts screens
console.log('8. GET /providers/me/earnings/trends');
const r8 = await call('GET', '/api/v1/providers/me/earnings/trends?period=daily&days=7', TOKEN);
check(r8.status === 200, 'earnings trends returns 200',
  'got ' + r8.status + ' ' + JSON.stringify(r8.body).slice(0, 150));

// 9. /bookings (provider's own job list)
console.log('9. GET /bookings');
const r9 = await call('GET', '/api/v1/bookings?limit=10', TOKEN);
check(r9.status === 200, 'bookings list returns 200');
check(Array.isArray(r9.body?.data), 'bookings is array');

// 10. /wallet (provider wallet)
console.log('10. GET /wallet');
const r10 = await call('GET', '/api/v1/wallet', TOKEN);
check(r10.status === 200, 'wallet returns 200');
check(r10.body?.data?.type === 'provider', 'wallet type=provider');

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
await pg.end();
process.exit(fail === 0 ? 0 : 1);
