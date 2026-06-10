// Shared token helper for the API security/integration suites.
//
// Two modes:
//  1. DIRECT MINT (preferred for CI / repeatable runs) — when MINT_SECRET is set
//     (the dev JWT secret) and MINT_IDS maps phones to {id, role}, sign an
//     HS256 access token locally. This never touches the rate-limited OTP login,
//     so the suite is deterministic. Use ONLY against a dev/test box whose JWT
//     secret you legitimately hold.
//  2. OTP LOGIN (fallback) — mint via the real /auth dev-OTP flow (code 000000).
//     Subject to rate limiting; fine for a one-off local run.
//
// MINT_SECRET / MINT_IDS are provided by the run wrapper, which resolves the
// seeded user ids from the DB. Nothing secret is committed.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:7381';
const MINT_SECRET = process.env.MINT_SECRET;
const MINT_IDS = process.env.MINT_IDS ? JSON.parse(process.env.MINT_IDS) : {};

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function mint(userId, role, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ userId, role, iat: now, exp: now + ttlSec }));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', MINT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Returns { token, userId } for a seeded phone, minting or logging in. */
export async function getToken(phone) {
  if (MINT_SECRET && MINT_IDS[phone]) {
    const { id, role } = MINT_IDS[phone];
    return { token: mint(id, role), userId: id };
  }
  await fetch(`${API}/api/v1/auth/send-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const res = await fetch(`${API}/api/v1/auth/verify-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '000000' }),
  });
  const json = await res.json().catch(() => null);
  assert.equal(res.status, 200, `login ${phone} -> ${res.status} (rate limited? use MINT_SECRET)`);
  return { token: json.data.accessToken, userId: json.data?.user?.id };
}
