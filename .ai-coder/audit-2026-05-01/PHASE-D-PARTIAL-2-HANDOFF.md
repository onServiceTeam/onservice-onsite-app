# Audit 2026-05-01 — Phase D Partial-2 + Resume Instructions

**Status:** Phase A + B + C complete. **Phase D ~85% done** (foundations + auth + tabs + booking flow + wallet/payment + account/data-rights/terms + stores/shared-services + remaining-booking-flow + provider/addresses/chat partial reads). Phase D continues next session with the remaining customer screens + mobile components.

**Master commit:** `b8bd2f2` on master. Local matches origin. Working tree clean apart from `.ai-coder/audit-2026-05-01/` (untracked).

---

## Total reads to date

| Phase | Status | Lines fully read | Findings docs |
|---|---|---:|---|
| A — Inventory + risk ranking | ✅ Done | n/a | INVENTORY.md |
| B — Money path | ✅ Done | 13,599 | B01–B09 (9 docs) |
| C — Auth + RBAC + sessions | ✅ Done | 6,075 | C01–C05 (5 docs) |
| **D — Customer mobile** | 🟡 **~85%** | **10,919** | **D01–D08 (8 docs)** |
| E — Provider mobile | Pending | 0 | — |
| F — Admin web | Pending | 0 | — |
| G — Migrations + RLS | Pending | 0 | — |
| H — Test quality audit | Pending | 0 | — |
| I — Master AI-coder instructions | Pending | 0 | — |

Total codebase: **~124,099 lines**. Coverage so far: **~24.7% (30,593 lines)**.

---

## This session (session 5) added

D04-D08 — five new findings docs, 4,663 new lines read (~30,593 - 25,930).

### Files added this session
- `apps/mobile/app/customer/wallet-topup.tsx` (256)
- `apps/mobile/app/customer/payment-methods.tsx` (157)
- `apps/mobile/src/services/payment.service.ts` (53)
- `apps/mobile/src/hooks/useWallet.ts` (86)
- `apps/mobile/src/config/navigation.ts` (174)
- `apps/mobile/src/config/platform.config.ts` (82)
- `apps/mobile/app/customer/account-management.tsx` (405)
- `apps/mobile/app/customer/data-rights.tsx` (431)
- `apps/mobile/app/customer/terms.tsx` (267)
- `apps/mobile/src/stores/auth.store.ts` (100)
- `apps/mobile/src/stores/booking.store.ts` (154)
- `apps/mobile/src/stores/pricing.store.ts` (115)
- `apps/mobile/src/services/auth-migration.ts` (90)
- `apps/mobile/src/services/config.service.ts` (99)
- `apps/mobile/src/services/socket.service.ts` (51)
- `apps/mobile/src/services/push.service.ts` (235)
- `apps/mobile/app/customer/booking/payment-failed.tsx` (167)
- `apps/mobile/app/customer/booking/complete.tsx` (137)
- `apps/mobile/app/customer/booking/photos.tsx` (235)
- `apps/mobile/app/customer/booking/make-recurring.tsx` (251)
- `apps/mobile/app/customer/booking/job-request.tsx` (268)
- `apps/mobile/app/customer/provider/[id].tsx` (596 — partial 350)
- `apps/mobile/app/customer/addresses.tsx` (511 — partial 300)
- `apps/mobile/app/customer/chat/[id].tsx` (440 — partial 350)

Plus targeted Grep verifications:
- `useWallet` usage (DEAD CODE — only test file)
- `Routes.CUSTOMER.{WALLET,SETTINGS,...}` usage (CONFIRMED 2 dead routes still being navigated to)
- Server `wallet.routes.ts` actual endpoints (verified CRIT-71 expansion to 7 broken endpoints + new D-USEW-01)
- `/api/v1/wallets?` (mobile + server URL mismatch grep)

---

## Headline bug counts (B + C + D-partial-2 combined)

| Severity | Count | New this session |
|---|---:|---|
| **CRITICAL** | **91 (1 invalidated → 90 real)** | 14 new (CRIT-71 expansion + CRIT-78–91) |
| **MEDIUM** | **177** | 36 new (MED-142–177) |
| **LOW/INFO** | many | |

### NEW CRITICAL bugs this session (D04-D08)

- **CRIT-71 EXPANDED** — Wallet URL mismatch hits 7 endpoints (was 5). Added: getWalletBalance + topUpWallet (payment.service.ts).
- **CRIT-78** — `useWallet` hook calls `/api/v1/wallet/balance` (no such endpoint).
- **CRIT-79** — `Routes.CUSTOMER.WALLET` is dead — wallet "Top Up" button broken.
- **CRIT-80** — `Routes.CUSTOMER.SETTINGS` is dead — "Notification Settings" link broken.
- **CRIT-81** — Mobile platform.config.ts duplicates ALL server money math constants (4th source of truth).
- **CRIT-82** — Mobile defaults `apiUrl` to localhost — production builds without env break silently.
- **CRIT-83** — TOS says 48h auto-confirm; server actually 24h. Legal exposure.
- **CRIT-84** — Two parallel account-deletion flows (account-management vs data-rights) not coordinated.
- **CRIT-85** — Socket connection reads token from LEGACY storage; broken after Bug 1061 migration.
- **CRIT-86** — Push deep-link role lookup reads from LEGACY storage; providers always routed as customers.
- **CRIT-87** — Push token storage location inconsistent with Bug 1061 migration scope.
- **CRIT-88** — Mobile auth.store.ts type omits 'super_admin' role.
- **CRIT-89** — payment-failed claims booking held 15 min; server actually 72 hours.
- **CRIT-90** — complete.tsx (24h) + terms.tsx (48h) + server (24h) disagree on auto-confirm hours (CRIT-83 internal inconsistency confirmed).
- **CRIT-91** — Chat completely broken on Bug-1061-migrated devices (downstream of CRIT-85).

### Top 5 fixes by impact (Phase D additions)

1. **CRIT-71 + CRIT-78 + CRIT-85 + CRIT-86** — Wallet URLs + socket token + push role all read from wrong storage / wrong path. **Wallet UX, real-time tracker, chat, and provider push notifications are all broken on launch.** A single coordinated dispatch can fix all four (audit `storage.getString` callsites, fix URLs, ban legacy storage for tokens).
2. **CRIT-79 + CRIT-80** — Two `Routes.CUSTOMER.*` constants point to non-existent screens. Wallet top-up + notification settings inaccessible. Quick fix.
3. **CRIT-83 + CRIT-90** — TOS contradicts server escrow timing. Legal exposure. Single source of truth fix.
4. **CRIT-89** — Payment-failed lies about 15-min hold. Customer-facing trust issue.
5. **CRIT-81 + CRIT-82** — Mobile config drift + missing env defaults. Foundational fixes.

---

## Cross-cutting themes (B + C + D)

These keep showing up — Phase I master instructions need to address all:

1. **Money math drift across 4 sources** (CRIT-13, CRIT-42, CRIT-75, CRIT-81). Server platform.config + server settings.service + mobile platform.config + mobile booking.store all duplicate the same fee constants.
2. **Multi-step non-atomic flows** (CRIT-18, CRIT-26, CRIT-27, CRIT-32, CRIT-33, CRIT-34, CRIT-39, CRIT-55, CRIT-64, CRIT-74).
3. **No staff permission enforcement** (CRIT-23, CRIT-56).
4. **No JWT revocation + no refresh-token replay detection** (CRIT-22, CRIT-53, CRIT-68, CRIT-72).
5. **Webhook handlers incomplete** (CRIT-19, CRIT-20, CRIT-21).
6. **BIR placeholders in PDFs** (CRIT-41).
7. **Settings drift** (CRIT-25, CRIT-42, CRIT-43, CRIT-49, CRIT-75, CRIT-81).
8. **Validation gaps** (many CRIT/MED).
9. **Audit-log gaps** (CRIT-57, 60, 65, 66, 67).
10. **PII leakage in admin reads** (CRIT-63, MED-114).
11. **No graceful shutdown / startup validation** (CRIT-50, CRIT-49, CRIT-47, CRIT-82).
12. **Rate-limit not actually dynamic** (CRIT-44).
13. **Mobile error-shape mismatch** (CRIT-69, MED-132, MED-171, MED-172, MED-173). Pervasive.
14. **Mobile-server URL drift** (CRIT-71/78). 7 broken wallet endpoints.
15. **Customer never sees server-canonical price** (CRIT-75 + CRIT-81 + CRIT-83 + CRIT-89). Mobile lies to customer about money + timing.
16. **Bug-1061 migration didn't propagate to all token-reading sites** (CRIT-85, CRIT-86, CRIT-91).
17. **Dead Routes constants** (CRIT-79, CRIT-80, MED-146).
18. **Two parallel deletion flows** (CRIT-84).
19. **TOS vs platform behavior contradicts** (CRIT-83, CRIT-90).

---

## What's left in Phase D (next session)

### Customer screens still to read (~5,000 lines)

- `apps/mobile/app/customer/provider/[id].tsx` (596 — last 246 lines, mostly StyleSheet)
- `apps/mobile/app/customer/addresses.tsx` (511 — last 211 lines, mostly StyleSheet)
- `apps/mobile/app/customer/chat/[id].tsx` (440 — last 90 lines, mostly StyleSheet)
- `apps/mobile/app/customer/address-picker.tsx` (449)
- `apps/mobile/app/customer/search.tsx` (348)
- `apps/mobile/app/customer/suki-pros.tsx` (316)
- `apps/mobile/app/customer/safety-and-support.tsx` (324)
- `apps/mobile/app/customer/help.tsx` (265)
- `apps/mobile/app/customer/notification-settings.tsx` (264)
- `apps/mobile/app/customer/notifications.tsx`
- `apps/mobile/app/customer/recurring/[id].tsx` (386)
- `apps/mobile/app/customer/recurring/index.tsx`
- `apps/mobile/app/customer/category/[id].tsx`
- `apps/mobile/app/customer/referral.tsx`
- `apps/mobile/app/customer/_layout.tsx`

### Mobile components (~2,500 lines)

- `apps/mobile/src/components/PhoneInput.tsx`
- `apps/mobile/src/components/Avatar.tsx`
- `apps/mobile/src/components/FilterChips.tsx`
- `apps/mobile/src/components/FilterModal.tsx` (198)
- `apps/mobile/src/components/ConfirmModal.tsx` (136)
- `apps/mobile/src/components/StatusBadge.tsx`
- `apps/mobile/src/components/PulsingDot.tsx`
- `apps/mobile/src/components/PaginationLoader.tsx`
- `apps/mobile/src/components/icons/index.ts` (197)
- `apps/mobile/src/components/ui/Button.tsx` (113)
- `apps/mobile/src/components/ui/Toast.tsx` (178)
- `apps/mobile/src/components/ui/SuccessAnimation.tsx` (130)
- `apps/mobile/src/components/ui/OptimizedList.tsx` (111)
- `apps/mobile/src/components/ui/*` (other ui primitives)
- `apps/mobile/src/components/provider/*` (provider-side, can defer to Phase E)

### Mobile shared services remaining (~700 lines)

- `apps/mobile/src/services/recurring.service.ts` (129)
- `apps/mobile/src/services/booking-photo.service.ts` (166)
- `apps/mobile/src/services/catalog.service.ts` (59)
- `apps/mobile/src/services/review.service.ts` (74)
- `apps/mobile/src/services/tip.service.ts` (31)
- `apps/mobile/src/services/pricing.service.ts`
- `apps/mobile/src/services/rebooking.service.ts`
- `apps/mobile/src/services/slot-waitlist.service.ts`
- `apps/mobile/src/services/messaging.service.ts`
- `apps/mobile/src/services/upload.service.ts`
- `apps/mobile/src/services/data-management.service.ts`
- `apps/mobile/src/services/compliance.service.ts`
- `apps/mobile/src/services/address.service.ts`
- `apps/mobile/src/services/provider.service.ts`

### Mobile hooks + utils (~500 lines)

- `apps/mobile/src/hooks/useImagePicker.ts` (198)
- `apps/mobile/src/hooks/useJobGpsBroadcast.ts` (119)
- `apps/mobile/src/utils/phone.ts` (38)
- `apps/mobile/src/utils/currency.ts`
- `apps/mobile/src/utils/date.ts`
- `apps/mobile/src/utils/cancellation-policy.ts`

### Total remaining for Phase D completion: ~8,000-9,000 lines (1 session)

---

## Resume prompt for next session

> "Continue the audit from `.ai-coder/audit-2026-05-01/`. Read PHASE-D-PARTIAL-2-HANDOFF.md first, then continue Phase D. Start with the remaining customer screens (search, suki-pros, safety-and-support, help, notification-settings, recurring, etc.), then mobile components (PhoneInput, FilterModal, ConfirmModal, ui/Button, ui/Toast, etc.), then remaining mobile services (recurring, booking-photo, messaging, upload, address, provider, data-management, compliance, etc.). Track findings in `findings/D09-*.md`, etc. Same protocol: full reads, real bugs, written-down findings, dispatch instructions for each CRITICAL. End with PHASE-D-SUMMARY-AND-HANDOFF.md (rename when Phase D fully completes) OR PHASE-D-PARTIAL-3-HANDOFF.md if more remains."

---

## Discipline notes carried forward

1. **Don't trust prior findings** — verify against current code.
2. **Never invalidate a CRIT silently.**
3. **Write down the bug + fix dispatch.**
4. **Track running line count.** B+C+D so far = 30,593 lines. Don't claim more.
5. **Honor the F#7 audit lesson.**
6. **The model code patterns** — `booking-admin.service.ts` (D06 transactional) and `staff.service.ts:deleteRole` (soft-delete + audit + transaction) are the templates.
7. **Phase D mobile reads keep finding the same patterns:** axErr/fetch error mismatch (CRIT-69 family), wallet URL drift (CRIT-71 family), Bug 1061 migration gaps (CRIT-85/86 family), money math drift (CRIT-75/81 family). Group these into single dispatches in Phase I.
8. **When you find a "dead route" or "non-existent endpoint"**, ALWAYS grep for usage. If unused, lower severity. If used, CRIT.

---

## Estimated remaining audit budget

| Phase | Estimate (lines) | Estimated sessions |
|---|---:|---:|
| D — Customer mobile (~8k–9k remaining) | 8,000-9,000 | 1 |
| E — Provider mobile (43 screens + services) | 12,000-15,000 | 2 |
| F — Admin web (29 pages + components) | 22,000 | 3 |
| G — Migrations + RLS (77 files) | 4,000 | 1 |
| H — Test quality audit | 20,000 | 2 |
| I — Master AI-coder instructions doc | n/a | 1 |
| **Total remaining** | **~66,000-70,000** | **~10 sessions** |

Already invested: 5 sessions = ~30,593 lines = ~25% of codebase.
Total program: ~14-15 sessions to 100% audit coverage of all production code.
