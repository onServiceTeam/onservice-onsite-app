# Audit 2026-05-01 — Phase N Batch 17 — provider.routes, auth.service, checklist, matching

**Status:** 4 files fully read line-by-line, ~1,749 lines covered.

## Files fully read (4 files, 1,749 lines)

| File | Lines |
|---|---:|
| packages/api/src/routes/provider.routes.ts | 735 |
| packages/api/src/services/auth.service.ts | 387 |
| packages/api/src/services/checklist.service.ts | 382 |
| packages/api/src/services/matching.service.ts | 245 |

## NEW CRITICAL findings (1)

### CRIT-N12 — auth.service stores OTP codes PLAINTEXT in DB

**Where found:** packages/api/src/services/auth.service.ts:196-199, 242

```ts
await db.query(
  `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
  [phone, otp, expiresAt],   // <-- plaintext OTP stored
);
// ...
if (otpRecord.code !== code) { ... }
```

OTP codes are inserted into `otp_codes.code` as plaintext. If the database is compromised (read-only access via SQL injection, misconfigured backup, leaked snapshot), an attacker has all live OTP codes for the past 5 minutes. They can hijack any phone-number-based account that's mid-login.

Combined with the OTP delivery channel (SMS) being the *only* gate on customer/provider accounts (no passwords for non-admin), this is the highest-impact lateral-movement vector after a DB breach.

The compare at line 242 (`otpRecord.code !== code`) is also non-constant-time, leaking timing information about the first divergent character (low-impact; OTPs are 6 digits).

**Impact:**
- DB breach = mass account hijack window for active OTP TTL.
- Insider with read-only DB access can intercept OTPs.
- Backup leak (e.g., a stolen S3 snapshot) reveals all live OTPs at the time of snapshot.

**Fix:**
1. Hash OTP at write: `crypto.scryptSync(otp + phone, fixed_salt, 32).toString('hex')` or `bcrypt.hash(otp, 10)`. Phone-as-salt prevents rainbow table at scale.
2. At verify, hash incoming code the same way and use `crypto.timingSafeEqual` for comparison.
3. Migration to add `code_hash` column, dual-write during rollout, drop `code` column once mobile catches up.
4. Add a regression test that asserts the DB row never contains the plaintext OTP digits.

## NEW MEDIUM findings (12)

### MED-N92 — auth.service refreshAccessToken delete+insert NOT transactional

**Where:** auth.service.ts:330-353

```ts
await db.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
// ... SELECT user, sign new tokens ...
await db.query(`INSERT INTO refresh_tokens (...)`, ...);
```

If the INSERT fails after DELETE succeeds, the user has neither old nor new refresh token. They're forcibly logged out. Race condition more interesting: two simultaneous refresh calls — one succeeds, one DELETEs the now-recreated token. User logged out.

**Fix:** Wrap delete + select + insert in `db.transaction(async (client) => {...})`. Add a regression test that simulates concurrent refresh calls and asserts user remains authenticated.

### MED-N93 — auth.service sendOtp non-transactional invalidate-then-insert

**Where:** auth.service.ts:188-199

```ts
await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE phone = $1 AND is_used = FALSE`, [phone]);
// ... insert new OTP ...
```

If the INSERT fails (DB blip, statement timeout), prior OTPs are marked used and no new one exists. User stuck — must wait for cooldown.

**Fix:** Wrap in transaction.

### MED-N94 — auth.service OTP code comparison non-constant-time

**Where:** auth.service.ts:242

```ts
if (otpRecord.code !== code) { ... }
```

Direct string comparison short-circuits on first different char. While 6-digit OTP timing leak is low-severity (max 6 attempts to brute force one digit at a time, but the rate limit + max attempts cap this), best practice is `crypto.timingSafeEqual` after Buffer-conversion.

**Fix:** `crypto.timingSafeEqual(Buffer.from(otpRecord.code), Buffer.from(code))` with length pre-check (otpRecord.code.length === code.length).

### MED-N95 — auth.service signAccessToken/signRefreshToken throws at sign-time on missing JWT_SECRET

**Where:** auth.service.ts:131-146

If `process.env.JWT_SECRET` is missing in production, the throw fires on the first OTP-verify or admin-login attempt — not at server boot. Admin debugs why login is broken instead of catching the misconfiguration at startup.

**Fix:** Add startup-time validation in `server.ts` that fails to boot if `JWT_SECRET` is unset (or fewer than N bytes). Same pattern as recommended for CRIT-M04 (TOTP_ENCRYPTION_KEY) and MED-N66 (CAPTCHA_SECRET_KEY).

### MED-N96 — provider.routes GET /:id is unauthenticated

**Where:** packages/api/src/routes/provider.routes.ts:92-127

```ts
router.get('/:id', async (req: Request, res: Response, ...) => {
  // No authMiddleware
```

Returns provider's full profile including business_name, city, province, ratings, portfolio, certifications. This may be intentional (allow anonymous browsing for SEO/landing page), but exposes provider PII (city/province granularity could enable reverse-geocoding to specific addresses if combined with portfolio photo metadata).

**Fix:** Either (a) confirm intentional and document in a comment, OR (b) require authMiddleware and limit anonymous access to a smaller "public preview" projection (business_name, tier, average rating only).

### MED-N97 — provider.routes portfolio POST doesn't validate URL is HTTP/HTTPS (Bug 36/461/1224 family)

**Where:** provider.routes.ts:262-279

```ts
const { imageUrl, ... } = req.body;
if (!imageUrl || typeof imageUrl !== 'string') throw 400;
// No HTTP/HTTPS check
```

Booking photos validation (Bug 36/461/1224 fix) at booking.routes.ts:871-878 rejects file:// URIs. The same fix is NOT applied to portfolio photos. A provider can submit `imageUrl: 'file:///private/...'` and the broken URL stores in portfolio.

**Fix:** Apply the same validation pattern: `if (!/^https?:\/\//i.test(imageUrl)) throw createAppError('Invalid imageUrl ...', 400)`. Also rate-limit to 50 portfolio items max per provider.

### MED-N98 — provider.routes monthly-summary clamps year to ≤ current year

**Where:** provider.routes.ts:723-725

```ts
const year = Math.max(2024, Math.min(now.getFullYear(), Number(req.query.year) || now.getFullYear()));
```

Provider can't query historical years (e.g., year=2024 from a 2026 vantage point). They can ONLY query year≤2026 — but `Math.min(now.getFullYear(), input)` clamps DOWN, blocking future. The 2024 floor blocks BEFORE 2024. Together this means provider can only query years between 2024 and current-year. Acceptable but the message confusingly accepts `year=2024` when current year is 2026 — which is correct, so this is actually fine.

Re-reading: actually this works correctly. Withdrawing as a finding. (False alarm — annotated for future reviewers.)

### MED-N99 — provider.routes availability override missing validation

**Where:** provider.routes.ts:412-429

```ts
const { overrideDate, isAvailable, startTime, endTime, reason } = req.body;
if (!overrideDate || typeof overrideDate !== 'string') throw 400;
if (typeof isAvailable !== 'boolean') throw 400;
```

No validation that:
- `overrideDate` is a valid YYYY-MM-DD format or in the future
- `endTime > startTime` if both provided
- `reason` length cap (could be 10MB string)

**Fix:** Add Zod schema with `.regex(/^\d{4}-\d{2}-\d{2}$/)`, time format validation, and string length cap.

### MED-N100 — provider.routes instant availability toggle response uses input not server state

**Where:** provider.routes.ts:449-464

```ts
await providerService.toggleInstantAvailability(provider.id, isAvailable);
res.json({ success: true, data: { isAvailable } });   // <-- echoes input
```

If `toggleInstantAvailability` partially fails (e.g., updates only one row of multiple), response says `isAvailable: true` while server state is mixed. Should return server-computed value.

**Fix:** Have `toggleInstantAvailability` return the actual updated state, use that for response.

### MED-N101 — checklist.service serial INSERT loop for item snapshot

**Where:** packages/api/src/services/checklist.service.ts:165-173

```ts
for (const item of items.rows) {
  await client.query(`INSERT INTO booking_checklist_items ...`, [...]);
}
```

For a 50-item template, 50 sequential round-trips inside the transaction. Slows the provider's first checklist-open by ~500ms vs a single multi-row INSERT.

**Fix:** Build a single `INSERT INTO booking_checklist_items VALUES ($1,$2,...), ($N,$N+1,...) ...` from all rows.

### MED-N102 — matching.service TIER_BONUS missing 'founding' (and possibly drift from DB tier names)

**Where:** packages/api/src/services/matching.service.ts:38-43

```ts
const TIER_BONUS: Record<string, number> = {
  new: 0.0, verified: 0.25, pro: 0.5, elite: 1.0,
};
```

Migration 073 introduced 'founding' tier. Earlier batches found `TIER_LADDER` in provider.service.ts uses different tier names ('silver', 'gold', 'platinum'). This file uses 'verified', 'pro', 'elite' — possibly a DIFFERENT set of names entirely. Either (a) the platform has multiple tier vocabularies in different services and they're all wrong, or (b) one of them is canonical and the others are stale.

**Fix:** Audit all tier-string lookups across services. Identify the canonical tier name set (probably from migration 073). Update TIER_BONUS to match. Add 'founding' tier (0.5 or 1.0). Read tier weights from `platform_settings` to make admin-tunable.

### MED-N103 — matching.service findMatchingProvidersSimple ignores scheduledAt availability

**Where:** matching.service.ts:145-200

The "simple" matcher (used by `/bookings/:id/match` per booking.routes.ts:621-625) does NOT check provider_availability for the booking's scheduled day/time. Returns providers who are status='approved' AND is_available=TRUE, regardless of whether their working hours cover the booking time.

**Fix:** Either (a) require scheduledAt parameter and run the same availability check as `findMatchingProviders` (the full version), or (b) document that "simple" means "ignore availability schedule" and warn the customer.

### MED-N104 — matching.service availability check doesn't handle overnight schedules

**Where:** matching.service.ts:95-101

```ts
WHERE pa.start_time <= $time::time AND pa.end_time >= $time::time
```

For an overnight schedule (e.g., bartender 22:00-06:00), `start_time = 22:00` and `end_time = 06:00`. The condition `start <= 23:00 AND end >= 23:00` is `22:00 <= 23:00` (TRUE) AND `06:00 >= 23:00` (FALSE) → no match. Provider with overnight schedule is never matched.

**Fix:** Add OR clause for overnight: `(start_time <= end_time AND start <= time AND time <= end) OR (start_time > end_time AND (time >= start OR time <= end))`.

### MED-N105 — matching.service hasBookingConflict uses default duration for window

**Where:** matching.service.ts:219-245

If actual bookings have varying durations (cleaning = 2h, plumbing = 6h), using `defaultServiceDurationMinutes` for the conflict window misses conflicts. A 6h booking starting at 09:00 could be assigned a new booking at 12:00 because the conflict-window for the new booking extends only ±default-minutes around 12:00, missing the 09:00 booking that runs until 15:00.

**Fix:** Look up the existing booking's actual `estimated_duration_minutes` (from booking_quotes or pricing rules) and use the LARGER of (new booking duration, existing booking duration) for the window. Or simpler: query bookings WHERE `(scheduled_at + INTERVAL '1 minute' * estimated_duration_minutes) > $newStart AND scheduled_at < $newEnd`.

## POSITIVE findings

1. **Phase 14 D07 server-driven checklist verified end-to-end** (Bug 460 + 463). Template snapshot at first open, photo_required enforcement, completion gating for `completed_by_provider` transition.
2. **Photo cross-booking check** (checklist.service.ts:309-318) — verifies photo belongs to the same booking before linking to checklist item. Defense against cross-booking photo replay.
3. **Race-safe checklist creation** — re-check with `FOR UPDATE` inside transaction (line 119-123) prevents duplicate booking_checklists rows under concurrent provider opens.
4. **scrypt with versioning + opportunistic rehash** (auth.service.ts:57-129) — proper format `scrypt:N:r:p:salt:hash` allows rolling parameter upgrades without forcing all users to re-login.
5. **Provider availability geo-filter** (matching.service.ts:93) — Haversine + service_radius_km in DB, not in JS.
6. **MAX_MATCH_ATTEMPTS cap** (matching.service.ts:45) — limits matching candidate pool to prevent runaway queries.
7. **OTP cooldown + hourly rate limit** (auth.service.ts:162-186) — server-side rate-limiting prevents OTP-flood DOS.

## Confirmations

- **Bug 1271 native fetch** verified across all 4 files.
- **CRIT-M05 (trust proxy)** has further downstream impact at auth.service — every request that touches OTP or refresh path uses headers that depend on proxy trust.
- **MED-N90 (matchConfig leak)** confirmed — getMatchConfig() at matching.service.ts:202-210 exposes scoring weights.

## Cumulative running totals (after Phase N Batch 17)

| | Total | Batch 17 additions |
|---|---:|---:|
| **CRITICAL** | **185 + 1 = 186 real** (2 invalidated of 188) | **+1** |
| **MEDIUM** | **575 + 13 - 1 (N98 invalidated mid-doc) = 587** | **+12 net** |
| Lines fully read | ~125,488 / 146,236 | +1,749 |
| Coverage | **85.8%** | +1.2% |

## Files NOT YET READ — remaining (~72 files, ~15,800 lines)

Top priority for Batch 18:
- catalog.routes.ts (466) + business.routes.ts (400)
- pricing.service.ts + suki.service.ts + tip.service.ts + uploads.service.ts
- account.service.ts + booking-photo.service.ts + recurring-booking-related services
- compliance-admin.service.ts + bir-2307-admin.service.ts
- Many smaller route + service files
