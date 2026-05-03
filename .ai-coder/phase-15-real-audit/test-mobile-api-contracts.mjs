// Phase 18 — mobile API contract test.
// For every API URL template extracted from apps/mobile/app/**/*.tsx,
// hit the endpoint as the right role and report status.
//
// Method: extract URL → substitute test IDs from DB seed → fetch → assert.
// Goal: catch wrong URLs (404), schema-drift (500), auth/role mismatches
// (401/403 where the screen expects access).
//
// We CAN'T verify the response shape matches the screen's expected
// type at this layer (no device runtime). We CAN verify the endpoint
// returns 2xx as the user role the screen runs under.

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const CUSTOMER_PHONE = '+639171234567';
const PROVIDER_PHONE = '+639221234567';
const KNOWN_OTP_CUST = '654321';
const KNOWN_OTP_PROV = '123456';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

function hashOtp(code, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code + ':' + phone, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `scrypt:131072:8:1:${salt}:${h}`;
}

// Fresh OTP setup for both
for (const [phone, code] of [[CUSTOMER_PHONE, KNOWN_OTP_CUST], [PROVIDER_PHONE, KNOWN_OTP_PROV]]) {
  await pg.query(`DELETE FROM otp_codes WHERE phone=$1`, [phone]);
  await pg.query(`DELETE FROM security_events WHERE event_type='otp_lockout'`);
  await pg.query(`DELETE FROM login_attempts WHERE phone=$1`, [phone]);
  await pg.query(`INSERT INTO otp_codes (phone, code_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [phone, hashOtp(code, phone)]);
}

async function login(phone, code) {
  const r = await fetch(API + '/api/v1/auth/verify-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
    },
    body: JSON.stringify({ phone, code }),
  });
  const j = await r.json();
  if (!j.data?.accessToken) throw new Error('login failed for ' + phone + ': ' + JSON.stringify(j).slice(0,200));
  return { token: j.data.accessToken, userId: j.data.user.id };
}

console.log('Logging in customer + provider...');
const customer = await login(CUSTOMER_PHONE, KNOWN_OTP_CUST);
console.log('  customer:', customer.userId.slice(0,8));
const provider = await login(PROVIDER_PHONE, KNOWN_OTP_PROV);
console.log('  provider:', provider.userId.slice(0,8));

// Pull real IDs from DB
const bookingRow = await pg.query(
  `SELECT id FROM bookings WHERE customer_id=$1 LIMIT 1`, [customer.userId]);
const customerBookingId = bookingRow.rows[0]?.id;
const providerRow = await pg.query(
  `SELECT id FROM providers WHERE user_id=$1`, [provider.userId]);
const providerProviderId = providerRow.rows[0]?.id;
const someProvRow = await pg.query(`SELECT id FROM providers LIMIT 1`);
const someProviderId = someProvRow.rows[0]?.id;
const subcatRow = await pg.query(`SELECT id, slug FROM service_subcategories LIMIT 1`);
const someSubcategorySlug = subcatRow.rows[0]?.slug;
const someSubcategoryId = subcatRow.rows[0]?.id;
const catRow = await pg.query(`SELECT slug FROM service_categories LIMIT 1`);
const someCategorySlug = catRow.rows[0]?.slug;
console.log('  testdata: bookingId=', customerBookingId?.slice(0,8), 'providerId=', someProviderId?.slice(0,8));

let pass = 0, fail = 0;
const allFails = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); allFails.push({msg, extra}); }
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
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,200) }; }
  return { status: r.status, body: j };
}

// ─── Customer endpoints ─────────────────────────────────────────────
console.log('\n=== Customer mobile endpoints ===');

const customerEps = [
  // Auth + profile
  ['GET', '/api/v1/auth/me'],
  // Tabs/home — note: mobile uses /catalog (not /categories — that was
  // an extraction artifact from a comment, not a real call)
  ['GET', '/api/v1/promotions/active'],
  ['GET', '/api/v1/suki/memberships'],
  ['GET', '/api/v1/notifications?limit=5'],
  ['GET', '/api/v1/notifications/preferences'],
  ['GET', '/api/v1/addresses'],
  // Bookings
  ['GET', '/api/v1/bookings?limit=5'],
  ['GET', '/api/v1/bookings/upcoming-holidays'],
  ['GET', '/api/v1/bookings/history/rebookable'],
  // Wallet — mobile uses /wallet root + /wallet/transactions; /wallet/balance
  // is NOT actually called (string was a false positive from regex extraction).
  ['GET', '/api/v1/wallet'],
  ['GET', '/api/v1/wallet/transactions?page=1&pageSize=5'],
  // Catalog (public read)
  ['GET', '/api/v1/catalog'],
  ...(someCategorySlug ? [['GET', `/api/v1/catalog/${someCategorySlug}`]] : []),
  ['GET', '/api/v1/catalog/search?q=clean'],
  // Reviews
  ...(someProviderId ? [['GET', `/api/v1/reviews/provider/${someProviderId}`]] : []),
  // Recurring
  ['GET', '/api/v1/recurring'],
  // Referrals
  ['GET', '/api/v1/referrals/my-code'],
  ['GET', '/api/v1/referrals/my-referrals'],
  // Compliance (DSR self-service)
  ['GET', '/api/v1/compliance/my-pending-consents'],
  ['GET', '/api/v1/compliance/my-requests'],
  // Account management
  ['GET', '/api/v1/account/deletion/status'],
  // Service areas (public)
  ['GET', '/api/v1/service-areas'],
  // Suki tiers
  ['GET', '/api/v1/suki/tiers'],
  // Settings public
  ['GET', '/api/v1/settings/cancellation-policy'],
  // Conversations
  ['GET', '/api/v1/conversations'],
  ['GET', '/api/v1/conversations/unread/count'],
  // Provider detail (customer browses providers)
  ...(someProviderId ? [['GET', `/api/v1/providers/${someProviderId}`]] : []),
  // Booking detail
  ...(customerBookingId ? [['GET', `/api/v1/bookings/${customerBookingId}`]] : []),
  ...(customerBookingId ? [['GET', `/api/v1/bookings/${customerBookingId}/quotes`]] : []),
  // booking photos is uploaded via /api/v1/uploads/booking-photo, not GET-listed
  // by mobile. The /bookings/:id/photos URL was an extraction false positive.
  // Pricing preview (no body — should error 400)
  // ['POST', '/api/v1/bookings/pricing-preview'],
  // Subcategory addons
  ...(someSubcategoryId ? [['GET', `/api/v1/catalog/subcategory/${someSubcategoryId}/addons`]] : []),
  // Slot waitlist (might be empty)
  ['GET', '/api/v1/bookings/slot-waitlist?day=2026-05-04'],
  // Reviews on a booking
  ...(customerBookingId ? [['GET', `/api/v1/reviews/booking/${customerBookingId}`]] : []),
  // Tips on booking
  ...(customerBookingId ? [['GET', `/api/v1/tips/booking/${customerBookingId}`]] : []),
  // Disputes — customer files via POST. List comes from /disputes/my (per-user).
  ['GET', '/api/v1/disputes/my'],
  // Config (mobile may pull runtime config)
  ['GET', '/api/v1/config'],
  // Security devices
  ['GET', '/api/v1/security/devices'],
  // Service areas check
  ['GET', '/api/v1/service-areas/check?lat=14.5&lng=121.0'],
  // Conversations (BUG-PHASE18-07 fix exposes via alias mount)
  ['GET', '/api/v1/conversations'],
  ['GET', '/api/v1/conversations/unread/count'],
];

for (const [m, u] of customerEps) {
  const r = await call(customer.token, m, u);
  // Accept 2xx, plus 404 for endpoints that legitimately can be empty (e.g.
  // tips on a booking without tips). 4xx other than 404 is usually a bug.
  // 5xx is always a bug.
  const ok = r.status >= 200 && r.status < 300;
  check(ok, `${m} ${u} → ${r.status}`,
    !ok ? JSON.stringify(r.body).slice(0,200) : '');
}

// ─── Provider endpoints ─────────────────────────────────────────────
console.log('\n=== Provider mobile endpoints ===');

const providerEps = [
  ['GET', '/api/v1/auth/me'],
  ['GET', '/api/v1/providers/me'],
  ['GET', '/api/v1/providers/me/services'],
  ['GET', '/api/v1/providers/me/schedule'],
  ['GET', '/api/v1/providers/me/portfolio'],
  ['GET', '/api/v1/providers/me/certifications'],
  // /providers/me/skills, /providers/me/availability (root), and
  // /providers/me/service-area are POST-only — mobile only writes them
  // (toggle availability, save skills, set area). Removed from GET sweep.
  ['GET', '/api/v1/providers/me/availability/status'],
  ['GET', '/api/v1/providers/me/availability/overrides'],
  ['GET', '/api/v1/providers/me/calendar?from=2026-04-01&to=2026-06-01'],
  ['GET', '/api/v1/providers/me/earnings/summary'],
  ['GET', '/api/v1/providers/me/earnings/trends?period=daily&days=7'],
  ['GET', '/api/v1/providers/me/earnings/categories?period=daily&days=7'],
  ['GET', '/api/v1/providers/me/monthly-summary'],
  ['GET', '/api/v1/providers/me/demand-insights'],
  ['GET', '/api/v1/providers/me/tier-progression'],
  ['GET', '/api/v1/providers/me/nbi-status'],
  ['GET', '/api/v1/providers/me/goals'],
  ['GET', '/api/v1/providers/application-status'],
  // Wallet (provider also has a wallet)
  ['GET', '/api/v1/wallet'],
  ['GET', '/api/v1/wallet/payouts'],
  ['GET', '/api/v1/wallet/payout-preferences'],
  ['GET', '/api/v1/wallet/transactions?page=1&pageSize=5'],
  // Reviews on this provider
  ...(providerProviderId ? [['GET', `/api/v1/reviews/provider/${providerProviderId}`]] : []),
  // Service areas
  ['GET', '/api/v1/service-areas/provider/my-areas'],
  // Suki provider customers
  ['GET', '/api/v1/suki/provider-customers'],
  // Notifications
  ['GET', '/api/v1/notifications?limit=5'],
  // Bookings (provider sees their assigned ones)
  ['GET', '/api/v1/bookings?limit=5'],
  // Provider also has a chat
  ['GET', '/api/v1/conversations'],
  ['GET', '/api/v1/conversations/unread/count'],
];

for (const [m, u] of providerEps) {
  const r = await call(provider.token, m, u);
  const ok = r.status >= 200 && r.status < 300;
  check(ok, `${m} ${u} → ${r.status}`,
    !ok ? JSON.stringify(r.body).slice(0,200) : '');
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (allFails.length) {
  console.log('\n--- All failures ---');
  allFails.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n      '+JSON.stringify(f.extra).slice(0,200) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
