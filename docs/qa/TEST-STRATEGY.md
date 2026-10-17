# onService — Test Strategy

Owner: QA. Audience: engineering, product, support. Living document.

## Purpose

onService is a money-handling, compliance-bound services marketplace. This
strategy concentrates test effort where a defect is most expensive: money
correctness, the booking state machine, and Philippine regulatory compliance
(NPC RA 10173, BIR). It is risk-based on purpose: not every screen earns equal
attention.

## Risk tiers

Effort and required test depth follow the tier.

### Tier 1 — money + legal correctness (deepest coverage)
A defect here loses real money or breaches a regulation.
- Escrow hold / release, dispute holds.
- Commission math across the five provider tiers (founding 10%, new 15%,
  verified 13%, pro, elite) and the BIGINT money ceiling.
- Refunds: full, partial, dispute-driven.
- Wallet top-up + PayMongo webhook idempotency (double-credit and lost-credit
  on retry are the two failure modes).
- Payout calculation + release.
- BIR receipt issuance; NPC data-subject-request (DSR) lifecycle and consent.

**Required:** automated API + unit coverage with property/edge tests, plus a
manual exploratory charter before every release that touches these paths.

### Tier 2 — core flow integrity
- Booking lifecycle state machine (every transition + the cancellation,
  dispute, change-order, reschedule branches).
- Provider onboarding / KYC review.
- Dispatch + offer cycle.
- Authorization / IDOR across all owned resources.

**Required:** automated E2E happy paths + an authz regression suite (see
`qa/api-security/`), plus exploratory charters on the branch/edge paths.

### Tier 3 — experience
- Navigation, polish, empty/error/loading states, accessibility, i18n.

**Required:** component tests + visual regression baselines; manual a11y passes.

## Test pyramid (target shape)

| Layer | Tool(s) | Where |
|---|---|---|
| Unit / service | jest | `packages/api/__tests__`, `apps/mobile/__tests__` |
| Component (render) | jest + RTL (jsdom) | `apps/mobile/__tests__/screens` |
| API integration / security | node:test over HTTP | `qa/api-security/` |
| Visual regression | Playwright (admin), Maestro (mobile) | `apps/admin/tests/visual`, `apps/mobile/.maestro` |
| E2E (web) | Playwright | `apps/admin/tests/live` (gated staging) |
| E2E (native) | Appium | blocked on native build (see RISK-REGISTER R-9) |
| Exploratory | manual, session-based | `docs/qa/EXPLORATORY-CHARTERS.md` |

The current real gap is the middle-to-top of the pyramid: multi-actor E2E and
native-device coverage. The base (unit/component) and visual layers are strong.

> **Correction (2026-10-14, D40):** "the visual layer is strong" was not true.
>
> - Gate D is report-only (`scripts/gates/MODES.json`, `gate_d_state`). CI never runs the Playwright visual specs. The admin visual checks are run locally only, on Windows, and six specs had silently stopped running before the 2026-10-14 review (LAUNCH-LIMITATIONS.md section 132).
> - No mobile visual baselines are committed. F#3 is still open.
> - Accessibility coverage is incomplete (RISK-REGISTER R-11). A search of the repo on 2026-10-14 found no record of the "manual a11y passes" required for Tier 3.
> - The unit, API and screen-render tests start in CI on every push to `master` (`.github/workflows/ci.yml`). That is the strongest layer today. But `ci.yml` cancels a run when a newer push to the same branch arrives before it finishes (`cancel-in-progress: true`), so not every pushed commit gets a finished run. Check that the exact commit has a finished green run. Passing tests there still prove only what those tests check.
> - The authorization suite in `qa/api-security/` and the live Playwright E2E run are not part of CI.

## Test integrity (non-negotiable)

This codebase has a documented history of tests that passed without proving
anything (Phase 13's faked gates; three rounds of fake-passing tests in
Phase 14). The standing rule, already in `CLAUDE.md`, is enforced here:

- A test must fail if the feature breaks. Reviewers ask "how would this fail?"
- No assertion-on-source-string or file-exists checks dressed as behavior tests.
- One bug, one test, named for the behavior it protects.

A green suite must mean the product works. Volume without integrity is worse
than no tests because it manufactures false confidence.

> **Note (2026-10-14, D40):** "enforced" above means enforced by review, not by a
> machine check. On master `8d319a18`, no CI check rejects file-exists or
> source-text tests. The
> only related check is Gate C's `unique-regression-ids`, which rejects duplicate
> bug IDs in test titles, but only IDs with a letters-dash prefix such as
> "UX-018"; plain numeric IDs and three-part IDs such as "R-CUS-09" are not
> checked (adoption backlog BL-22, added 2026-10-17). At least one test of the banned shape is still on
> `master` (`packages/api/__tests__/d07-encompassed-bugs.test.ts`, the Bug 1224
> block, which asserts `existsSync(...)` and matches source text).
>
> The D40 gate commit adds a Gate C article, `no-fake-tests`
> (`scripts/gates/c-no-fake-tests.py`). It rejects two narrower shapes: a test
> whose only assertions say a file exists, and an assertion that some text
> contains a bug citation such as "Bug 1234". It does not reject general
> source-text tests, so a test like the Bug 1224 block above can still pass it.
> It catches only the exact written forms of its two shapes; small variants
> (for example `.exec()` instead of `.match()`) still pass (added 2026-10-17).
> Its exact rules are in the script header. If that script is not in the repo,
> the commit has not landed and this paragraph does not apply yet.

## Environments

- **Local dev stack** (`scripts/dev/up.sh`): seeded, resettable, dev OTP `000000`.
  The right place for API/security/integration tests and repeatable runs.
- **Staging** (app/admin/api .onservice.ph): real-ish, password-gated. Used for
  E2E confidence and the tester program. **PayMongo is currently in LIVE mode
  here — see RISK-REGISTER R-1; do not run real payments.**

## Definition of Done

See `docs/qa/DEFINITION-OF-DONE.md`. Every story carries acceptance criteria and,
for Tier 1/2 work, an exploratory charter.

## How to run the suites

```
# API security / authz (local stack up)
cd qa/api-security && API_URL=http://localhost:7381 node --test

# Web E2E against gated staging (creds in local TESTER-HANDOFF.md)
cd apps/admin && npx playwright test --config=playwright.live.config.ts \
  --project=setup --project=customer --project=provider --project=admin

# Unit/component
cd packages/api && npx jest
cd apps/mobile && npx jest
```
