# LAUNCH-LIMITATIONS — onService Onsite App

This file enumerates **known product / behavioural limitations** present
at v1 launch. Each item is intentional (not a bug) but operators and
support staff need to be aware so they can route around it. Each entry
links to the originating decision (phase / dispatch) and a follow-up
ticket where applicable.

---

## 1. Dispatch console — Reassign Dialog provider eligibility

**Where:** [apps/admin/src/pages/DispatchConsolePage.tsx](apps/admin/src/pages/DispatchConsolePage.tsx)
(Reassign dialog)

The Reassign dialog lists **all currently online providers** in a flat
dropdown without filtering by:

- service-area coverage of the booking address,
- working-hours / schedule availability for the booking's scheduled time,
- service-category eligibility (e.g., the original booking was Aircon Cleaning).

**Operator obligation:** verify the chosen provider is suitable manually
before clicking Reassign (check city, service categories, schedule).

**Source decision:** Phase 13 Dispatch B caveat #3.
**Follow-up:** ticket TBD — "Filter Reassign Dialog providers by booking
service area / category / schedule".

## 2. Dispatch console — Cancel Dialog refund preview

**Where:** Cancel dialog within the Dispatch console.

The cancel flow does not show a real-time **refund-amount preview** to
the operator before confirmation; the actual refund is computed
server-side in the cancel endpoint. Operators may want to know the
expected customer credit before clicking Cancel.

**Operator workaround:** open the booking detail page in a second tab
and read the totals there before cancelling.

**Source decision:** Phase 13 Dispatch B implementation review.

## 3. Customer DSR — no track-requests view in mobile

**Where:** [apps/mobile/app/customer/data-rights.tsx](apps/mobile/app/customer/data-rights.tsx)

After submitting a Data Subject Request, the mobile UI displays a local
confirmation screen with the reference number and 15-day SLA date. There
is **no customer-side endpoint** to list a user's past DSR submissions
(`GET /api/v1/compliance/my-requests` is not implemented). Customers
must wait for the DPO to respond by email.

**Source decision:** Phase 13 Dispatch C — endpoint deferred to keep
the dispatch scope tight; admin already has full DSR visibility.

**Follow-up:** add `GET /api/v1/compliance/my-requests` and a list view
in `data-rights.tsx`.

## 4. DSR submission — no rate limiting

**Where:** `POST /api/v1/compliance/dsr`

The endpoint enforces auth but no per-user submission throttle. A
malicious or buggy client could spam DSRs.

**Mitigation today:** edge-level rate limit applied via WAF / CDN (see
[INFRA-CHECKLIST.md](INFRA-CHECKLIST.md) item 3.3 — `≤30 req/min for
/api/v1/compliance/*`).

**Follow-up:** add an application-level guard
(e.g., max 5 open DSRs per user per 24h).

## 5. Consent versions — no forced re-consent on publish

**Where:** [apps/admin/src/pages/ConsentVersionsPage.tsx](apps/admin/src/pages/ConsentVersionsPage.tsx)

Publishing a new consent version is a **marker**: it writes an audit row
(`admin_actions.consent_version_published`) but does NOT invalidate
existing user consents or push a re-consent prompt to clients. Users will
record the new version only when they next interact with a surface that
prompts them.

**Operator obligation:** when a major policy change requires explicit
re-consent (e.g., GDPR-style "material change"), the product team must
trigger the in-app re-consent flow separately (out of scope for v1).

## 6. Admin → customer messaging — verb only, no transport

**Where:** Dispatch console "Send message" action.

The `admin_message_sent` admin_actions verb (added in migration 058)
records the intent. The actual delivery currently uses the existing
notification pipeline (push + email if subscribed). There is no
"messaging inbox" on the customer side to view a thread of
admin-sent messages.

**Workaround:** customers see admin messages as one-off push notifications
or in-booking system messages.

## 7. NPC escalation reference format

**Where:** Data Protection Log → Escalate to NPC dialog.

The NPC reference field accepts any string ≥3 characters (no regex
validation). The actual NPC reference format may evolve; we accept
free-text and rely on operator discipline.

## 8. Erasure DSRs do not auto-delete data

**Where:** Customer DSR (erasure) flow → backend processing.

Submitting an erasure DSR does **not** automatically delete the user's
data. It creates a `data_subject_requests` row with status `received`;
the DPO is then responsible for executing the deletion through the
existing account-management tooling (
[apps/mobile/app/customer/account-management.tsx](apps/mobile/app/customer/account-management.tsx)
already provides the 30-day cooling-off-then-delete pipeline).

**Operator obligation:** for each erasure DSR, the DPO must trigger the
account-deletion flow manually and then mark the DSR complete.

**Follow-up:** wire automated linkage between an erasure DSR and the
account-deletion pipeline (Phase 14 candidate).

## 9. Customer messaging in DSR confirmation — single submission shown

**Where:** [apps/mobile/app/customer/data-rights.tsx](apps/mobile/app/customer/data-rights.tsx)

The confirmation screen only shows the **most recent** submission. If
the user submits two requests in a row without leaving the screen, only
the second confirmation is visible. (See item 3 — full history endpoint
deferred.)

## 10. BIR document bucket policy is not yet enforced

**Where:** S3 bucket referenced by `AWS_S3_BUCKET_BIR_DOCS`.

Bucket policies, Object Lock, versioning, and lifecycle described in
[INFRA-CHECKLIST.md](INFRA-CHECKLIST.md) section 1 are **not yet
applied** in production. Until they are, OR / 2307 PDFs are technically
deletable from outside the application path.

**Mitigation:** IAM role for the API service must be locked down per
INFRA-CHECKLIST item 2.3 (deny `s3:DeleteObject*`) before launch.

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

## 12. Admin password rehash is opportunistic (Phase 13 Dispatch D)

When an admin logs in with a hash stored under the legacy `salt:hash`
format (or under weaker scrypt parameters), the API rehashes their
password to the new `scrypt:N:r:p:salt:hash` format with N=131072 inside
the same login request. If that UPDATE fails (e.g., DB momentarily
unavailable) the login still succeeds and the legacy hash is preserved
until the next successful login. There is no background job to force
re-hash dormant accounts. Operators should verify the migration is
complete via `SELECT count(*) FROM users WHERE password_hash NOT LIKE
'scrypt:%';` before declaring the SEC hardening fully landed.

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
