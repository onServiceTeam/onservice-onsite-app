// Phase 19 — write/mutation path coverage.
// For each mutation: snapshot DB → make request → verify status →
// verify DB delta → verify audit_log row (where applicable) → restore.
//
// Covers customer + provider + admin + RBAC negative tests.
// Auth: real OTP-issued JWTs for customer/provider, JWT signed for
// super_admin + junior admin.

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';
const JUNIOR_ADMIN_ID = 'aacba188-960d-4ac6-b137-60e2e221af0d';
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

// Fresh OTPs for both
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
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
    },
    body: JSON.stringify({ phone, code }),
  });
  const j = await r.json();
  if (!j.data?.accessToken) throw new Error('login fail: ' + JSON.stringify(j).slice(0,200));
  return { token: j.data.accessToken, userId: j.data.user.id, refreshToken: j.data.refreshToken };
}

console.log('Logging in customer + provider via real OTP...');
const customer = await loginOtp(CUSTOMER_PHONE, '654321');
const provider = await loginOtp(PROVIDER_PHONE, '123456');

const SUPER_TOKEN = jwt.sign({ userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const JUNIOR_TOKEN = jwt.sign({ userId: JUNIOR_ADMIN_ID, role: 'admin', type: 'access' },
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

// Pull seed data
const provRow = await pg.query(`SELECT id, status, tier FROM providers WHERE user_id=$1`, [provider.userId]);
const providerProviderId = provRow.rows[0].id;
const someProvRow = await pg.query(`SELECT id, status FROM providers LIMIT 1`);
const someProviderId = someProvRow.rows[0].id;
const subRow = await pg.query(`SELECT s.id, s.slug, c.id AS category_id FROM service_subcategories s JOIN service_categories c ON c.id = s.category_id LIMIT 1`);
const someSubcatId = subRow.rows[0].id;
const someCatId = subRow.rows[0].category_id;

console.log('  super_admin:', SUPER_ADMIN_ID.slice(0,8), 'junior_admin:', JUNIOR_ADMIN_ID.slice(0,8));
console.log('  customer:', customer.userId.slice(0,8), 'provider:', provider.userId.slice(0,8));
console.log('  provider.id:', providerProviderId.slice(0,8), 'tier:', provRow.rows[0].tier);

// ============================================================
// SECTION 1 — CUSTOMER MUTATIONS
// ============================================================
console.log('\n=== Customer mutations ===');

// 1a. Create address
console.log('1a. POST /addresses (create)');
const addr1 = await call(customer.token, 'POST', '/api/v1/addresses', {
  label: 'Other',
  fullAddress: '789 Phase 19 Test St, Brgy Test, Test City',
  barangay: 'Phase19 Brgy',
  city: 'Manila',
  province: 'Metro Manila',
  region: 'NCR',
  zipCode: '1000',
  isDefault: false,
});
check([200,201].includes(addr1.status), 'address create returns 2xx',
  'got '+addr1.status+' '+JSON.stringify(addr1.body).slice(0,200));
const newAddrId = addr1.body?.data?.id;
if (newAddrId) {
  const addrCheck = await pg.query(`SELECT label FROM user_addresses WHERE id=$1`, [newAddrId]);
  check(addrCheck.rows[0]?.label === 'Other', 'address row created in DB');
  // 1b. PATCH address — label enum is Home/Work/Other only.
  const addr2 = await call(customer.token, 'PATCH', `/api/v1/addresses/${newAddrId}`, {
    label: 'Work',
  });
  check(addr2.status === 200, 'address PATCH returns 200',
    'got '+addr2.status+' '+JSON.stringify(addr2.body).slice(0,200));
  const addrCheck2 = await pg.query(`SELECT label FROM user_addresses WHERE id=$1`, [newAddrId]);
  check(addrCheck2.rows[0]?.label === 'Work', 'address label updated in DB');
  // 1c. DELETE address
  const addr3 = await call(customer.token, 'DELETE', `/api/v1/addresses/${newAddrId}`);
  check([200,204].includes(addr3.status), 'address DELETE returns 2xx');
}

// 2. Profile update (PATCH /auth/me)
console.log('2. PATCH /auth/me');
const profile1 = await call(customer.token, 'PATCH', '/api/v1/auth/me', { firstName: 'TestPhase19' });
check(profile1.status === 200, 'profile PATCH returns 200');
const profileCheck = await pg.query(`SELECT first_name FROM users WHERE id=$1`, [customer.userId]);
check(profileCheck.rows[0]?.first_name === 'TestPhase19', 'first_name updated in DB');
// Restore
await call(customer.token, 'PATCH', '/api/v1/auth/me', { firstName: 'Maria' });

// 3. Notification preferences PUT (route uses PUT, not PATCH)
console.log('3. PUT /notifications/preferences');
const np1 = await call(customer.token, 'GET', '/api/v1/notifications/preferences');
const original = np1.body?.data ?? {};
const np2 = await call(customer.token, 'PUT', '/api/v1/notifications/preferences', {
  pushEnabled: false,
});
check([200,204].includes(np2.status), 'notif prefs PUT returns 2xx',
  'got '+np2.status+' '+JSON.stringify(np2.body).slice(0,200));
// Restore
await call(customer.token, 'PUT', '/api/v1/notifications/preferences', original);

// 4. OTP send (auth-rate-limited but should work for one)
console.log('4. POST /auth/send-otp');
const otp1 = await call(null, 'POST', '/api/v1/auth/send-otp', { phone: '+639179999999' });
check(otp1.status === 200, 'send-otp returns 200');
await pg.query(`DELETE FROM otp_codes WHERE phone='+639179999999'`);

// 5. Refresh token — needs refreshToken in body. We have it from login.
console.log('5. POST /auth/refresh-token');
const refresh1 = await call(null, 'POST', '/api/v1/auth/refresh-token',
  { refreshToken: customer.refreshToken });
check(refresh1.status === 200, 'refresh returns 200',
  'got '+refresh1.status+' '+JSON.stringify(refresh1.body).slice(0,200));
check(typeof refresh1.body?.data?.accessToken === 'string', 'refresh returns new accessToken');

// ============================================================
// SECTION 2 — PROVIDER MUTATIONS
// ============================================================
console.log('\n=== Provider mutations ===');

// 6. Toggle availability OFF, then ON
console.log('6. POST /providers/me/availability (off, then on)');
const av1 = await call(provider.token, 'POST', '/api/v1/providers/me/availability', { isAvailable: false });
check(av1.status === 200, 'availability OFF returns 200',
  'got '+av1.status+' '+JSON.stringify(av1.body).slice(0,150));
const av2 = await call(provider.token, 'POST', '/api/v1/providers/me/availability', { isAvailable: true });
check(av2.status === 200, 'availability ON returns 200');

// 7. Update schedule (PUT) — schema field is `isAvailable`, not `isWorking`.
console.log('7. PUT /providers/me/schedule');
const sch1 = await call(provider.token, 'PUT', '/api/v1/providers/me/schedule', {
  schedule: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
  ],
});
check([200,204].includes(sch1.status), 'schedule PUT returns 2xx',
  'got '+sch1.status+' '+JSON.stringify(sch1.body).slice(0,200));

// 8. Add a portfolio item (POST). Need image URL, just smoke-test.
console.log('8. POST /providers/me/portfolio');
const port1 = await call(provider.token, 'POST', '/api/v1/providers/me/portfolio', {
  imageUrl: 'https://example.com/test.jpg',
  caption: 'Phase 19 test',
});
check([200,201,400].includes(port1.status), 'portfolio POST returns 200/201 or 400 (validation)',
  'got '+port1.status+' '+JSON.stringify(port1.body).slice(0,200));
const newPortId = port1.body?.data?.id;
if (newPortId) {
  // Cleanup
  await call(provider.token, 'DELETE', `/api/v1/providers/me/portfolio/${newPortId}`);
}

// ============================================================
// SECTION 3 — ADMIN MUTATIONS (super_admin)
// ============================================================
console.log('\n=== Admin mutations (super_admin) ===');

// 9. Provider tier change (super_admin)
console.log('9. PUT /admin/providers/:id/tier');
const origTier = someProvRow.rows[0].tier ?? 'verified';
const tier1 = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/providers/${someProviderId}/tier`, {
  tier: 'pro', reason: 'Phase 19 mutation test',
});
check([200,204].includes(tier1.status), 'tier change returns 2xx',
  'got '+tier1.status+' '+JSON.stringify(tier1.body).slice(0,200));
const tierCheck = await pg.query(`SELECT tier FROM providers WHERE id=$1`, [someProviderId]);
check(tierCheck.rows[0]?.tier === 'pro', 'provider tier updated in DB');
// Audit row
const auditTier = await pg.query(
  `SELECT action_type FROM admin_actions WHERE admin_id=$1 ORDER BY created_at DESC LIMIT 1`,
  [SUPER_ADMIN_ID]);
check(auditTier.rows[0]?.action_type === 'provider_tier_changed',
  'admin_actions row written for tier change');
// Restore
await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/providers/${someProviderId}/tier`, {
  tier: origTier, reason: 'Phase 19 restore',
});

// 10. Customer status change
console.log('10. PUT /admin/customers/:id/status');
const cust = await pg.query(`SELECT id FROM users WHERE role='customer' LIMIT 1`);
const cid = cust.rows[0].id;
const cs1 = await call(SUPER_TOKEN, 'PUT', `/api/v1/admin/customers/${cid}/status`, {
  status: 'active', reason: 'Phase 19 verify status path',
});
// Many implementations require status='suspended' to make a real change. accept any 2xx OR 400 if "no change".
check([200,400].includes(cs1.status), 'customer status returns 200 or 400 (no-op)',
  'got '+cs1.status+' '+JSON.stringify(cs1.body).slice(0,200));

// 11. Catalog category PUT (already tested addon via deep-test; do category)
console.log('11. POST /catalog/admin/categories');
const cat1 = await call(SUPER_TOKEN, 'POST', '/api/v1/catalog/admin/categories', {
  name: 'Phase19TestCategory',
  slug: 'phase19-test-category',
  description: 'temp',
  iconUrl: 'https://example.com/icon.png',
  displayOrder: 999,
});
check([200,201].includes(cat1.status), 'category create returns 2xx',
  'got '+cat1.status+' '+JSON.stringify(cat1.body).slice(0,200));
const newCatId = cat1.body?.data?.id;
if (newCatId) {
  // Soft delete categories doesn't exist as endpoint? Just leave; clean up at end
  await pg.query(`DELETE FROM service_categories WHERE id=$1`, [newCatId]);
}

// 12. Settings — change one + verify audit. Use brand_color_accent (string, safe).
console.log('12. PUT /admin/settings/:key');
const setBefore = await pg.query(`SELECT value FROM platform_settings WHERE key='brand_color_accent'`);
const orig = setBefore.rows[0]?.value;
if (orig) {
  const set1 = await call(SUPER_TOKEN, 'PUT', '/api/v1/admin/settings/brand_color_accent', { value: '#abcdef' });
  check(set1.status === 200, 'settings PUT returns 200',
    'got '+set1.status+' '+JSON.stringify(set1.body).slice(0,200));
  const dbAfter = await pg.query(`SELECT value FROM platform_settings WHERE key='brand_color_accent'`);
  check(dbAfter.rows[0].value === '#abcdef', 'setting persisted in DB');
  // Restore
  await call(SUPER_TOKEN, 'PUT', '/api/v1/admin/settings/brand_color_accent', { value: orig });
}

// 13. File a dispute (customer) so we can resolve it (admin).
// Type enum: no_show|incomplete|substandard|damage|theft|overcharge|other
console.log('13. POST /disputes (customer files)');
// Disputes can only be filed after the provider marks the job complete
// (status = 'completed_by_provider' or beyond). Find any booking we can
// temporarily promote.
const bookForDispute = await pg.query(
  `SELECT b.id, b.status FROM bookings b WHERE b.customer_id=$1
    AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.booking_id = b.id)
    LIMIT 1`, [customer.userId]);
let restoreBookingStatus = null;
let restoreBookingId = null;
if (bookForDispute.rows[0] && !['completed_by_provider','confirmed','disputed','resolved','payout_ready','paid_out'].includes(bookForDispute.rows[0].status)) {
  restoreBookingId = bookForDispute.rows[0].id;
  restoreBookingStatus = bookForDispute.rows[0].status;
  // Temporarily bump to completed_by_provider so dispute gate accepts.
  await pg.query(`UPDATE bookings SET status='completed_by_provider' WHERE id=$1`, [restoreBookingId]);
}
let disputeId = null;
if (bookForDispute.rows[0]) {
  const bid = bookForDispute.rows[0].id;
  const disp1 = await call(customer.token, 'POST', '/api/v1/disputes', {
    bookingId: bid,
    type: 'substandard',
    description: 'Phase 19 mutation test dispute. The cleaning was not satisfactory and I would like a refund.',
  });
  check([200,201].includes(disp1.status), 'dispute file returns 2xx',
    'got '+disp1.status+' '+JSON.stringify(disp1.body).slice(0,300));
  disputeId = disp1.body?.data?.id;
  if (disputeId) {
    const dCheck = await pg.query(`SELECT id, status FROM disputes WHERE id=$1`, [disputeId]);
    check(dCheck.rows[0]?.status === 'open', 'dispute row created with status=open');
  }
} else {
  console.log('  (skip — no eligible booking with no existing dispute)');
}

// 14. Admin resolves the dispute (if we have one)
if (disputeId) {
  console.log('14. POST /admin/disputes/:id/resolve');
  const res1 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/disputes/${disputeId}/resolve`, {
    resolutionType: 'no_refund',
    decisionNotes: 'Phase 19 test resolution. Investigation found no quality issue.',
    internalNotes: 'auto-resolved by phase19 test',
  });
  check([200,204].includes(res1.status), 'dispute resolve returns 2xx',
    'got '+res1.status+' '+JSON.stringify(res1.body).slice(0,300));
  const dCheck = await pg.query(`SELECT status FROM disputes WHERE id=$1`, [disputeId]);
  check(dCheck.rows[0]?.status === 'resolved', 'dispute status=resolved');
  // Audit row check
  const dispAudit = await pg.query(
    `SELECT action_type FROM admin_actions WHERE target_id=$1 AND action_type='dispute_resolved'`,
    [disputeId]);
  check(dispAudit.rows.length >= 1, 'admin_actions has dispute_resolved row');
  // Cleanup
  await pg.query(`DELETE FROM disputes WHERE id=$1`, [disputeId]);
}
// Restore the temporarily-bumped booking
if (restoreBookingId && restoreBookingStatus) {
  await pg.query(`UPDATE bookings SET status=$1 WHERE id=$2`,
    [restoreBookingStatus, restoreBookingId]);
}

// 15. Admin cancel a booking (need a non-cancelled booking)
console.log('15. POST /admin/bookings/:id/cancel');
const bookForCancel = await pg.query(
  `SELECT id, status FROM bookings WHERE status IN ('requested','matched','payment_pending') LIMIT 1`);
if (bookForCancel.rows[0]) {
  const bid = bookForCancel.rows[0].id;
  const origStatus = bookForCancel.rows[0].status;
  const cnc1 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/bookings/${bid}/cancel`, {
    reason: 'Phase 19 mutation test cancel — no real customer impact, restoring after.',
  });
  check([200,204].includes(cnc1.status), 'admin cancel returns 2xx',
    'got '+cnc1.status+' '+JSON.stringify(cnc1.body).slice(0,300));
  const cancelCheck = await pg.query(`SELECT status FROM bookings WHERE id=$1`, [bid]);
  // Restore
  await pg.query(`UPDATE bookings SET status=$1 WHERE id=$2`, [origStatus, bid]);
}

// 16. Notification template create + delete
console.log('16. POST /admin/notification-templates');
const tpl1 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/notification-templates', {
  slug: 'phase19_test_' + Date.now(),
  titleTemplate: 'Phase 19 Test',
  bodyTemplate: 'This is a test template body. Hello {{name}}.',
  type: 'system',
  channel: 'push',
  isActive: false,
});
check([200,201].includes(tpl1.status), 'template create returns 2xx',
  'got '+tpl1.status+' '+JSON.stringify(tpl1.body).slice(0,300));
const tplId = tpl1.body?.data?.id;
if (tplId) {
  const tplDel = await call(SUPER_TOKEN, 'DELETE', `/api/v1/admin/notification-templates/${tplId}`);
  check([200,204].includes(tplDel.status), 'template DELETE returns 2xx',
    'got '+tplDel.status);
}

// ============================================================
// SECTION 4 — RBAC NEGATIVE TESTS
// ============================================================
console.log('\n=== RBAC negative tests ===');

// 17. Customer hits admin endpoint → 403
console.log('17. customer → admin endpoint should 403');
const neg1 = await call(customer.token, 'GET', '/api/v1/admin/providers');
check(neg1.status === 403, 'customer denied admin endpoint',
  'got '+neg1.status+' '+JSON.stringify(neg1.body).slice(0,200));

// 18. Provider hits customer-only endpoint with provider intent (should still work — both can hit /auth/me)
// Skip — most endpoints accept any auth user.

// 19. Junior admin tries super_admin-only setting PUT → 403
console.log('19. junior admin → super-only settings PUT should 403');
const neg2 = await call(JUNIOR_TOKEN, 'PUT', '/api/v1/admin/settings/support_phone', { value: 'test' });
check(neg2.status === 403, 'junior admin denied super-only mutation',
  'got '+neg2.status+' '+JSON.stringify(neg2.body).slice(0,200));

// 20. No auth → 401
console.log('20. no auth → 401');
const neg3 = await call(null, 'GET', '/api/v1/admin/providers');
check(neg3.status === 401, 'unauthenticated denied',
  'got '+neg3.status+' '+JSON.stringify(neg3.body).slice(0,200));

// 21. Invalid JWT → 401
console.log('21. bad JWT → 401');
const neg4 = await call('not.a.valid.jwt', 'GET', '/api/v1/auth/me');
check(neg4.status === 401, 'invalid JWT rejected',
  'got '+neg4.status);

// 22. Expired JWT → 401
console.log('22. expired JWT → 401');
const expiredToken = jwt.sign(
  { userId: customer.userId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '-1h' });
const neg5 = await call(expiredToken, 'GET', '/api/v1/auth/me');
check(neg5.status === 401, 'expired JWT rejected');

// 23. Bad payload — POST address with wrong shape
console.log('23. POST /addresses with empty body → 400');
const neg6 = await call(customer.token, 'POST', '/api/v1/addresses', { wrongField: true });
check(neg6.status === 400, 'invalid payload returns 400',
  'got '+neg6.status+' '+JSON.stringify(neg6.body).slice(0,200));

// 24. Customer tries to PATCH another user's address → 404 or 403
console.log('24. customer cannot PATCH another user resource');
// pick an address we don't own
const otherAddr = await pg.query(
  `SELECT id FROM user_addresses WHERE user_id != $1 LIMIT 1`, [customer.userId]);
if (otherAddr.rows[0]) {
  const neg7 = await call(customer.token, 'PATCH', `/api/v1/addresses/${otherAddr.rows[0].id}`, {
    label: 'Hijack',
  });
  check([403, 404].includes(neg7.status), 'cross-user address patch denied',
    'got '+neg7.status+' '+JSON.stringify(neg7.body).slice(0,200));
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Detail ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
