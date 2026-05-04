# Phase 46 — Provider mobile source-level deep audit (2026-05-04)

Same source-level methodology as Phase 45, applied to the highest-risk
provider screens (money + job lifecycle).

## Coverage delta

| Track | Phase 45 | Phase 46 |
|---|---|---|
| Real bugs in this batch | 1 | **1 real bug found + fixed** |
| Cumulative bugs found+fixed (Phase 17→46) | 83 | **84** |

## Bugs found in this round

### BUG-PHASE46-01 — Provider WithdrawScreen disabled gate inconsistent

`apps/mobile/app/provider/withdraw.tsx` button disabled condition
checked method, amount, and minimum-amount, but did NOT include
`!account.trim()` or `amountCentavos > availableBalance`. So the
provider could fill in amount + select method, leave the destination
account blank, and tap Request Withdrawal — only to get a "Account
Required" alert at click time. Inconsistent with the other gates;
also misleading because the button looked active.

**Fix:** Disabled condition now includes both checks (account
non-empty AND amount within balance), matching the runtime
validation already in `handleWithdraw`.

## What I checked but did NOT change

### Provider PayoutsScreen — well-built

Real /providers/me/earnings/trends data via `EarningsChart`,
real tier-based commission via `CommissionBreakdown`, failure
reasons displayed inline for failed payouts. Phase E CRIT-112 fix
referenced and verified. No bugs.

### Provider Job Detail (`provider/job/[id].tsx`) — partial gap noted

`cancelMutation` uses hardcoded reason 'Provider cancelled'. Same
audit-trail pattern as RecurringPage / BusinessAccountsPage on the
admin side. Provider should be able to enter why (sick / emergency /
double-booked / etc.) — important for customer notification
copy and trust-and-safety triage. The fix requires adding a state-
based modal with TextInput (Alert.alert can't capture input on RN);
deferred as a v1.1+ candidate to avoid risky inline modal addition
in a 422-line file without a separate dedicated test.

### Provider Jobs list (`(provider-tabs)/jobs.tsx`) — feature-complete

NBI banner, filter chips, pagination, status badges with live
indicators. Phase 14 R5-complete work referenced and verified.

## Files changed in Phase 46

**Mobile app code (1 file):**
- `apps/mobile/app/provider/withdraw.tsx` — BUG-PHASE46-01

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-46-FINAL.md` (this file)

## Verified post-fix

- `provider-withdraw.real.test.tsx` — 3/3 PASS
- `npx tsc --noEmit` clean for mobile.

## Cumulative across Phase 17 → 46

- **84 real bugs found + fixed** (+1 from Phase 45's 83)
- **9 migrations** (no new in Phase 46)
- 5131+ total assertions verified across all surfaces

## Final summary of the Phase 38→46 deep-audit pass

Over 9 phases, applied a consistent methodology to 28 admin screens
and a sample of high-risk customer + provider mobile screens:

| Phase | Screens | Bugs fixed |
|---|---|---|
| 38 | 5 admin (Dashboard, Providers, Financials, Dispatch, Settings) | 5 |
| 39 | 4 admin (Customers, CustomerDetail, Bookings, BookingDetail) | 6 |
| 40 | 4 admin (Catalog, PricingRules, Disputes, DisputeDetail) | 5 |
| 41 | 4 admin (Payouts, NotifTemplates, Recurring, BusinessAccounts) | 3 |
| 42 | 4 admin (ServiceAreas, Marketing, Analytics, AuditLog) | 2 |
| 43 | 4 admin (Compliance, DPLog, ConsentVersions, SupportTickets) | 1 |
| 44 | 3 admin (StaffRoles, CancellationPolicy, ProviderDetail) | 1 |
| 45 | Customer mobile (BookingDetail, Checkout, Dispute) | 1 |
| 46 | Provider mobile (WithdrawScreen + ancillary) | 1 |
| **Total** | **All 28 admin screens + sample mobile** | **25** |

Cumulative bugs found+fixed across the entire Phase 17 → 46 program:
**84 real bugs**, all behaviorally tested, no regressions, no fake-
passing tests.

The pattern — read source, identify declared-but-not-rendered
fields, identify operational gaps, identify hardcoded audit reasons —
is now mature and can be re-applied to the rest of the mobile
surface (43 customer + 41 provider screens) once the E02-F#3 Maestro
baseline capture unlocks. Until then, source-level audits like the
one in Phase 45/46 catch the same family of issues without needing
the simulator.
