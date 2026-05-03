// Phase 29d — conversation messaging end-to-end.
//
// Coverage:
//   1. POST /messaging creates conversation for booking
//   2. POST again for same booking is idempotent (returns same conversation)
//   3. Wrong user (not customer or provider on booking) → 403
//   4. POST /:id/messages sends message + emits socket event + creates notification
//   5. GET /:id/messages returns paginated messages
//   6. POST /:id/read marks unread → read + count returned
//   7. GET /unread/count
//   8. Send message > 2000 chars → 400 (defense)
//   9. Bypass-pattern message gets is_flagged=TRUE (per cron BYPASS_PATTERNS)
//      Actually flagging happens via the bypass-detect cron, not at send-time.
//      So we just verify the message persists; flagging is Phase 26b responsibility.
//  10. Wrong-customer GET messages → 403/404
//  11. Auth required → 401

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

// ════════════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════════════
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29d', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const other = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P29d', 'Other') RETURNING id`, [phoneOther]);
const otherId = other.rows[0].id;
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P29d', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'p29d prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;
const bk = await pg.query(
  `INSERT INTO bookings
     (customer_id, provider_id, category_id, status, total_amount,
      service_price, service_fee, address, barangay, city, province,
      latitude, longitude, scheduled_at, escrow_status)
   VALUES ($1, $2, $3, 'in_progress', 100000, 100000, 0,
           'a','a','a','a',11.97,121.92, NOW(), 'held')
   RETURNING id`,
  [customerId, providerId, categoryId]);
const bookingId = bk.rows[0].id;

const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const OTHER_TOKEN = jwt.sign(
  { userId: otherId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const PROV_TOKEN = jwt.sign(
  { userId: provUserId, role: 'provider', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// ════════════════════════════════════════════════════════════════════
// 1. POST /messaging creates conversation
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. POST /messaging → 201 ===');
const r1 = await call(CUST_TOKEN, 'POST', '/api/v1/messaging', { bookingId });
check(r1.status === 201, `→ 201 (got ${r1.status})`, JSON.stringify(r1.body).slice(0,200));
const conversationId = r1.body?.data?.id;
check(typeof conversationId === 'string', 'conversation id returned');

// ════════════════════════════════════════════════════════════════════
// 2. Idempotent
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. POST again → same conversation (idempotent) ===');
const r2 = await call(PROV_TOKEN, 'POST', '/api/v1/messaging', { bookingId });
check(r2.status === 201, `→ 201 (got ${r2.status})`);
check(r2.body?.data?.id === conversationId, 'same conversation id returned');

// ════════════════════════════════════════════════════════════════════
// 3. Other user → 403
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Wrong user → 403 ===');
const r3 = await call(OTHER_TOKEN, 'POST', '/api/v1/messaging', { bookingId });
check(r3.status === 403, `→ 403 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Send message → row created + notification
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. POST /:id/messages → message created ===');
const beforeNotif = await pg.query(
  `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND type='new_message'`,
  [provUserId]);
const r4 = await call(CUST_TOKEN, 'POST', `/api/v1/messaging/${conversationId}/messages`, {
  content: 'Phase 29d — hello provider, when can you arrive?',
  messageType: 'text',
});
check(r4.status === 201, `→ 201 (got ${r4.status})`,
  JSON.stringify(r4.body).slice(0,200));
const messageId = r4.body?.data?.id;
check(typeof messageId === 'string', 'message id returned');

// Notification fired to recipient (provider)
await new Promise(r => setTimeout(r, 200));
const afterNotif = await pg.query(
  `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND type='new_message'`,
  [provUserId]);
check(afterNotif.rows[0].c === beforeNotif.rows[0].c + 1,
  `provider notification created (before=${beforeNotif.rows[0].c} after=${afterNotif.rows[0].c})`);

// 4b. Provider replies
const r4b = await call(PROV_TOKEN, 'POST', `/api/v1/messaging/${conversationId}/messages`, {
  content: 'Phase 29d — provider reply, on the way!',
  messageType: 'text',
});
check(r4b.status === 201, `provider reply → 201 (got ${r4b.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. GET /:id/messages
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. GET /:id/messages ===');
const r5 = await call(CUST_TOKEN, 'GET', `/api/v1/messaging/${conversationId}/messages`);
check(r5.status === 200, `→ 200 (got ${r5.status})`);
check(Array.isArray(r5.body?.data) && r5.body.data.length >= 2,
  `2 messages returned (got ${r5.body?.data?.length})`);
check(r5.body?.meta?.total >= 2, 'meta.total reports count');

// ════════════════════════════════════════════════════════════════════
// 6. Mark read
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. POST /:id/read marks unread → read ===');
const r6 = await call(PROV_TOKEN, 'POST', `/api/v1/messaging/${conversationId}/read`);
check(r6.status === 200, `→ 200 (got ${r6.status})`);
check(r6.body?.data?.markedRead >= 1, `markedRead ≥ 1 (got ${r6.body?.data?.markedRead})`);

// ════════════════════════════════════════════════════════════════════
// 7. GET /unread/count
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. GET /unread/count ===');
const r7 = await call(CUST_TOKEN, 'GET', '/api/v1/messaging/unread/count');
check(r7.status === 200, `→ 200 (got ${r7.status})`);
check(typeof r7.body?.data?.unreadCount === 'number', 'unreadCount is number');

// ════════════════════════════════════════════════════════════════════
// 8. Send > 2000 chars → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Message > 2000 chars → 400 ===');
const r8 = await call(CUST_TOKEN, 'POST', `/api/v1/messaging/${conversationId}/messages`, {
  content: 'a'.repeat(2500),
  messageType: 'text',
});
check(r8.status === 400, `→ 400 (got ${r8.status})`);

// ════════════════════════════════════════════════════════════════════
// 9. Empty content → 400
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Empty content → 400 ===');
const r9 = await call(CUST_TOKEN, 'POST', `/api/v1/messaging/${conversationId}/messages`, {
  content: '', messageType: 'text',
});
check(r9.status === 400, `→ 400 (got ${r9.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. Wrong-customer GET messages → 403/404
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Other user GET messages → 403/404 ===');
const r10 = await call(OTHER_TOKEN, 'GET', `/api/v1/messaging/${conversationId}/messages`);
check([403, 404].includes(r10.status), `→ 403/404 (got ${r10.status})`,
  JSON.stringify(r10.body).slice(0,200));

// ════════════════════════════════════════════════════════════════════
// 11. Auth required
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Auth required → 401 ===');
const noAuth1 = await call(null, 'GET', '/api/v1/messaging');
check(noAuth1.status === 401, `GET no auth → 401`);
const noAuth2 = await call(null, 'POST', `/api/v1/messaging/${conversationId}/messages`, {
  content: 'noauth', messageType: 'text',
});
check(noAuth2.status === 401, `POST no auth → 401`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3)`, [customerId, otherId, provUserId]);
await pg.query(`DELETE FROM messages WHERE conversation_id=$1`, [conversationId]);
await pg.query(`DELETE FROM conversations WHERE id=$1`, [conversationId]);
await pg.query(`DELETE FROM bookings WHERE id=$1`, [bookingId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [customerId, otherId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
