# Audit 2026-05-01 — Phase D COMPLETE — Customer mobile fully audited

**Status:** Phase A + B + C + D complete. Phase E (provider mobile) is the next major chunk.

**Master commit at start of session:** `b8bd2f2`. Working tree clean apart from `.ai-coder/audit-2026-05-01/` (untracked).

---

## Phase reads to date

| Phase | Status | Lines fully read | Findings docs |
|---|---|---:|---|
| A — Inventory + risk ranking | ✅ Done | n/a | INVENTORY.md |
| B — Money path | ✅ Done | 13,599 | B01–B09 (9 docs) |
| C — Auth + RBAC + sessions | ✅ Done | 6,075 | C01–C05 (5 docs) |
| **D — Customer mobile** | ✅ **DONE** | **18,979** | **D01–D12 (12 docs)** |
| E — Provider mobile | Pending | 0 | — |
| F — Admin web | Pending | 0 | — |
| G — Migrations + RLS | Pending | 0 | — |
| H — Test quality audit | Pending | 0 | — |
| I — Master AI-coder instructions | Pending | 0 | — |

Total codebase: **~124,099 lines**. Coverage so far: **~31.1% (38,653 lines)**.

---

## This session (session 6) added

D09–D12 — four new findings docs, ~8,060 new lines fully read.

### Files added this session (54 files)

**Customer screens (12):**
- address-picker.tsx (449), search.tsx (348), suki-pros.tsx (316), safety-and-support.tsx (324), help.tsx (265), notification-settings.tsx (264), notifications.tsx (200), recurring/index.tsx (212), recurring/[id].tsx (386), category/[id].tsx (156), referral.tsx (247), _layout.tsx (38)

**Mobile services (14):**
- recurring.service.ts (129), booking-photo.service.ts (166), catalog.service.ts (59), review.service.ts (74), tip.service.ts (31), pricing.service.ts (59), rebooking.service.ts (55), slot-waitlist.service.ts (45), messaging.service.ts (70), upload.service.ts (64), data-management.service.ts (51), compliance.service.ts (44), address.service.ts (63), provider.service.ts (76)

**Mobile components (24 files):**
- PhoneInput, Avatar, FilterChips, FilterModal, ConfirmModal, StatusBadge, PulsingDot, PaginationLoader (8)
- ui/: Badge, Button, EmptyState, EndOfList, ErrorState, Input, LazyImage, OTPInput, OfflineBanner, OptimizedList, PullToRefresh, ScreenContainer, ScrollToTop, Skeleton, SuccessAnimation, Toast (16)
- icons/index.ts + lib/toast.ts

**Hooks (14):**
- useImagePicker, useJobGpsBroadcast, useSocket, useSocketRoom, useStatusMutation, useAccessibility, useAppState, useAuth, useBooking, useDebouncedValue, useFeatureFlags, useLocation, useOffline, useWallet

**Utils + lib (10):**
- address, cancellation-policy, currency, date, distance, haptics, phone, validation, i18n, logger

Plus targeted Grep verifications:
- Server messaging mount path (`/api/v1/messaging`) vs mobile calls (`/api/v1/conversations`) — MISMATCH (CRIT-96)
- Server provider GPS handler — DOES NOT EXIST (CRIT-98)
- Server `room:join` socket handler — DOES NOT EXIST; useSocketRoom is dead code (MED-210)
- /api/v1/config response shape vs useFeatureFlags reader shape — MISMATCH (MED-209)
- Provider tier enum (server: founding/new/verified/pro/elite) vs mobile (new/verified/pro/elite) — MISMATCH (CRIT-97)

---

## Headline bug counts (B + C + D combined)

| Severity | Count | New this session |
|---|---:|---:|
| **CRITICAL** | **98 (1 invalidated → 97 real)** | **+7 (CRIT-92, 93, 94, 95, 96, 97, 98)** |
| **MEDIUM** | **213** | **+36 (MED-178–213)** |
| LOW/INFO | many | |

### NEW CRITICAL bugs this session (D09-D12)

- **CRIT-92** — address-picker map `initialRegion=MANILA_REGION` — Boracay launch shows wrong city.
- **CRIT-93** — `PH_REGIONS` hardcoded list does NOT include Boracay; saving a Boracay pin is BLOCKED. **Customer in Boracay cannot create an address.** Launch-blocking.
- **CRIT-94** — search.tsx routes `/customer/provider/${provider.userId}` but server `/api/v1/providers/:id` expects `provider.id`. Every search result tap → 404.
- **CRIT-95** — Hardcoded placeholder support hotline `+63281234567` on safety-and-support AND help screens. Customer in distress calls a wrong number.
- **CRIT-96** — Mobile messaging hits `/api/v1/conversations/*`; server mounts at `/api/v1/messaging`. Entire chat REST surface 404s. (Compounds CRIT-91: chat is fully broken via both socket and REST.)
- **CRIT-97** — Mobile Provider type missing `'founding'` tier. Founding-tier providers (the launch cohort!) display incorrectly to every customer.
- **CRIT-98** — Provider GPS broadcast POSTs to `/api/v1/provider/jobs/{id}/gps-update` — endpoint DOES NOT EXIST. Customer's tracker map never shows the provider moving. Launch-blocking.

### Top 5 fixes by impact (Phase D additions)

1. **CRIT-93** — Boracay missing from PH_REGIONS. Customer in launch market cannot save an address. Single-row data fix + remove hardcoded Manila fallback.
2. **CRIT-98 + CRIT-91 + CRIT-96** — provider GPS, customer chat socket, customer chat REST all broken. Single coordinated dispatch can fix all three (server adds provider:gps_update socket handler; mobile aligns messaging URL; socket auth reads from encrypted MMKV per Bug 1061). **The launch's three biggest customer-facing surfaces — tracker, chat, push — all silently broken on launch day.**
3. **CRIT-95** — hardcoded placeholder support hotline. Replace with `platformConfig.supportHotline`, add CI guard. Trivial code change but launch-blocking.
4. **CRIT-94** — search → provider profile uses wrong field. One-line fix in search.tsx + a real test.
5. **CRIT-97** — provider tier enum mismatch. One-line type fix + add 'founding' to TIER_COLORS/TIER_LABELS maps. Affects every founding-tier provider display.

---

## Cross-cutting themes (B + C + D — Phase I material)

These appear throughout the audit. Phase I master instructions need to address them all:

1. **Money math drift across 4+ sources** (CRIT-13, CRIT-42, CRIT-75, CRIT-81, CRIT-83, MED-182).
2. **Multi-step non-atomic flows** (CRIT-18, CRIT-26, CRIT-27, CRIT-32, CRIT-33, CRIT-34, CRIT-39, CRIT-55, CRIT-64, CRIT-74).
3. **No staff permission enforcement** (CRIT-23, CRIT-56).
4. **No JWT revocation + no refresh-token replay detection** (CRIT-22, CRIT-53, CRIT-68, CRIT-72).
5. **Webhook handlers incomplete** (CRIT-19, CRIT-20, CRIT-21).
6. **BIR placeholders in PDFs** (CRIT-41).
7. **Settings drift between server + mobile + admin** (CRIT-25, CRIT-42, CRIT-43, CRIT-49, CRIT-75, CRIT-81, MED-182).
8. **Validation gaps** (many CRIT/MED).
9. **Audit-log gaps** (CRIT-57, 60, 65, 66, 67).
10. **PII leakage in admin reads** (CRIT-63, MED-114).
11. **No graceful shutdown / startup validation** (CRIT-50, CRIT-49, CRIT-47, CRIT-82).
12. **Rate-limit not actually dynamic** (CRIT-44).
13. **Mobile error-shape mismatch (axErr cast vs fetch normalization)** (CRIT-69, MED-132, MED-171, MED-172, MED-173, MED-190).
14. **Mobile-server URL drift** (CRIT-71, CRIT-78, CRIT-94, CRIT-96, CRIT-98). 4 broken URL families now confirmed: wallet (singular vs plural), messaging (conversations vs messaging), provider (userId vs id), gps (no endpoint exists).
15. **Customer never sees server-canonical price** (CRIT-75 + CRIT-81 + CRIT-83 + CRIT-89 + CRIT-90). Mobile lies to customer about money + timing.
16. **Bug-1061 migration didn't propagate to all token-reading sites** (CRIT-85, CRIT-86, CRIT-91).
17. **Dead Routes constants + dead UI affordances** (CRIT-79, CRIT-80, MED-146, MED-181, MED-210).
18. **Two parallel deletion flows** (CRIT-84).
19. **TOS vs platform behavior contradicts** (CRIT-83, CRIT-90).
20. **Hardcoded placeholders/strings shipped to production** (CRIT-95, MED-148).
21. **Boracay launch market unsupported by hardcoded geo data** (CRIT-92, CRIT-93). The platform ships data for Manila but launches in Boracay.
22. **Provider tier enum drift** (CRIT-97, MED-174).
23. **Server endpoints missing for documented features** (CRIT-98 GPS ingest, MED-198 DSR list).
24. **Type duplication mobile↔server creates enum drift** (CRIT-97 fix recommends Zod-derived shared types).
25. **NPC RA 10173 §28 marketing-consent text missing** (MED-186).
26. **Component-prop ordering bugs (caller silently overrides wrapper props)** (MED-202, MED-203).

---

## What's left (Phase E + F + G + H + I)

### Phase E — Provider mobile (~12,000-15,000 lines, ~2-3 sessions)

The other half of `apps/mobile/`. 41 provider screens + provider-specific services + provider-specific components. Touchpoints worth extra care:
- Provider job execution flow (start travel → arrived → start job → complete) — uses `useStatusMutation` + `useJobGpsBroadcast` (both audited, **CRIT-98 says GPS goes nowhere**).
- Provider onboarding (NBI, certifications, ID verification) — high PII surface, BIR registration required.
- Provider payouts UI — touches the money path.
- Provider chat side (mirror of customer chat — same CRIT-91/96 story).
- Provider availability/online status (Bug 1203 auto-off chain).
- Provider service editor (bounds-validated per /catalog/subcategories/:id/bounds — verified D10).
- `apps/mobile/src/services/provider-api.ts` (350 lines) and `provider-tools.ts` (181 lines) — large, suspicious size.
- `business.ts` util (232 lines) — likely contains BIR/business config — money-adjacent.

### Phase F — Admin web (~22,000 lines, ~3 sessions)

29 React 19 admin pages + components. 9 admin services already touched in B09. Remaining:
- Admin booking management (suspend, refund, override pricing) — money path.
- Admin user/staff management (RBAC, audit trail) — auth + compliance.
- Admin promotions, suki tier configuration (settings drift candidates).
- Admin DPO console (where DSRs land — needs to actually work).
- Admin analytics + reports (SQL injection vectors, audit-log writes).
- Admin marketing console.

### Phase G — Migrations + RLS (~4,000 lines, 1 session)

77 migration files. Plus the public schema in `packages/api/src/db/schema.sql` if applicable. Look for:
- Money columns stored as NUMERIC vs INTEGER (currency-as-decimal precision bugs).
- RLS policies (or lack thereof — some tables may have no policy at all).
- NOT NULL gaps (server code assumes NOT NULL; migration didn't enforce).
- Index drift (server queries vs index coverage).
- FK gaps (orphaned rows possible).

### Phase H — Test quality audit (~20,000 lines, ~2 sessions)

The Phase 14 audit + remediation work the user describes in CLAUDE.md is THIS phase, performed at the test level. We need to verify the remediation actually held. Pattern to look for:
- `expect(existsSync(...)).toBe(true)` — file-existence-as-test (the F#7 audit smell).
- Closeout comma-listed multi-bug test names (forbidden per CLAUDE.md).
- `// TODO: real test` skipped without `it.todo`.
- Assertions on source-content regex (forbidden).

### Phase I — Master AI-coder instructions (1 session)

Synthesizes all CRITs + cross-cutting themes into a single document Ken can hand to an AI coder. Per the user's original brief: "I need it 100%. Nothing skipped here." Phase I is the deliverable.

---

## Resume prompt for next session

> "Continue the audit from `.ai-coder/audit-2026-05-01/`. Read PHASE-D-SUMMARY-AND-HANDOFF.md first, then start Phase E (provider mobile). Begin with the provider tabs/dashboard, then provider job execution flow (start travel → arrived → start job → mark complete), then onboarding (NBI, certifications), then payouts, then provider components/services/hooks. Track findings in `findings/E01-provider-foundations.md`, etc. Same protocol: full reads, real bugs, written-down findings, dispatch instructions for each CRITICAL. End with PHASE-E-SUMMARY-AND-HANDOFF.md when Phase E completes."

---

## Discipline notes carried forward

1. **Don't trust prior findings — verify against current code.** D11 reads of components occasionally found that earlier MEDs in D02-D08 (e.g., MED-174 'founding' tier) were a wider pattern than first reported. Verify and expand.
2. **Never invalidate a CRIT silently.** D10 confirmed CRIT-78 (useWallet URL drift) is still real — re-flagged.
3. **Write down the bug + fix dispatch.** Every CRIT in this audit has a fix dispatch block. Continue.
4. **Track running line count.** B+C+D = 38,653 lines. Don't claim more.
5. **Honor the F#7 audit lesson.** Read full files where stakes warrant. Components in D11 were small enough to read in full quickly; that's how MED-202 (OptimizedList footer override) was caught.
6. **Spot-grep server side BEFORE writing a CRIT.** Several Phase D findings only emerged when I cross-checked mobile URL against server route mount (CRIT-94, CRIT-96, CRIT-98, MED-209, MED-210). Don't take mobile code at face value.
7. **Bundle related CRITs into single dispatches in Phase I.** Examples:
   - URL alignment dispatch: CRIT-71, CRIT-78, CRIT-94, CRIT-96, CRIT-98 + CI guard.
   - Bug 1061 migration completion dispatch: CRIT-85, CRIT-86, CRIT-91 + audit storage callsites.
   - Settings/money drift dispatch: CRIT-13, CRIT-42, CRIT-75, CRIT-81, CRIT-83, CRIT-90, MED-182 + Zod-derived shared types.
   - Boracay launch dispatch: CRIT-92, CRIT-93 + server-side region table.
   - Provider tier enum dispatch: CRIT-97 + MED-174.
8. **Provider mobile (Phase E) will overlap heavily** with the customer-side findings — same socket service, same auth store, same money config. Many CRITs already covered apply both ways. Mark those as "applies to both" rather than duplicating.

---

## Estimated remaining audit budget

| Phase | Estimate (lines) | Estimated sessions |
|---|---:|---:|
| E — Provider mobile | 12,000-15,000 | 2-3 |
| F — Admin web | 22,000 | 3 |
| G — Migrations + RLS (77 files) | 4,000 | 1 |
| H — Test quality audit | 20,000 | 2 |
| I — Master AI-coder instructions doc | n/a | 1 |
| **Total remaining** | **~58,000-62,000** | **~9 sessions** |

Already invested: 6 sessions = ~38,653 lines = ~31% of codebase.
Total program: ~14-15 sessions to 100% audit coverage of all production code.

---

## Quick reference — Phase D CRITs by screen/file

| File / area | CRITs |
|---|---|
| address-picker.tsx | CRIT-92, CRIT-93 |
| search.tsx | CRIT-94 |
| safety-and-support.tsx, help.tsx | CRIT-95 |
| messaging.service.ts | CRIT-96 |
| provider.service.ts (Provider type) | CRIT-97 |
| useJobGpsBroadcast.ts | CRIT-98 |
| auth-migration / socket / push (D06) | CRIT-85, CRIT-86, CRIT-87 |
| chat/[id].tsx (D08) | CRIT-91 (downstream of CRIT-85 + CRIT-96) |
| account-management + data-rights (D05) | CRIT-83, CRIT-84 |
| terms.tsx + complete.tsx (D05/D07) | CRIT-83, CRIT-90 |
| payment-failed.tsx (D07) | CRIT-89 |
| Wallet topup + payment-methods (D04) | CRIT-78, CRIT-79, CRIT-80 |
| Mobile platform.config + apiUrl (D04) | CRIT-81, CRIT-82 |
| Mobile auth.store role enum (D06) | CRIT-88 |
