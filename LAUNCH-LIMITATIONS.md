# LAUNCH-LIMITATIONS — onService Onsite App

This file enumerates **known product / behavioural limitations** present
at v1 launch. Each item is intentional (not a bug) but operators and
support staff need to be aware so they can route around it. Each entry
links to the originating decision (phase / dispatch) and a follow-up
ticket where applicable.

---

## 1. Dispatch console — Reassign Dialog provider eligibility — RESOLVED in Phase 200 (2026-05-29)

**Where:** [apps/admin/src/pages/DispatchConsolePage.tsx](apps/admin/src/pages/DispatchConsolePage.tsx)
(Reassign dialog)

**Status:** RESOLVED — Phase 200 (2026-05-29).

History: the Phase 14 D10 closeout claimed this was resolved, but the
resolving code was never present (see
[E06](.ai-coder/escalations/E06-dispatch-console-resolutions-not-in-code-2026-05-29.md)).
Phase 200 actually did the work:

- `GET /api/v1/admin/providers?online=true` now filters to approved +
  available providers server-side (`adminService.listProviders` online
  predicate), and the route honors `pageSize` (the page requests 100).
- `formatProvider` now returns `latitude`/`longitude`, and the reassign
  dropdown + map popup show the provider's `businessName`.

The server-side `reassignBookingProvider` still validates the chosen
provider before applying the swap. Working-hours/schedule filtering remains
a v1.1 polish item.

## 2. Dispatch console — live map + cancel refund note — RESOLVED in Phase 200 (2026-05-29)

**Where:** Cancel dialog + Leaflet map within the Dispatch console.

**Status:** RESOLVED — Phase 200 (2026-05-29).

History: the D10 closeout claimed a `cancel-preview` refund-preview endpoint
and a working map; neither existed (E06). Phase 200 fixes:

- **Live map now works.** `listBookingsAdmin` and `listProviders` /
  `formatBookingAdmin` / `formatProvider` now return the `latitude`/
  `longitude` that already existed on the `bookings`/`providers` tables, so
  the Leaflet map plots live booking and online-provider markers. Verified
  by `apps/admin/src/pages/__tests__/dispatch-map-phase200.real.test.tsx`.
- **Map tiles are admin-configurable.** New `dispatch` settings category
  (migration `127_phase200_dispatch_map_settings.sql`) holds `map_tile_url`,
  `map_tile_attribution`, and an optional publishable `map_tile_api_key`.
  Edit them at **/admin/settings → Dispatch & Map**. Defaults to
  OpenStreetMap (no key required); paste a MapTiler/Mapbox URL with
  `{apiKey}` for production tiles.
- **Active-bookings table** now returns live bookings (`status=active`
  expands to the canonical active-status set; pre-fix it matched a literal
  `b.status = 'active'` and was always empty).
- The cancel dialog no longer references a non-existent preview; it states
  the refund is computed per policy and shown on the booking detail page.

Remaining v1.1 item: live ETA and real-time GPS *movement* (the map plots
the booking service-address and provider base location; it does not yet
animate live driver position). The `etaMinutes` column shows "—" until a
GPS-ping pipeline is added.

## 3. Customer DSR — no track-requests view in mobile — RESOLVED 2026-05-02 / 2026-05-05

**Where:** [apps/mobile/app/customer/data-rights.tsx](apps/mobile/app/customer/data-rights.tsx)

**Status:** RESOLVED — backend endpoint + mobile UI both shipped.

**Resolution (backend, 2026-05-02):** `GET /api/v1/compliance/my-requests`
returns the caller's DSR history (most recent first, capped at 200).
Implemented in `compliance.service.listMyDsrs` + new route in
`compliance.routes.ts`. Filtered by `user_id` at the service layer so
a malicious caller can't enumerate other users' requests.

**Resolution (mobile UI, verified 2026-05-05 in Phase 101 audit):**
`data-rights.tsx` consumes the endpoint via a `useQuery<DsrRecord[]>`
keyed `['my-dsr-requests']` calling `listMyDsrs(50)`. The UI has
loading / error / empty / populated states, displays request type,
submitted date, 15-day SLA due date, and a status pill colored by
final state (completed=green, rejected=red, in-progress=primary).
Re-fetches automatically after a new submission via
`myRequestsQuery.refetch()` in `submitMutation.onSuccess`.

## 4. DSR submission — no rate limiting — RESOLVED 2026-05-02

**Where:** `POST /api/v1/compliance/dsr`

**Status:** RESOLVED — application-level rate limit landed 2026-05-02.

**Resolution:** `POST /api/v1/compliance/dsr` now rejects with 429 when
the user has submitted 5+ DSRs in the last 24h (regardless of status,
to prevent submit-then-cancel loops). Backed by a single SELECT count
on `data_subject_requests.received_at >= NOW() - INTERVAL '24 hours'`.
Edge-level WAF rate limit remains in place as defence in depth.

## 5. Consent versions — no forced re-consent on publish — RESOLVED 2026-05-02

**Where:** [apps/admin/src/pages/ConsentVersionsPage.tsx](apps/admin/src/pages/ConsentVersionsPage.tsx)

**Status:** RESOLVED — opt-in `material` flag added to consent publish.

**Resolution:** `complianceAdmin.publishConsentVersion` now accepts an
optional `material: boolean` (defaults to `false`, preserving the legacy
marker-only semantics). When the operator passes `material: true`, every
user who previously granted an OLDER version of that consent type is
considered "pending re-consent". A new customer-facing endpoint
`GET /api/v1/compliance/my-pending-consents` returns the outstanding
items per user; mobile `customer/data-rights.tsx` surfaces a banner with
an inline "I agree" button that calls `POST /api/v1/compliance/consent`
with the latest version. Users who explicitly REVOKED an earlier version
are intentionally not in the pending list — their opt-out is respected
and any surface that needs the consent must trigger its own opt-in
flow. The decision of which publishes are material is captured at
publish time (operator UI passes `material: true`) and is not applied
retroactively, so historical publishes remain inert. See
`packages/api/__tests__/launch-limit-5-material-reconsent.test.ts` for
the 9 behavioural tests.

## 6. Admin → customer messaging — verb only, no transport — RESOLVED

**Where:** Dispatch console "Send message" action.

**Status:** RESOLVED — `sendAdminMessageToBookingCustomer` in
`booking-admin.service.ts` now (a) inserts a real `messages` row of
type 'system' into the booking's conversation when one exists, so
the customer sees it inline in the booking chat thread, plus (b)
fires a push notification with the message preview, plus (c) writes
the `admin_message_sent` admin_actions audit row. The customer-side
messaging inbox limitation only applies to bookings that don't yet
have a conversation row — and the booking auto-creates one as soon
as either party sends the first message, so the gap is rare.

## 7. NPC escalation reference format — RESOLVED

**Where:** Data Protection Log → Escalate to NPC dialog.

**Status:** RESOLVED via Phase 14 D08 (Bug 398) and tightened by
MED-N123 (Phase N). The npcReference field is validated server-side
against `^NPC-\d{4}-[A-Z0-9]{6,12}$` in
`compliance-admin.service.escalateDsrToNpc`. Free-text input is
rejected with a 400 + clear message; the 6-12 char suffix bound
prevents log-pollution / DOS.

## 8. Erasure DSRs do not auto-delete data — RESOLVED 2026-05-02

**Where:** Customer DSR (erasure) flow → backend processing.

**Status:** RESOLVED — auto-linkage landed 2026-05-02.

**Resolution:** `compliance.service.createDsr` now kicks off
`dataManagement.requestAccountDeletion` automatically when
`requestType==='erasure'`. The cooling-off + processing pipeline
starts immediately; the DPO no longer has to manually trigger it for
each erasure DSR. Auto-trigger is best-effort: known procedural
errors (existing pending deletion = 409; blocking bookings = 409) are
logged and surfaced on the DSR detail page so the DPO sees what
happened. Auto-trigger failure does NOT roll back the DSR insert —
the customer's NPC 15-day SLA right is preserved either way.

## 9. Customer messaging in DSR confirmation — single submission shown — RESOLVED 2026-05-02

**Where:** [apps/mobile/app/customer/data-rights.tsx](apps/mobile/app/customer/data-rights.tsx)

**Status:** RESOLVED via item #3 (DSR history endpoint landed
2026-05-02). The screen now shows a "My past requests" list below the
flow cards. If the user submits two requests, both appear with their
own status and due date — no more single-submission gap.

## 10. BIR document bucket policy — code spec ready, awaits terraform apply

**Where:** S3 bucket referenced by `AWS_S3_BUCKET_BIR_DOCS`.

**Status:** Spec complete in `infra/terraform/`. Operator must run
`terraform apply` against the production AWS account.

The Terraform now covers:
- `s3-bir-receipts.tf` — bucket + Object Lock COMPLIANCE 10y +
  versioning + SSE-KMS + public-access block + TLS-only policy.
- `s3-customer-uploads.tf` — bucket + KMS + lifecycle.
- `s3-access-log-bucket.tf` — central access-log bucket attached to
  both prod buckets.
- `iam-api-service-role.tf` (new 2026-05-03, LL#10 fix) — implements
  INFRA-CHECKLIST items 2.1–2.5: dedicated `onservice-api-prod` role
  with PutObject + GetObject on BIR bucket only, **explicit DENY** on
  DeleteObject*, PutBucket*, PutObjectRetention, PutObjectLegalHold,
  BypassGovernanceRetention. Permission boundary blocks IAM/KMS
  mutation. Separate `onservice-data-export-prod` role scoped to
  `customer-uploads/exports/*` only with explicit DENY on the BIR
  bucket so a compromised export job can't cross-pollinate.

**Remaining:** the AWS apply itself + plumbing the role ARNs into the
ECS task definitions / EKS pod spec is operator work tracked in the
launch-cutover runbook.

---

## 11. hCaptcha not yet wired into user-facing flows (Phase 13 Dispatch D)

Server-side verification exists in
[packages/api/src/utils/hcaptcha.ts](packages/api/src/utils/hcaptcha.ts)
and is fully tested, but it is not yet attached to any registration,
login, or forgot-password endpoint because:

- The API has no public registration or forgot-password routes today.
  User onboarding is OTP-based (phone number + Semaphore SMS), and admin
  onboarding is invitation-only (no `/auth/register` route exists).
- Existing OTP brute-force protection is provided by the Phase 5 CAPTCHA
  control (`securityService.verifyCaptchaToken`, threshold 3 failures)
  documented as SEC-002 in `docs/SECURITY-POSTURE.md`.
- Mobile hCaptcha integration is sized for post-launch — neither
  `@hcaptcha/react-native-hcaptcha` nor a WebView fallback is wired in.
  Mobile flows currently rely on rate limiting + OTP verification.
- Admin web has no public registration or forgot-password page either, so
  there is no admin form to protect.

**When to revisit:** wire `verifyHCaptchaToken` into any of the
following IF/WHEN added: (a) a public registration endpoint, (b) a
forgot-password / self-service password reset endpoint, (c) any
anonymous endpoint that creates persistent records (e.g., public
contact-us, public quote-request), (d) any endpoint where rate
limiting alone is insufficient against distributed automation (e.g.,
referral-code redemption from unauthenticated context). The form must
POST a `captchaToken` (or `hcaptchaToken`) field that is validated by
`verifyHCaptchaToken` before any DB write. The neutral failure copy
"Verification failed. Please try again." is the recommended response.

## 12. Admin password rehash is opportunistic — RESOLVED 2026-05-03

**Status:** RESOLVED — proactive rotation campaign for legacy password
hashes implemented end-to-end.

The opportunistic rehash on login (auth.routes.ts) still upgrades a
legacy / weaker scrypt hash to the current cost factor inside the
same login. Dormant accounts that never log in were the gap; this is
now closed:

- **Migration 116** — `users.must_rotate_password BOOLEAN NOT NULL
  DEFAULT FALSE` + partial index. `admin_actions.action_type` CHECK
  widened with `legacy_password_rotation_flagged` +
  `admin_password_rotated`. Idempotent + non-destructive (no auto-flip
  at apply time).
- **Service** — `admin-password-rotation.service.ts`:
  - `getLegacyPasswordStats()` returns `{total, legacy, current,
    mustRotate}` counts via single COUNT FILTER query.
  - `flagLegacyHashesForRotation(adminId)` flips
    `must_rotate_password=TRUE` on every admin-tier account whose
    hash isn't `scrypt:131072:%`. Single audit row per campaign run
    (not per user) to avoid log spam.
  - `changeOwnAdminPassword({userId, oldPassword, newPassword})`
    verifies old, validates new (12–128 chars, must differ), hashes
    with current scrypt N, clears the flag, audits — all in one trx.
- **Routes** (security.routes.ts):
  - `GET /api/v1/security/admin/legacy-password-stats` (any admin tier)
  - `POST /api/v1/security/admin/flag-legacy-password-hashes`
    (super_admin only)
  - `POST /api/v1/security/admin/me/change-password`
- **Login flow** (auth.routes.ts) — admin login + admin 2FA verify
  responses now include `mustRotatePassword: boolean` so the admin
  web app can route straight to the change-password screen and gate
  every other route until the rotation lands. Tokens are still
  issued (so the user CAN reach the change-password screen).
- **Tests** — 12 tests in `launch-limit-12-admin-password-rotation.test.ts`.

**Operator workflow:**
1. Apply migration 116.
2. Hit `GET /security/admin/legacy-password-stats` to see the count.
3. Optionally hit `POST /security/admin/flag-legacy-password-hashes`
   to begin the campaign — affected admins will be forced to rotate
   on next login.
4. Verify completion later via the same telemetry endpoint or the
   SQL query: `SELECT COUNT(*) FROM users WHERE role IN ('admin',
   'super_admin', 'dpo') AND password_hash NOT LIKE 'scrypt:131072:%';`

## 13. Tech debt — Jest worker leak warning (pre-existing)

Jest emits "A worker process has failed to exit gracefully" at the end
of `npx jest` runs in `packages/api`. All 853 tests pass; this is a
teardown-hygiene warning, not a test failure. Suspected causes: an
open pg `Pool`, unclosed BullMQ Redis connection, or a `setInterval`
in cache code without `unref()`. Estimated 30 minutes to chase with
`--detectOpenHandles`. Defer to Dispatch F or G.

## 14. Schema technical debt — polymorphic discount/conversion columns

Schema technical debt — `promo_codes.discount_value` and
`ab_test_assignments.conversion_value` are polymorphic on a sibling
type-tag column (`discount_type`, `target_metric` respectively). The
BIGINT widening in migration 059 is conservative-correct, but a future
migration should split each into typed columns (e.g.,
`discount_centavos BIGINT` + `discount_basis_points INT`, with the
discriminator preserved or deprecated). Not blocking launch; track as
schema debt.

## 15. BIGINT money parser ceiling (Phase 13 Dispatch E)

BIGINT money columns are returned to JS as `Number` via
`pg-types.setTypeParser(20, …)` registration in
`packages/api/src/config/database.config.ts`. Safe ceiling per single
value: ~₱90 trillion (`Number.MAX_SAFE_INTEGER` ÷ 100). Largest current
single-row plausible value: ~₱650M (Phase 13 dispatch-E inventory §5).
Largest plausible aggregate: ~₱100B. Future BI/analytics work that sums
all-time platform revenue into a single column should use BigInt
end-to-end (Option A pattern) or DECIMAL with explicit string
passthrough — do NOT assume `Number` is safe for accumulator columns at
platform scale beyond ₱1T cumulative GMV.

## 16. Type parser scope is project-wide (Phase 13 Dispatch E)

The pg-types parser registration in `database.config.ts` applies to
EVERY pg query in the API process — there is no per-query opt-out.
Consequently, ANY future BIGINT column (snowflake IDs, monotonic
counters, sequence values legitimately exceeding 2^53) will be coerced
to `Number` and may lose precision silently. Any developer adding such
a column MUST handle this at the call site (per-query parser override
or BigInt-aware accessor) AND document the choice. See
`docs/MONEY-HANDLING.md` for the canonical guidance and trade-offs.

## 17. Account-deletion cooling-off processor is per-row (Phase 13 Dispatch E)

`processExpiredCoolingOff` in
`packages/api/src/services/data-management.service.ts` iterates expired
cooling-off requests and runs the multi-table `anonymizeUser` cascade
synchronously per row. The loop is annotated `// SAFE-N+1` because the
cascade is essential (UPDATE users + DELETE addresses/push_tokens/
refresh_tokens + UPDATE reviews/messages + provider rollback) and
collapsing it into a single bulk batch trades per-row error-isolation
for batch-abort on a single UNIQUE-constraint collision (anonymized
phone/email). Volume is bounded by the daily cron + 30-day cooling
window with low expected throughput. Future work: enqueue one BullMQ
job per expired request to a dedicated `account-anonymization` worker,
preserving per-row resilience while removing the synchronous per-row
DB cost from the cron path. Not blocking launch.

## 18. axe-core wired in dev console; automated assertion deferred (Phase 13 Dispatch F)

`@axe-core/react` is registered in `apps/admin/src/main.tsx` behind an
`import.meta.env.DEV` guard, so a11y violations stream to the browser
console during local development but are tree-shaken from production
builds. There is no automated assertion gate yet because:

1. `apps/admin` has no test runner (no Vitest, no Jest config). Adding
   one is a non-trivial change touching tsconfig, vite.config, and CI.
2. The admin pages import `react-leaflet`, `recharts`, and other
   browser-only modules that are not SSR-friendly under `jsdom`,
   making a Node-only axe scan brittle.

The canonical a11y assertion will land as part of the Phase 14
Playwright e2e suite, which can drive a real browser against the dev
server and run `@axe-core/playwright` on the canonical pages.

---

## 21. Admin password bootstrap (Bug 1235 fix — Phase 14 Dispatch 01)

**Where:** [packages/api/seeds/](packages/api/seeds/) and
[packages/api/scripts/bootstrap-admin.ts](packages/api/scripts/bootstrap-admin.ts).

The repository ships **no admin credentials**. Phase 14 Dispatch 01
deleted `seeds/004_admin_passwords.sql`, which carried a placeholder
hash that invited a "well-meaning fix" (someone running
`scrypt('admin123')` and pasting the real hash) — that would create a
working credential everyone knows.

**Production admin users** are bootstrapped via
`packages/api/scripts/bootstrap-admin.ts` which requires
`ADMIN_BOOTSTRAP_PASSWORD` env var meeting strength requirements:

- length >= 16
- mixed case + digit + special character
- not matching banned dictionary patterns (`password`, `admin`,
  `onservice`, `qwerty`, `12345`)
- no 5+ repeated characters in a row

After the script runs, the new admin signs in via `/login` with that
password and **must enroll TOTP 2FA on first login** per the existing
admin auth flow.

**Operator obligation:** keep `ADMIN_BOOTSTRAP_PASSWORD` out of shell
history (use `read -s` or a password manager). Do not commit example
strong passwords to docs.

**Gate:** [scripts/gates/c-constitution-no-admin-password-seeds.sh](scripts/gates/c-constitution-no-admin-password-seeds.sh)
prevents any future seed from setting `password_hash` on `users` or
`admin_users` tables.

**Source decision:** Phase 14 Dispatch 01 Bug 1235 fix.

---

Phase 13 owner notes: this file is the canonical place to record
"intentional v1 limitations". Add new entries as they are discovered;
do NOT silently fix without recording the original limitation here.

---

## §brand-color-mobile-runtime — Mobile dynamic theme not wired

**What works after Phase 14 D02 Part 2:**

- Brand colors are server-canonical: `docs/design-system/tokens.json`
  declares the canonical hex values; migration 072 seeds them as
  `platform_settings` rows under category `branding`; admin can edit
  them via the existing `/admin/settings` page; `getClientConfig`
  returns the live values.
- Static defaults in `apps/mobile/src/config/theme.ts` and
  `apps/admin/src/index.css` match the canonical hex values, so a
  fresh build with the API unreachable still looks correct.
- Gate A `a-cross-source-brand-color.sh` blocks the legacy `#0066FF`
  and `#0F62FE` from reappearing.

**What does NOT work yet:**

- The mobile app reads `theme.ts` synchronously at import time. If an
  admin edits the brand color in `platform_settings`, mobile installs
  in the wild won't pick up the new value until the next app version
  ships through EAS Update / store review.
- The admin web reads `--color-primary` as a static CSS variable in
  `index.css`. Same story — runtime override would require either
  inline `<style>` injection from `getClientConfig` at app boot or a
  CSS-vars `<ThemeProvider>` on the React tree.

**Why deferred:**

- The structural fix (one source of truth, no drift) is complete.
- Dynamic theme is cosmetic-runtime polish, not a launch blocker.
- A proper fix touches enough surface (mobile ThemeProvider, admin
  CSS-var injection, hot-reload semantics) to belong with the
  Dispatch 12 mobile-customer polish or its own follow-up dispatch.

**Operator obligation:** treat brand color tuning as a
release-coupled operation for v1.0 — change `platform_settings`
AND ship a new mobile build / admin redeploy. Track desired changes
in the same admin /settings page so the batch is explicit at release
time.

**Source decision:** Phase 14 Dispatch 02 Part 2 Bug 1324 — autonomous
execution per "server canonical, admin editable" standing instruction
chose option (a) "build the editor under the same dispatch" for the
admin UI / DB layer, and option (b) "defer with LAUNCH-LIMITATIONS
entry" for the mobile + admin runtime override.

---

## §routes-registry-template-strings — Dynamic-route migration in flight

**What works after D02 Part 4:**

- `apps/mobile/src/config/navigation.ts` is the canonical Routes registry,
  expanded to cover all tab routes, customer screens, provider screens,
  provider-onboarding screens.
- `buildRoute(template, params)` substitutes `[id]` / `[slug]` /
  `[bookingId]` segments with type-safety and URL encoding; throws on
  missing params.
- All 49 distinct **static quoted** raw-string `router.push('/...')` /
  `router.replace('/...')` callsites across 33 files have been converted
  to `Routes.X.Y` constants. Gate `a-cross-source-routes.sh` passes.

**What remains:**

- ~35 callsites use **backtick template strings** with embedded `${id}`
  / query params (e.g. ``router.push(`/customer/booking/${booking.id}`)``,
  ``router.push(`/customer/booking/change-order?bookingId=${id}`)``).
- These are not blocked by the current gate (which scans single + double
  quotes only). Migrating them requires either:
  1. `buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: booking.id })` for
     simple param routes; OR
  2. A query-param-aware variant for `?bookingId=` style URLs (a few
     screens use this for pre-step state hand-off; cleanest fix is to
     register the destination as its own route + drop the query param).

**Why deferred:**

- The structural fix (single source of truth, no more drift across
  ~70% of screens) is complete for static routes.
- The remaining backtick conversions are case-by-case judgment (each
  callsite has its own minor refactor when the destination accepts
  query params), and they cluster on the highest-traffic surfaces
  that get reworked in Dispatch 12 (mobile customer polish) anyway.
- Splitting the work by quote-style is reviewable; lumping it all
  in one PR pushed past the 35-file ceiling.

**Operator obligation:** none — runtime behavior unchanged.

**Source decision:** Phase 14 Dispatch 02 Part 4 Bug 1185 — autonomous
execution, scope-check (Step 11) split. Static-path migration completed;
template-string migration tracked here for D12.

## 22. Gate enforcement — REPORT vs BLOCKING tier (Phase 14 Dispatch 03)

**Where:** [scripts/gates/MODES.json](scripts/gates/MODES.json),
[scripts/gates/run-gate-a.sh](scripts/gates/run-gate-a.sh),
[scripts/gates/c-constitution.sh](scripts/gates/c-constitution.sh).

The five gates (A through E) are now binding required-status-checks on the
`master` branch. PRs cannot merge with any BLOCKING gate failing. Per-fragment
and per-article modes live in `MODES.json`:

- **BLOCKING:** failure fails the gate. No PR can merge.
- **REPORT:** failure is logged but does not fail the gate. Used for
  fragments/articles whose cleanup is owned by a not-yet-landed dispatch.

Currently in REPORT (will promote to BLOCKING when their owning dispatch
lands):

| Fragment / article | Owning dispatch |
|---|---|
| `a-cross-source-no-siguradoshield` | D04 |
| `a-cross-source-no-client-money` | D05 |
| `a-cross-source-no-emoji-icons` | D12 |
| `article-4.2-no-console` (Gate C) | D12 |
| `article-4.6-no-emoji` (Gate C) | D12 |
| `money-in-transaction` (Gate C) | D06 |
| Gate D (visual baselines) — full suite | D12 |
| Gate E (mutation testing) — full suite | D12 |

**Operator obligation:** none — this is engineering-process metadata.

**For future maintainers:** a gate amendment requires Ken's signoff via PR
per [.ai-coder/governance/GATE-AMENDMENTS.md](.ai-coder/governance/GATE-AMENDMENTS.md).
The AI coder cannot weaken a gate, lower a threshold, or mark a fragment
REPORT without Ken's review. The exception file at
`.ai-coder/exceptions/<date>-<topic>.md` is the only legitimate path.

**Source decision:** Phase 14 Dispatch 03 — gate hardening + tiered
enforcement.

## 23. SiguradoShield (in-house insurance product) deferred to v1.1+

SiguradoShield (in-house insurance product) deferred to v1.1+. v1.0
ships without platform-provided coverage. Customers and providers are
responsible for any damage or loss per the standard ToS. When real
coverage is added, it requires either (a) PH Insurance Commission
license + underwriter capital, or (b) partnership with a licensed
insurer who provides the policy and we collect premiums on their
behalf as authorized representative. Either path is a v1.1+ project,
not a v1.0 patch.

**What was pulled in D04:**
- Customer mobile UI surfaces (onboarding slide 2, home banner,
  profile menu row, safety screen rebuild, payment-methods cleanup,
  help FAQ, terms section 6, provider detail card, booking
  checkout/confirm escrow language) — every "SiguradoShield™",
  every peso-amount coverage figure, every "covered up to" claim.
- Server config (`packages/api/src/config/platform.config.ts` INS-002
  block deleted; `packages/api/src/services/settings.service.ts`
  no longer reads max_property_damage_coverage / max_theft_coverage
  / max_injury_coverage / claim_window_hours).
- Settings test fixtures (`packages/api/__tests__/settings-service.test.ts`)
  no longer seed insurance-shaped defaults.

**What was kept (per Ken's instruction — schema is immutable history):**
- Migration `014_create_disputes.sql` (creates the dispute tables; the
  comment header notes that the original Sprint-4 plan also implemented
  SiguradoShield Chapter 7, now deferred). Disputes themselves still
  ship — they're the regular escrow dispute flow, no insurance claims.
- Migration `050_platform_settings_rich_schema.sql` seed rows for the
  protection/* setting keys. Server code paths no longer read them; they
  sit dormant until v1.1+ either consumes them via a real claims
  pipeline or a future migration archives them.
- No actual `shield_polic*` / `shield_claim*` / `insurance_*` tables
  exist in the migration history; SiguradoShield was always UI-copy
  with a settings-keyed config layer, never a wired charge/payout
  integration. Audit findings recorded in `.ai-coder/dispatches/D04-closeout.md`.

**What is enforced:**
- New Gate C article `no-shield-references` (BLOCKING) at
  `scripts/gates/c-constitution-no-shield-references.sh`. Fails any
  commit reintroducing SiguradoShield to UI surfaces or charge/payout
  code, with a documented allowlist for spec docs, deprecated
  migrations, this file, and the decision file.
- Old `a-cross-source-no-siguradoshield.sh` is now a thin alias that
  delegates to the new gate.

**What awaits Ken's exact wording (legal sensitivity):**
- A "platform does not provide insurance" disclaimer line in:
  - `apps/mobile/app/customer/terms.tsx` section 6
  - `apps/mobile/app/customer/help.tsx` FAQ "Does the platform provide insurance?"
  - `apps/mobile/app/customer/safety-and-support.tsx` FAQ
  - Possibly `apps/mobile/app/customer/booking/{checkout,confirm}.tsx`
  - Provider agreement (D10 onboarding scope honors this)
- Each surface currently displays a `TODO_KEN_LEGAL_DISCLAIMER` placeholder
  alongside an HTML-comment marker pointing at
  `.ai-coder/decisions/D04-siguradoshield.md §legal-language`.
- Ken (or his lawyer) supplies the wording in a follow-up commit; the
  AI coder does NOT draft this language.

**Operator obligation:** until Ken's disclaimer wording lands, support
staff should be aware that customers reading terms section 6 / help
"Does the platform provide insurance?" / safety screen FAQ will see a
placeholder string. This is intentional, not a bug. The pull itself
(removal of the false advertising) is the v1.0 protection; the
disclaimer wording is the legal-clarity follow-up.

**Source decision:** `.ai-coder/decisions/D04-siguradoshield.md` —
Ken — Option A — 2026-04-30. Phase 14 Dispatch 04.

---

## 24. Hourly-pricing subcategories not supported in v1.0 (Phase 14 Dispatch 05)

**Risk class:** Functional limitation; not a money-trust risk.
**Owning dispatch:** D05 (this dispatch).
**Owning area:** booking flow; admin catalog UI.

The schema defines three values for `service_subcategories.pricing_type`:
`'fixed'`, `'quote'`, and `'hourly'` (per `packages/api/migrations/003_create_services.sql:25-26`).

D05's new `pricing.service.ts` (server-canonical pricing resolver) handles
the first two. Hourly pricing requires a start-stop timer flow,
duration-tracked billing, and mid-job rate verification that v1.0 does not
implement and was not in the audit's bug list.

**Server behavior in v1.0:** if a customer attempts to book a subcategory
with `pricing_type = 'hourly'`, the booking endpoint returns HTTP 400
with error code `subcategory_pricing_type_unsupported`. Test:
`packages/api/__tests__/services/booking/pricing.service.test.ts:bug-d05-hourly-deferred`.

**Operator obligation:** the catalog admin UI should warn (or refuse) when
an admin creates a subcategory with `pricing_type = 'hourly'`. D05 does
not modify the admin catalog UI for this — it is captured as v1.1 scope.
Until the admin UI is hardened, operations should manually QA new
subcategory rows and avoid setting `pricing_type = 'hourly'`.

**v1.1+ scope:**
- Hourly billing flow on the customer side (pre-book hourly rate display,
  start-stop timer at job start, duration tracking, total computed at
  completion).
- Provider-side timer controls.
- Admin catalog UI hardening for the `'hourly'` selector (warn + refuse,
  or full hourly support).
- Settings keys for hourly minimum charge / billing increment.

**Source decision:** `.ai-coder/decisions/D05-spec-vs-schema.md` — Ken —
Option A — 2026-04-30. Phase 14 Dispatch 05.

---

## 25. In-app chat photo + message sending broken in v1.0 (Phase 14 Dispatch 07)

**Bug 38** (audit reference) — provider/customer chat threads display
correctly but photo attachments and outbound messages from the mobile
chat screens are broken. The chat data model + admin moderation tools
work; the mobile send path needs rebuild.

**v1.0 server behavior:** the existing /api/v1/messaging endpoints
operate normally for messages sent from server-driven flows (system
notifications, admin-to-customer messages from the dispatch console).
Mobile-initiated chat messages in the customer ↔ provider thread are
unreliable. Specifically:

- Mobile photo-attachment in chat: photos go to `/api/v1/uploads` but
  the message payload's `attachments` field doesn't always reach the
  recipient device — investigation deferred to v1.1+.
- Mobile outbound messages: occasionally don't appear on the recipient
  side until app restart — likely a socket subscription regression.

**Operator obligation:** support agents should advise users to use the
"Call provider" button (existing flow, works correctly) for time-
sensitive coordination. Photo-evidence is captured via the **provider
job photos** flow (Bug 36/461 fix in this same dispatch — provider
uploads to S3-backed booking_photos), NOT chat. Disputes use the
**dispute evidence upload** flow (existing, works) NOT chat.

**v1.1+ scope:**
- Mobile chat send-path rebuild (likely a rewrite onto the existing
  socket service used elsewhere).
- Photo attachment flow in chat using the booking_photos table model
  introduced in D07.
- Real-time delivery confirmation in the chat UI.

**Source decision:** D07 plan + `.ai-coder/dispatches/D07-closeout.md` —
chat scoped out of D07's provider-job-execution-trust focus per spec
(line 873: `Bug 38 — chat deferred to v1.1`).

**Source:** Phase 14 Dispatch 07.

---

## 26. NPC RA 10173 compliance posture (Phase 14 Dispatch 08)

The platform meets the operational compliance bar for v1.0 launch:

- **Consent records:** all consent actions write rows to `consent_records`
  with version + IP + UA. CHECK constraint on `consent_type` (migration
  080) prevents typos.
- **DSR queue:** rejection/escalation reasons enforced at ≥30 chars.
  NPC complaint references must match `NPC-YYYY-XXXXXX` format.
- **Marketing communications:** honor per-channel opt-in flags
  (push/SMS/email separately) AND require
  `marketing_consent_acknowledged_at IS NOT NULL`. Helpers
  `isMarketingChannelEligible` + `listMarketingEligibleUsers` in
  `services/notification.service.ts` MUST be used by any future
  marketing-blast worker.
- **Breach log:** `breach_log` table (migration 082) tracks every
  reported breach. The 72h NPC notification SLA (RA 10173 §38) is
  computed at read time (`sla72hExpired`, `sla72hRemainingHours`)
  and displayed in the admin Compliance page Breach Log tab.
- **Audit log PII:** masked for non-super-admin roles via
  `maskPiiForRole` (`utils/pii-mask.ts`). DPO sees raw IP + masked
  UA/phone/email; all other admin roles get full masking. Reveal
  endpoint pattern documented for super_admin one-row PII access
  with self-audit.
- **Audit log CSV exports:** themselves audit-logged with
  `action_type='audit_log_exported'`.
- **DPO-only endpoints:** `searchConsent` + `breach-log` routes gate
  on `requireDpoRole` (super_admin OR dpo).

**Outstanding (post-launch v1.1+):**

- **NPC DPO registration:** pending administrative submission. v1.0
  ships with internal DPO designation; formal NPC registration in
  progress at the time of launch.
- **PagerDuty integration for breach SLA alerts:** the breach SLA
  monitoring cron job is implemented in service code; PagerDuty
  trigger wiring + Sentry custom counter happens in D14 production
  cutover when AWS + Sentry credentials are configured.
- **Marketing blast worker rebuild:** D08 ships the eligibility helpers
  but no campaign-send worker uses them yet (no marketing campaigns
  shipped at launch). v1.1 marketing program adds the worker that
  consumes `listMarketingEligibleUsers`.
- **Annual privacy impact assessment (PIA):** scheduled for Q2.
- **Quarterly consent audit job:** v1.1.
- **Customer-side notification settings UI for granular marketing
  flags:** D11 mobile customer polish wires the new
  `marketingPushEnabled` / `marketingSmsEnabled` / `marketingEmailEnabled`
  toggles + `acknowledgeMarketingConsent` flow into the existing
  `notification-settings.tsx` screen.

**Source:** Phase 14 Dispatch 08.

---

## 27. Provider onboarding manual review (Phase 14 Dispatch 09)

v1.0 launch ships with **manual admin review** of every provider
application. No automated liveness vendor (Onfido / Persona / similar)
is contracted at launch.

**v1.0 flow (Bug 1194 + 1195 deferral path):**
1. Provider completes the 10-screen onboarding flow.
2. Documents (NBI clearance, government ID front/back, proof of address,
   selfie, optional certifications) upload via multipart to S3 + KMS.
3. Provider submits application.
4. Application appears in admin Provider Review queue.
5. Admin reviews documents + selfie visually (compares selfie against
   government ID photo).
6. Admin approves / rejects / sends-back with required ≥30-char reason.
7. Audit row written to admin_actions for every decision.
8. Sent-back applications unlock for provider to amend + resubmit.

**Operator obligation:**
- Boracay launch volume: ~5 new provider applications/day expected.
  Estimated review time per application: 5-10 minutes including
  document review + selfie comparison + audit row write.
- Admin Provider Review queue surface (D10 admin dispatch console
  wire-up) presents the queue with applications sorted oldest-first.
- 72h SLA: every application has `estimated_review_hours = 72` baked
  in; provider sees `estimatedDecisionAt` in their app.

**v1.1+ scope:**
- Onfido / Persona integration for automated liveness check (selfie
  vs ID photo + liveness gesture).
- Auto-approve flow for cleared applications (NBI passes, ID matches,
  liveness passes) — admin only reviews exceptions.
- Document-expiry watcher cron (NBI is 1-year valid; auto-flag
  expiring docs for re-upload).
- Subcategory-level service permissions (provider applies for "Aircon
  Repair" specifically, not just "Aircon Services" category).

**Source:** Phase 14 Dispatch 09 + spec PART-3 §"Dispatch 09" line 23.


---

## 28. Mobile customer per-screen polish + visual baselines (Phase 14 Dispatch 11)

D11 ships the **cross-cutting infrastructure** for the 15 polish patterns
(i18n, toast, ConfirmModal, FilterChips/Modal, PhoneInput, StatusBadge,
PaginationLoader, Avatar, PulsingDot, useDebouncedValue, useSocketRoom)
plus the bridge test for all 86 customer bug numbers. What is **deferred
to v1.1** (or to as-touched basis as screens get edited):

- Per-screen application of all 15 patterns to all 43 customer screens.
  v1.0 ships the components and hooks; screens consume them when next
  edited. No screen is broken today; the polish is incremental.
- 43 Maestro flow files in `apps/mobile/.maestro/visual/customer/`.
  Maestro CLI is not in CI yet (deferred to v1.2).
- 43 Jest snapshot tests for customer screens. Per-screen snapshots add
  test mass without exercising production paths; deferred to when
  Maestro lands.
- Tagalog and Cebuano locale catalogs. v1.0 is English-only; the i18n
  shim in `apps/mobile/src/lib/i18n.ts` is the swap point — v1.1
  replaces the body with `i18next + locale-aware lookup` and supplies
  catalogs for `tl` and `ceb` (each ~₱5-10k for full translation).
- The 43-screen visual baseline at 320, 375, 390, 414 viewport widths.
  Deferred to v1.1 visual-regression workstream.

**Operator obligation:**
- v1.0 launch monitoring: watch crash reports for any screen that uses
  the new components. If a screen renders broken (most likely cause:
  the i18n key is missing — the shim falls through to the key string,
  making the bug visible), file a P1 polish ticket against that screen.
- The components themselves are tested via the D11 bridge test
  (`apps/mobile/__tests__/d11-customer-polish.test.ts`) so structural
  regressions surface in CI.

**v1.1+ scope:** Maestro flows, snapshot tests, Tagalog/Cebuano catalogs,
visual-baseline at 4 viewport widths, full per-screen pattern audit.

**Source:** Phase 14 Dispatch 11 + spec PART-3 §"Dispatch 11" line 1031, 1034.


---

## 29. Mobile provider per-screen polish + GPS-related v1.1 features (Phase 14 Dispatch 12)

D12 ships the **provider-specific cross-cutting infrastructure**:
- NbiStatusBanner (global NBI lifecycle banner)
- useStatusMutation (haptic-feedback wrapper for status transitions)
- useJobGpsBroadcast (GPS lifecycle hook scoped to en_route/arrived statuses)
- useAppState (foreground/background tracker for 15-min auto-off)
- EarningsChart (pure-RN bar visualisation)
- CommissionBreakdown (gross→fee→commission→net disclosure with help modal)

Plus the bridge test for all 64 provider bug numbers and the
provider.* i18n namespace. What is **deferred to v1.1**:

- Per-screen application of the 18 patterns to all 39 provider screens
  (mirror of §28 deferral). Screens consume the new components when
  next edited; no screen is broken today.
- 39 Maestro flow files in `apps/mobile/.maestro/visual/provider/`.
  Maestro CLI is not in CI yet (deferred to v1.2).
- Per-screen Jest snapshot tests.
- **Per-area pricing** (Bug 1231) — providers cannot set different
  rates for different service areas in v1.0. Single base rate per
  service. v1.1 adds area-modifier table.
- **Suki custom discount** (Bug 1245) — providers cannot set custom
  discount codes for repeat customers in v1.0. v1.1 ships the
  redemption pipeline as part of the promo-code v1.1 work.
- **Reviews reply** (Bug 1249) — providers cannot publicly reply to
  customer reviews in v1.0. Bug 1250 (flag inappropriate review) IS
  shipped as the v1.0 mitigation; admin can intervene.
- **Background-location store privacy disclosures** — Apple Privacy
  Manifest entry + Google Play "Background location" justification
  submission must accompany the first store release that uses
  `useJobGpsBroadcast`. Both stores require the verbatim language:
  "We track location only during active jobs, only with your explicit
  toggle, and only to show your customer your ETA."
- **Foreground-service notification on Android** — when GPS broadcasts,
  Android shows a persistent "onService — Active job" notification. OS
  requirement; cannot be hidden. Some providers will find this
  annoying; the in-app permission rationale modal pre-explains why.
- **EarningsChart — victory-native upgrade** — current pure-RN bar
  chart is functionally adequate but visually basic. v1.1 may swap to
  victory-native + svg when peer ranges align (currently react-native-svg
  pinned at 15.8.0 which conflicts with victory-native 36+).

**Operator obligation:**
- v1.0 launch monitoring: watch crash reports for any provider screen
  that uses `useJobGpsBroadcast` — TaskManager + background-location
  is the most failure-prone area on Android due to OEM battery
  optimisations. Sentry breadcrumbs include `gps_task_error` /
  `gps_broadcast_failed` / `gps_start_failed` / `gps_stop_failed`.
- Monitor `gps-update` endpoint volume in Grafana — sudden spike or
  drop signals a hook lifecycle bug.

**v1.1+ scope:** Maestro flows, snapshot tests, per-area pricing,
suki custom discount, reviews reply, victory-native chart upgrade,
store privacy disclosure submission.

**Source:** Phase 14 Dispatch 12 + spec PART-3 §"Dispatch 12" lines 1043, 1361-1363.


---

## 30. Promo code redemption pulled for v1.0 (Phase 14 Dispatch 13)

The audit (Bug 44) found that promo codes can be created via the admin
Marketing page and stored in the `promo_codes` table, but the customer
mobile app has no redemption input field and the server has no
redemption pipeline. Per `.ai-coder/decisions/D13-feature-decisions.md`,
v1.0 ships with redemption **pulled** (not wired half-way):

- Migration 088 seeds `feature_flag.promo_redemption_enabled = false`.
- Mobile `useFeatureFlags` defaults to `false`. Customer never sees a
  promo input in checkout.
- Admin `MarketingPage.tsx` Promo Codes tab shows a banner explaining
  the unwired state so admins do not waste time creating codes that
  cannot redeem.

**v1.1+ scope:**
1. Build redemption pipeline in `pricing.service.ts` `resolvePromo()`.
2. Add `PromoCodeSection` to `customer/booking/checkout.tsx`, gated
   on `flags.promoRedemptionEnabled`.
3. Toggle `feature_flag.promo_redemption_enabled = true` via admin
   settings.
4. **Codes created in v1.0 work retroactively** — the row stays in the
   table and becomes redeemable when the flag flips.

**Operator obligation:**
- Do not run marketing campaigns that promise promo codes during v1.0;
  they will not redeem until v1.1+ wires the pipeline.
- The admin banner makes the unwired state obvious to ops staff.

**Source:** Phase 14 Dispatch 13 + spec PART-3 §"Dispatch 13" line 14, 199-214.

---

## 31. A/B testing framework pulled for v1.0 (Phase 14 Dispatch 13)

The audit (Bug 45) found that the A/B test admin UI works, the
`ab_tests` + `ab_test_assignments` tables exist, but no service code
assigns variants. Every customer ends up in control. Per the same D13
decision document, A/B testing is **pulled for v1.0**:

- Migration 088 seeds `feature_flag.ab_testing_enabled = false`.
- Admin `AnalyticsPage.tsx` filters out the A/B Tests tab when the flag
  is OFF (the v1.0 default). Direct-link `/analytics?tab=ab-tests`
  falls through to the first visible tab.
- The `ab_tests` + `ab_test_assignments` tables are NOT dropped — v1.1
  reads them as-is when the assignment service is wired.

**v1.1+ scope:**
1. Build `ab-test.service.ts` `assignVariant(userId, testKey)` with
   sticky-bucket persistence (writes to `ab_test_assignments`).
2. Wire `track_exposure` calls in critical surfaces (checkout, search,
   onboarding) to record which variant a user saw.
3. Toggle `feature_flag.ab_testing_enabled = true` via admin settings.
4. Gate first experiment on a documented hypothesis — statistical
   significance requires sample sizes you will not have for several
   months post-launch.

**Operator obligation:**
- Treat any "A/B testing" feature requests during v1.0 as a v1.1
  ticket. The infrastructure is there, the wiring is not.

**Source:** Phase 14 Dispatch 13 + spec PART-3 §"Dispatch 13" line 15, 216-226.

## 32. Live provider GPS streaming pulled for v1.0 (Phase 106 audit, 2026-05-05)

**Where:**
- [apps/mobile/app/customer/booking/tracker.tsx](apps/mobile/app/customer/booking/tracker.tsx)
  subscribes to `booking:${id}:location` socket events and renders a
  `<Marker>` for `providerLocation` when received.
- [apps/mobile/app/provider/job/active.tsx](apps/mobile/app/provider/job/active.tsx)
  has a one-shot `getCurrentLocation()` call when the provider taps
  "I've Arrived", but no `Location.watchPositionAsync` loop or socket
  emit while the booking is `provider_en_route`.

The customer-side wire is in place (subscription, marker render). The
producer is not — no provider-side code emits the `booking:${id}:location`
event during travel. Earlier marketing copy in
`customer/safety-and-support.tsx` claimed "See your provider's location
on the map while they're on the way to you," which is the kind of
specific promise we cannot keep.

**Resolution at v1.0:**
- `safety-and-support.tsx` copy softened to "Live status updates" —
  describes what actually works (push notifications + status pill
  changes via the existing `booking:${id}:status` socket event +
  refetchInterval). The booking address is still shown on a map so
  customers can confirm the location.
- Dead i18n key `provider.gps.broadcasting` removed from
  `apps/mobile/src/lib/i18n.ts` — no consumer.
- Customer-side socket subscription left in place. It listens for an
  event that never fires today; harmless, and means v1.1 only needs
  to land the producer side.

**v1.1+ scope:**
1. Add `Location.watchPositionAsync({ accuracy: Balanced, timeInterval: 15000, distanceInterval: 50 })` in `provider/job/active.tsx`, gated by `booking.status === 'provider_en_route'`. Cleanup on unmount + status change.
2. Add a server endpoint (or socket message) that accepts `{ bookingId, lat, lng }` from authenticated provider, validates ownership of the active booking, and re-broadcasts to `booking:${bookingId}:location`. Same socket-room pattern as the existing `:status` channel.
3. Battery + privacy review: GPS streaming is a privacy-sensitive feature. Confirm consent copy + opt-out exist before turning on.
4. Boracay-specific: most jobs are <15 min walking distance; the value of live GPS over status pills is moderate. Validate with first 50 launch bookings whether providers + customers actually want this before building it.

**Operator obligation:**
- If a customer asks "why isn't the provider's pin moving?" — direct
  them to status updates (provider_en_route → provider_arrived →
  in_progress). Do not promise live GPS.

**Source:** Phase 106 audit (2026-05-05).

---

## 33. Wallet top-up webhook idempotency not constraint-enforced (audit, 2026-06-04)

**STATUS: RESOLVED (2026-06-04, migration 133).** Implemented event-level
idempotency exactly as the refined plan below describes: a `webhook_events`
table (event_id PK), claimed `'processing'` at the start of `POST /paymongo`,
marked `'done'` on success, and DELETEd on failure so PayMongo's retry
reprocesses (which also fixes the lost-credit case). Duplicate/concurrent
deliveries are skipped via `ON CONFLICT DO NOTHING`. Behavioral test:
`webhook-idempotency.test.ts`. Original analysis kept below for history.


**What works today:** The PayMongo `payment.paid` webhook for a wallet top-up
credits the wallet, and the common replay case is guarded: the handler skips if
`payment_intents.status === 'succeeded'` (which is flipped before crediting), so
PayMongo's normal retries do not double-credit.

**The gap:** idempotency is guarded at the application layer, not the database.
Two edge cases remain:
1. **Lost credit (more likely):** in `webhook.routes.ts`, `updatePaymentStatus(... 'succeeded')`
   runs *before* `creditWallet(...)`, and a `creditWallet` failure is caught +
   logged but not re-thrown. If the credit throws (e.g. DB blip), the intent is
   already `succeeded`, so the retry hits the idempotent skip and the credit is
   never made — the customer paid but the wallet was not funded. Recoverable only
   by a manual admin credit.
2. **Double credit (low probability):** two *truly concurrent* deliveries of the
   same event could both read `status='awaiting_payment'` before either flips it,
   and both credit. `wallet_transactions` stores the PayMongo payment id in
   `reference_id` but has **no unique constraint** on it, so nothing stops the
   second insert.

**Why not fixed at v1.0 + refined fix design (audited 2026-06-04):** a unique
index on `wallet_transactions.reference_id` is the WRONG approach — `reference_id`
is written by multiple flows with different semantics (generic `creditWallet`,
booking.service:~1575, customer-admin wallet adjust), so a constraint there could
reject legitimate rows. The RIGHT fix is **event-level idempotency**, which also
covers booking-payment events, not just top-ups:

1. New table `webhook_events (event_id TEXT PRIMARY KEY, status TEXT
   ['processing'|'done'], event_type, received_at, completed_at)`. The PayMongo
   event id is `req.body.data.id` (stable across retries; distinct from the
   nested payment id).
2. At the start of `POST /paymongo` (after signature verify): claim via
   `INSERT … (event_id,'processing') ON CONFLICT DO NOTHING RETURNING`. If no row,
   look up the existing: `done` → idempotent 200 skip; `processing` → a concurrent
   delivery, return 200 (PayMongo retries later).
3. After the switch completes: `UPDATE … SET status='done'`.
4. On throw (the outer catch, before `next(error)`): `DELETE` the claim so the
   PayMongo retry reprocesses — this also fixes the "lost credit" case (#1),
   because a `creditWallet` failure no longer leaves the intent permanently
   `succeeded` with no credit.

This is HIGH blast radius (the webhook processes ALL payment events — booking
payments + top-ups), so it needs a dedicated session with webhook tests, not a
tail-of-marathon edit. Until then: the common replay is already guarded by the
`intent.status==='succeeded'` check, and ops should monitor `Wallet top-up credit
failed` log lines (case 1 = a customer owed a manual credit).

**Source:** Payment/webhook audit (2026-06-04; fix design refined same day).

---

## 34. Audit 2026-06-04 — items deferred to v1.1 (idempotency / abuse-vector hardening)

These were found in the 2026-06-04 deep audit. They are lower-probability or
product-decision items that need careful, test-backed changes (money-path
migrations or auth-path edits) rather than a rushed fix; the clear/safe findings
from the same audit were fixed and shipped. None is a high-probability exploit on
the current single-server, single-worker deployment.

1. **RESOLVED (2026-06-04, commit on master + migration 132).** Recurring
   auto-charge is now idempotent: `recurring_instances` has a unique key on
   `(recurring_booking_id, scheduled_date)` and `processRecurringBookings` claims
   the instance via `INSERT ... ON CONFLICT DO NOTHING` before creating the
   booking, skipping the cycle if already claimed. Behavioral tests in
   `recurring-idempotency-gate.test.ts`. Original finding below for history:

   ~~Recurring auto-charge idempotency (currently prevented by config — fix
   needed before scaling out workers).~~ `processRecurringBookings`
   (`recurring.service.ts`) selects due series without a row lock, and
   `recurring_instances` has no unique key on `(recurring_booking_id,
   scheduled_date)`. In theory two concurrent/retried cron runs could create two
   bookings + two charges for one cycle. **Why it can't happen today:** the
   scheduler `Worker` runs `concurrency: 1` (`workers.ts:493`), the
   `recurring-process` repeatable job sets no `attempts` (BullMQ default 1 → no
   retry), and the deployment is a single API container — so the job never runs
   concurrently or re-runs. The code also advances `next_booking_date` before
   charging. **This becomes a real double-charge risk the moment a second worker
   process / API replica is added.** Before horizontal scaling, do the **v1.1
   fix:** add a unique index on `recurring_instances(recurring_booking_id,
   scheduled_date)`, claim the instance FIRST with `ON CONFLICT DO NOTHING` as the
   idempotency gate (skip if already claimed), and wrap per-series
   create+advance+charge in one transaction. NB: the 3 tests that drive
   `processRecurringBookings` prime `db.query` with ordered `mockResolvedValueOnce`
   chains, so they must be re-sequenced as part of that change.

2. **OTP verify race — RESOLVED (2026-06-04).** `verifyOtp` (`auth.service.ts`)
   used to check `is_used = FALSE` then mark used without a `FOR UPDATE` lock, so
   two simultaneous submissions of the same valid code could both succeed (a
   duplicate session, and on first-time signup, potentially two user rows). Fixed:
   the OTP lookup + consume now runs inside `db.transaction` with
   `SELECT ... FOR UPDATE`, mirroring the refresh path. The loser of the race
   blocks until the winner commits, then re-evaluates the `is_used = FALSE`
   filter, finds no row, and is rejected with "no valid code". The
   attempts-increment / max-attempts branches return an outcome (instead of
   throwing inside the trx) so the rate-limit UPDATE still commits. Tests:
   `auth-otp-hash-crit-n12.test.ts` (FOR-UPDATE-shape + loser-rejected cases).

3. **Referral referee bonus timing (product decision).** `redeemReferralCode`
   credits the referee's wallet immediately on code redemption, before they
   complete any booking. Self-referral is blocked, but this still allows
   sign-up-and-withdraw farming. This is a deliberate-looking incentive choice, so
   it's Ken's call: either keep it (instant incentive) or move the referee credit
   to fire after their first completed+paid booking (like the referrer credit
   already does via `creditReferrerAfterBooking`).

**Source:** Deep audit (2026-06-04). Auth, messaging, dispute, address, payout,
notification, and staff authorization were all audited and confirmed correct.

---

## 35. Deep-audit 2026-06-04 (wave 2) — high-priority hardening needing dedicated work

These were surfaced by the wave-2 deep audit. The contained, safe fixes from the
same wave shipped immediately (socket typing authorization; tip phantom-charge
rowCount guard). The items below are real and important but need careful,
test-backed money-path or infra changes — NOT a tail-of-session edit.

### 35a. KYC documents readable by direct URL — CODE RESOLVED (2026-06-04); one infra step pending Ken
Government ID front/back, NBI clearance, and selfie were uploaded via the generic
`/api/v1/uploads` flow and stored with **direct, non-expiring CDN/S3 URLs**, so
anyone with the URL could read the document — an NPC RA 10173 exposure.

**Code shipped (2026-06-04):**
- Authenticated proxy endpoints serve KYC docs server-side (owner or
  admin/super_admin/dpo only): `GET /api/v1/providers/me/kyc/:docType` and
  `GET /api/v1/admin/providers/:id/kyc/:docType` (`kyc-document.service.ts` +
  `upload.service.getObjectStream`/`extractObjectKey`, reading from
  `KYC_S3_BUCKET`).
- API responses **no longer emit the raw storage URL** for KYC fields — only the
  protected proxy path (`provider-admin.service.ts`). The admin dashboard's
  "view" links now fetch through the proxy with the admin session and open the
  blob (`ProviderDetailPage.tsx`).
- Tests: `kyc-document-access-35a.test.ts` (owner-allowed / other-provider-403 /
  customer-403 / admin-allowed / missing-doc-404 / key extraction).

**Also shipped (2026-06-04, second pass):**
- **Presigned-URL option** (the alternative serving mode): both KYC routes accept
  `?mode=link` and return a short-lived signed URL (`@aws-sdk/s3-request-presigner`,
  authorized via Ken's product decision), enforcing the same owner/admin authz
  before minting the link; falls back to streaming when S3 isn't configured.
- **KYC uploads are now private-by-default**: the `onboarding` upload context
  writes the object with a `private` ACL + `no-store` cache, so new KYC files are
  never publicly readable by their storage URL. Tests:
  `kyc-document-access-35a.test.ts`, `upload-magic-bytes-35c.test.ts`.

**Production findings (2026-06-04) that change the remaining work:**
- Prod has **0 KYC documents** (5 providers, all gov-ID/NBI/selfie null) — so
  there is **nothing to migrate**. The "copy existing files" step is moot.
- The configured DigitalOcean Space (`onservice-uploads`) is **not reachable
  with the current credentials** (NoSuchBucket on both path- and virtual-host
  addressing) — i.e. **S3 uploads are not actually working in production yet.**
  This is a separate pre-launch item: the Space/region/credentials must be
  corrected (or the Space created) before any uploads — KYC or booking photo —
  work in prod. Tracked as item 36 below.

**Remaining (Ken):** once the Space is reachable, confirm KYC objects are private
(new uploads already are; there are no old ones to fix). Runbook:
`docs/runbooks/kyc-private-bucket.md`. With the proxy + private-by-default
uploads + presigned option all shipped, no further code is required for §35a.

### 35b. Refund / escrow money operations are not fully atomic
- `payment.service.processRefund` — **RESOLVED (2026-06-04).** Pre-fix it read
  `refunded_amount`, called PayMongo, then UPDATEd with no transaction or lock, so
  concurrent refunds for one booking could race. Now wrapped in a `db.transaction`
  that locks the booking's `payment_intent` row `FOR UPDATE`, re-validates the
  cumulative cap at write time, calls PayMongo while holding the lock, then
  UPDATEs; a PayMongo failure in prod rolls the trx back so no partial state is
  recorded. Test: `b-crit01-crit02-partial-refund.test.ts` (FOR-UPDATE shape).
- `escrow.service.refundFromEscrow` debits escrow in a trx, then calls
  `processRefund` OUTSIDE it. A mid-failure leaves escrow debited but the intent
  not updated. **Mitigated (2026-06-04):** every caller now enqueues a
  gateway-retry on failure (see below), so the eventual-consistency retry brings
  the intent in line. Full single-transaction atomicity (escrow ledger +
  PayMongo) is impractical because PayMongo is an external call; the retry queue
  is the accepted reconciliation path. Tracked for the v1.1 rework below.
- `dispute.service` (resolveDispute / acceptPartialOffer / addProviderResponse) —
  **RESOLVED (2026-06-04).** Pre-fix these three paths committed the booking to
  `status='resolved'` and then, post-commit, called `refundFromEscrow` /
  `releasePartialEscrow` / `releaseEscrow` inside a `try/catch` that **logged and
  swallowed** any failure — so the dispute read "resolved" while no money moved
  and nothing was scheduled to reconcile it (the provider split never released).
  Fixed by making all three enqueue the failed action on the gateway-retry queue
  (the same MED-N28 pattern the canonical admin path `dispute-admin.service`
  already used), so the refund/release eventually completes. Test:
  `dispute-refund-enqueue-35b.test.ts`.

These are low-probability today (refunds/disputes are admin-driven and serialized
in practice) but are real correctness/money-integrity gaps.

> **Newly found while fixing §35b (low-probability, retry-only) — `refund_from_escrow`
> retry can double-debit escrow.** The gateway-retry worker's `refund_from_escrow`
> action replays the WHOLE `refundFromEscrow` (escrow ledger debit + PayMongo). If
> the original post-commit call committed the escrow debit and then PayMongo
> failed, the enqueued retry re-debits the platform-escrow wallet. It only fires
> when a refund's PayMongo leg fails after the escrow leg committed (rare), and
> the existing `handleCancellation` + `dispute-admin` paths already carry the same
> latent issue — the §35b dispute fix did not introduce it, it made those paths
> consistent. **v1.1 fix (proposed):** split the escrow-ledger move (do it inside
> the resolution transaction, atomic with the status flip) from the PayMongo leg
> (post-commit), and add a `paymongo_refund_only` retry action that replays ONLY
> `processRefund` (which is now itself `FOR UPDATE`-locked and cap-revalidated, so
> it is safe to replay). Then no retry ever re-touches the escrow ledger.

### 35c. File-upload defense-in-depth — RESOLVED (2026-06-04)
Pre-fix: `upload.service.validateFile` checked the CLIENT-SUPPLIED MIME +
extension only (both spoofable — an HTML/script or executable could be stored
and CDN-served while declaring `image/jpeg`/`.jpg`), and there was no per-user
upload quota (10MB×10 per request, unbounded total requests). Fixed:
1. **Content sniffing.** `saveUploadedFile` now calls `assertImageMagicBytes`,
   which inspects the actual leading bytes and accepts ONLY genuine JPEG
   (`FF D8 FF`), PNG (`89 50 4E 47 …`), or WebP (`RIFF…WEBP`), and rejects a
   declared MIME that doesn't match the real content. Central in
   `saveUploadedFile`, so every path (generic `/`, booking-photo, signature) is
   covered. No new dependency — `file-type` is ESM-only; the three signatures
   are short and stable, so we sniff inline.
2. **Per-user upload quota.** New `uploadRateLimitMiddleware` (Redis-backed,
   keyed by authenticated user id, default 30 requests/min, operator-tunable via
   `upload_rate_limit_*` settings) on all three upload POST routes. Combined with
   multer's per-request file cap this bounds total stored objects per user.

Tests: `upload-magic-bytes-35c.test.ts` (accept real JPEG/PNG/WebP, reject
script payload + MIME mismatch, no S3 PUT on rejection). (Path traversal was
already prevented — the client filename is never used as the storage key.)

**Source:** Deep audit wave 2 (2026-06-04). Socket auth, JWT re-validation, socket
rate-limiting, admin-room isolation, and the many atomic money paths
(releaseEscrowInTransaction, debitWalletInTransaction, requestPayout,
redeemReferralCode, redeemPoints) were audited and confirmed correct.

---

## 36. Production object storage was misconfigured — RESOLVED 2026-06-04 (now local disk on the Hetzner box)
The server `.env` pointed `S3_*` at a **DigitalOcean Space**
(`onservice-uploads` @ `sgp1.digitaloceanspaces.com`) — but the project runs on
**Hetzner only** (no DigitalOcean account), so those were stale placeholder
values and every storage call returned **NoSuchBucket**. Net effect: file
uploads (provider KYC, booking photos, chat attachments, avatars) did not work
in production. Masked because prod is pre-launch with no real uploads (5 seed
providers, 0 KYC docs) — so there was nothing to migrate.

**Fix (shipped):** switched production to **local-disk storage on the Hetzner
server**, which is the infra Ken actually has. `docker-compose.prod.yml` now:
sets `S3_BUCKET=""` (forces the local-FS backend), `UPLOAD_DIR=/app/uploads`,
`UPLOAD_BASE_URL=https://api.onservice.ph/uploads`; mounts a persistent
`uploads_data` named volume into the API (rw) and nginx (ro). The Dockerfile
pre-creates `/app/uploads` owned by `node` so the volume is writable. nginx
serves `/uploads/` publicly (booking photos) but **returns 404 for
`/uploads/onboarding/`** (KYC), which is reachable only via the authenticated
API proxy. No external object store, no new credentials.

Future option (not required): move to Hetzner Object Storage (S3-compatible) by
setting the real `S3_*` values — the app already supports it and KYC privacy
(private ACL + proxy + presigned) would then apply. Local disk is fine for a
single-box launch; just include `uploads_data` in the backup plan.

---

## 37. Admin 2FA (TOTP) temporarily bypassable via ADMIN_DISABLE_2FA (staging — must address before production)
At Ken's request (2026-06-05), admin login can be reduced to email + password by
setting `ADMIN_DISABLE_2FA=1`. When set, `/auth/admin/login` skips both the
TOTP-verify and the forced-enrollment branches and issues the session directly;
a loud `logger.warn` fires on every such login. The flag defaults OFF (secure):
with it unset, mandatory TOTP enrollment is unchanged.

**Currently ON** on the staging server (`.env`) because the authenticator-app
flow was impractical to set up in BlueStacks for testing.

**Before production launch — do ONE of:**
1. Unset `ADMIN_DISABLE_2FA` to restore mandatory TOTP 2FA, OR
2. Implement SMS/email admin-login 2FA (Ken's stated preference) and require it.

Leaving admin accounts on password-only in production is a security risk
(no second factor on the most privileged accounts).

**Production hard-stop now in place (A1, 2026-06-06).** A boot guard
(`assertAdmin2faNotDisabledInProduction` in
`packages/api/src/config/boot-guards.ts`, called from `server.ts` before the
port is bound) throws and refuses to boot if `ADMIN_DISABLE_2FA` is truthy AND
`NODE_ENV=production`. So the flag can no longer reach production silently — a
prod deploy with it still set crashes on startup with a clear message. Staging
(where it is currently ON) is unaffected. This does not by itself satisfy the
"do ONE of" list above; it just makes option 1 mandatory before prod boot.
