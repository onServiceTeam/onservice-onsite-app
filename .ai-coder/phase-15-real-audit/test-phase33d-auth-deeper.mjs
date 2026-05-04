// Phase 33d — auth flows beyond OTP issuance.
//
// Coverage (mostly via direct service calls so we have fresh tokens to play with):
//   1. GET /auth/me returns profile
//   2. PATCH /auth/me updates firstName/lastName
//   3. PATCH /auth/me email rejects duplicate (MED-N81 → 409)
//   4. PATCH /auth/me with no fields → 400
//   5. POST /auth/refresh-token rotates token (old hash deleted)
//   6. POST /auth/refresh-token bogus → 401
//   7. POST /auth/refresh-token same token twice → second 401 (rotation)
//   8. POST /auth/logout with refreshToken removes only that hash
//   9. POST /auth/logout (no body refreshToken) → 400 (validator)
//  10. After logout, the refresh token is rejected on subsequent /refresh-token
//  11. POST /auth/me with bad email format → 400

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const REPO_ROOT = process.cwd();

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

// Need the auth service to mint a real refresh-token row so we can
// drive /refresh-token + /logout against the live DB.
const authSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/auth.service.ts')
).href);

async function makeUser() {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name, email)
     VALUES ($1, 'customer', TRUE, 'P33d', 'X', $2) RETURNING id`,
    [phone, `p33d_${Date.now()}_${Math.floor(Math.random()*9999)}@test.com`]);
  const userId = u.rows[0].id;
  // Real token pair via service so refresh_tokens row exists
  const pair = await authSvc.createTokenPair(userId, 'customer');
  return { userId, accessToken: pair.accessToken, refreshToken: pair.refreshToken };
}

const ALICE = await makeUser();
const BOB = await makeUser();   // for email-collision target

// ════════════════════════════════════════════════════════════════════
// 1. GET /auth/me
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /auth/me ===');
const r1 = await call(ALICE.accessToken, 'GET', '/api/v1/auth/me');
check(r1.status === 200, `→ 200 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
check(r1.body?.data?.id === ALICE.userId, 'id matches');
check(typeof r1.body?.data?.mustRotatePassword === 'boolean',
  'mustRotatePassword present (LL#12)');

// ════════════════════════════════════════════════════════════════════
// 2. PATCH /auth/me firstName/lastName
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. PATCH /auth/me name ===');
const r2 = await call(ALICE.accessToken, 'PATCH', '/api/v1/auth/me', {
  firstName: 'AliceP33d',
  lastName: 'Updated',
});
check(r2.status === 200, `→ 200 (got ${r2.status})`,
  JSON.stringify(r2.body).slice(0,200));
check(r2.body?.data?.firstName === 'AliceP33d', `firstName updated`);
check(r2.body?.data?.lastName === 'Updated', `lastName updated`);

// ════════════════════════════════════════════════════════════════════
// 3. PATCH email — duplicate → 409 (MED-N81)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. PATCH email duplicate → 409 (MED-N81) ===');
const bobEmail = (await pg.query(`SELECT email FROM users WHERE id=$1`, [BOB.userId])).rows[0].email;
const r3 = await call(ALICE.accessToken, 'PATCH', '/api/v1/auth/me', {
  email: bobEmail,
});
check(r3.status === 409, `→ 409 (got ${r3.status})`,
  JSON.stringify(r3.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 4. PATCH /me with no fields → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. PATCH no fields → 400 ===');
const r4 = await call(ALICE.accessToken, 'PATCH', '/api/v1/auth/me', {});
check(r4.status === 400, `→ 400 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. PATCH /me with bad email format → 400 (validator)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. PATCH bad email format → 400 ===');
const r11 = await call(ALICE.accessToken, 'PATCH', '/api/v1/auth/me', {
  email: 'not-an-email',
});
check(r11.status === 400, `→ 400 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. POST /auth/refresh-token rotates
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. POST /refresh-token rotates ===');
const r5 = await call(null, 'POST', '/api/v1/auth/refresh-token', {
  refreshToken: ALICE.refreshToken,
});
check(r5.status === 200, `→ 200 (got ${r5.status})`,
  JSON.stringify(r5.body).slice(0,200));
check(typeof r5.body?.data?.accessToken === 'string', 'accessToken returned');
check(typeof r5.body?.data?.refreshToken === 'string', 'refreshToken returned');
check(r5.body?.data?.refreshToken !== ALICE.refreshToken, 'new refreshToken differs');
const ALICE_REFRESH_2 = r5.body.data.refreshToken;

// ════════════════════════════════════════════════════════════════════
// 6. Bogus refresh → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Bogus refresh → 401 ===');
const r6 = await call(null, 'POST', '/api/v1/auth/refresh-token', {
  refreshToken: 'eyJhbGciOiJIUzI1NiJ9.bogus.signature',
});
check(r6.status === 401, `→ 401 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. Same (already-rotated) token → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Already-rotated old token → 401 ===');
const r7 = await call(null, 'POST', '/api/v1/auth/refresh-token', {
  refreshToken: ALICE.refreshToken,    // the one we used in step 5
});
check(r7.status === 401, `→ 401 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. POST /logout removes only that hash
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. POST /logout removes that hash ===');
// Bob still has his original refresh token. Take a snapshot.
const bobBefore = await pg.query(
  `SELECT COUNT(*)::int AS c FROM refresh_tokens WHERE user_id=$1`,
  [BOB.userId]);
const r8 = await call(BOB.accessToken, 'POST', '/api/v1/auth/logout', {
  refreshToken: BOB.refreshToken,
});
check(r8.status === 200, `→ 200 (got ${r8.status})`);
const bobAfter = await pg.query(
  `SELECT COUNT(*)::int AS c FROM refresh_tokens WHERE user_id=$1`,
  [BOB.userId]);
check(bobAfter.rows[0].c === bobBefore.rows[0].c - 1,
  `Bob refresh count -1 (before=${bobBefore.rows[0].c} after=${bobAfter.rows[0].c})`);

// ════════════════════════════════════════════════════════════════════
// 10. After logout, that refresh token is unusable
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Logged-out token → 401 on /refresh-token ===');
const r10 = await call(null, 'POST', '/api/v1/auth/refresh-token', {
  refreshToken: BOB.refreshToken,
});
check(r10.status === 401, `→ 401 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. POST /logout with no body refreshToken → 200 + revokes ALL
//    (logoutSchema marks refreshToken optional → service path with
//    no token deletes every refresh_tokens row for the userId — this
//    is the "log out from all devices" code path).
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. POST /logout no body → 200, revokes all sessions ===');
// Give Alice a 2nd refresh row so we can prove "all" is wiped.
const extra = await authSvc.createTokenPair(ALICE.userId, 'customer');
const aliceBefore = await pg.query(
  `SELECT COUNT(*)::int AS c FROM refresh_tokens WHERE user_id=$1`,
  [ALICE.userId]);
check(aliceBefore.rows[0].c >= 2, `Alice has ≥2 refresh rows (got ${aliceBefore.rows[0].c})`);

const r9 = await call(ALICE.accessToken, 'POST', '/api/v1/auth/logout', {});
check(r9.status === 200, `→ 200 (got ${r9.status})`);
const aliceAfter = await pg.query(
  `SELECT COUNT(*)::int AS c FROM refresh_tokens WHERE user_id=$1`,
  [ALICE.userId]);
check(aliceAfter.rows[0].c === 0,
  `all refresh_tokens for Alice deleted (got ${aliceAfter.rows[0].c})`);
void extra;

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM refresh_tokens WHERE user_id IN ($1,$2)`,
  [ALICE.userId, BOB.userId]);
await pg.query(`DELETE FROM login_attempts WHERE phone IN (
  SELECT phone FROM users WHERE id IN ($1,$2)
)`, [ALICE.userId, BOB.userId]);
await pg.query(`DELETE FROM audit_log WHERE user_id IN ($1,$2)`,
  [ALICE.userId, BOB.userId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [ALICE.userId, BOB.userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
