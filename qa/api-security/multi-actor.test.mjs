// Multi-actor consistency test — a single booking, seen by its two real parties.
//
// Verifies cross-actor data consistency and scoping over HTTP against a running
// API: the customer (owner) and the ASSIGNED provider both see the same booking
// with a consistent core view, while an unrelated customer cannot see it at all.
// This is the API-level backbone of the "customer books -> provider sees ->
// admin sees" flow; admin-side visibility is covered by the Playwright admin
// E2E (apps/admin/tests/live/admin.spec.ts).
//
//   API_URL=http://localhost:7381 node --test multi-actor.test.mjs
//
// Seeded triple (defaults match packages/api/seeds): customer 9171… owns a
// booking assigned to provider 9231…. A third customer 9181… is unrelated. The
// shared booking is discovered dynamically (not by UUID) so it survives re-seeds.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getToken } from './_auth.mjs';

const API = process.env.API_URL ?? 'http://localhost:7381';
const OWNER = process.env.CUSTOMER_PHONE ?? '+639171234567';
const PROVIDER = process.env.PROVIDER_PHONE ?? '+639231234567';
const OTHER = process.env.OTHER_PHONE ?? '+639181234567';

async function req(path, { token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

let ownerTok, providerTok, otherTok, sharedBookingId, ownerView;

before(async () => {
  ownerTok = (await getToken(OWNER)).token;
  providerTok = (await getToken(PROVIDER)).token;
  otherTok = (await getToken(OTHER)).token;

  // Discover the booking the owner and the assigned provider share: walk the
  // owner's bookings and find the first one the provider can also read.
  const list = await req('/api/v1/bookings?page=1&pageSize=20', { token: ownerTok });
  assert.equal(list.status, 200, 'owner can list own bookings');
  for (const b of list.json?.data ?? []) {
    const p = await req(`/api/v1/bookings/${b.id}`, { token: providerTok });
    if (p.status === 200) { sharedBookingId = b.id; ownerView = b; break; }
  }
  assert.ok(sharedBookingId, 'expected a seeded booking shared by this customer + provider');
});

test('owner can read the shared booking', async () => {
  const r = await req(`/api/v1/bookings/${sharedBookingId}`, { token: ownerTok });
  assert.equal(r.status, 200);
  assert.equal(r.json?.data?.id, sharedBookingId);
});

test('assigned provider sees the SAME booking with a consistent core view', async () => {
  const r = await req(`/api/v1/bookings/${sharedBookingId}`, { token: providerTok });
  assert.equal(r.status, 200, 'assigned provider must read the booking');
  // Both parties must agree on the identity, status, and price of the booking.
  assert.equal(r.json?.data?.id, sharedBookingId, 'id must match across actors');
  assert.equal(r.json?.data?.status, ownerView.status, 'status must match across actors');
  assert.equal(
    r.json?.data?.servicePrice, ownerView.servicePrice,
    'servicePrice must match across actors',
  );
});

test('an unrelated customer cannot see the shared booking', async () => {
  const r = await req(`/api/v1/bookings/${sharedBookingId}`, { token: otherTok });
  assert.notEqual(r.status, 200, `unrelated customer read the booking (status ${r.status}) — IDOR`);
});
