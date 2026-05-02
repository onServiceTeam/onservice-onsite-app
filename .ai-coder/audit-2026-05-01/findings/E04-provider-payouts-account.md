# Phase E Findings Part 4 — Provider payouts, withdraw, account, settings, help, chat, notifications

Files added in this batch:
- `apps/mobile/app/provider/payouts.tsx` (249) — full
- `apps/mobile/app/provider/withdraw.tsx` (266) — full
- `apps/mobile/app/provider/payout-settings.tsx` (307) — full
- `apps/mobile/app/provider/account-management.tsx` (398 — read top 150; bottom 248 is more flow + StyleSheet)
- `apps/mobile/app/provider/settings.tsx` (292) — full
- `apps/mobile/app/provider/help.tsx` (250) — full
- `apps/mobile/app/provider/notifications.tsx` (195 — read top 100; bottom 95 is StyleSheet)
- `apps/mobile/app/provider/chat/[id].tsx` (440 — read top 160; bottom 280 is render + StyleSheet)
- `apps/mobile/app/provider/_layout.tsx` (25) — full

Plus targeted Grep verifications:
- Server `wallet.routes.ts` mounted at `/api/v1/wallet` (singular) — verified server.ts:173
- Server wallet routes: `/`, `/transactions`, `/top-up`, `/withdraw`, `/payouts`, `/payout-preferences`
- Mobile providers use `/api/v1/wallets/transactions`, `/api/v1/wallets/withdraw`, `/api/v1/wallets/payouts` (PLURAL — broken)
- Mobile uses `/api/v1/wallet/payout-preferences` (singular — works)
- Mobile getWalletBalance uses `/api/v1/wallet/balance` — server has GET `/` not `/balance` (broken)

**Phase E running total: ~10,221 lines fully read.**
**Audit grand total: ~48,874 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-111)

### CRIT-112 — `payouts.tsx` ships HARDCODED fake earnings (50000/75000/25000/...) AND fake commission breakdown (gross 440000, fee 52800, VAT 6336, net 380864)
**File:** [apps/mobile/app/provider/payouts.tsx:132-154](apps/mobile/app/provider/payouts.tsx#L132)
```tsx
<EarningsChart
  data={[
    { date: '2026-04-25', amount: 50000 },
    { date: '2026-04-26', amount: 75000 },
    { date: '2026-04-27', amount: 25000 },
    { date: '2026-04-28', amount: 100000 },
    // ... 7 hardcoded entries
  ]}
/>
<CommissionBreakdown
  gross={440000}                                      // ← made up
  lines={[
    { label: 'Platform fee', amount: 52800, pct: 12 },
    { label: 'VAT', amount: 6336 },
  ]}
  net={380864}
/>
```

A provider opens Payout History → sees a chart claiming they earned ₱500/day–₱1,000/day for the past week + a breakdown saying gross was ₱4,400 with ₱528 platform fee. None of this reflects their actual earnings. **Same family as CRIT-99/100/107.**

The fake data is even worse here than on the dashboard — it's *static* (doesn't even fake-react to balance changes), so every provider sees the SAME numbers. A new provider with zero earnings sees ₱500/day. An elite provider with ₱500K/month sees ₱500/day. Comically wrong.

**Fix dispatch:** same as CRIT-99 — wire the EarningsChart to a real `/providers/me/earnings/daily` endpoint, wire CommissionBreakdown to real per-period aggregates. Add to CRIT-99 dispatch.

### CRIT-113 — `withdraw.tsx` shows fake EarningsChart AND uses broken `getWalletBalance` so the available-balance display is always ₱0 → withdraw is permanently blocked
**Files:**
- [apps/mobile/app/provider/withdraw.tsx:132-146](apps/mobile/app/provider/withdraw.tsx#L132) — `availableBalance / 7` flat-line fake (CRIT-99 family)
- [apps/mobile/app/provider/withdraw.tsx:42-46, 71](apps/mobile/app/provider/withdraw.tsx#L42) — `getWalletBalance` from payment.service.ts hits `/api/v1/wallet/balance` (CRIT-78). Server has GET `/api/v1/wallet/` (root), no `/balance` subpath.
- [apps/mobile/app/provider/withdraw.tsx:88-91](apps/mobile/app/provider/withdraw.tsx#L88) — `if (amountCentavos > availableBalance) → Alert "Insufficient Balance"`. Since balance is always 0 (fetch 404s), every withdraw attempt fails this guard.

**Provider experience:**
1. Provider opens Earnings → Withdraw.
2. Top of screen: ₱0.00 "Available Balance" (because the fetch 404s and falls back to 0).
3. Provider knows they have ₱5,000 in escrow released, but mobile says ₱0.
4. Provider enters ₱5,000 → "Insufficient Balance".
5. Provider tries ₱100 → "Insufficient Balance".
6. **Provider cannot withdraw any money. Ever.**

This is launch-blocking for the provider trust narrative. Couple it with CRIT-114 (the wallet URL family) and the entire money-in-the-provider's-hand flow is broken.

**Fix dispatch:** combine with CRIT-78 + CRIT-114 + CRIT-99. Single PR aligns mobile→server URLs, fixes `getWalletBalance` path, and adds real earnings data.

### CRIT-114 — Wallet URL drift EXPANDED: provider screens hit `/api/v1/wallets/...` (plural); server mounts `/api/v1/wallet/...` (singular). 3 more broken endpoints in CRIT-71 family.
**Files:**
- [apps/mobile/app/(provider-tabs)/earnings.tsx:89](apps/mobile/app/(provider-tabs)/earnings.tsx#L89) — `api.get('/api/v1/wallets/transactions', ...)`
- [apps/mobile/app/provider/withdraw.tsx:51](apps/mobile/app/provider/withdraw.tsx#L51) — `api.post('/api/v1/wallets/withdraw', ...)`
- [apps/mobile/app/provider/payouts.tsx:63](apps/mobile/app/provider/payouts.tsx#L63) — `api.get('/api/v1/wallets/payouts', ...)`
- Server: `app.use('/api/v1/wallet', walletRoutes)` (server.ts:173) — singular

**Provider impact:**
- **Earnings tab** — Transaction history list always empty (fetch 404s, falls through to ListEmptyComponent showing "No transactions yet").
- **Withdraw button** — `/wallets/withdraw` 404s; combined with CRIT-113 the screen errors on every attempt.
- **Payout History** — Always shows "No payouts yet" empty state because the list fetch 404s.

The earlier CRIT-71 (B07) listed 5 wallet endpoints. With `getWalletBalance` (CRIT-78), `useWallet` hook (CRIT-78), and these 3 new ones, the running total of broken wallet endpoints is **8**. Provider's entire money-side experience is silently degraded.

**Fix dispatch:**
```
1. Bulk find/replace mobile sites:
       /api/v1/wallets/transactions  → /api/v1/wallet/transactions
       /api/v1/wallets/withdraw      → /api/v1/wallet/withdraw
       /api/v1/wallets/payouts       → /api/v1/wallet/payouts
2. Fix getWalletBalance (payment.service.ts) — change '/wallet/balance'
   to '/wallet/' or '/wallet/me' (whichever the server's GET / handler
   returns). Also fix useWallet hook (CRIT-78).
3. Add the URL-alignment CI guard recommended in CRIT-96 fix — diff
   set of api.get/post/etc URLs in mobile services against set of
   mounts in server.ts. Mismatches fail the build.
4. Real test: spin up an MSW handler matching the SERVER's URL pattern;
   call each wallet service function; assert no 404. (Today, all 8
   service functions silently 404 against MSW with the right pattern.)
5. Pair with CRIT-71 + CRIT-78 + CRIT-96 + CRIT-98 in a single
   "URL alignment + CI guard" PR per Phase D handoff recommendation.
```

---

## MEDIUM bugs

### MED-244 — provider `help.tsx` hardcoded commission ranges (8-15%) don't match server's tier rates AND don't include 'founding' tier
**File:** [apps/mobile/app/provider/help.tsx:44-46](apps/mobile/app/provider/help.tsx#L44)
> "Commission ranges from 8-15% depending on your tier. New providers start at 12-15%. Pro tier (25+ jobs, 4.5+ rating) pays 10-12%, and Elite tier (100+ jobs, 4.7+ rating) pays 8-10%."

Hardcoded text. If admin changes commission rates via the admin UI (per Phase 14 standing instruction), the FAQ keeps lying. Also: no mention of 'founding' tier (which is the launch cohort with the lowest commission).

**Fix:** generate FAQ commission text from `getTierProgression().allTiers` data at render time. Single source of truth.

### MED-245 — provider `help.tsx` FAQ "reviews cannot be responded to publicly" CONTRADICTS the working provider-response flow
**File:** [apps/mobile/app/provider/help.tsx:65-67](apps/mobile/app/provider/help.tsx#L65)
> "Currently, reviews cannot be responded to publicly. If you believe a review is unfair or fraudulent, contact support with your evidence and we will investigate."

But [reviews.tsx](apps/mobile/app/provider/reviews.tsx) implements a working `submitResponse()` mutation against `/api/v1/reviews/:id/response`. Provider can publicly respond to any review.

**Fix:** delete the FAQ entry OR reword to reflect the actual behavior ("You can submit one public response per review from the My Reviews screen.").

### MED-246 — provider `help.tsx` placeholder support hotline `+63 2 8123 4567` (CRIT-95 family expansion)
**File:** [apps/mobile/app/provider/help.tsx:167](apps/mobile/app/provider/help.tsx#L167)
Same Manila landline placeholder used on customer-side `safety-and-support.tsx` and `help.tsx`. Bundle into the CRIT-95 fix dispatch.

Also: `providers@onservice.ph` email at [help.tsx:156](apps/mobile/app/provider/help.tsx#L156) — needs to be real, monitored, documented in launch runbook (D14 ops). Same posture issue as MED-152.

### MED-247 — provider `settings.tsx` push toggle "off" only sets local state — doesn't unregister the push token from server
**File:** [apps/mobile/app/provider/settings.tsx:34-51](apps/mobile/app/provider/settings.tsx#L34)
```ts
} else {
  setPushEnabled(false);   // ← local only; server still has the push token
}
```

Provider toggles push OFF → mobile UI shows OFF. Server still has the push token registered → server keeps sending pushes → device receives them. Provider sees notifications they thought they disabled. Worse, `usePushNotifications` may auto-re-enable on next mount.

**Fix:** call a new `unregisterPushToken()` against `/api/v1/push/unregister` (or POST `/push/register` with `enabled: false`) when toggling off. Verify the un-toggle persists across app restarts.

### MED-248 — provider `notifications.tsx` deep-link only handles `bookingId` (cross-cutting MED-188)
**File:** [apps/mobile/app/provider/notifications.tsx:73-76](apps/mobile/app/provider/notifications.tsx#L73)
```ts
if (notifData?.bookingId) router.push(`/provider/job/${notifData.bookingId}`);
```
Notifications for `payout_completed`, `tip_received`, `review_received`, `dispute_opened` carry their own data shapes (payoutId, tipId, reviewId, disputeId). None routed. Provider taps notification → marks read → no navigation. Same as customer-side MED-188.

### MED-249 — provider `payouts.tsx`, `withdraw.tsx`, `payout-settings.tsx`, `account-management.tsx`, `settings.tsx` all use native `Alert.alert` for confirmations (cross-cutting MED-219 family)
ConfirmModal exists, shipped, documented. All five money-path / account-path screens use raw `Alert`. Inconsistent destructive-action UX. Bundle into the ConfirmModal-rollout dispatch.

### MED-250 — provider `payout-settings.tsx` `destinationAccount` accepts any string (no E.164 / bank-account format check)
**File:** [apps/mobile/app/provider/payout-settings.tsx:166-172, 87-92](apps/mobile/app/provider/payout-settings.tsx#L166)
TextInput placeholder differs by method (`"09XX XXX XXXX"` for GCash/Maya, `"Account number"` for bank), but no actual validation. Provider can save `"abc"` as their GCash number → first auto-payout fails after they've earned a chunk. Should validate against PH_MOBILE_REGEX for GCash/Maya, against length for bank accounts. Server should also validate.

### MED-251 — provider chat `/provider/chat/[id].tsx` is broken on Bug-1061-migrated devices (CRIT-91 + CRIT-96 family)
**File:** [apps/mobile/app/provider/chat/[id].tsx:97](apps/mobile/app/provider/chat/[id].tsx#L97)
- Imports messaging.service which uses `/api/v1/conversations/*` (CRIT-96 — server is at `/api/v1/messaging`).
- `connectSocket()` (line 97) reads token from legacy storage (CRIT-85).
- Send/receive messages, typing indicators, read receipts all silently broken.

Provider sees customer's messages disappear into the void. Same dispatch as CRIT-91/96 fixes. Adds the provider-side mirror.

### MED-252 — provider `account-management.tsx` is functionally identical to customer's account-management.tsx (CRIT-84 family — two parallel deletion flows still split)
**File:** [apps/mobile/app/provider/account-management.tsx](apps/mobile/app/provider/account-management.tsx)
Same screen, same flow as customer side — but no link to `/provider/data-rights` (which doesn't exist on provider side at all). NPC RA 10173 §16 erasure right only routed via the cooling-off path. The DSR formal request path is missing entirely on the provider side. Add a Data Rights screen (mirroring customer's data-rights.tsx) AND link both flows together (per CRIT-84 fix).

### MED-253 — `payout-settings.tsx` refers to `platformConfig.minimumPayoutThreshold` — drift risk
**File:** [apps/mobile/app/provider/payout-settings.tsx:79](apps/mobile/app/provider/payout-settings.tsx#L79)
Mobile platformConfig used for the threshold validation. Server should be canonical; mobile should fetch from settings endpoint. CRIT-81 family.

---

## LOW / INFO

- **`settings.tsx` is the most polished settings menu in the codebase.** Clean section grouping, push toggle with permission flow, links to all profile screens. Deep-links into ACCOUNT_MANAGEMENT (line 68) — partially resolves MED-218 (provider had no entry point to NPC erasure).
- **`payouts.tsx` PaginationLoader + onEndReached + useInfiniteQuery** — proper pagination implementation (compare with the broken pagination from MED-202 OptimizedList override).
- **`payout-settings.tsx` reads existing prefs and pre-fills the form.** Clean.
- **`account-management.tsx` cooling-off pattern** matches the customer-side flow exactly. Same NPC RA 10173 disclosure (line 138). Same precondition: must have no active bookings + zero balance.
- **`chat/[id].tsx` socket lifecycle** (mount → connect → join conversation → bind handlers → unmount unbinds) is the canonical pattern. Crippled only by CRIT-91/96 token + URL bugs.
- **`_layout.tsx` is a thin Stack** (25 lines) — defines screen names for all 28 provider screens. Compare with customer `_layout.tsx` MED-189 (`safety` mismatch) — provider _layout doesn't have any visible mismatches but I haven't compared every screen file name to the layout entry. Spot-check during E05/E06.
- **Notification icon mapping (notifications.tsx:32-41)** uses real Lucide icons, distinct per notification type. Good consistency with the icon-only rule.
- **Provider help screen contact card** uses real Mail + Phone Lucide icons (line 158-169) instead of emoji. Better than several other screens.

---

## Updated headline counts after E04

| Severity | Total | New in E04 |
|---|---:|---:|
| **CRITICAL** | **112 (1 invalidated → 111 real)** | **+3 (CRIT-112–114)** |
| **MEDIUM** | **253** | **+10 (MED-244–253)** |

Continuing into E05 (provider onboarding — 10 files, ~3,564 lines).
