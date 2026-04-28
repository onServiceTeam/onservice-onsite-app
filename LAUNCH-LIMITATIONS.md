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

---

Phase 13 owner notes: this file is the canonical place to record
"intentional v1 limitations". Add new entries as they are discovered;
do NOT silently fix without recording the original limitation here.
