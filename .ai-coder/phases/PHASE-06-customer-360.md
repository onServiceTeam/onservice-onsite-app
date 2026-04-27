# PHASE 06 — CUSTOMER 360

**Goal:** Build the missing customer detail page with 6 tabs (Profile, Bookings, Payments, Disputes, Referrals, Activity) — the customer-side mirror of Phase 05.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/06-customer-360`
**Estimated time:** 8 hours
**Dependencies:** Phase 05 complete and merged
**Risk:** Low — the pattern is identical to provider 360, smaller scope

---

## Step 1 — Pre-flight (standard)

## Step 2 — Backend endpoints

```
GET  /api/v1/admin/customers/:id                  Profile + addresses + suki status
GET  /api/v1/admin/customers/:id/bookings         All bookings paginated
GET  /api/v1/admin/customers/:id/payments         Payment methods + transaction history
GET  /api/v1/admin/customers/:id/disputes         All disputes filed
GET  /api/v1/admin/customers/:id/referrals        Referrals given and received
GET  /api/v1/admin/customers/:id/activity         Login history + admin actions
POST /api/v1/admin/customers/:id/credit           Issue wallet credit (with reason, audited)
POST /api/v1/admin/customers/:id/refund           Manual refund (super admin)
POST /api/v1/admin/customers/:id/message          Send platform message
PUT  /api/v1/admin/customers/:id/status           Suspend / reactivate / flag for fraud
```

## Step 3 — Add the route in App.tsx

```tsx
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'));
<Route path="/customers/:id" element={<CustomerDetailPage />} />
```

## Step 4 — Build CustomerDetailPage

Same structure as ProviderDetailPage. 6 tabs. Each tab in `apps/admin/src/components/customer-360/`:

### ProfileTab
- Photo, name, phone, email, registration date, last active
- All saved addresses (CRUD as super admin)
- Suki status: list of providers with suki relationship + total bookings each
- Lifetime stats: total bookings, total spent, NPS score
- Status: Active / Suspended / Flagged (with admin actions)

### BookingsTab
- Stats: total bookings, completion rate, avg rating given, total spent, repeat rate
- Filters: status, date range, service category, provider
- Table with link to booking detail (Phase 07)

### PaymentsTab
- Saved payment methods: GCash, Maya, cards (masked)
- Transaction history: all charges, refunds, wallet credits
- Wallet balance + transaction ledger
- Filter by type, date range

### DisputesTab
- All disputes filed by this customer
- Pattern analysis: "Filed 5 disputes in 30 days, 80% favor provider — possible fraudulent pattern" auto-detection
- Filter by outcome, status

### ReferralsTab
- Referrals given (who they invited, who signed up, who completed first booking)
- Referrer (who invited them, if any)
- Credits earned + redeemed
- Active referral codes

### ActivityTab
- Admin actions log
- Login history (date, IP, device)
- Status changes

## Step 5 — Update CustomersPage list

Make rows clickable. Add CSV export. Add fraud-pattern column (auto-detected from disputes pattern).

## Step 6 — Tests, verify, commit, report. STOP.
