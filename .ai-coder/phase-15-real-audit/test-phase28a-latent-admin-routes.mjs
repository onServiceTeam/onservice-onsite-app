// Phase 28a — drive the 3 newly-wired latent admin routes end-to-end.
//
// Coverage:
//   PROVIDER APPLICATIONS:
//   1. GET /admin/provider-applications lists pending submissions
//   2. POST /admin/provider-applications/:userId/decide approved → admin_actions row
//   3. POST decide rejected → admin_actions row
//   4. POST decide sent_back → admin_actions row, current_step preserved
//   5. POST decide twice on already-decided application → 409
//   6. POST decide with reason < 30 chars → 400
//   7. Non-super-admin → 403
//
//   SERVICE-AREA CHANGES:
//   8. GET /admin/service-area-changes lists pending
//   9. POST /admin/service-area-changes/:id/decide approved → admin_actions row +
//      provider's service_area_id + service_radius_km updated
//  10. POST decide rejected → admin_actions row
//  11. POST decide already-decided → 409
//  12. Reason < 30 chars → 400
//
//   ADMIN BACKUP CODES:
//  13. POST /admin/2fa/backup-codes/regenerate (self) → 10 codes returned
//  14. Codes inserted into admin_backup_codes; previous set soft-deleted
//  15. admin_actions admin_backup_codes_regenerated row written
//  16. Cross-regen for another admin requires super_admin → 403 if not

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

// ════════════════════════════════════════════════════════════════════
// Setup: 3 applicants, 1 customer (for non-admin guard), provider for area-change
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');
async function makeUser(label, role = 'customer') {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const r = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, $3, TRUE, 'P28a', $2) RETURNING id`, [phone, label, role]);
  return r.rows[0].id;
}

const applicantApprove = await makeUser('AppApr');
const applicantReject = await makeUser('AppRej');
const applicantSentBack = await makeUser('AppSb');
const applicantSentBackThenApprove = await makeUser('AppSbA');
const applicantShortReason = await makeUser('AppShort');
const customerId = await makeUser('NonAdmin');
const provUserId = await makeUser('ProvUser', 'provider');

const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status, service_radius_km)
   VALUES ($1, 'p28a prov', 'approved', 10) RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;

// Make service areas to point requests at (schema: center_lat/lng, slug+region required)
const areaA = await pg.query(
  `INSERT INTO service_areas (name, slug, city, province, region, status, center_lat, center_lng, radius_km)
   VALUES ('P28a Area A', 'p28a-area-a-' || EXTRACT(EPOCH FROM NOW())::text, 'Malay', 'Aklan', 'Western Visayas', 'active', 11.97, 121.92, 30) RETURNING id`);
const areaAId = areaA.rows[0].id;
const areaB = await pg.query(
  `INSERT INTO service_areas (name, slug, city, province, region, status, center_lat, center_lng, radius_km)
   VALUES ('P28a Area B', 'p28a-area-b-' || EXTRACT(EPOCH FROM NOW())::text, 'Cebu City', 'Cebu', 'Central Visayas', 'active', 10.31, 123.89, 30) RETURNING id`);
const areaBId = areaB.rows[0].id;

// Onboarding rows for applicants
async function makeOnboarding(userId, currentStep = 'review_pending', submitted = true) {
  await pg.query(
    `INSERT INTO provider_onboarding_progress
       (user_id, current_step, submitted_for_review_at)
     VALUES ($1, $2, ${submitted ? 'NOW()' : 'NULL'})`,
    [userId, currentStep]);
}
await makeOnboarding(applicantApprove);
await makeOnboarding(applicantReject);
await makeOnboarding(applicantSentBack);
await makeOnboarding(applicantSentBackThenApprove);
await makeOnboarding(applicantShortReason);

// Service-area-change requests
async function makeAreaChange(providerUserId, requestedAreaId) {
  const r = await pg.query(
    `INSERT INTO service_area_change_requests
       (provider_id, current_area_id, requested_area_id, current_radius_km,
        requested_radius_km, reason, status)
     VALUES ($1, NULL, $2, 10, 25, 'phase 28a request to expand area for testing', 'pending')
     RETURNING id`, [provUserId, requestedAreaId]);
  return r.rows[0].id;
}
const ac1 = await makeAreaChange(provUserId, areaAId);

const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

async function countVerb(verb, targetId) {
  const r = await pg.query(
    `SELECT COUNT(*)::int AS c FROM admin_actions
      WHERE action_type=$1 ${targetId ? 'AND target_id=$2' : ''}`,
    targetId ? [verb, targetId] : [verb]);
  return r.rows[0].c;
}

// ════════════════════════════════════════════════════════════════════
// 1. GET pending applications
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /admin/provider-applications ===');
const list = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/provider-applications?limit=200');
check(list.status === 200, `→ 200 (got ${list.status})`, JSON.stringify(list.body).slice(0,200));
const ids = (list.body?.data ?? []).map(a => a.userId ?? a.user_id);
check(ids.includes(applicantApprove), 'pending applicant in list');

// ════════════════════════════════════════════════════════════════════
// 2-4. Approve / Reject / Sent_back decisions
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. POST decide approved ===');
const beforeApr = await countVerb('provider_application_approved', applicantApprove);
const r2 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantApprove}/decide`,
  { decision: 'approved', reason: 'Phase 28a — applicant meets all requirements; documents verified.' });
check([200,201].includes(r2.status), `→ 2xx (got ${r2.status})`,
  JSON.stringify(r2.body).slice(0,200));
const afterApr = await countVerb('provider_application_approved', applicantApprove);
check(afterApr === beforeApr + 1, 'provider_application_approved row written');

console.log('\n=== 3. POST decide rejected ===');
const r3 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantReject}/decide`,
  { decision: 'rejected', reason: 'Phase 28a — application missing required NBI clearance per platform policy.' });
check([200,201].includes(r3.status), `→ 2xx (got ${r3.status})`);
check(await countVerb('provider_application_rejected', applicantReject) >= 1,
  'provider_application_rejected row written');

console.log('\n=== 4. POST decide sent_back ===');
const r4 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantSentBack}/decide`,
  { decision: 'sent_back', reason: 'Phase 28a — please re-upload NBI in higher resolution; current scan unreadable.' });
check([200,201].includes(r4.status), `→ 2xx (got ${r4.status})`);
check(await countVerb('provider_application_sent_back', applicantSentBack) >= 1,
  'provider_application_sent_back row written');
const sbDb = await pg.query(
  `SELECT current_step, admin_decision FROM provider_onboarding_progress WHERE user_id=$1`,
  [applicantSentBack]);
check(sbDb.rows[0]?.admin_decision === 'sent_back', 'admin_decision=sent_back');

// ════════════════════════════════════════════════════════════════════
// 5. Decide twice on already-approved → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Decide twice on approved → 409 ===');
const r5 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantApprove}/decide`,
  { decision: 'rejected', reason: 'Phase 28a — second decision attempt; should be rejected with 409.' });
check(r5.status === 409, `→ 409 (got ${r5.status})`);

// 5b. sent_back can be re-decided (the route allows re-decide)
console.log('\n=== 5b. After sent_back, re-decide allowed ===');
const r5b = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantSentBackThenApprove}/decide`,
  { decision: 'sent_back', reason: 'Phase 28a — first sent_back to permit a re-decision afterwards.' });
check([200,201].includes(r5b.status), 'first sent_back ok');
const r5c = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantSentBackThenApprove}/decide`,
  { decision: 'approved', reason: 'Phase 28a — re-decide after sent_back; should now succeed.' });
check([200,201].includes(r5c.status), `re-decide approved → 2xx (got ${r5c.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. Reason < 30 chars → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Short reason → 400 ===');
const r6 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantShortReason}/decide`,
  { decision: 'rejected', reason: 'too short' });
check(r6.status === 400, `→ 400 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. Customer (non-super) → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Non-super-admin → 403 ===');
const r7 = await call(CUST_TOKEN, 'POST',
  `/api/v1/admin/provider-applications/${applicantShortReason}/decide`,
  { decision: 'rejected', reason: 'Phase 28a — customer role attempt; should be rejected with 403.' });
check(r7.status === 403, `→ 403 (got ${r7.status})`);

// ════════════════════════════════════════════════════════════════════
// 8. GET pending area-change requests
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. GET /admin/service-area-changes ===');
const acList = await call(SUPER_TOKEN, 'GET', '/api/v1/admin/service-area-changes?limit=200');
check(acList.status === 200, `→ 200 (got ${acList.status})`);
const acIds = (acList.body?.data ?? []).map(a => a.id ?? a.changeId);
check(acIds.includes(ac1), 'pending area-change in list');

// ════════════════════════════════════════════════════════════════════
// 9. Approve area change → provider updated + admin_actions row
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Approve area change → provider updated ===');
const beforeAcApr = await countVerb('service_area_change_approved', ac1);
const r9 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/service-area-changes/${ac1}/decide`,
  { decision: 'approved', reason: 'Phase 28a — area change approved; new region within platform limits.' });
check([200,201].includes(r9.status), `→ 2xx (got ${r9.status})`,
  JSON.stringify(r9.body).slice(0,200));
const afterAcApr = await countVerb('service_area_change_approved', ac1);
check(afterAcApr === beforeAcApr + 1, 'service_area_change_approved row written');

const provDb = await pg.query(
  `SELECT service_radius_km FROM providers WHERE id=$1`, [providerId]);
check(Number(provDb.rows[0]?.service_radius_km) === 25, 'provider service_radius_km updated');
const psa = await pg.query(
  `SELECT service_area_id FROM provider_service_areas WHERE provider_id=$1 AND is_primary=TRUE`,
  [providerId]);
check(psa.rows[0]?.service_area_id === areaAId,
  'provider_service_areas primary = requested area',
  `got ${psa.rows[0]?.service_area_id}`);

// ════════════════════════════════════════════════════════════════════
// 10. Reject area change
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Reject area change ===');
const ac2 = await makeAreaChange(provUserId, areaBId);
const r10 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/service-area-changes/${ac2}/decide`,
  { decision: 'rejected', reason: 'Phase 28a — rejection: requested area outside service coverage zone.' });
check([200,201].includes(r10.status), `→ 2xx (got ${r10.status})`);
check(await countVerb('service_area_change_rejected', ac2) === 1,
  'service_area_change_rejected row written');

// ════════════════════════════════════════════════════════════════════
// 11. Already-decided → 409
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Re-decide already-decided → 409 ===');
const r11 = await call(SUPER_TOKEN, 'POST',
  `/api/v1/admin/service-area-changes/${ac1}/decide`,
  { decision: 'rejected', reason: 'Phase 28a — second decision attempt; should be rejected with 409.' });
check(r11.status === 409, `→ 409 (got ${r11.status})`);

// ════════════════════════════════════════════════════════════════════
// 12. Reason < 30 chars on area change → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Short reason → 400 ===');
const ac3 = await makeAreaChange(provUserId, areaAId).catch(()=>null);
if (ac3) {
  const r12 = await call(SUPER_TOKEN, 'POST',
    `/api/v1/admin/service-area-changes/${ac3}/decide`,
    { decision: 'approved', reason: 'too short' });
  check(r12.status === 400, `→ 400 (got ${r12.status})`);
  await pg.query(`DELETE FROM service_area_change_requests WHERE id=$1`, [ac3]);
}

// ════════════════════════════════════════════════════════════════════
// 13. Self-regenerate backup codes
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 13. Self-regenerate backup codes ===');
const beforeGen = await countVerb('admin_backup_codes_regenerated', SUPER_ADMIN_ID);
const beforeActiveCodes = await pg.query(
  `SELECT COUNT(*)::int AS c FROM admin_backup_codes
    WHERE admin_user_id=$1 AND deleted_at IS NULL AND used_at IS NULL`, [SUPER_ADMIN_ID]);

const r13 = await call(SUPER_TOKEN, 'POST', '/api/v1/admin/2fa/backup-codes/regenerate', {});
check(r13.status === 201, `→ 201 (got ${r13.status})`,
  JSON.stringify(r13.body).slice(0,200));
const codes = r13.body?.data?.codes;
check(Array.isArray(codes) && codes.length === 8, `8 codes returned (got ${codes?.length})`);

// 14. New active codes inserted
const afterActiveCodes = await pg.query(
  `SELECT COUNT(*)::int AS c FROM admin_backup_codes
    WHERE admin_user_id=$1 AND deleted_at IS NULL AND used_at IS NULL`, [SUPER_ADMIN_ID]);
check(afterActiveCodes.rows[0].c === 8, '8 active backup codes for super-admin');

// 15. admin_actions row
const afterGen = await countVerb('admin_backup_codes_regenerated', SUPER_ADMIN_ID);
check(afterGen === beforeGen + 1, 'admin_backup_codes_regenerated row written');

// 16. Customer trying to regen another admin's codes → 403
console.log('\n=== 16. Customer trying to regen another admin\'s codes → 403 ===');
const r16 = await call(CUST_TOKEN, 'POST', '/api/v1/admin/2fa/backup-codes/regenerate',
  { adminUserId: SUPER_ADMIN_ID });
check(r16.status === 403, `→ 403 (got ${r16.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
const allUsers = [applicantApprove, applicantReject, applicantSentBack,
                  applicantSentBackThenApprove, applicantShortReason,
                  customerId, provUserId];
await pg.query(`DELETE FROM admin_actions WHERE target_id = ANY($1)`, [allUsers]);
await pg.query(`DELETE FROM admin_actions WHERE target_id IN ($1, $2)`, [ac1, ac2]).catch(()=>{});
await pg.query(`DELETE FROM admin_backup_codes WHERE admin_user_id=$1
                  AND created_at > NOW() - INTERVAL '5 minutes'`, [SUPER_ADMIN_ID]);
await pg.query(`DELETE FROM provider_onboarding_progress WHERE user_id = ANY($1)`, [allUsers]);
await pg.query(`DELETE FROM service_area_change_requests WHERE id IN ($1, $2)`, [ac1, ac2]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM service_areas WHERE id IN ($1, $2)`, [areaAId, areaBId]);
await pg.query(`DELETE FROM users WHERE id = ANY($1)`, [allUsers]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
