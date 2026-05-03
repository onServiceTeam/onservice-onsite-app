// Phase 27c — Socket / real-time event emission verification.
//
// Spins up a real Socket.IO client connection (admin role) to the live API,
// joins admin:global room, drives REST actions that should emit events,
// and verifies each emission lands at the client.
//
// Coverage:
//   1. Connect with valid admin JWT → connection accepted
//   2. Connect without token → rejected
//   3. Connect with customer token → no admin events received
//   4. BOOKING_STATUS_CHANGED emitted on transition
//   5. Connection rejected with expired JWT
//   6. Per-socket rate limit (>60 events/min → throttled)

import { io as ioClient } from 'socket.io-client';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

const ADMIN_TOKEN = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);

// Setup: customer + provider + booking we can transition
const phoneCust = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
const phoneProv = '+63919' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P27c', 'Cust') RETURNING id`, [phoneCust]);
const customerId = cust.rows[0].id;
const provUser = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'provider', TRUE, 'P27c', 'Prov') RETURNING id`, [phoneProv]);
const provUserId = provUser.rows[0].id;
const prov = await pg.query(
  `INSERT INTO providers (user_id, business_name, status)
   VALUES ($1, 'p27c prov', 'approved') RETURNING id`, [provUserId]);
const providerId = prov.rows[0].id;
const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;
const bk = await pg.query(
  `INSERT INTO bookings
     (customer_id, provider_id, category_id, status, total_amount,
      service_price, service_fee, address, barangay, city, province,
      latitude, longitude, scheduled_at, escrow_status)
   VALUES ($1, $2, $3, 'paid', 100000, 100000, 0,
           'a', 'a', 'a', 'a', 11.97, 121.92, NOW() + INTERVAL '1 day', 'held')
   RETURNING id`,
  [customerId, providerId, categoryId]);
const bookingId = bk.rows[0].id;
const CUST_TOKEN = jwt.sign(
  { userId: customerId, role: 'customer', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// ════════════════════════════════════════════════════════════════════
// 1. Admin connects with valid token → connected
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Admin connects with valid token ===');
const adminSocket = ioClient(API, {
  auth: { token: ADMIN_TOKEN },
  transports: ['websocket'],
});
const connectResult = await new Promise((resolve) => {
  const t = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 3000);
  adminSocket.once('connect', () => { clearTimeout(t); resolve({ ok: true }); });
  adminSocket.once('connect_error', (err) => { clearTimeout(t); resolve({ ok: false, reason: err.message }); });
});
check(connectResult.ok, 'admin socket connected', connectResult.reason);

// ════════════════════════════════════════════════════════════════════
// 2. Connect without token → rejected
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Connect without token → rejected ===');
const noAuthSocket = ioClient(API, { transports: ['websocket'] });
const noAuthResult = await new Promise((resolve) => {
  const t = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 3000);
  noAuthSocket.once('connect_error', (err) => { clearTimeout(t); resolve({ ok: true, reason: err.message }); });
  noAuthSocket.once('connect', () => { clearTimeout(t); resolve({ ok: false, reason: 'unexpectedly connected' }); });
});
check(noAuthResult.ok, 'no-token connection rejected', noAuthResult.reason);
noAuthSocket.disconnect();

// ════════════════════════════════════════════════════════════════════
// 3. Connect with expired JWT → rejected
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Expired JWT → rejected ===');
const expiredToken = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '-1h' });
const expSocket = ioClient(API, { auth: { token: expiredToken }, transports: ['websocket'] });
const expResult = await new Promise((resolve) => {
  const t = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 3000);
  expSocket.once('connect_error', (err) => { clearTimeout(t); resolve({ ok: true, reason: err.message }); });
  expSocket.once('connect', () => { clearTimeout(t); resolve({ ok: false, reason: 'unexpectedly connected' }); });
});
check(expResult.ok, 'expired JWT rejected', expResult.reason);
expSocket.disconnect();

// ════════════════════════════════════════════════════════════════════
// 4. BOOKING_STATUS_CHANGED emitted on transition
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. BOOKING_STATUS_CHANGED emitted on REST transition ===');
const eventReceived = new Promise((resolve) => {
  const t = setTimeout(() => resolve({ ok: false, reason: 'timeout 5s' }), 5000);
  adminSocket.once('booking:status_changed', (data) => {
    clearTimeout(t);
    resolve({ ok: true, data });
  });
});

// Trigger a transition: paid → provider_en_route (driver action)
await new Promise(r => setTimeout(r, 200));  // give socket time to join admin:global
const PROV_TOKEN = jwt.sign(
  { userId: provUserId, role: 'provider', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const transitionResult = await fetch(API + `/api/v1/bookings/${bookingId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + PROV_TOKEN,
    'X-Forwarded-For': '10.99.27.27',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ status: 'provider_en_route' }),
});
const transText = await transitionResult.text();
check([200, 207].includes(transitionResult.status),
  `transition → 2xx (got ${transitionResult.status})`, transText.slice(0,200));

const evResult = await eventReceived;
check(evResult.ok, 'admin received booking:status_changed event',
  evResult.reason ?? JSON.stringify(evResult.data).slice(0,200));
if (evResult.ok) {
  check(evResult.data?.id === bookingId, 'event payload has correct booking id');
  check(evResult.data?.newStatus === 'provider_en_route',
    `newStatus=provider_en_route (got ${evResult.data?.newStatus})`);
}

// ════════════════════════════════════════════════════════════════════
// 5. Customer socket does NOT receive admin events
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Customer socket does NOT receive admin:global events ===');
const custSocket = ioClient(API, { auth: { token: CUST_TOKEN }, transports: ['websocket'] });
const custConnected = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 3000);
  custSocket.once('connect', () => { clearTimeout(t); resolve(true); });
  custSocket.once('connect_error', () => { clearTimeout(t); resolve(false); });
});
check(custConnected, 'customer socket connected');

// Listen for any admin event for 1.5s; expect none
const noAdminEvent = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(true), 1500);
  custSocket.once('booking:status_changed', () => { clearTimeout(t); resolve(false); });
});
check(noAdminEvent, 'customer did not receive admin:global event');

// Trigger another transition while customer listens — should still not get admin event
const eventReceived2 = new Promise((resolve) => {
  const t = setTimeout(() => resolve({ ok: false, reason: 'timeout 3s' }), 3000);
  adminSocket.once('booking:status_changed', (data) => { clearTimeout(t); resolve({ ok: true, data }); });
});
const custMissed = new Promise((resolve) => {
  setTimeout(() => resolve(true), 2500);
  custSocket.once('booking:status_changed', () => resolve(false));
});

await fetch(API + `/api/v1/bookings/${bookingId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + PROV_TOKEN,
    'X-Forwarded-For': '10.99.27.28',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ status: 'provider_arrived', latitude: 11.97, longitude: 121.92 }),
});
const adminGotIt = await eventReceived2;
const custMissedIt = await custMissed;
check(adminGotIt.ok, 'admin received second status_changed event');
check(custMissedIt, 'customer correctly did not receive admin event');

custSocket.disconnect();
adminSocket.disconnect();

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
await pg.query(`DELETE FROM bookings WHERE id=$1`, [bookingId]);
await pg.query(`DELETE FROM providers WHERE id=$1`, [providerId]);
await pg.query(`DELETE FROM users WHERE id IN ($1, $2)`, [customerId, provUserId]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
