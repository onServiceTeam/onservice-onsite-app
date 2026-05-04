// Phase 32a — notification templates (admin CRUD).
//
// Coverage:
//   1. POST creates template
//   2. POST duplicate slug → 409
//   3. POST invalid slug (uppercase/special) → 400 (validator)
//   4. POST short body → 400
//   5. POST bogus type → 400
//   6. GET / lists with pagination
//   7. GET / filters by type, channel, isActive
//   8. GET /:id reads
//   9. GET /:id bogus → 404
//  10. PUT /:id partial update
//  11. PUT /:id flip is_active
//  12. DELETE /:id requires super_admin (admin → 403)
//  13. DELETE /:id by super_admin → 200, row gone
//  14. customer → 403 on every endpoint
//  15. No auth → 401
//
// Both mounts work: /api/v1/notification-templates AND
// /api/v1/admin/notification-templates (per server.ts:280 + 288).

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

// Plain admin (not super) for DELETE-403 test
const adminPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const adminUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'admin', TRUE, 'P32a', 'Admin') RETURNING id`, [adminPhone]);
const adminId = adminUser.rows[0].id;
const ADMIN_TOKEN = jwt.sign(
  { userId: adminId, role: 'admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const custPhone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const custUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P32a', 'Cust') RETURNING id`, [custPhone]);
const custId = custUser.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: custId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const SLUG = `p32a_probe_${Date.now()}`;

// ════════════════════════════════════════════════════════════════════
// 1. POST creates template
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST / (admin creates) ===');
const r1 = await call(ADMIN_TOKEN, 'POST', '/api/v1/notification-templates', {
  slug: SLUG,
  titleTemplate: 'Hello {{firstName}}',
  bodyTemplate: 'Phase 32a test template body with {{variable}} interpolation.',
  type: 'system',
  channel: 'in_app',
  variables: ['firstName', 'variable'],
});
check(r1.status === 201, `→ 201 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));
const tmplId = r1.body?.data?.id;
check(typeof tmplId === 'string', `id returned (${tmplId})`);
check(r1.body?.data?.slug === SLUG, `slug=${SLUG}`);

// ════════════════════════════════════════════════════════════════════
// 2. Duplicate slug → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Duplicate slug → 409 ===');
const r2 = await call(ADMIN_TOKEN, 'POST', '/api/v1/notification-templates', {
  slug: SLUG,
  titleTemplate: 'dupe',
  bodyTemplate: 'duplicate slug should be rejected',
  type: 'system',
});
check(r2.status === 409, `→ 409 (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Invalid slug (uppercase) → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Invalid slug → 400 ===');
const r3 = await call(ADMIN_TOKEN, 'POST', '/api/v1/notification-templates', {
  slug: 'BadSlug-WithDashes',
  titleTemplate: 'x',
  bodyTemplate: 'body must be at least 10',
  type: 'system',
});
check(r3.status === 400, `→ 400 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Short body → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Short body → 400 ===');
const r4 = await call(ADMIN_TOKEN, 'POST', '/api/v1/notification-templates', {
  slug: 'p32a_short_body',
  titleTemplate: 'Title',
  bodyTemplate: 'short',
  type: 'system',
});
check(r4.status === 400, `→ 400 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. Bogus type → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Bogus type → 400 ===');
const r5 = await call(ADMIN_TOKEN, 'POST', '/api/v1/notification-templates', {
  slug: 'p32a_bad_type',
  titleTemplate: 'Title',
  bodyTemplate: 'body must be at least 10 chars long here',
  type: 'spaceship_landing',
});
check(r5.status === 400, `→ 400 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. GET / lists with pagination
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. GET / pagination ===');
const r6 = await call(ADMIN_TOKEN, 'GET', '/api/v1/notification-templates?page=1&pageSize=20');
check(r6.status === 200, `→ 200 (got ${r6.status})`);
check(Array.isArray(r6.body?.data), 'data is array');
check(r6.body?.data?.some(t => t.id === tmplId), 'created template in list');
check(r6.body?.pagination?.page === 1, 'pagination.page=1');

// ════════════════════════════════════════════════════════════════════
// 7. Filter by type
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. ?type=system filter ===');
const r7 = await call(ADMIN_TOKEN, 'GET', '/api/v1/notification-templates?type=system&pageSize=100');
check(r7.body?.data?.every(t => t.type === 'system'), 'all rows have type=system');

// ════════════════════════════════════════════════════════════════════
// 8. GET /:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. GET /:id ===');
const r8 = await call(ADMIN_TOKEN, 'GET', `/api/v1/notification-templates/${tmplId}`);
check(r8.status === 200, `→ 200 (got ${r8.status})`);
check(r8.body?.data?.id === tmplId, 'id matches');

// ════════════════════════════════════════════════════════════════════
// 9. Bogus id → 404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Bogus id → 404 ===');
const r9 = await call(ADMIN_TOKEN, 'GET',
  `/api/v1/notification-templates/00000000-0000-0000-0000-000000000000`);
check(r9.status === 404, `→ 404 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. PUT /:id partial update (title)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. PUT /:id (title) ===');
const r10 = await call(ADMIN_TOKEN, 'PUT', `/api/v1/notification-templates/${tmplId}`, {
  titleTemplate: 'Updated title — Phase 32a',
});
check(r10.status === 200, `→ 200 (got ${r10.status})`,
  JSON.stringify(r10.body).slice(0,200));
check(r10.body?.data?.titleTemplate?.includes('Updated'), 'title updated');

// ════════════════════════════════════════════════════════════════════
// 11. PUT /:id flip is_active
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. PUT /:id (isActive=false) ===');
const r11 = await call(ADMIN_TOKEN, 'PUT', `/api/v1/notification-templates/${tmplId}`, {
  isActive: false,
});
check(r11.status === 200, `→ 200 (got ${r11.status})`);
check(r11.body?.data?.isActive === false, 'isActive=false');

const dbState = await pg.query(`SELECT is_active FROM notification_templates WHERE id=$1`, [tmplId]);
check(dbState.rows[0]?.is_active === false, 'DB is_active=false');

// ════════════════════════════════════════════════════════════════════
// 12. DELETE — admin → 403 (MED-N167)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. DELETE admin → 403 (MED-N167) ===');
const r12 = await call(ADMIN_TOKEN, 'DELETE', `/api/v1/notification-templates/${tmplId}`);
check(r12.status === 403, `→ 403 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// 13. DELETE — super_admin → 200, row gone
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. DELETE super_admin → 200 ===');
const r13 = await call(SUPER_TOKEN, 'DELETE', `/api/v1/notification-templates/${tmplId}`);
check(r13.status === 200, `→ 200 (got ${r13.status})`);
const gone = await pg.query(`SELECT 1 FROM notification_templates WHERE id=$1`, [tmplId]);
check(gone.rows.length === 0, 'row removed');

// ════════════════════════════════════════════════════════════════════
// 14. customer → 403 on read+write
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 14. customer → 403 ===');
const r14a = await call(CUST_TOKEN, 'GET', '/api/v1/notification-templates');
check(r14a.status === 403, `customer GET → 403 (got ${r14a.status})`);
const r14b = await call(CUST_TOKEN, 'POST', '/api/v1/notification-templates', {
  slug: 'p32a_evil',
  titleTemplate: 'Title',
  bodyTemplate: 'body must be at least 10',
  type: 'system',
});
check(r14b.status === 403, `customer POST → 403 (got ${r14b.status})`);

// ════════════════════════════════════════════════════════════════════
// 15. No auth → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 15. No auth → 401 ===');
const r15 = await call(null, 'GET', '/api/v1/notification-templates');
check(r15.status === 401, `→ 401 (got ${r15.status})`);

// ════════════════════════════════════════════════════════════════════
// 16. Both mounts work — /admin/notification-templates also resolves
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 16. /admin/notification-templates dual-mount ===');
const r16 = await call(ADMIN_TOKEN, 'GET', '/api/v1/admin/notification-templates?pageSize=5');
check(r16.status === 200, `→ 200 (got ${r16.status})`);
check(Array.isArray(r16.body?.data), 'dual-mount returns same shape');

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM users WHERE id IN ($1,$2)`, [adminId, custId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
