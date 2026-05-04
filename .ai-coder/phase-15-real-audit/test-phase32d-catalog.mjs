// Phase 32d — service catalog (public reads + admin CRUD).
//
// Coverage:
//
// PUBLIC reads (no auth):
//   1. GET / lists active categories
//   2. GET /full lists categories+subcategories nested
//   3. GET /search?q= 2-char minimum → 400
//   4. GET /search?q=valid returns services + providers
//   5. GET /:slug returns one category + subcats
//   6. GET /:slug bogus → 404
//   7. GET /subcategories/:id/bounds returns price bounds
//   8. GET /subcategories/:id/bounds bogus → 404
//   9. GET /subcategory/:id/addons returns active addons
//
// ADMIN mutations (super_admin only — MED-N161):
//  10. POST /admin/categories — admin (not super) → 403
//  11. POST /admin/categories — super_admin → 201
//  12. POST /admin/categories — name missing → 400
//  13. PUT /admin/categories/:id — super_admin updates
//  14. POST /admin/subcategories — super_admin creates
//  15. PUT /admin/subcategories/:id — flip isActive
//  16. POST /admin/addons — super_admin creates (Zod price≤5_000_000)
//  17. POST /admin/addons — price > 5_000_000 → 400
//  18. PUT /admin/addons/:id updates
//  19. DELETE /admin/addons/:id — super_admin soft-deactivates
//  20. DELETE /admin/subcategories/:id — super_admin soft-deactivates
//      + writes admin_actions audit row
//  21. customer/admin → 403 on every mutation

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

// Plain admin (for negative super-admin tests)
const adminPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const adminUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'admin', TRUE, 'P32d', 'Admin') RETURNING id`, [adminPhone]);
const adminId = adminUser.rows[0].id;
const ADMIN_TOKEN = jwt.sign(
  { userId: adminId, role: 'admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const SUFFIX = String(Date.now()).slice(-8);
const TEST_CAT_NAME = `P32d Test Category ${SUFFIX}`;
const TEST_CAT_SLUG = `p32d-test-category-${SUFFIX}`;

// ════════════════════════════════════════════════════════════════════
// 1. GET / categories
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET / categories ===');
const r1 = await call(null, 'GET', '/api/v1/catalog');
check(r1.status === 200, `→ 200 (got ${r1.status})`);
check(Array.isArray(r1.body?.data), 'data is array');

// ════════════════════════════════════════════════════════════════════
// 2. GET /full nested
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. GET /full nested ===');
const r2 = await call(null, 'GET', '/api/v1/catalog/full');
check(r2.status === 200, `→ 200 (got ${r2.status})`);
check(Array.isArray(r2.body?.data?.[0]?.subcategories) || r2.body?.data?.length === 0,
  'first row has subcategories array (or list empty)');

// ════════════════════════════════════════════════════════════════════
// 3. Search too short → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. /search ?q=a → 400 ===');
const r3 = await call(null, 'GET', '/api/v1/catalog/search?q=a');
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Search valid
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. /search ?q=clean ===');
const r4 = await call(null, 'GET', '/api/v1/catalog/search?q=clean');
check(r4.status === 200, `→ 200 (got ${r4.status})`);
check(Array.isArray(r4.body?.data?.services), 'services array');
check(Array.isArray(r4.body?.data?.providers), 'providers array');

// ════════════════════════════════════════════════════════════════════
// 11. POST /admin/categories — super_admin creates
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. POST /admin/categories super_admin ===');
const r11 = await call(SUPER_TOKEN, 'POST', '/api/v1/catalog/admin/categories', {
  name: TEST_CAT_NAME,
  description: 'Phase 32d test category for catalog audit',
});
check(r11.status === 201, `→ 201 (got ${r11.status})`,
  JSON.stringify(r11.body).slice(0,200));
const catId = r11.body?.data?.id;
check(typeof catId === 'string', `id returned (${catId})`);
const catSlug = r11.body?.data?.slug;

// ════════════════════════════════════════════════════════════════════
// 5. GET /:slug for our created category
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /:slug ===');
const r5 = await call(null, 'GET', `/api/v1/catalog/${catSlug}`);
check(r5.status === 200, `→ 200 (got ${r5.status})`);
check(r5.body?.data?.id === catId, 'id matches');
check(Array.isArray(r5.body?.data?.subcategories), 'subcategories array');

// ════════════════════════════════════════════════════════════════════
// 6. GET /:slug bogus → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET /:slug bogus → 404 ===');
const r6 = await call(null, 'GET', '/api/v1/catalog/no-such-slug-99999');
check(r6.status === 404, `→ 404 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. POST admin → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. POST /admin/categories admin → 403 (MED-N161) ===');
const r10 = await call(ADMIN_TOKEN, 'POST', '/api/v1/catalog/admin/categories', {
  name: 'Should reject',
});
check(r10.status === 403, `→ 403 (got ${r10.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. POST /admin/categories missing name → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. POST /admin/categories no name → 400 ===');
const r12 = await call(SUPER_TOKEN, 'POST', '/api/v1/catalog/admin/categories', {
  description: 'no name supplied',
});
check(r12.status === 400, `→ 400 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. PUT /admin/categories/:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. PUT /admin/categories/:id ===');
const r13 = await call(SUPER_TOKEN, 'PUT', `/api/v1/catalog/admin/categories/${catId}`, {
  description: 'Updated by Phase 32d audit',
});
check(r13.status === 200, `→ 200 (got ${r13.status})`,
  JSON.stringify(r13.body).slice(0,200));
check(r13.body?.data?.description === 'Updated by Phase 32d audit', 'description updated');

// ════════════════════════════════════════════════════════════════════
// 14. POST /admin/subcategories
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. POST /admin/subcategories ===');
const r14 = await call(SUPER_TOKEN, 'POST', '/api/v1/catalog/admin/subcategories', {
  categoryId: catId,
  name: `P32d Sub ${SUFFIX}`,
  description: 'Phase 32d test subcategory',
  pricingType: 'fixed',
  basePrice: 100000,
  minPrice: 50000,
  maxPrice: 200000,
  estimatedDurationMinutes: 90,
});
check(r14.status === 201, `→ 201 (got ${r14.status})`,
  JSON.stringify(r14.body).slice(0,200));
const subId = r14.body?.data?.id;
check(typeof subId === 'string', `subId returned (${subId})`);
check(r14.body?.data?.basePrice === 100000, 'basePrice persisted');

// ════════════════════════════════════════════════════════════════════
// 7. GET /subcategories/:id/bounds
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. GET /subcategories/:id/bounds ===');
const r7 = await call(null, 'GET', `/api/v1/catalog/subcategories/${subId}/bounds`);
check(r7.status === 200, `→ 200 (got ${r7.status})`);
check(r7.body?.data?.minCents === 50000, `minCents=50000 (got ${r7.body?.data?.minCents})`);
check(r7.body?.data?.maxCents === 200000, `maxCents=200000 (got ${r7.body?.data?.maxCents})`);
check(r7.body?.data?.baseCents === 100000, `baseCents=100000 (got ${r7.body?.data?.baseCents})`);

// ════════════════════════════════════════════════════════════════════
// 8. GET /subcategories/:id/bounds bogus → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. /bounds bogus → 404 ===');
const r8 = await call(null, 'GET',
  `/api/v1/catalog/subcategories/00000000-0000-0000-0000-000000000000/bounds`);
check(r8.status === 404, `→ 404 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 15. PUT /admin/subcategories/:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. PUT /admin/subcategories/:id ===');
const r15 = await call(SUPER_TOKEN, 'PUT', `/api/v1/catalog/admin/subcategories/${subId}`, {
  basePrice: 150000,
});
check(r15.status === 200, `→ 200 (got ${r15.status})`,
  JSON.stringify(r15.body).slice(0,200));
check(r15.body?.data?.basePrice === 150000, 'basePrice updated to 150000');

// ════════════════════════════════════════════════════════════════════
// 16. POST /admin/addons
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. POST /admin/addons ===');
const r16 = await call(SUPER_TOKEN, 'POST', '/api/v1/catalog/admin/addons', {
  subcategoryId: subId,
  name: 'P32d Addon',
  description: 'Phase 32d addon test',
  price: 50000,
});
check(r16.status === 201, `→ 201 (got ${r16.status})`,
  JSON.stringify(r16.body).slice(0,200));
const addonId = r16.body?.data?.id;
check(typeof addonId === 'string', `addonId returned (${addonId})`);

// ════════════════════════════════════════════════════════════════════
// 17. Addon over price cap → 400 (Zod validator caps at 5_000_000)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 17. Addon price > cap → 400 ===');
const r17 = await call(SUPER_TOKEN, 'POST', '/api/v1/catalog/admin/addons', {
  subcategoryId: subId,
  name: 'Too expensive',
  price: 99_999_999,
});
check(r17.status === 400, `→ 400 (got ${r17.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. GET /subcategory/:id/addons
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. GET /subcategory/:id/addons ===');
const r9 = await call(null, 'GET', `/api/v1/catalog/subcategory/${subId}/addons`);
check(r9.status === 200, `→ 200 (got ${r9.status})`);
check(Array.isArray(r9.body?.data), 'data is array');
check(r9.body?.data?.some(a => a.id === addonId), 'created addon in list');

// ════════════════════════════════════════════════════════════════════
// 18. PUT /admin/addons/:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 18. PUT /admin/addons/:id ===');
const r18 = await call(SUPER_TOKEN, 'PUT', `/api/v1/catalog/admin/addons/${addonId}`, {
  price: 75000,
});
check(r18.status === 200, `→ 200 (got ${r18.status})`,
  JSON.stringify(r18.body).slice(0,200));
check(r18.body?.data?.price === 75000, 'price updated');

// ════════════════════════════════════════════════════════════════════
// 19. DELETE /admin/addons/:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 19. DELETE /admin/addons/:id ===');
const r19 = await call(SUPER_TOKEN, 'DELETE', `/api/v1/catalog/admin/addons/${addonId}`,
  { reason: 'Phase 32d cleanup test' });
check(r19.status === 200, `→ 200 (got ${r19.status})`);

const addonState = await pg.query(
  `SELECT is_active FROM service_addons WHERE id=$1`, [addonId]);
check(addonState.rows[0]?.is_active === false, 'addon soft-deleted (is_active=false)');

// ════════════════════════════════════════════════════════════════════
// 20. DELETE /admin/subcategories/:id + audit row
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 20. DELETE /admin/subcategories/:id ===');
const r20 = await call(SUPER_TOKEN, 'DELETE', `/api/v1/catalog/admin/subcategories/${subId}`,
  { reason: 'Phase 32d cleanup' });
check(r20.status === 200, `→ 200 (got ${r20.status})`,
  JSON.stringify(r20.body).slice(0,200));

const subState = await pg.query(
  `SELECT is_active FROM service_subcategories WHERE id=$1`, [subId]);
check(subState.rows[0]?.is_active === false, 'subcategory soft-deleted');

const audRow = await pg.query(
  `SELECT action_type FROM admin_actions
     WHERE target_type='service_subcategory' AND target_id=$1
   ORDER BY created_at DESC LIMIT 1`, [subId]);
check(audRow.rows.length === 1,
  `admin_actions row written (action=${audRow.rows[0]?.action_type})`);

// ════════════════════════════════════════════════════════════════════
// 21. customer/admin → 403 on mutations
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 21. PUT category admin → 403 ===');
const r21a = await call(ADMIN_TOKEN, 'PUT', `/api/v1/catalog/admin/categories/${catId}`, {
  name: 'should reject',
});
check(r21a.status === 403, `→ 403 (got ${r21a.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1, $2, $3)`,
  [catId, subId, addonId]);
await pg.query(`DELETE FROM service_addons WHERE id=$1`, [addonId]);
await pg.query(`DELETE FROM service_subcategories WHERE id=$1`, [subId]);
await pg.query(`DELETE FROM service_categories WHERE id=$1`, [catId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [adminId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
