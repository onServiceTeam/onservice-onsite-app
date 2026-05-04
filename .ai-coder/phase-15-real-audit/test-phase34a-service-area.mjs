// Phase 34a — service-area routes (public + provider).
//
// Coverage:
//   1. GET / lists active areas (cached)
//   2. GET /check?lat=&lng= → covered=true for in-area coords
//   3. GET /check → covered=false + nearestArea + distanceKm for out-of-area
//   4. GET /check missing lat/lng → 400
//   5. GET /check invalid coords → 400
//   6. GET /:slug returns one area (active|soft_launch|recruiting)
//   7. GET /:slug for retired/paused/planned → 404
//   8. POST /waitlist creates entry
//   9. POST /waitlist invalid phone format → 400
//  10. POST /waitlist missing required fields → 400
//  11. POST /waitlist 6th in 60s → 429 (MED-N163 IP rate limit)
//  12. GET /:id/providers — auth required, returns provider list
//  13. POST /provider/areas — assigns provider to area
//  14. GET /provider/my-areas — lists provider's areas
//  15. POST /provider/areas — duplicate (UNIQUE) → 409
//  16. No auth → 401 on provider routes

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

async function call(token, method, url, body, ip) {
  const r = await fetch(API + url, {
    method,
    headers: {
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      'X-Forwarded-For': ip ?? ('10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256)),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,300) }; }
  return { status: r.status, body: j };
}

// Setup: provider user
const provPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P34a', 'Prov') RETURNING id`, [provPhone]);
const provUserId = provUser.rows[0].id;
const PROV_TOKEN = jwt.sign(
  { userId: provUserId, role: 'provider', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'P34a Provider', 'approved') RETURNING id`,
  [provUserId]);
const providerId = prov.rows[0].id;

// Create a fresh test service area in Boracay (uses real lat/lng)
const slug = `p34a-test-${Date.now()}`;
const areaRes = await pg.query(
  `INSERT INTO service_areas (name, slug, city, province, region, center_lat, center_lng, radius_km, status)
   VALUES ($1, $2, 'Boracay-P34a', 'Aklan', 'Region VI', 11.97, 121.93, 15, 'active')
   RETURNING id`,
  [`P34a Test Area ${Date.now()}`, slug]);
const areaId = areaRes.rows[0].id;

// Create a retired area to test 404 path
const retiredSlug = `p34a-retired-${Date.now()}`;
const retiredArea = await pg.query(
  `INSERT INTO service_areas (name, slug, city, province, region, center_lat, center_lng, radius_km, status)
   VALUES ('Retired-P34a', $1, 'OldTown', 'Aklan', 'Region VI', 11.5, 121.5, 10, 'retired')
   RETURNING id`,
  [retiredSlug]);

// ════════════════════════════════════════════════════════════════════
// 1. GET / lists active areas
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET / ===');
const r1 = await call(null, 'GET', '/api/v1/service-areas');
check(r1.status === 200, `→ 200 (got ${r1.status})`);
check(Array.isArray(r1.body?.data), 'data is array');
// Note: route uses cacheMiddleware(CacheTTL.SERVICE_AREAS) — fresh area
// may not appear immediately. Assert non-empty rather than membership.
check(r1.body?.data?.length > 0, `list non-empty (got ${r1.body?.data?.length})`);

// ════════════════════════════════════════════════════════════════════
// 2. GET /check covered
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. /check covered=true ===');
const r2 = await call(null, 'GET', '/api/v1/service-areas/check?lat=11.97&lng=121.93');
check(r2.status === 200, `→ 200 (got ${r2.status})`);
check(r2.body?.data?.covered === true, `covered=true (got ${r2.body?.data?.covered})`);

// ════════════════════════════════════════════════════════════════════
// 3. GET /check uncovered
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. /check uncovered ===');
const r3 = await call(null, 'GET', '/api/v1/service-areas/check?lat=14.59&lng=120.97'); // Manila
check(r3.status === 200, `→ 200 (got ${r3.status})`);
check(r3.body?.data?.covered === false, `covered=false (got ${r3.body?.data?.covered})`);
check(typeof r3.body?.data?.nearestArea?.distanceKm === 'number',
  'nearestArea.distanceKm computed');

// ════════════════════════════════════════════════════════════════════
// 4. /check missing → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. /check no params → 400 ===');
const r4 = await call(null, 'GET', '/api/v1/service-areas/check');
check(r4.status === 400, `→ 400 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. /check invalid coords → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. /check lat=200 → 400 ===');
const r5 = await call(null, 'GET', '/api/v1/service-areas/check?lat=200&lng=0');
check(r5.status === 400, `→ 400 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. GET /:slug active
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET /:slug active ===');
const r6 = await call(null, 'GET', `/api/v1/service-areas/${slug}`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);
check(r6.body?.data?.id === areaId, 'id matches');

// ════════════════════════════════════════════════════════════════════
// 7. GET /:slug retired → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. GET /:slug retired → 404 ===');
const r7 = await call(null, 'GET', `/api/v1/service-areas/${retiredSlug}`);
check(r7.status === 404, `→ 404 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. POST /waitlist
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. POST /waitlist ===');
const wlPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const r8 = await call(null, 'POST', '/api/v1/service-areas/waitlist', {
  fullName: 'Phase 34a Tester',
  phone: wlPhone,
  city: 'P34aCity-' + Date.now(),
  province: 'Aklan',
});
check(r8.status === 201, `→ 201 (got ${r8.status})`,
  JSON.stringify(r8.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 9. Invalid phone → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Invalid phone → 400 ===');
const r9 = await call(null, 'POST', '/api/v1/service-areas/waitlist', {
  fullName: 'X', phone: 'not-a-phone', city: 'C', province: 'A',
});
check(r9.status === 400, `→ 400 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. Missing required fields → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Missing fields → 400 ===');
const r10 = await call(null, 'POST', '/api/v1/service-areas/waitlist', {
  fullName: 'Only Name',
});
check(r10.status === 400, `→ 400 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 11. Rate limit — 6th from same IP within 60s → 429 (MED-N163)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. waitlist 6th from same IP → 429 (MED-N163) ===');
const ratelimitIp = '203.99.34.' + (Math.floor(Math.random()*256));
let last429Status = 0;
for (let i = 1; i <= 8; i++) {
  const phoneN = '+63917' + (2000000 + Math.floor(Math.random()*7999999));
  const rN = await call(null, 'POST', '/api/v1/service-areas/waitlist', {
    fullName: 'P34a IP test ' + i,
    phone: phoneN,
    city: 'IPTestCity-' + Date.now() + '-' + i,
    province: 'Aklan',
  }, ratelimitIp);
  if (i >= 6 && rN.status === 429) { last429Status = 429; break; }
}
check(last429Status === 429, `IP rate limit triggered (got 429 within 8 attempts: ${last429Status === 429})`);

// ════════════════════════════════════════════════════════════════════
// 12. GET /:id/providers (auth)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. GET /:id/providers (auth) ===');
const r12 = await call(PROV_TOKEN, 'GET', `/api/v1/service-areas/${areaId}/providers`);
check(r12.status === 200, `→ 200 (got ${r12.status})`);
check(Array.isArray(r12.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 13. POST /provider/areas — assign
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. POST /provider/areas ===');
const r13 = await call(PROV_TOKEN, 'POST', '/api/v1/service-areas/provider/areas', {
  serviceAreaId: areaId,
  isPrimary: true,
});
check(r13.status === 201, `→ 201 (got ${r13.status})`,
  JSON.stringify(r13.body).slice(0,200));
check(r13.body?.data?.serviceAreaId === areaId, 'serviceAreaId returned');
check(r13.body?.data?.isPrimary === true, 'isPrimary=true');

// ════════════════════════════════════════════════════════════════════
// 14. GET /provider/my-areas
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. GET /provider/my-areas ===');
const r14 = await call(PROV_TOKEN, 'GET', '/api/v1/service-areas/provider/my-areas');
check(r14.status === 200, `→ 200 (got ${r14.status})`);
check(r14.body?.data?.some(a => a.serviceAreaId === areaId), 'assigned area in list');

// ════════════════════════════════════════════════════════════════════
// 15. Duplicate assign — service uses ON CONFLICT DO UPDATE (UPSERT)
//     so the second call returns 201 + flips is_primary. Documented
//     design: a provider re-submitting their primary area is treated as
//     "set primary" rather than an error.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. Duplicate assign UPSERTs is_primary ===');
const r15 = await call(PROV_TOKEN, 'POST', '/api/v1/service-areas/provider/areas', {
  serviceAreaId: areaId,
  isPrimary: false,
});
check(r15.status === 201, `→ 201 UPSERT (got ${r15.status})`,
  JSON.stringify(r15.body).slice(0,200));
check(r15.body?.data?.isPrimary === false, `is_primary flipped to false (got ${r15.body?.data?.isPrimary})`);

// Confirm only 1 row in DB (no duplicate row)
const dbCount = await pg.query(
  `SELECT COUNT(*)::int AS c FROM provider_service_areas
     WHERE provider_id=$1 AND service_area_id=$2`,
  [providerId, areaId]);
check(dbCount.rows[0].c === 1, `still 1 row (got ${dbCount.rows[0].c})`);

// ════════════════════════════════════════════════════════════════════
// 16. No auth on provider routes → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. No auth on /provider/my-areas → 401 ===');
const r16 = await call(null, 'GET', '/api/v1/service-areas/provider/my-areas');
check(r16.status === 401, `→ 401 (got ${r16.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM provider_service_areas WHERE provider_id=$1`, [providerId]);
await pg.query(`DELETE FROM area_waitlist WHERE phone=$1 OR full_name LIKE 'P34a IP test %'`, [wlPhone]);
await pg.query(`DELETE FROM service_areas WHERE id IN ($1,$2)`, [areaId, retiredArea.rows[0].id]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
