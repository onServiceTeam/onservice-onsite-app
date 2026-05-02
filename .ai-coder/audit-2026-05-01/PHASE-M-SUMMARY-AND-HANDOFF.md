# Audit 2026-05-01 — Phase M COMPLETE — API support layer

**Status:** All 55 API support layer files (middleware/validators/utils/jobs/config/types/server/seeds/models) read line-by-line.

## Files fully read in Phase M (55 files, ~3,548 lines)

Per-batch breakdown documented in PHASE-M-BATCH-01.md through PHASE-M-BATCH-04.md.

## NEW CRITICAL findings from Phase M (5)

| ID | One-line | File:line |
|---|---|---|
| **CRIT-M01** | Rate-limit middleware "live config" pattern broken — admin tunings silently ignored | rate-limit.middleware.ts:10-39 |
| **CRIT-M02** | cacheMiddleware doesn't key by user; PII leak risk if applied to auth endpoints | cache.middleware.ts:17 |
| **CRIT-M03** | 'dpo' role unreachable; DPO_ROLES set effectively == requireSuperAdminRole | require-dpo.middleware.ts:15 vs auth.middleware.ts:8 |
| **CRIT-M04** | TOTP encryption optional; missing TOTP_ENCRYPTION_KEY env var = plaintext storage | utils/totp.ts:89-103 |
| **CRIT-M05** | server.ts doesn't `app.set('trust proxy')`; req.ip wrong behind LB; rate-limit/ip-block/audit broken | server.ts (entire) |

## NEW MEDIUM findings from Phase M (17)

| ID | One-line |
|---|---|
| MED-M01 | getClientIp blindly trusts X-Forwarded-For (compounds with CRIT-M05) |
| MED-M02 | ip-block fails open on Redis outage |
| MED-M03 | audit.middleware writes are fire-and-forget; failed audits silent |
| MED-M04 | auth.middleware doesn't distinguish expired vs malformed JWT |
| MED-M05 | validation.middleware only checks body, not query/params |
| MED-M06 | PH lat/lng bounds drift (4..22 vs 4.5..21.5) across validators |
| MED-M07 | updateBookingStatusSchema may be missing 'rematching' status |
| MED-M08 | Multiple validators lack monetary upper bounds (refund/payout/wallet/promo) |
| MED-M09 | admin-catalog ADDON_PRICE_MAX_CENTS hardcoded; not from platform_settings |
| MED-M10 | Tip dynamic cap depends on settings; hardcoded backstop in validator |
| MED-M11 | Logger doesn't redact scrypt password hashes; relies on caller discipline |
| MED-M12 | admin_session lifetime cap hardcoded 15min ignores admin_session_timeout_hrs setting |
| MED-M13 | pii-mask.ActorRole includes 'dpo' but JWT can't issue it (same root as CRIT-M03) |
| MED-M14 | Database pool no SSL config; production may use plaintext |
| MED-M15 | PayMongo webhook secret defaults to '' silently |
| MED-M16 | autoConfirmBookings can release escrow but leave booking stuck at 'confirmed' |
| MED-M17 | TS ProviderTier missing 'founding' (drift with migration 073) |

## POSITIVE findings worth noting

1. **Bug 1251 (admin CSRF + cookies) verified end-to-end** — auth.middleware reads HttpOnly cookie first, admin-csrf.middleware does 3-factor (header + cookie + DB row) check, admin-cookies.ts mints all 3 cookies with correct Secure/SameSite/Path settings, server.ts mounts requireAdminCsrf on /api/v1/admin write methods.
2. **Bug 1271 (native fetch wrapper)** verified — no axios in api/admin code paths.
3. **Bug 1170/1198 (cancellation policy)** verified — cross-row validation with proper error messages, mirrors client-side validators.
4. **Phase 13 BIGINT money widening** verified — pg-types OID 20 cast, all money columns BIGINT.
5. **PII regex masking** in winston logger — 8 patterns covering PH-specific identifiers.
6. **Role-aware PII masking** in pii-mask.ts — super_admin sees raw, dpo sees raw IP only, others fully masked.
7. **TOTP RFC 6238 implementation** — crypto.timingSafeEqual against timing attacks, ±1 window for clock skew, encryption code exists (just optional — see CRIT-M04).
8. **Comprehensive scheduler** in workers.ts — 13 jobs covering auto-confirm, expiry, NBI, no-show, bypass detection (10 patterns including Tagalog), recurring, invoicing, security, quality scores, dispute escalation.
9. **bypass-detection patterns** explicitly include culture-specific Tagalog terms ("bayad mo na lang", "PM mo", "sa labas", "off-app").
10. **Webhook raw body capture** for signature verification (express.json with verify callback).
11. **Comprehensive Zod validators** — 21 files cover all major write endpoints. `.strict()` rejects unknown keys widely.
12. **VALID_TRANSITIONS** state machine in booking.types.ts — explicit allowed transitions.

## Cumulative running totals (after Phase M)

| | Total | Phase M additions |
|---|---:|---:|
| **CRITICAL** | **170 + 5 = 175 real** (1 invalidated of 176; CRIT-160 from Phase J also reclassified) | **+5** |
| **MEDIUM** | **467 + 17 = 484** | **+17** |
| Lines fully read | ~101,000 / 146,236 | +3,548 |
| Coverage | **69.1%** | +2.4% |

## Phase M → Phase N handoff

API support layer (~3,548 lines) is now 100% covered. 

**Remaining unread (~45,200 lines):**
- packages/api/src/services/ (28,925 lines) — Phase B covered the money path (~11k); ~17k unread (provider-admin, customer-admin, booking-admin, dispute-admin, financial-admin, BIR-admin, marketing-admin, compliance-admin, breach-log, notifications, messaging, addresses, referrals, recurring, suki, uploads, checklists, service-areas, business, payouts, tips, security, account, promotions, support-tickets, staff, settings, cancellation-policy, socket, metrics, cache, etc.)
- packages/api/src/routes/ (11,089 lines) — partial coverage in Phases B/C/F; ~6k unread
- packages/api/__tests__/ (~9k unread of 11k)
- scripts/ (2,837 lines) — fully unread
- infra/ (479 lines) — fully unread
- packages/api/scripts/ (~280 lines) — fully unread
- apps/admin/tests/visual/ (~2,511 lines) — partially noted in F#4
- apps/mobile/.maestro/ (~2,834 lines YAMLs) — fully unread

**Next: Phase N — Remaining API services + routes (~30,000 lines)**

This is the largest remaining phase. Strategy:
1. List all service + route files NOT covered in Phase B
2. Read in batches by domain (provider-admin, customer-admin, booking-admin, etc.)
3. Per-batch findings as in Phases K-M

Estimated 60-80 batches of 3-5 files. Multiple sessions of work.

Continuing now into Phase N.
