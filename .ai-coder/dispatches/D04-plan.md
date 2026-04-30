# Dispatch 04 — SiguradoShield Pull (Option A) — Plan

Branch: `phase/14-d04-siguradoshield-pull`
Started from: D03 HEAD
Source spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-03-04.md` §"Dispatch 04"
Decision: `.ai-coder/decisions/D04-siguradoshield.md` — Option A — Ken 2026-04-30

## Goal

Remove every SiguradoShield UI surface, every server config reference, and every charge/payout integration (none exist) from v1.0. Replace with verifiable trust claims (NBI clearance, escrow, real-time tracking, masked phone numbers). Add binding gate to prevent reintroduction. Defer the real insurance product to v1.1+ behind an Insurance Commission license or licensed-insurer partnership.

## Bugs claimed fixed (8)

| Bug | File | Approach |
|---|---|---|
| 1168 | `apps/mobile/src/config/platform.config.ts:52-55` | Remove 4 constants; replace with deprecated comment block. |
| 860 | `apps/mobile/app/onboarding.tsx` slide 2 | Replace SiguradoShield slide with NBI-cleared + escrow trust claims. |
| 889 | `apps/mobile/app/(tabs)/home.tsx` lines 410-422 | Replace tappable banner with informational "How onService works" section. |
| 920 | `apps/mobile/app/(tabs)/profile.tsx` line 83 | Remove "SiguradoShield Protection" menu row. |
| 538 | `apps/mobile/app/customer/safety.tsx` (entire 382-line screen) | Rename to `safety-and-support.tsx`; full rewrite per Part 2B §40 Option A. |
| 983 | `apps/mobile/app/customer/payment-methods.tsx` lines 82-91 | **Already clean** — current escrow box has no SiguradoShield trademark/peso amounts. Mark encompassed. |
| 686 | `apps/mobile/app/customer/help.tsx` FAQ | Remove SiguradoShield FAQ; add Ken-disclaimer placeholder for "Does the platform provide insurance?" |
| 834 | `apps/mobile/app/customer/{terms.tsx, provider/[id].tsx, booking/checkout.tsx, booking/confirm.tsx}` | Strip every leftover trademark and "Protected by SiguradoShield" line; replace with cleaned-up escrow-only language + disclaimer placeholder where appropriate. |

## Server-side cleanup (Ken's expansion of D04 scope)

| File | Change |
|---|---|
| `packages/api/src/config/platform.config.ts:160-167` | Delete the INS-002 SiguradoShield insurance block. Replace with a deprecation comment referencing this dispatch and the decision file. |
| `packages/api/src/services/settings.service.ts:51, 394` | Remove `max_property_damage_coverage` from default settings dict and from the `getSettingNumber` reader chain. |
| `packages/api/__tests__/settings-service.test.ts:103` | Update test fixtures: drop `max_property_damage_coverage` (it's no longer a default). |
| `packages/api/migrations/050_platform_settings_rich_schema.sql:70-71` | Add a deprecation comment header above the SiguradoShield protection seed rows. Do NOT delete or `DROP` — historical migration is immutable. |
| `packages/api/migrations/014_create_disputes.sql:2` | Update the comment header to remove the "+ SiguradoShield™ (Chapter 7)" reference (or annotate that Chapter 7 functionality is deferred to v1.1+). |

## Charge / payout audit (Ken's expansion)

Per Ken's instruction, audit pricing engine + booking creation + payout flow for any SiguradoShield premium add-on or claim deduction. **Audit result: none exist.** The audit-listed constants in `platform.config.ts` were referenced only by `settings.service.ts` defaults; no service multiplied a booking total by a shield premium and no payout subtracted a deductible. The "wiring" was UI-copy only. Closeout records this finding.

## Provider mobile + admin scope

Grep across `apps/mobile/(provider)/`, `apps/admin/`, `packages/api/src/` finds **zero** SiguradoShield code references in provider mobile and admin. The Phase-14 catalog entries that mention SiguradoShield in provider/admin contexts are spec docs only — no code ever shipped. Closeout records this finding too.

## New gate (replaces REPORT-only fragment)

| File | Mode | Purpose |
|---|---|---|
| `scripts/gates/c-constitution-no-shield-references.sh` | BLOCKING | Fails any commit that adds `SiguradoShield`, `siguradoShield*`, `siguradoshield*`, `propertyDamage*`, `premiumProtection`, `shieldDeductible*`, or `max_property_damage_coverage` to UI surfaces, server services, or any *.ts/*.tsx outside the explicit allowlist. |
| `scripts/gates/a-cross-source-no-siguradoshield.sh` | superseded | Becomes a thin alias that delegates to the new gate (so historical workflow refs still work). Mode in MODES.json downgraded to point at the new gate's coverage. |

Allowlist for the new gate (regex-matched paths):

- `LAUNCH-LIMITATIONS.md`
- `.ai-coder/decisions/D04-siguradoshield.md`
- `.ai-coder/phase-14/**` (read-only spec docs — historical references)
- `.ai-coder/dispatches/D04-*.md` (closeout / plan reference the term)
- `scripts/gates/c-constitution-no-shield-references.sh` (the gate itself names the term)
- `scripts/gates/a-cross-source-no-siguradoshield.sh` (alias)
- `scripts/gates/MODES.json`
- `scripts/gates/EXPECTED-FAILURES.md`
- `scripts/gates/__tests__/` (smoke tests reference the term in negative assertions)
- `packages/api/migrations/*.sql` (deprecated migrations preserve history)
- `docs/strategy/INSURANCE.md` (strategic doc, not user-facing — annotated to reflect deferral)
- `docs/audits/**` (Phase-13 audit docs reference SiguradoShield)
- `.ai-coder/SESSION-LOG.md` (session continuity)

## MODES.json update

`gate_a_fragments.a-cross-source-no-siguradoshield`:
- `mode: BLOCKING` (was REPORT)
- `promoted_in: D04`
- `rationale`: updated to reflect supersession by `c-constitution-no-shield-references` and the Ken pull decision.

`gate_c_articles.no-shield-references` (new entry):
- `mode: BLOCKING`
- `owning_dispatch: D04`
- `promoted_in: D04`
- `rationale`: stricter enforcement per Ken's pull-execution rule; supersedes the Gate A fragment.

The c-constitution.sh aggregator gains a per-article check that runs the new shield-references script.

## LAUNCH-LIMITATIONS §23

Ken-framed wording (verbatim per chat instruction):

> SiguradoShield (in-house insurance product) deferred to v1.1+. v1.0 ships without platform-provided coverage. Customers and providers are responsible for any damage or loss per the standard ToS. When real coverage is added, it requires either (a) PH Insurance Commission license + underwriter capital, or (b) partnership with a licensed insurer who provides the policy and we collect premiums on their behalf as authorized representative. Either path is a v1.1+ project, not a v1.0 patch.

Earlier §19 in the spec example is replaced/superseded by §23.

## Negative tests

For each pulled bug, the bug-tagged test asserts SiguradoShield does NOT appear:

- `apps/mobile/__tests__/onboarding-no-siguradoshield.test.tsx` — verifies slide 2 has no trademark, no peso amounts, no `protection` insurance language.
- `apps/mobile/__tests__/home-no-siguradoshield.test.tsx` — verifies home screen has no banner; the new "How it works" section renders correctly.
- `apps/mobile/__tests__/profile-no-siguradoshield-menu.test.tsx` — verifies menu row absent.
- `apps/mobile/__tests__/safety-and-support.test.tsx` — verifies no insurance language; verifies the cleaned-up safety affordances render.
- `apps/mobile/__tests__/help-no-siguradoshield.test.tsx` — verifies FAQ section.
- `apps/mobile/__tests__/terms-no-siguradoshield.test.tsx` — verifies section 6 cleaned (Ken disclaimer placeholder visible to test as a comment, not as user copy).
- `apps/mobile/__tests__/booking-checkout-no-siguradoshield.test.tsx` — verifies checkout escrow line has no trademark.
- `apps/mobile/__tests__/booking-confirm-no-siguradoshield.test.tsx` — same for confirm.
- `apps/mobile/__tests__/provider-detail-no-siguradoshield.test.tsx` — verifies provider detail no longer mentions SiguradoShield.
- `packages/api/__tests__/no-shield-config.test.ts` — verifies server-side platformConfig has no `insurance` block, no `maxPropertyDamageCoverage` etc.

Each test references its bug number in `describe()`/comments per Gate B parsing.

## Files expected to add (count: ~14)

```
.ai-coder/dispatches/D04-plan.md (this file)
.ai-coder/dispatches/D04-closeout.md
apps/mobile/app/customer/safety-and-support.tsx (renamed from safety.tsx)
apps/mobile/__tests__/onboarding-no-siguradoshield.test.tsx
apps/mobile/__tests__/home-no-siguradoshield.test.tsx
apps/mobile/__tests__/profile-no-siguradoshield-menu.test.tsx
apps/mobile/__tests__/safety-and-support.test.tsx
apps/mobile/__tests__/help-no-siguradoshield.test.tsx
apps/mobile/__tests__/terms-no-siguradoshield.test.tsx
apps/mobile/__tests__/booking-checkout-no-siguradoshield.test.tsx
apps/mobile/__tests__/booking-confirm-no-siguradoshield.test.tsx
apps/mobile/__tests__/provider-detail-no-siguradoshield.test.tsx
packages/api/__tests__/no-shield-config.test.ts
scripts/gates/c-constitution-no-shield-references.sh
scripts/gates/__tests__/gate-c-no-shield-references.test.sh
```

## Files expected to modify (count: ~12)

```
.ai-coder/CURRENT-DISPATCH
.ai-coder/SESSION-LOG.md
.ai-coder/decisions/D04-siguradoshield.md (already done)
LAUNCH-LIMITATIONS.md
scripts/gates/MODES.json
scripts/gates/EXPECTED-FAILURES.md
scripts/gates/a-cross-source-no-siguradoshield.sh (becomes thin alias)
scripts/gates/c-constitution.sh (add no-shield-references article)
apps/mobile/src/config/platform.config.ts
apps/mobile/app/onboarding.tsx
apps/mobile/app/(tabs)/home.tsx
apps/mobile/app/(tabs)/profile.tsx
apps/mobile/app/customer/help.tsx
apps/mobile/app/customer/terms.tsx
apps/mobile/app/customer/booking/checkout.tsx
apps/mobile/app/customer/booking/confirm.tsx
apps/mobile/app/customer/provider/[id].tsx
packages/api/src/config/platform.config.ts
packages/api/src/services/settings.service.ts
packages/api/__tests__/settings-service.test.ts
packages/api/migrations/014_create_disputes.sql (header comment)
packages/api/migrations/050_platform_settings_rich_schema.sql (header comment)
docs/strategy/INSURANCE.md (deferral annotation)
```

## Files renamed (count: 1)

```
apps/mobile/app/customer/safety.tsx → apps/mobile/app/customer/safety-and-support.tsx
```

(Includes navigation registry update so `Routes.CUSTOMER.SAFETY` points at the new path. Profile menu row that referenced this route is removed entirely per Bug 920, so there's no caller of the new route from the profile tab. Other callers (deep links, booking detail) get their references updated.)

## Acceptance criteria for D04 own-gate-pass

- All 5 gates green on `phase/14-d04-siguradoshield-pull`.
- New `c-constitution-no-shield-references` article: BLOCKING and PASSING (zero violations outside allowlist).
- `a-cross-source-no-siguradoshield` (alias): PASSING.
- All negative tests pass.
- `pnpm tsc --noEmit -p apps/mobile/tsconfig.json` clean (after constants deleted, every consumer must also be cleaned).
- Closeout passes Gate B (each bug has file:line + test reference).

## Order of execution (dependencies)

1. Decision file + plan + CURRENT-DISPATCH (this commit, infrastructure).
2. Bug 1168 first — deleting the constants makes every consumer light up as a TypeScript error, which is the desired forcing function.
3. Bugs 860, 889, 920, 538, 983, 686, 834 in order — each TS error becomes a checklist item.
4. Server cleanup (`platform.config.ts`, `settings.service.ts`, test fixture).
5. Migration deprecation headers.
6. New gate + alias rewire + smoke test.
7. MODES.json update + EXPECTED-FAILURES sync.
8. LAUNCH-LIMITATIONS §23.
9. Local gate run; if green, write closeout, push, open PR.
10. Auto-proceed to D05.
