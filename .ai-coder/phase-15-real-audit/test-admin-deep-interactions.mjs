// Phase 18b — admin deep-interaction test.
// For each major admin page, drive a write action (when seed allows) and
// verify the corresponding DB write happened.
//
// Auth: super_admin via direct JWT cookie.
// IPs: random per-request to dodge Redis rate limiter.

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const findings = [];

function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, extra ?? ''); findings.push({msg, extra}); }
}

// Use Bearer auth so the Phase 17 CSRF Bearer-exempt path applies and
// we can POST/PUT without juggling X-CSRF-Token. (Admin web in browsers
// uses cookie + CSRF; tests use Bearer for simplicity. Both paths hit
// the same auth middleware.)
async function call(method, url, body, opts = {}) {
  const r = await fetch(API + url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'X-Forwarded-For': '10.99.' + Math.floor(Math.random()*256) + '.' + Math.floor(Math.random()*256),
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  return { status: r.status, body: j };
}

// ─── 1. SystemSettings ──────────────────────────────────────────────
console.log('\n=== /settings (Platform Settings) ===');
const s1 = await call('GET', '/api/v1/admin/settings');
check(s1.status === 200, 'GET /admin/settings → 200', 'got '+s1.status+' '+JSON.stringify(s1.body).slice(0,100));
// Response shape: { categories: [...], settings: { category_name: [setting...] } }
const grouped = s1.body?.data?.settings ?? {};
const flat = Object.values(grouped).flat();
check(Array.isArray(flat) && flat.length >= 50, 'returns 50+ settings across categories', 'got '+flat.length);

// Pick a SAFE setting to mutate. Avoid security-sensitive ones (otp_length,
// rate_limit_*, jwt_*, commission_*). Try support_phone first (display-only),
// then any branding/string setting.
const SAFE_KEYS = ['support_phone','brand_name','brand_email','company_name','support_email'];
const target = SAFE_KEYS.map(k => flat.find(x => x.key === k)).find(Boolean) ??
  flat.find(x => x.value_type === 'string' && /support|brand|company|email|phone/i.test(x.key)) ??
  flat.find(x => x.value_type === 'string');
if (target) {
  const originalValue = target.value;
  const testValue = 'test-' + Date.now();
  console.log('  test target:', target.key, '←', testValue);
  const s2 = await call('PUT', '/api/v1/admin/settings/' + target.key, { value: testValue });
  check([200,204].includes(s2.status), 'PUT /admin/settings/'+target.key+' → 2xx',
    'got '+s2.status+' '+JSON.stringify(s2.body).slice(0,100));
  // Verify in DB
  const dbCheck = await pg.query(`SELECT value FROM platform_settings WHERE key=$1`, [target.key]);
  check(dbCheck.rows[0]?.value === testValue, 'DB row updated to test value',
    'DB has: '+JSON.stringify(dbCheck.rows[0]));
  // Verify audit_log has a recent row from this admin (audit_log columns
  // are user_id + action + entity_type, NOT actor_id/target_type)
  const audit = await pg.query(
    `SELECT action, entity_type FROM audit_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [SUPER_ADMIN_ID]);
  check(audit.rows.length >= 1, 'audit_log has a recent row for super_admin',
    'rows: '+JSON.stringify(audit.rows));
  // Restore original
  await call('PUT', '/api/v1/admin/settings/' + target.key, { value: originalValue });
  const restore = await pg.query(`SELECT value FROM platform_settings WHERE key=$1`, [target.key]);
  check(restore.rows[0]?.value === originalValue, 'restored to original');
}

// ─── 2. Catalog (CRUD on add-on) ────────────────────────────────────
console.log('\n=== /catalog (Service Catalog) ===');
const c1 = await call('GET', '/api/v1/catalog/full');
check(c1.status === 200, 'GET /catalog/full → 200');
const cats = c1.body?.data ?? [];
check(Array.isArray(cats) && cats.length >= 5, 'catalog has >=5 categories', 'got '+cats.length);
// Find a subcategory to attach a test add-on to
const firstSub = cats[0]?.subcategories?.[0];
if (firstSub) {
  const subId = firstSub.id;
  console.log('  test target subcategory:', firstSub.name, '('+subId+')');
  // Schema is { subcategoryId, name, description, price (cents int), displayOrder }
  const c2 = await call('POST', '/api/v1/catalog/admin/addons', {
    subcategoryId: subId,
    name: 'phase18-test-addon',
    description: 'temp for test',
    price: 50000, // ₱500.00 in cents
    displayOrder: 999,
  });
  check([200,201].includes(c2.status), 'POST /catalog/admin/addons → 2xx',
    'got '+c2.status+' '+JSON.stringify(c2.body).slice(0,200));
  const newId = c2.body?.data?.id;
  if (newId) {
    const dbAddon = await pg.query(`SELECT name FROM service_addons WHERE id=$1`, [newId]);
    check(dbAddon.rows[0]?.name === 'phase18-test-addon', 'add-on persisted in DB');
    const c3 = await call('DELETE', '/api/v1/catalog/admin/addons/' + newId);
    check([200,204].includes(c3.status), 'DELETE add-on → 2xx');
    // Phase 14 Dispatch 06 (Bug 237): catalog DELETE is a SOFT delete
    // (sets is_active=FALSE) to preserve booking_addons FK integrity. So
    // verify the row still exists but is_active=false, NOT that it's gone.
    const dbDel = await pg.query(`SELECT is_active FROM service_addons WHERE id=$1`, [newId]);
    check(dbDel.rows.length === 1 && dbDel.rows[0].is_active === false,
      'add-on soft-deactivated (is_active=false), FK history preserved');
    // Hard-delete the test row so it doesn't pollute future runs (no
    // FKs since we never used it in a booking).
    await pg.query(`DELETE FROM service_addons WHERE id=$1`, [newId]);
  } else {
    console.log('  (skip add-on persistence + delete: POST did not return id)');
  }
}

// ─── 3. Cancellation Policy ─────────────────────────────────────────
console.log('\n=== /settings/cancellation-policy ===');
// Real URL is /admin/cancellation-policies (plural, list endpoint)
const cp1 = await call('GET', '/api/v1/admin/cancellation-policies');
check(cp1.status === 200, 'GET /admin/cancellation-policies → 200', 'got '+cp1.status);
const policies = cp1.body?.data ?? [];
check(Array.isArray(policies) && policies.length >= 1, 'returns at least one policy version', 'got '+policies.length);

// ─── 4. Providers list + detail ─────────────────────────────────────
console.log('\n=== /providers + detail ===');
const p1 = await call('GET', '/api/v1/admin/providers?status=approved&limit=5');
check(p1.status === 200, 'GET /admin/providers → 200', 'got '+p1.status);
const provs = p1.body?.data?.items ?? p1.body?.data ?? [];
check(Array.isArray(provs) && provs.length >= 1, 'returns approved providers', 'got '+provs.length);
if (provs[0]) {
  const provId = provs[0].id;
  console.log('  test target:', provs[0].businessName ?? provs[0].id);
  const pd = await call('GET', `/api/v1/admin/providers/${provId}/profile`);
  check(pd.status === 200, 'GET /admin/providers/:id/profile → 200', 'got '+pd.status);
  const pj = await call('GET', `/api/v1/admin/providers/${provId}/jobs`);
  check(pj.status === 200, 'GET .../jobs → 200');
  const pf = await call('GET', `/api/v1/admin/providers/${provId}/financials`);
  check(pf.status === 200, 'GET .../financials → 200');
  const pr = await call('GET', `/api/v1/admin/providers/${provId}/reviews`);
  check(pr.status === 200, 'GET .../reviews → 200');
  const pdis = await call('GET', `/api/v1/admin/providers/${provId}/disputes`);
  check(pdis.status === 200, 'GET .../disputes → 200');
  const pa = await call('GET', `/api/v1/admin/providers/${provId}/activity`);
  check(pa.status === 200, 'GET .../activity → 200');
  const pn = await call('GET', `/api/v1/admin/providers/${provId}/notes`);
  check(pn.status === 200, 'GET .../notes → 200');
}

// ─── 5. Customers list + detail ─────────────────────────────────────
console.log('\n=== /customers + detail ===');
const cu1 = await call('GET', '/api/v1/admin/customers?limit=5');
check(cu1.status === 200, 'GET /admin/customers → 200', 'got '+cu1.status+' '+JSON.stringify(cu1.body).slice(0,150));
const customers = cu1.body?.data?.items ?? cu1.body?.data ?? [];
check(Array.isArray(customers) && customers.length >= 1, 'returns customers', 'got '+customers.length);
if (customers[0]) {
  const cid = customers[0].id;
  console.log('  test target:', customers[0].firstName ?? customers[0].phone ?? cid);
  const cdet = await call('GET', `/api/v1/admin/customers/${cid}`);
  check(cdet.status === 200, 'GET /admin/customers/:id → 200');
  const cb = await call('GET', `/api/v1/admin/customers/${cid}/bookings`);
  check(cb.status === 200, 'GET .../bookings → 200');
  const cp = await call('GET', `/api/v1/admin/customers/${cid}/payments`);
  check(cp.status === 200, 'GET .../payments → 200');
  const cd = await call('GET', `/api/v1/admin/customers/${cid}/disputes`);
  check(cd.status === 200, 'GET .../disputes → 200');
  const cr = await call('GET', `/api/v1/admin/customers/${cid}/referrals`);
  check(cr.status === 200, 'GET .../referrals → 200');
  const ca = await call('GET', `/api/v1/admin/customers/${cid}/activity`);
  check(ca.status === 200, 'GET .../activity → 200');
}

// ─── 6. Bookings list + detail ──────────────────────────────────────
console.log('\n=== /bookings + detail ===');
const b1 = await call('GET', '/api/v1/admin/bookings?limit=5');
check(b1.status === 200, 'GET /admin/bookings → 200');
const bks = b1.body?.data?.items ?? b1.body?.data ?? [];
check(Array.isArray(bks) && bks.length >= 1, 'returns bookings', 'got '+bks.length);
if (bks[0]) {
  const bid = bks[0].id;
  console.log('  test target:', bid);
  const bd = await call('GET', `/api/v1/admin/bookings/${bid}`);
  check(bd.status === 200, 'GET /admin/bookings/:id → 200');
  const bt = await call('GET', `/api/v1/admin/bookings/${bid}/timeline`);
  check(bt.status === 200, 'GET .../timeline → 200');
  const be = await call('GET', `/api/v1/admin/bookings/${bid}/evidence`);
  check(be.status === 200, 'GET .../evidence → 200');
}

// ─── 7. Disputes (list returns 200 even if empty) ───────────────────
console.log('\n=== /disputes ===');
const d1 = await call('GET', '/api/v1/disputes?limit=5');
check(d1.status === 200, 'GET /disputes → 200', 'got '+d1.status+' '+JSON.stringify(d1.body).slice(0,200));

// ─── 8. Payouts ─────────────────────────────────────────────────────
console.log('\n=== /payouts ===');
const pa1 = await call('GET', '/api/v1/payouts?limit=5');
check(pa1.status === 200, 'GET /payouts → 200');

// ─── 9. Notification Templates ─────────────────────────────────────
console.log('\n=== /notification-templates ===');
const n1 = await call('GET', '/api/v1/admin/notification-templates');
check(n1.status === 200, 'GET /admin/notification-templates → 200', 'got '+n1.status);

// ─── 10. Recurring ──────────────────────────────────────────────────
console.log('\n=== /recurring ===');
const re1 = await call('GET', '/api/v1/admin/recurring?limit=5');
check(re1.status === 200, 'GET /admin/recurring → 200');

// ─── 11. Business accounts ──────────────────────────────────────────
console.log('\n=== /business-accounts ===');
const ba1 = await call('GET', '/api/v1/admin/business-accounts');
check(ba1.status === 200, 'GET /admin/business-accounts → 200', 'got '+ba1.status);

// ─── 12. Service areas ──────────────────────────────────────────────
console.log('\n=== /service-areas ===');
const sa1 = await call('GET', '/api/v1/admin/service-areas');
check(sa1.status === 200, 'GET /admin/service-areas → 200', 'got '+sa1.status);

// ─── 13. Analytics ──────────────────────────────────────────────────
console.log('\n=== /analytics ===');
const a1 = await call('GET', '/api/v1/admin/dashboard/kpis?range=7d');
check(a1.status === 200, 'GET /admin/dashboard/kpis → 200');
const a2 = await call('GET', '/api/v1/admin/dashboard/revenue-trend?range=7d');
check(a2.status === 200, 'GET /admin/dashboard/revenue-trend → 200');
const a3 = await call('GET', '/api/v1/admin/dashboard/booking-volume?range=7d');
check(a3.status === 200, 'GET /admin/dashboard/booking-volume → 200');
const a4 = await call('GET', '/api/v1/admin/dashboard/acquisition-funnel?days=7');
check(a4.status === 200, 'GET /admin/dashboard/acquisition-funnel → 200');
const a5 = await call('GET', '/api/v1/admin/dashboard/alerts');
check(a5.status === 200, 'GET /admin/dashboard/alerts → 200 (was 500 pre-fix)');
const a6 = await call('GET', '/api/v1/admin/dashboard/cities');
check(a6.status === 200, 'GET /admin/dashboard/cities → 200');

// ─── 14. Audit log ──────────────────────────────────────────────────
console.log('\n=== /audit-log ===');
const al1 = await call('GET', '/api/v1/admin/audit-log?limit=10');
check(al1.status === 200, 'GET /admin/audit-log → 200');

// ─── 15. Support tickets (mounted without /admin prefix) ───────────
console.log('\n=== /support-tickets ===');
const st1 = await call('GET', '/api/v1/support-tickets');
check(st1.status === 200, 'GET /support-tickets → 200', 'got '+st1.status);

// ─── 16. Staff/Roles (mounted without /admin prefix) ───────────────
console.log('\n=== /staff ===');
const st2 = await call('GET', '/api/v1/staff/roles');
check(st2.status === 200, 'GET /staff/roles → 200', 'got '+st2.status);
const st3 = await call('GET', '/api/v1/staff/permissions');
check(st3.status === 200, 'GET /staff/permissions → 200', 'got '+st3.status);

// ─── 17. Pricing rules ──────────────────────────────────────────────
console.log('\n=== /pricing-rules ===');
const pr1 = await call('GET', '/api/v1/admin/pricing-rules');
check(pr1.status === 200, 'GET /admin/pricing-rules → 200', 'got '+pr1.status);

// ─── 18. Marketing ──────────────────────────────────────────────────
console.log('\n=== /marketing ===');
const m1 = await call('GET', '/api/v1/admin/marketing/campaigns');
check(m1.status === 200, 'GET /admin/marketing/campaigns → 200', 'got '+m1.status);

// ─── 19. Compliance ─────────────────────────────────────────────────
console.log('\n=== /compliance ===');
const co1 = await call('GET', '/api/v1/admin/compliance/dsr-alerts');
check(co1.status === 200, 'GET /admin/compliance/dsr-alerts → 200', 'got '+co1.status);

// ─── 20. Data Protection log (DSR list) ────────────────────────────
console.log('\n=== /data-protection-log ===');
// Real path: /admin/compliance/dsr (DSR queue)
const dp1 = await call('GET', '/api/v1/admin/compliance/dsr?limit=10');
check(dp1.status === 200, 'GET /admin/compliance/dsr → 200', 'got '+dp1.status);

// ─── 21. Consent versions ───────────────────────────────────────────
console.log('\n=== /consent-versions ===');
// Real path: /admin/compliance/consent-versions
const cv1 = await call('GET', '/api/v1/admin/compliance/consent-versions');
check(cv1.status === 200, 'GET /admin/compliance/consent-versions → 200', 'got '+cv1.status);

// ─── 22. Dispatch (live) ────────────────────────────────────────────
console.log('\n=== /dispatch ===');
const dis1 = await call('GET', '/api/v1/admin/bookings?status=active&limit=100');
check(dis1.status === 200, 'GET active bookings (dispatch) → 200');
const dis2 = await call('GET', '/api/v1/admin/providers?online=true&limit=200');
check(dis2.status === 200, 'GET online providers (dispatch) → 200');

// ─── Summary ────────────────────────────────────────────────────────
console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (findings.length) {
  console.log('\nDetail of failures:');
  findings.forEach(f => console.log('  -', f.msg, f.extra ? '\n    extra: '+JSON.stringify(f.extra).slice(0,200) : ''));
}
await pg.end();
process.exit(fail === 0 ? 0 : 1);
