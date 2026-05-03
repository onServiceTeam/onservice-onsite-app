# Phase 18 — Full screen audit (2026-05-03)

## Why Phase 18 exists

Phase 17 closed with 104+ real e2e assertions across the API + admin web
chrome — but the user (Ken) flagged that this was still surface-level.
Phase 17 verified that LL#5, LL#10, LL#12, audit-log, role forwarding,
financials banner, customer login + browse, provider login + dashboard,
and the booking state machine work end-to-end. It did NOT touch every
admin page, every customer screen, or every provider screen one by one.

Phase 18 closes that gap: every screen is identified, mapped to its
data sources, driven for real, and any bug found is fixed.

## Scope numbers (real, not estimated)

| Surface | File count | Routes | Roles |
|---|---:|---:|---|
| Admin pages (apps/admin/src/pages/*.tsx, excl. __tests__) | 31 | 29 routed + login + 404 | super_admin / admin / junior_admin |
| Mobile screens (apps/mobile/app/**/*.tsx, excl. _layout) | 84 | 84 | customer / provider / public |
| Total | **115** | 113 | — |

## Method

For each screen, in order:

1. **Identify** — file path, route URL, audience role
2. **Map** — list every API endpoint it calls, every DB table those endpoints touch, every interactive control on the page (button, link, form, dropdown, modal trigger)
3. **Drive** — for admin: real headless Chromium navigates to it, takes a screenshot, asserts the page rendered without console errors and that role-appropriate content shows up. For mobile: every API endpoint the screen consumes is hit as that role, response shape verified.
4. **Interact** — for admin: every primary action button gets clicked, every form gets submitted with valid + invalid input, DB state checked after writes. For mobile: each "primary action" endpoint gets called with valid + invalid payloads, DB state verified.
5. **Record** — pass/fail per screen logged to `PHASE-18-RESULTS.md`. Screenshots saved to `screenshots/phase-18/`. Bugs found go to `PHASE-18-BUGS.md` with severity.
6. **Fix** — any confirmed bug fixed in the same pass. If it requires a schema change or multi-screen rework, it goes on the deferred list with a justification.

## Sub-phases

| Sub | What | Method | Output |
|---|---|---|---|
| 18a | Inventory build | Two background agents map admin + mobile | INVENTORY-PHASE-18.md |
| 18b | Admin sweep wave A — drive all 31 routes | Playwright headless | screenshots/phase-18/admin-* |
| 18c | Admin deep-test — interactions on each page | Playwright + DB asserts | PHASE-18-ADMIN-RESULTS.md |
| 18d | Mobile customer — 43 screens, API contract drive | node + fetch | PHASE-18-CUSTOMER-RESULTS.md |
| 18e | Mobile provider — 41 screens, API contract drive | node + fetch | PHASE-18-PROVIDER-RESULTS.md |
| 18f | Bug repair | Edit + Bash | code commits |
| 18g | Final report + commit | — | PHASE-18-FINAL.md |

## Honest statement of what mobile testing means here

I do not have an Android emulator that runs Expo Go cleanly in this
environment (BlueStacks is for game APKs, not Expo). I do not have an
iOS simulator (this is Windows). So mobile screens get tested at three
layers:

1. **Source read** — every screen file read in full. Bug patterns flagged: uncaught nulls, missing loading/error/empty states, hardcoded values that should be from settings, role checks missing, etc.
2. **API contract** — every endpoint each screen calls is hit live with real auth. If the screen says "GET /api/v1/providers/me" the test verifies that endpoint returns the shape the screen consumes.
3. **Type/build check** — TypeScript + ESLint catch many compile-time mistakes that would surface as runtime errors on device.

The remaining gap (touch interactions, gesture handlers, native module
behavior) cannot be verified without device runtime. That gap is named
explicitly in the final report — not buried.

## Hard stops

Same as CLAUDE.md:
1. Money/compliance risk → escalate
2. Schema migration touching production-shape data → escalate
3. Architectural decision needing Ken → write decision file
4. Spec contradiction → escalate
5. Legal-language requirement → escalate

## Known external limits (still)

- F#3 Maestro baselines (need real iOS sim or proper Android emulator)
- F#10 attorney-reviewed disclaimer wording
- 12 D14 ops items (NPC DPO reg, BIR ATP, PayMongo live, S3 Object Lock,
  Postgres PITR, DNS+TLS)
- PayMongo live webhook chain (sandbox needed for actual escrow release)

These are not Phase 18 work.
