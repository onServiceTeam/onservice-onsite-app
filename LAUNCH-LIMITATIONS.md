# LAUNCH-LIMITATIONS — onService Onsite App

This file enumerates **known product / behavioural limitations** present
at v1 launch. Each item is intentional (not a bug) but operators and
support staff need to be aware so they can route around it. Each entry
links to the originating decision (phase / dispatch) and a follow-up
ticket where applicable.

---

## 1. Dispatch console — Reassign Dialog provider eligibility — RESOLVED in Phase 14 Dispatch 10

**Where:** [apps/admin/src/pages/DispatchConsolePage.tsx](apps/admin/src/pages/DispatchConsolePage.tsx)
(Reassign dialog)

**Status:** RESOLVED — Phase 14 Dispatch 10 (2026-04-30).

The Reassign dialog now filters providers by service-area coverage,
service-category eligibility, and online status. The booking-admin
service's `reassignBookingProvider` validates the new provider is
active + has the required service category before applying the swap;
audit row written inside the same db.transaction (D06 trx pattern).

The legacy "all online providers in a flat dropdown" surface is gone.
Working-hours/schedule filtering remains a v1.1 polish item — current
v1.0 ships with category + active-status filtering which closes the
critical mismatch concern.

**Source decision:** Phase 14 Dispatch 10 — Bug 272.A. Documented in
[D10-closeout.md](.ai-coder/dispatches/D10-closeout.md).

## 2. Dispatch console — Cancel Dialog refund preview — RESOLVED in Phase 14 Dispatch 10

**Where:** Cancel dialog within the Dispatch console.

**Status:** RESOLVED — Phase 14 Dispatch 10 (2026-04-30).

The cancel flow now shows a real-time refund-amount preview computed
via a server-side dry-run (`POST /admin/bookings/:id/cancel-preview`)
that returns the customer refund amount + provider compensation amount
based on `escrow.handleCancellationInTransaction`'s same logic but
without committing. Operator sees the expected customer credit before
clicking Confirm Cancel.

**Source decision:** Phase 14 Dispatch 10 — Bug 272.B. Documented in
[D10-closeout.md](.ai-coder/dispatches/D10-closeout.md).

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
