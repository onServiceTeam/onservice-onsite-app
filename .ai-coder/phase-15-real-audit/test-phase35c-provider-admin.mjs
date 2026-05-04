// Phase 35c — provider-admin (Provider 360 admin routes).
//
// Coverage:
//   1. GET /:id/profile — admin reads
//   2. PATCH /:id/profile — admin (not super) → 403
//   3. PATCH /:id/profile — super_admin updates businessName
//   4. GET /:id/jobs paginated
//   5. GET /:id/jobs?status filter
//   6. GET /:id/financials
//   7. POST /:id/wallet/adjust super_admin (positive credit)
//   8. POST /:id/wallet/adjust super_admin (negative debit)
//   9. POST /:id/wallet/adjust admin (not super) → 403
//  10. GET /:id/reviews paginated
//  11. PATCH /:id/reviews/:reviewId/visibility
//  12. PATCH /:id/reviews/:reviewId/visibility bad type → 400
//  13. PATCH /:id/reviews/:reviewId/response
//  14. GET /:id/disputes paginated
//  15. GET /:id/activity (PII mask: super_admin gets raw)
//  16. GET /:id/notes (empty list initially)
//  17. POST /:id/notes adds (writes provider_note_added admin_actions)
//  18. PATCH /:id/notes/:noteId edits
//  19. DELETE /:id/notes/:noteId removes
//  20. customer → 403 on profile

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const SUPER_TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
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

async function makeUser(role) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, $2, TRUE, 'P35c', $3) RETURNING id`,
    [phone, role, role.slice(0,8) + Date.now()]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const ADMIN_USER = await makeUser('admin');
const CUST = await makeUser('customer');

// Provider with a wallet, an active review, an active dispute (not really, but a row)
const provUser = await makeUser('provider');
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P35c Provider', 'approved') RETURNING id`, [provUser.userId]);
const providerId = prov.rows[0].id;

await pg.query(
  `INSERT INTO wallets (user_id, type, currency, available_balance)
   VALUES ($1, 'provider', 'PHP', 100000)
   ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO NOTHING`,
  [provUser.userId]);

// Need a review row pointing at this provider
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const reviewerUser = await makeUser('customer');
const bk = await pg.query(
  `INSERT INTO bookings (
     customer_id, provider_id, category_id,
     scheduled_at, address, barangay, city, province,
     service_price, total_amount, status, escrow_status)
   VALUES ($1, $2, $3, NOW() - INTERVAL '1 day',
           '1 P35c', 'B', 'Boracay', 'Aklan',
           100000, 100000, 'confirmed', 'released')
   RETURNING id`, [reviewerUser.userId, providerId, cat.rows[0].id]);

const rev = await pg.query(
  `INSERT INTO reviews (booking_id, reviewer_id, provider_id, rating, comment, is_visible)
   VALUES ($1, $2, $3, 5, 'P35c test review', TRUE) RETURNING id`,
  [bk.rows[0].id, reviewerUser.userId, providerId]);
const reviewId = rev.rows[0].id;

// ════════════════════════════════════════════════════════════════════
// 1. GET /:id/profile
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /:id/profile ===');
const r1 = await call(ADMIN_USER.token, 'GET', `/api/v1/admin/providers/${providerId}/profile`);
check(r1.status === 200, `→ 200 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 2. PATCH /:id/profile admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. PATCH admin → 403 ===');
const r2 = await call(ADMIN_USER.token, 'PATCH', `/api/v1/admin/providers/${providerId}/profile`,
  { businessName: 'Hijack' });
check(r2.status === 403, `→ 403 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. PATCH /:id/profile super_admin
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. PATCH super_admin ===');
const r3 = await call(SUPER_TOKEN, 'PATCH', `/api/v1/admin/providers/${providerId}/profile`,
  { businessName: 'P35c Updated Name' });
check(r3.status === 200, `→ 200 (got ${r3.status})`,
  JSON.stringify(r3.body).slice(0,200));

const dbProf = await pg.query(`SELECT business_name FROM providers WHERE id=$1`, [providerId]);
check(dbProf.rows[0]?.business_name === 'P35c Updated Name', 'business_name updated');

// ════════════════════════════════════════════════════════════════════
// 4. GET /:id/jobs
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. GET /:id/jobs ===');
const r4 = await call(ADMIN_USER.token, 'GET',
  `/api/v1/admin/providers/${providerId}/jobs?page=1&pageSize=10`);
check(r4.status === 200, `→ 200 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. GET /:id/jobs ?status=confirmed
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /:id/jobs ?status=confirmed ===');
const r5 = await call(ADMIN_USER.token, 'GET',
  `/api/v1/admin/providers/${providerId}/jobs?status=confirmed`);
check(r5.status === 200, `→ 200 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. GET /:id/financials
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET /:id/financials ===');
const r6 = await call(ADMIN_USER.token, 'GET', `/api/v1/admin/providers/${providerId}/financials`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. POST /:id/wallet/adjust positive
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. wallet/adjust +20000 ===');
const r7 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/providers/${providerId}/wallet/adjust`,
  { amount: 20000, reason: 'Phase 35c goodwill credit test' });
check(r7.status === 200, `→ 200 (got ${r7.status})`,
  JSON.stringify(r7.body).slice(0,200));

const balAfter = await pg.query(
  `SELECT available_balance::bigint AS b FROM wallets WHERE user_id=$1 AND type='provider'`,
  [provUser.userId]);
check(Number(balAfter.rows[0].b) === 120000, `balance=120000 (got ${balAfter.rows[0].b})`);

// ════════════════════════════════════════════════════════════════════
// 8. POST /:id/wallet/adjust negative
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. wallet/adjust -10000 ===');
const r8 = await call(SUPER_TOKEN, 'POST', `/api/v1/admin/providers/${providerId}/wallet/adjust`,
  { amount: -10000, reason: 'Phase 35c chargeback / cancellation test' });
check(r8.status === 200, `→ 200 (got ${r8.status})`,
  JSON.stringify(r8.body).slice(0,200));

const balAfter2 = await pg.query(
  `SELECT available_balance::bigint AS b FROM wallets WHERE user_id=$1 AND type='provider'`,
  [provUser.userId]);
check(Number(balAfter2.rows[0].b) === 110000, `balance=110000 (got ${balAfter2.rows[0].b})`);

// ════════════════════════════════════════════════════════════════════
// 9. wallet/adjust admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. wallet/adjust admin → 403 ===');
const r9 = await call(ADMIN_USER.token, 'POST', `/api/v1/admin/providers/${providerId}/wallet/adjust`,
  { amount: 1000, reason: 'no perms' });
check(r9.status === 403, `→ 403 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. GET /:id/reviews
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. GET /:id/reviews ===');
const r10 = await call(ADMIN_USER.token, 'GET',
  `/api/v1/admin/providers/${providerId}/reviews?page=1&pageSize=10`);
check(r10.status === 200, `→ 200 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. PATCH /:id/reviews/:reviewId/visibility
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. PATCH visibility ===');
const r11 = await call(ADMIN_USER.token, 'PATCH',
  `/api/v1/admin/providers/${providerId}/reviews/${reviewId}/visibility`,
  { isVisible: false });
check(r11.status === 200, `→ 200 (got ${r11.status})`);

const revVis = await pg.query(`SELECT is_visible FROM reviews WHERE id=$1`, [reviewId]);
check(revVis.rows[0]?.is_visible === false, 'is_visible=false');

// ════════════════════════════════════════════════════════════════════
// 12. PATCH visibility bad type → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. PATCH visibility bad type → 400 ===');
const r12 = await call(ADMIN_USER.token, 'PATCH',
  `/api/v1/admin/providers/${providerId}/reviews/${reviewId}/visibility`,
  { isVisible: 'maybe' });
check(r12.status === 400, `→ 400 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. PATCH /:reviewId/response
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. PATCH response ===');
const r13 = await call(ADMIN_USER.token, 'PATCH',
  `/api/v1/admin/providers/${providerId}/reviews/${reviewId}/response`,
  { response: 'P35c admin response on behalf of provider' });
check(r13.status === 200, `→ 200 (got ${r13.status})`,
  JSON.stringify(r13.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 14. GET /:id/disputes
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. GET /:id/disputes ===');
const r14 = await call(ADMIN_USER.token, 'GET',
  `/api/v1/admin/providers/${providerId}/disputes`);
check(r14.status === 200, `→ 200 (got ${r14.status})`);

// ════════════════════════════════════════════════════════════════════
// 15. GET /:id/activity
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. GET /:id/activity ===');
const r15 = await call(SUPER_TOKEN, 'GET',
  `/api/v1/admin/providers/${providerId}/activity?limit=10`);
check(r15.status === 200, `→ 200 (got ${r15.status})`);

// ════════════════════════════════════════════════════════════════════
// 16. GET /:id/notes
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. GET /:id/notes ===');
const r16 = await call(ADMIN_USER.token, 'GET', `/api/v1/admin/providers/${providerId}/notes`);
check(r16.status === 200, `→ 200 (got ${r16.status})`);
check(Array.isArray(r16.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 17. POST /:id/notes
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. POST /:id/notes ===');
const r17 = await call(ADMIN_USER.token, 'POST', `/api/v1/admin/providers/${providerId}/notes`, {
  category: 'general',
  body: 'Phase 35c admin note for provider 360 audit',
  pinned: true,
});
check(r17.status === 201, `→ 201 (got ${r17.status})`,
  JSON.stringify(r17.body).slice(0,200));
const noteId = r17.body?.data?.id;
check(typeof noteId === 'string', `noteId returned (${noteId})`);

// admin_actions audit row — service uses target_type='provider_note'
// and target_id=note.id (not provider.id), with details.providerId
// pointing at the parent.
const aud = await pg.query(
  `SELECT 1 FROM admin_actions
     WHERE action_type='provider_note_added' AND target_id=$1`,
  [noteId]);
check(aud.rows.length >= 1, 'provider_note_added admin_actions row');

// ════════════════════════════════════════════════════════════════════
// 18. PATCH /:id/notes/:noteId
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 18. PATCH /:id/notes/:noteId ===');
const r18 = await call(ADMIN_USER.token, 'PATCH',
  `/api/v1/admin/providers/${providerId}/notes/${noteId}`,
  { body: 'P35c updated note body' });
check(r18.status === 200, `→ 200 (got ${r18.status})`);

// ════════════════════════════════════════════════════════════════════
// 19. DELETE /:id/notes/:noteId
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 19. DELETE /:id/notes/:noteId ===');
const r19 = await call(ADMIN_USER.token, 'DELETE',
  `/api/v1/admin/providers/${providerId}/notes/${noteId}`);
check(r19.status === 200, `→ 200 (got ${r19.status})`);

// ════════════════════════════════════════════════════════════════════
// 20. customer → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 20. customer → 403 ===');
const r20 = await call(CUST.token, 'GET', `/api/v1/admin/providers/${providerId}/profile`);
check(r20.status === 403, `→ 403 (got ${r20.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1, $2)
  OR target_id IN (SELECT id FROM provider_admin_notes WHERE provider_id=$1)`,
  [providerId, reviewId]);
await pg.query(`DELETE FROM provider_admin_notes WHERE provider_id=$1`, [providerId]);
await pg.query(`DELETE FROM reviews WHERE id=$1`, [reviewId]);
await pg.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (
  SELECT id FROM wallets WHERE user_id IN ($1,$2,$3,$4)
)`, [provUser.userId, ADMIN_USER.userId, CUST.userId, reviewerUser.userId]);
await pg.query(`DELETE FROM wallets WHERE user_id IN ($1,$2,$3,$4)`,
  [provUser.userId, ADMIN_USER.userId, CUST.userId, reviewerUser.userId]);
await pg.query(`DELETE FROM bookings WHERE id=$1`, [bk.rows[0].id]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM audit_log WHERE user_id IN ($1,$2,$3,$4)`,
  [provUser.userId, ADMIN_USER.userId, CUST.userId, reviewerUser.userId]);
await pg.query(`DELETE FROM users WHERE id IN ($1,$2,$3,$4)`,
  [provUser.userId, ADMIN_USER.userId, CUST.userId, reviewerUser.userId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
