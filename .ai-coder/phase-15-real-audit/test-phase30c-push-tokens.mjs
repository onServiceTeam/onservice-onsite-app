// Phase 30c — push token lifecycle.
//
// Coverage:
//   1. POST /notifications/push-token registers a token
//   2. Re-registering the same (user, token) pair updates platform (UPSERT)
//   3. Multiple tokens per user supported (different platforms)
//   4. UNIQUE (user_id, token) prevents duplicates of the exact same pair
//   5. Schema validates platform enum (ios/android/web only)
//   6. Auth required → 401
//   7. DeviceNotRegistered handler removes stale token (mock the Expo API
//      with a tiny intercept) — drive deliverPushToDevice via the service
//      directly with a fetch override
//
// Note: actual Expo push delivery requires expo.host endpoint; we test the
// stale-token cleanup logic by overriding global.fetch to return a
// DeviceNotRegistered ticket and verifying the row is deleted.

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

const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P30c', 'Cust') RETURNING id`, [phone]);
const customerId = cust.rows[0].id;
const TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const TS = Date.now();

// ════════════════════════════════════════════════════════════════════
// 1. Register a push token
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /notifications/push-token ===');
const tok1 = `ExponentPushToken[p30c-${TS}-1]`;
const r1 = await call(TOKEN, 'POST', '/api/v1/notifications/push-token', {
  token: tok1, platform: 'ios',
});
check(r1.status === 200, `→ 200 (got ${r1.status})`,
  JSON.stringify(r1.body).slice(0,200));

const t1Db = await pg.query(`SELECT platform FROM push_tokens WHERE user_id=$1 AND token=$2`,
  [customerId, tok1]);
check(t1Db.rows[0]?.platform === 'ios', 'platform=ios');

// ════════════════════════════════════════════════════════════════════
// 2. Re-register same (user, token) updates platform via UPSERT
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. UPSERT updates platform on repeat ===');
const r2 = await call(TOKEN, 'POST', '/api/v1/notifications/push-token', {
  token: tok1, platform: 'android',
});
check(r2.status === 200, `→ 200 (got ${r2.status})`);
const t1Db2 = await pg.query(`SELECT platform FROM push_tokens WHERE user_id=$1 AND token=$2`,
  [customerId, tok1]);
check(t1Db2.rows[0]?.platform === 'android', 'platform updated to android');

// Count should still be 1 (no duplicate row inserted)
const cnt2 = await pg.query(`SELECT COUNT(*)::int AS c FROM push_tokens WHERE user_id=$1`, [customerId]);
check(cnt2.rows[0].c === 1, 'still 1 row (UPSERT, no duplicate)');

// ════════════════════════════════════════════════════════════════════
// 3. Multiple tokens per user
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Multiple tokens per user ===');
const tok2 = `ExponentPushToken[p30c-${TS}-2]`;
const tok3 = `ExponentPushToken[p30c-${TS}-3]`;
await call(TOKEN, 'POST', '/api/v1/notifications/push-token', { token: tok2, platform: 'web' });
await call(TOKEN, 'POST', '/api/v1/notifications/push-token', { token: tok3, platform: 'ios' });
const cnt3 = await pg.query(`SELECT COUNT(*)::int AS c FROM push_tokens WHERE user_id=$1`, [customerId]);
check(cnt3.rows[0].c === 3, `3 tokens for user (got ${cnt3.rows[0].c})`);

// ════════════════════════════════════════════════════════════════════
// 5. Invalid platform → 400 (covered in Phase 28d already; re-verify)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Invalid platform → 400 ===');
const r5 = await call(TOKEN, 'POST', '/api/v1/notifications/push-token', {
  token: 'ExponentPushToken[bogus]', platform: 'symbian',
});
check(r5.status === 400, `→ 400 (got ${r5.status})`);

// ════════════════════════════════════════════════════════════════════
// 6. Auth required → 401
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. No auth → 401 ===');
const r6 = await call(null, 'POST', '/api/v1/notifications/push-token', {
  token: tok2, platform: 'ios',
});
check(r6.status === 401, `→ 401 (got ${r6.status})`);

// ════════════════════════════════════════════════════════════════════
// 7. DeviceNotRegistered cleanup — override global.fetch to return
//    a DeviceNotRegistered ticket. Drive deliverPushToDevice via the
//    service. The token should be DELETEd from push_tokens.
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. DeviceNotRegistered → token deleted ===');
const notifSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/notification.service.ts')
).href);

// Save real fetch + intercept Expo API
const realFetch = globalThis.fetch;
let interceptedCount = 0;
globalThis.fetch = async function intercepted(url, init) {
  if (typeof url === 'string' && url.includes('exp.host/--/api/v2/push/send')) {
    interceptedCount++;
    const body = init?.body ? JSON.parse(init.body) : [];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: body.map(() => ({
          status: 'error',
          message: 'DeviceNotRegistered',
          details: { error: 'DeviceNotRegistered' },
        })),
      }),
    };
  }
  return realFetch(url, init);
};

// sendPushNotification → createNotification + deliverPushToDevice (async).
// Use sendPushNotification because it triggers the path with Expo call.
const beforeCount = await pg.query(`SELECT COUNT(*)::int AS c FROM push_tokens WHERE user_id=$1`, [customerId]);
await notifSvc.sendPushNotification(
  customerId, 'P30c probe', 'phase 30c stale token cleanup test',
  'system', { phase: '30c' },
);
// deliverPushToDevice runs `void` so we need to wait briefly
await new Promise(r => setTimeout(r, 400));

const afterCount = await pg.query(`SELECT COUNT(*)::int AS c FROM push_tokens WHERE user_id=$1`, [customerId]);
check(interceptedCount >= 1, `Expo API was called (interceptCount=${interceptedCount})`);
check(afterCount.rows[0].c === 0,
  `all 3 tokens deleted (DeviceNotRegistered cleanup) — got ${afterCount.rows[0].c}`,
  `before=${beforeCount.rows[0].c}`);

// Restore real fetch
globalThis.fetch = realFetch;

// ════════════════════════════════════════════════════════════════════
// 8. Push retry queue: when Expo throws, enqueuePushRetry fires
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Expo failure → push_retry_queue row ===');
// Re-register a token first
await call(TOKEN, 'POST', '/api/v1/notifications/push-token', { token: tok1, platform: 'ios' });

// Override fetch to throw
globalThis.fetch = async function throwy() { throw new Error('phase30c expo down'); };

const beforeRetry = await pg.query(
  `SELECT COUNT(*)::int AS c FROM push_retry_queue WHERE user_id=$1`, [customerId]);
await notifSvc.sendPushNotification(
  customerId, 'P30c retry', 'phase 30c retry queue test',
  'system', { phase: '30c-retry' },
);
// deliverPushToDevice is `void` (fire-and-forget); enqueuePushRetry runs
// after the fetch reject + a require(). Generous wait so the chain finishes.
await new Promise(r => setTimeout(r, 1500));
const afterRetry = await pg.query(
  `SELECT COUNT(*)::int AS c FROM push_retry_queue WHERE user_id=$1`, [customerId]);
check(afterRetry.rows[0].c === beforeRetry.rows[0].c + 1,
  `push_retry_queue row enqueued on Expo failure (before=${beforeRetry.rows[0].c} after=${afterRetry.rows[0].c})`);

globalThis.fetch = realFetch;

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM push_retry_queue WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM notifications WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM push_tokens WHERE user_id=$1`, [customerId]);
await pg.query(`DELETE FROM users WHERE id=$1`, [customerId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
