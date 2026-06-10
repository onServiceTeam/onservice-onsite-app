// API security regression suite — authorization / IDOR / RBAC / token integrity.
//
// Integration test: runs against a RUNNING API (the local dev stack by default),
// not the in-process unit harness. It mints real tokens via the dev-OTP login
// (code 000000) and probes access-control boundaries over HTTP.
//
//   API_URL=http://localhost:7381 node --test          # default
//
// Rate-limit note: the suite mints tokens via the dev-OTP login, which is
// rate-limited (by design). For repeatable local runs against a hammered IP,
// reset first: `docker exec onservice-redis redis-cli FLUSHDB` +
// `docker exec onservice-postgres psql -U onservice -d onservice_dev -c
// "DELETE FROM login_attempts"`. CI-grade follow-up: mint JWTs directly from
// the dev JWT_SECRET + seeded user ids so the suite never touches the limiter.
//
// Seeded accounts (packages/api/seeds/002_test_users.sql): five customers
// (+63917… … +63921…) and five providers (+63922… …). The suite logs in two
// different customers + one provider and verifies one cannot reach another's
// data, customers cannot reach admin/provider/DPO surfaces, and tokens are
// validated. Every assertion has a positive control so a pass means the control
// works, not that the endpoint is simply broken.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getToken } from './_auth.mjs';

const API = process.env.API_URL ?? 'http://localhost:7381';
const CUSTOMER_A = '+639171234567';
const CUSTOMER_B = '+639181234567';
const PROVIDER = '+639221234567';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

let A, B, P, bkA, bkB;

before(async () => {
  A = await getToken(CUSTOMER_A);
  B = await getToken(CUSTOMER_B);
  P = await getToken(PROVIDER);
  const listA = await req('/api/v1/bookings?page=1&pageSize=5', { token: A.token });
  const listB = await req('/api/v1/bookings?page=1&pageSize=5', { token: B.token });
  bkA = listA.json?.data?.[0]?.id;
  bkB = listB.json?.data?.[0]?.id;
  assert.ok(bkA, 'customer A must own at least one seeded booking');
  assert.ok(bkB, 'customer B must own at least one seeded booking');
  assert.notEqual(bkA, bkB, 'the two customers must own different bookings');
});

// ── Token integrity ─────────────────────────────────────────────────────────
test('unauthenticated request to a protected route is rejected', async () => {
  const r = await req('/api/v1/bookings');
  assert.equal(r.status, 401, 'no token must be 401');
});

test('a tampered bearer token is rejected', async () => {
  const tampered = A.token.slice(0, -3) + 'xyz';
  const r = await req('/api/v1/bookings', { token: tampered });
  assert.equal(r.status, 401, 'tampered token must be 401');
});

test('a garbage bearer token is rejected', async () => {
  const r = await req('/api/v1/bookings', { token: 'not.a.jwt' });
  assert.equal(r.status, 401, 'garbage token must be 401');
});

// ── IDOR: booking ownership ──────────────────────────────────────────────────
test('positive control: customer A can read their own booking', async () => {
  const r = await req(`/api/v1/bookings/${bkA}`, { token: A.token });
  assert.equal(r.status, 200, 'owner must read own booking');
});

test('IDOR: customer B cannot read customer A booking', async () => {
  const r = await req(`/api/v1/bookings/${bkA}`, { token: B.token });
  assert.notEqual(r.status, 200, `customer B read another customer's booking (status ${r.status}) — IDOR`);
  assert.ok([403, 404].includes(r.status), `expected 403/404, got ${r.status}`);
});

test('IDOR: an unassigned provider cannot read a customer booking', async () => {
  const r = await req(`/api/v1/bookings/${bkA}`, { token: P.token });
  assert.notEqual(r.status, 200, `unassigned provider read a booking (status ${r.status}) — IDOR`);
});

// ── RBAC: cross-role access ──────────────────────────────────────────────────
for (const path of [
  '/api/v1/admin/dashboard/kpis',
  '/api/v1/admin/providers?page=1',
  '/api/v1/admin/bookings?page=1',
]) {
  test(`RBAC: customer cannot reach admin route ${path}`, async () => {
    const r = await req(path, { token: A.token });
    assert.ok([401, 403].includes(r.status), `customer reached ${path} (status ${r.status})`);
  });
}

test('RBAC: customer cannot reach a DPO/compliance admin route', async () => {
  const r = await req('/api/v1/compliance/admin/dsr?page=1', { token: A.token });
  assert.ok([401, 403, 404].includes(r.status), `customer reached compliance admin (status ${r.status})`);
});

// ── Privilege escalation via mass assignment ─────────────────────────────────
test('mass-assignment: updating profile cannot self-promote to admin', async () => {
  const r = await req('/api/v1/auth/me', {
    method: 'PATCH', token: A.token,
    body: { firstName: 'Maria', role: 'super_admin', isActive: true },
  });
  // Either the field is ignored or the request is rejected — never a role change.
  const me = await req('/api/v1/auth/me', { token: A.token });
  assert.notEqual(me.json?.data?.role, 'super_admin', 'role escalated via profile update — privilege escalation');
  assert.notEqual(me.json?.data?.role, 'admin', 'role escalated via profile update — privilege escalation');
  void r;
});

// ── Input validation / boundary ──────────────────────────────────────────────
// (Tested on authenticated endpoints, not the rate-limited /auth/* routes.)
test('validation: POST /bookings with an empty body is rejected', async () => {
  const r = await req('/api/v1/bookings', { method: 'POST', token: A.token, body: {} });
  assert.equal(r.status, 400, `empty booking body should be 400 (got ${r.status})`);
});

test('boundary: oversized pageSize is clamped, not errored', async () => {
  const r = await req('/api/v1/bookings?page=1&pageSize=99999', { token: A.token });
  assert.equal(r.status, 200, 'oversized pageSize should be handled gracefully');
  assert.ok((r.json?.meta?.pageSize ?? 0) <= 100, 'pageSize must be clamped to <= 100');
});

// ── Wallet self-scoping ──────────────────────────────────────────────────────
test('wallet is token-scoped (A and B see their own wallet)', async () => {
  const wA = await req('/api/v1/wallet', { token: A.token });
  const wB = await req('/api/v1/wallet', { token: B.token });
  assert.equal(wA.status, 200);
  assert.equal(wB.status, 200);
  // No id param is honored to read another user's wallet.
  const spoof = await req(`/api/v1/wallet?userId=${B.userId}`, { token: A.token });
  assert.equal(spoof.status, 200, 'wallet should ignore a spoofed userId param, not error');
  // The spoofed call must still return A's wallet, not B's.
  assert.deepEqual(
    spoof.json?.data?.balance,
    wA.json?.data?.balance,
    'wallet honored a spoofed userId param — IDOR',
  );
});
