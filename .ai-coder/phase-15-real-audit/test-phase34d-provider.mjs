// Phase 34d — provider self-service routes (apply, profile, services,
// schedule, portfolio).
//
// Coverage:
//   1. POST /providers/apply — minimal happy path
//   2. POST /apply — missing icAgreementAccepted → 400
//   3. POST /apply — invalid lat (out of PH band) → 400 (MED-M06)
//   4. GET /application-status returns submitted state
//   5. GET /me — provider sees own profile + services + ratings
//   6. GET /me — non-provider → 403
//   7. PATCH /me — bio + yearsExperience
//   8. PATCH /me — empty body → 400
//   9. POST /me/services — adds a service
//  10. POST /me/services — bogus subcategoryId → 400 or 404
//  11. GET /me/services — lists
//  12. DELETE /me/services/:subcategoryId — removes
//  13. PUT /me/schedule — sets weekly schedule
//  14. GET /me/schedule — returns it
//  15. GET /:id — public profile (auth required, MED-N96 fix)
//  16. POST /me/portfolio — adds item
//  17. DELETE /me/portfolio/:itemId — removes
//  18. No auth → 401

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
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

async function makeUser(role) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, $2, TRUE, 'P34d', $3) RETURNING id`,
    [phone, role, role.slice(0,8) + Date.now()]);
  const userId = u.rows[0].id;
  const token = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { userId, token };
}

const APPLICANT = await makeUser('customer');  // applies to be a provider
const ACTIVE_PROV = await makeUser('provider');  // already a provider for /me tests
const CUST = await makeUser('customer');

// Categories + subcategory for services test
const cat = await pg.query(
  `INSERT INTO service_categories (name, slug, description)
   VALUES ($1, $2, 'P34d test') RETURNING id`,
  [`P34d-${Date.now()}`, `p34d-${Date.now()}`]);
const categoryId = cat.rows[0].id;

const sub = await pg.query(
  `INSERT INTO service_subcategories (name, slug, category_id, base_price, min_price, max_price)
   VALUES ($1, $2, $3, 100000, 50000, 200000) RETURNING id`,
  [`P34d Sub-${Date.now()}`, `p34d-sub-${Date.now()}`, categoryId]);
const subcategoryId = sub.rows[0].id;

// Pre-create active provider row so /me works
const activeProvRow = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P34d Active Prov', 'approved') RETURNING id`,
  [ACTIVE_PROV.userId]);
const activeProviderId = activeProvRow.rows[0].id;

// ════════════════════════════════════════════════════════════════════
// 1. POST /apply
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /providers/apply ===');
const r1 = await call(APPLICANT.token, 'POST', '/api/v1/providers/apply', {
  businessName: 'Phase 34d Tester Co.',
  categoryIds: [categoryId],
  serviceRadiusKm: 10,
  latitude: 11.97,
  longitude: 121.93,
  city: 'Boracay',
  province: 'Aklan',
  governmentIdFrontUrl: 'https://example.com/id-front.jpg',
  governmentIdBackUrl: 'https://example.com/id-back.jpg',
  nbiClearanceUrl: 'https://example.com/nbi.jpg',
  selfieUrl: 'https://example.com/selfie.jpg',
  icAgreementAccepted: true,
});
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
const applicantProviderId = r1.body?.data?.id;
check(typeof applicantProviderId === 'string', `id (${applicantProviderId})`);

// ════════════════════════════════════════════════════════════════════
// 2. Missing icAgreementAccepted → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Missing icAgreementAccepted → 400 ===');
const APPLICANT2 = await makeUser('customer');
const r2 = await call(APPLICANT2.token, 'POST', '/api/v1/providers/apply', {
  businessName: 'NoAgree Co.',
  categoryIds: [categoryId],
  serviceRadiusKm: 10,
  latitude: 11.97, longitude: 121.93,
  city: 'Boracay', province: 'Aklan',
  governmentIdFrontUrl: 'https://example.com/id.jpg',
  governmentIdBackUrl: 'https://example.com/id.jpg',
  nbiClearanceUrl: 'https://example.com/nbi.jpg',
  selfieUrl: 'https://example.com/selfie.jpg',
  // icAgreementAccepted: false (omitted)
});
check(r2.status === 400, `→ 400 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. lat out of PH band → 400 (MED-M06)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. lat=40 out of PH band → 400 (MED-M06) ===');
const APPLICANT3 = await makeUser('customer');
const r3 = await call(APPLICANT3.token, 'POST', '/api/v1/providers/apply', {
  businessName: 'Tokyo Prov',
  categoryIds: [categoryId],
  serviceRadiusKm: 10,
  latitude: 35.68, longitude: 139.76,  // Tokyo
  city: 'Tokyo', province: 'Tokyo',
  governmentIdFrontUrl: 'https://example.com/id.jpg',
  governmentIdBackUrl: 'https://example.com/id.jpg',
  nbiClearanceUrl: 'https://example.com/nbi.jpg',
  selfieUrl: 'https://example.com/selfie.jpg',
  icAgreementAccepted: true,
});
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. GET /application-status
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. GET /application-status ===');
const r4 = await call(APPLICANT.token, 'GET', '/api/v1/providers/application-status');
check(r4.status === 200, `→ 200 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. GET /me
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /me ===');
const r5 = await call(ACTIVE_PROV.token, 'GET', '/api/v1/providers/me');
check(r5.status === 200, `→ 200 (got ${r5.status})`,
  JSON.stringify(r5.body).slice(0,200));
check(Array.isArray(r5.body?.data?.services), 'services array');
check(typeof r5.body?.data?.ratings === 'object', 'ratings object');
check(Array.isArray(r5.body?.data?.portfolio), 'portfolio array');

// ════════════════════════════════════════════════════════════════════
// 6. customer GET /me → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. customer GET /me → 403 ===');
const r6 = await call(CUST.token, 'GET', '/api/v1/providers/me');
check(r6.status === 403, `→ 403 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. PATCH /me bio + yearsExperience
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. PATCH /me ===');
const r7 = await call(ACTIVE_PROV.token, 'PATCH', '/api/v1/providers/me', {
  bio: 'Phase 34d test bio',
  yearsExperience: 5,
});
check(r7.status === 200, `→ 200 (got ${r7.status})`,
  JSON.stringify(r7.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 8. PATCH /me empty body → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. PATCH /me empty → 400 ===');
const r8 = await call(ACTIVE_PROV.token, 'PATCH', '/api/v1/providers/me', {});
check(r8.status === 400, `→ 400 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. POST /me/services
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. POST /me/services ===');
const r9 = await call(ACTIVE_PROV.token, 'POST', '/api/v1/providers/me/services', {
  subcategoryId,
  basePrice: 100000,
});
check(r9.status === 201, `→ 201 (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 10. Bogus subcategoryId → 400 or 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Bogus subcategoryId → 400 or 404 ===');
const r10 = await call(ACTIVE_PROV.token, 'POST', '/api/v1/providers/me/services', {
  subcategoryId: '00000000-0000-0000-0000-000000000000',
  basePrice: 100000,
});
check([400, 404].includes(r10.status), `→ 400 or 404 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. GET /me/services
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. GET /me/services ===');
const r11 = await call(ACTIVE_PROV.token, 'GET', '/api/v1/providers/me/services');
check(r11.status === 200, `→ 200 (got ${r11.status})`);
check(r11.body?.data?.some(s => s.subcategoryId === subcategoryId || s.subcategory_id === subcategoryId),
  `our service in list`);

// ════════════════════════════════════════════════════════════════════
// 12. DELETE /me/services/:subcategoryId
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. DELETE /me/services/:subcategoryId ===');
const r12 = await call(ACTIVE_PROV.token, 'DELETE',
  `/api/v1/providers/me/services/${subcategoryId}`);
check(r12.status === 200, `→ 200 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. PUT /me/schedule
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. PUT /me/schedule ===');
const r13 = await call(ACTIVE_PROV.token, 'PUT', '/api/v1/providers/me/schedule', {
  schedule: [
    { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
    { dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isAvailable: true },
    { dayOfWeek: 3, startTime: '08:00', endTime: '17:00', isAvailable: true },
    { dayOfWeek: 4, startTime: '08:00', endTime: '17:00', isAvailable: true },
    { dayOfWeek: 5, startTime: '08:00', endTime: '17:00', isAvailable: true },
    { dayOfWeek: 6, startTime: '00:00', endTime: '00:00', isAvailable: false },
    { dayOfWeek: 0, startTime: '00:00', endTime: '00:00', isAvailable: false },
  ],
});
check(r13.status === 200, `→ 200 (got ${r13.status})`,
  JSON.stringify(r13.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 14. GET /me/schedule
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. GET /me/schedule ===');
const r14 = await call(ACTIVE_PROV.token, 'GET', '/api/v1/providers/me/schedule');
check(r14.status === 200, `→ 200 (got ${r14.status})`);
check(Array.isArray(r14.body?.data) && r14.body.data.length === 7,
  `7 days returned (got ${r14.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 15. GET /:id (public profile, auth required per MED-N96)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. GET /:id (auth required) ===');
const r15 = await call(CUST.token, 'GET', `/api/v1/providers/${activeProviderId}`);
check(r15.status === 200, `→ 200 (got ${r15.status})`,
  JSON.stringify(r15.body).slice(0,200));
check(r15.body?.data?.id === activeProviderId, 'id matches');

// ════════════════════════════════════════════════════════════════════
// 16. POST /me/portfolio
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. POST /me/portfolio ===');
const r16 = await call(ACTIVE_PROV.token, 'POST', '/api/v1/providers/me/portfolio', {
  imageUrl: 'https://example.com/portfolio-p34d.jpg',
  caption: 'Phase 34d portfolio test',
});
const portfolioId = r16.body?.data?.id;
check(r16.status === 201 && typeof portfolioId === 'string',
  `→ 201 + id (got ${r16.status}, id=${portfolioId})`,
  JSON.stringify(r16.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 17. DELETE /me/portfolio/:itemId
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. DELETE /me/portfolio/:itemId ===');
const r17 = await call(ACTIVE_PROV.token, 'DELETE',
  `/api/v1/providers/me/portfolio/${portfolioId}`);
check(r17.status === 200, `→ 200 (got ${r17.status})`);

// ════════════════════════════════════════════════════════════════════
// 18. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 18. No auth → 401 ===');
const r18 = await call(null, 'GET', '/api/v1/providers/me');
check(r18.status === 401, `→ 401 (got ${r18.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
const userIds = [APPLICANT.userId, APPLICANT2.userId, APPLICANT3.userId,
                 ACTIVE_PROV.userId, CUST.userId];
await pg.query(`DELETE FROM provider_services WHERE provider_id IN (
  SELECT id FROM providers WHERE user_id = ANY($1)
)`, [userIds]);
await pg.query(`DELETE FROM provider_portfolios WHERE provider_id IN (
  SELECT id FROM providers WHERE user_id = ANY($1)
)`, [userIds]);
// Defensive: drop any orphan rows in onboarding/schedule tables that may
// or may not exist depending on the migration set.
for (const t of ['provider_schedules', 'provider_onboarding']) {
  try { await pg.query(`DELETE FROM ${t} WHERE provider_id IN (
    SELECT id FROM providers WHERE user_id = ANY($1)
  )`, [userIds]); } catch { /* ignore missing tables */ }
}
await pg.query(`DELETE FROM providers WHERE user_id = ANY($1)`, [userIds]);
await pg.query(`DELETE FROM service_subcategories WHERE id=$1`, [subcategoryId]);
await pg.query(`DELETE FROM service_categories WHERE id=$1`, [categoryId]);
await pg.query(`DELETE FROM audit_log WHERE user_id = ANY($1)`, [userIds]);
await pg.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
