// Phase 23a — full admin 2FA enrollment + verification flow.
//
// Real flow (per auth.routes.ts):
//   1. Admin user with totp_enabled=FALSE logs in → response is
//      `requires2FASetup: true` + a `pre_auth_2fa_setup` Bearer token.
//      No session cookies issued yet.
//   2. POST /admin/2fa/setup with that Bearer token → returns base32 secret + QR URI.
//   3. POST /admin/2fa/enable with totpCode (computed from secret) →
//      flips totp_enabled=TRUE and (per impl) issues full session.
//   4. Future login → returns `requires2FA: true` + `pre_auth_2fa` token.
//   5. POST /admin/2fa/verify with preAuthToken + totpCode → full session.
//   6. Wrong TOTP → 401, security event logged.
//   7. /admin/2fa/disable with valid TOTP → totp_enabled=FALSE.

import { Client } from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(password, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(encoded) {
  let bits = '';
  for (const char of encoded.toUpperCase().replace(/=+$/, '')) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}
function generateTotp(base32Secret, timeOffset = 0) {
  const secret = base32Decode(base32Secret);
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30) + timeOffset);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

const TEST_EMAIL = 'phase23-2fa-test-' + Date.now() + '@onservice.test';
const TEST_PASSWORD = 'Phase23TestPwd!2024';
const TEST_PHONE = '+639199990001';

// Clear any leftover from prior runs
await pg.query(`DELETE FROM users WHERE email LIKE 'phase23-2fa-test-%@onservice.test' OR phone=$1`, [TEST_PHONE]);

const passwordHash = hashPassword(TEST_PASSWORD);
const tempAdmin = await pg.query(`
  INSERT INTO users (phone, email, role, first_name, last_name, password_hash, is_active, totp_enabled)
  VALUES ($1, $2, 'admin', 'Phase23', 'Test', $3, TRUE, FALSE)
  RETURNING id`, [TEST_PHONE, TEST_EMAIL, passwordHash]);
const tempAdminId = tempAdmin.rows[0].id;
console.log('seeded throwaway admin:', tempAdminId.slice(0,8), 'email:', TEST_EMAIL);

async function call(method, url, body, opts = {}) {
  const r = await fetch(API + url, {
    method,
    headers: {
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,300) }; }
  return { status: r.status, body: j, headers: r.headers };
}

try {

// ─── 1. First login → setup-required + pre_auth_2fa_setup token ────
console.log('\n=== 1. First login → 2FA setup required ===');
const r1 = await call('POST', '/api/v1/auth/admin/login',
  { email: TEST_EMAIL, password: TEST_PASSWORD });
check(r1.status === 200, 'admin login → 200',
  'got ' + r1.status + ' ' + JSON.stringify(r1.body).slice(0,300));
check(r1.body?.data?.requires2FASetup === true,
  'response has requires2FASetup=true',
  JSON.stringify(r1.body?.data).slice(0,200));
const setupToken = r1.body?.data?.preAuthToken;
check(typeof setupToken === 'string' && setupToken.length > 50,
  'setup-token issued',
  'len: ' + (setupToken?.length ?? 0));

// ─── 2. Setup 2FA (with Bearer setupToken) ───────────────────────
console.log('\n=== 2. Setup 2FA ===');
const r2 = await call('POST', '/api/v1/auth/admin/2fa/setup', {},
  { headers: { 'Authorization': 'Bearer ' + setupToken } });
check(r2.status === 200, '2FA setup → 200',
  'got ' + r2.status + ' ' + JSON.stringify(r2.body).slice(0,300));
const secret = r2.body?.data?.secret;
const qrUri = r2.body?.data?.uri ?? r2.body?.data?.qrUri ?? r2.body?.data?.otpauth;
check(typeof secret === 'string' && secret.length >= 16,
  'returned base32 secret (>=16 chars)',
  'secret first 6: ' + secret?.slice(0,6));
check(typeof qrUri === 'string' && qrUri.startsWith('otpauth://'),
  'returned otpauth:// QR URI',
  'uri prefix: ' + qrUri?.slice(0,30));

if (!secret) {
  console.log('cannot continue — setup did not return secret');
  process.exit(1);
}

// ─── 3. Enable 2FA with valid TOTP ────────────────────────────────
console.log('\n=== 3. Enable 2FA with valid TOTP ===');
const totp1 = generateTotp(secret);
console.log('  generated totp:', totp1);
const r3 = await call('POST', '/api/v1/auth/admin/2fa/enable',
  { totpCode: totp1 },
  { headers: { 'Authorization': 'Bearer ' + setupToken } });
check([200, 204].includes(r3.status), '2FA enable with valid TOTP → 2xx',
  'got ' + r3.status + ' ' + JSON.stringify(r3.body).slice(0,300));

const dbCheck = await pg.query(`SELECT totp_enabled FROM users WHERE id=$1`, [tempAdminId]);
check(dbCheck.rows[0]?.totp_enabled === true, 'totp_enabled=TRUE in DB');

// ─── 4. Login again → requires2FA ────────────────────────────────
console.log('\n=== 4. Login again — should require 2FA ===');
const r4 = await call('POST', '/api/v1/auth/admin/login',
  { email: TEST_EMAIL, password: TEST_PASSWORD });
check(r4.status === 200, 'login still 200');
check(r4.body?.data?.requires2FA === true,
  'response has requires2FA=true (not setup-required this time)',
  JSON.stringify(r4.body?.data).slice(0,300));
const preAuthToken = r4.body?.data?.preAuthToken;
check(typeof preAuthToken === 'string', 'preAuthToken issued');

// ─── 5. Wrong TOTP → 401 ─────────────────────────────────────────
console.log('\n=== 5. Verify 2FA with WRONG TOTP → 401 ===');
const r5 = await call('POST', '/api/v1/auth/admin/2fa/verify',
  { preAuthToken, totpCode: '000000' });
check(r5.status === 401, 'wrong TOTP → 401',
  'got ' + r5.status + ' ' + JSON.stringify(r5.body).slice(0,200));

const evtRow = await pg.query(
  `SELECT event_type FROM security_events
     WHERE user_id=$1 AND event_type='admin_2fa_failed'
    ORDER BY created_at DESC LIMIT 1`, [tempAdminId]);
check(evtRow.rows.length === 1, 'admin_2fa_failed security event logged');

// ─── 6. Valid TOTP → full session ────────────────────────────────
console.log('\n=== 6. Verify 2FA with valid TOTP → full session ===');
const totp2 = generateTotp(secret);
const r6 = await call('POST', '/api/v1/auth/admin/2fa/verify',
  { preAuthToken, totpCode: totp2 });
check(r6.status === 200, 'valid TOTP → 200',
  'got ' + r6.status + ' ' + JSON.stringify(r6.body).slice(0,300));
check(r6.body?.data?.user?.id === tempAdminId, 'user id matches',
  'got user.id: ' + r6.body?.data?.user?.id);
check(typeof r6.body?.data?.sessionExpiresAt === 'string',
  'sessionExpiresAt set');

const evtSuccess = await pg.query(
  `SELECT event_type FROM security_events
     WHERE user_id=$1 AND event_type='admin_login_2fa_verified'
    ORDER BY created_at DESC LIMIT 1`, [tempAdminId]);
check(evtSuccess.rows.length === 1, 'admin_login_2fa_verified security event logged');

// Capture session for the disable step
const setCookies6 = r6.headers.getSetCookie?.() ?? [r6.headers.get('set-cookie') ?? ''];
const sessionCookie = setCookies6.join('; ').match(/admin_session=([^;\s]+)/)?.[1];
check(typeof sessionCookie === 'string' && sessionCookie.length > 50,
  'session cookie issued by /2fa/verify',
  'len: ' + (sessionCookie?.length ?? 0));

// ─── 7. Disable 2FA with valid session + TOTP ────────────────────
console.log('\n=== 7. Disable 2FA ===');
const totp3 = generateTotp(secret);
const r7 = await call('POST', '/api/v1/auth/admin/2fa/disable',
  { totpCode: totp3 },
  { headers: { 'Cookie': 'admin_session=' + sessionCookie } });
check([200, 204].includes(r7.status), '2FA disable → 2xx',
  'got ' + r7.status + ' ' + JSON.stringify(r7.body).slice(0,300));

const dbDisabled = await pg.query(
  `SELECT totp_enabled FROM users WHERE id=$1`, [tempAdminId]);
check(dbDisabled.rows[0]?.totp_enabled === false, 'totp_enabled=FALSE in DB');

// ─── 8. Login again — should be back to setup-required (since 2FA disabled = re-enroll required) ──
console.log('\n=== 8. Login after disable — setup-required again (admin tier always needs 2FA) ===');
const r8 = await call('POST', '/api/v1/auth/admin/login',
  { email: TEST_EMAIL, password: TEST_PASSWORD });
check(r8.status === 200, 'login after disable → 200');
// Per the code logic, admin/super_admin/dpo without TOTP get setup-required.
// So disabling brings us back to the initial state.
check(r8.body?.data?.requires2FASetup === true,
  'admin without 2FA → setup-required (admin tier mandatorily 2FA)',
  JSON.stringify(r8.body?.data).slice(0,200));

} finally {
  console.log('\n=== Cleanup ===');
  await pg.query(`DELETE FROM admin_csrf_tokens WHERE admin_user_id=$1`, [tempAdminId]).catch(()=>{});
  await pg.query(`DELETE FROM security_events WHERE user_id=$1`, [tempAdminId]).catch(()=>{});
  await pg.query(`DELETE FROM admin_actions WHERE admin_id=$1`, [tempAdminId]).catch(()=>{});
  await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [TEST_EMAIL]).catch(()=>{});
  await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [TEST_PHONE]).catch(()=>{});
  await pg.query(`DELETE FROM users WHERE id=$1`, [tempAdminId]);
  console.log('  removed throwaway admin + related rows');
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,300) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
