// Phase 28d — notification preferences + marketing consent flow.
//
// Coverage:
//   1. GET /notifications/preferences (no row) → defaults returned
//   2. PUT /notifications/preferences updates rows correctly
//   3. Partial PUT only changes specified fields
//   4. POST /notifications/push-token registers token
//   5. POST /notifications/push-token rejects invalid platform
//   6. POST /notifications/read-all marks all unread → read
//   7. POST /notifications/:id/read marks single notification
//   8. Marketing consent acknowledgement via service
//   9. isMarketingChannelEligible reflects per-channel toggle + consent
//  10. listMarketingEligibleUsers returns only consented + toggle-on users
//  11. Auth required → 401 on every endpoint
//
// Note: notification preferences exposes marketing flags + per-type toggles
// but no quiet-hours feature exists in the codebase (verified via grep).

import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const REPO_ROOT = process.cwd();

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

// ════════════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════════════
const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phone2 = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P28d', 'Cust') RETURNING id`, [phone]);
const customerId = cust.rows[0].id;
const cust2 = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P28d', 'Cust2') RETURNING id`, [phone2]);
const customerId2 = cust2.rows[0].id;

const TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const TOKEN2 = jwt.sign(
  { userId: customerId2, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// ════════════════════════════════════════════════════════════════════
// 1. GET preferences with no row → defaults
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. GET /preferences (no row) → defaults ===');
const r1 = await call(TOKEN, 'GET', '/api/v1/notifications/preferences');
check(r1.status === 200, `→ 200 (got ${r1.status})`);
check(r1.body?.data?.bookingUpdates === true, 'bookingUpdates default true');
check(r1.body?.data?.promotions === false, 'promotions default false');
check(r1.body?.data?.marketingPushEnabled === false, 'marketing push default false');
check(r1.body?.data?.marketingConsentAcknowledgedAt === null,
  'marketing consent null');

// ════════════════════════════════════════════════════════════════════
// 2. PUT updates several fields
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. PUT /preferences ===');
const r2 = await call(TOKEN, 'PUT', '/api/v1/notifications/preferences', {
  bookingUpdates: false,
  promotions: true,
  marketingPushEnabled: true,
  marketingEmailEnabled: true,
});
check(r2.status === 200, `→ 200 (got ${r2.status})`,
  JSON.stringify(r2.body).slice(0,200));
check(r2.body?.data?.bookingUpdates === false, 'bookingUpdates flipped to false');
check(r2.body?.data?.promotions === true, 'promotions flipped to true');
check(r2.body?.data?.marketingPushEnabled === true, 'marketing push on');
check(r2.body?.data?.marketingEmailEnabled === true, 'marketing email on');

// ════════════════════════════════════════════════════════════════════
// 3. Partial PUT only changes specified fields
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Partial PUT preserves other fields ===');
const r3 = await call(TOKEN, 'PUT', '/api/v1/notifications/preferences', {
  promotions: false,  // flip back
});
check(r3.body?.data?.promotions === false, 'promotions back to false');
check(r3.body?.data?.bookingUpdates === false, 'bookingUpdates still false (preserved)');
check(r3.body?.data?.marketingPushEnabled === true, 'marketing push still on (preserved)');

// ════════════════════════════════════════════════════════════════════
// 4. POST push-token registers
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. POST /push-token ===');
const r4 = await call(TOKEN, 'POST', '/api/v1/notifications/push-token', {
  token: 'ExponentPushToken[fake-test-' + Date.now() + ']',
  platform: 'ios',
});
check(r4.status === 200, `→ 200 (got ${r4.status})`);
const tokDb = await pg.query(
  `SELECT platform FROM push_tokens WHERE user_id=$1`, [customerId]);
check(tokDb.rows.length >= 1, 'push_tokens row created');
check(tokDb.rows[0]?.platform === 'ios', 'platform=ios');

// ════════════════════════════════════════════════════════════════════
// 5. Invalid platform → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Invalid platform → 400 ===');
const r5 = await call(TOKEN, 'POST', '/api/v1/notifications/push-token', {
  token: 'token-x', platform: 'commodore-64',
});
check(r5.status === 400, `→ 400 (got ${r5.status})`);

// 5b. Missing token → 400
const r5b = await call(TOKEN, 'POST', '/api/v1/notifications/push-token', {
  platform: 'ios',
});
check(r5b.status === 400, `missing token → 400 (got ${r5b.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. Mark all read
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. POST /read-all marks unread → read ===');
// Seed 3 unread notifications for the customer
await pg.query(
  `INSERT INTO notifications (user_id, type, title, body, data, is_read)
   SELECT $1, 'system', 'P28d notif ' || g, 'phase 28d test', '{}'::jsonb, FALSE
     FROM generate_series(1, 3) AS g`, [customerId]);

const r6 = await call(TOKEN, 'POST', '/api/v1/notifications/read-all');
check(r6.status === 200, `→ 200 (got ${r6.status})`);
check(r6.body?.data?.markedRead >= 3, `markedRead ≥ 3 (got ${r6.body?.data?.markedRead})`);
const unreadAfter = await pg.query(
  `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
  [customerId]);
check(unreadAfter.rows[0].c === 0, 'no unread notifications remaining');

// ════════════════════════════════════════════════════════════════════
// 7. Mark single notification read
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. POST /:id/read marks single ===');
const single = await pg.query(
  `INSERT INTO notifications (user_id, type, title, body, data, is_read)
   VALUES ($1, 'system', 'single', 'phase 28d single', '{}'::jsonb, FALSE)
   RETURNING id`, [customerId]);
const r7 = await call(TOKEN, 'POST', `/api/v1/notifications/${single.rows[0].id}/read`);
check(r7.status === 200, `→ 200 (got ${r7.status})`);
const singleDb = await pg.query(`SELECT is_read FROM notifications WHERE id=$1`, [single.rows[0].id]);
check(singleDb.rows[0]?.is_read === true, 'is_read flipped to true');

// ════════════════════════════════════════════════════════════════════
// 8/9/10. Marketing consent + eligibility (via direct service import)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8/9/10. Marketing consent + eligibility ===');
const notifSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/notification.service.ts')
).href);

// 8. Acknowledge consent for customer 1 (push enabled)
await notifSvc.acknowledgeMarketingConsent(customerId, 1);
const ackDb = await pg.query(
  `SELECT marketing_consent_acknowledged_at, marketing_consent_version
     FROM notification_preferences WHERE user_id=$1`, [customerId]);
check(ackDb.rows[0]?.marketing_consent_acknowledged_at !== null,
  'marketing_consent_acknowledged_at set');
check(Number(ackDb.rows[0]?.marketing_consent_version) === 1, 'consent version = 1');

// 9. isMarketingChannelEligible — push enabled + consented = eligible
const elPush = await notifSvc.isMarketingChannelEligible(customerId, 'push');
check(elPush === true, 'customer 1 eligible for push (toggle on + consented)');
const elSms = await notifSvc.isMarketingChannelEligible(customerId, 'sms');
check(elSms === false, 'customer 1 NOT eligible for sms (toggle off)');

// Customer 2: no consent acknowledged → not eligible regardless of toggle
const r9b = await call(TOKEN2, 'PUT', '/api/v1/notifications/preferences', {
  marketingPushEnabled: true,
});
check(r9b.status === 200, 'customer 2 enabled push toggle');
const elPush2 = await notifSvc.isMarketingChannelEligible(customerId2, 'push');
check(elPush2 === false, 'customer 2 NOT eligible (no consent)');

// 10. listMarketingEligibleUsers — only customer 1 included
const eligPush = await notifSvc.listMarketingEligibleUsers('push', 100, 0);
check(eligPush.includes(customerId), 'customer 1 in push-eligible list');
check(!eligPush.includes(customerId2), 'customer 2 NOT in push-eligible list');

// ════════════════════════════════════════════════════════════════════
// 11. Auth required
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Auth required → 401 ===');
const noAuth1 = await call(null, 'GET', '/api/v1/notifications/preferences');
check(noAuth1.status === 401, `GET /preferences no auth → 401 (got ${noAuth1.status})`);
const noAuth2 = await call(null, 'PUT', '/api/v1/notifications/preferences', { promotions: true });
check(noAuth2.status === 401, `PUT /preferences no auth → 401 (got ${noAuth2.status})`);
const noAuth3 = await call(null, 'POST', '/api/v1/notifications/push-token',
  { token: 'x', platform: 'ios' });
check(noAuth3.status === 401, `POST /push-token no auth → 401 (got ${noAuth3.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM push_tokens WHERE user_id IN ($1, $2)`, [customerId, customerId2]);
await pg.query(`DELETE FROM notifications WHERE user_id IN ($1, $2)`, [customerId, customerId2]);
await pg.query(`DELETE FROM notification_preferences WHERE user_id IN ($1, $2)`, [customerId, customerId2]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2)`, [customerId, customerId2]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
