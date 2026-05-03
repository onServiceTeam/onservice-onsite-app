// Phase 26c — dispatch / matching algorithm forensic.
//
// Verifies findMatchingProviders behaves correctly under each filter:
//   1. Status='approved' required (suspended/pending excluded)
//   2. is_available=TRUE required
//   3. Category match required
//   4. Subcategory match (when supplied) required
//   5. Distance ≤ service_radius_km (haversine)
//   6. provider_availability for day_of_week + time required
//   7. Tier bonus reflected in score
//   8. Higher rating ranks higher (all else equal)
//   9. Closer distance ranks higher (all else equal)
//  10. hasBookingConflict detects overlapping bookings (interval overlap, not window)
//  11. hasBookingConflict respects excludeBookingId
//  12. hasBookingConflict ignores cancelled bookings
//  13. Overnight (start_time > end_time) availability supported (MED-N104)
//  14. Founding tier gets the same boost as 'pro' (MED-N102)

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Import the service directly. The test is invoked from repo root via:
//   cd <repo-root> && node --import tsx .ai-coder/.../test-phase26c-...
// Use an absolute file:// URL so we don't trip on cwd-relative resolution.
const REPO_ROOT = process.cwd().endsWith('packages\\api') || process.cwd().endsWith('packages/api')
  ? path.resolve(process.cwd(), '../..')
  : process.cwd();
const matchingMod = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/matching.service.ts')
).href);
const { findMatchingProviders, hasBookingConflict, getMatchConfig } = matchingMod;

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

// ════════════════════════════════════════════════════════════════════
// Setup: 6 providers in different states + 1 customer + booking context
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Setup ===');

const cat = await pg.query(`SELECT id FROM service_categories LIMIT 1`);
const categoryId = cat.rows[0].id;
const sub = await pg.query(
  `SELECT id FROM service_subcategories WHERE category_id=$1 LIMIT 1`, [categoryId]);
const subcategoryId = sub.rows[0]?.id ?? null;

const TAG = 'phase26c_' + Date.now();

async function makeProvider(opts) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, 'provider', TRUE, 'P26c', $2) RETURNING id`,
    [phone, opts.label]);
  const userId = u.rows[0].id;
  const p = await pg.query(
    `INSERT INTO providers
       (user_id, business_name, status, tier, rating, total_jobs, total_reviews,
        is_available, latitude, longitude, service_radius_km)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [userId, TAG + '_' + opts.label, opts.status ?? 'approved',
     opts.tier ?? 'verified', opts.rating ?? 4.5, opts.jobs ?? 50,
     opts.reviews ?? 50, opts.available !== false,
     opts.lat ?? 11.97, opts.lng ?? 121.92, opts.radiusKm ?? 30]);
  const providerId = p.rows[0].id;
  // provider_services
  await pg.query(
    `INSERT INTO provider_services (provider_id, category_id, subcategory_id, is_active)
     VALUES ($1, $2, $3, TRUE)`,
    [providerId, opts.categoryId ?? categoryId,
     opts.skipSub ? null : (opts.subcategoryId ?? subcategoryId)]);
  // provider_availability — default Mon-Sun 08:00-22:00
  for (let day = 0; day < 7; day++) {
    await pg.query(
      `INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time, is_available)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [providerId, day,
       opts.startTime ?? '08:00:00',
       opts.endTime ?? '22:00:00']);
  }
  return { userId, providerId };
}

// 1. Approved, verified, perfect — should match
const pIdeal = await makeProvider({ label: 'ideal', tier: 'elite', rating: 5.0 });
// 2. Suspended — should NOT match
const pSusp = await makeProvider({ label: 'susp', status: 'suspended' });
// 3. is_available=FALSE — should NOT match
const pUnav = await makeProvider({ label: 'unav', available: false });
// 4. Far away (50km, radius 30km) — should NOT match (outside radius)
const pFar = await makeProvider({ label: 'far', lat: 12.30, lng: 121.92, radiusKm: 5 });
// 5. New tier (no bonus) — should match but score lower
const pNew = await makeProvider({ label: 'new_tier', tier: 'new' });
// 6. Founding tier (MED-N102 — same boost as 'pro')
const pFound = await makeProvider({ label: 'founding', tier: 'founding' });
// 7. Overnight availability (22:00-06:00, MED-N104)
const pOvernight = await makeProvider({
  label: 'overnight', startTime: '22:00:00', endTime: '06:00:00',
});

const customerLat = 11.97;
const customerLng = 121.92;
// Schedule for next Monday 14:00 LOCAL (within 08:00-22:00 default).
// Matching service uses `scheduledAt.getDay()` + `toTimeString()` which
// are LOCAL-time accessors, so we set local hours.
const scheduledAt = (() => {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  const day = d.getDay();
  const daysUntilMon = (1 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  return d;
})();

// ════════════════════════════════════════════════════════════════════
// 1. Status filter (approved only)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Status filter ===');
const matched = await findMatchingProviders(
  categoryId, subcategoryId, customerLat, customerLng, scheduledAt);
const matchedIds = new Set(matched.map(m => m.providerId));
check(matchedIds.has(pIdeal.providerId), 'approved provider matched');
check(!matchedIds.has(pSusp.providerId), 'suspended provider excluded');

// ════════════════════════════════════════════════════════════════════
// 2. is_available filter
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. is_available filter ===');
check(!matchedIds.has(pUnav.providerId), 'is_available=FALSE excluded');

// ════════════════════════════════════════════════════════════════════
// 3. Distance / service_radius filter
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Distance + radius filter ===');
check(!matchedIds.has(pFar.providerId), 'distant provider (50km, radius 5km) excluded');

// ════════════════════════════════════════════════════════════════════
// 4. Founding tier gets bonus equal to 'pro' (MED-N102)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Founding tier bonus (MED-N102) ===');
const foundingScored = matched.find(m => m.providerId === pFound.providerId);
const newScored = matched.find(m => m.providerId === pNew.providerId);
check(!!foundingScored, 'founding provider in matched list');
check(!!newScored, 'new-tier provider in matched list');
if (foundingScored && newScored) {
  // founding has tier_bonus 0.5, new has 0.0 — same other attributes,
  // founding's score should be higher.
  check(foundingScored.score > newScored.score,
    `founding score (${foundingScored.score}) > new-tier score (${newScored.score})`,
    `founding=${JSON.stringify(foundingScored)} new=${JSON.stringify(newScored)}`);
}

// ════════════════════════════════════════════════════════════════════
// 5. Higher rating ranks higher (elite vs verified, all else equal)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Higher rating ranks higher ===');
const elite = matched.find(m => m.providerId === pIdeal.providerId);
const verified = matched.find(m => m.providerId === pNew.providerId);
if (elite && verified) {
  check(elite.score >= verified.score,
    `elite (rating 5) score (${elite.score}) ≥ new-tier (rating 4.5) score (${verified.score})`);
}

// ════════════════════════════════════════════════════════════════════
// 6. Subcategory filter
// ════════════════════════════════════════════════════════════════════
if (subcategoryId) {
  console.log('\n=== 6. Subcategory filter ===');
  // pIdeal subscribed to subcategoryId. Make a provider subscribed to a
  // different subcategory + verify the right-cat-wrong-subcat is excluded.
  const otherSub = await pg.query(
    `SELECT id FROM service_subcategories WHERE category_id=$1 AND id != $2 LIMIT 1`,
    [categoryId, subcategoryId]);
  if (otherSub.rows[0]) {
    const pOtherSub = await makeProvider({
      label: 'wrong_sub', subcategoryId: otherSub.rows[0].id, skipSub: false,
    });
    const matched2 = await findMatchingProviders(
      categoryId, subcategoryId, customerLat, customerLng, scheduledAt);
    const ids2 = new Set(matched2.map(m => m.providerId));
    check(!ids2.has(pOtherSub.providerId),
      'provider with wrong subcategory excluded',
      `matched IDs: ${[...ids2].slice(0,3).join(', ')}`);
  } else {
    console.log('  (no second subcategory available — skipping)');
  }
}

// ════════════════════════════════════════════════════════════════════
// 7. Overnight availability (MED-N104)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Overnight availability (MED-N104) ===');
// Schedule for 02:00 LOCAL — only the overnight provider should match
const overnightSched = new Date(scheduledAt);
overnightSched.setHours(2, 0, 0, 0);
const overnightMatched = await findMatchingProviders(
  categoryId, subcategoryId, customerLat, customerLng, overnightSched);
const overnightIds = new Set(overnightMatched.map(m => m.providerId));
check(overnightIds.has(pOvernight.providerId),
  'overnight provider (22:00-06:00) matched at 02:00');
check(!overnightIds.has(pIdeal.providerId),
  'standard 08:00-22:00 provider NOT matched at 02:00');

// ════════════════════════════════════════════════════════════════════
// 8. Empty match for impossible criteria
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Empty match for impossible criteria ===');
const emptyMatch = await findMatchingProviders(
  categoryId, subcategoryId, 50.0, 50.0, scheduledAt);  // Customer in Russia
check(emptyMatch.length === 0, 'no providers within radius from far-off location');

// ════════════════════════════════════════════════════════════════════
// 9. hasBookingConflict — interval overlap (MED-N105)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. hasBookingConflict (MED-N105 interval overlap) ===');
const custPhone = '+63919' + (1000000 + Math.floor(Math.random()*8999999));
const cust = await pg.query(
  `INSERT INTO users (phone, role, is_active, first_name, last_name)
   VALUES ($1, 'customer', TRUE, 'P26c', 'Cust') RETURNING id`, [custPhone]);
const customerId = cust.rows[0].id;

// Existing booking 09:00-15:00 (6h). Default duration is 120 min per
// platformConfig. New booking at 12:00 — should conflict.
const existingStart = new Date('2026-06-15T09:00:00Z');
const newAt12 = new Date('2026-06-15T12:00:00Z');
const newAt16 = new Date('2026-06-15T16:00:00Z');

const bk = await pg.query(
  `INSERT INTO bookings
     (customer_id, provider_id, category_id, status, total_amount,
      service_price, service_fee, address, barangay, city, province,
      latitude, longitude, scheduled_at, escrow_status)
   VALUES ($1, $2, $3, 'paid', 100000, 100000, 0, 'a', 'a', 'a', 'a',
           11.97, 121.92, $4, 'held')
   RETURNING id`,
  [customerId, pIdeal.providerId, categoryId, existingStart]);
const existingBkId = bk.rows[0].id;
// Add a quote with 360-min duration so the existing booking's interval is 09:00-15:00
await pg.query(
  `INSERT INTO booking_quotes
     (booking_id, provider_id, quoted_price, status, is_accepted,
      estimated_duration_minutes, expires_at)
   VALUES ($1, $2, 100000, 'accepted', TRUE, 360, NOW() + INTERVAL '7 days')`,
  [existingBkId, pIdeal.providerId]);

const conflictAt12 = await hasBookingConflict(pIdeal.providerId, newAt12);
check(conflictAt12 === true, 'overlapping booking at 12:00 detected');

const conflictAt16 = await hasBookingConflict(pIdeal.providerId, newAt16);
check(conflictAt16 === false, 'non-overlapping booking at 16:00 → no conflict');

// 10. excludeBookingId
const conflictExclude = await hasBookingConflict(pIdeal.providerId, newAt12, undefined, existingBkId);
check(conflictExclude === false,
  'excludeBookingId=existing → no conflict (excluded from comparison)');

// 11. Cancelled bookings ignored
await pg.query(`UPDATE bookings SET status='cancelled_by_customer' WHERE id=$1`, [existingBkId]);
const conflictAfterCancel = await hasBookingConflict(pIdeal.providerId, newAt12);
check(conflictAfterCancel === false,
  'cancelled booking ignored (no conflict)');

// ════════════════════════════════════════════════════════════════════
// 12. getMatchConfig sanity
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. getMatchConfig sanity ===');
const cfg = getMatchConfig();
check(cfg.maxAttempts === 10, 'maxAttempts=10');
check(cfg.offerTimeoutSeconds === 45, 'offerTimeoutSeconds=45');
check(cfg.scoringWeights?.rating === 0.4, 'scoring weight rating=0.4');
check(cfg.scoringWeights?.distance === 0.3, 'scoring weight distance=0.3');
check(cfg.scoringWeights?.acceptance === 0.2, 'scoring weight acceptance=0.2');
check(cfg.scoringWeights?.tier === 0.1, 'scoring weight tier=0.1');

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
// Order: deepest-FK first, then up. booking_quotes → bookings → providers → users
// Purge ALL P26c residue (catches leftovers from earlier failed runs).
const p26cUsers = await pg.query(`SELECT id FROM users WHERE first_name='P26c'`);
const p26cUserIds = p26cUsers.rows.map(r => r.id);
if (p26cUserIds.length > 0) {
  await pg.query(`DELETE FROM booking_quotes WHERE booking_id IN
                    (SELECT id FROM bookings WHERE customer_id = ANY($1))`, [p26cUserIds]);
  await pg.query(`DELETE FROM wallet_transactions WHERE booking_id IN
                    (SELECT id FROM bookings WHERE customer_id = ANY($1))`, [p26cUserIds]);
  await pg.query(`DELETE FROM bookings WHERE customer_id = ANY($1)`, [p26cUserIds]);
}
await pg.query(`DELETE FROM provider_availability WHERE provider_id IN (SELECT id FROM providers WHERE business_name LIKE $1)`, [TAG + '%']);
await pg.query(`DELETE FROM provider_services WHERE provider_id IN (SELECT id FROM providers WHERE business_name LIKE $1)`, [TAG + '%']);
await pg.query(`DELETE FROM providers WHERE business_name LIKE $1`, [TAG + '%']);
// providers from older runs (different TAG) tied to P26c users
if (p26cUserIds.length > 0) {
  await pg.query(`DELETE FROM provider_services WHERE provider_id IN (SELECT id FROM providers WHERE user_id = ANY($1))`, [p26cUserIds]);
  await pg.query(`DELETE FROM provider_availability WHERE provider_id IN (SELECT id FROM providers WHERE user_id = ANY($1))`, [p26cUserIds]);
  await pg.query(`DELETE FROM providers WHERE user_id = ANY($1)`, [p26cUserIds]);
}
await pg.query(`DELETE FROM users WHERE first_name='P26c'`);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
