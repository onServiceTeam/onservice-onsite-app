# Phase 13 — Honesty Check

Phase 13 is "Reconciliation & Hardening" — the cleanup phase before launch. The
title alone implies that prior phases left things behind. This document lays
those out plainly, distinguishing (a) what was found, (b) what we fixed in this
phase, (c) what remains in code as scheduled debt, and (d) what is operational
or legal work that exists outside this codebase and must happen before any
production launch.

The tag at the end of this dispatch is `v0.13.0-hardening-complete`. It is
explicitly NOT `v1.0.0-launch-ready`. The latter requires the operational items
in section 4 below.

## 1. What the Phase 13 reconciliation audit (Dispatch A) surfaced

The audit set out to verify Phase 12's "launch-ready" claim. It found:

- **41 forbidden-pattern violations** lurking in services and components.
  These are the project-banned patterns: `as unknown as X`, `as X` for
  narrowing, untyped `any` shortcuts, `req.user!.id` instead of
  `req.user!.userId`, audit_log inserts without try/catch, log calls without
  the winston `{ err: String(err) }` shape, console.log in production paths.
  The verify-no-forbidden harness was returning false-negative because of
  CRLF line endings on Windows breaking grep boundaries; once the harness
  was fixed, the violations surfaced.
- **HASHES-CORRECTED need for phases 00-12.** The original verify-master
  output for prior phases hashed transient files (sanity logs, attempt
  logs) that were rewritten on subsequent invocations. The chain of
  evidence was therefore non-replayable. Dispatch A produced
  `HASHES-CORRECTED-PHASE-NN.sha256` for each prior phase, hashing only
  the durable artifacts.
- **Hash-chain harness fix** in `verify-master.sh` to exclude transient
  files from the deterministic hash on future runs.

## 2. What we fixed, by dispatch

**Dispatch B — 41 forbidden patterns to 0 absolute.** Each violation was
replaced with the proper construct: Zod schemas where types were being
narrowed by cast, proper type guards where unions needed disambiguation,
`req.user!.userId` everywhere, audit_log inserts wrapped in try/catch with
`logger.warn('audit_log insert failed', { err: String(err) })`, console
calls replaced with the winston logger.

**Dispatch C — NPC compliance UI.** Migration 058 widened `admin_actions`
CHECK constraints to include the new compliance verbs. A new
`compliance-admin.service.ts` provides server-side aggregation of DSR
state. The mobile customer app got a "Data rights" page (`apps/mobile/app/customer/data-rights.tsx`). Admin got a Data Protection Officer log page and a
Consent Versions page. 18 DSR-flow tests, 3 admin-message tests. Two new
top-level docs: `INFRA-CHECKLIST.md` (production infra prerequisites) and
`LAUNCH-LIMITATIONS.md` (in-codebase debt enumerated by topic).

**Dispatch D — Security hardening.** Five distinct hardenings:

- Winston PII-masking format added to the logger pipeline. 11 tests cover
  null fields, circular refs, deep nesting, mixed types.
- Password hashing migrated to scrypt with `N=131072` cost. Verification
  is opportunistic-rehash: if a stored hash is in a legacy 2-part format
  or with lower N, a successful login transparently rehashes at the new
  cost. 9 tests cover the migration path.
- CORS allowlist replaces wildcard. 4 tests.
- hCaptcha verification utility added but NOT wired into public auth
  flows yet — this is intentional, the wire-up depends on the production
  hCaptcha account being provisioned. 6 tests cover the verifier.
- Admin CSP via `apps/admin/vercel.json`.

**Dispatch E — BIGINT money + N+1.** Migration 059 alters 37 columns from
INTEGER (32-bit) to BIGINT (64-bit) so the centavos representation can
hold values larger than ₱21 million per row. The pg-types parser is
registered to return the BIGINT as JavaScript `Number` (Option B), which
keeps the existing service code unchanged but introduces a precision
ceiling at `Number.MAX_SAFE_INTEGER` (≈ ₱90 trillion per single value);
this is documented in LAUNCH-LIMITATIONS §15. 5 precision tests including
the MAX_SAFE_INTEGER boundary. Two N+1 patterns were eliminated (invoice
bulk via batch CTE; admin-analytics tier aggregate via GROUP BY) with
their own test files. The cooling-off processor in
`data-management.service.ts:341` was annotated SAFE-N+1 because each row
must run inside its own transaction (BullMQ migration is scheduled,
documented in §17).

**Dispatch F — A11y + docs + tokens + k6.** A 187-control inventory was
swept in 4 batches: filter rows got `aria-label` on inputs/selects;
icon-only buttons got `aria-label` plus `aria-hidden="true"` on the
inner SVG; checkboxes got explicit `htmlFor`/`id` pairing; modal forms
got `Label htmlFor` + matching `Input id`. `@axe-core/react` was wired
into `apps/admin/src/main.tsx` so dev-mode console surfaces violations
live. The doc tree was consolidated into 4 thematic groups under
`docs/architecture`, `docs/strategy`, `docs/ai-coder`, `docs/audits`,
keeping only README, INFRA-CHECKLIST, LAUNCH-LIMITATIONS, and a few
governance docs at the root. Design tokens were synced
(`docs/design-system/tokens.json` ↔ `apps/admin/src/index.css`) with a
verify script and a 7-sub-test Jest suite. k6 load testing got a
`scripts/verify-load.sh` gate wired into verify-master, with budgets in
`.ai-coder/perf-budgets.json`; in dev it cleanly SKIPs because
`LOADTEST_BASE_URL` is unset.

**Dispatch G (this dispatch) — Closure.** Mutation full sweep on the 7
sacred files (`refund.service.ts` does not exist yet, so the roster
effectively contracts to 7). A jest-axe baseline test for the canonical
a11y patterns the F sweep applied; full-page render is not feasible from
the api workspace because admin pages pull in router, query client, auth
context — full-page assertion is deferred to Phase 14 Playwright e2e (per
LAUNCH-LIMITATIONS §18). All closure artifacts: this honesty check, an
evidence manifest, paper-trace, boundaries, premortem, future-bugs,
checks/INDEX, BASELINE-DEBT.

## 3. Mutation results (sacred files)

The full Stryker sweep on the 7 existing sacred files (escrow,
commission, dispute, booking, payout, wallet, settings — refund.service
deferred to its phase) was started in this dispatch. 2237 mutants were
instrumented across the 7 files. Stryker's initial estimate at the
~3-minute mark put completion at roughly 1h 30m to 3h on this hardware,
which exceeds the 30-minute window the user authorised for this
dispatch.

Per-file scores at the dispatch close are recorded in
`dispatch-G/mutation-summary.md`. If the sweep did not complete during
the dispatch window, the summary records that fact plainly along with
the partial-coverage numbers Stryker was able to produce. The user's
explicit instruction was: "If mutation testing infrastructure is broken
or takes >30min, document the limitation in HONESTY-CHECK.md and
proceed — but do NOT mark G complete with a fake green."

The per-phase delta-scoped mutation gate
(`verify-mutation-coverage.sh --phase PHASE-13`) reports SKIP under
TD-005 because Phase 13 touched 0 of the 8 sacred files. That gate's
PASS is honest: TD-005 explicitly defines "skip" as the correct outcome
when the phase did not modify sacred code. The full-sweep result is the
absolute-launch gate (Constitution Article 13) and is captured in the
dispatch-G evidence regardless of completion state.

## 4. What remains in code as scheduled debt

`LAUNCH-LIMITATIONS.md` enumerates each item with rationale, scheduled
phase, and mitigation. By topic:

- **Dispatch console UX** (§1, §2): reassign-dialog provider eligibility
  and cancel-dialog refund preview deferred to Phase 14 dispatch
  console v2.
- **DSR completeness** (§3, §4, §8, §9): no track-requests mobile view,
  no rate limiting on submission, erasure DSR does not auto-delete, only
  the latest submission is shown in confirmation.
- **Consent versioning** (§5): no forced re-consent on publish; users
  remain on the prior version until next interactive consent.
- **Admin-customer messaging** (§6, §7): verb only, no transport (no
  email/SMS yet); NPC escalation reference format unchosen.
- **BIR storage** (§10): bucket policy not yet enforced (10-year Object
  Lock is documented in INFRA-CHECKLIST as ops responsibility).
- **hCaptcha** (§11): verifier exists, public flows not yet wired (waits
  on production hCaptcha account).
- **Admin password rehash** (§12): opportunistic only — admins not
  forced to relogin.
- **Jest worker leak** (§13): pre-existing; not regressed.
- **Polymorphic discount/conversion columns** (§14): schema cleanup
  scheduled.
- **BIGINT precision ceiling and parser scope** (§15, §16): documented
  with the migration trigger.
- **Cooling-off per-row processor** (§17): SAFE-N+1 by design; BullMQ
  migration scheduled.
- **A11y full-page assertion** (§18): pattern baseline shipped; full
  Playwright e2e in Phase 14.

## 5. What is operational, legal, or B2B work OUTSIDE this codebase

These items must complete before any real launch. None are in this repo
and none can be addressed by an AI coder editing files. They require
real-world contracts, registrations, or merchant onboarding:

- **SOC2 / ISO27001 audit** — formal third-party security audit. Months
  of preparation, evidence collection, and assessor engagement.
- **NPC registration of Data Protection Officer (DPO)** — Republic Act
  10173 mandates a registered DPO for any controller of personal data.
  The platform has DPO infrastructure (DPO log page, DSR flow) but no
  registered human in the role yet.
- **BIR registration for invoice series** (RR 8-2018) — official
  receipt and collection receipt series must be registered with the
  Bureau of Internal Revenue before issuing any.
- **DTI business permit** and **Mayor's permit** — the operating
  entity must be registered and permitted in its principal place of
  business.
- **Insurance policy procurement** — per `docs/strategy/INSURANCE.md`,
  general liability + cyber liability + (where applicable)
  service-provider professional indemnity must be in force.
- **hCaptcha or Cloudflare Turnstile contract** — the verifier code is
  ready; the production secret and account are not. Pricing tier and
  TOS must be agreed to before public auth flows are enabled.
- **Sentry production project + DSN** — admin Sentry init reads
  `VITE_SENTRY_DSN` from env. The DSN does not yet exist in any
  production environment.
- **PayMongo prod merchant onboarding** — KYC, settlement bank
  account, webhook endpoint registration, and live API keys.
- **S3 BIR bucket with Object Lock 10y** — per INFRA-CHECKLIST. Object
  Lock cannot be retrofitted; the bucket must be created with it.
- **Production Postgres with PITR backups** — managed Postgres with
  point-in-time recovery; backup retention policy must be defined.
- **DNS + TLS for `api.onservice.ph`** — the production hostname is
  not yet provisioned.
- **Admin SSO** (Google Workspace) — staff admins should not authenticate
  by password long-term; SSO via Google Workspace OIDC is the planned
  path but not yet built into the admin app.

## 6. Final state

- Working tree clean before tag.
- 876 tests pass across 44 suites in the api workspace.
- 0 typescript errors across all 3 workspaces.
- 0 lint warnings at repo root.
- 0 forbidden patterns absolute, 0 introduced this phase.
- 0 emoji-as-icon absolute, 0 introduced this phase.
- 0 phantom tests absolute, 0 introduced this phase.
- 0 N+1 patterns introduced this phase (30 absolute, all deferred and
  documented).
- 0 unjustified SAFE-N+1 markers.
- Money-conservation gate green.
- Migrations gate green (058, 059 validated).
- k6 load gate cleanly SKIPs in dev (no LOADTEST_BASE_URL).
- Per-phase mutation gate cleanly SKIPs (TD-005, no sacred files
  touched in Phase 13).
- Full mutation sweep result honestly captured (complete or partial)
  in `dispatch-G/mutation-full.log` and `mutation-summary.md`.
- A11y baseline test (4 canonical patterns) PASS via jest-axe.
- A11y manual verification protocol documented for human execution.

Phase 13 closes here. The next phase is Phase 14 (Playwright e2e + full
admin a11y assertion + dispatch console v2 + DSR completeness items 3,
4, 8, 9 + cooling-off BullMQ migration). The next-after-that, before
launch, is the operational/legal work in section 5.
