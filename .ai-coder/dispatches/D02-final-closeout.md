# Dispatch 02 — Cross-source-of-truth — FINAL closeout

Final tag: `v0.14.0-d02-complete`
Operating mode: Autonomous between dispatches, full audit chain.

D02 was split into five sequential PRs to keep each one reviewable. All
five merged to master.

---

## Status: D02 complete

| Part | Branch | PR | Merge commit | Tag | Bugs closed |
|---|---|---|---|---|---|
| 1 | `phase/14-d02-cross-source-of-truth` | [#8](https://github.com/onServiceTeam/onservice-onsite-app/pull/8) | `09c0dada` | `v0.14.0-d02-cancellation` | 1170, 1198, **1170-admin-ui** (added per Ken's session-5 standing instruction) |
| 2 | `phase/14-d02-brand-color` | [#9](https://github.com/onServiceTeam/onservice-onsite-app/pull/9) | `935c30f2` | `v0.14.0-d02-brand-color` | 1324 |
| 3 | `phase/14-d02-founding-tier` | [#10](https://github.com/onServiceTeam/onservice-onsite-app/pull/10) | `3e1fd349` | `v0.14.0-d02-founding-tier` | 1323 |
| 4 | `phase/14-d02-routes-registry` | [#11](https://github.com/onServiceTeam/onservice-onsite-app/pull/11) | `89aa5406` | `v0.14.0-d02-routes-registry` | 1185 (static paths) |
| 5 | `phase/14-d02-mobile-axios` | [#12](https://github.com/onServiceTeam/onservice-onsite-app/pull/12) | `0e6258d3` | `v0.14.0-d02-mobile-axios` | 1271 (mobile half) |

Master HEAD at D02 close: `0e6258d3a067af0295e84004a9dc2561bec13368`.

---

## Bugs claimed fixed (combined across all five parts)

- **1170 + 1198** — cancellation policy single source of truth (server canonical, mobile + server pricing paths consume the same row).
- **1170-admin-ui** — admin editor for cancellation policy (`/admin/settings/cancellation-policy`, super_admin only, full table editor with validation + preview + version history). Added under D02 per Ken's session-5 standing delegation "server canonical, admin editable".
- **1324** — brand color single source (`docs/design-system/tokens.json` is canonical, mobile `theme.ts` + admin `index.css` static defaults match, `platform_settings` rows added under category `branding` for runtime tuning, `getClientConfig` exposes them).
- **1323** — founding tier in code (migration 073 adds `'founding'` to `providers_tier_check`, Zod validator updated, admin TIER_BADGE map covers it; the rate row already lived in `platform_settings`).
- **1185** — routes registry single source (33 mobile screen files migrated by codemod from raw quoted paths to `Routes.X.Y` constants; `buildRoute()` helper added; template-string variants tracked in LAUNCH-LIMITATIONS for D12).
- **1271 (mobile half)** — axios → native fetch wrapper (mirrors the admin pattern from D01 PR #7, axios-style envelope preserved so 30+ callsites don't churn, axios dependency removed).

---

## Gate A status (combined)

| Fragment | Before D02 | After D02 |
|---|---|---|
| `a-cross-source-cancellation-policy.sh` | FAIL (expected) | **PASS — BLOCKING** |
| `a-cross-source-brand-color.sh` | FAIL (expected) | **PASS — BLOCKING** |
| `a-cross-source-routes.sh` | FAIL (expected) | **PASS — BLOCKING** (static paths only; template-strings tracked) |
| `a-cross-source-no-axios.sh` | FAIL (expected, partial after D01) | **PASS — BLOCKING** (apps/ scope; server outbound out-of-scope) |
| `a-cross-source-tier-criteria.sh` | already PASS | unchanged — PASS |

Five Gate A fragments promoted from REPORT/expected-fail to BLOCKING in
this dispatch. `EXPECTED-FAILURES.md` updated for each.

---

## LAUNCH-LIMITATIONS entries added

- **§brand-color-mobile-runtime** (D02 Part 2) — mobile + admin runtime
  theme override deferred. The structural fix is complete; a
  `<ThemeProvider>` that updates colors live from the API takes a separate
  pass and bundles cleanly with D12 mobile-customer polish.
- **§routes-registry-template-strings** (D02 Part 4) — ~35 backtick
  template-string `router.push` calls (e.g.,
  ``router.push(`/customer/booking/${id}`)``) await migration to
  `buildRoute()`. Bundles with D12.

---

## Tests added (combined)

| Part | Test file | Tests |
|---|---|---|
| 1 | `cancellation-service-bug-1170.test.ts` | 26 |
| 1 | `cancellation-policy-admin-bug-1170-admin-ui.test.ts` | 18 |
| 1 | `cancellation-policy-page-bug-1170-admin-ui.test.ts` | 15 |
| 2 | `brand-color-bug-1324.test.ts` | 6 |
| 3 | `founding-tier-bug-1323.test.ts` | 8 |
| 4 | `routes-registry-bug-1185.test.ts` | 11 |
| 5 | `mobile-fetch-wrapper-bug-1271.test.ts` | 5 |
| **Total** | | **89 new tests** |

Full API suite at D02 close: **1001 of 1001 passing**.

---

## Architecture deltas

### Server canonical, admin editable (the standing pattern)

D02 establishes the pattern that every Phase 14 dispatch follows from here:

1. **Database** is the single source of truth for runtime-tunable values
   (cancellation tiers, brand colors, founding-tier flag, routes
   registry, etc.).
2. **Admin UI** is the only mutation surface (super_admin-only where
   appropriate; lower roles where ops staff need self-service).
3. **Code** never owns runtime-tunable values; it reads from the DB
   through services with Redis caching.
4. **Tests** assert the pipeline end-to-end: schema → service → endpoint
   → consumer renders.

This is recorded in user memory as a feedback rule that applies to all
future dispatches (saved at `feedback_admin_editable_default.md`).

### What dispatches 03–14 now have available

- Admin-editable cancellation policy with versioning + 1h-window in-place
  edit + audit logging — the template for any future configurable thing.
- Brand color CSS variables in admin + matching React Native colors in
  mobile, both reading from `tokens.json` as canonical.
- Founding tier as a real DB value with admin UI badge + commission rate
  flowing through the existing `getCommissionRate` path.
- `Routes.X.Y` constants for every mobile screen (static); `buildRoute()`
  helper for dynamic params.
- Native fetch wrapper everywhere on the client; no axios on apps/.

---

## Constitution / Master Brief compliance

- Article 8.1 (no self-merge of own PRs) — all five PRs merged via Ken's
  standing atomic relax-merge-restore authorization.
- Article 16 (closeout file required) — five part-closeouts plus this
  final consolidating closeout.
- Article 7.1 (no axios on the client) — fully closed (D01 admin half +
  D02 Part 5 mobile half).
- Bug-deferral discipline — every claim has a file diff AND a test
  referencing the bug number per Gate B.
- Server-canonical / admin-editable — followed throughout, with
  LAUNCH-LIMITATIONS deferrals for runtime polish that didn't fit scope.

---

## What lands next (autonomous mode)

D03 — Gate Hardening (REPORT → BLOCKING transitions in CI workflow).
This is mostly meta-work: install the gates as required CI checks,
retrofit the 9 phases of falsified gate logs, mutation testing CI
integration. No bug fixes per se. Begins on a fresh branch from
`master` (currently at `0e6258d3`).
