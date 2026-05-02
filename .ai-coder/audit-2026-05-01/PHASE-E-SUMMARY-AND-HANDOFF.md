# Audit 2026-05-01 — Phase E COMPLETE — Provider mobile fully audited

**Status:** Phase A + B + C + D + E complete. Phase F (admin web) is the next major chunk.

**Master commit at start of session:** `b8bd2f2`. Working tree clean apart from `.ai-coder/audit-2026-05-01/` (untracked).

---

## Phase reads to date

| Phase | Status | Lines fully read | Findings docs |
|---|---|---:|---|
| A — Inventory + risk ranking | ✅ Done | n/a | INVENTORY.md |
| B — Money path | ✅ Done | 13,599 | B01–B09 (9 docs) |
| C — Auth + RBAC + sessions | ✅ Done | 6,075 | C01–C05 (5 docs) |
| D — Customer mobile | ✅ Done | 18,979 | D01–D12 (12 docs) |
| **E — Provider mobile** | ✅ **DONE** | **14,031** | **E01–E06 (6 docs)** |
| F — Admin web | Pending | 0 | — |
| G — Migrations + RLS | Pending | 0 | — |
| H — Test quality audit | Pending | 0 | — |
| I — Master AI-coder instructions | Pending | 0 | — |

Total codebase: **~124,099 lines**. Coverage so far: **~42.5% (52,684 lines)**.

---

## This session (session 7) added

E01–E06 — six new findings docs, ~14,031 new lines read.

### Files added this session (counts only — full file lists in each E0x doc)

- Provider tabs (5 files, ~1,477 lines)
- Provider job execution screens (8 files, ~2,466 lines)
- Provider profile management (11 files, ~3,650 lines)
- Provider payouts/account/chat (9 files, ~2,278 lines)
- Provider onboarding (10 files, ~2,070 lines)
- Provider services + components (13 files, ~1,690 lines)
- Targeted Grep verifications against server URL routing (~25 cross-checks)

---

## Headline bug counts (B + C + D + E combined)

| Severity | Count | New this session |
|---|---:|---:|
| **CRITICAL** | **120 (1 invalidated → 119 real)** | **+19 (CRIT-99 through CRIT-119)** |
| **MEDIUM** | **271** | **+58 (MED-214 through MED-271)** |
| LOW/INFO | many | |

### NEW CRITICAL bugs this session (E01-E06)

- **CRIT-99** — provider dashboard EarningsChart shows hardcoded `availableBalance / 7` flat-line fake data (R5-complete fake-wiring family).
- **CRIT-100** — provider dashboard CommissionBreakdown shows back-calculated fake math (12% fee, 1.44% "VAT" — real PH VAT is 12%; legal exposure if screenshotted).
- **CRIT-101** — provider job/[id] "Your Earnings" displays full service price with no commission deduction; provider misled by ₱120-300 per job.
- **CRIT-102** — provider/job/[id]/complete.tsx POSTs photos as raw `file://` URIs (Bug 36/461/943/944/73 ROOT CAUSE REINTRODUCED).
- **CRIT-103** — provider/job/[id]/complete.tsx "Customer Signature" captured as point dots, only timestamp persisted, no actual signature image. Dispute-evidence gap.
- **CRIT-104** — provider/job/[id]/complete.tsx POSTs to `/api/v1/bookings/:id/complete` — endpoint DOES NOT EXIST on server.
- **CRIT-105** — provider/job/[id]/checklist.tsx ships HARDCODED cleaning-only checklist; ignores existing server `/api/v1/jobs/:id/checklist` per-category endpoint.
- **CRIT-106** — provider/job/[id]/navigate.tsx is dead code with FALLBACK_JOB sample data ("Maria Santos / 123 Sample St, Quezon City") + nonexistent `/arrived` endpoint. (Demoted to MED-226 since unreached.)
- **CRIT-107** — provider/job/[id]/complete.tsx "Earnings preview" CommissionBreakdown shows literal zeros. (Demoted to MED-228 — same family as CRIT-99.)
- **CRIT-108** — provider/portfolio.tsx requires the provider to PASTE A URL (no upload UI). Real-world providers cannot complete this. Empty portfolios on every provider profile.
- **CRIT-109** — provider/certifications.tsx requires the provider to PASTE A URL for the certificate image. Founding-tier providers cannot get verified.
- **CRIT-110** — provider/skills.tsx is a TRIPLE FAILURE: dead screen + 60+ hardcoded fake subcategory IDs + non-existent `/api/v1/providers/me/skills` endpoint.
- **CRIT-111** — provider/service-area.tsx posts to non-existent `/api/v1/providers/me/service-area` AND defaults to Manila center (Boracay launch).
- **CRIT-112** — provider/payouts.tsx ships HARDCODED fake earnings (50000/75000/...) AND fake commission breakdown (gross 440000, fee 52800, net 380864).
- **CRIT-113** — provider/withdraw.tsx fake EarningsChart + getWalletBalance broken → balance always ₱0 → withdraw permanently blocked.
- **CRIT-114** — Wallet URL drift EXPANDED: provider screens hit `/api/v1/wallets/...` (plural); server is `/api/v1/wallet/...` (singular). 3 more broken endpoints in CRIT-71 family. Total broken wallet endpoints: 8.
- **CRIT-115** — provider-onboarding/identity-verification.tsx SILENTLY SWALLOWS 404 from non-existent `/provider-onboarding/identity` endpoint, then advances provider as if ID was uploaded. **Comment in code admits the theatre.**
- **CRIT-116** — provider-onboarding/service-area.tsx PH_REGIONS lacks Boracay/Aklan + Manila coord fallback (Boracay launch family).
- **CRIT-117** — provider-onboarding/background-check-status.tsx `useBackgroundCheckStatus` is a PLACEBO — hardcoded fake data, comment explicitly admits "Placeholder: real implementation would call the backend."
- **CRIT-118** — `NbiStatusBanner` fetches non-existent `/api/v1/provider/nbi-status` → banner never renders → NBI-expiry warnings silently disabled. Provider's NBI expires → silent revenue cliff.
- **CRIT-119** — `device-fingerprint.service.ts` non-deterministic (includes `Date.now()` in hash input); breaks device-trust system on reinstall.

### Top 5 fixes by impact (Phase E additions)

1. **CRIT-115 + CRIT-117 (provider-onboarding theatre)** — Provider thinks they uploaded ID + completed background check; nothing persists, nothing polled. Onboarding is fake-passing on a launch-blocking surface. **MUST FIX BEFORE LAUNCH.**
2. **CRIT-99 + CRIT-100 + CRIT-101 + CRIT-107 + CRIT-112 + CRIT-113 + MED-267 (fake earnings data)** — Single dispatch wires existing provider-tools.service.ts endpoints into the 5 provider-side screens. Server + components + service-client are all built; just connect them.
3. **CRIT-102 + CRIT-103 + CRIT-104 + CRIT-105 (provider job-completion flow)** — Photos lost as file:// URIs, signature lost, /complete endpoint doesn't exist, hardcoded cleaning checklist. Coordinated fix replaces the orphan complete.tsx with real upload + status PATCH + server-driven checklist.
4. **CRIT-114 (wallet URL plural→singular)** — Provider Earnings, Withdraw, and Payout History all silently 404. Bulk find/replace.
5. **CRIT-108 + CRIT-109 (portfolio + certifications upload)** — Replace URL paste with ImagePicker. Founding-tier providers blocked from verification today.

Plus the cross-cutting Boracay launch issue (CRIT-92, CRIT-93, CRIT-111, CRIT-116) which spans customer + provider audit.

---

## Cross-cutting themes (B + C + D + E — Phase I material)

These appear throughout the audit. Phase I master instructions need to address them all:

1. **Money math drift across 4+ sources** (CRIT-13, CRIT-42, CRIT-75, CRIT-81, CRIT-83, MED-182, MED-220).
2. **Multi-step non-atomic flows** (CRIT-18, CRIT-26, CRIT-27, CRIT-32, CRIT-33, CRIT-34, CRIT-39, CRIT-55, CRIT-64, CRIT-74).
3. **No staff permission enforcement** (CRIT-23, CRIT-56).
4. **No JWT revocation + no refresh-token replay detection** (CRIT-22, CRIT-53, CRIT-68, CRIT-72).
5. **Webhook handlers incomplete** (CRIT-19, CRIT-20, CRIT-21).
6. **BIR placeholders in PDFs** (CRIT-41).
7. **Settings drift between server + mobile + admin** (CRIT-25, CRIT-42, CRIT-43, CRIT-49, CRIT-75, CRIT-81, MED-182, MED-220, MED-253, MED-259, MED-263).
8. **Validation gaps** (many CRIT/MED).
9. **Audit-log gaps** (CRIT-57, 60, 65, 66, 67).
10. **PII leakage in admin reads** (CRIT-63, MED-114).
11. **No graceful shutdown / startup validation** (CRIT-50, CRIT-49, CRIT-47, CRIT-82).
12. **Rate-limit not actually dynamic** (CRIT-44).
13. **Mobile error-shape mismatch** (CRIT-69, MED-132, MED-171, MED-172, MED-173, MED-190, MED-222, MED-243).
14. **Mobile-server URL drift** (CRIT-71, CRIT-78, CRIT-94, CRIT-96, CRIT-98, CRIT-114, CRIT-115, CRIT-118). **Total broken-URL CRITs: 8 families.**
15. **Customer never sees server-canonical price** (CRIT-75 + CRIT-81 + CRIT-83 + CRIT-89 + CRIT-90 + CRIT-101).
16. **Bug-1061 migration didn't propagate to all token-reading sites** (CRIT-85, CRIT-86, CRIT-91, MED-251, MED-257).
17. **Dead Routes constants + dead UI affordances** (CRIT-79, CRIT-80, MED-146, MED-181, MED-210, MED-214, MED-216).
18. **Two parallel deletion flows** (CRIT-84, MED-252).
19. **TOS vs platform behavior contradicts** (CRIT-83, CRIT-90, MED-244, MED-245).
20. **Hardcoded placeholders/strings shipped to production** (CRIT-95, MED-148, MED-246).
21. **Boracay launch market unsupported by hardcoded geo data** (CRIT-92, CRIT-93, CRIT-111, CRIT-116). 4 sites.
22. **Provider tier enum drift — missing 'founding'** (CRIT-97, MED-174, MED-215, MED-237, MED-244). 5 sites.
23. **Server endpoints missing for documented features** (CRIT-98 GPS ingest, CRIT-104 /complete, CRIT-110 /skills, CRIT-111 /service-area, CRIT-115 /provider-onboarding/*, CRIT-118 /nbi-status). **6+ missing-endpoint CRITs.**
24. **Type duplication mobile↔server creates enum drift** (CRIT-97, MED-238, MED-269).
25. **NPC RA 10173 §28 marketing-consent text missing** (MED-186).
26. **Component-prop ordering bugs** (MED-202, MED-203).
27. **R5-complete fake-wiring pattern** (CRIT-99, CRIT-100, CRIT-107, CRIT-112, CRIT-113, MED-181, MED-202, MED-216, MED-228, MED-267). **Phase 14 R5-complete remediation shipped placeholder data instead of real data on 7+ surfaces.**
28. **Onboarding theatre — silently swallowed 404s** (CRIT-115, CRIT-117). Two sites where mobile fakes successful flow when endpoint doesn't exist.
29. **Provider Photos / signatures captured locally and lost** (CRIT-102, CRIT-103). Dispute-evidence gap.
30. **Native Alert.alert vs ConfirmModal** (MED-219, MED-242, MED-249). 8+ provider screens use raw Alert.

---

## What's left (Phase F + G + H + I)

### Phase F — Admin web (~22,000 lines, ~3 sessions)

29 React 19 + Tailwind 4 + shadcn/ui admin pages. 9 admin services already touched in B09. Remaining:
- Admin booking management (suspend, refund, override pricing) — money path.
- Admin user/staff management (RBAC, audit trail) — auth + compliance.
- Admin promotions, suki tier configuration (settings drift candidates).
- Admin DPO console — where the orphan provider-onboarding submissions and DSR requests should land. Critical for compliance.
- Admin analytics + reports (SQL injection vectors, audit-log writes).
- Admin marketing console.
- **Admin provider-application review queue** — where the broken onboarding submissions (CRIT-115) would land. Critical for catching providers who got through with fake-passed verification.

### Phase G — Migrations + RLS (~4,000 lines, 1 session)

77 migration files. Look for:
- Money columns stored as NUMERIC vs INTEGER (currency-as-decimal precision bugs).
- RLS policies (or lack thereof — some tables may have no policy at all).
- NOT NULL gaps (server code assumes NOT NULL; migration didn't enforce).
- Index drift (server queries vs index coverage).
- FK gaps (orphaned rows possible).
- **provider-onboarding tables** — verify they exist + relate properly to providers.

### Phase H — Test quality audit (~20,000 lines, ~2 sessions)

Per CLAUDE.md, Phase 14 R5/R6/R7 remediation work should be verified at the test level. Patterns to look for:
- `expect(existsSync(...)).toBe(true)` — file-existence-as-test (the F#7 audit smell).
- `expect(closeout.match(/Bug NNNN/)).toBeTruthy()` — source-content regex tests.
- Closeout comma-listed multi-bug test names (forbidden per CLAUDE.md).
- `it.todo` skipped without specific reason text.
- Tests that pass but assertively claim a FAKE behavior is correct.
- The "render but don't assert" pattern (e.g., complete.tsx test that renders the screen but doesn't assert that the broken POST URL is actually fired).

### Phase I — Master AI-coder instructions (1 session)

Synthesizes 119 CRITs + 271 MEDs + cross-cutting themes into a single document Ken can hand to an AI coder. Per the user's original brief: "I need it 100%. Nothing skipped here." Phase I is the deliverable.

---

## Resume prompt for next session

> "Continue the audit from `.ai-coder/audit-2026-05-01/`. Read PHASE-E-SUMMARY-AND-HANDOFF.md first, then start Phase F (admin web). Begin with the admin app foundations (apps/admin/src/app/layout.tsx, apps/admin/src/app/page.tsx, the auth/login screen, the admin dashboard), then move through admin booking management, admin user/staff management, admin DPO console, admin promotions/suki tier config, admin reports/analytics, admin marketing console. Track findings in `findings/F01-admin-foundations.md`, etc. Same protocol: full reads, real bugs, written-down findings, dispatch instructions for each CRITICAL. End with PHASE-F-SUMMARY-AND-HANDOFF.md when Phase F completes."

---

## Discipline notes carried forward

1. **Don't trust prior findings — verify against current code.** E04 found the wallet URL drift (CRIT-114) was wider than D04 (CRIT-71/78) reported.
2. **Never invalidate a CRIT silently.** When Phase E re-confirmed CRIT-91 (chat broken) on the provider side too, the dispatch was tagged MED-251 (provider-side mirror), not used to dismiss CRIT-91.
3. **Write down the bug + fix dispatch.** Every CRIT in this audit has a fix dispatch block. Continue.
4. **Track running line count.** B+C+D+E = 52,684 lines. Don't claim more.
5. **Honor the F#7 audit lesson.** Read full files where stakes warrant. CRIT-115 (onboarding theatre) was caught only by reading the catch block carefully.
6. **Spot-grep server side BEFORE writing a CRIT.** Several Phase E findings emerged when I cross-checked mobile URL against server route mount (CRIT-110/111/115/118). Don't take mobile code at face value.
7. **The "fake-wiring" pattern is now the dominant provider-side theme.** Phase 14 R5-complete remediation shipped: built components (EarningsChart, CommissionBreakdown, FilterModal), built service clients (provider-tools.service.ts), and rendered the components — but with fake data instead of real service calls. Phase F may show the same pattern on admin side.
8. **Bundle related CRITs into single dispatches in Phase I.** Examples:
   - URL alignment dispatch: CRIT-71/78/94/96/98/114 + CI guard.
   - Bug 1061 migration completion dispatch: CRIT-85/86/91/MED-251/257.
   - Settings/money drift dispatch: CRIT-13/42/75/81/83/90 + Zod-derived shared types.
   - Boracay launch dispatch: CRIT-92/93/111/116 + server-side region table.
   - Provider tier enum dispatch: CRIT-97 + MED-174/215/237.
   - **Onboarding theatre dispatch: CRIT-115/117 + delete identity-verification.tsx + wire real polling.**
   - **Fake earnings dispatch: CRIT-99/100/101/107/112/113 + wire provider-tools.service.ts.**
   - **Job completion dispatch: CRIT-102/103/104/105 — replace orphan complete.tsx with real flow.**
   - Portfolio + cert upload dispatch: CRIT-108/109 — wire ImagePicker.
   - Provider chat + GPS dispatch: CRIT-91/96/98 + MED-251.

---

## Estimated remaining audit budget

| Phase | Estimate (lines) | Estimated sessions |
|---|---:|---:|
| F — Admin web | 22,000 | 3 |
| G — Migrations + RLS (77 files) | 4,000 | 1 |
| H — Test quality audit | 20,000 | 2 |
| I — Master AI-coder instructions doc | n/a | 1 |
| **Total remaining** | **~46,000** | **~7 sessions** |

Already invested: 7 sessions = ~52,684 lines = ~42% of codebase.
Total program: ~14 sessions to 100% audit coverage.

---

## Quick reference — Phase E CRITs by file/area

| File / area | CRITs |
|---|---|
| (provider-tabs)/dashboard.tsx | CRIT-99, CRIT-100 |
| (provider-tabs)/earnings.tsx | CRIT-99, CRIT-100, CRIT-114 |
| provider/job/[id].tsx | CRIT-101 |
| provider/job/[id]/complete.tsx | CRIT-102, CRIT-103, CRIT-104, CRIT-107(→MED-228) |
| provider/job/[id]/checklist.tsx | CRIT-105 |
| provider/portfolio.tsx | CRIT-108 |
| provider/certifications.tsx | CRIT-109 |
| provider/skills.tsx | CRIT-110 |
| provider/service-area.tsx | CRIT-111 |
| provider/payouts.tsx | CRIT-112, CRIT-114 |
| provider/withdraw.tsx | CRIT-113, CRIT-114 |
| provider-onboarding/identity-verification.tsx | CRIT-115 |
| provider-onboarding/service-area.tsx | CRIT-116 |
| provider-onboarding/background-check-status.tsx | CRIT-117 |
| components/provider/NbiStatusBanner.tsx | CRIT-118 |
| services/device-fingerprint.service.ts | CRIT-119 |
| (re-confirmation) chat broken on provider | (CRIT-91/96 family — MED-251) |
| (re-confirmation) provider tier missing 'founding' | (CRIT-97 family — MED-215, MED-237) |

---

## The "F#5 R5-complete fake-wiring" pattern

A Phase 14 remediation dispatch (R5-complete) claimed to "wire all 11 D11/D12 components into 3+ screens each." Phase E found the wiring was largely cosmetic:

- **EarningsChart**: rendered on dashboard, payouts, withdraw, complete, customer/marketing. Real data NEVER passed. Always fake/inline arrays. (CRIT-99, CRIT-112, CRIT-113)
- **CommissionBreakdown**: rendered on dashboard, payouts, complete. Always fake math (12% fee, 1.44% "VAT"). Never real per-period breakdown. (CRIT-100, CRIT-107, CRIT-112)
- **FilterModal**: rendered on customer search and provider jobs. NO TRIGGER calls `setVisible(true)` in either. Modal can never open. (MED-181, MED-216)
- **OptimizedList**: silently overrides caller's ListFooterComponent (MED-202).
- **NbiStatusBanner**: rendered correctly but fetches non-existent endpoint. (CRIT-118)
- **PaginationLoader**: works correctly. ✓
- **ConfirmModal**: works correctly but underused (MED-219/242/249).
- **PulsingDot, StatusBadge, FilterChips, Avatar, ScrollToTop, Toast**: work correctly. ✓

**Net: 5 of 11 components have real-wiring failures (CRIT or MED level). The R5-complete remediation closeout claim that 11 of 11 were wired is technically true but materially false.**

Phase H (test quality audit) should look at the R5-complete tests specifically — they likely render the components but don't assert on the data shape, masking the fake wiring.

This is the F#7 audit smell, on production code, post-remediation. Surface to Ken in Phase I as the dominant cross-cutting pattern.
