// Phase 25a — drive every admin route family through the live middleware
// chain to confirm the defenses behave as the static extractor reports.
//
// Per CRIT-PHASE17-02 the CSRF middleware INTENTIONALLY exempts Bearer
// auth (browsers don't auto-attach Authorization headers). So:
//   - To test "no auth → 401" we send no Authorization header
//   - To test "wrong role → 403" we send a customer Bearer token
//   - To test "CSRF blocks cookie-based forgery → 403" we send a POST
//     with NO Authorization header AND NO csrf cookie/header — the CSRF
//     middleware runs at /admin/* mount level and 403s
//   - To test "Bearer auth bypass works → 2xx/4xx (not 401/403)" we
//     send Bearer-only and verify business-logic status (4xx for stub IDs)

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const SUPER_TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

const someCustomer = await pg.query(
  `SELECT id FROM users WHERE role='customer' AND is_active=TRUE LIMIT 1`,
);
const CUST_TOKEN = jwt.sign(
  { userId: someCustomer.rows[0].id, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

async function hit(method, url, opts = {}) {
  const headers = {
    'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
    'Content-Type': 'application/json',
  };
  if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
  const r = await fetch(API + url, {
    method, headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0,200) }; }
  return { status: r.status, body: j };
}

// Real admin route paths verified via grep on each *Routes file's mount.
// readUrl: a real GET; writeUrl: a real POST/PATCH/PUT (use stub UUIDs to
// stay safely past business logic into "not found / validation rejected").
const routeFamilies = [
  // [readUrl,                                    writeUrl,                                                                                writeBody,                                              family]
  // providers approve is PUT (not POST) per admin.routes.ts:166
  ['/api/v1/admin/providers',                     {method:'PUT', path:'/api/v1/admin/providers/00000000-0000-0000-0000-000000000000/approve'}, {},                                       'providers'],
  ['/api/v1/admin/customers',                     '/api/v1/admin/customers/00000000-0000-0000-0000-000000000000/credit',                   { deltaAmount: 100, reason: 'phase25a probe with at least thirty chars' }, 'customers'],
  ['/api/v1/admin/bookings',                      '/api/v1/admin/bookings/00000000-0000-0000-0000-000000000000/cancel',                    { reason: 'phase25a probe with at least thirty chars long for validation' }, 'bookings'],
  ['/api/v1/admin/disputes/00000000-0000-0000-0000-000000000000', '/api/v1/admin/disputes/00000000-0000-0000-0000-000000000000/assign',     { assigneeAdminId: SUPER_ADMIN_ID, note: 'phase25a' }, 'disputes'],
  ['/api/v1/admin/financials/overview',           null,                                                                                    null,                                                   'financials'],
  ['/api/v1/admin/bir/vat/reports?year=2026',     '/api/v1/admin/bir/vat/reports/2026/12/finalize',                                        {},                                                     'bir'],
  ['/api/v1/admin/marketing/promos',              '/api/v1/admin/marketing/promos',                                                        { code: 'PHASE25A_'+Date.now(), discountType: 'percentage', discountValue: 5 }, 'marketing'],
  ['/api/v1/admin/compliance/dsr',                null,                                                                                    null,                                                   'compliance'],
  ['/api/v1/admin/breach-log',                    '/api/v1/admin/breach-log',                                                              { type: 'unauthorized_access', scope: 'phase25a probe', occurredAt: new Date().toISOString(), discoveredAt: new Date().toISOString(), severity: 'low', description: 'phase25a probe must be at least thirty chars long.' }, 'breach-log'],
  ['/api/v1/admin/settings',                      null,                                                                                    null,                                                   'settings'],
  ['/api/v1/admin/cancellation-policies',         null,                                                                                    null,                                                   'cancellation-policies'],
  ['/api/v1/admin/notification-templates',        null,                                                                                    null,                                                   'notification-templates'],
];

for (const [readUrl, writeUrl, writeBody, family] of routeFamilies) {
  console.log(`\n=== [${family}] ===`);

  // 1. GET without auth → 401
  const r1 = await hit('GET', readUrl);
  check(r1.status === 401,
    `GET ${readUrl} no auth → 401`,
    `got ${r1.status}`);

  // 2. GET with customer token → 403
  const r2 = await hit('GET', readUrl, { token: CUST_TOKEN });
  check(r2.status === 403,
    `GET ${readUrl} customer token → 403`,
    `got ${r2.status} ${JSON.stringify(r2.body).slice(0,150)}`);

  // 3. GET with super-admin → not 401/403 (may be 404 for stub IDs)
  const r3 = await hit('GET', readUrl, { token: SUPER_TOKEN });
  check(![401, 403].includes(r3.status),
    `GET ${readUrl} super-admin → not 401/403`,
    `got ${r3.status}`);

  if (writeUrl) {
    const writeMethod = typeof writeUrl === 'object' ? writeUrl.method : 'POST';
    const writePath   = typeof writeUrl === 'object' ? writeUrl.path   : writeUrl;

    // 4. Write with NO Authorization header AND NO csrf cookie:
    //    requireAdminCsrf middleware runs first at /admin/* mount, sees
    //    no Bearer (CSRF check applies), no cookie/header → 403 csrf_invalid.
    const r4 = await hit(writeMethod, writePath, { body: writeBody });
    check(r4.status === 403,
      `${writeMethod} ${writePath} no auth + no csrf → 403 csrf_invalid`,
      `got ${r4.status} ${JSON.stringify(r4.body).slice(0,200)}`);
    if (r4.status === 403) {
      check(r4.body?.error?.code === 'csrf_invalid',
        `  → error code is csrf_invalid`,
        `got code: ${r4.body?.error?.code}`);
    }

    // 5. Write with Bearer auth (CSRF intentionally bypassed) — should be
    //    past CSRF + auth, hit business logic. Status will be 4xx for stubs.
    const r5 = await hit(writeMethod, writePath, { token: SUPER_TOKEN, body: writeBody });
    check(![401, 403].includes(r5.status),
      `${writeMethod} ${writePath} Bearer (CSRF bypassed) → past middleware`,
      `got ${r5.status} ${JSON.stringify(r5.body).slice(0,200)}`);

    // 6. Write with customer Bearer → 403 (auth ok, role fails)
    const r6 = await hit(writeMethod, writePath, { token: CUST_TOKEN, body: writeBody });
    check(r6.status === 403,
      `${writeMethod} ${writePath} customer Bearer → 403`,
      `got ${r6.status} ${JSON.stringify(r6.body).slice(0,200)}`);
  }
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
