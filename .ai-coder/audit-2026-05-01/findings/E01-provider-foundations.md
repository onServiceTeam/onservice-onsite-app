# Phase E Findings Part 1 — Provider tab foundations + provider-api service

Files added in this batch (full reads):
- `apps/mobile/app/(provider-tabs)/_layout.tsx` (76)
- `apps/mobile/app/(provider-tabs)/dashboard.tsx` (409)
- `apps/mobile/app/(provider-tabs)/jobs.tsx` (265)
- `apps/mobile/app/(provider-tabs)/earnings.tsx` (312)
- `apps/mobile/app/(provider-tabs)/provider-profile.tsx` (415)
- `apps/mobile/src/services/provider-api.service.ts` (350)

Plus targeted Grep verifications:
- `Routes.PROVIDER.*` declared vs files on disk → ~10 dead constants identified.
- Real callsites of suspect dead routes → none in app code (config bloat only).

**Phase E running total: ~1,827 lines fully read.**
**Audit grand total: ~40,480 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-98)

### CRIT-99 — EarningsChart on the provider dashboard renders FABRICATED data, not real earnings history
**File:** [apps/mobile/app/(provider-tabs)/earnings.tsx:152-165](apps/mobile/app/(provider-tabs)/earnings.tsx#L152)
```tsx
<EarningsChart
  data={[
    { date: '2026-04-25', amount: wallet?.availableBalance ? Math.round(wallet.availableBalance / 7) : 0 },
    { date: '2026-04-26', amount: wallet?.availableBalance ? Math.round(wallet.availableBalance / 7) : 0 },
    // ... all 7 entries are the SAME value: availableBalance / 7
  ]}
/>
```

The chart is supposed to show daily earnings for the past 7 days. Instead, every day shows the same number: today's wallet balance divided by 7. This is mathematical fiction — not earnings, not history, not even an estimate.

**Provider experience:**
- Provider opens Earnings tab.
- Sees a perfectly flat chart showing identical daily earnings for 7 days.
- Provider knows this is wrong (they did 0 jobs Tuesday and 5 jobs Friday, but the chart shows them equal).
- **Trust in the entire app collapses.** "If they're lying about my earnings, are they also lying about my payouts?"

This was the centerpiece of the F#5 (R5-complete) "wired all 11 D11/D12 components into 3+ screens" remediation closeout. The component is "rendered" — but with placeholder data hardcoded inline. **Re-classifies as a partial F#5 failure, same as MED-181 (FilterModal dead UI in customer search).**

The hardcoded dates `'2026-04-25'` through `'2026-05-01'` will rapidly stale: today is 2026-05-01 (per CLAUDE.md), so by next week the chart shows last week's dates, and by next month it shows old data labeled with old dates.

**Fix dispatch:**
```
1. Add server endpoint /api/v1/providers/me/earnings/daily?from=&to=
   that aggregates wallet_transactions GROUP BY DATE(created_at) for
   the requested range, summing all positive (escrow_release, tip,
   payout) entries.
2. Mobile useQuery against this endpoint with a 7-day window:
       const from = new Date(); from.setDate(from.getDate() - 6);
       useQuery(['provider-earnings-daily', from], () =>
         getDailyEarnings(from.toISOString(), new Date().toISOString()))
3. Pass the real series to EarningsChart.
4. Real test: mock the endpoint to return 7 distinct values; render
   the screen; assert getByText for each value renders. (Per the F#7
   audit lesson — render + assert, not import-only.)
5. Audit the other 10 components from the R5-complete dispatch for
   the same pattern (placeholder/inline data instead of real). Already
   found: MED-181 customer search FilterModal trigger missing,
   CRIT-99/100 earnings chart + commission breakdown both fake.
```

### CRIT-100 — CommissionBreakdown panel on the provider dashboard shows FABRICATED math
**File:** [apps/mobile/app/(provider-tabs)/earnings.tsx:168-187](apps/mobile/app/(provider-tabs)/earnings.tsx#L168)
```tsx
<CommissionBreakdown
  gross={Math.round(wallet.availableBalance * 1.13)}                    // ← invented
  lines={[
    { label: 'Platform fee', amount: Math.round(wallet.availableBalance * 0.12), pct: 12, ... },
    { label: 'VAT',          amount: Math.round(wallet.availableBalance * 0.0144) },           // ← also invented
  ]}
  net={wallet.availableBalance}
/>
```

This is supposed to show "for the current period, here's what the customer paid, here's what we took, here's your net." Instead, it back-calculates from the current wallet balance:
- Pretends the gross was 13% higher than the wallet balance.
- Pretends the platform fee was a flat 12% (not the real tier-based rate).
- Pretends VAT was 1.44% (real Philippine VAT is 12%).

Provider sees a "commission breakdown" that has no relationship to any actual transaction. A founding-tier provider who pays 6% commission sees "12%" on their own dashboard. **They will email support and demand to know why they're being overcharged — when in fact they're not.**

The 1.44% "VAT" figure is especially concerning. Real PH VAT is 12% per the Tax Code. If a provider takes a screenshot of "VAT 1.44%" and shows it to BIR during a tax audit, they have evidence the platform misrepresented VAT to its providers. Compliance exposure.

**Fix dispatch:**
```
1. Add server endpoint /api/v1/providers/me/earnings/breakdown?period=current_month
   that returns {gross, lines: [{label, amount, pct, ...}], net} from
   real transaction aggregates.
2. Use the provider's actual tier commission rate (from tier-progression
   data, already fetched by the existing useQuery) — not a hardcoded 12%.
3. Use real VAT (12% per PH Tax Code) on the platform fee — not 1.44%.
4. Mobile fetches the real breakdown and passes to CommissionBreakdown.
5. Pair with CRIT-99 — same dispatch.
6. CI guard: any inline literal {gross: x * 1.13} / {amount: x * 0.0144}
   pattern in app/ should be flagged. These are placeholder smells.
```

---

## MEDIUM bugs

### MED-214 — `Routes.PROVIDER.*` declares ~10 dead constants
**File:** [apps/mobile/src/config/navigation.ts:101-132](apps/mobile/src/config/navigation.ts#L101)

| Declared | File on disk | Status |
|---|---|---|
| `HOME: '/provider/home'` | none | **DEAD** |
| `WALLET: '/provider/wallet'` | none | **DEAD** |
| `ACTIVE_JOB: '/provider/job/[id]/active'` | `/provider/job/active.tsx` | **WRONG PATH** |
| `EARNINGS: '/provider/earnings'` | `/(provider-tabs)/earnings.tsx` | **WRONG LOCATION** |
| `EARNINGS_GOALS: '/provider/earnings/goals'` | none | **DEAD** |
| `DEMAND_INSIGHTS: '/provider/demand-insights'` | none | **DEAD** |
| `MONTHLY_SUMMARY: '/provider/monthly-summary'` | none | **DEAD** |
| `RECEIPT: '/provider/receipt/[bookingId]'` | none | **DEAD** |
| `MATERIALS_LIST: '/provider/job/[id]/materials'` | none | **DEAD** |
| `PROFILE: '/provider/profile'` | `/(provider-tabs)/provider-profile.tsx` | **WRONG LOCATION** |
| `SERVICE_AREAS: '/provider/service-areas'` | `/provider/service-area.tsx` (singular) | **WRONG NAME** |

Verified: none of these dead routes are referenced from app code (grep returns 0 callsites). So they're config bloat, not customer-breaking — but they're a footgun. The next dev to navigate to `Routes.PROVIDER.WALLET` will silently 404.

Same pattern as customer-side CRIT-79/80 (which WERE called from real code → CRIT). On provider side: dead config, MED.

**Fix:** delete the dead entries. Fix the 4 WRONG_PATH/LOCATION ones to point to real files.

### MED-215 — Provider `tier` enum missing `'founding'` in 4 separate places
**Files:**
- [apps/mobile/app/(provider-tabs)/dashboard.tsx:32-44](apps/mobile/app/(provider-tabs)/dashboard.tsx#L32) — TIER_LABELS + TIER_COLORS missing 'founding'
- [apps/mobile/app/(provider-tabs)/provider-profile.tsx:33-38](apps/mobile/app/(provider-tabs)/provider-profile.tsx#L33) — TIER_COLORS missing 'founding'
- [apps/mobile/src/services/provider-api.service.ts:9](apps/mobile/src/services/provider-api.service.ts#L9) — `tier: 'new' | 'verified' | 'pro' | 'elite'`
- (D08 MED-174 + D10 CRIT-97 already covered the customer side; this is the provider side)

**Provider-side impact for the launch cohort:**
- A founding-tier provider opens their own dashboard.
- The tier badge label shows the raw string `"founding"` (lowercase, no spacing) because TIER_LABELS lookup misses.
- The tier badge color falls back to `colors.textTertiary` (grey) instead of a brand color.
- The provider — who was specifically recruited as a "founding member" with promised reduced commission and special status — sees no in-app recognition of that status.

This is also documented in [apps/mobile/src/lib/i18n.ts:55](apps/mobile/src/lib/i18n.ts#L55) (`'provider.tier.founding': 'Founding'`), proving the design clearly intended a 'founding' tier — it just never made it into the enums or tier maps.

**Fix:** consolidate with the customer-side fix (CRIT-97). Single dispatch, types from server Zod schemas via shared package.

### MED-216 — jobs.tsx FilterModal is dead UI (no trigger calls `setAdvancedFiltersVisible(true)`)
**File:** [apps/mobile/app/(provider-tabs)/jobs.tsx:59, 184-214](apps/mobile/app/(provider-tabs)/jobs.tsx#L59)
Same pattern as customer search (MED-181). The FilterModal is rendered with `visible={advancedFiltersVisible}` but nothing in the file ever sets it to true. No filter button, no header icon. Modal is dead.

R5-complete remediation appears to have wired the import + render but missed the trigger. Pair with MED-181 fix.

### MED-217 — Provider dashboard's `getJobStatusColor` map is incomplete vs server status enum
**File:** [apps/mobile/app/(provider-tabs)/dashboard.tsx:46-56](apps/mobile/app/(provider-tabs)/dashboard.tsx#L46)
Lists 6 statuses (matched, paid, provider_en_route, provider_arrived, in_progress, completed_by_provider). Missing: `requested`, `quoted`, `confirmed` (customer-confirmed), `cancelled_by_*` variants, `disputed`, `payout_ready`, `paid_out`. Falls back to `colors.textTertiary`.

For a provider whose active job is in `disputed` state (most urgent), the dashboard shows a generic grey badge — no visual signal that something needs attention. Use `StatusBadge` component (D11) instead of duplicating the mapping.

### MED-218 — Provider profile has NO menu entry for account-management or data-rights
**File:** [apps/mobile/app/(provider-tabs)/provider-profile.tsx:275-316](apps/mobile/app/(provider-tabs)/provider-profile.tsx#L275)

The menu lists: Schedule, Services, Portfolio, Certifications, Reviews, Payouts, Notifications, Settings. **Missing:** Account & Data, Data Rights, Help.

A provider has the same NPC RA 10173 §16 rights as a customer — to access, correct, delete, port their data. The customer side surfaces these via `account-management.tsx` + `data-rights.tsx` from the (tabs)/profile.tsx menu. The provider side hides them.

A provider in the launch market with no in-app DSR path → must email DPO directly → manual ops queue. Same compliance posture issue as MED-154 (D05) but on the provider side.

`apps/mobile/app/provider/account-management.tsx` (398 lines, audited later in Phase E) **does exist** — it just isn't linked from anywhere in the provider profile menu.

**Fix:** add three menu rows mirroring the customer-side affordances. Half a screen of code.

### MED-219 — Provider profile uses native `Alert.alert` for logout instead of `ConfirmModal` (D11 component)
**File:** [apps/mobile/app/(provider-tabs)/provider-profile.tsx:88-100](apps/mobile/app/(provider-tabs)/provider-profile.tsx#L88)
Phase 14 D11 ships `ConfirmModal` with consistent destructive-action styling, hardware-back support (Pattern 13), busy state during loading. Provider profile uses raw `Alert.alert` instead — inconsistent with the customer side (which uses ConfirmModal).

Provider sees a different-looking confirmation than customer does for the same action. Trust + consistency. Replace.

### MED-220 — `commissionRates` displayed in earnings as a hardcoded `{elite ?? 0.09} - {new ?? 0.15}` range
**File:** [apps/mobile/app/(provider-tabs)/earnings.tsx:148](apps/mobile/app/(provider-tabs)/earnings.tsx#L148)
```tsx
<Text style={styles.infoValue}>
  {`${Math.round((platformConfig.commissionRates.elite ?? 0.09) * 100)}-${Math.round((platformConfig.commissionRates.new ?? 0.15) * 100)}%`}
</Text>
```

Two failures:
1. The fallback values (0.09, 0.15) are hardcoded — drift risk if platformConfig values change.
2. Server's tier enum includes `'founding'` (whose commission is likely 6%, lower than 9%), so the displayed range "9-15%" UNDERSTATES the platform's actual best rate. Founding providers reading this see a higher number than they pay → confusion, support tickets.

Fix: derive the range from `min(allTiers.commission)` to `max(allTiers.commission)` — pull from `getTierProgression()` which already returns `allTiers`.

### MED-221 — `provider-api.service.ts` `ProviderSelf.tier` missing 'founding' (drives all 4 places in MED-215)
**File:** [apps/mobile/src/services/provider-api.service.ts:9](apps/mobile/src/services/provider-api.service.ts#L9)
Root cause for MED-215 / CRIT-97. Single line fix.

---

## LOW / INFO

- **Provider dashboard NbiStatusBanner** at top of dashboard + jobs is correctly wired (Phase 14 R#5 Bug 1234 lifecycle banner).
- **Provider tabs `_layout.tsx`** mounts `<NewJobModal />` globally so a new-job notification can interrupt any tab. Good UX.
- **`getMyProfile` returns ProviderDashboard** = ProviderSelf + services + schedule + ratings + portfolio + certifications. Single round trip — efficient.
- **`updateBookingStatus` accepts optional `location: {latitude, longitude}`** — server uses it to verify provider is within `platformConfig.providerArrivalRadiusMeters` (verified in B05/booking.routes.ts:455). Defense-in-depth: provider can't lie about arrival from the couch.
- **`StatusUpdateResult` includes optional `warning`** field — server can return success + a non-fatal warning (e.g., "you're outside the radius — re-check"). Mobile screens can surface this. Good pattern.
- **`getTierProgression` returns full tier requirements** — server-canonical commission, benefits, requirements. Provider sees the truth.
- **`ProviderSelf.status: 'pending' | 'approved' | 'suspended' | 'deactivated' | 'rejected'`** — 5-state account lifecycle. Mobile screens should honor this (e.g., a `'pending'` provider should NOT see the dashboard — they should see review-pending screen). Verify this routing exists in Phase E04/E05.
- **Earnings tab uses `/api/v1/wallets/transactions` (PLURAL)** — correct, unlike useWallet hook (CRIT-78). Provider transactions list works.
- **`Routes.PROVIDER_TABS.JOBS`** correctly used throughout dashboard for "See All" affordances. No dead route there.
- **Pagination on jobs tab** uses useInfiniteQuery + onEndReached + PaginationLoader — textbook implementation.
- **Provider profile editable fields** (bio, yearsExperience, serviceRadiusKm) are appropriately scoped — provider can't change name/phone/tier from the app.
- **`provider-api.service.ts` is the canonical provider service.** Other services (provider.service.ts, provider-tools.service.ts) handle different concerns.

---

## Updated headline counts after E01

| Severity | Total | New in E01 |
|---|---:|---:|
| **CRITICAL** | **100 (1 invalidated → 99 real)** | **+2 (CRIT-99, 100)** |
| **MEDIUM** | **221** | **+8 (MED-214–221)** |

Continuing into E02 (provider job execution flow — the money path on the provider side).
