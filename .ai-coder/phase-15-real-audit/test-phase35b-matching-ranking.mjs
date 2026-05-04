// Phase 35b — matching algorithm ranking assertions.
//
// Assertions on the actual scoring weights:
//   score = (rating/5)*0.4 + (1 - dist/maxDist)*0.3 + acceptance*0.2 + tier_bonus*0.1
//
// Setup: 5 providers in same category, varied attributes. Verify:
//   1. Matching only returns approved + available providers
//   2. Out-of-radius providers excluded
//   3. Wrong day-of-week providers excluded (overnight wrap not tested
//      here, but same-day blocking IS)
//   4. Higher rating → higher score (all else equal)
//   5. Closer distance → higher score (all else equal)
//   6. Higher tier → higher score (all else equal)
//   7. Top-ranked has highest score
//   8. Overnight schedule (start>end) — provider working 22:00-06:00
//      is matchable at 03:00
//   9. Result count capped at MAX_MATCH_ATTEMPTS (10)
//  10. Scores are deterministic (same inputs = same scores)

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const REPO_ROOT = process.cwd();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

const matchingSvc = await import(pathToFileURL(
  path.resolve(REPO_ROOT, 'packages/api/src/services/matching.service.ts')
).href);

// Setup category + subcategory
const catSlug = `p35b-${Date.now()}`;
const cat = await pg.query(
  `INSERT INTO service_categories (name, slug, description)
   VALUES ($1, $2, 'P35b matching test') RETURNING id`,
  [`P35b-${Date.now()}`, catSlug]);
const categoryId = cat.rows[0].id;

const sub = await pg.query(
  `INSERT INTO service_subcategories (name, slug, category_id, base_price)
   VALUES ($1, $2, $3, 100000) RETURNING id`,
  [`P35b Sub-${Date.now()}`, `${catSlug}-sub`, categoryId]);
const subcategoryId = sub.rows[0].id;
void subcategoryId;

// Customer reference point (Boracay center)
const CUST_LAT = 11.97;
const CUST_LNG = 121.93;

// Providers — all in radius, same category, varied attrs.
// Schedule: weekdays 08:00-18:00 (so a query at noon Wed works)
async function makeProvider(label, opts) {
  const phone = '+63917' + (1000000 + Math.floor(Math.random()*8999999));
  const u = await pg.query(
    `INSERT INTO users (phone, role, is_active, first_name, last_name)
     VALUES ($1, 'provider', TRUE, 'P35b', $2) RETURNING id`,
    [phone, label]);
  const userId = u.rows[0].id;
  const p = await pg.query(
    `INSERT INTO providers
       (user_id, business_name, status, tier, rating, total_jobs, total_reviews,
        latitude, longitude, service_radius_km, is_available)
     VALUES ($1, $2, 'approved', $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [userId, label, opts.tier, opts.rating, opts.totalJobs ?? 100,
     opts.totalReviews ?? 80, opts.lat, opts.lng, opts.radius ?? 15,
     opts.isAvailable ?? true]);
  const providerId = p.rows[0].id;

  await pg.query(
    `INSERT INTO provider_services (provider_id, category_id, is_active)
     VALUES ($1, $2, TRUE)`, [providerId, categoryId]);

  if (opts.scheduleDays !== false) {
    // Default: weekdays 08:00-18:00
    const days = opts.scheduleDays ?? [1,2,3,4,5];
    const start = opts.scheduleStart ?? '08:00:00';
    const end = opts.scheduleEnd ?? '18:00:00';
    for (const dow of days) {
      await pg.query(
        `INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1, $2, $3::time, $4::time, TRUE)`,
        [providerId, dow, start, end]);
    }
  }
  return { userId, providerId };
}

// Use a real Wednesday at noon for consistent scheduling
function nextWednesdayNoon() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((10 - d.getUTCDay()) % 7 || 7));
  d.setUTCHours(4, 0, 0, 0); // 04:00 UTC = 12:00 PHT
  return d;
}
const SCHED = nextWednesdayNoon();

// Provider A: rating=5, tier=elite, very close (0.5km)
const A = await makeProvider('Top-A', { rating: 5.0, tier: 'elite',
  lat: CUST_LAT + 0.005, lng: CUST_LNG + 0.005, totalJobs: 200, totalReviews: 100 });
// Provider B: rating=4.0, tier=verified, mid (3km)
const B = await makeProvider('Mid-B', { rating: 4.0, tier: 'verified',
  lat: CUST_LAT + 0.027, lng: CUST_LNG + 0.027, totalJobs: 100, totalReviews: 80 });
// Provider C: rating=3.0, tier=new, far but within radius (10km)
const C = await makeProvider('Far-C', { rating: 3.0, tier: 'new',
  lat: CUST_LAT + 0.090, lng: CUST_LNG + 0.090, totalJobs: 30, totalReviews: 50 });
// Provider D: rating=4.0, tier=verified, OUT of radius (50km away from cust;
//   but D's own radius is only 5km, so it should be excluded)
const D = await makeProvider('OutOfRadius-D', { rating: 4.0, tier: 'verified',
  lat: CUST_LAT + 0.5, lng: CUST_LNG + 0.5, radius: 5, totalJobs: 50 });
// Provider E: rating=5, tier=elite, but is_available=FALSE
const E = await makeProvider('Unavailable-E', { rating: 5.0, tier: 'elite',
  lat: CUST_LAT + 0.001, lng: CUST_LNG + 0.001, isAvailable: false });
// Provider F: rating=5, tier=elite, but only schedules Sunday
const F = await makeProvider('WrongDay-F', { rating: 5.0, tier: 'elite',
  lat: CUST_LAT + 0.001, lng: CUST_LNG + 0.001, scheduleDays: [0] });
// Provider G: rating=4, overnight schedule 22:00-06:00 every day
const G = await makeProvider('Overnight-G', { rating: 4.5, tier: 'verified',
  lat: CUST_LAT + 0.005, lng: CUST_LNG + 0.005,
  scheduleDays: [0,1,2,3,4,5,6],
  scheduleStart: '22:00:00', scheduleEnd: '06:00:00' });

// ════════════════════════════════════════════════════════════════════
// 1-3. Filtering: only approved+available, in radius, on schedule
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1-3. Filtering (approved+available, in radius, on schedule) ===');
const matches = await matchingSvc.findMatchingProviders(
  categoryId, null, CUST_LAT, CUST_LNG, SCHED);

const matchedIds = new Set(matches.map(m => m.providerId));
check(matchedIds.has(A.providerId), 'Top-A matched');
check(matchedIds.has(B.providerId), 'Mid-B matched');
check(matchedIds.has(C.providerId), 'Far-C matched (within radius)');
check(!matchedIds.has(D.providerId), `Out-of-radius D excluded (distance > D's 5km radius)`);
check(!matchedIds.has(E.providerId), 'Unavailable E excluded');
check(!matchedIds.has(F.providerId), 'Wrong-day F excluded (only Sunday schedule)');

// ════════════════════════════════════════════════════════════════════
// 4-7. Score ordering: A (5★ elite, closest) should top the list
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4-7. Score ordering ===');
const aScore = matches.find(m => m.providerId === A.providerId)?.score;
const bScore = matches.find(m => m.providerId === B.providerId)?.score;
const cScore = matches.find(m => m.providerId === C.providerId)?.score;
check(aScore > bScore, `A (${aScore}) > B (${bScore}) — better rating + closer + higher tier`);
check(bScore > cScore, `B (${bScore}) > C (${cScore})`);
check(matches[0].providerId === A.providerId, `top-ranked is A (got ${matches[0].businessName})`);

// ════════════════════════════════════════════════════════════════════
// 8. Overnight schedule — provider G should match at 03:00 PHT
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Overnight schedule (start > end wraps midnight) ===');
const SCHED_3AM = new Date(SCHED.getTime());
SCHED_3AM.setUTCHours(19, 0, 0, 0); // 19:00 UTC = 03:00 next-day PHT
const matchesAt3am = await matchingSvc.findMatchingProviders(
  categoryId, null, CUST_LAT, CUST_LNG, SCHED_3AM);
const at3amIds = new Set(matchesAt3am.map(m => m.providerId));
check(at3amIds.has(G.providerId),
  `Overnight-G matched at 03:00 PHT (MED-N104 wrap support, count=${matchesAt3am.length})`);
// A/B/C work 08:00-18:00 so they should NOT match at 03:00
check(!at3amIds.has(A.providerId), 'A (08-18) excluded at 03:00');

// ════════════════════════════════════════════════════════════════════
// 9. Cap at MAX_MATCH_ATTEMPTS=10 (we only have 7 candidates so just
//    verify the cap exists by checking < 11)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 9. MAX_MATCH_ATTEMPTS cap ===');
check(matches.length <= 10, `result count <=10 (got ${matches.length})`);

// ════════════════════════════════════════════════════════════════════
// 10. Determinism — same inputs, same scores
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Determinism ===');
const matches2 = await matchingSvc.findMatchingProviders(
  categoryId, null, CUST_LAT, CUST_LNG, SCHED);
const sameOrder = matches.every((m, i) => matches2[i]?.providerId === m.providerId);
const sameScores = matches.every((m, i) => Math.abs(matches2[i]?.score - m.score) < 0.001);
check(sameOrder, 'identical ordering on repeat call');
check(sameScores, 'identical scores on repeat call');

// ════════════════════════════════════════════════════════════════════
// 11. score formula sanity — A should be very close to theoretical
//     max (top of every component): rating*0.4 + dist*0.3 + accept*0.2
//     + tier*0.1. Acceptance for A = 200/(200+100) = 0.667.
//     ratingScore = 1.0*0.4 = 0.4
//     distanceScore varies by maxDistance in batch
//     acceptanceScore = 0.667*0.2 = 0.133
//     tierScore (elite from default tierBonus 1.0) = 0.1
//     A's score should be in [0.55, 0.85] depending on dist normalization
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Score in expected range ===');
// A's max possible: rating 1.0*0.4 + dist 1.0*0.3 + accept (200/300=0.667)*0.2 + tier 1.0*0.1 = 0.933
check(aScore > 0.5 && aScore <= 0.95,
  `A score in [0.5, 0.95] range (got ${aScore})`);
check(matches.every(m => m.score >= 0 && m.score <= 1),
  `all scores in [0, 1]`);

// ════════════════════════════════════════════════════════════════════
// 12. Per-provider distanceKm matches haversine roughly
//     (0.005° ~ 555m at 12°N, so A's distance should be ~0.7km)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 12. distanceKm sanity ===');
const aDistance = matches.find(m => m.providerId === A.providerId)?.distanceKm;
check(aDistance > 0 && aDistance < 1.5,
  `A distance ~0.5-1.5km (got ${aDistance}km)`);

// ════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════
console.log('\n=== Cleanup ===');
const allUserIds = [A,B,C,D,E,F,G].map(p => p.userId);
const allProviderIds = [A,B,C,D,E,F,G].map(p => p.providerId);
await pg.query(`DELETE FROM provider_availability WHERE provider_id = ANY($1)`, [allProviderIds]);
await pg.query(`DELETE FROM provider_services WHERE provider_id = ANY($1)`, [allProviderIds]);
await pg.query(`DELETE FROM providers WHERE id = ANY($1)`, [allProviderIds]);
await pg.query(`DELETE FROM service_subcategories WHERE id=$1`, [subcategoryId]);
await pg.query(`DELETE FROM service_categories WHERE id=$1`, [categoryId]);
await pg.query(`DELETE FROM users WHERE id = ANY($1)`, [allUserIds]);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

await pg.end();
process.exit(fail === 0 ? 0 : 1);
