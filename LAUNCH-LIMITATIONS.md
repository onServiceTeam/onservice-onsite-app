# LAUNCH-LIMITATIONS — onService Onsite App

This file records known limitations, unresolved defects, launch blockers and
their resolution history. An entry here is not automatically an accepted v1
trade-off or permission for operators to work around a safety hold. Keep each
original finding and its later evidence; do not delete a limitation to make
the product appear ready.

**Current-state note, 2026-09-05:** Ken approved engineering work on the existing
escalations. E32 SSH authentication is resolved, so older references below to
access preventing all server inspection are historical. The correct production
checkout has been verified, recovery tested, and its pending SQL migrations
rehearsed in isolation. That is not a live rollout or closure of the underlying
feature, money, privacy, legal or operational requirements. Use
[the resumption evidence ledger](docs/audits/AUTONOMOUS-RESUMPTION-2026-09-05.md)
for later checkpoints. Historical screen/test counts and phase-era launch
claims below require current evidence, not automatic acceptance.

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

The server-side `reassignBookingProvider` now independently validates the
chosen provider before applying the swap. A crafted request cannot assign an
inactive, unapproved, unavailable, service-ineligible, or out-of-radius
provider, and a booking without exact coordinates cannot be reassigned.
Working-hours/schedule filtering remains outside manual reassignment because
an operator may be handling an exception after confirming availability.

## 2. Dispatch console — operational map and safe cancellation handoff — RESOLVED, accuracy corrected 2026-08-30

**Where:** Leaflet map, attention queue, and booking actions within the Dispatch console.

**Status:** RESOLVED. Phase 200 supplied the initial map; W6 corrected the
operator contract and removed unsafe capability claims.

History: the D10 closeout claimed a `cancel-preview` refund-preview endpoint
and a working map; neither existed (E06). Phase 200 fixes:

- **Operational map works.** `listBookingsAdmin` and `listProviders` /
  `formatBookingAdmin` / `formatProvider` now return the `latitude`/
  `longitude` that already existed on the `bookings`/`providers` tables, so
  the Leaflet map plots booking service locations and the saved service bases
  of providers currently accepting work. These are not live device positions.
  Verified by `apps/admin/src/pages/__tests__/dispatch-map-phase200.real.test.tsx`
  and `bug-ux-473-dispatch-truth-links.real.test.tsx`.
- **Map tiles are admin-configurable.** New `dispatch` settings category
  (migration `127_phase200_dispatch_map_settings.sql`) holds `map_tile_url`,
  `map_tile_attribution`, and an optional publishable `map_tile_api_key`.
  Edit them at **/admin/settings → Dispatch & Map**. Defaults to
  OpenStreetMap (no key required); paste a MapTiler/Mapbox URL with
  `{apiKey}` for production tiles.
- **Active-bookings table** now returns live bookings (`status=active`
  expands to the canonical active-status set; pre-fix it matched a literal
  `b.status = 'active'` and was always empty).
- Dispatch derives an **Attention queue** from the current booking feed for
  unassigned, overdue, or coordinate-incomplete work. It does not claim an
  `alert:new` event stream that the API does not publish.
- The quick cancel dialog was removed. **Review cancellation** opens Booking
  360, where the operator must inspect the money trail and explicitly enter
  the live money-path inputs. This does not resolve the E09 mismatch between
  displayed policy configuration and runtime cancellation math.

Remaining held item: live ETA and real-time GPS movement. Dispatch deliberately
shows the scheduled time rather than manufacturing an ETA. See section 32
before adding any location producer or operational promise.

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

## 5. Consent versions — no forced re-consent on publish — RESOLVED, activation corrected 2026-09-03

**Where:** [apps/admin/src/pages/ConsentVersionsPage.tsx](apps/admin/src/pages/ConsentVersionsPage.tsx)

**Status:** RESOLVED — opt-in `material` flag plus effective-date activation.
**Resolution:** `complianceAdmin.publishConsentVersion` now accepts an
optional `material: boolean` (defaults to `false`, preserving the legacy
marker-only semantics). Publication writes its audit event immediately. When
the operator passes `material: true`, every user who previously granted an
OLDER version of that consent type is considered "pending re-consent" only
after the recorded `effectiveAt` timestamp has arrived. A future material
version remains scheduled, and any earlier active material version remains
authoritative until then. Missing or malformed timestamps on legacy publish
events fall back to the original publication time without rewriting history.
A customer-facing endpoint
`GET /api/v1/compliance/my-pending-consents` returns the outstanding
items per user; mobile `customer/data-rights.tsx` surfaces a banner with
an inline "I agree" button that calls `POST /api/v1/compliance/consent`
with the latest version. Users who explicitly REVOKED an earlier version
are intentionally not in the pending list — their opt-out is respected
and any surface that needs the consent must trigger its own opt-in
flow. The decision of which publishes are material is captured at
publish time (operator UI passes `material: true`) and is not applied
retroactively, so historical publishes remain inert. See
`packages/api/__tests__/launch-limit-5-material-reconsent.test.ts` and
`packages/api/__tests__/bug-ops-386-consent-effective-date-activation.test.ts`
for behavioral coverage.

## 6. Admin booking-participant support messaging — RESOLVED, corrected 2026-08-30

**Where:** Dispatch console and Booking 360 "Support message" actions.

**Status:** RESOLVED. `sendAdminMessageToBookingParticipants` in
`booking-admin.service.ts` upserts the canonical booking conversation and
writes a system message plus the `admin_message_sent` audit record in one
transaction. When a provider is assigned, the message is visible to both
booking participants and both receive notice; before assignment it is
customer-only. Ordinary admins may use this communication action. It does not
grant them reassignment, cancellation, refund, or other money authority.

## 7. NPC escalation reference format — RESOLVED

**Where:** Data Protection Log → Escalate to NPC dialog.

**Status:** RESOLVED via Phase 14 D08 (Bug 398) and tightened by
MED-N123 (Phase N). The npcReference field is validated server-side
against `^NPC-\d{4}-[A-Z0-9]{6,12}$` in
`compliance-admin.service.escalateDsrToNpc`. Free-text input is
rejected with a 400 + clear message; the 6-12 char suffix bound
prevents log-pollution / DOS.

## 8. Erasure DSRs did not start the deletion workflow — RESOLVED 2026-05-02

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

This item resolves workflow linkage only. It does not mean every personal-data
field and physical object is erased. The unresolved retention-and-erasure scope
is recorded separately in limitation 45 and E21.

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

## 11. CAPTCHA client/server linkage — CODE RESOLVED; PRODUCTION KEY PENDING

The earlier hCaptcha plan was superseded. Customer/provider OTP login and
registration now use Cloudflare Turnstile after the configured failed-attempt
threshold:

- `useCaptchaOtp` handles the API's challenge-required response and opens the
  shared Turnstile modal on native and web.
- The public site key comes from `EXPO_PUBLIC_TURNSTILE_SITE_KEY`.
- `securityService.verifyCaptchaToken` validates each returned token at
  Cloudflare's Siteverify endpoint using the server-only
  `TURNSTILE_SECRET_KEY` (the historical `CAPTCHA_SECRET_KEY` alias remains
  accepted during deployment migration).
- Production fails closed if the secret is missing. Rate limiting remains in
  force before and after a challenge.
- Launch cutover Item 5 now runs `scripts/verify-turnstile.sh`; it rejects
  Cloudflare test credentials and verifies that Siteverify accepts the
  configured production secret.

The admin app has no public registration or self-service password-reset form,
so it does not load a CAPTCHA widget. Its CSP no longer grants obsolete
hCaptcha origins. Any future anonymous write surface must use the same
client-token plus server-validation pattern before its database write.

**Deployment finding (2026-08-24):** the live shared host has neither a real
Turnstile secret nor a Cloudflare API token that could provision one. The
dangerous OTP and rate-limit bypasses have been removed, but the API cannot be
truthfully switched to `NODE_ENV=production` because its production secret
guard correctly requires a CAPTCHA secret. Create production Turnstile keys,
set the server secret and web/native site key, run `verify-turnstile.sh`, rebuild
the customer/provider web artifact, then change the environment label.

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
    with current scrypt N, clears the flag, increments the session generation,
    removes refresh sessions, revokes CSRF tokens, and audits in one transaction.
    After commit it disconnects the account's live sockets.
- **Routes** (security.routes.ts):
  - `GET /api/v1/security/admin/legacy-password-stats` (any admin tier)
  - `POST /api/v1/security/admin/flag-legacy-password-hashes`
    (super_admin only)
  - `POST /api/v1/security/admin/me/change-password`
- **Runtime enforcement** — admin login + 2FA responses include
  `mustRotatePassword`, but React is not the security boundary. Canonical HTTP
  middleware returns `428 password_rotation_required` outside identity,
  own-password, and logout boundaries; the special 2FA middleware applies the
  same rule to normal access sessions; Socket.IO rejects a flagged handshake;
  and a campaign disconnects newly flagged live sockets immediately.
- **Current-browser continuity** — successful replacement invalidates every old
  access/refresh/CSRF/socket session, then issues one new cookie session to the
  browser that verified the old password.
- **Tests** — the original focused suite plus SEC-036/041/042 and Admin
  UX-1025 execute the transaction, route, socket, server-error-code, and client
  redirect behavior.

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
window with low expected throughput. The processor now also retries rows left
in `processing` after an interrupted run and revalidates bookings, disputes,
and wallet balances before anonymization; new blocking activity defers the
request instead of stranding work or money. Future work: enqueue one BullMQ
job per expired request to a dedicated `account-anonymization` worker,
preserving per-row resilience while removing the synchronous per-row
DB cost from the cron path. Not blocking launch.

2026-10-08 concurrency correction, candidate only: OPS-521/522 make session
renewal and the existing partial anonymization transaction lock the account
before refresh tokens. Real PostgreSQL tests reproduce the old inversions and
verify both operation orderings and rollback. This does not close the separate
eligibility/claim gap: booking/dispute/balance checks still occur outside the
cascade transaction, and request claiming/completion are separate writes.
The historical "not blocking launch" classification above applies to per-row
throughput, not acceptance of those races or the unresolved E21/E43 retention
and DSR requirements. No retention scope or live records changed. Evidence:
`docs/audits/ACCOUNT-SESSION-LOCK-ORDER-2026-10-08.md`.

## 18. axe-core wired in dev console; automated assertion deferred (Phase 13 Dispatch F)

**2026-09-05 correction:** the "no test runner" rationale below is obsolete.
Admin now has Vitest, jsdom and Testing Library configuration, and the complete
Admin CI job executes those tests. That does not establish a complete automated
accessibility pass. Keep accessibility acceptance open until its actual checks
and screen coverage are inspected. The original rationale follows as history.

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

**Production remediation (2026-08-24):** an older operations document had
published a demo password, and one active privileged account still matched it.
After a full database/uploads/config/git backup, that exact account was
deactivated, its 13 refresh sessions were revoked, forced rotation was set, and
an `account_deactivated` security event was written. The remaining active
privileged account has TOTP enabled. The exposed credential remains burned
forever because public Git history cannot make it secret again.

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

Current enforcement was re-checked on 2026-08-24. All Gate A fragments and all
Gate C articles listed below have been promoted to BLOCKING. Only the two
infrastructure-dependent whole gates remain in REPORT:

| Fragment / article | Owning dispatch |
|---|---|
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
  protection/* setting keys remain immutable history. Migration 153 marks
  those rows inactive so they do not appear as editable v1.0 controls;
  server code paths do not read them. A future licensed/partnered product
  would need an explicit migration and complete claims pipeline to reactivate
  them.
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

## 24. Hourly-pricing subcategories — RESOLVED by D27 (originally deferred in Phase 14 Dispatch 05)

**Resolution date:** 2026-06-29.
**Risk class:** Money-path behavior; implemented with a capped pre-authorization.
**Owning area:** booking, escrow settlement, provider payout, customer/provider UI,
and admin catalog configuration.

Phase 14 originally rejected `pricing_type = 'hourly'` at booking time. D27
subsequently implemented Option B from `.ai-coder/decisions/D27p4-hourly-pricing.md`
and lifted this limitation:

- Admin configures a positive hourly rate plus minimum billable minutes, billing
  increment, and maximum estimated hours.
- Customer discovery and provider profiles show the canonical hourly rate. The
  booking flow collects estimated hours and previews the capped amount.
- The server, not the client, resolves the pre-authorized amount from the
  estimate and catalog snapshot.
- Actual duration comes from server-controlled job timestamps, is rounded using
  the configured rules, and cannot bill above the customer's authorized cap.
- Settlement refunds the unused escrow remainder and computes provider earnings,
  platform commission, fees, surge, and promo effects from the settled amount.
  Time above the cap is unpaid unless an approved change order increases it.

Primary behavioral coverage is in
`packages/api/__tests__/d27-hourly.test.ts`,
`packages/api/__tests__/services/booking/booking-pricing-resolution.test.ts`, and the
customer/provider linkage tests under `apps/mobile/__tests__/bug-ux-046-*` and
`bug-ux-048-*`.

**Continuing operator obligation:** keep the current policy visible and
consistent: one-hour minimum, 30-minute increments, capped overage, and the
configured maximum estimate. A future policy change is a money-path change and
requires corresponding server and settlement tests.

**Decision history:** `.ai-coder/decisions/D05-spec-vs-schema.md` records the
original deferral. `.ai-coder/decisions/D27p4-hourly-pricing.md` records the
later delegated decision and shipped implementation.

---

## 25. In-app chat delivery evidence (Phase 14 Dispatch 07; code remediated 2026-08-25)

**Bug 38** (audit reference) originally recorded provider/customer chat
threads as readable while mobile outbound text and photo delivery was
unreliable. That historical launch limitation is now **code-resolved**:

- Both customer and provider chat use the canonical messaging REST send path.
- Chat photos upload first and are then sent as image messages containing the
  returned URL.
- Socket room subscriptions receive newly delivered messages without requiring
  an app restart.
- Provider job-context navigation now uses the route registry instead of a
  hand-built route.
- Real rendered behavior coverage exercises provider text and uploaded-photo
  sends in `bug-ux-372-provider-chat-send-paths.real.test.tsx`; the surrounding
  chat workspace, support-record, truth, and screen suites remain green.

**Remaining release evidence:** this code result does not substitute for a
two-device production delivery exercise. Before launch sign-off, send customer
→ provider and provider → customer text and photo messages on two real devices,
confirm foreground and background receipt, and retain the evidence with F#3.

**Operator obligation:** support should treat in-app chat as the normal
coordination record. Job proof still belongs in the provider job-photo flow,
and dispute evidence still belongs in the dispute evidence flow, because those
surfaces have the correct retention and case linkage. Escalate a delivery issue
with booking, conversation, sender, recipient, timestamp, and app-version data;
do not direct users to an undocumented `Call provider` workaround.

**Source decision:** D07 plan + `.ai-coder/dispatches/D07-closeout.md` —
chat scoped out of D07's provider-job-execution-trust focus per spec
(line 873: `Bug 38 — chat deferred to v1.1`).

**Source:** Phase 14 Dispatch 07; UX-031, UX-032, UX-227, and UX-372 remediation.

---

## 26. NPC RA 10173 compliance posture (Phase 14 Dispatch 08)

**Historical phase claim, not a current compliance sign-off.** The broad launch
statement and post-launch classification below are superseded by the current
launch-cutover requirements and the unresolved privacy/retention/document
work in sections 45, 46 and 57. Engineering approval is not qualified legal
review, registration evidence or proof of production operation. Do not use
this old checklist to tell customers that compliance has been certified.

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

**2026-09-05 implementation boundary:** manual review remains the direction,
but the historical steps below overstate corrections/resubmission. The new
compatibility queue projects real pending provider applications and delegates
approval/rejection to Provider 360. A send-back request is still explicitly
rejected until the durable revision workflow exists; do not promise that step
8 works. Section 52 and the E74 resumption ledger track the remaining lifecycle.

v1.0 launch ships with **manual admin review** of every provider
application. No automated liveness vendor (Onfido / Persona / similar)
is contracted at launch.

**Current flow (Bug 1194 + 1195 deferral path):**
1. Provider completes seven application steps plus the appropriate status
   screens. Identity verification delegates to the canonical Documents step
   instead of maintaining a second upload path.
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
- Capacity planning must use actual application volume across enabled service
  areas. The platform is city-agnostic and the first/default market is Metro
  Cebu; the historical Boracay estimate is not a current operating assumption.
- Admin Provider Review queue surface (D10 admin dispatch console
  wire-up) presents the queue with applications sorted oldest-first.
- Pending applicants retain customer access while manual review is underway.
- Do not promise a review SLA that operations has not approved. The API retains
  legacy `estimated_review_hours` / `estimatedDecisionAt` fields for backward
  compatibility, but the provider app does not present them as a product
  promise. Current status copy says that the team will notify the applicant
  after review.

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

**Historical deferral, superseded by the audit-remediation bar.** F#3 native
visual baseline evidence remains required before the launch-ready tag, not an
optional v1.1 task. The original bridge tests and claims that every screen was
working are not current acceptance evidence. The full customer/provider/admin
Stitch audit still requires screen-specific rendered and behavioral evidence.

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
provider.* i18n namespace.

**W6 v1.0 correction (2026-08-30):** `useJobGpsBroadcast` remains dormant
infrastructure and is not mounted into the provider or staff route layouts.
No v1.0 screen starts its producer and no operational GPS endpoint volume is
expected. The first release that activates it must complete the privacy,
consent, foreground-service, ownership-validation, and store-disclosure work
in section 32.

**Current correction (2026-08-25):** the historical per-screen deferral below
is no longer the current state. The permanent screen ledger accounts for all 62
provider, provider-onboarding, and provider-staff route files. The staged Stitch
and responsive audit through UX-353–UX-372 has applied tablet/desktop workspace
layouts, accessibility controls, live-contract wording, pricing-model display,
and behavior tests to the provider operating surfaces. The repository contains
89 Maestro flows across roles; F#3 device baseline capture, not flow authoring,
is still pending. Provider public review replies have also shipped.

The remaining provider limitations are:

- F#3 real-device/emulator visual-baseline capture for the authored Maestro
  flows. Rendered behavior tests remain the regression gate; source-content
  checks and snapshots are not accepted as substitutes.
- **Per-area pricing** (Bug 1231) — providers cannot set different
  rates for different service areas in v1.0. Single base rate per
  service. v1.1 adds area-modifier table.
- **Suki custom discount** (Bug 1245) — providers cannot set custom
  discount codes for repeat customers in v1.0. v1.1 ships the
  redemption pipeline as part of the promo-code v1.1 work.
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
- Do not expect or advertise background GPS in v1.0. Any
  `useJobGpsBroadcast` activation or GPS-update endpoint traffic is unexpected
  until section 32 is deliberately approved and implemented.

**v1.1+ scope:** F#3 device baselines, per-area pricing, Suki custom discount,
victory-native chart upgrade, and store privacy disclosure submission.

**Source:** Phase 14 Dispatch 12 + spec PART-3 §"Dispatch 12" lines 1043, 1361-1363.


---

## 30. Promo code redemption pulled for v1.0 (Phase 14 Dispatch 13)

The audit (Bug 44) found that promo codes can be created via the admin
Marketing page and stored in the `promo_codes` table, but the customer
mobile app has no redemption input field. A later backend pass added the
canonical `resolvePromo()` resolver, pricing-preview/create integration, and
redemption recording. Customer redemption remains **pulled** because the UI
and end-to-end customer linkage are not shipped:

- Migration 088 seeds `feature_flag.promo_redemption_enabled = false`.
- Mobile `useFeatureFlags` defaults to `false`. Customer never sees a
  promo input in checkout.
- Admin `MarketingPage.tsx` Promo Codes tab shows a banner explaining
  the unwired state so admins do not waste time creating codes that
  cannot redeem.

**Remaining scope:**
1. Add `PromoCodeSection` to `customer/booking/checkout.tsx`, gated
   on `flags.promoRedemptionEnabled`.
2. Verify preview, booking creation, redemption limits, receipts, cancellations,
   refunds, and admin reporting in one customer-to-admin behavioral flow.
3. Toggle `feature_flag.promo_redemption_enabled = true` via admin
   settings.
4. **Codes created while disabled work when enabled** if their dates, limits,
   and active state still qualify; the row stays in the
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
- Admin A/B list, create, results, and status routes independently return the
  launch hold while the same flag is OFF, so a hidden tab cannot be bypassed
  by a direct request.
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
- Customer-side socket subscription remains a dormant consumer. It listens for
  an event that never fires today. Do not mount the existing provider hook or
  add a producer until the privacy and ownership contract below is complete.

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

**STATUS: RESOLVED (corrected 2026-08-24).** Migration 133's event claim
prevented duplicate processing, but the first implementation still marked the
local intent succeeded before the wallet credit or booking escrow transaction.
The top-up catch also swallowed credit failures. That meant the event could be
marked done, or a retry could see `succeeded` and skip, while the customer had
not received the wallet balance or booking escrow state.

The corrected handler now locks each local intent and commits these records in
one database transaction:

- booking status, escrow ledger, and local payment-intent success; or
- wallet credit ledger and local top-up-intent success.

Failures propagate, roll back every local money write, and delete the event
claim so PayMongo can retry. A wallet-transaction reference check prevents a
second valid event id for the same PayMongo payment from crediting twice.
An interrupted worker's `processing` claim can be atomically reclaimed after
15 minutes; fresh claims still return the safe concurrent-delivery response.
Behavioral coverage: `webhook-idempotency.test.ts`,
`bug-ops-216-webhook-booking-payment-atomic.test.ts`, and
`bug-ops-217-webhook-topup-atomic.test.ts`. `bug-ops-218-webhook-payment-id-required.test.ts`
also rejects a paid event without the immutable PayMongo payment id before any
event claim or money write, and `bug-ops-222-webhook-stale-claim-recovery.test.ts`
proves the stale-claim lease without weakening live concurrency.
`bug-ops-225-webhook-intent-lock-idempotency.test.ts` proves a second valid event
re-reads the serialized local intent and cannot reapply an already-succeeded
top-up. A read-only production check found no pre-existing
partial booking, escrow, top-up, missing-payment-id, or duplicate-hold rows.
Original analysis is retained below
as historical pre-fix context.

**Historical pre-fix behavior:** The PayMongo `payment.paid` webhook for a wallet top-up
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
   delivery, return 200 while the original in-flight handler determines the
   outcome. If that handler fails, its 5xx response releases the claim and
   causes a later PayMongo retry.
3. After the switch completes: `UPDATE … SET status='done'`.
4. On throw (the outer catch, before `next(error)`): `DELETE` the claim so the
   PayMongo retry reprocesses — this also fixes the "lost credit" case (#1),
   because a `creditWallet` failure no longer leaves the intent permanently
   `succeeded` with no credit.

This was HIGH blast radius (the webhook processes ALL payment events — booking
payments + top-ups), so it needs a dedicated session with webhook tests, not a
tail-of-marathon edit. Before the corrected 2026-08-24 implementation, the common replay was guarded by the
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

1. **RESOLVED FOR INSTANCE CREATION (2026-06-04, commit on master + migration
   132).** Recurring booking generation is now idempotent:
   `recurring_instances` has a unique key on
   `(recurring_booking_id, scheduled_date)` and `processRecurringBookings` claims
   the instance via `INSERT ... ON CONFLICT DO NOTHING` before creating the
   booking, skipping the cycle if already claimed. Behavioral tests in
   `recurring-idempotency-gate.test.ts`. This does not make auto-charge safe;
   automatic charging is disabled under limitation #44/E20. Original finding
   below for history:

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
  `processRefund` OUTSIDE it. Full single-transaction atomicity (escrow ledger +
  PayMongo) is impossible because PayMongo is external. **Corrected again
  2026-09-01:** the shared refund primitive now caps against the booking's own
  immutable escrow ledger, credits wallet-funded refunds back to the customer
  wallet in the same transaction, and gateway failure queues
  `process_payment_refund`, which cannot touch escrow. Booking 360 additionally
  creates that payment-only work item inside the same transaction as the local
  refund, support-case note, and admin audit, closing the commit-to-enqueue crash
  window for operator refunds. Its first worker attempt is delayed by ten
  minutes so it cannot race the request handler's immediate payment attempt.
  The normal confirmation, auto-confirm, force-complete, and manual-release
  paths now release a partially refunded booking's ledger remainder using a
  prorated copy of its immutable terms instead of stranding or over-releasing
  the remainder.
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

> **`refund_from_escrow` double-debit risk — RESOLVED IN CODE 2026-09-01.**
> Post-commit payment failures in customer cancellation, admin cancellation,
> dispute refunds, and Booking 360 now enqueue `process_payment_refund`, not a
> second escrow movement. The legacy `refund_from_escrow` action remains only
> for a failure before the local escrow transaction commits. Migration 163
> widens the queue constraint. Behavioral coverage is OPS-283 through OPS-298.

**Remaining external-provider limitation:** the current PayMongo integration
does not send or persist a provider idempotency key for refunds. If PayMongo
accepts a refund but the process dies before the local payment-intent update or
queue-success marker commits, an automatic retry is ambiguous. A missing or
invalid production payment ID now blocks the local payment-intent update and
surfaces reconciliation rather than falsely reporting success. New external
payment authorization is held under E14, so this cannot affect a new launch
transaction while that hold remains. Before E14 is lifted, implement a
gateway-reconciled refund-operation state machine or obtain verified provider
idempotency behavior; do not treat an uncertain network outcome as safe to
blindly replay.

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

## 37. Admin 2FA bypass production guard — RESOLVED IN CODE AND DEPLOYMENT
At Ken's request (2026-06-05), admin login can be reduced to email + password by
setting `ADMIN_DISABLE_2FA=1`. When set, `/auth/admin/login` skips both the
TOTP-verify and the forced-enrollment branches and issues the session directly;
a loud `logger.warn` fires on every such login. The flag defaults OFF (secure):
with it unset, mandatory TOTP enrollment is unchanged.

The flag was historically enabled on a staging/demo deployment because the
authenticator flow was impractical in BlueStacks.

**Deployment resolution (2026-08-24):** the running container was inspected
without printing secrets and was still using the bypass. `ADMIN_DISABLE_2FA`,
`ALLOW_DEV_OTP`, and `RATE_LIMITS_RELAXED` are now all disabled; `DEV_OTP_CODE`
was removed; the API was recreated and passed its deep health check. One active
account using a formerly published demo password was deactivated and all of its
sessions revoked. The one remaining active privileged account has TOTP enabled.

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
production deploy with it still set crashes on startup with a clear message.
Non-production environments remain able to opt in deliberately. This does not by itself satisfy the
"do ONE of" list above; it just makes option 1 mandatory before prod boot.

---

## 38. Automatic provider payouts are not active for launch

The schema can retain a provider's historical daily, weekly, bi-weekly, or
monthly payout preference, but no scheduler or transfer worker exists to run
those cadences. The previous provider screen incorrectly presented them as
working automatic payouts, and Admin Financials relabeled pending manual
requests as “Upcoming Scheduled.” E15 documented this money-path hard stop.

**Launch decision (Ken, 2026-08-24): manual withdrawals only.** Providers request
withdrawals from Earnings. Saved GCash, Maya, InstaPay, or PESONet details can
prefill that request, but saving details never creates a withdrawal or moves
money. Existing non-manual production preference values are preserved and
shown as inactive; this remediation does not rewrite them.

The API rejects new automatic cadence settings, uses the same payout rails as
manual withdrawal, and validates saved destinations through the canonical
payout validator. Admin Financials states the manual workflow and no longer
manufactures a schedule KPI.

The large-payout threshold is an **internal risk-review control**, not a claim
that the app has made an AML filing or statutory determination. Funds stay
reserved while the review is open; a super admin must record a reason to clear
or reject it. Customer/provider/admin labels now say “internal large payout
review,” and append-only migration 154 corrects the legacy schema comments
without rewriting historical status values.

A future automatic payout engine requires a separate product/finance decision
covering Manila-time cutoffs, weekends and bank holidays, fees, wallet holds,
AML, concurrency, retries, destination verification, transfer rails, admin
exceptions, reconciliation, and customer/provider notification behavior. See
`.ai-coder/escalations/E15-provider-auto-payout-engine-missing-2026-08-24.md`.

---

## 39. Fixed provider-service price source is contained; permanent policy is unresolved

Providers could store a personal base price for a fixed service and the customer
provider-profile screen displayed it, while booking creation recorded the admin
catalog price. A read-only production check on 2026-08-24 found that 15 of 20
active fixed provider-service rows differ from the matching catalog price.

This is a customer money-trust blocker even though the server remains protected
from client-trusted prices: the visible amount can disagree with the amount the
server puts on the booking. No production price, booking, wallet, or provider row
was changed during the audit.

E16 requires a product decision among catalog-authoritative fixed pricing,
provider-authoritative fixed pricing, or an admin-configured price source per
subcategory. Catalog-authoritative pricing is recommended for launch because it
matches the existing booking/escrow source with the smallest money-path change.
Safe containment shipped on 2026-08-24: the API preserves every historical
provider price but no longer returns it as the customer price. Provider and
customer service cards now receive the fixed catalog price, which is the same
source booking creation and escrow already use. The provider screen allows
adding/removing services but explains why personal price editing is paused.
Admin Provider 360 now lists the provider's actual subcategory services and the
catalog-backed fixed/hourly/per-unit/range/quote presentation instead of
displaying dormant provider values under a misleading category-price list.
No production provider, catalog, booking, wallet, or payout row was rewritten.

This removes the customer-visible mismatch but does not settle the long-term
business model. Provider-price creation remains accepted for compatibility
with older installed clients, stored values remain dormant, and E16 still
requires a decision before they can affect customer prices. See
`.ai-coder/escalations/E16-provider-service-price-source-contradiction-2026-08-24.md`.

---

## 40. Bare `onservice.ph` is missing from the production TLS certificate

The production server and DNS correctly route `onservice.ph` to
`46.62.207.225`, but the certificate served for that hostname does not include
the apex domain in its Subject Alternative Names. Browsers therefore reject
`https://onservice.ph` before nginx can send its intended redirect to
`https://app.onservice.ph`.

The current certificate is otherwise valid and covers `api.onservice.ph`,
`admin.onservice.ph`, `app.onservice.ph`, and `www.onservice.ph`. Those four
hosts continue to serve normally. The repository's former “DNS + TLS done”
statement was too broad and has been corrected.

Do not remove the apex redirect or weaken certificate checks. Expand or reissue
the existing certificate with `onservice.ph` included, confirm renewal keeps
all five names, reload nginx, and verify every hostname externally. See
`.ai-coder/escalations/E17-apex-domain-tls-certificate-2026-08-24.md`.

---

## 41. Production environment label waits on real Turnstile credentials

The shared live host still reports a non-production `NODE_ENV`. On 2026-08-24
the dangerous behavior controlled by that label was independently neutralized:
developer OTP is off, relaxed rate limits are off, admin 2FA is mandatory, test
fixtures are off, real SMS credentials are configured, and the API is healthy.

The label itself cannot be changed yet. Production startup intentionally fails
when `CAPTCHA_SECRET_KEY` is absent, and the host has no Turnstile secret or
Cloudflare API token. Do not weaken that guard or use Cloudflare test keys.
Provision the real widget credentials, set both server and client keys, execute
the process-level verifier plus a threshold-triggered login challenge, then set
`NODE_ENV=production` and recreate the API.

---

## 42. Escrow releases before the customer dispute window closes

The production configuration auto-confirms provider-completed bookings and
releases escrow after 24 hours, while the API and customer experience continue
to allow and promise disputes for 48 hours after completion.

This is not merely a wording mismatch. After the 24-hour release, the provider
wallet has already been credited. Filing a dispute then changes the booking back
to `escrow_status='held'`, but does not reverse that provider credit. The refund
path debits the shared platform escrow wallet, so a post-release refund could use
funds held for other bookings while the original provider retains the payout.

No production setting or money row was changed during the audit. E18 records the
required decision: hold escrow for the full 48-hour dispute period (recommended),
reduce the customer dispute promise to 24 hours with product/legal approval, or
build a real post-release provider clawback model. The current 24/48 combination
is a launch blocker. See
`.ai-coder/escalations/E18-auto-confirm-dispute-window-contradiction-2026-08-24.md`.

---

## 43. Customer acceptance signatures are attributed to the provider

The provider completion screen asks the customer to draw on the provider's
device, but the upload is made under the provider's authenticated session. The
API therefore stores the provider user in `booking_signatures.signed_by` with
`signed_role='provider'` while labeling the artifact
`signature_type='customer_acceptance'`.

This record does not prove that the booking customer signed, and the provider
can create it without a customer-controlled account action. It must not be
represented to support staff or in legal documentation as verified customer
acceptance.

E19 requires a decision among customer-session signature capture (recommended),
an explicit witnessed-capture model with separate signer/capturer evidence, or
using authenticated customer confirmation without claiming the bitmap is legal
acceptance. No production signature or booking row was changed during discovery.
See
`.ai-coder/escalations/E19-customer-signature-attributed-to-provider-2026-08-24.md`.

---

## 44. Recurring auto-charge is not launch-safe

The recurring auto-charge path is dormant in the current production database,
which had zero recurring rows and zero auto-charge attempts when checked
read-only on 2026-08-24. No customer was exposed and no production money row was
changed during discovery.

The code is nevertheless unsafe to activate. Recurring totals and wallet
balances are already stored in centavos, but the scheduler and auto-charge
service apply compensating 100x conversions. A PayMongo-only or split payment
can therefore send 100 times the intended remainder to the gateway. Successful
charges also move a new booking directly from `requested` to post-service
`confirmed`, create a second misleading PayMongo intent as an audit step, and
lack the customer capture/consent UI that D22 requires.

Provider revalidation/substitution, a real admin alert target, and an operations
reconciliation surface are also missing. Do not populate recurring payment
tokens or expose auto-charge controls until the dedicated money-path remediation
in E20 is implemented and sandbox-tested end to end. Manual recurring booking
generation and manual payment remain the safe path.

Safe containment landed through Bugs UX-189-191/196: the activation endpoint now
returns 503 before storing a token; the scheduler never invokes the unsafe charge
service even if a legacy row says auto-charge is enabled; and API responses hide
stored payment/source IDs while reporting the preference as disabled. New series
explicitly store the preference off, and migration 152 makes that the schema
default without altering existing rows. Clearing a
legacy preference and reading its attempt history remain available. This does not
resolve the underlying money-path design. See
`.ai-coder/escalations/E20-recurring-auto-charge-not-launch-safe-2026-08-24.md`.

---

## 45. Account erasure needs an approved retention matrix

The account-deletion cascade anonymizes the core user record, invalidates
sessions, removes addresses, redacts sent message text and review comments, and
deactivates provider services. It does not delete every personal-data field or
physical upload. Booking addresses, photos/signatures, chat images, dispute and
support content, provider identity/tax/payout details, and legally relevant
financial/compliance records can remain.

Deleting every record without a policy may violate tax, AML, reconciliation,
fraud, or legal-claim retention duties. Retaining everything indefinitely is
also not acceptable. E21 requires an attorney/DPO-approved table-and-object
retention matrix before complete erasure can be claimed or implemented.

Safe technical defects were fixed in the meantime: failed processing requests
retry, deletion eligibility is rechecked after cooling-off, resumed account
activity defers deletion, and the user-facing copy no longer promises deletion
of “all associated data.” Bugs UX-193-195 also correct the remaining account
buttons, Data Rights flow, and Help answer that had still claimed permanent or
irreversible deletion. Production had zero active deletion requests during the
read-only 2026-08-24 check. See
`.ai-coder/escalations/E21-account-erasure-retention-matrix-missing-2026-08-24.md`.

---

## 46. BIR document issuance is held pending an approved tax design

The prior BIR verifiers checked dead environment names, routes, and table
shapes, while the UI and PDF copy still implied obsolete monthly VAT-return and
Official Receipt behavior. E22 records the legal/compliance hard stop.

Safe containment now fails closed before Official Receipt, VAT-period, or 2307
generation/finalization/cancellation outside tests. The admin Financials and
Compliance pages label these surfaces as held workpapers or legacy sales
records. Monthly VAT output is explicitly an internal reconciliation, not a BIR
return. Both verifier scripts now reject the known-invalid contract instead of
printing a false pass. `BIR_DOCUMENT_ISSUANCE_ENABLED` must remain `0`; code does
not treat that switch as approval of a replacement.

An attorney/accountant-approved principal-invoice series, taxpayer profile,
filing calendar, form mapping, retention policy, and real end-to-end verifier
are required before the hold can be removed. No live tax document was issued or
cancelled during this remediation. See
`.ai-coder/escalations/E22-bir-invoice-numbering-and-fake-verifiers-2026-08-24.md`.

---

## 47. Production contains demo fixtures; public discovery is contained

A read-only production audit found 12 seeded `@test.ph` accounts, 120 `[demo]`
bookings, and 96 `[demo]` reviews. The deploy script had unconditionally run
development seed files even though `ENABLE_TEST_FIXTURES=0`.

Future deploys now enumerate development seeds only when that flag is exactly
`1`, and run SQL with fail-fast error handling. With fixtures disabled, public
provider discovery excludes seeded test accounts and review listings and
aggregates exclude `[demo]` reviews. This prevents the known rows from shaping
the customer marketplace while preserving production evidence.

The rows have not been deleted. Removal requires a verified backup, foreign-key
dependency plan, exact dry-run counts, and explicit approval because seeded and
real operational records can be linked. See
`.ai-coder/escalations/E23-production-demo-fixture-cleanup-2026-08-24.md`.

---

## 48. External PayMongo payments and wallet top-ups are held under E14

The legacy non-wallet payment path created a PayMongo Payment Intent and then
invented a hosted checkout URL that PayMongo does not provide. The result could
not complete a valid card, GCash, Maya, QR Ph, bank-transfer, or wallet-top-up
authorization.

API routes now return 503 before booking, database, wallet, or gateway effects.
Customer checkout/pay screens disable external methods and explain the hold;
existing wallet balance remains usable through the fully local, transactionally
atomic wallet path. The wallet top-up screen exposes no amount or submission
control. `EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED` must remain `0`, and setting
it to `1` cannot bypass the code hold.

Removing this containment requires the approved replacement architecture,
PayMongo sandbox evidence, webhook reconciliation, refund/cancellation tests,
customer/admin support flows, and updated terms. See
`.ai-coder/escalations/E14-paymongo-client-authorization-missing-2026-08-24.md`.

---

## 49. Direct participant dispute settlement is held under E18/E24

Customers and providers now have linked dispute inboxes and case workspaces.
Both participants can see the booking, claim, evidence, provider response,
status, and recorded decision. Providers can contest a claim, which preserves
their response and moves the case to admin review.

Direct provider acceptance of a full refund, provider partial-refund offers,
and customer acceptance of a partial offer are held before any write. The
underlying paths do not lock the dispute and booking as one idempotent
settlement and can commit case state separately from escrow work. E18 separately
blocks a safe decision while escrow can release at 24 hours but disputes remain
open for 48 hours.

Keep `DISPUTE_PARTY_SETTLEMENT_ENABLED=0`. The environment value cannot bypass
the code hold. Removing containment requires the locked/idempotent settlement,
gateway retry, concurrent money tests, and the E18 timing decision described in
`.ai-coder/escalations/E24-direct-dispute-settlement-concurrency-2026-08-24.md`.

---

## 50. Fixed-price creation can start provider offers before verified payment

E03 approved the instant-pay order: create the fixed-price booking, verify
payment into held escrow, then begin provider matching. The payment-success
paths call the dispatcher after that committed state, but the booking-creation
route can also start the offer cycle immediately when `auto_dispatch_enabled`
is on. The cycle currently accepts pre-payment states and can notify or assign
a provider before funds are verified.

This is a work-authorization and money-trust launch blocker. An offer,
notification, `requested`, `matched`, or `payment_pending` state must not be
treated as payment evidence. The W8 Booking queue contains the read-only signal
to verified-paid unassigned records only; it does not change an offer, booking,
payment, escrow, or setting.

E32 currently prevents the required read-only production inspection, so the
live setting and any affected offer rows are unknown. Do not mutate the setting
or repair records without a verified server session, backup, and exact impact
check. The correction must use the money-path topic-branch/PR discipline,
remove create-time fixed-price dispatch, independently enforce paid/held at
every automatic and manual dispatch boundary, and execute create/payment/
webhook/duplicate/acceptance/notification regressions. See
`.ai-coder/escalations/E33-fixed-price-prepayment-auto-dispatch-regression-2026-08-30.md`.

---

## 51. DPO admin-route segregation is incomplete — RESOLVED IN CODE

D34 now implements the independent privacy-only DPO boundary. DPO login lands
at `/privacy`; its navigation and direct-route guard expose only the privacy
home, data-subject requests, consent versions, and account controls. General
operations, support, customer/provider, booking, communication, money, tax,
staff, settings, catalog, marketing, and general-audit routes remain excluded.
The API route matrix is enforced independently of the client, and super admin
retains fallback privacy authority without granting privacy records to a plain
admin.

Executed client and API tests cover allowed and rejected routes, direct URLs,
navigation/search/breadcrumb surfaces, DSR actions, and the privacy home. The
mixed Compliance page no longer mounts its old privacy/NPC tab. E40 separately
holds the breach-classification workflow and statutory wording for counsel.

This resolution is committed code and local evidence only. Production migration,
deployment, and live role evidence remain blocked by E32 until the server
identity is established. See
`.ai-coder/escalations/E34-dpo-admin-route-segregation-is-incomplete-2026-08-30.md`.

---

## 52. Provider onboarding drafts and rejected resubmission are not durable

The active provider application is created in `providers` and reviewed through
Provider 360, but the pre-submit mobile draft is memory-only. A browser refresh
or app restart can lose it. The older `provider_onboarding_progress` table and
super-admin endpoints are a disconnected second review model: no applicant
route populates it, it omits the current vetting step, and its approval does not
grant the canonical provider role or run the active approval checklist.

W11 makes stale later-step URLs fail back safely, uses Admin-configured markets,
stores an exact in-market pin, creates the canonical primary market linkage,
and never invents a pending status for an account with no application. It does
not claim durable resume. A rejected canonical provider row also blocks a new
application, so the previously documented reapply instruction is not available.

Do not revive the generic snapshot with KYC, address, ID, or reference-contact
data and do not delete it without a backed-up production row audit. The launch
correction needs one typed, privacy-scoped draft contract and a same-record,
audited request-changes/resubmission lifecycle. E32 blocks the required live
row inspection. See
`.ai-coder/escalations/E35-provider-onboarding-source-of-truth-and-resubmission-2026-08-30.md`.

2026-09-05 candidate update, **still open**: the read-only production inventory
is now completed (zero legacy progress rows and associated application audit
rows), superseding the old E32 inspection block above. The typed private draft
foundation in `f80d41ff` passed CI `33972140158`, including actual PostgreSQL
OPS-486 through OPS-489. A follow-up adds exact-revision submission and atomic
draft consumption, with first CI still pending at publication. Neither is live.
The mobile/web screens remain memory-only until their owner-bound hydration
and save/retry/conflict flow is connected and verified. Worker expiry, privacy
inventory, immutable review revisions and same-record correction/resubmission
also remain open. See `docs/architecture/provider-application-lifecycle.md`.

2026-09-06 applicant candidate update, **still open**: owner-bound hydration,
save/retry/conflict/reload/discard controls now run in the real six-step
application. Terms saves and submits the same normalized revision. Commit
`6a138e46` passed CI `33981649089` and Gates `33981649071`, including all four
CI jobs and 567 mobile suites / 851 passing tests with 84 explicit TODOs.
This supersedes the preceding statement that the candidate screens remain
memory-only, not the live deployment limitation. A further status-screen
correction distinguishes the canonical pending/approved/rejected/suspended/
deactivated values and guards delayed account activation. Detailed evidence is
in `docs/audits/PROVIDER-APPLICATION-REVIEW-STATUS-2026-09-06.md`. Fresh browser
acceptance is not complete: the local Expo export failed with a filesystem read
error before producing a bundle. Draft expiry scheduling, privacy inventory,
review revisions, correction/resubmission and paired release remain open.

Later 2026-09-06 evidence: the supported full-workspace install produced a
fresh compiled browser build outside OneDrive. Both review URLs passed 84
synthetic state/viewport checks; screenshot inspection exposed and led to
correction of phone card spacing and decision-inappropriate guidance. Before/
after evidence and full test results are retained in the review-status audit.
This supersedes the local build impediment for that workflow, not the remaining
six-step browser/native acceptance or the latest Stitch-reference gap.

Further 2026-09-06 browser evidence, **still not deployed**: a complete
synthetic-HTTP browser run exposed a navigator reset that the earlier mocked
router test missed, missing browser checked states and a clipped Cancel action.
UX-1335/1336/1337 correct those defects. All six viewport flows now pass entry,
save failure/retry, refresh, two-tab conflict, confirmed reload/discard, actual
Back, four uploads and exact-version submission. Sixty screen captures and
before-fix failures are retained in
`docs/audits/PROVIDER-APPLICATION-BROWSER-2026-09-06.md`. The full mobile suite
passed 577 files / 861 tests, with 84 TODOs; the 84 review checks passed again.
This is not real database/browser paired acceptance, native evidence, latest
Stitch signoff or completion of reviewer corrections/resubmission/privacy.

Further 2026-09-06 candidate correction, **still open**: OPS-500 connects the
existing bounded expiry service to a separate five-minute scheduler job;
OPS-501 includes retained owner draft fields in private JSON/CSV account
archives, with read failures failing the export. The lifecycle document now
records the draft-specific privacy inventory, including the gap between
account anonymization, draft-row expiry, uploaded files and archived copies.
Local focused behavior tests pass; the guarded PostgreSQL tests require fresh
CI at publication. No production cleanup or complete erasure is claimed.
Reviewer revisions, correction/resubmission, approved E21 retention, full
browser/native/Stitch acceptance and paired deployment remain open. See
`docs/audits/PROVIDER-DRAFT-EXPIRY-EXPORT-2026-09-06.md`.

Further 2026-09-06 submitted-record stage, **still open**: migration 173 and
atomic submission capture original accepted fields, catalog labels and owned
document references on the same provider identity. Private account archives
include retained owner revisions. No legacy evidence is manufactured. Final
focused verification passed 15 suites / 27 tests on real isolated PostgreSQL;
the full local run still failed two Docker-dependent nginx tests. Fresh CI,
full-chain rehearsal through 173 and paired release remain required. Approval
is not yet revision-bound; changes-requested/resubmission and reviewer history
screens are not implemented. Object bytes/retention are not made immutable by
these rows. E21/E43 and full browser/native/Stitch acceptance remain open. See
`docs/audits/PROVIDER-SUBMITTED-EVIDENCE-2026-09-06.md`.

2026-09-07 private-review reader, **still open**: OPS-510/511 add bounded
historical summaries, exact submitted fields and provider/revision-scoped
original document streaming for operations admins. Missing legacy evidence is
not reconstructed; current profile/status and original evidence stay distinct.
Eight focused suites / 13 tests passed on real isolated PostgreSQL. The full
local run passed 984 suites / 3,428 tests, with two existing TODOs and only the
two Docker-unavailable nginx tests failing (239.303 seconds). Fresh CI remains
required. Admin revision screens, revision-bound decisions, correction and
resubmission, retained file bytes and paired release are not completed by this
API stage. See `docs/audits/PROVIDER-SUBMISSION-REVIEW-READER-2026-09-07.md`.

2026-09-30 operator-screen stage, **still open**: the reader commit `ee16e2e3`
passed CI `34082814032` and Gates `34082814039`, including OPS-510/511 and both
nginx tests (986 suites / 3,430 passing API tests, two TODOs). Provider 360 now
renders preserved submissions separately from current profile/catalog data,
with exact fields, bounded paging, honest missing/error states and owner-bound
private previews. Four focused rendered tests and four compiled browser widths
pass, including a narrow-header layout regression found during screenshot review.
The full two-worker admin run passed 702 tests with three existing TODOs; its
earlier failing default-worker run is retained in
`docs/audits/PROVIDER-SUBMISSION-REVIEW-UI-2026-09-30.md`.
Revision-bound decisions, correction/resubmission, governed legacy admission,
object-byte retention and matched API/web/schema deployment remain unfinished.
No production rollout or latest-Stitch/every-screen acceptance is claimed.

Further 2026-09-30 decision stage, **still open**: both admin decision entry
points now review the preserved submission and send its exact revision ID.
The canonical service refuses stale/foreign/absent or already-decided evidence
and commits status/role, immutable decision, audit and applicant inbox notice
together. Migration 174 is additive, with no legacy backfill. Six actual
PostgreSQL regressions and rendered/browser checks cover the new contract;
16 compiled synthetic decision journeys and four reader repeats pass at four
widths. The full local API run still failed only the two Docker-unavailable
nginx checks; admin passed 704 tests with three TODOs, with the later history
test passing separately. Fresh CI, full selected-image migration through 174,
paired acceptance and deployment remain required. Correction/resubmission,
lock-order standardization, governed legacy admission, decision export/retention,
original object bytes and full Stitch/native evidence remain open. See
`docs/audits/PROVIDER-SUBMISSION-DECISIONS-2026-09-30.md`.

---

## 53. Provider approval does not enforce the government ID back image

The applicant flow collects government ID front, government ID back, NBI
clearance, and selfie, and Provider 360 displays all four. The server approval
gate currently requires only NBI, ID front, and selfie. An admin can therefore
approve a pending provider whose ID back image is missing.

Operations must manually verify all four files and must not treat the existing
three-field server check as complete KYC enforcement. Tightening the predicate
requires the E32-blocked aggregate production audit so existing pending and
approved records are not stranded without a deliberate legacy path. See
`.ai-coder/escalations/E36-provider-approval-does-not-enforce-government-id-back-2026-08-30.md`.

2026-09-05 continuation under Ken's delegated approval: the read-only live
inventory and complete-backup verification are now available. No pending rows
were present. Existing approved records lacked all four references; their
test/legacy classification and real vetting evidence are not established.
They were not demoted, backfilled, or represented as verified. OPS-479 adds
all-four-document validation under the approval transaction's row lock.
OPS-480 makes owner-role promotion conditional on an active customer or legacy
provider account with no fraud flag. Both changes remain unpublished to the
live server and need their fresh mandatory PostgreSQL CI tests. The Admin
checklist/incomplete-state follow-up, legacy evidence review, correction and
resubmission, and reactivation-path audit remain open. This item is not closed.

Further 2026-09-05 evidence: OPS-479/480 passed the actual PostgreSQL CI tests
at `5fb2ab41`, and that full CI/Gates run passed. Five approved records match
exact public demo fixture identities; one remains unclassified. UX-1311 adds
the explicit four-document incomplete/loading/error state and front/back
checklist wording to both admin approval surfaces, with rendered regression
coverage. These fixes are not deployed. Immutable review revisions,
correction/resubmission, reactivation safeguards and the remaining legacy
evidence question prevent full closure.

---

## 54. The Admin Audit Log is not a complete correlated activity trail

The middleware previously described as globally capturing every write is not
mounted by the API. Its failure metrics are not exposed, and `audit_log` rows do
not populate the available `request_id` field. The visible timeline combines
selected explicit `audit_log` events with selected `admin_actions`; it cannot
prove that every customer, provider, staff, support, booking, payment, payout,
dispute, work-order, or admin mutation was recorded.

W12 makes that boundary visible, keeps the list and masked CSV export on the
same two-source/filter contract, and removes false global-coverage comments. Do
not mount the existing middleware as a shortcut: it writes after the response,
lacks outcome and correlation semantics, and can duplicate explicit domain
events. A replacement needs a canonical event contract, transactional evidence
rules, durable operational telemetry, privacy controls, integrity/retention,
monitoring, recovery, and executed failure tests. E32 separately blocks the
required production aggregate inspection. See
`.ai-coder/escalations/E37-audit-request-stream-is-not-global-or-correlated-2026-08-30.md`.

---

## 55. DPO role changes do not revoke existing sessions — RESOLVED IN CODE

Migration 158 adds canonical `users.session_version` state. Every protected HTTP
request and authenticated socket handshake reloads the account role, active
state, and session generation before accepting token authority. DPO promotion
and removal now run as one locked transaction that changes the role, advances
the generation, deletes refresh sessions, revokes active admin CSRF records,
and writes the before/after transition plus revocation counts to the admin
action. Local sockets are disconnected after commit.

Promotion is limited to an active plain-admin identity and removal always
returns that same internal identity to admin. Executed tests prove old access
and refresh tokens fail, current-generation tokens work, role mismatches and
inactive accounts fail closed, sockets reject stale generations, and provider
staff invitation preserves the generation. General privileged-account
lifecycle and multi-instance socket fan-out remain governed separately by E39.

This resolution is committed code and local evidence only. Production migration
and post-deploy verification remain blocked by E32. See
`.ai-coder/escalations/E38-dpo-role-changes-do-not-revoke-existing-sessions-2026-08-31.md`.

---

## 56. Admin account lifecycle is not governed in the app

Staff & Roles manages operational directory profiles, not privileged login
accounts. The app has no governed workflow to create, activate, deactivate,
change, recover, or revoke sessions from an admin-tier account. The bootstrap
script can create or update one out of band, but it lacks an authenticated
actor, reasoned admin audit event, session revocation, last-active-super-admin
invariant, and approval workflow.

W13 shows actual account role/status separately from directory metadata and
states that profile actions do not control access. A dedicated privileged
account lifecycle must define locked invariants, attribution, two-person and
break-glass policy, immediate token invalidation, rollback, and executed
concurrency tests. E32 blocks the required production account/session
inventory. See
`.ai-coder/escalations/E39-admin-account-lifecycle-is-not-governed-in-app-2026-08-31.md`.

---

## 57. Privacy deadline wording and breach-notification classification need counsel

The product currently calls the 15-calendar-day DSR target an NPC-required
fulfilment SLA and starts an "NPC notice pending" 72-hour clock for every row
entered in the breach log. Official NPC material checked on 2026-08-31 does not
support either conclusion that broadly. The 15-day material concerns whether a
PIC/PIP took timely or appropriate action or responded before a complaint, and
explicitly says the request need not be granted or denied in that period.
Mandatory breach notification depends on a recorded assessment of the data,
unauthorized acquisition, and likely serious harm, with limited Commission-
approved postponement or omission paths.

Do not silently rewrite legal promises or treat the current timer as a legal
determination. The recommended correction keeps a conservative internal
response clock while adding an audited breach-notification assessment,
determination/rationale, affected-subject notice evidence, NPC receipt, and
follow-up-report tracking. The operative wording and policy require qualified
Philippine privacy counsel. See
`.ai-coder/escalations/E40-privacy-deadline-legal-language-and-breach-classification-2026-08-31.md`.

---

## 58. Legacy provider quality scoring conflicts with the approved operations scorecard

The stored automated model weights rating 30%, completion 25%, completion
within two hours of the scheduled start 20%, provider cancellation 15%, and
quote response 10%. The approved monthly operations scorecard instead uses
rating 35%, acceptance 20%, cancellation 20%, dispute 15%, and on-time arrival
10%. Those are materially different inputs and the legacy completion-time
proxy is not the approved arrival measure.

Analytics now labels the stored rows as legacy evidence, exposes every
component and snapshot period, and blocks recomputation at both the admin UI
and API. Do not use the overall legacy number alone for discipline, tier,
dispatch, or commission decisions. Re-enabling computation requires a written
source-of-truth decision, a versioned score contract, input-quality rules,
historical/backfill treatment, and executed boundary tests. See
`.ai-coder/escalations/E47-provider-quality-score-source-conflict-2026-08-31.md`.

---

## 59. Automated commission-rate advice is not approved

The former Analytics endpoint generated suggested provider commission rates
from a small 90-day sample and the conflicted legacy quality score. A false
recommendation could affect provider economics without an approved model,
review workflow, impact simulation, or publication authority.

The old advice route now returns the E48 hold. Its replacement is read-only
evidence: current configured rates, approved-provider counts, completed-booking
samples, gross booking face value, and legacy snapshot counts. It does not
calculate provider earnings, approve a change, or write a setting. Any future
rate decision requires an approved policy, minimum evidence standard, human
approval and audit workflow, and rollback plan. See
`.ai-coder/escalations/E48-automated-commission-rate-advice-not-approved-2026-08-31.md`.

---

## 60. Tester-feedback screenshot privacy — CODE CONTAINMENT IMPLEMENTED; PRODUCTION PENDING

The prior path stored images under `uploads/feedback/`, served the files through
both generic public Nginx upload locations with a 30-day public cache, and placed
the same direct URLs in the protected Admin page. A tester could therefore
attach a customer, provider, or admin screen containing personal data that was
retrievable without authentication by anyone who obtained the URL.

Ken approved E52 Option A on 2026-09-01. The code now preserves old files and
payloads while retrieving evidence through an authenticated, record-linked
Admin proxy or a header-keyed private pull route. Admin links never expose the
raw storage path, new intake previews the local browser file, and both Nginx
vhosts contain an explicit `private, no-store` 404 guard for
`/uploads/feedback/`. Legacy absolute and current relative storage identifiers
remain supported without a database migration.

The same pending release also adds version-checked Tester Feedback decisions.
The API and Admin must be deployed together because the API now requires the
record's `expectedUpdatedAt` value and rejects a stale operator overwrite with
409. This is a release-order constraint, not a database migration.

This is not yet resolved in production. E32 prevents the required current
row/file inventory, backup, deployment, and live validation. Do not delete or
move existing evidence. Deploy the API/Admin/form support first, verify old and
new protected retrieval, then activate the Nginx guard and prove ordinary public
uploads remain unaffected. Follow
`docs/runbooks/tester-feedback-evidence-privacy.md` and see
`.ai-coder/escalations/E52-tester-feedback-screenshots-are-public-2026-09-01.md`.

---

## 61. Business-account billing and contract operations are not launch-safe

**2026-09-05 checkpoint:** the findings below describe the original unsafe
workflow, not a complete inventory of current code. E55 Option A introduced
controlled commercial terms and statement/payment evidence; the former
SQL-string-only migration test has been replaced by populated PostgreSQL
verification. The release-safety ledger records restored production-data
preservation separately from synthetic fixture coverage. Business-credit
booking remains held until the distinct E56 provider funding/payable path is
implemented and verified. No old invoice, booking ownership or payment history
may be rewritten to conceal these findings.

The Business Account 360 read model now links explicitly stamped bookings to
customers, providers, invoices, support cases, and disputes. The commercial
write path underneath it is still unsafe.

The monthly generator selects work through current account membership instead
of requiring the booking's explicit `business_account_id`. It can put a
member's personal booking on a company invoice, duplicate one person's work
across companies, and change selection after membership changes. Explicit
business booking selection can also fall back silently to a personal
catalog-priced booking when no eligible contract resolves.

Account approval/suspension, contract lifecycle, discount/credit changes,
invoice generation, and invoice payment recording do not share the required
super-admin, reason, preview, version, and transactional audit contract. The
manual mark-paid action accepts an arbitrary text reference without verified
amount or payment evidence. The customer enterprise workspace has service and
store code but no routed screens, so no current app flow sends the explicit
business account into checkout.

Do not operate these controls as a live B2B billing system. Existing records
must remain unchanged pending a private production inventory; E32 blocks that
inspection. E22 separately holds Philippine principal-invoice claims and E14
blocks treating an external redirect/reference as verified payment. The
recommended remediation is E55 Option A: contain the writes, rebuild explicit
commercial booking and draft/readiness/finalization controls, and preserve old
financial records through append-only corrections rather than rewrites. See
`.ai-coder/escalations/E55-business-account-billing-and-contract-authority-2026-09-02.md`.

---

## 62. Notification Templates is not a per-channel publishing system

Only `new_job_available` and `booking_matched` read Admin-managed template
copy. Each uses one title/body for an in-app notification and best-effort push.
The stored `channel` marker is not a delivery instruction; seeded and custom
SMS/email rows do not send through this workflow.

Inactive, missing, malformed, or deleted connected rows use built-in fallback
copy. Deactivation therefore does not suppress a required booking notice.
Ordinary admins have read-only support visibility. Every lifecycle mutation is
reserved for super-admin, requires a durable reason, rejects no-op changes, and
retains the reason in the transactional Admin action.

The current schema has no channel-specific or locale-specific version, draft
publication, effective date, rollback, test-send evidence, outbox attempt, or
delivery receipt. Do not activate SMS/email, reinterpret reference rows, or
claim that the ADMIN-SPEC target is deployed. E66 recommends staged immutable
event/locale/channel versions with consent/preference enforcement and delivery
evidence. Production inventory and migration remain blocked by E32. See
`.ai-coder/escalations/E66-notification-template-channel-publication-and-versioning-2026-09-02.md`.

---

## 63. Admin 2FA recovery governance remains launch-held

TOTP enrollment and login recovery codes are now connected: activation
atomically creates eight single-use codes, the Admin shows them once and blocks
entry until the operator acknowledges secure storage, and login consumes one
code at a time. Temporary setup tokens are rejected by ordinary HTTP and
Socket.IO authorization.

Privileged factor removal, interrupted enrollment completion, lost-factor
recovery, last-seat protection, and the existing-account rollout are not yet an
approved company workflow. Do not expose a routine disable control or perform
an ad hoc database reset. The detailed threat model and recommended governed
design are kept in local-only security decision records because this repository
is public. As pre-decision containment, the existing public factor-removal and
recovery-code-regeneration mutation routes now return the same explicit `409`
policy hold without reading or changing recovery state. Commit `19deb1e` passes
GitHub CI `33608677040` and Gates `33608677041`, including complete API, Admin,
Mobile, API Docker build/liveness, and all five gates. Production inventory and
account changes remain blocked by E32.

---

## 64. Shared profile-name changes are transactionally audited in code; production pending

The customer/provider `PATCH /api/v1/auth/me` route previously changed the
canonical first and last names without preserving the before/after identity in
the company audit record. That made later support review unable to distinguish
an operator-visible name change from the name originally associated with an
older booking, message, review, or payment record.

The route now locks the current user row, rejects a no-op as an unchanged
response, and commits the name update together with one `user_profile_updated`
audit event containing only the prior and replacement names plus request
attribution. A missing audit insert fails the transaction. The change does not
rewrite booking snapshots, payment records, messages, reviews, or other
historical transactions. Bug OPS-371 executes the lock, update, audit order,
before/after values, request attribution, response, and single-transaction
boundary. Commit `e2409ce` passes GitHub CI `33610063899` and Gates
`33610063827`, including complete API, Admin, Mobile, API Docker
build/liveness, and all five gates. API TypeScript and diff checks also passed
locally. No migration, account mutation, master merge, deployment, server
synchronization, or production change occurred; E32 remains active.

The matching Admin support handoff is also connected in code. Audit Log labels
the event **Profile name updated**, identifies whether the subject is a
customer, provider, provider staff member, or company staff account, and opens
Customer 360 or an exact provider-owner search as appropriate. Provider
Management now actually searches the person's full name, business name, phone,
email, provider ID, and owner user ID, matching the field promise shown to the
operator. Bugs UX-1026 and OPS-372 execute the rendered customer/provider links
and both SQL search paths. Commit `4223052` passes GitHub CI `33611777960` and
Gates `33611777913`, including complete API, Admin, Mobile, API Docker
build/liveness, and all five gates. Production remains unchanged under E32.

The canonical profile validator now trims both names and rejects values that
are empty after trimming, while preserving legitimate one-character names.
The customer Profile screen separately detects an unchanged normalized name,
closes edit mode, and reports that there is nothing to save without issuing a
false update request. SEC-045 and UX-1027 execute those boundaries. The first
UX-1027 CI run `33613949995` correctly failed because the new test captured a
mock before initialization; fix-forward `ee708ab` replaces the closure capture
with module-owned Jest mocks. Final GitHub CI `33614523217` and Gates
`33614523236` pass complete API, Admin, Mobile, API Docker build/liveness, and
all five gates. No existing identity or historical transaction was rewritten,
and production remains unchanged under E32.

---

## 65. Marketing records are not campaign execution or verified attribution

The Marketing workspace separates staged promo codes, connected customer-home
banners, and staff-entered campaign records. Campaign rows do not select an
audience, send SMS/email/push, authorize a budget, reconcile payment spend, or
prove that a signup, booking, or revenue amount came from a channel.

Direct editing no longer exposes attribution counters, and the service now
rejects every direct caller that attempts to overwrite them. A future
correction requires an append-only, evidence-backed adjustment ledger with
reason, actor, source, time, and before/after values. Campaign editing also
rejects an end date before the stored start date. Existing records and counters
are unchanged.

The committed Marketing screenshots predate the current Home Banners tab and
manual-source warning. Do not use them as current authenticated evidence. Fresh
capture is required before launch review. Commits `95f4cc9`, `d8e99f4`, and
`c87169a` pass GitHub CI `33616036732`, `33616743937`, and `33619612610`,
plus Gates `33616036700`, `33616743915`, and `33619612351`. Production remains
unchanged under E32.

---

## 66. Provider-staff accounts lack a safe account and privacy workspace

Provider-staff users currently have assigned jobs, invitations, shared support,
and logout, but no profile, password/session, notification, account-data, or
Data Rights workspace. Their authenticated DSRs can reach the DPO queue, and
the Admin case now links the subject to the employing Provider 360 record and
names the human handler. That back-office linkage is not a substitute for a
staff-facing account/privacy surface.

Do not simply expose the customer erasure screen. Its DSR creation can start
the generic deletion pipeline, while E43 still holds the canonical DSR/deletion
relationship and no approved rule covers active staff assignments, historical
performer evidence, provider-team status, or cross-provider history. E21 also
holds the retention matrix. E69 records the recommended role-aware workspace
and fail-closed erasure design. No staff route guard, account, assignment, or
production row was changed during discovery.

---

## 67. Release migration targeting can silently skip prerequisites

Discovered 2026-09-05 while preparing the exact-image restore rehearsal. The
old production helper passed a final basename to `node-pg-migrate up`, but that
argument selects exactly one file. When several migrations are pending, a
successful final-file execution does not prove that earlier required schema
changes ran. The image-identity and shell-invocation regressions did not test
this library behavior.

OPS-478 replaces that invocation with a bounded runner that selects all files
through the reviewed target, rejects unknown/duplicate/out-of-bound history,
keeps history validation and execution under the existing advisory lock, and
verifies the final applied set. The real PostgreSQL regression reproduces the
old failure and exercises prerequisites, dry runs, historical preservation,
repeat application, later-file exclusion, failure and concurrency boundaries.

Status: implemented locally, release-held pending fresh CI and an exact-image
rehearsal on the isolated restored database. Local helper tests, lint and API
TypeScript passed; the new database integration test is skipped locally because
no safe test PostgreSQL service is available. No production migration, live
application deployment or historical transaction rewrite was performed for
this finding. Do not infer launch readiness from the previous candidate's
green CI. See `docs/runbooks/exact-api-release.md`.

2026-09-05 verification update: **RESOLVED in the verified candidate, not yet
deployed.** The public-entry fix-forward and UX-1310 candidate passed complete
CI `33962050423` and Gates `33962050420`. The exact packaged API image for CI
source `09051d72b57dd3a5d33666ee18900c0997f3cd0f` was rehearsed, without a
substituted runner, on a fresh isolated restoration of the selected complete
backup. Dry-run checks preserved public columns/constraints and sampled
historical records; all 15 pending migrations applied, all 160 migration names
matched the image, and repeat application added no history entries. Original
fields in 218 business records and 145 prior migration-history rows were
unchanged. This is not an exhaustive comparison of every production table or
authenticated business acceptance. Production remains on `7ed367cd`, with no
live migration performed. Paired frontend/API publication, rollback and the
other launch requirements remain open.

---

## 68. Provider reactivation can bypass initial admission

The older API permits a pending applicant to be suspended and then reactivated
as approved, without passing canonical admission. OPS-481 restricts suspension
to approved providers and requires a retained approval event, a review timestamp
and a currently eligible provider account before reactivation. Row/account
locks, transactional audit/inbox, and unchanged booking holds are covered by
a new real PostgreSQL regression. This is a candidate change, not deployed or
claimed verified by its locally skipped database test.

The read-only 2026-09-05 inventory found six approved providers and no pending
or suspended rows, but no retained provider-approval events for any of the six.
Five match public demo identities; one remains unclassified. No record was
changed. A later reactivation would deliberately be refused without retained
admission proof. Governed legacy classification/admission, durable E74 records,
NBI renewal and production acceptance remain open. Do not fabricate evidence
or treat the interim event lookup as the final retention architecture.

2026-09-05 CI update: OPS-481 passed the actual PostgreSQL regression in CI
`33967149207` (947 API suites / 3,311 tests). All CI jobs and Gates
`33967149209` passed for `cdad4114130677ad49357d16aab7d052e4801e02`.
This resolves the local-test uncertainty, not legacy admission or deployment.

---

## 69. Provider application submission concurrency and catalog integrity

The initial submission service checked for duplicates outside its transaction,
did not recheck the account's current eligibility under a lock, accepted
inactive/nonexistent categories, and could create repeated category-only links.
Its undefined-column fallback also tried to use an already-aborted PostgreSQL
transaction while intending to discard optional review evidence.

OPS-482/483/484 correct those paths without changing existing applications or
financial records. Three real PostgreSQL regressions cover account/catalog
concurrency, duplicate requests, optional evidence preservation and atomic
rollback. Status: candidate implementation, local type/lint and focused tests
passed; new database tests skipped locally and awaiting CI. No live deployment
or migration has occurred. These corrections do not implement durable drafts,
review revisions or resubmissions. See the September 5 resumption audit.

2026-09-05 verification update: **RESOLVED in candidate code, not deployed.**
Commit `b288524b3ace5a1493e798f7eb538306ee647961` passed CI `33968968274`
and Gates `33968968271`. The three new database regressions explicitly passed
within 950 API suites / 3,314 tests. All CI jobs passed. The full application
lifecycle and release limitations above remain in force.

---

## 70. Customer/provider delayed requests could cross a sign-in change

The shared mobile/web network wrapper could refresh and replay an old-account
request using a newer account's session, deliver an old response to a new
screen, or let an old rotation interfere with a newer login. A separate early
exit with no refresh token could leave the refresh gate permanently stuck.

UX-1314/1315 reproduce both bugs with controlled HTTP promises and account
changes, then verify refusal of stale delivery/replay, separate account/session
refresh work, no resurrection after logout, protection of newer same-account
logins and recovery after a no-token attempt. Status: **candidate fix, not
deployed**. Full local mobile tests passed (555 files / 839 tests; 84 TODOs
remain), with type/lint checks passing. Fresh CI remains required. This does
not cancel server-processed operations or prove complete UI-cache isolation.

2026-09-06 independent verification: commit `87b1450749c0516b1cd1a500eb2ed9adddf1a921`
passed CI `33974769862` and Gates `33974769636`. All four CI jobs succeeded;
mobile job `101329422601` explicitly passed UX-1314/1315 and the full 555 suites /
839 passing tests, with 84 TODOs. This resolves the fresh-CI requirement for
that transport correction, not deployment or every screen's cache ownership.

---

## 71. Approved applicants need fresh sign-in; verification boxes clipped on phones

The earlier review screen assumed old customer refresh credentials could acquire
provider authority after approval. Canonical role checks intentionally reject
both old access and refresh credentials. UX-1339 retains this security boundary
and explains fresh sign-in, without claiming that a generic session failure proves
approval. Retained approved screens offer an explicit guarded sign-out rather than
attempting automatic role promotion. Successful sign-in clears the generic notice.

Actual compiled-browser navigation then exposed verification boxes clipped beyond
the narrow form. UX-1340 lets the preferred-width boxes shrink without hiding
overflow or changing verification requirements. Sixty synthetic browser journeys
passed across six phone/tablet/desktop widths and all five configured code lengths.
The failed screenshot evidence is retained. Complete local mobile tests pass
579 files / 863 tests with 84 TODOs; TypeScript and changed-file lint pass.

Status: **candidate corrections, not deployed**. OPS-494 adds real PostgreSQL and
HTTP coverage of OTP sign-in, approval, revoked old authority and fresh provider
authority, but is skipped locally until an isolated database is available. Fresh
candidate CI must execute it before this is treated as independently verified.
This does not close provider lifecycle, external SMS, native baseline, paired
release or launch requirements. See
`docs/audits/PROVIDER-APPROVAL-SIGN-IN-2026-09-06.md` for evidence and limitations.

Independent verification update: candidate `9ec00781` passed CI `33992639416`
and Gates `33992639405`. OPS-494 explicitly passed with all 960 API suites /
3,324 tests; mobile passed 579 suites / 863 tests with 84 TODOs. This resolves
the database-test uncertainty for that candidate, not deployment or launch.

Follow-up candidate corrections OPS-495 and UX-1341/1342 align future approval
notices with fresh sign-in/setup, route admission messages to owned review or the
approved workspace, and make their full text readable in both inboxes. Eighteen
synthetic compiled-browser journeys passed at six widths, and complete mobile
tests passed 581 files / 865 tests with 84 TODOs. The local API run had 3,301
passing tests, 22 database skips and two Docker-unavailable Nginx failures; it is
not a green full API result. New OPS-495 remains locally skipped pending fresh CI.
No historical notices or live records changed. Evidence and remaining work:
`docs/audits/PROVIDER-DECISION-NOTIFICATIONS-2026-09-06.md`.

Independent notification verification: `12c59bbb` passed CI `33993696967`
and Gates `33993696999`, including actual OPS-495 PostgreSQL execution
(961 API suites / 3,325 tests). UX-1341/1342 explicitly passed with all
581 mobile suites / 865 tests and 84 TODOs. No deployment has occurred.

---

## 72. Provider date-override forms clipped on narrow browsers

Phone columns inherited wide minimum widths, both action buttons requested the
full row width, and custom-hours inputs could not shrink below browser defaults.
The empty list also claimed an active weekly schedule without fetching it.
UX-1343 through UX-1346 correct these independent issues with rendered regressions.

Status: **resolved in local candidate code, not deployed or yet verified by fresh
CI**. Complete mobile tests pass 585 suites / 869 tests, with 84 TODOs; TypeScript,
changed-file lint and the regression-ID gate pass. Twelve compiled synthetic
browser scenarios pass across six phone/tablet/desktop widths, with exact form
payload checks and 36 final captures. Three failed browser iterations remain
available for independent review, including the misleadingly named intermediate
`verified-evidence` and `accepted-evidence` folders, which are not green results.

Matching, actual persistence, existing bookings and availability rules are
unchanged and require separate end-to-end review. See
`docs/audits/PROVIDER-AVAILABILITY-FIT-2026-09-06.md` for scope and remaining work.

Independent verification: `39f5c78b` passed all four jobs in CI `33995233818`
and Gates `33995233856`. UX-1343 through UX-1346 explicitly passed within
585 mobile suites / 869 tests, with 84 TODOs. Not deployed.

---

## 73. Saved provider date overrides were disconnected from matching

Both provider-matching queries ignored saved date overrides. Replacing a saved
override used separate delete/insert statements that could lose the old block on
failure or interleave concurrent custom-hours saves. The date parser also accepted
impossible calendar dates. OPS-496 through OPS-498 implement candidate corrections
for these three defects, without changing existing bookings, pricing or schema.

Local focused tests passed 45 tests / six suites with two explicit database skips.
The new real-PostgreSQL regressions and fresh CI remain required. Do not infer
end-to-end eligibility or release readiness: direct assignment, operator
reassignment, outstanding offer acceptance and support diagnostics still need
aligned eligibility checks. Public search also contradicts the provider toggle's
“hidden from search” claim. See
`docs/audits/PROVIDER-AVAILABILITY-LINKAGE-2026-09-06.md` for evidence, boundaries
and the continuation plan. No live data was changed.

Independent verification: `68fbab2a` passed all CI jobs in `33996053962`
and Gates `33996053941`. OPS-496/497/498 explicitly executed successfully,
including real PostgreSQL rollback/concurrency checks, within 964 API suites /
3,328 tests. These three defects are resolved in verified candidate code.
The separate assignment/release limitations remain open; no deployment occurred.

Follow-up UX-1347/1348/1349 correct the availability toggle's search/booking
claims, reject impossible dates locally and replace the expired date example.
Complete mobile tests passed 588 suites / 872 tests, with 84 TODOs. Twelve
compiled synthetic browser scenarios passed with 48 final captures, including
an actually visible invalid-date warning and zero invalid-date POSTs. The first
warning capture was too early in its animation and is retained, not treated as
complete visual evidence. Support instructions now distinguish candidate/live
behavior and no longer promise the unsupported KYC renewal upload. Fresh CI is
required for this newer checkpoint. See
`docs/audits/PROVIDER-AVAILABILITY-GUIDANCE-2026-09-06.md`.

Independent guidance verification: `21e7f93d` passed all four CI jobs in
`33997197201` and Gates `33997197220`. UX-1347/1348/1349 explicitly passed
with 588 mobile suites / 872 tests and 84 TODOs. Not deployed.

---

## 74. Weekly schedule defaults and refreshes could misrepresent saved hours

Missing stored weekdays appeared available; new suggested hours could not be
saved unchanged; refreshes overwrote drafts; completing an earlier save discarded
newer typing. The screen also overstated how weekly hours affect search visibility.
UX-1350 through UX-1354 correct these separate defects in candidate code, with
real-render failures recorded before correction and passing regressions afterward.

Complete mobile tests pass 593 suites / 877 tests, with 84 TODOs. Twelve compiled
synthetic browser journeys pass at six widths with 48 captures, exact PUT values,
delayed-save editing and reload checks. Types, changed-file lint and the unchanged
regression-ID gate pass. Fresh CI is required. No production deployment or
database change occurred. This does not resolve multi-device concurrent saves,
all accessibility/account-switch cases or the remaining matching/operator gaps.
See `docs/audits/PROVIDER-WEEKLY-SCHEDULE-2026-09-06.md` for evidence and next work.

Independent UI verification: `eec23014` passed all four jobs in CI
`33998508944` and Gates `33998508945`. UX-1350 through UX-1354 explicitly
passed with 593 mobile suites / 877 tests and 84 TODOs. Not deployed.

Follow-up OPS-499 serializes whole-week replacement by provider within the
existing transaction, addressing possible combinations of concurrent partial
weeks. The new real-PostgreSQL regression checks empty/existing weeks, concurrent
writers, other-provider progress, rollback and unchanged booking rows. Local
focused results are 21 passing tests and three explicit database skips; types,
lint and the ID gate pass. **Database verification remains pending fresh CI**.
No live records or schema changed, and multi-device optimistic conflict warnings
are not implemented. See
`docs/audits/PROVIDER-WEEKLY-SCHEDULE-CONCURRENCY-2026-09-06.md`.

Actual PostgreSQL verification: candidate `7ebe5dd9`, API job `101395007170`
in CI `33999232619`, explicitly passed OPS-499 along with OPS-496/497.
All 965 API suites / 3,329 tests passed. The new concurrency behavior is
database-tested in candidate code; full-run completion and deployment are
separate checks. Gates `33999232613` passed.

Final concurrency run verification: all four CI jobs in `33999232619` completed
successfully. The remaining deployment and wider assignment limitations persist.

---

## 75. Provider date overrides could display the previous day abroad

The availability list interpreted a date-only value as device-local midnight
before converting it to Manila. UX-1355 anchors it to Manila midnight and corrects
the label without changing stored dates, matching or bookings. A real-render
regression failed in an Auckland-timezone process before correction and passed
in three fresh timezone processes afterward. Twelve compiled-browser checks
passed across four timezones and three widths, with 24 retained captures.

Complete mobile tests pass 594 suites / 878 tests, with 84 TODOs; types, lint
and the unchanged regression-ID gate pass. **Candidate correction, not deployed;
fresh CI remains required.** Evidence and remaining accessibility/operator work:
`docs/audits/PROVIDER-OVERRIDE-TIMEZONE-2026-09-06.md`.

Published candidate `1cf7e309` subsequently passed CI `33999991201` (all
four jobs) and Gates `33999991204`. UX-1355 explicitly passed in the mobile
job; 594 suites / 878 tests passed, with 84 TODOs. The fresh-CI requirement
above is resolved for that candidate, not production deployment.

## 76. Provider 360 drafts and contact reveals could follow another record

UX-1356 through UX-1359 reproduce cached-record navigation retaining another
provider's private contact reveal, note draft, suspension confirmation and
wallet-adjustment draft. The page's loaded subtree now follows the canonical
provider ID, resetting those states on a different record while retaining an
unsaved note during same-provider refresh. E76 records the narrow approved
engineering containment; no financial policy or live transaction is changed.

Four regressions failed before correction. Full admin tests afterward passed
569 files / 653 tests, with 1 skipped file / 3 TODOs. Types, lint and the
unchanged regression-ID gate passed. Thirty compiled-browser scenarios passed
at six widths with 60 captures and no unexpected HTTP, page exceptions or
document overflow. **Candidate correction, not deployed; fresh CI required.**
Full evidence and remaining customer-record, operator and release work:
`docs/audits/PROVIDER-RECORD-OWNERSHIP-2026-09-06.md`.

Published provider candidate `306ca0ed` passed CI `34001766960` (all four
jobs) and Gates `34001766965`. Admin logs explicitly pass UX-1356 through
UX-1359 and all 653 tests, with 3 TODOs. Fresh CI for that provider correction
is resolved, not the deployment boundary.

## 77. Customer 360 operator drafts could follow a different customer

UX-1360 through UX-1364 reproduce retained private contact, suspension and
forced-sign-out dialogs, wallet drafts and dispute-tab fraud confirmations
after warm-cache customer navigation. The loaded page now follows canonical
customer ID, preserving a same-customer draft on refresh while discarding
record-specific state on another customer. No money/status action is submitted.

Five regressions failed before correction. The first full corrected admin
run passed 574 files / 658 tests, with 1 skipped file / 3 TODOs. Types and
lint passed after correcting test-only typing mistakes. Thirty-six compiled
browser scenarios passed at six widths, with 72 captures and zero unexpected
HTTP, page exceptions or document overflow. **Candidate correction, not
deployed; final local rerun and fresh GitHub CI remain required.** Evidence:
`docs/audits/CUSTOMER-RECORD-OWNERSHIP-2026-09-06.md`.

Final local rerun after both test-only typing corrections also passed:
574 files / 658 tests, with 1 skipped file / 3 TODOs, in 174.89 seconds.
Types and lint passed. The local rerun requirement is resolved; fresh CI
and deployment are not implied.

Published customer candidate `b1b05b71` passed all four jobs in CI
`34003132465` and Gates `34003132466`. Admin logs explicitly pass UX-1360
through UX-1364 and all 658 tests, with 3 TODOs. Its fresh-CI requirement
is resolved; production deployment remains separate.

## 78. A new admin operator could inherit a previous operator's record cache

UX-1365 reproduces actual logout/login retaining a supervisor's private customer
contact for an ordinary operator. The route subtree now owns separate query
clients by authenticated ID/role and signed-out boundary. Same-owner refresh
retains caching; another owner gets empty route state and a fresh cache. E77
records the recommended containment and current engineering approval.

The regression failed before correction. Complete admin tests pass 576 files /
663 tests, with 1 skipped file / 3 TODOs; types, lint and the unchanged ID gate
pass. Twenty-four compiled browser scenarios pass across customer/provider,
completed/delayed responses and six widths, with 72 captures and no unexpected
HTTP, page exceptions or document overflow. Only synthetic auth writes occurred.
**Candidate correction, not deployed; fresh CI required.** This is not a claim
that transport retries, async authentication, cross-tab sessions or realtime
connections are isolated. Evidence and remaining work:
`docs/audits/ADMIN-ACTOR-QUERY-CACHE-2026-09-06.md`.

Published cache candidate `4fd13138` passed all four jobs in CI `34004877588`
and Gates `34004877495`. Admin logs explicitly pass UX-1365, its four supporting
tests and all 663 tests, with 3 TODOs. Its fresh-CI requirement is resolved;
production deployment and broader authentication boundaries remain open.

## 79. Delayed admin startup checks could restore obsolete session identity

UX-1366 through UX-1368 reproduce startup reads overwriting a new login,
restoring a signed-out operator and replacing a newer role/rotation requirement.
The real auth store now admits only the current startup ticket and invalidates
old tickets at login/logout boundaries. Successful login finishes loading.
E78 records the recommended narrow correction and current engineering approval.

Focused tests pass 6 files / 9 tests; types, lint and the unchanged ID gate pass.
Eighteen compiled synthetic browser scenarios pass at six widths, with 54
captures, no unexpected HTTP, page exceptions or document overflow. The first
full local run failed four timing checks alongside a build; all four focused
repeats pass unchanged. **A clean full rerun and fresh CI remain required.**
No production, server-cookie, financial, permission or revocation policy changed.
Transport retry, competing auth writes, cross-tab and realtime boundaries are
not certified. Evidence: `docs/audits/ADMIN-STARTUP-AUTH-OWNERSHIP-2026-09-06.md`.

The complete four-worker local rerun passed 580 files / 670 tests, with 1 skipped
file / 3 TODOs, in 302.23 seconds. No tests, timeouts or gate settings changed.
The local rerun requirement is resolved; fresh CI and deployment are not implied.

Independent verification: published startup candidate `aa653562` passed all
four jobs in CI `34006066256` and Gates `34006066263`. Admin logs explicitly
pass UX-1366/1367/1368 and the four supporting startup tests, with 580 passing
files / 670 tests, 1 skipped file / 3 TODOs. Fresh CI for that checkpoint is
resolved. Deployment and the broader authentication limitations remain open.

## 80. An old admin request could replay under a newly signed-in operator

UX-1369 reproduces an old provider-note HTTP 401 triggering refresh and replay
after a different operator signs in. The real compiled Provider 360 note form
also reproduces the old note being stored with the new synthetic operator as
author. No production records or real credentials were involved.

Candidate containment gives requests in-memory session ownership and checks it
before fetch, after response parsing, and before refresh/replay/redirect.
Login intent, completed login, logout and observed identity/role changes retire
old ownership. Same-owner refresh still rotates CSRF and retries normally.
This is **not** arbitration of server cookie-writing responses or cross-tab
sessions, and cannot undo a server-processed mutation.

Focused tests pass 3 files / 8 tests; types, changed-file lint and the unchanged
ID gate pass. Compiled synthetic browser checks pass 18 new note/auth/refresh
scenarios, 18 startup repeats and 24 customer/provider cache repeats across six
widths. Their 180 captures have zero recorded page exceptions, unexpected HTTP
or document overflow. **Final complete local rerun and fresh CI remain required;
not deployed.** Evidence, honest failed checks and remaining auth boundaries:
`docs/audits/ADMIN-REQUEST-SESSION-OWNERSHIP-2026-09-06.md`.

The final complete four-worker local run passed **583 files / 678 tests**, with
1 skipped file / 3 TODOs, in 332.45 seconds. The final local rerun requirement
is resolved. Fresh CI, cookie/cross-tab containment and deployment remain open.

Independent verification: request-ownership candidate `4840b276` passed all
four jobs in CI `34008807832` and Gates `34008807831`. Actual admin logs pass
UX-1369, its seven supporting tests and all 678 tests, with 3 TODOs. Fresh CI
for the narrow correction is resolved; cookie/cross-tab and release limits persist.

## 81. Post-refresh save failures could be misreported as authentication expiry

UX-1370 reproduces the actual provider Notes form showing the original expired
access error instead of a later save rejection. The compiled baseline also
navigates away, losing the unfinished workspace. The API wrapper now keeps the
retried business request outside the refresh-failure catch. It preserves the
actual save error and keeps drafts in place for non-authentication failures.
A second HTTP 401 still requires sign-in; password rotation still routes to the
password screen. Server authorization and mutation semantics are unchanged.

Focused tests pass 6 files / 13 tests; types, lint and the unchanged ID gate pass.
Forty-two compiled synthetic browser scenarios pass at six widths for conflict,
permission, server, network, rotation, second-401 and failed-refresh outcomes.
The previous 18 request-ownership scenarios also pass. All 162 final captures
have zero recorded page exceptions, unexpected HTTP or document overflow.
**Complete local suite and fresh CI pending; candidate-only, not deployed.**
See `docs/audits/ADMIN-REFRESH-RESULT-2026-09-06.md` for evidence and the retained
baseline harness error. This does not resolve cookie ordering, cross-tab sessions,
old logout completion, broad Stitch parity or deployment readiness.

The final complete four-worker UX-1370 run passed **585 files / 682 tests**, with
1 skipped file / 3 TODOs, in 299.75 seconds. The complete-local-suite requirement
is resolved; fresh CI/deployment remain separate. Subsequently, local UX-1371
reproduced the runtime rotation redirect not marking the password screen as
mandatory. That new failing investigation is not part of the 682-test result or
this verified candidate publication; see the audit's follow-up section.

Independent verification: `a67b211c` passed all four jobs in CI `34009903130`
and Gates `34009903135`. Actual admin logs pass UX-1370, three refresh-result
tests and all 682 tests, with three TODOs. Fresh CI for that checkpoint is
resolved. The rotation investigation below is newer; no deployment occurred.

## 82. Admin runtime password requirements could look optional or reappear after completion

UX-1371 reproduces a current requirement navigating to Change Password without
marking the form and route guard mandatory. UX-1372 independently reproduces an
older response sending the operator back after a successful password change.
The candidate now reports current requirements to owned auth state, invalidates
older startup evidence, and retires old request ownership after successful
password replacement. Already-open drafts survive a new requirement; rejected
passwords remain required; a fresh later requirement still takes effect.

Focused real-render checks pass 6 files / 27 tests; TypeScript, lint and the
unchanged ID gate pass. Twenty-four compiled synthetic browser scenarios pass
at six widths with 72 captures, no unexpected HTTP, page exceptions or captured
document overflow. The failed old-build screenshot and trace are retained.
**Complete local suite and fresh CI remain required; candidate-only, not deployed.**
Evidence and explicit scope: `docs/audits/ADMIN-PASSWORD-ROTATION-LIFECYCLE-2026-09-06.md`.
Cookie-response ordering, cross-tab identity, old logout completion, broad
screen/design acceptance and safe release integration remain open. No server
enforcement, security hold, live credential, financial or historical row changed.

Final complete local verification passed **588 files / 691 tests**, with
1 skipped file / 3 TODOs, in 353.87 seconds. The prior browser matrices also
pass on the same build: 42 refresh-result and 18 request-ownership scenarios.
Together there are 84 passing synthetic browser scenarios / 234 final captures.
This resolves the local suite/repeat requirements, not fresh CI or deployment.

Independent verification: `9382ac7e` passed all four CI jobs in `34011734961`
and Gates `34011734968`. Actual admin logs pass UX-1371/1372, seven supporting
lifecycle tests and all 691 tests, with three TODOs. Fresh CI for this password
checkpoint is resolved; deployment and broader authentication remain open.

## 83. An obsolete admin logout completion could discard a new login

UX-1373 reproduces two pending Header logout requests, the newer request
finishing, a real new login, then the older completion clearing that operator.
The store now limits completion cleanup to the current request lifetime. Header
uses the existing authentication route guard instead of an unconditional delayed
redirect. Current logout still clears local protected state on success or failure.

Focused tests pass 6 files / 16 tests; types, changed-file lint and the unchanged
ID gate pass. Eighteen new compiled synthetic browser scenarios pass across six
widths, including current-operator verification and one correctly attributed
provider-support note. Prior request/password matrices also pass: **60 scenarios /
180 final captures** combined, with no page exceptions, unexpected HTTP or
document overflow. The failed old-build evidence is retained.

**Complete local suite and fresh CI pending; candidate only, not deployed.**
This is not delayed Set-Cookie arbitration, cross-tab isolation, server revocation,
realtime acceptance or full Stitch review. No server, live credentials, financial
or historical record changed. Evidence and wider E79/release limitations:
`docs/audits/ADMIN-LOGOUT-OWNERSHIP-2026-09-06.md`.

Final complete four-worker local verification passed **590 files / 697 tests**,
with 1 skipped file / 3 TODOs, in 346.56 seconds. The complete-local-suite
requirement is resolved; fresh candidate CI and production deployment are not
implied. The wider E79 limitations remain open.

Independent logout verification: `860c8341` passed all four jobs in CI
`34013764726` and Gates `34013764718`. Admin job `101433928259` explicitly
passed UX-1373, the five supporting logout tests and 590 files / 697 tests,
with one skipped file / three TODOs. Not deployed; broader E79 remains open.

## 84. An older admin login's hash upgrade could overwrite a newer password

Source review found that opportunistic legacy/weaker-password rehash writes
were conditional on user ID only. A password replacement transaction's row
lock does not prevent a waiting unconditional upgrade from subsequently
restoring a hash of the old password. This is not a production incident claim.

SEC-072 adds comparison with the exact originally verified hash, preserving a
concurrent replacement or completed upgrade. Six new real-PostgreSQL tests
exercise the HTTP password/login interleaving for all three admin-tier roles
and both old hash formats, plus normal upgrades, competing logins, rejected
passwords, upgrade failure and password-transaction rollback. They use only a
guarded, test-owned schema, not live credentials or records.

**Candidate only; database execution and fresh CI pending, not deployed.**
Local focused results are eight passing suites / 26 tests and two skipped
database suites / six tests. The skips are not passes or an executed failing
baseline. API types, changed-file lint and the unchanged 1,569-regression ID
gate pass. No migration, dependency, security hold or historical record changed.
This does not resolve E79 cookie ordering, cross-tab authority or the wider
session lifecycle. Details: `docs/audits/ADMIN-PASSWORD-REHASH-2026-09-06.md`.

Independent database verification: `806892aa` API job `101438972334` in
CI `34015709677` explicitly passed SEC-072 and all five supporting PostgreSQL
tests. All 967 API suites / 3,335 tests passed. Gates `34015709675` also passed.
The narrow correction is database-verified in candidate code; full-run
completion, broader session work and production deployment remain separate.

Final verification: all four jobs in CI `34015709677` succeeded. Admin passed
590 files / 697 tests with three TODOs; Mobile passed 594 suites / 878 tests
with 84 TODOs. Same-run matching artifacts were received and the API package's
three checksums and source bundle verified. They remain rehearsal-only inputs,
not a live rollout or completion of E79 and the broader release requirements.

## 85. Invalid TOTP encryption configuration could disclose a value prefix

The encryption helper's invalid-format error included the first eight supplied
characters. If that error reached a diagnostic log, part of the configured value
could be retained. This is a source finding, not evidence of a production leak.
The existing production startup guard already rejects malformed keys separately.

SEC-073 removes only the value prefix from the helper error. Format and length
diagnostics remain, invalid keys still throw, and the encryption algorithm,
stored format, existing records, key configuration and recovery policy are
unchanged. The real regression failed before correction; afterward all three
focused suites / 18 tests passed, including real AES-GCM round-trip and tamper
rejection, with lint and API types passing. **Resolved in local candidate code;
fresh CI and deployment remain pending.** No live key was inspected or rotated.
Evidence: `docs/audits/ADMIN-TOTP-DIAGNOSTICS-2026-09-06.md`.

## 86. Provider team routing, performance and private-response gaps

Re-audit reproduced a team-list server error after a successful invitation:
the literal `staff` URL was consumed as a provider UUID. It also found zero
completed-job totals from an invalid status predicate and inflated review counts
from a jobs-by-reviews join. OPS-506/507/508 correct the route order and shared
read projections, with real PostgreSQL failing baselines and passing focused
tests. No approval, payout, historical row or assignment policy changes.

SEC-074 adds private/no-store response policy before authentication for provider
and Provider 360 routes, including signed KYC links and early errors. The real
HTTP baseline failed; focused tests pass. This is not erasure of previously
cached data or verified browser/storage retention behavior.

**Candidate only; complete final-suite checks and fresh CI still required.**
Broader staff lifecycle, provider revision-bound review, browser/native/Stitch
acceptance and safe release alignment remain open. Evidence and exact limits:
`docs/audits/PROVIDER-TEAM-ROUTING-PRIVACY-2026-09-06.md`.

Final local verification: 981 API suites / 3,426 tests passed, with 2 existing
TODOs and 2 unchanged nginx tests failing solely because the local Docker engine
was unavailable (294.835 seconds). All three new PostgreSQL regressions executed.
Types, changed-file lint and the unchanged 1,582-ID gate passed. Fresh candidate
CI and deployment remain separate requirements; this is not a green local suite.

Independent verification: `30bc13be` passed all four jobs in CI `34037600893`
and Gates `34037600892`. Actual API logs explicitly pass SEC-074 and
OPS-506/507/508, including all 983 suites / 3,428 tests with two existing TODOs.
The nginx tests also passed in CI. These corrections are verified candidate
code, not deployed or a completion of the broader team/release audit.

## 87. Concurrent support-note deletion could invent a second successful action

Two simultaneous Provider 360 deletion requests both reported success for the
same note. The service's initial read was unlocked and its soft-delete UPDATE
did not verify that it changed a row before recording a deletion audit.
OPS-509 locks the scoped note, checks the affected row, and preserves the
existing transactional soft-delete and reasoned author/super-admin contract.
No note is hard-deleted and no historical audit or live record is rewritten.

The real PostgreSQL/HTTP baseline failed. After correction, six focused suites
passed 67 tests, including competing deletes, both edit/delete orders, denied
access, scoped IDs, audit failure rollback and a suppressed UPDATE. The old
PHASE164-01 source/comment test is replaced by actual HTTP/database checks of
reason boundaries and durable full rationale. A final added unrelated-note
progress check, full local suite and fresh CI remain to be verified.
**Candidate only, not deployed.** This is not a global audit/retention solution,
browser acceptance, optimistic edit-version contract or completion of E37.

Final verification supersedes the local-test uncertainty above: all six focused
suites / 67 tests passed, including unrelated-note progress (2.472 seconds).
The full final API run passed 982 suites / 3,426 tests, with two existing TODOs
and only UX-860/UX-201 failing because the local Docker engine was stopped
(336.759 seconds). The actual database tests executed. This is not a green
full local suite; fresh CI and deployment remain required. Detailed evidence:
`docs/audits/PROVIDER-SUPPORT-NOTE-CONCURRENCY-2026-09-06.md`.

Independent verification: `8e755bdc` passed all four CI jobs in `34040199586`
and Gates `34040199589`. API job `101505439412` explicitly passed OPS-509,
the real PHASE164-01 boundary test and both nginx regressions: 984 suites /
3,428 tests passed with two existing TODOs. This resolves fresh-CI uncertainty
for that note fix, not deployment or the broader audit/retention requirements.

## 88. Phone-code sign-in did not exclude privileged accounts

SEC-075 reproduced a usable administrator session from the shared phone-code
path without the administrator password/authenticator flow. Only synthetic
local accounts were used; this is not evidence of production exploitation.
Candidate containment limits phone-code sign-in to customer, provider and
provider-staff roles, including for configured development codes. Privileged
and unknown roles are refused before account/session writes. Valid denied
codes remain consumed and incorrect-code attempt limits remain unchanged.

The real PostgreSQL/HTTP failing baseline and subsequent focused checks are
recorded in `docs/audits/PRIVILEGED-PHONE-SIGN-IN-2026-10-08.md`. Twelve auth
suites / 20 tests pass, including normal marketplace sign-in/refresh, all
three privileged roles with and without enrollment, and existing administrator
two-factor behavior. API types, changed-file lint and the unchanged ID gate pass.
The complete local API run passes 998 suites / 3,448 tests, with two TODOs;
only two unchanged Nginx tests fail because the local Docker engine is
unavailable. This is not a green full local suite. **Fresh candidate CI is
required; this correction is not deployed.**

This prospective guard does not invalidate older privileged sessions or prove
that they were issued through the required factors. Private live-version and
session review, a bounded containment release, verified operator recovery and
scoped audited invalidation remain necessary before declaring this resolved
in production. Do not bypass the accumulated release/migration gates, perform
an ad hoc blanket reset or treat this finding as completed incident/legal review.

Independent verification: `d1641c4d` passed all four jobs in CI `37784763822`
and Gates `37784763909`. The API passed 1,000 suites / 3,450 tests with two
TODOs, including SEC-075 and both previously unavailable Nginx checks. This
resolves the fresh-CI requirement for that candidate, not deployment or
previously issued privileged sessions. Optional exact release packaging was
skipped; the live containment/release requirements remain open.

## 89. Rejected phone sign-in changed deactivated account history

A valid phone code for an inactive customer, provider or provider-staff account
was denied, but first marked the account verified and changed its last-login
and update times. OPS-523 rejects the existing inactive account before those
writes while retaining valid-code consumption and the existing error. Existing
sessions and historical records are not rewritten.

The actual PostgreSQL/HTTP regression failed before correction and passes all
six role/code combinations afterward. Seven selected auth suites / 19 tests,
API types, changed-file lint and the unchanged ID gate pass. **Candidate only;
fresh CI and deployment remain pending.** Separate account/credential issuance
atomicity and concurrency are not resolved by this narrow pre-write check.
Evidence: `docs/audits/INACTIVE-PHONE-SIGN-IN-2026-10-08.md`.
