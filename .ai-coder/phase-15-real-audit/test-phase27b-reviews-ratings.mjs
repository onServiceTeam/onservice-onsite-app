// Phase 27b — reviews + ratings flow end-to-end.
//
// Coverage:
//   1. Customer creates review on confirmed booking → review row + provider rating updated
//   2. Status guard: cannot review booking that's not confirmed → 409
//   3. Wrong customer cannot review someone else's booking → 403
//   4. Cannot create second review on same booking → 409
//   5. Aggregate rating is recomputed when new reviews land
//   6. Flagged content (profanity) → is_flagged=TRUE, is_visible=FALSE
//   7. Flagged content (phone number / off-platform contact) → flagged
//   8. Tags filtered to allowlist only
//   9. Provider can respond to review once (then 409 on second attempt)
//  10. GET /reviews/provider/:id returns aggregate + paginated reviews
//  11. GET /reviews/booking/:id returns specific review
//  12. Comment > 2000 chars rejected
//  13. Hidden (flagged) reviews don't count in aggregate

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
console.log('\n=== Setup ===');
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneOther = '+63918' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));

const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P27b', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const other = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P27b', 'Other') RETURNING id`, [phoneOther]);
const otherId = other.rows[0].id;
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P27b', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status, rating)
   VALUES ($1, 'p27b prov', 'approved', 0) RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;

async function makeBooking(status) {
  const r = await pg.query(
    `INSERT INTO bookings
       (customer_id, provider_id, category_id, status, total_amount,
        service_price, service_fee, address, barangay, city, province,
        latitude, longitude, scheduled_at, escrow_status)
     VALUES ($1, $2, $3, $4, 100000, 100000, 0,
             'a', 'a', 'a', 'a', 11.97, 121.92, NOW(), 'released')
     RETURNING id`,
    [customerId, providerId, categoryId, status]);
  return r.rows[0].id;
}

const bkConfirmed = await makeBooking('confirmed');
const bkConfirmed2 = await makeBooking('confirmed');
const bkConfirmed3 = await makeBooking('confirmed');
const bkConfirmed4 = await makeBooking('confirmed');
const bkConfirmed5 = await makeBooking('confirmed');
const bkConfirmed6 = await makeBooking('confirmed');
const bkInProgress = await makeBooking('in_progress');

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
// 1. Customer creates review → row + aggregate updated
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Customer creates 5-star review ===');
const r1 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed,
  rating: 5,
  qualityRating: 5,
  punctualityRating: 5,
  professionalismRating: 5,
  communicationRating: 5,
  valueRating: 5,
  comment: 'Phase 27b — excellent professional service, would book again.',
  tags: ['professional', 'punctual', 'great_value'],
});
check(r1.status === 201, `→ 201 (got ${r1.status})`, JSON.stringify(r1.body).slice(0,200));
const review1Id = r1.body?.data?.id;
check(typeof review1Id === 'string', 'review id returned');

const provAfter1 = await pg.query(`SELECT rating FROM providers WHERE id=$1`, [providerId]);
check(Number(provAfter1.rows[0].rating) === 5,
  `provider rating updated to 5.00 (got ${provAfter1.rows[0].rating})`);

// ════════════════════════════════════════════════════════════════════
// 2. Cannot review non-confirmed booking
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Cannot review in_progress booking → 4xx ===');
const r2 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkInProgress, rating: 4,
  comment: 'Phase 27b — testing too-early review rejection on in-progress booking.',
});
check([400, 409].includes(r2.status), `→ 4xx (got ${r2.status})`);

// ════════════════════════════════════════════════════════════════════
// 3. Wrong customer
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Wrong customer → 403 ===');
const r3 = await call(OTHER_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed2, rating: 1, comment: 'Phase 27b wrong customer attempt.',
});
check(r3.status === 403, `→ 403 (got ${r3.status})`);

// ════════════════════════════════════════════════════════════════════
// 4. Cannot review same booking twice
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Second review on same booking → 409 ===');
const r4 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed, rating: 1, comment: 'Phase 27b second attempt.',
});
check(r4.status === 409, `→ 409 (got ${r4.status})`);

// ════════════════════════════════════════════════════════════════════
// 5. Aggregate recomputed when 3-star review lands
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Aggregate recomputed across reviews ===');
const r5 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed2, rating: 3,
  comment: 'Phase 27b — average service, met basic expectations.',
});
check(r5.status === 201, `r5 → 201 (got ${r5.status})`);
const provAfter5 = await pg.query(`SELECT rating FROM providers WHERE id=$1`, [providerId]);
// Aggregate = (5 + 3) / 2 = 4.00
check(Number(provAfter5.rows[0].rating) === 4,
  `provider rating recomputed to 4.00 (got ${provAfter5.rows[0].rating})`);

// ════════════════════════════════════════════════════════════════════
// 6. Profanity flagged
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Profanity → flagged ===');
const r6 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed3, rating: 1,
  comment: 'Phase 27b — this provider was a complete tanga and gago about the entire job.',
});
check(r6.status === 201, `r6 → 201 (got ${r6.status})`);
const r6Db = await pg.query(`SELECT is_flagged, is_visible FROM reviews WHERE id=$1`, [r6.body?.data?.id]);
check(r6Db.rows[0]?.is_flagged === true, 'is_flagged=TRUE');
check(r6Db.rows[0]?.is_visible === false, 'is_visible=FALSE (hidden)');

// Hidden review excluded from aggregate
const provAfter6 = await pg.query(`SELECT rating FROM providers WHERE id=$1`, [providerId]);
check(Number(provAfter6.rows[0].rating) === 4,
  `aggregate still 4.00 (flagged review excluded)`,
  `got ${provAfter6.rows[0].rating}`);

// ════════════════════════════════════════════════════════════════════
// 7. Phone number → flagged
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Phone number in review → flagged ===');
const r7 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed4, rating: 5,
  comment: 'Great service! Call me at +639171234567 for direct bookings.',
});
check(r7.status === 201, `r7 → 201 (got ${r7.status})`);
const r7Db = await pg.query(`SELECT is_flagged FROM reviews WHERE id=$1`, [r7.body?.data?.id]);
check(r7Db.rows[0]?.is_flagged === true, 'phone-number review flagged');

// ════════════════════════════════════════════════════════════════════
// 8. Tags allowlist enforced (validator rejects unknown tags)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Tags allowlist enforced at validator ===');
// Validator uses z.array(z.enum(ALLOWED_TAGS)) so unknown tags → 400.
const r8a = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed5, rating: 4,
  comment: 'Phase 27b — unknown tag should be rejected at validation layer.',
  tags: ['professional', 'malicious_tag'],
});
check(r8a.status === 400, `unknown tag → 400 (got ${r8a.status})`);

// Valid request with only allowed tags → 201, tags preserved
const r8b = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed5, rating: 4,
  comment: 'Phase 27b — only allowed tags should pass through cleanly.',
  tags: ['professional', 'punctual', 'great_value'],
});
check(r8b.status === 201, `allowed tags → 201 (got ${r8b.status})`);
const r8Db = await pg.query(`SELECT tags FROM reviews WHERE id=$1`, [r8b.body?.data?.id]);
const tags = r8Db.rows[0]?.tags ?? [];
check(tags.length === 3 && tags.includes('professional') && tags.includes('punctual'),
  'allowed tags persisted', JSON.stringify(tags));

// ════════════════════════════════════════════════════════════════════
// 9. Provider responds once → 409 on second attempt
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Provider responds to review ===');
const resp1 = await call(PROV_TOKEN, 'POST', `/api/v1/reviews/${review1Id}/response`, {
  response: 'Phase 27b — thank you for your kind review, looking forward to serving you again.',
});
check([200, 201].includes(resp1.status), `provider response → 2xx (got ${resp1.status})`,
  JSON.stringify(resp1.body).slice(0,200));

const resp2 = await call(PROV_TOKEN, 'POST', `/api/v1/reviews/${review1Id}/response`, {
  response: 'Phase 27b — second response attempt should fail with 409.',
});
check(resp2.status === 409, `second response → 409 (got ${resp2.status})`);

// ════════════════════════════════════════════════════════════════════
// 10. GET /reviews/provider/:id returns aggregate + reviews
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. GET /reviews/provider/:id ===');
const list = await call(null, 'GET', `/api/v1/reviews/provider/${providerId}`);
check(list.status === 200, `→ 200 (got ${list.status})`);
check(Array.isArray(list.body?.data), 'data is array');
check(list.body?.aggregate !== undefined, 'aggregate object present');

// ════════════════════════════════════════════════════════════════════
// 11. GET /reviews/booking/:id
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. GET /reviews/booking/:id ===');
const bkRev = await call(CUST_TOKEN, 'GET', `/api/v1/reviews/booking/${bkConfirmed}`);
check(bkRev.status === 200, `→ 200 (got ${bkRev.status})`);
check(bkRev.body?.data?.id === review1Id, 'returns the right review');

// ════════════════════════════════════════════════════════════════════
// 12. Comment > 2000 chars rejected
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Comment > 2000 chars → 400 ===');
const r12 = await call(CUST_TOKEN, 'POST', '/api/v1/reviews', {
  bookingId: bkConfirmed6, rating: 4,
  comment: 'a'.repeat(2500),
});
check(r12.status === 400, `→ 400 (got ${r12.status})`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
const bookings = [bkConfirmed, bkConfirmed2, bkConfirmed3, bkConfirmed4, bkConfirmed5, bkConfirmed6, bkInProgress];
await pg.query(`DELETE FROM review_images WHERE review_id IN (SELECT id FROM reviews WHERE booking_id = ANY($1))`, [bookings]);
await pg.query(`DELETE FROM reviews WHERE booking_id = ANY($1)`, [bookings]);
await pg.query(`DELETE FROM bookings WHERE id = ANY($1)`, [bookings]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [customerId, otherId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
